/// <reference types="vite/client" />
/// <reference types="@ztools-center/ztools-api-types" />

declare module '*.vue' {
  import type { DefineComponent } from 'vue'
  const component: DefineComponent<Record<string, never>, Record<string, never>, unknown>
  export default component
}

type FolderKind = 'note' | 'todo' | 'record'
type SyncProvider = 'local' | 'webdiv'

interface NoteFile {
  name: string
  path: string
  mtime: number
  size: number
  folder?: string
  kind?: FolderKind
}

interface FolderInfo {
  name: string
  path: string
  fullPath?: string
  kind: FolderKind
  existed?: boolean
}

interface Services {
  listNotes: () => { root: string; files: NoteFile[]; folders?: FolderInfo[] }
  listFolders?: () => { root: string; folders: FolderInfo[]; defaults: string[] }
  createFolder?: (name: string, parentFolder?: string) => FolderInfo
  renameFolder?: (relPath: string, newName: string) => FolderInfo
  deleteFolder?: (relPath: string) => boolean
  readNote: (filePath: string) => string
  writeNote: (filePath: string, content: string) => boolean
  createNote: (title: string, folder?: string, body?: string) => { path: string; name: string; content: string; folder?: string; kind?: FolderKind }
  deleteNote: (filePath: string) => boolean
  renameNote: (filePath: string, newTitle: string) => { path: string; name: string }
  setNotesRoot: (dirPath: string) => string
  getNotesRootPath: () => string
  chooseNotesRoot?: () => string | null
  openInFolder: (filePath: string) => boolean
  readConfig: () => Record<string, unknown>
  writeConfig: (partial: Record<string, unknown>) => Record<string, unknown>
  DEFAULT_FOLDERS?: string[]
}

declare global {
  interface Window {
    services: Services
  }
}

export {}