/** Markdown Task Block 中使用的行与内联元数据语法。 */
export const TASK_LINE_RE = /^(\s*)[-*+] \[([ xX])\][ \t]+(.*)$/

export const META_RE = {
  start: /@start\(([^)]*)\)/i,
  end: /@end\(([^)]*)\)/i,
  due: /@due\(([^)]*)\)/i,
  date: /@date\(([^)]*)\)/i,
  id: /@id\(([^)]*)\)/i,
  type: /@type\(([^)]*)\)/i,
  priority: /@priority\(([^)]*)\)/i,
  color: /@color\(([^)]*)\)/i,
  tag: /#([\w\u4e00-\u9fff/-]+)/g,
}

export type ParsedTaskType = 'group' | 'task' | 'milestone'
export type ParsedTaskPriority = 'low' | 'medium' | 'high' | 'urgent'
export type ParsedTaskColor = 'gray' | 'blue' | 'green' | 'orange' | 'red' | 'violet'

export interface InvalidDateMeta {
  field: 'date' | 'due' | 'start' | 'end'
  value: string
}

export interface ParsedTaskMeta {
  title: string
  date?: string
  due?: string
  start?: string
  end?: string
  tags: string[]
  explicitId?: string
  type?: ParsedTaskType
  priority?: ParsedTaskPriority
  color?: ParsedTaskColor
  invalidDates: InvalidDateMeta[]
}

const KNOWN_META_RE = /@(start|end|due|date|id|type|priority|color)\(([^)]*)\)/gi
const ANY_INLINE_META_RE = /@[\w-]+\([^)]*\)/g
const LEFTOVER_META_RE = /@(?:start|end|due|date|id|type|priority|color)\([^)]*\)/gi
const BROKEN_CHECKBOX_RE = /\s*[-*+]\s*\[[ xX]?\]\s*/g
const VALID_IDS_RE = /^[\w.-]+$/
const TYPE_VALUES = new Set<ParsedTaskType>(['group', 'task', 'milestone'])
const PRIORITY_VALUES = new Set<ParsedTaskPriority>(['low', 'medium', 'high', 'urgent'])
const COLOR_VALUES = new Set<ParsedTaskColor>(['gray', 'blue', 'green', 'orange', 'red', 'violet'])

export function isTaskLine(line: string): boolean {
  return TASK_LINE_RE.test(line)
}

/** 严格 LocalDate 校验：不通过 Date / UTC 隐式转换。 */
export function isLocalDate(value: string | undefined | null): value is string {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const year = Number(value.slice(0, 4))
  const month = Number(value.slice(5, 7))
  const day = Number(value.slice(8, 10))
  if (year < 1 || year > 9999 || month < 1 || month > 12 || day < 1) return false
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0)
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
  return day <= days[month - 1]
}

/**
 * 从任务正文提取受支持字段。未知 @foo(...) 不会被吞掉：它留在 title/rawLine，
 * 因而后续最小 patch 不会误删除用户自定义元数据。
 */
export function parseTaskMeta(text: string): ParsedTaskMeta {
  const tags: string[] = []
  const invalidDates: InvalidDateMeta[] = []
  let date: string | undefined
  let due: string | undefined
  let start: string | undefined
  let end: string | undefined
  let explicitId: string | undefined
  let type: ParsedTaskType | undefined
  let priority: ParsedTaskPriority | undefined
  let color: ParsedTaskColor | undefined

  const withoutKnown = text.replace(KNOWN_META_RE, (full, fieldRaw: string, valueRaw: string) => {
    const field = fieldRaw.toLowerCase()
    const value = valueRaw.trim()
    if (field === 'date' || field === 'due' || field === 'start' || field === 'end') {
      if (!isLocalDate(value)) {
        invalidDates.push({ field, value })
      } else if (field === 'date') date ??= value
      else if (field === 'due') due ??= value
      else if (field === 'start') start ??= value
      else end ??= value
      return ''
    }
    if (field === 'id' && VALID_IDS_RE.test(value)) explicitId ??= value
    if (field === 'type' && TYPE_VALUES.has(value as ParsedTaskType)) type ??= value as ParsedTaskType
    if (field === 'priority' && PRIORITY_VALUES.has(value as ParsedTaskPriority)) priority ??= value as ParsedTaskPriority
    if (field === 'color' && COLOR_VALUES.has(value as ParsedTaskColor)) color ??= value as ParsedTaskColor
    return ''
  })

  const title = withoutKnown
    .replace(META_RE.tag, (_m, tag: string) => {
      tags.push(tag)
      return ''
    })
    .replace(BROKEN_CHECKBOX_RE, ' ')
    .replace(/\s+/g, ' ')
    .trim()

  return { title, date, due, start, end, tags, explicitId, type, priority, color, invalidDates }
}

/** 兼容旧调用方的字段提取入口；@due 不再映射成 @end。 */
export function stripMeta(text: string): ParsedTaskMeta {
  return parseTaskMeta(text)
}

/** 日历投影：只有有效的单日、截止日或合法区间才算排期。 */
export function hasSchedule(meta: {
  date?: string | null
  due?: string | null
  start?: string | null
  end?: string | null
}): boolean {
  const date = meta.date || undefined
  const due = meta.due || undefined
  const start = meta.start || undefined
  const end = meta.end || undefined
  if (date && isLocalDate(date)) return true
  if (due && isLocalDate(due)) return true
  return Boolean(start && end && isLocalDate(start) && isLocalDate(end) && start <= end)
}

/** 甘特默认仅接受严格的多日执行区间。 */
export function isMultiDay(meta: { start?: string | null; end?: string | null }): boolean {
  const start = meta.start || undefined
  const end = meta.end || undefined
  return Boolean(start && end && isLocalDate(start) && isLocalDate(end) && start < end)
}

/** Todo 的 Today：仅 date 当日、进行中的合法区间、或已过期 due；无日期属于 Inbox。 */
export function isTodayFocus(
  task: { done?: boolean; date?: string | null; due?: string | null; start?: string | null; end?: string | null },
  today: string
): boolean {
  if (task.done || !isLocalDate(today)) return false
  const date = task.date || undefined
  const due = task.due || undefined
  const start = task.start || undefined
  const end = task.end || undefined
  if (date && isLocalDate(date) && date === today) return true
  if (due && isLocalDate(due) && due <= today) return true
  return Boolean(start && end && isLocalDate(start) && isLocalDate(end) && start <= today && today <= end)
}

/** 生成只在显式创建任务时写入 Markdown 的稳定 id。 */
export function newTaskId(): string {
  const t = Date.now().toString(36)
  const r = Math.random().toString(36).slice(2, 8)
  return `t${t}${r}`
}

/** 清洗展示用标题：仅去掉受支持元数据和标签。 */
export function displayTaskTitle(raw: string | undefined | null): string {
  if (!raw) return '未命名任务'
  let rest = String(raw)
  rest = rest.replace(LEFTOVER_META_RE, '')
  rest = rest.replace(META_RE.tag, '')
  rest = rest.replace(BROKEN_CHECKBOX_RE, ' ')
  rest = rest.replace(/\s+/g, ' ').trim()
  return rest || '未命名任务'
}

/** 任务是否在给定 LocalDate 上显示。 */
export function taskOccursOnDay(
  task: { date?: string | null; due?: string | null; start?: string | null; end?: string | null },
  dayKey: string
): boolean {
  if (!isLocalDate(dayKey)) return false
  if (task.date && isLocalDate(task.date) && task.date === dayKey) return true
  if (task.due && isLocalDate(task.due) && task.due === dayKey) return true
  const start = task.start || undefined
  const end = task.end || undefined
  return Boolean(start && end && isLocalDate(start) && isLocalDate(end) && start <= end && start <= dayKey && dayKey <= end)
}

/** 生成 hover 提示：保留 date/due/执行区间的不同语义。 */
export function taskScheduleTooltip(task: {
  title?: string
  date?: string | null
  due?: string | null
  start?: string | null
  end?: string | null
}): string {
  const title = displayTaskTitle(task.title)
  if (task.start && task.end && isLocalDate(task.start) && isLocalDate(task.end)) return `${title}\n${task.start} → ${task.end}`
  if (task.date && isLocalDate(task.date)) return `${title}\n${task.date}`
  if (task.due && isLocalDate(task.due)) return `${title}\n截止 ${task.due}`
  return title
}

/** 为显式新建任务生成规范行；已有行更新必须使用 writeTasks 的最小 patch。 */
export function serializeTaskLine(input: {
  indent?: string
  marker?: '-' | '*' | '+'
  done: boolean
  title: string
  date?: string | null
  due?: string | null
  start?: string | null
  end?: string | null
  type?: ParsedTaskType
  priority?: ParsedTaskPriority | null
  color?: ParsedTaskColor | null
  tags?: string[]
  id?: string
}): string {
  const indent = input.indent ?? ''
  const marker = input.marker ?? '-'
  const box = input.done ? 'x' : ' '
  const cleanTitle = displayTaskTitle(input.title)
  const parts: string[] = [cleanTitle]
  if (input.date && isLocalDate(input.date)) parts.push(`@date(${input.date})`)
  if (input.start && isLocalDate(input.start)) parts.push(`@start(${input.start})`)
  if (input.end && isLocalDate(input.end)) parts.push(`@end(${input.end})`)
  if (input.due && isLocalDate(input.due)) parts.push(`@due(${input.due})`)
  if (input.type && input.type !== 'task') parts.push(`@type(${input.type})`)
  if (input.priority) parts.push(`@priority(${input.priority})`)
  if (input.color) parts.push(`@color(${input.color})`)
  if (input.id) parts.push(`@id(${input.id})`)
  for (const tag of input.tags ?? []) if (tag) parts.push(`#${tag}`)
  return `${indent}${marker} [${box}] ${parts.join(' ')}`
}

export function extractMetaString(body: string): string {
  const meta = parseTaskMeta(body)
  const parts: string[] = []
  if (meta.date) parts.push(`@date(${meta.date})`)
  if (meta.start) parts.push(`@start(${meta.start})`)
  if (meta.end) parts.push(`@end(${meta.end})`)
  if (meta.due) parts.push(`@due(${meta.due})`)
  if (meta.explicitId) parts.push(`@id(${meta.explicitId})`)
  for (const tag of meta.tags) parts.push(`#${tag}`)
  return parts.join(' ')
}

/** writeTasks 使用：保护所有 @foo(...)，避免删除用户未知元数据。 */
export function inlineMetadataRanges(text: string): Array<{ start: number; end: number }> {
  const ranges: Array<{ start: number; end: number }> = []
  for (const match of text.matchAll(ANY_INLINE_META_RE)) {
    ranges.push({ start: match.index ?? 0, end: (match.index ?? 0) + match[0].length })
  }
  for (const match of text.matchAll(META_RE.tag)) {
    ranges.push({ start: match.index ?? 0, end: (match.index ?? 0) + match[0].length })
  }
  return ranges.sort((a, b) => a.start - b.start)
}