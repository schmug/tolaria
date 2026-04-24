import { describe, expect, it } from 'vitest'
import { makeEntry } from '../../test-utils/noteListTestUtils'
import { buildInspectorLinkIndex, getInspectorLinkIndex, expandBacklinksWithContext } from './useInspectorData'
import type { BacklinkItem } from '../InspectorPanels'

describe('buildInspectorLinkIndex', () => {
  it('indexes referenced-by and backlinks once per matching source entry', () => {
    const target = makeEntry({
      path: '/vault/work/responsibility/grow-newsletter.md',
      filename: 'grow-newsletter.md',
      title: 'Grow Newsletter',
      aliases: ['Newsletter'],
      isA: 'Responsibility',
    })
    const relationshipSource = makeEntry({
      path: '/vault/essay/on-writing.md',
      filename: 'on-writing.md',
      title: 'On Writing Well',
      isA: 'Essay',
      relationships: {
        'Belongs to': ['[[responsibility/grow-newsletter]]', '[[Newsletter]]'],
        Type: ['[[essay]]'],
      },
      outgoingLinks: ['grow-newsletter', 'responsibility/grow-newsletter'],
    })
    const typeSource = makeEntry({
      path: '/vault/type/responsibility.md',
      filename: 'responsibility.md',
      title: 'Responsibility',
      isA: 'Type',
      relationships: {
        Type: ['[[grow-newsletter]]'],
      },
    })

    const index = buildInspectorLinkIndex([target, relationshipSource, typeSource])

    expect(index.referencedBy.get(target.path)).toEqual([
      { entry: relationshipSource, viaKey: 'Belongs to' },
    ])
    expect(index.backlinks.get(target.path)).toEqual([
      { entry: relationshipSource, context: null },
    ])
  })

  it('reuses the cached index for the same entries array', () => {
    const entries = [
      makeEntry({
        path: '/vault/target.md',
        filename: 'target.md',
        title: 'Target',
      }),
    ]

    expect(getInspectorLinkIndex(entries)).toBe(getInspectorLinkIndex(entries))
    expect(getInspectorLinkIndex([...entries])).not.toBe(getInspectorLinkIndex(entries))
  })
})

describe('expandBacklinksWithContext', () => {
  const active = makeEntry({
    path: '/vault/notes/alice.md',
    filename: 'alice.md',
    title: 'Alice',
  })
  const source = makeEntry({
    path: '/vault/notes/meeting.md',
    filename: 'meeting.md',
    title: 'Meeting',
    outgoingLinks: ['alice'],
  })
  const entries = [active, source]
  const backlinks: BacklinkItem[] = [{ entry: source, context: null }]

  it('returns input unchanged when no source contents are available', () => {
    const result = expandBacklinksWithContext(backlinks, active, entries, new Map())
    expect(result).toEqual(backlinks)
  })

  it('returns input unchanged when content has no matching wikilink', () => {
    const contents = new Map([[source.path, '# Meeting\n\nUnrelated body.']])
    const result = expandBacklinksWithContext(backlinks, active, entries, contents)
    expect(result).toEqual(backlinks)
  })

  it('expands to one item per occurrence with context filled in', () => {
    const contents = new Map([
      [source.path, '# Meeting\n\nSpoke with [[alice]] today.\n\nFollow-up with [[alice]] next week.'],
    ])
    const result = expandBacklinksWithContext(backlinks, active, entries, contents)
    expect(result).toEqual([
      { entry: source, context: 'Spoke with [[alice]] today.' },
      { entry: source, context: 'Follow-up with [[alice]] next week.' },
    ])
  })

  it('matches via resolved target regardless of raw wikilink spelling', () => {
    const sourceUsingPath = makeEntry({
      path: '/vault/notes/path-link.md',
      filename: 'path-link.md',
      title: 'Path Link',
      outgoingLinks: ['notes/alice'],
    })
    const contents = new Map([
      [sourceUsingPath.path, '# X\n\nLinked via [[notes/alice]] here.'],
    ])
    const result = expandBacklinksWithContext(
      [{ entry: sourceUsingPath, context: null }],
      active,
      [active, sourceUsingPath],
      contents,
    )
    expect(result).toEqual([
      { entry: sourceUsingPath, context: 'Linked via [[notes/alice]] here.' },
    ])
  })

  it('falls back to sync item for sources whose content has not loaded yet', () => {
    const secondSource = makeEntry({
      path: '/vault/notes/other.md',
      filename: 'other.md',
      title: 'Other',
      outgoingLinks: ['alice'],
    })
    const contents = new Map([
      [source.path, '# Meeting\n\nMentioned [[alice]] briefly.'],
    ])
    const result = expandBacklinksWithContext(
      [
        { entry: source, context: null },
        { entry: secondSource, context: null },
      ],
      active,
      [active, source, secondSource],
      contents,
    )
    expect(result).toEqual([
      { entry: source, context: 'Mentioned [[alice]] briefly.' },
      { entry: secondSource, context: null },
    ])
  })
})
