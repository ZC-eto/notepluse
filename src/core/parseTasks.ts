import type { Task, TaskBlock, TaskDiagnostic, TaskParseResult } from './types'
import { TASK_LINE_RE, hasSchedule, isMultiDay, parseTaskMeta } from './taskSyntax'

const OPEN_BLOCK_RE = /^\s*<!--\s*mdw:tasks\b([\s\S]*?)-->\s*$/i
const CLOSE_BLOCK_RE = /^\s*<!--\s*\/mdw:tasks\s*-->\s*$/i
const HEADING_RE = /^ {0,3}(#{1,6})[ \t]+(.+?)\s*$/
const FENCE_RE = /^\s*(`{3,}|~{3,})/

interface MutableBlock extends TaskBlock {
  _tasks?: Task[]
}

function simpleHash(input: string): string {
  let h = 0
  for (let i = 0; i < input.length; i++) {
    h = (h << 5) - h + input.charCodeAt(i)
    h |= 0
  }
  return `derived-${Math.abs(h).toString(36)}`
}

function parseAttributes(source: string): Record<string, string> {
  const attrs: Record<string, string> = {}
  const attrRe = /([\w-]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g
  for (const match of source.matchAll(attrRe)) {
    const key = match[1].toLowerCase()
    if (key === 'mdw' || key === 'tasks') continue
    attrs[key] = match[2] ?? match[3] ?? match[4] ?? ''
  }
  return attrs
}

function indentationWidth(indent: string): number {
  let width = 0
  for (const char of indent) width += char === '\t' ? 4 - (width % 4) : 1
  return width
}

function updateHeadingPath(stack: Array<string | undefined>, raw: string): string[] {
  const match = raw.match(HEADING_RE)
  if (!match) return stack.filter((value): value is string => Boolean(value))
  const level = match[1].length
  const title = match[2].replace(/\s+#+\s*$/, '').trim()
  if (!title) return stack.filter((value): value is string => Boolean(value))
  stack.length = level
  stack[level - 1] = title
  return stack.filter((value): value is string => Boolean(value))
}

function addDiagnostic(
  diagnostics: TaskDiagnostic[],
  diagnostic: TaskDiagnostic
): void {
  diagnostics.push(diagnostic)
}

/**
 * 解析完整任务文档。
 * 只有成对、唯一且带 id 的 HTML 注释 Task Block 中的 checkbox 才会投影为 Task；
 * 扫描全程只读，不补 @id，也不会对 Markdown 作任何修复。
 */
export function parseTaskDocument(markdown: string): TaskParseResult {
  const lines = markdown.split(/\r?\n/)
  const diagnostics: TaskDiagnostic[] = []
  const blocks: MutableBlock[] = []
  const headingPaths: string[][] = []
  const headingStack: Array<string | undefined> = []
  let activeBlock: MutableBlock | undefined
  let fence: { char: '`' | '~'; length: number } | undefined

  for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
    const raw = lines[lineIndex]
    const fenceMatch = raw.match(FENCE_RE)
    if (fence) {
      headingPaths[lineIndex] = headingStack.filter((value): value is string => Boolean(value))
      if (fenceMatch && fenceMatch[1][0] === fence.char && fenceMatch[1].length >= fence.length) fence = undefined
      continue
    }
    if (fenceMatch) {
      headingPaths[lineIndex] = headingStack.filter((value): value is string => Boolean(value))
      fence = { char: fenceMatch[1][0] as '`' | '~', length: fenceMatch[1].length }
      continue
    }

    headingPaths[lineIndex] = updateHeadingPath(headingStack, raw)
    const openMatch = raw.match(OPEN_BLOCK_RE)
    if (openMatch) {
      if (activeBlock) {
        activeBlock.isValid = false
        addDiagnostic(diagnostics, {
          code: 'task-block-nested',
          message: 'Task Block 不能嵌套；请先关闭当前块。',
          lineIndex,
          severity: 'error',
          blockId: activeBlock.id,
        })
      }
      const attrs = parseAttributes(openMatch[1])
      const id = attrs.id?.trim() || ''
      const color = attrs.color?.trim().toLowerCase()
      const block: MutableBlock = {
        id,
        name: attrs.name?.trim() || undefined,
        color: ['gray', 'blue', 'green', 'orange', 'red', 'violet'].includes(color)
          ? color as TaskBlock['color']
          : undefined,
        startLine: lineIndex,
        isValid: Boolean(id),
      }
      if (!id) {
        addDiagnostic(diagnostics, {
          code: 'task-block-missing-id',
          message: 'Task Block 必须提供唯一的 id 属性。',
          lineIndex,
          severity: 'error',
        })
      }
      blocks.push(block)
      activeBlock = block
      continue
    }

    if (CLOSE_BLOCK_RE.test(raw)) {
      if (!activeBlock) {
        addDiagnostic(diagnostics, {
          code: 'task-block-unexpected-close',
          message: '发现没有对应起始标记的 Task Block 关闭注释。',
          lineIndex,
          severity: 'error',
        })
      } else {
        activeBlock.endLine = lineIndex
        activeBlock = undefined
      }
    }
  }

  if (activeBlock) {
    activeBlock.isValid = false
    addDiagnostic(diagnostics, {
      code: 'task-block-unclosed',
      message: 'Task Block 未关闭；该块不会进入任务投影。',
      lineIndex: activeBlock.startLine,
      severity: 'error',
      blockId: activeBlock.id || undefined,
    })
  }

  const blocksById = new Map<string, MutableBlock[]>()
  for (const block of blocks) {
    if (!block.id) continue
    const same = blocksById.get(block.id) ?? []
    same.push(block)
    blocksById.set(block.id, same)
  }
  for (const [id, same] of blocksById) {
    if (same.length < 2) continue
    for (const block of same) {
      block.isValid = false
      addDiagnostic(diagnostics, {
        code: 'task-block-duplicate-id',
        message: `Task Block id “${id}” 在同一文档中重复。`,
        lineIndex: block.startLine,
        severity: 'error',
        blockId: id,
      })
    }
  }

  const tasks: Task[] = []
  for (const block of blocks) {
    if (!block.isValid || block.endLine === undefined) continue
    const hierarchy: Array<{ width: number; task: Task }> = []
    const blockTasks: Task[] = []
    let blockFence: { char: '`' | '~'; length: number } | undefined

    for (let lineIndex = block.startLine + 1; lineIndex < block.endLine; lineIndex++) {
      const rawLine = lines[lineIndex]
      const fenceMatch = rawLine.match(FENCE_RE)
      if (blockFence) {
        if (fenceMatch && fenceMatch[1][0] === blockFence.char && fenceMatch[1].length >= blockFence.length) blockFence = undefined
        continue
      }
      if (fenceMatch) {
        blockFence = { char: fenceMatch[1][0] as '`' | '~', length: fenceMatch[1].length }
        continue
      }

      const match = rawLine.match(TASK_LINE_RE)
      if (!match) continue
      const indent = match[1]
      const done = match[2].toLowerCase() === 'x'
      const body = match[3]
      const meta = parseTaskMeta(body)
      if (!meta.title) continue
      const id = meta.explicitId || simpleHash(`${block.id}:${lineIndex}:${rawLine}`)
      const task: Task = {
        id,
        explicitId: meta.explicitId,
        isWritable: Boolean(meta.explicitId),
        blockId: block.id,
        sourceRange: { startLine: lineIndex, endLine: lineIndex },
        headingPath: headingPaths[lineIndex] ?? [],
        parentId: undefined,
        childIds: [],
        depth: 0,
        title: meta.title,
        done,
        type: meta.type ?? 'task',
        date: meta.date,
        due: meta.due,
        start: meta.start,
        end: meta.end,
        priority: meta.priority,
        color: meta.color ?? block.color,
        tags: meta.tags,
        lineIndex,
        rawLine,
        indent,
      }

      for (const invalid of meta.invalidDates) {
        addDiagnostic(diagnostics, {
          code: 'task-invalid-date',
          message: `@${invalid.field}(...) 必须是有效的 LocalDate（YYYY-MM-DD）。`,
          lineIndex,
          severity: 'error',
          blockId: block.id,
          taskId: meta.explicitId,
        })
      }
      if (task.start && task.end && task.start > task.end) {
        addDiagnostic(diagnostics, {
          code: 'task-invalid-range',
          message: '@start(...) 不能晚于 @end(...)；该任务不会进入排期/甘特投影。',
          lineIndex,
          severity: 'error',
          blockId: block.id,
          taskId: meta.explicitId,
        })
      }

      const width = indentationWidth(indent)
      while (hierarchy.length && hierarchy[hierarchy.length - 1].width >= width) hierarchy.pop()
      const parent = hierarchy[hierarchy.length - 1]?.task
      if (parent) {
        task.parentId = parent.id
        task.depth = parent.depth + 1
        parent.childIds.push(task.id)
      }
      hierarchy.push({ width, task })
      blockTasks.push(task)
    }
    block._tasks = blockTasks
    tasks.push(...blockTasks)
  }

  const duplicateTaskIds = new Map<string, Task[]>()
  for (const task of tasks) {
    if (!task.explicitId) continue
    const same = duplicateTaskIds.get(task.explicitId) ?? []
    same.push(task)
    duplicateTaskIds.set(task.explicitId, same)
  }
  for (const [id, same] of duplicateTaskIds) {
    if (same.length < 2) continue
    for (const task of same) {
      task.isWritable = false
      addDiagnostic(diagnostics, {
        code: 'task-duplicate-id',
        message: `任务 id “${id}” 重复；为避免危险回写，已禁用该任务的写入。`,
        lineIndex: task.lineIndex,
        severity: 'error',
        blockId: task.blockId,
        taskId: id,
      })
    }
  }

  return { tasks, blocks, diagnostics }
}

/** Layer 2：只提取合法 Task Block 内的 checkbox。 */
export function parseTasks(markdown: string): Task[] {
  return parseTaskDocument(markdown).tasks
}

/** 日历/排期：任意有效 date、due 或执行区间任务。 */
export function parseScheduledTasks(markdown: string): Task[] {
  return parseTasks(markdown).filter((task) => hasSchedule(task))
}

/** 甘特投影：仅严格的跨日执行区间；milestone 将由后续专用投影处理。 */
export function parseGanttTasks(markdown: string): Task[] {
  return parseTasks(markdown).filter((task) => isMultiDay(task))
}

export function countTasks(markdown: string): { total: number; done: number; scheduled: number } {
  const tasks = parseTasks(markdown)
  return {
    total: tasks.length,
    done: tasks.filter((task) => task.done).length,
    scheduled: tasks.filter((task) => hasSchedule(task)).length,
  }
}