import { marked } from 'marked'
import TurndownService from 'turndown'
import { TASK_LINE_RE, stripMeta } from './taskSyntax'
import { parseTaskDocument } from './parseTasks'

/**
 * 所见即所得 ⟷ 源码桥接
 * 任务行用 data-* 保留元数据，降低往返丢失。
 */

marked.setOptions({ gfm: true, breaks: false })

/** 工具条历史动作（兼容） */
export type ToolbarAction = 'h1' | 'h2' | 'bold' | 'italic' | 'list' | 'task' | 'link' | 'date' | 'code' | 'codeBlock' | 'quote' | 'ol' | 'strikethrough'

/** 编辑器格式 / 快捷键动作 */
export type FormatAction =
  | ToolbarAction
  | 'italic'
  | 'underline'
  | 'strikethrough'
  | 'code'
  | 'codeBlock'
  | 'quote'
  | 'link'
  | 'h2'
  | 'h3'
  | 'h4'
  | 'h5'
  | 'h6'
  | 'ul'
  | 'ol'
  | 'toggleTask'
  | 'tab'
  | 'shiftTab'
  | 'undo'
  | 'redo'

export interface SourceEditResult {
  text: string
  start: number
  end: number
}

/** 用于纯函数匹配快捷键（可测） */
export interface ShortcutInput {
  key: string
  code?: string
  ctrlKey?: boolean
  metaKey?: boolean
  shiftKey?: boolean
  altKey?: boolean
}

/**
 * Markdown 预览只允许静态 HTML。此处为依赖最小、可在核心测试运行的防线；
 * 源码模式不会改写原文。复杂嵌入应在源码模式查看或编辑。
 */
export function sanitizeRenderedHtml(html: string): string {
  let safe = String(html || '')

  // 整段删除高风险元素，包含其内容，避免标签移除后脚本文本仍被浏览器解释。
  safe = safe.replace(/<(script|style|iframe|object|embed|form|input|button|svg|math)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, '')
  safe = safe.replace(/<\/?(?:script|style|iframe|object|embed|form|input|button|svg|math)\b[^>]*>/gi, '')
  // 所有事件处理器、内联样式均移除。
  safe = safe.replace(/\s+on[a-z]*\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, '')
  safe = safe.replace(/\s+style\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, '')

  // 多属性检测：先解码实体、再删除控制字符，防止实体编码及实体字符绕过。
  safe = safe.replace(/\s(href|src|xlink:href)\s*=\s*(["']?)([^<"'\s>]+)\2/gi, (full, name: string, quote: string, value: string) => {
    const normalized = value
      .replace(/&#x([0-9a-f]+);?/gi, (_m, hex: string) => String.fromCharCode(parseInt(hex, 16)))
      .replace(/&#([0-9]+);?/g, (_m, dec: string) => String.fromCharCode(Number(dec)))
      .replace(/[\u0000-\u0032\u007f\s]/g, '')
      .trim()
    if (/^(?:javascript|data):/i.test(normalized)) return ''
    return ` ${name}=${quote}${value}${quote}`
  })
  return safe
}
function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function buildMetaParts(body: string): string[] {
  const meta = stripMeta(body)
  const parts: string[] = []
  if (meta.date) parts.push(`@date(${meta.date})`)
  if (meta.start) parts.push(`@start(${meta.start})`)
  if (meta.end) parts.push(`@end(${meta.end})`)
  if (meta.due) parts.push(`@due(${meta.due})`)
  if (meta.type && meta.type !== 'task') parts.push(`@type(${meta.type})`)
  if (meta.priority) parts.push(`@priority(${meta.priority})`)
  if (meta.color) parts.push(`@color(${meta.color})`)
  if (meta.explicitId) parts.push(`@id(${meta.explicitId})`)
  for (const t of meta.tags) parts.push(`#${t}`)
  return parts
}

/** 本地时区 YYYY-MM-DD */
export function formatToday(date: Date = new Date()): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

function replaceRange(
  text: string,
  start: number,
  end: number,
  insert: string,
  selectAll = true
): SourceEditResult {
  const next = text.slice(0, start) + insert + text.slice(end)
  if (selectAll) {
    return { text: next, start, end: start + insert.length }
  }
  const caret = start + insert.length
  return { text: next, start: caret, end: caret }
}

function lineBounds(text: string, start: number, end: number): { lineStart: number; lineEnd: number } {
  let lineStart = text.lastIndexOf('\n', Math.max(0, start - 1)) + 1
  if (start === 0) lineStart = 0
  let lineEnd = text.indexOf('\n', end)
  if (lineEnd < 0) lineEnd = text.length
  return { lineStart, lineEnd }
}

function prefixSelectedLines(
  text: string,
  start: number,
  end: number,
  transform: (line: string) => string
): SourceEditResult {
  const { lineStart, lineEnd } = lineBounds(text, start, end)
  const block = text.slice(lineStart, lineEnd)
  const lines = block.split('\n')
  const nextBlock = lines.map(transform).join('\n')
  const next = text.slice(0, lineStart) + nextBlock + text.slice(lineEnd)
  return {
    text: next,
    start: lineStart,
    end: lineStart + nextBlock.length,
  }
}

function isHeadingLine(line: string): boolean {
  return /^#{1,6}\s+/.test(line)
}

function isListLikeLine(line: string): boolean {
  return TASK_LINE_RE.test(line) || /^\s*([-*+]|\d+\.)\s+/.test(line)
}


function ensureHeading(line: string, level: number): string {
  const lv = Math.max(1, Math.min(6, level))
  const bare = line
    .replace(/^\s*#{1,6}\s+/, '')
    .replace(/^\s*[-*+]\s+(\[[ xX]\]\s+)?/, '')
    .replace(/^\s*\d+\.\s+/, '')
    .trim()
  const placeholders = ['一级标题', '二级标题', '三级标题', '四级标题', '五级标题', '六级标题']
  return `${'#'.repeat(lv)} ${bare || placeholders[lv - 1]}`
}

/** 标题循环：H1→…→H6→正文；反向相反 */
function cycleHeadingLine(line: string, reverse: boolean): string {
  const m = line.match(/^(#{1,6})\s+(.*)$/)
  if (!m) {
    if (reverse) return line
    return ensureHeading(line, 1)
  }
  const level = m[1].length
  const body = m[2]
  if (!reverse) {
    if (level >= 6) return body
    return `${'#'.repeat(level + 1)} ${body}`
  }
  if (level <= 1) return body
  return `${'#'.repeat(level - 1)} ${body}`
}

function indentLine(line: string): string {
  return `  ${line}`
}

function outdentLine(line: string): string {
  if (line.startsWith('  ')) return line.slice(2)
  if (line.startsWith('\t')) return line.slice(1)
  if (line.startsWith(' ')) return line.slice(1)
  return line
}

function ensureBullet(line: string): string {
  if (TASK_LINE_RE.test(line)) return line
  if (/^\s*\d+\.\s+/.test(line)) {
    return line.replace(/^(\s*)\d+\.\s+/, '$1- ')
  }
  if (/^\s*[-*+]\s+/.test(line)) {
    return line.replace(/^(\s*)[*+]\s+/, '$1- ')
  }
  const indent = (line.match(/^\s*/) || [''])[0]
  const body = line.replace(/^\s*#{1,6}\s+/, '').trim() || '列表项'
  return `${indent}- ${body}`
}

function ensureOrdered(line: string): string {
  if (TASK_LINE_RE.test(line)) return line
  if (/^\s*\d+\.\s+/.test(line)) return line
  if (/^\s*[-*+]\s+/.test(line)) {
    return line.replace(/^(\s*)[-*+]\s+/, '$11. ')
  }
  const indent = (line.match(/^\s*/) || [''])[0]
  const body = line.replace(/^\s*#{1,6}\s+/, '').trim() || '列表项'
  return `${indent}1. ${body}`
}

function ensureTask(line: string): string {
  if (TASK_LINE_RE.test(line)) return line
  const indent = (line.match(/^\s*/) || [''])[0]
  const stripped = line
    .replace(/^\s*[-*+]\s+/, '')
    .replace(/^\s*\d+\.\s+/, '')
    .replace(/^\s*#{1,6}\s+/, '')
    .trim()
  return `${indent}- [ ] ${stripped || '新任务'}`
}

function toggleTaskLine(line: string): string {
  const m = line.match(TASK_LINE_RE)
  if (m) {
    const done = m[2].toLowerCase() === 'x'
    return `${m[1]}- [${done ? ' ' : 'x'}] ${m[3]}`
  }
  return ensureTask(line)
}

function looksLikeUrl(s: string): boolean {
  return /^(https?:\/\/|mailto:|www\.)\S+$/i.test(s.trim())
}

/**
 * 行内包裹；已包裹则解除。无选区时用占位并选中占位文本。
 */
function wrapInline(
  text: string,
  start: number,
  end: number,
  open: string,
  close: string,
  placeholder: string
): SourceEditResult {
  const s = Math.max(0, Math.min(start, text.length))
  const e = Math.max(s, Math.min(end, text.length))
  const selected = text.slice(s, e)

  // 选区本身含标记
  if (
    selected.startsWith(open) &&
    selected.endsWith(close) &&
    selected.length >= open.length + close.length
  ) {
    const inner = selected.slice(open.length, selected.length - close.length)
    return replaceRange(text, s, e, inner)
  }

  // 选区外侧紧贴标记
  if (s >= open.length && e + close.length <= text.length) {
    const before = text.slice(s - open.length, s)
    const after = text.slice(e, e + close.length)
    if (before === open && after === close) {
      const next = text.slice(0, s - open.length) + selected + text.slice(e + close.length)
      return {
        text: next,
        start: s - open.length,
        end: s - open.length + selected.length,
      }
    }
  }

  const inner = selected || placeholder
  const insert = `${open}${inner}${close}`
  const next = text.slice(0, s) + insert + text.slice(e)
  if (!selected) {
    return {
      text: next,
      start: s + open.length,
      end: s + open.length + inner.length,
    }
  }
  return { text: next, start: s, end: s + insert.length }
}

function applyLink(text: string, start: number, end: number): SourceEditResult {
  const s = Math.max(0, Math.min(start, text.length))
  const e = Math.max(s, Math.min(end, text.length))
  const selected = text.slice(s, e)

  // 已是 [text](url) 整段选中 → 解开为 text
  const full = selected.match(/^\[([^\]]*)\]\(([^)]*)\)$/)
  if (full) {
    return replaceRange(text, s, e, full[1])
  }

  let label: string
  let url: string
  if (!selected) {
    label = '链接文字'
    url = 'https://'
  } else if (looksLikeUrl(selected)) {
    label = '链接文字'
    url = selected.trim()
  } else {
    label = selected
    url = 'https://'
  }
  const insert = `[${label}](${url})`
  const next = text.slice(0, s) + insert + text.slice(e)
  // 选中 URL 便于继续编辑
  const urlStart = s + label.length + 3 // [label](
  return { text: next, start: urlStart, end: urlStart + url.length }
}

function applySourceTab(
  text: string,
  start: number,
  end: number,
  reverse: boolean
): SourceEditResult {
  const s = Math.max(0, Math.min(start, text.length))
  const e = Math.max(s, Math.min(end, text.length))
  const { lineStart, lineEnd } = lineBounds(text, s, e)
  const block = text.slice(lineStart, lineEnd)
  const lines = block.split('\n')
  const multiLine = lines.length > 1
  const hasSelection = s !== e

  const special = lines.some((line) => isHeadingLine(line) || isListLikeLine(line))

  if (special || multiLine || hasSelection) {
    return prefixSelectedLines(text, s, e, (line) => {
      if (isHeadingLine(line)) return cycleHeadingLine(line, reverse)
      if (isListLikeLine(line)) return reverse ? outdentLine(line) : indentLine(line)
      // 多行纯文本：整体缩进
      return reverse ? outdentLine(line) : indentLine(line)
    })
  }

  // 单行正文、无选区：插入/删除两个空格
  if (reverse) {
    const before = text.slice(lineStart, s)
    if (before.endsWith('  ')) {
      const next = text.slice(0, s - 2) + text.slice(e)
      return { text: next, start: s - 2, end: s - 2 }
    }
    if (before.endsWith(' ') || before.endsWith('\t')) {
      const next = text.slice(0, s - 1) + text.slice(e)
      return { text: next, start: s - 1, end: s - 1 }
    }
    return { text, start: s, end: e }
  }

  return replaceRange(text, s, e, '  ', false)
}

/**
 * 解析编辑器快捷键。
 * 注意：标题用 Ctrl+Alt+1..6，避免与全局 Ctrl+1..4 视图切换冲突。
 */
export function resolveEditorShortcut(e: ShortcutInput): FormatAction | null {
  const mod = Boolean(e.ctrlKey || e.metaKey)
  const shift = Boolean(e.shiftKey)
  const alt = Boolean(e.altKey)
  const key = (e.key || '').toLowerCase()
  const code = e.code || ''

  // Tab / Shift+Tab（不要求 Ctrl）
  if (!mod && !alt && (key === 'tab' || code === 'Tab')) {
    return shift ? 'shiftTab' : 'tab'
  }

  if (!mod) return null

  // Ctrl+Z 撤销；Ctrl+Y / Ctrl+Shift+Z 重做
  if (!alt && (key === 'z' || code === 'KeyZ')) {
    return shift ? 'redo' : 'undo'
  }
  if (!alt && !shift && (key === 'y' || code === 'KeyY')) {
    return 'redo'
  }

  // Ctrl+Enter 切换任务勾选
  if (!shift && !alt && (key === 'enter' || code === 'Enter')) {
    return 'toggleTask'
  }

  // Ctrl+Alt+1..6 标题（避开全局 Ctrl+1..4）
  if (alt && !shift) {
    const fromCode = code.match(/^Digit([1-6])$/)
    const fromKey = key.match(/^([1-6])$/)
    const n = fromCode?.[1] || fromKey?.[1]
    if (n) return (`h${n}` as FormatAction)
  }

  // 以下动作不带 Alt，避免误触
  if (alt) return null

  if (!shift) {
    if (key === 'b' || code === 'KeyB') return 'bold'
    if (key === 'i' || code === 'KeyI') return 'italic'
    if (key === 'u' || code === 'KeyU') return 'underline'
    if (key === 'k' || code === 'KeyK') return 'link'
    return null
  }

  // Ctrl+Shift+*
  if (key === 'x' || code === 'KeyX') return 'strikethrough'
  if (key === '`' || code === 'Backquote') return 'code'
  if (key === 'c' || code === 'KeyC') return 'codeBlock'
  if (key === '.' || code === 'Period') return 'quote'
  if (key === 't' || code === 'KeyT') return 'toggleTask'
  // Ctrl+Shift+8 无序；部分键盘 Shift+8 产生 *
  if (code === 'Digit8' || key === '8' || key === '*') return 'ul'
  // Ctrl+Shift+9 有序；部分键盘 Shift+9 产生 (
  if (code === 'Digit9' || key === '9' || key === '(') return 'ol'

  return null
}

/** 源码模式：按选区应用格式 / 快捷键动作 */
export function applySourceFormat(
  text: string,
  start: number,
  end: number,
  action: FormatAction
): SourceEditResult {
  const s = Math.max(0, Math.min(start, text.length))
  const e = Math.max(s, Math.min(end, text.length))
  const selected = text.slice(s, e)

  switch (action) {
    case 'bold':
      return wrapInline(text, s, e, '**', '**', '粗体文本')
    case 'italic':
      return wrapInline(text, s, e, '*', '*', '斜体文本')
    case 'underline':
      return wrapInline(text, s, e, '<u>', '</u>', '下划线文本')
    case 'strikethrough':
      return wrapInline(text, s, e, '~~', '~~', '删除线文本')
    case 'code':
      return wrapInline(text, s, e, '`', '`', 'code')
    case 'codeBlock': {
      const body = selected || 'code'
      const block = '```\n' + body + '\n```'
      return replaceRange(text, s, e, block)
    }
    case 'quote':
      return prefixSelectedLines(text, s, e, (line) => {
        const trimmed = line.replace(/^\s+/, '')
        if (trimmed.startsWith('> ')) return line
        const indent = line.match(/^(\s*)/)?.[1] || ''
        return indent + '> ' + trimmed
      })
    case 'link':
      return applyLink(text, s, e)
    case 'h1':
      return prefixSelectedLines(text, s, e, (line) => ensureHeading(line, 1))
    case 'h2':
      return prefixSelectedLines(text, s, e, (line) => ensureHeading(line, 2))
    case 'h3':
      return prefixSelectedLines(text, s, e, (line) => ensureHeading(line, 3))
    case 'h4':
      return prefixSelectedLines(text, s, e, (line) => ensureHeading(line, 4))
    case 'h5':
      return prefixSelectedLines(text, s, e, (line) => ensureHeading(line, 5))
    case 'h6':
      return prefixSelectedLines(text, s, e, (line) => ensureHeading(line, 6))
    case 'list':
    case 'ul':
      return prefixSelectedLines(text, s, e, ensureBullet)
    case 'ol':
      return prefixSelectedLines(text, s, e, ensureOrdered)
    case 'task':
      return prefixSelectedLines(text, s, e, ensureTask)
    case 'toggleTask':
      return prefixSelectedLines(text, s, e, toggleTaskLine)
    case 'tab':
      return applySourceTab(text, s, e, false)
    case 'shiftTab':
      return applySourceTab(text, s, e, true)
    case 'date': {
      const date = formatToday()
      if (selected) {
        const gap = selected.endsWith(' ') ? '' : ' '
        return replaceRange(text, s, e, `${selected}${gap}${date}`)
      }
      return replaceRange(text, s, e, date, false)
    }
    default:
      return { text, start: s, end: e }
  }
}

/** 源码模式工具条：按选区改写 Markdown（兼容旧 API） */
export function applySourceToolbar(
  text: string,
  start: number,
  end: number,
  action: ToolbarAction
): SourceEditResult {
  return applySourceFormat(text, start, end, action)
}

/** Markdown → 可编辑 HTML */
export function markdownToEditableHtml(markdown: string): string {
  if (!markdown || !markdown.trim()) return ''

  const lines = markdown.split(/\r?\n/)
  // 只有解析器认定为合法 Task Block 中的行才升级为互动任务组件。
  // 未闭合、嵌套、重复 block id 或代码围栏中的 checkbox 均保持普通 Markdown。
  const validTaskLines = new Set(parseTaskDocument(markdown).tasks.map((task) => task.lineIndex))
  const out: string[] = []
  let i = 0
  let buffer: string[] = []
  let taskBlockDepth = 0
  let inFencedCodeBlock = false

  const flushBuffer = () => {
    if (!buffer.length) return
    out.push(sanitizeRenderedHtml(marked.parse(buffer.join('\n'), { async: false }) as string))
    buffer = []
  }

  while (i < lines.length) {
    const line = lines[i]
    // Task Block comments inside fenced code are examples, not managed syntax.
    // Keep them in the regular Markdown buffer instead of creating task UI markers.
    if (/^\s*(?:`{3,}|~{3,})/.test(line)) {
      inFencedCodeBlock = !inFencedCodeBlock
      buffer.push(line)
      i += 1
      continue
    }

    const opensTaskBlock = !inFencedCodeBlock && /^\s*<!--\s*mdw:tasks\b/i.test(line)
    const closesTaskBlock = !inFencedCodeBlock && /^\s*<!--\s*\/mdw:tasks\s*-->/i.test(line)

    // Markdown HTML comments do not survive a marked -> Turndown round trip. Keep
    // Task Block boundaries as explicit non-editable markers so switching editor
    // modes cannot silently turn projected tasks back into ordinary checkboxes.
    if (opensTaskBlock || closesTaskBlock) {
      flushBuffer()
      // \u6807\u7b7e\u4fdd\u6301\u6781\u77ed\uff1a\u907f\u514d\u6392\u7248\u9762\u88ab\u300c\u4efb\u52a1\u5757\u5f00\u59cb/\u7ed3\u675f\u300d\u957f\u6587\u6848\u6df9\u6ca1\uff1b\u5b8c\u6574\u6ce8\u91ca\u5728 data-mdw-source\u3002
      out.push(
        `<div class="task-block-boundary" contenteditable="false" data-mdw-task-boundary="${opensTaskBlock ? 'open' : 'close'}" data-mdw-source="${escapeHtml(line)}" title="${escapeHtml(line)}" aria-label="${opensTaskBlock ? '任务组开始' : '任务组结束'}">` +
          `<span class="task-block-boundary-label" aria-hidden="true"></span>` +
        `</div>`
      )
      if (opensTaskBlock) taskBlockDepth += 1
      if (closesTaskBlock) taskBlockDepth = Math.max(0, taskBlockDepth - 1)
      i += 1
      continue
    }

    const m = line.match(TASK_LINE_RE)
    if (m && taskBlockDepth === 1 && validTaskLines.has(i)) {
      flushBuffer()
      out.push('<div class="task-list" contenteditable="false">')
      while (i < lines.length) {
        const lm = lines[i].match(TASK_LINE_RE)
        if (!lm || !validTaskLines.has(i)) break
        const indent = lm[1]
        const done = lm[2].toLowerCase() === 'x'
        const body = lm[3]
        const meta = stripMeta(body)
        const metaParts = buildMetaParts(body)
        // 用 div 而非 li：contenteditable 下浏览器常把相邻 li 合并成一条
        out.push(
          `<div class="task-item" contenteditable="false" data-task="${done ? 'done' : 'todo'}" data-title="${escapeHtml(meta.title)}" data-meta="${escapeHtml(metaParts.join(' '))}" data-indent="${escapeHtml(indent)}">` +
            `<div class="task-row">` +
            `<input type="checkbox" ${done ? 'checked' : ''} data-role="task-check" contenteditable="false" />` +
            `<span class="task-title" contenteditable="true">${escapeHtml(meta.title) || '新任务'}</span>` +
            `</div>` +
            (metaParts.length
              ? `<span class="task-meta" contenteditable="false" hidden>${escapeHtml(metaParts.join(' '))}</span>`
              : '') +
            `</div>`
        )
        i += 1
      }
      out.push('</div>')
      continue
    }
    buffer.push(line)
    if (closesTaskBlock) taskBlockDepth = Math.max(0, taskBlockDepth - 1)
    i += 1
  }
  flushBuffer()
  return out.join('\n')
}

/** contenteditable 根 → Markdown（尽量保真，空内容返回空串） */
export function editableHtmlToMarkdown(root: HTMLElement): string {
  const clone = root.cloneNode(true) as HTMLElement

  clone.querySelectorAll('div.task-list, ul.task-list').forEach((listEl) => {
    const lines: string[] = []
    listEl.querySelectorAll('.task-item').forEach((node) => {
      const el = node as HTMLElement
      const checkbox = el.querySelector('input[type="checkbox"]') as HTMLInputElement | null
      const done = checkbox ? checkbox.checked : el.getAttribute('data-task') === 'done'
      const titleEl = el.querySelector('.task-title')
      // 只用标题节点文本，避免 meta 混进 title；若浏览器已污染则回退 data-title
      let title = (titleEl?.textContent || '').replace(/\s+/g, ' ').trim()
      const dataTitle = (el.getAttribute('data-title') || '').trim()
      if (!title || (dataTitle && title.includes(dataTitle) === false && title.length > dataTitle.length + 8)) {
        // 标题被合并污染时优先 data-title
        title = dataTitle || title
      }
      if (!title) title = dataTitle || '新任务'
      const meta = el.getAttribute('data-meta') || ''
      const indent = el.getAttribute('data-indent') || ''
      el.setAttribute('data-title', title)
      lines.push(`${indent}- [${done ? 'x' : ' '}] ${title}${meta ? ' ' + meta : ''}`)
    })
    const holder = document.createElement('div')
    holder.setAttribute('data-task-block', '1')
    holder.textContent = lines.join('\n')
    listEl.replaceWith(holder)
  })

  const turndown = new TurndownService({
    headingStyle: 'atx',
    codeBlockStyle: 'fenced',
    bulletListMarker: '-',
  })

  turndown.addRule('taskBlock', {
    filter: (node) =>
      node.nodeName === 'DIV' && (node as HTMLElement).getAttribute('data-task-block') === '1',
    replacement: (_content, node) => '\n' + ((node as HTMLElement).textContent || '') + '\n\n',
  })

  turndown.addRule('taskBlockBoundary', {
    filter: (node) =>
      node.nodeName === 'DIV' && Boolean((node as HTMLElement).getAttribute('data-mdw-task-boundary')),
    replacement: (_content, node) => '\n' + ((node as HTMLElement).getAttribute('data-mdw-source') || '') + '\n\n',
  })

  // 保留 <u> 下划线
  turndown.addRule('underline', {
    filter: (node) => {
      const el = node as HTMLElement
      return (
        node.nodeName === 'U' ||
        (node.nodeName === 'SPAN' && /underline/i.test(el.style?.textDecoration || ''))
      )
    },
    replacement: (content) => `<u>${content}</u>`,
  })

  const raw = (clone.innerHTML || '').replace(/<br\s*\/?>/gi, '\n').trim()
  if (!raw) return ''

  const md = turndown.turndown(clone.innerHTML)
  const normalized = md.replace(/\n{3,}/g, '\n\n').replace(/[ \t]+\n/g, '\n').trim()
  return normalized ? normalized + '\n' : ''
}

/** 判断 contenteditable 是否视觉上为空 */
export function isEditableEmpty(root: HTMLElement | null): boolean {
  if (!root) return true
  const text = (root.textContent || '').replace(/\u00a0/g, ' ').trim()
  if (text) return false
  const html = (root.innerHTML || '')
    .replace(/<br\s*\/?>/gi, '')
    .replace(/&nbsp;/gi, '')
    .replace(/\s+/g, '')
  return html === '' || html === '<div></div>' || html === '<p></p>'
}

/** 新建任务行 HTML（所见即所得插入用） */
export function buildTaskItemHtml(title = '新任务'): string {
  const t = escapeHtml(title)
  return (
    `<div class="task-list" contenteditable="false">` +
    `<div class="task-item" contenteditable="false" data-task="todo" data-title="${t}" data-meta="" data-indent="">` +
    `<div class="task-row">` +
    `<input type="checkbox" data-role="task-check" contenteditable="false" />` +
    `<span class="task-title" contenteditable="true">${t}</span>` +
    `</div>` +
    `</div>` +
    `</div>`
  )
}

/** 所见即所得：在当前选区应用格式动作（依赖 document.execCommand） */
export function applyWysiwygFormat(action: FormatAction, root?: HTMLElement | null): boolean {
  if (root) root.focus()

  switch (action) {
    case 'undo':
      return document.execCommand('undo')
    case 'redo':
      return document.execCommand('redo')
    case 'bold':
      return document.execCommand('bold')
    case 'italic':
      return document.execCommand('italic')
    case 'underline':
      return document.execCommand('underline')
    case 'strikethrough':
      return document.execCommand('strikeThrough')
    case 'code': {
      const sel = window.getSelection()
      const text = sel?.toString() || 'code'
      return document.execCommand('insertHTML', false, `<code>${escapeHtml(text)}</code>`)
    }
    case 'codeBlock': {
      const sel = window.getSelection()
      const text = sel?.toString() || 'code'
      return document.execCommand(
        'insertHTML',
        false,
        `<pre><code>${escapeHtml(text)}</code></pre><p><br></p>`
      )
    }
    case 'quote':
      return document.execCommand('formatBlock', false, 'blockquote')
    case 'link': {
      const sel = window.getSelection()
      const selected = sel?.toString() || ''
      let url = 'https://'
      if (looksLikeUrl(selected)) url = selected.trim()
      else {
        // 无原生 prompt：保持默认 url 或已识别的选中文本
      }
      if (!selected) {
        return document.execCommand(
          'insertHTML',
          false,
          `<a href="${escapeHtml(url)}">链接文字</a>`
        )
      }
      return document.execCommand('createLink', false, url)
    }
    case 'h1':
    case 'h2':
    case 'h3':
    case 'h4':
    case 'h5':
    case 'h6':
      return document.execCommand('formatBlock', false, action)
    case 'list':
    case 'ul':
      return document.execCommand('insertUnorderedList')
    case 'ol':
      return document.execCommand('insertOrderedList')
    case 'task':
      return document.execCommand('insertHTML', false, buildTaskItemHtml('新任务'))
    case 'toggleTask': {
      const sel = window.getSelection()
      if (!sel || !sel.anchorNode) return false
      let node: Node | null = sel.anchorNode
      let taskItem: HTMLElement | null = null
      while (node && node !== root) {
        if (node instanceof HTMLElement && node.classList.contains('task-item')) {
          taskItem = node
          break
        }
        node = node.parentNode
      }
      if (!taskItem) {
        return document.execCommand('insertHTML', false, buildTaskItemHtml('新任务'))
      }
      const checkbox = taskItem.querySelector(
        'input[type="checkbox"]'
      ) as HTMLInputElement | null
      if (checkbox) {
        checkbox.checked = !checkbox.checked
        taskItem.setAttribute('data-task', checkbox.checked ? 'done' : 'todo')
        return true
      }
      return false
    }
    case 'tab':
      return document.execCommand('indent')
    case 'shiftTab':
      return document.execCommand('outdent')
    case 'date':
      return document.execCommand('insertText', false, formatToday())
    default:
      return false
  }
}

