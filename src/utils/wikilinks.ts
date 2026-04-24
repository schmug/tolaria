// Wikilink placeholder tokens for markdown round-trip
const WL_START = '\u2039WIKILINK:'
const WL_END = '\u203A'
const WL_RE = new RegExp(`${WL_START.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}([^${WL_END}]+)${WL_END.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'g')

/** Pre-process markdown: replace [[target]] with placeholder tokens */
export function preProcessWikilinks(md: string): string {
  return md.replace(/\[\[([^\]]+)\]\]/g, (_m, target) => `${WL_START}${target}${WL_END}`)
}

// Minimal shape of a BlockNote block for wikilink processing
interface BlockLike {
  content?: InlineItem[]
  children?: BlockLike[]
  [key: string]: unknown
}

interface InlineItem {
  type: string
  text?: string
  props?: Record<string, string>
  content?: unknown
  [key: string]: unknown
}

type ContentTransform = (content: InlineItem[]) => InlineItem[]

/** Walk blocks recursively, applying a transform to each block's inline content */
function walkBlocks(blocks: unknown[], transform: ContentTransform, clone = false): unknown[] {
  return (blocks as BlockLike[]).map(block => {
    const b = clone ? { ...block } : block
    if (b.content && Array.isArray(b.content)) {
      b.content = transform(b.content)
    }
    if (b.children && Array.isArray(b.children)) {
      b.children = walkBlocks(b.children, transform, clone) as BlockLike[]
    }
    return b
  })
}

/** Walk blocks and replace placeholder text with wikilink inline content */
export function injectWikilinks(blocks: unknown[]): unknown[] {
  return walkBlocks(blocks, expandWikilinksInContent)
}

/**
 * Deep-clone blocks and convert wikilink inline content back to [[target]] text.
 * This is the reverse of injectWikilinks — used before blocksToMarkdownLossy
 * so that wikilinks survive the markdown round-trip.
 */
export function restoreWikilinksInBlocks(blocks: unknown[]): unknown[] {
  return walkBlocks(blocks, collapseWikilinksInContent, true)
}

function expandWikilinksInContent(content: InlineItem[]): InlineItem[] {
  const result: InlineItem[] = []
  for (const item of content) {
    if (item.type !== 'text' || typeof item.text !== 'string' || !item.text.includes(WL_START)) {
      result.push(item)
      continue
    }
    const text = item.text as string
    let lastIndex = 0
    WL_RE.lastIndex = 0
    let match
    while ((match = WL_RE.exec(text)) !== null) {
      if (match.index > lastIndex) {
        result.push({ ...item, text: text.slice(lastIndex, match.index) })
      }
      result.push({
        type: 'wikilink',
        props: { target: match[1] },
        content: undefined,
      })
      lastIndex = match.index + match[0].length
    }
    if (lastIndex < text.length) {
      result.push({ ...item, text: text.slice(lastIndex) })
    }
  }
  return result
}

function collapseWikilinksInContent(content: InlineItem[]): InlineItem[] {
  const result: InlineItem[] = []
  for (const item of content) {
    if (item.type === 'wikilink' && item.props?.target) {
      result.push({ type: 'text', text: `[[${item.props.target}]]` })
    } else {
      result.push(item)
    }
  }
  return result
}

/** Strip YAML frontmatter from markdown, returning [frontmatter, body] */
export function splitFrontmatter(content: string): [string, string] {
  if (!content.startsWith('---')) return ['', content]
  const end = content.indexOf('\n---', 3)
  if (end === -1) return ['', content]
  let to = end + 4
  if (content[to] === '\n') to++
  return [content.slice(0, to), content.slice(to)]
}

/** Extract all outgoing wikilink targets from content.
 * Finds [[target]] and [[target|display]] patterns, returning just the target part.
 * Returns a sorted, deduplicated array. */
export function extractOutgoingLinks(content: string): string[] {
  const links: string[] = []
  const re = /\[\[([^\]]+)\]\]/g
  let match
  while ((match = re.exec(content)) !== null) {
    const inner = match[1]
    const pipeIdx = inner.indexOf('|')
    const target = pipeIdx !== -1 ? inner.slice(0, pipeIdx) : inner
    if (target) links.push(target)
  }
  return [...new Set(links)].sort()
}

export interface BacklinkContext {
  /** Raw wikilink target string as it appears in the source body (before any pipe). */
  target: string
  /** Paragraph text containing the match, whitespace-collapsed and length-capped. */
  context: string
}

function stripBodyForBacklinkSearch(content: string): string {
  const [, body] = splitFrontmatter(content)
  return body.replace(/^\s*# [^\n]+\n?/, '')
}

function truncateContext(flat: string, maxLength: number): string {
  return flat.length <= maxLength ? flat : flat.slice(0, maxLength - 1) + '\u2026'
}

function targetMatches(target: string, matchTargets: Set<string>): boolean {
  if (matchTargets.has(target)) return true
  const lastSegment = target.split('/').pop() ?? ''
  return matchTargets.has(lastSegment)
}

function wikilinkTargetFromInner(inner: string): string {
  const pipeIdx = inner.indexOf('|')
  return pipeIdx !== -1 ? inner.slice(0, pipeIdx) : inner
}

function collectParagraphMatches(
  paragraph: string,
  matchTargets: Set<string>,
  maxLength: number,
  sink: BacklinkContext[],
): void {
  const trimmed = paragraph.trim()
  if (!trimmed) return
  const flat = trimmed.replace(/\s+/g, ' ')
  const context = truncateContext(flat, maxLength)
  for (const match of trimmed.matchAll(/\[\[([^\]]+)\]\]/g)) {
    const target = wikilinkTargetFromInner(match[1])
    if (targetMatches(target, matchTargets)) {
      sink.push({ target, context })
    }
  }
}

/** Extract all paragraph-level backlink occurrences from note content.
 * Emits one entry per matching `[[target]]` (or `[[target|display]]`) occurrence in
 * reading order. A paragraph containing the same target twice yields two entries with
 * the same context. `matchTargets` matches either the full target or its last path
 * segment (for path-style wikilinks like `[[project/Alice]]`). */
export function extractBacklinkContexts(
  content: string,
  matchTargets: Set<string>,
  maxLength = 120,
): BacklinkContext[] {
  const results: BacklinkContext[] = []
  for (const paragraph of stripBodyForBacklinkSearch(content).split(/\n{2,}/)) {
    collectParagraphMatches(paragraph, matchTargets, maxLength, results)
  }
  return results
}

/** Extract the paragraph surrounding the first [[target]] wikilink match from note content.
 * Returns null if no match found. Thin wrapper over `extractBacklinkContexts`. */
export function extractBacklinkContext(
  content: string,
  matchTargets: Set<string>,
  maxLength = 120,
): string | null {
  return extractBacklinkContexts(content, matchTargets, maxLength)[0]?.context ?? null
}

/** Check if a line is useful for snippet extraction (not blank, heading, code fence, or rule). */
function isSnippetLine(line: string): boolean {
  const t = line.trim()
  return t !== '' && !t.startsWith('#') && !t.startsWith('```') && !t.startsWith('---')
}

/** Strip leading list markers (*, -, +, 1.) from a line. */
function stripListMarker(line: string): string {
  const t = line.trimStart()
  for (const prefix of ['* ', '- ', '+ ']) {
    if (t.startsWith(prefix)) return t.slice(prefix.length)
  }
  const dotPos = t.indexOf('. ')
  if (dotPos >= 1 && dotPos <= 3 && /^\d+$/.test(t.slice(0, dotPos))) {
    return t.slice(dotPos + 2)
  }
  return t
}

/** Remove the first H1 heading line, allowing leading blank lines. */
function removeH1Line(body: string): string {
  const lines = body.split('\n')
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].trim().startsWith('# ')) return lines.slice(i + 1).join('\n')
    if (lines[i].trim() !== '') return body
  }
  return body
}

/** Strip markdown formatting chars: bold, italic, code, strikethrough, and resolve links. */
function stripMarkdownChars(s: string): string {
  let result = ''
  let i = 0
  while (i < s.length) {
    if (s[i] === '[' && s[i + 1] === '[') {
      i += 2
      let inner = ''
      while (i < s.length - 1 && !(s[i] === ']' && s[i + 1] === ']')) { inner += s[i]; i++ }
      if (i < s.length - 1) i += 2
      const pipe = inner.indexOf('|')
      result += pipe !== -1 ? inner.slice(pipe + 1) : inner
    } else if (s[i] === '[') {
      i++
      let text = ''
      while (i < s.length && s[i] !== ']') { text += s[i]; i++ }
      if (i < s.length) i++
      if (i < s.length && s[i] === '(') { i++; while (i < s.length && s[i] !== ')') i++; if (i < s.length) i++ }
      result += text
    } else if (s[i] === '*' || s[i] === '_' || s[i] === '`' || s[i] === '~') {
      i++
    } else {
      result += s[i]
      i++
    }
  }
  return result
}

/** Extract sub-heading text (## , ### , etc.) stripped of the # prefix. */
function extractSubheadingText(line: string): string | null {
  const t = line.trim()
  const stripped = t.replace(/^#+/, '')
  if (stripped.length < t.length && stripped.startsWith(' ')) {
    const text = stripped.trim()
    return text || null
  }
  return null
}

/** Extract a snippet: first ~160 chars of body content, stripped of markdown.
 *  Mirrors the Rust extract_snippet() logic for frontend use. */
export function extractSnippet(content: string): string {
  const [, body] = splitFrontmatter(content)
  const withoutH1 = removeH1Line(body)
  const clean = withoutH1.split('\n').filter(isSnippetLine).map(stripListMarker).join(' ')
  const stripped = stripMarkdownChars(clean).trim()
  if (stripped) {
    if (stripped.length <= 160) return stripped
    return stripped.slice(0, 160) + '...'
  }
  // Fallback: collect sub-heading text when no paragraph content exists
  const headingText = withoutH1.split('\n')
    .map(extractSubheadingText)
    .filter((t): t is string => t !== null)
    .join(' ')
  const headingStripped = stripMarkdownChars(headingText).trim()
  if (!headingStripped) return ''
  if (headingStripped.length <= 160) return headingStripped
  return headingStripped.slice(0, 160) + '...'
}

export function countWords(content: string): number {
  const [, body] = splitFrontmatter(content)
  const withoutTitle = body.replace(/^\s*# [^\n]+\n?/, '')
  const withoutWikilinks = withoutTitle.replace(/\[\[[^\]]*\]\]/g, '')
  const text = withoutWikilinks.replace(/[#*_[\]`>~\-|]/g, '').trim()
  if (!text) return 0
  return text.split(/\s+/).filter(Boolean).length
}
