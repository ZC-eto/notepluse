import type { GlobalTask, Task } from './types'
import { parseTasks } from './parseTasks'

export type { GlobalTask }

export interface NoteTaskCacheEntry {
  mtime: number
  tasks: GlobalTask[]
}

export function noteDisplayName(name: string): string {
  return String(name || '').replace(/\.md$/i, '') || '未命名笔记'
}

/** 将单篇笔记的任务挂上源笔记元数据 */
export function attachNoteMeta(
  tasks: Task[],
  note: { path: string; name: string; folder?: string }
): GlobalTask[] {
  const noteName = noteDisplayName(note.name)
  const folder = note.folder || ''
  return tasks.map((t) => ({
    ...t,
    notePath: note.path,
    noteName,
    folder,
  }))
}

/**
 * 聚合 notesRoot 下全部笔记中的显式任务（仅 `- [ ]` / `- [x]`）。
 * 使用 mtime 简单缓存；当前打开笔记优先用内存中的 activeContent。
 */
export function collectGlobalTasks(
  notes: Array<{ path: string; name: string; folder?: string; mtime: number }>,
  options: {
    readContent: (path: string) => string
    cache: Map<string, NoteTaskCacheEntry>
    activePath?: string
    activeContent?: string
  }
): GlobalTask[] {
  const out: GlobalTask[] = []
  const { readContent, cache, activePath, activeContent } = options

  for (const note of notes) {
    if (activePath && note.path === activePath && typeof activeContent === 'string') {
      const tasks = attachNoteMeta(parseTasks(activeContent), note)
      // 活动笔记内容可能未落盘，缓存标记为脏，避免下次误用磁盘 mtime
      cache.set(note.path, { mtime: Number.NaN, tasks })
      out.push(...tasks)
      continue
    }

    const cached = cache.get(note.path)
    if (cached && Number.isFinite(cached.mtime) && cached.mtime === note.mtime) {
      out.push(...cached.tasks)
      continue
    }

    let md = ''
    try {
      md = readContent(note.path) || ''
    } catch {
      cache.delete(note.path)
      continue
    }

    const tasks = attachNoteMeta(parseTasks(md), note)
    cache.set(note.path, { mtime: note.mtime || 0, tasks })
    out.push(...tasks)
  }

  return out
}

export function countGlobalTasks(tasks: GlobalTask[]): {
  total: number
  done: number
  open: number
} {
  const total = tasks.length
  const done = tasks.filter((t) => t.done).length
  return { total, done, open: total - done }
}

/** 列表 key：跨笔记 id 可能碰撞 */
export function globalTaskKey(task: Pick<GlobalTask, 'notePath' | 'id' | 'lineIndex'>): string {
  return `${task.notePath}::${task.id}::${task.lineIndex}`
}