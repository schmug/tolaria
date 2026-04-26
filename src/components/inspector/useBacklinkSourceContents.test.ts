import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { useBacklinkSourceContents } from './useBacklinkSourceContents'

vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn() }))
vi.mock('../../mock-tauri', () => ({
  isTauri: vi.fn(() => false),
  mockInvoke: vi.fn(),
}))

import { mockInvoke } from '../../mock-tauri'

describe('useBacklinkSourceContents', () => {
  beforeEach(() => {
    vi.mocked(mockInvoke).mockReset()
  })

  it('starts empty before any load completes', () => {
    vi.mocked(mockInvoke).mockImplementation(() => new Promise(() => {}))
    const { result } = renderHook(() => useBacklinkSourceContents(['/a.md']))
    expect(result.current.size).toBe(0)
  })

  it('loads content for each unique path and exposes it through the map', async () => {
    vi.mocked(mockInvoke).mockImplementation(async (_cmd, args) => {
      const path = (args as { path: string }).path
      return `content of ${path}`
    })
    const { result } = renderHook(() => useBacklinkSourceContents(['/a.md', '/b.md']))
    await waitFor(() => expect(result.current.size).toBe(2))
    expect(result.current.get('/a.md')).toBe('content of /a.md')
    expect(result.current.get('/b.md')).toBe('content of /b.md')
  })

  it('does not re-fetch a path whose content is already cached', async () => {
    vi.mocked(mockInvoke).mockImplementation(async (_cmd, args) => {
      return `content of ${(args as { path: string }).path}`
    })
    const { result, rerender } = renderHook(({ paths }: { paths: string[] }) => useBacklinkSourceContents(paths), {
      initialProps: { paths: ['/a.md'] },
    })
    await waitFor(() => expect(result.current.size).toBe(1))
    vi.mocked(mockInvoke).mockClear()
    rerender({ paths: ['/a.md'] })
    expect(mockInvoke).not.toHaveBeenCalled()
  })

  it('swallows load failures so missing content just stays absent', async () => {
    vi.mocked(mockInvoke).mockImplementation(async (_cmd, args) => {
      const path = (args as { path: string }).path
      if (path === '/a.md') throw new Error('fs error')
      return 'ok'
    })
    const { result } = renderHook(() => useBacklinkSourceContents(['/a.md', '/b.md']))
    await waitFor(() => expect(result.current.get('/b.md')).toBe('ok'))
    expect(result.current.has('/a.md')).toBe(false)
  })
})
