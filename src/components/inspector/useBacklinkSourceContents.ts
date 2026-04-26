import { useEffect, useRef, useState } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { isTauri, mockInvoke } from '../../mock-tauri'

async function loadNoteContent(path: string): Promise<string> {
  return isTauri()
    ? invoke<string>('get_note_content', { path })
    : mockInvoke<string>('get_note_content', { path })
}

/** Lazy-load note contents for a set of source paths and expose them as a cached map.
 * Paths already loaded are not re-fetched; paths that fail to load are simply absent.
 * Cache is keyed by path and persists for the lifetime of the hook instance. */
export function useBacklinkSourceContents(paths: string[]): Map<string, string> {
  const [contents, setContents] = useState<Map<string, string>>(() => new Map())
  const inFlight = useRef(new Set<string>())

  useEffect(() => {
    let cancelled = false
    for (const path of paths) {
      if (contents.has(path) || inFlight.current.has(path)) continue
      inFlight.current.add(path)
      loadNoteContent(path)
        .then((content) => {
          if (cancelled) return
          setContents((prev) => {
            if (prev.has(path)) return prev
            const next = new Map(prev)
            next.set(path, content)
            return next
          })
        })
        .catch(() => {})
        .finally(() => {
          inFlight.current.delete(path)
        })
    }
    return () => {
      cancelled = true
    }
  }, [paths, contents])

  return contents
}
