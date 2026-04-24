import { useMemo } from 'react'
import type { VaultEntry } from '../../types'
import { resolveEntry, wikilinkTarget } from '../../utils/wikilink'
import { extractBacklinkContexts } from '../../utils/wikilinks'
import type { ReferencedByItem, BacklinkItem } from '../InspectorPanels'

interface InspectorLinkIndex {
  referencedBy: Map<string, ReferencedByItem[]>
  backlinks: Map<string, BacklinkItem[]>
}

interface EntryLookup {
  exactTargetEntries: Map<string, VaultEntry[]>
  pathSuffixEntries: Map<string, VaultEntry[]>
}

const inspectorLinkIndexCache = new WeakMap<VaultEntry[], InspectorLinkIndex>()

function pushToEntryLookup(map: Map<string, VaultEntry[]>, key: string, entry: VaultEntry): void {
  const existing = map.get(key)
  if (existing) {
    existing.push(entry)
    return
  }
  map.set(key, [entry])
}

function pushToResultMap<T>(map: Map<string, T[]>, key: string, item: T): void {
  const existing = map.get(key)
  if (existing) {
    existing.push(item)
    return
  }
  map.set(key, [item])
}

function getEntryPathSuffixes(entryPath: string): string[] {
  const pathWithoutExtension = entryPath.replace(/\.md$/, '').replace(/^\/+/, '')
  const segments = pathWithoutExtension.split('/')
  const suffixes: string[] = []

  for (let index = 0; index < segments.length; index += 1) {
    suffixes.push(segments.slice(index).join('/').toLowerCase())
  }

  return suffixes
}

function buildEntryLookup(entries: VaultEntry[]): EntryLookup {
  const exactTargetEntries = new Map<string, VaultEntry[]>()
  const pathSuffixEntries = new Map<string, VaultEntry[]>()

  for (const entry of entries) {
    const exactTargets = new Set([
      entry.filename.replace(/\.md$/, ''),
      entry.title,
      ...entry.aliases,
    ])
    const pathSuffixes = new Set(getEntryPathSuffixes(entry.path))

    for (const target of exactTargets) {
      pushToEntryLookup(exactTargetEntries, target, entry)
    }
    for (const suffix of pathSuffixes) {
      pushToEntryLookup(pathSuffixEntries, suffix, entry)
    }
  }

  return { exactTargetEntries, pathSuffixEntries }
}

function findMatchedEntries(target: string, lookup: EntryLookup): VaultEntry[] {
  const matches = new Map<string, VaultEntry>()
  const lastSegment = target.split('/').pop() ?? ''
  const pathMatches = target.includes('/') ? lookup.pathSuffixEntries.get(target.toLowerCase()) : undefined

  for (const candidate of lookup.exactTargetEntries.get(target) ?? []) {
    matches.set(candidate.path, candidate)
  }
  for (const candidate of lookup.exactTargetEntries.get(lastSegment) ?? []) {
    matches.set(candidate.path, candidate)
  }
  for (const candidate of pathMatches ?? []) {
    matches.set(candidate.path, candidate)
  }

  return [...matches.values()]
}

function collectMatchedPaths(
  targets: string[],
  lookup: EntryLookup,
  sourcePath: string,
  resolveTarget: (target: string) => string,
): string[] {
  const matchedPaths = new Set<string>()

  for (const rawTarget of targets) {
    const target = resolveTarget(rawTarget)
    for (const matchedEntry of findMatchedEntries(target, lookup)) {
      if (matchedEntry.path !== sourcePath) {
        matchedPaths.add(matchedEntry.path)
      }
    }
  }

  return [...matchedPaths]
}

function indexReferencedByEntries(
  sourceEntry: VaultEntry,
  lookup: EntryLookup,
  referencedBy: Map<string, ReferencedByItem[]>,
): void {
  for (const [viaKey, refs] of Object.entries(sourceEntry.relationships)) {
    if (viaKey === 'Type') continue

    for (const matchedPath of collectMatchedPaths(refs, lookup, sourceEntry.path, wikilinkTarget)) {
      pushToResultMap(referencedBy, matchedPath, { entry: sourceEntry, viaKey })
    }
  }
}

function indexBacklinkEntries(
  sourceEntry: VaultEntry,
  lookup: EntryLookup,
  backlinks: Map<string, BacklinkItem[]>,
): void {
  for (const matchedPath of collectMatchedPaths(sourceEntry.outgoingLinks, lookup, sourceEntry.path, (target) => target)) {
    pushToResultMap(backlinks, matchedPath, { entry: sourceEntry, context: null })
  }
}

export function buildInspectorLinkIndex(entries: VaultEntry[]): InspectorLinkIndex {
  const lookup = buildEntryLookup(entries)
  const referencedBy = new Map<string, ReferencedByItem[]>()
  const backlinks = new Map<string, BacklinkItem[]>()

  for (const sourceEntry of entries) {
    indexReferencedByEntries(sourceEntry, lookup, referencedBy)
    indexBacklinkEntries(sourceEntry, lookup, backlinks)
  }

  return { referencedBy, backlinks }
}

export function getInspectorLinkIndex(entries: VaultEntry[]): InspectorLinkIndex {
  const cached = inspectorLinkIndexCache.get(entries)
  if (cached) return cached

  const built = buildInspectorLinkIndex(entries)
  inspectorLinkIndexCache.set(entries, built)
  return built
}

export function useReferencedBy(entry: VaultEntry | null, entries: VaultEntry[]): ReferencedByItem[] {
  const linkIndex = useMemo(() => getInspectorLinkIndex(entries), [entries])

  return useMemo(() => {
    if (!entry) return []
    return linkIndex.referencedBy.get(entry.path) ?? []
  }, [entry, linkIndex])
}

export function useBacklinks(entry: VaultEntry | null, entries: VaultEntry[], referencedBy: ReferencedByItem[]): BacklinkItem[] {
  const linkIndex = useMemo(() => getInspectorLinkIndex(entries), [entries])

  return useMemo(() => {
    if (!entry) return []

    const backlinks = linkIndex.backlinks.get(entry.path) ?? []
    if (referencedBy.length === 0) return backlinks

    const referencedByPaths = new Set(referencedBy.map((item) => item.entry.path))
    return backlinks.filter((item) => !referencedByPaths.has(item.entry.path))
  }, [entry, linkIndex, referencedBy])
}

function collectMatchingTargets(
  source: VaultEntry,
  activePath: string,
  entries: VaultEntry[],
): Set<string> {
  const matches = new Set<string>()
  for (const target of source.outgoingLinks) {
    if (resolveEntry(entries, target)?.path === activePath) {
      matches.add(target)
    }
  }
  return matches
}

function expandSingleBacklink(
  item: BacklinkItem,
  activeEntry: VaultEntry,
  entries: VaultEntry[],
  sourceContents: Map<string, string>,
): BacklinkItem[] {
  const content = sourceContents.get(item.entry.path)
  if (!content) return [item]

  const matchTargets = collectMatchingTargets(item.entry, activeEntry.path, entries)
  if (matchTargets.size === 0) return [item]

  const contexts = extractBacklinkContexts(content, matchTargets)
  if (contexts.length === 0) return [item]

  return contexts.map((ctx) => ({ entry: item.entry, context: ctx.context }))
}

/** Expand sync backlinks (one-per-source) into per-occurrence items with context snippets.
 * Sources whose content hasn't loaded (absent from `sourceContents`) pass through unchanged.
 * Sources whose body has no matching wikilink also pass through unchanged (covers stale
 * index / frontmatter-only matches). */
export function expandBacklinksWithContext(
  backlinks: BacklinkItem[],
  activeEntry: VaultEntry,
  entries: VaultEntry[],
  sourceContents: Map<string, string>,
): BacklinkItem[] {
  const result: BacklinkItem[] = []
  for (const item of backlinks) {
    result.push(...expandSingleBacklink(item, activeEntry, entries, sourceContents))
  }
  return result
}

/** Return outgoing wikilink targets in the entry's body that do not resolve to any vault entry.
 * Preserves the order given by `entry.outgoingLinks` (which is sorted+deduped at scan time). */
export function findUnresolvedOutgoingLinks(entry: VaultEntry, entries: VaultEntry[]): string[] {
  return entry.outgoingLinks.filter((target) => !resolveEntry(entries, target))
}
