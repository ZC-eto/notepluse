import type { Task, TaskColor, TaskKind, TaskPatch, TaskPriority } from './types'
import { parseTaskDocument } from './parseTasks'
import {
  META_RE,
  TASK_LINE_RE,
  displayTaskTitle,
  inlineMetadataRanges,
  isLocalDate,
  newTaskId,
  serializeTaskLine,
} from './taskSyntax'

export interface AppendTaskInput {
  /** 必填：明确选择写入哪个合法 Task Block。缺失时安全 no-op。 */
  blockId?: string
  title: string
  done?: boolean
  date?: string
  due?: string
  start?: string
  end?: string
  type?: TaskKind
  priority?: TaskPriority
  color?: TaskColor
  tags?: string[]
  indent?: string
}

function lineEnding(markdown: string): string {
  return markdown.includes('\r\n') ? '\r\n' : '\n'
}

function findWritableTask(markdown: string, task: Pick<Task, 'id' | 'blockId' | 'lineIndex' | 'explicitId'>): Task | undefined {
  const parsed = parseTaskDocument(markdown)
  return parsed.tasks.find((candidate) => {
    if (!candidate.isWritable || candidate.blockId !== task.blockId) return false
    if (task.explicitId) return candidate.explicitId === task.explicitId
    return candidate.id === task.id && candidate.lineIndex === task.lineIndex
  })
}

function findWritableTaskById(markdown: string, taskId: string): Task | undefined {
  const matches = parseTaskDocument(markdown).tasks.filter(
    (task) => task.isWritable && task.explicitId === taskId
  )
  return matches.length === 1 ? matches[0] : undefined
}

function updateCheckbox(line: string, done: boolean): string {
  const match = line.match(TASK_LINE_RE)
  if (!match) return line
  const checkboxAt = line.indexOf('[', match[1].length)
  if (checkboxAt < 0) return line
  return `${line.slice(0, checkboxAt + 1)}${done ? 'x' : ' '}${line.slice(checkboxAt + 2)}`
}

function replaceOneMetadata(line: string, field: string, value: string | null): string {
  const re = new RegExp(`@${field}\\([^)]*\\)`, 'i')
  if (value === null) return line.replace(new RegExp(`[ \\t]*@${field}\\([^)]*\\)`, 'gi'), '')
  if (re.test(line)) return line.replace(re, `@${field}(${value})`)
  return `${line} @${field}(${value})`
}

function replaceTags(line: string, tags: string[]): string {
  const withoutTags = line.replace(META_RE.tag, '')
  const cleanTags = tags.filter(Boolean).map((tag) => `#${tag}`)
  return cleanTags.length ? `${withoutTags.replace(/[ \t]+$/, '')} ${cleanTags.join(' ')}` : withoutTags.replace(/[ \t]+$/, '')
}

/**
 * 改标题时保护所有 @foo(...)（包括未知元数据）和 #tag。仅替换文本片段，
 * 不会把 @due 改成 @end，也不会删除用户的扩展字段。
 */
function replaceTitlePreservingMetadata(body: string, nextTitle: string): string {
  const title = displayTaskTitle(nextTitle)
  const ranges = inlineMetadataRanges(body)
  let cursor = 0
  let wroteTitle = false
  let output = ''

  const replacePlain = (plain: string) => {
    if (!/\S/.test(plain)) return plain
    const leading = plain.match(/^\s*/)?.[0] ?? ''
    const trailing = plain.match(/\s*$/)?.[0] ?? ''
    if (!wroteTitle) {
      wroteTitle = true
      return `${leading}${title}${trailing}`
    }
    return `${leading}${trailing}`
  }

  for (const range of ranges) {
    output += replacePlain(body.slice(cursor, range.start))
    output += body.slice(range.start, range.end)
    cursor = range.end
  }
  output += replacePlain(body.slice(cursor))
  return wroteTitle ? output : `${title}${body ? ' ' : ''}${body}`
}

function replaceTaskTitle(line: string, title: string): string {
  const match = line.match(TASK_LINE_RE)
  if (!match) return line
  const body = match[3]
  const bodyStart = line.length - body.length
  return `${line.slice(0, bodyStart)}${replaceTitlePreservingMetadata(body, title)}`
}

function validDatePatch(patch: TaskPatch, current: Task): TaskPatch {
  const next: TaskPatch = { ...patch }
  let invalidScheduleDate = false
  for (const field of ['date', 'due', 'start', 'end'] as const) {
    const value = next[field]
    if (value !== undefined && value !== null && !isLocalDate(value)) {
      if (field === 'start' || field === 'end') invalidScheduleDate = true
      delete next[field]
    }
  }
  // 计划 API 同时操作 start/end；一端非法时必须整体拒绝，不能半写入另一端。
  if (invalidScheduleDate) {
    delete next.start
    delete next.end
    return next
  }
  const start = next.start === undefined ? current.start : next.start || undefined
  const end = next.end === undefined ? current.end : next.end || undefined
  if (start && end && start > end) {
    delete next.start
    delete next.end
  }
  return next
}

/**
 * 已废弃：扫描/打开必须只读，不能再自动补 @id。
 * 保留导出仅为兼容旧调用方；它永远返回原文。
 */
export function ensureTaskIds(markdown: string): string {
  return markdown
}

/** Layer 2 → Layer 1：只对显式、唯一 @id 的当前 Task Block 任务作最小文本 patch。 */
export function applyTaskPatch(markdown: string, task: Task, patch: TaskPatch): string {
  const current = findWritableTask(markdown, task)
  if (!current) return markdown
  const safePatch = validDatePatch(patch, current)
  let line = current.rawLine

  if (safePatch.done !== undefined) line = updateCheckbox(line, safePatch.done)
  if (safePatch.title !== undefined) line = replaceTaskTitle(line, safePatch.title)
  if (safePatch.date !== undefined) line = replaceOneMetadata(line, 'date', safePatch.date)
  if (safePatch.due !== undefined) line = replaceOneMetadata(line, 'due', safePatch.due)
  if (safePatch.start !== undefined) line = replaceOneMetadata(line, 'start', safePatch.start)
  if (safePatch.end !== undefined) line = replaceOneMetadata(line, 'end', safePatch.end)
  if (safePatch.type !== undefined) line = replaceOneMetadata(line, 'type', safePatch.type)
  if (safePatch.priority !== undefined) line = replaceOneMetadata(line, 'priority', safePatch.priority)
  if (safePatch.color !== undefined) line = replaceOneMetadata(line, 'color', safePatch.color)
  if (safePatch.tags !== undefined) line = replaceTags(line, safePatch.tags)

  if (line === current.rawLine) return markdown
  const eol = lineEnding(markdown)
  const lines = markdown.split(/\r?\n/)
  lines[current.lineIndex] = line
  return lines.join(eol)
}

export function toggleTaskDone(markdown: string, taskId: string): string {
  const task = findWritableTaskById(markdown, taskId)
  return task ? applyTaskPatch(markdown, task, { done: !task.done }) : markdown
}

/** 兼容旧 API：仅更新执行区间 @start / @end，不再把 @due 当成 @end。 */
export function updateTaskSchedule(
  markdown: string,
  taskId: string,
  start?: string | null,
  end?: string | null
): string {
  const task = findWritableTaskById(markdown, taskId)
  return task ? applyTaskPatch(markdown, task, { start, end }) : markdown
}

export function updateTaskDate(markdown: string, taskId: string, date?: string | null): string {
  const task = findWritableTaskById(markdown, taskId)
  return task ? applyTaskPatch(markdown, task, { date }) : markdown
}

export function updateTaskDue(markdown: string, taskId: string, due?: string | null): string {
  const task = findWritableTaskById(markdown, taskId)
  return task ? applyTaskPatch(markdown, task, { due }) : markdown
}

/** 在指定合法 Task Block 的关闭注释前插入一条新任务；未选择 block 时不写入。 */
export function appendTask(markdown: string, input: AppendTaskInput): string {
  if (!input.blockId || !input.title.trim()) return markdown
  for (const value of [input.date, input.due, input.start, input.end]) {
    if (value !== undefined && !isLocalDate(value)) return markdown
  }
  if (input.start && input.end && input.start > input.end) return markdown

  const parsed = parseTaskDocument(markdown)
  const block = parsed.blocks.find((candidate) => candidate.id === input.blockId && candidate.isValid && candidate.endLine !== undefined)
  if (!block || block.endLine === undefined) return markdown

  const line = serializeTaskLine({
    indent: input.indent,
    done: Boolean(input.done),
    title: input.title,
    date: input.date,
    due: input.due,
    start: input.start,
    end: input.end,
    type: input.type,
    priority: input.priority,
    color: input.color,
    tags: input.tags,
    id: newTaskId(),
  })
  const eol = lineEnding(markdown)
  const lines = markdown.split(/\r?\n/)
  lines.splice(block.endLine, 0, line)
  return lines.join(eol)
}

/** 删除任务行（仅显式、唯一、可写的 @id 任务）。 */
export function removeTask(markdown: string, taskId: string): string {
  const task = findWritableTaskById(markdown, taskId)
  if (!task) return markdown
  const eol = lineEnding(markdown)
  const lines = markdown.split(/\r?\n/)
  lines.splice(task.lineIndex, 1)
  return lines.join(eol)
}