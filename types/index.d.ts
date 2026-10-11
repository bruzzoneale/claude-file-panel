export type FileEntryStatus = 'running' | 'done' | 'error'

export type FileEntry = {
  id: string
  tool: string
  path: string
  status: FileEntryStatus
  diff?: string
  added?: number
  removed?: number
  note?: string
}

declare module 'claude-code' {
  interface PluginState {
    'file-panel': { entries: FileEntry[]; isOpen: boolean }
  }
}
