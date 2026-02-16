import { useEffect, useState, useCallback, useMemo, useRef } from 'react'
import { BlockNoteSchema, defaultInlineContentSpecs } from '@blocknote/core'
import { filterSuggestionItems } from '@blocknote/core/extensions'
import { createReactInlineContentSpec, useCreateBlockNote, SuggestionMenuController } from '@blocknote/react'
import { BlockNoteView } from '@blocknote/mantine'
import '@blocknote/mantine/style.css'
import type { VaultEntry } from '../types'
import { useEditorTheme } from '../hooks/useTheme'
import './Editor.css'
import './EditorTheme.css'

interface Tab {
  entry: VaultEntry
  content: string
}

interface EditorProps {
  tabs: Tab[]
  activeTabPath: string | null
  entries: VaultEntry[]
  onSwitchTab: (path: string) => void
  onCloseTab: (path: string) => void
  onNavigateWikilink: (target: string) => void
  onLoadDiff?: (path: string) => Promise<string>
  isModified?: (path: string) => boolean
}

// --- Custom Inline Content: WikiLink ---

const WikiLink = createReactInlineContentSpec(
  {
    type: "wikilink" as const,
    propSchema: {
      target: { default: "" },
    },
    content: "none",
  },
  {
    render: (props) => (
      <span
        className="wikilink"
        data-target={props.inlineContent.props.target}
      >
        {props.inlineContent.props.target}
      </span>
    ),
  }
)

// --- Schema with wikilink ---

const schema = BlockNoteSchema.create({
  inlineContentSpecs: {
    ...defaultInlineContentSpecs,
    wikilink: WikiLink,
  },
})

type EditorType = typeof schema.BlockNoteEditorType

/** Strip YAML frontmatter from markdown, returning [frontmatter, body] */
function splitFrontmatter(content: string): [string, string] {
  if (!content.startsWith('---')) return ['', content]
  const end = content.indexOf('\n---', 3)
  if (end === -1) return ['', content]
  let to = end + 4
  if (content[to] === '\n') to++
  return [content.slice(0, to), content.slice(to)]
}

// Wikilink placeholder tokens for markdown round-trip
const WL_START = '\u2039WIKILINK:'
const WL_END = '\u203A'
const WL_RE = new RegExp(`${WL_START.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}([^${WL_END}]+)${WL_END.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'g')

/** Pre-process markdown: replace [[target]] with placeholder tokens */
function preProcessWikilinks(md: string): string {
  return md.replace(/\[\[([^\]]+)\]\]/g, (_m, target) => `${WL_START}${target}${WL_END}`)
}

/** Walk blocks and replace placeholder text with wikilink inline content */
function injectWikilinks(blocks: any[]): any[] {
  return blocks.map(block => {
    if (block.content && Array.isArray(block.content)) {
      block.content = expandWikilinksInContent(block.content)
    }
    if (block.children && Array.isArray(block.children)) {
      block.children = injectWikilinks(block.children)
    }
    return block
  })
}

function expandWikilinksInContent(content: any[]): any[] {
  const result: any[] = []
  for (const item of content) {
    if (item.type === 'text' && typeof item.text === 'string' && item.text.includes(WL_START)) {
      // Split this text node around wikilink placeholders
      const text = item.text as string
      let lastIndex = 0
      WL_RE.lastIndex = 0
      let match
      while ((match = WL_RE.exec(text)) !== null) {
        // Text before this match
        if (match.index > lastIndex) {
          result.push({ ...item, text: text.slice(lastIndex, match.index) })
        }
        // The wikilink
        result.push({
          type: 'wikilink',
          props: { target: match[1] },
          content: undefined,
        })
        lastIndex = match.index + match[0].length
      }
      // Text after last match
      if (lastIndex < text.length) {
        result.push({ ...item, text: text.slice(lastIndex) })
      }
    } else {
      result.push(item)
    }
  }
  return result
}

function DiffView({ diff }: { diff: string }) {
  if (!diff) {
    return (
      <div className="diff-view__empty">
        No changes to display
      </div>
    )
  }

  const lines = diff.split('\n')

  return (
    <div className="diff-view">
      {lines.map((line, i) => {
        let className = 'diff-view__line diff-view__line--context'
        if (line.startsWith('+') && !line.startsWith('+++')) {
          className = 'diff-view__line diff-view__line--added'
        } else if (line.startsWith('-') && !line.startsWith('---')) {
          className = 'diff-view__line diff-view__line--removed'
        } else if (line.startsWith('@@')) {
          className = 'diff-view__line diff-view__line--hunk'
        } else if (line.startsWith('diff') || line.startsWith('index') || line.startsWith('---') || line.startsWith('+++') || line.startsWith('new file')) {
          className = 'diff-view__line diff-view__line--header'
        }

        return (
          <div key={i} className={className}>
            <span className="diff-view__line-number">{i + 1}</span>
            <span className="diff-view__line-content">{line || '\u00A0'}</span>
          </div>
        )
      })}
    </div>
  )
}

/** Inner component that creates/manages BlockNote for a single tab */
function BlockNoteTab({ content, entries, onNavigateWikilink }: { content: string; entries: VaultEntry[]; onNavigateWikilink: (target: string) => void }) {
  const [, body] = useMemo(() => splitFrontmatter(content), [content])
  const navigateRef = useRef(onNavigateWikilink)
  navigateRef.current = onNavigateWikilink
  const { cssVars } = useEditorTheme()

  const editor = useCreateBlockNote({ schema })

  // Load markdown content into editor, converting [[target]] to wikilink inline content
  useEffect(() => {
    async function load() {
      const preprocessed = preProcessWikilinks(body)
      const blocks = await editor.tryParseMarkdownToBlocks(preprocessed)
      const withWikilinks = injectWikilinks(blocks)
      editor.replaceBlocks(editor.document, withWikilinks)
    }
    load()
  }, [body, editor])

  // Click handler for wikilinks
  useEffect(() => {
    const container = document.querySelector('.editor__blocknote-container')
    if (!container) return
    const handler = (e: MouseEvent) => {
      const wikilink = (e.target as HTMLElement).closest('.wikilink')
      if (wikilink) {
        e.preventDefault()
        e.stopPropagation()
        const target = (wikilink as HTMLElement).dataset.target
        if (target) navigateRef.current(target)
      }
    }
    container.addEventListener('click', handler as EventListener, true)
    return () => container.removeEventListener('click', handler as EventListener, true)
  }, [editor])

  // Suggestion menu items for [[ trigger
  const getWikilinkItems = useCallback(async (query: string) => {
    const items = entries.map(entry => ({
      title: entry.title,
      onItemClick: () => {
        editor.insertInlineContent([
          {
            type: 'wikilink' as const,
            props: { target: entry.title },
          },
          " ",
        ])
      },
      aliases: [entry.filename.replace(/\.md$/, ''), ...entry.aliases],
      group: entry.isA || 'Note',
    }))
    return filterSuggestionItems(items, query)
  }, [entries, editor])

  const isDark = typeof document !== 'undefined' && document.documentElement.getAttribute('data-theme') !== 'light'

  return (
    <div className="editor__blocknote-container" style={cssVars as React.CSSProperties}>
      <BlockNoteView
        editor={editor}
        theme={isDark ? 'dark' : 'light'}
      >
        {/* Wikilink suggestion menu triggered by [[ */}
        <SuggestionMenuController
          triggerCharacter="[["
          getItems={getWikilinkItems}
        />
      </BlockNoteView>
    </div>
  )
}

export function Editor({ tabs, activeTabPath, entries, onSwitchTab, onCloseTab, onNavigateWikilink, onLoadDiff, isModified }: EditorProps) {
  const [diffMode, setDiffMode] = useState(false)
  const [diffContent, setDiffContent] = useState<string | null>(null)
  const [diffLoading, setDiffLoading] = useState(false)

  const activeTab = tabs.find((t) => t.entry.path === activeTabPath) ?? null
  const showDiffToggle = activeTab && isModified?.(activeTab.entry.path)

  useEffect(() => {
    setDiffMode(false)
    setDiffContent(null)
  }, [activeTabPath])

  const handleToggleDiff = useCallback(async () => {
    if (diffMode) {
      setDiffMode(false)
      setDiffContent(null)
      return
    }
    if (!activeTabPath || !onLoadDiff) return
    setDiffLoading(true)
    try {
      const diff = await onLoadDiff(activeTabPath)
      setDiffContent(diff)
      setDiffMode(true)
    } catch (err) {
      console.warn('Failed to load diff:', err)
    } finally {
      setDiffLoading(false)
    }
  }, [diffMode, activeTabPath, onLoadDiff])

  if (tabs.length === 0) {
    return (
      <div className="editor">
        <div className="editor__drag-strip" data-tauri-drag-region />
        <div className="editor__placeholder">
          <p>Select a note to start editing</p>
          <span className="editor__placeholder-hint">Cmd+P to search &middot; Cmd+N to create</span>
        </div>
      </div>
    )
  }

  return (
    <div className="editor">
      <div className="editor__tab-bar" data-tauri-drag-region>
        {tabs.map((tab) => (
          <div
            key={tab.entry.path}
            className={`editor__tab${tab.entry.path === activeTabPath ? ' editor__tab--active' : ''}`}
            onClick={() => onSwitchTab(tab.entry.path)}
          >
            <span className="editor__tab-title">{tab.entry.title}</span>
            <button
              className="editor__tab-close"
              onClick={(e) => {
                e.stopPropagation()
                onCloseTab(tab.entry.path)
              }}
            >
              ×
            </button>
          </div>
        ))}
        {showDiffToggle && (
          <div className="editor__tab-bar-actions">
            <button
              className={`editor__diff-toggle${diffMode ? ' editor__diff-toggle--active' : ''}`}
              onClick={handleToggleDiff}
              disabled={diffLoading}
              title={diffMode ? 'Switch to Edit view' : 'Show diff'}
            >
              {diffLoading ? '...' : diffMode ? 'Edit' : 'Diff'}
            </button>
          </div>
        )}
      </div>
      {diffMode ? (
        <div className="editor__diff-container">
          <DiffView diff={diffContent ?? ''} />
        </div>
      ) : (
        activeTab && (
          <BlockNoteTab
            key={activeTabPath}
            content={activeTab.content}
            entries={entries}
            onNavigateWikilink={onNavigateWikilink}
          />
        )
      )}
    </div>
  )
}
