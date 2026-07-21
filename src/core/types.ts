/** 任务块诊断。所有位置均为 0-based 行号，方便直接定位编辑器文本。 */
export interface TaskDiagnostic {
  code:
    | 'task-block-missing-id'
    | 'task-block-duplicate-id'
    | 'task-block-unclosed'
    | 'task-block-unexpected-close'
    | 'task-block-nested'
    | 'task-invalid-date'
    | 'task-invalid-range'
    | 'task-duplicate-id'
  message: string
  lineIndex: number
  severity: 'error' | 'warning'
  blockId?: string
  taskId?: string
}

export type TaskKind = 'group' | 'task' | 'milestone'
export type TaskPriority = 'low' | 'medium' | 'high' | 'urgent'
export type TaskColor = 'gray' | 'blue' | 'green' | 'orange' | 'red' | 'violet'

export interface TaskSourceRange {
  startLine: number
  endLine: number
}

/**
 * Task Block 内的显式任务实体。
 *
 * `id` 在缺少 @id 时会是仅供展示/排序的稳定派生值；这类任务 `isWritable`
 * 为 false，写回操作必须拒绝它，避免扫描阶段静默修改 Markdown。
 */
export interface Task {
  id: string
  /** Markdown 中实际写出的 @id；缺失时不允许安全回写。 */
  explicitId?: string
  isWritable: boolean
  blockId: string
  sourceRange: TaskSourceRange
  headingPath: string[]
  parentId?: string
  childIds: string[]
  depth: number

  title: string
  done: boolean
  type: TaskKind
  /** YYYY-MM-DD，本地日期（非 UTC 时间戳） */
  date?: string
  /** YYYY-MM-DD，截止日期；不会再映射为 end。 */
  due?: string
  /** YYYY-MM-DD，执行区间起点。 */
  start?: string
  /** YYYY-MM-DD，执行区间终点。 */
  end?: string
  priority?: TaskPriority
  color?: TaskColor
  tags: string[]

  /** 兼容既有调用方的源行信息。 */
  lineIndex: number
  rawLine: string
  indent: string
}

export interface TaskBlock {
  id: string
  name?: string
  color?: TaskColor
  startLine: number
  /** 关闭注释所在行；未闭合块为 undefined。 */
  endLine?: number
  isValid: boolean
}

/** 可作为新任务安全写入目标的、用户显式声明的 Task Block。 */
export interface TaskBlockTarget {
  notePath: string
  noteName: string
  folder: string
  blockId: string
  blockName: string
  color?: TaskColor
}

export interface TaskParseResult {
  tasks: Task[]
  blocks: TaskBlock[]
  diagnostics: TaskDiagnostic[]
}

/** 跨笔记聚合任务：附带源笔记定位信息 */
export interface GlobalTask extends Task {
  notePath: string
  noteName: string
  folder: string
}

export interface TaskPatch {
  title?: string
  done?: boolean
  date?: string | null
  due?: string | null
  start?: string | null
  end?: string | null
  type?: TaskKind
  priority?: TaskPriority | null
  color?: TaskColor | null
  tags?: string[]
}

/** 文件夹角色：记录类不强行任务模板 */
export type FolderKind = 'note' | 'todo' | 'record'

export interface NoteMeta {
  name: string
  path: string
  mtime: number
  size: number
  /** 相对 notesRoot 的文件夹路径，根目录为空串 */
  folder?: string
  kind?: FolderKind
}

export interface FolderMeta {
  name: string
  /** 相对 notesRoot 路径，如「工作」或「工作/子目录」 */
  path: string
  fullPath?: string
  kind: FolderKind
  /** 可选：文件夹图标键（UI 选择，写入 config） */
  icon?: string
}

export interface NoteGroup {
  folder: string
  label: string
  kind: FolderKind
  notes: NoteMeta[]
  /** 侧栏展示用图标键（来自 config folderIcons） */
  icon?: string
}

/** 同步后端选择：local 本地文件；webdiv 预留远程（未接通） */
export type SyncProvider = 'local' | 'webdiv'

export type AppView = 'editor' | 'todo' | 'gantt' | 'calendar'
export type EditorMode = 'wysiwyg' | 'source'
/** 界面信息密度：紧凑适合宿主窄窗 */
export type UiDensity = 'comfortable' | 'compact'