import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { makeEntry } from '../../test-utils/noteListTestUtils'
import { UnresolvedLinksPanel } from './UnresolvedLinksPanel'
import { findUnresolvedOutgoingLinks } from './useInspectorData'

describe('findUnresolvedOutgoingLinks', () => {
  const alice = makeEntry({
    path: '/vault/notes/alice.md',
    filename: 'alice.md',
    title: 'Alice',
  })
  const entries = [alice]

  it('returns targets that do not match any entry', () => {
    const source = makeEntry({
      path: '/vault/notes/meeting.md',
      filename: 'meeting.md',
      title: 'Meeting',
      outgoingLinks: ['alice', 'ghost-note', 'another-missing'],
    })
    expect(findUnresolvedOutgoingLinks(source, [...entries, source])).toEqual([
      'ghost-note',
      'another-missing',
    ])
  })

  it('returns empty when all links resolve', () => {
    const source = makeEntry({
      path: '/vault/notes/meeting.md',
      filename: 'meeting.md',
      outgoingLinks: ['alice'],
    })
    expect(findUnresolvedOutgoingLinks(source, [...entries, source])).toEqual([])
  })

  it('returns empty when entry has no outgoing links', () => {
    const source = makeEntry({
      path: '/vault/notes/meeting.md',
      filename: 'meeting.md',
      outgoingLinks: [],
    })
    expect(findUnresolvedOutgoingLinks(source, [...entries, source])).toEqual([])
  })
})

describe('UnresolvedLinksPanel', () => {
  it('renders nothing when there are no unresolved links', () => {
    const { container } = render(<UnresolvedLinksPanel unresolvedTargets={[]} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('renders each unresolved target', () => {
    render(<UnresolvedLinksPanel unresolvedTargets={['ghost-note', 'another-missing']} />)
    expect(screen.getByText('ghost-note')).toBeInTheDocument()
    expect(screen.getByText('another-missing')).toBeInTheDocument()
  })

  it('shows the Unresolved header', () => {
    render(<UnresolvedLinksPanel unresolvedTargets={['ghost-note']} />)
    expect(screen.getByText(/Unresolved/i)).toBeInTheDocument()
  })
})
