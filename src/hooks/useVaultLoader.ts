import { useCallback, useEffect, useState } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { isTauri, mockInvoke } from '../mock-tauri'
import type { VaultEntry, GitCommit, ModifiedFile } from '../types'

const TEST_VAULT_PATH = '~/Laputa'

export function useVaultLoader() {
  const [entries, setEntries] = useState<VaultEntry[]>([])
  const [allContent, setAllContent] = useState<Record<string, string>>({})
  const [modifiedFiles, setModifiedFiles] = useState<ModifiedFile[]>([])

  useEffect(() => {
    const loadVault = async () => {
      try {
        let result: VaultEntry[]
        if (isTauri()) {
          const path = TEST_VAULT_PATH.replace('~', '/Users/luca')
          result = await invoke<VaultEntry[]>('list_vault', { path })
        } else {
          console.info('[mock] Using mock Tauri data for browser testing')
          result = await mockInvoke<VaultEntry[]>('list_vault', {})
        }
        console.log(`Vault scan complete: ${result.length} entries found`)
        setEntries(result)

        let content: Record<string, string>
        if (isTauri()) {
          content = {}
        } else {
          content = await mockInvoke<Record<string, string>>('get_all_content', {})
        }
        setAllContent(content)
      } catch (err) {
        console.warn('Vault scan failed:', err)
      }
    }
    loadVault()
  }, [])

  const loadModifiedFiles = useCallback(async () => {
    try {
      let files: ModifiedFile[]
      if (isTauri()) {
        const vaultPath = TEST_VAULT_PATH.replace('~', '/Users/luca')
        files = await invoke<ModifiedFile[]>('get_modified_files', { vaultPath })
      } else {
        files = await mockInvoke<ModifiedFile[]>('get_modified_files', {})
      }
      setModifiedFiles(files)
    } catch (err) {
      console.warn('Failed to load modified files:', err)
      setModifiedFiles([])
    }
  }, [])

  useEffect(() => {
    loadModifiedFiles()
  }, [loadModifiedFiles])

  const addEntry = useCallback((entry: VaultEntry, content: string) => {
    setEntries((prev) => [entry, ...prev])
    setAllContent((prev) => ({ ...prev, [entry.path]: content }))
  }, [])

  const updateContent = useCallback((path: string, content: string) => {
    setAllContent((prev) => ({ ...prev, [path]: content }))
  }, [])

  const loadGitHistory = useCallback(async (path: string): Promise<GitCommit[]> => {
    try {
      if (isTauri()) {
        const vaultPath = TEST_VAULT_PATH.replace('~', '/Users/luca')
        return await invoke<GitCommit[]>('get_file_history', { vaultPath, path })
      } else {
        return await mockInvoke<GitCommit[]>('get_file_history', { path })
      }
    } catch (err) {
      console.warn('Failed to load git history:', err)
      return []
    }
  }, [])

  const loadDiff = useCallback(async (path: string): Promise<string> => {
    if (isTauri()) {
      const vaultPath = TEST_VAULT_PATH.replace('~', '/Users/luca')
      return invoke<string>('get_file_diff', { vaultPath, path })
    } else {
      return mockInvoke<string>('get_file_diff', { path })
    }
  }, [])

  const isFileModified = useCallback((path: string): boolean => {
    return modifiedFiles.some((f) => f.path === path)
  }, [modifiedFiles])

  const commitAndPush = useCallback(async (message: string): Promise<string> => {
    const vaultPath = TEST_VAULT_PATH.replace('~', '/Users/luca')
    if (isTauri()) {
      await invoke<string>('git_commit', { vaultPath, message })
      try {
        await invoke<string>('git_push', { vaultPath })
        return 'Committed and pushed'
      } catch {
        return 'Committed (push failed)'
      }
    } else {
      await mockInvoke<string>('git_commit', { message })
      await mockInvoke<string>('git_push', {})
      return 'Committed and pushed'
    }
  }, [])

  return {
    entries,
    allContent,
    modifiedFiles,
    addEntry,
    updateContent,
    loadModifiedFiles,
    loadGitHistory,
    loadDiff,
    isFileModified,
    commitAndPush,
  }
}
