<script setup lang="ts">
import { computed, inject, ref, watch, nextTick, onMounted, onBeforeUnmount } from 'vue'
import { askPrompt } from '../composables/uiDialog'
import type { useWorkspace } from '../composables/useWorkspace'
import {
  markdownToEditableHtml,
  editableHtmlToMarkdown,
  applySourceFormat,
  applyWysiwygFormat,
  resolveEditorShortcut,
  isEditableEmpty,
  type ToolbarAction,
  type FormatAction,
} from '../core/markdownBridge'
import { newTaskId } from '../core/taskSyntax'

const ws = inject('workspace') as ReturnType<typeof useWorkspace>
const sourceText = ref('')
const sourceEl = ref<HTMLTextAreaElement | null>(null)
const wysiwygEl = ref<HTMLElement | null>(null)
const diagnosticsOpen = ref(false)
const taskBlockCount = computed(() => ws.taskBlocks.length)
const taskDiagnosticCount = computed(() => ws.taskDiagnostics.length)
let syncing = false
let applyingHistory = false

/** 笔记级内容历史：覆盖源码/所见即所得，避免 DOM 重写冲掉浏览器原生撤销 */
const HISTORY_MAX = 80
let historyStack: string[] = []
let historyIndex = -1
let historyNotePath = ''
let historyTimer: ReturnType<typeof setTimeout> | null = null

type ToolbarItem = {
  id: ToolbarAction
  label: string
  title: string
  group: 'text' | 'list' | 'insert'
  icon: 'h1' | 'bold' | 'italic' | 'list' | 'task' | 'link' | 'date'
}

const toolbarItems: ToolbarItem[] = [
  { id: 'h1', label: '标题', title: '一级标题 Ctrl+Alt+1', group: 'text', icon: 'h1' },
  { id: 'bold', label: '粗体', title: '粗体 Ctrl+B', group: 'text', icon: 'bold' },
  { id: 'italic', label: '斜体', title: '斜体 Ctrl+I', group: 'text', icon: 'italic' },
  { id: 'list', label: '列表', title: '无序列表 Ctrl+Shift+8', group: 'list', icon: 'list' },
  { id: 'task', label: '清单', title: '普通勾选清单 - [ ]（不进待办）', group: 'list', icon: 'task' },
  { id: 'link', label: '链接', title: '插入链接 Ctrl+K', group: 'insert', icon: 'link' },
  { id: 'date', label: '今日', title: '插入今天日期', group: 'insert', icon: 'date' },
]

const toolbarGroups = computed(() => {
  const order: ToolbarItem['group'][] = ['text', 'list', 'insert']
  return order
    .map((group) => ({
      group,
      items: toolbarItems.filter((item) => item.group === group),
    }))
    .filter((g) => g.items.length)
})

function resetHistory(seed: string, path: string) {
  if (historyTimer) {
    clearTimeout(historyTimer)
    historyTimer = null
  }
  historyNotePath = path
  historyStack = [seed]
  historyIndex = 0
}

function pushHistory(text: string, immediate = false) {
  if (applyingHistory) return
  if (!historyNotePath || historyNotePath !== (ws.activePath || '')) {
    resetHistory(text, ws.activePath || '')
    return
  }
  const apply = () => {
    historyTimer = null
    const tip = historyStack[historyIndex] ?? ''
    if (tip === text) return
    historyStack = historyStack.slice(0, historyIndex + 1)
    historyStack.push(text)
    if (historyStack.length > HISTORY_MAX) {
      const overflow = historyStack.length - HISTORY_MAX
      historyStack = historyStack.slice(overflow)
      historyIndex = historyStack.length - 1
    } else {
      historyIndex = historyStack.length - 1
    }
  }
  if (immediate) {
    if (historyTimer) {
      clearTimeout(historyTimer)
      historyTimer = null
    }
    apply()
    return
  }
  if (historyTimer) clearTimeout(historyTimer)
  historyTimer = setTimeout(apply, 280)
}

function applyHistorySnapshot(text: string) {
  applyingHistory = true
  syncing = true
  ws.setContent(text)
  const stamped = ws.content || text
  historyStack[historyIndex] = stamped
  sourceText.value = stamped
  nextTick(() => {
    if (ws.editorMode === 'wysiwyg' && wysiwygEl.value) {
      wysiwygEl.value.innerHTML = markdownToEditableHtml(stamped)
    }
    syncing = false
    applyingHistory = false
  })
}

function undoContent(): boolean {
  if (historyIndex <= 0) return false
  historyIndex -= 1
  applyHistorySnapshot(historyStack[historyIndex] ?? '')
  return true
}

function redoContent(): boolean {
  if (historyIndex >= historyStack.length - 1) return false
  historyIndex += 1
  applyHistorySnapshot(historyStack[historyIndex] ?? '')
  return true
}

function loadFromStore() {
  syncing = true
  const seed = ws.content || ''
  sourceText.value = seed
  resetHistory(seed, ws.activePath || '')
  nextTick(() => {
    if (wysiwygEl.value) {
      wysiwygEl.value.innerHTML = markdownToEditableHtml(seed)
    }
    syncing = false
  })
}

function commitSource() {
  if (syncing || applyingHistory) return
  ws.setContent(sourceText.value)
  pushHistory(ws.content || sourceText.value)
}

function commitWysiwyg() {
  if (syncing || applyingHistory || !wysiwygEl.value) return
  if (isEditableEmpty(wysiwygEl.value)) {
    if (wysiwygEl.value.innerHTML) wysiwygEl.value.innerHTML = ''
    ws.setContent('')
    sourceText.value = ''
    pushHistory('')
    return
  }
  const md = editableHtmlToMarkdown(wysiwygEl.value)
  ws.setContent(md)
  sourceText.value = ws.content || md
  pushHistory(ws.content || md)
}

function restoreSelection(el: HTMLTextAreaElement, start: number, end: number) {
  nextTick(() => {
    el.focus()
    el.setSelectionRange(start, end)
  })
}

function applySourceAction(action: FormatAction) {
  if (action === 'undo') {
    undoContent()
    return
  }
  if (action === 'redo') {
    redoContent()
    return
  }
  const el = sourceEl.value
  const start = el?.selectionStart ?? sourceText.value.length
  const end = el?.selectionEnd ?? sourceText.value.length
  const result = applySourceFormat(sourceText.value, start, end, action)
  sourceText.value = result.text
  commitSource()
  pushHistory(ws.content || result.text, true)
  if (el) restoreSelection(el, result.start, result.end)
}

function applyWysiwygAction(action: FormatAction) {
  if (action === 'undo') {
    // 优先走内容历史（可靠）；原生 undo 作为补充
    if (!undoContent()) {
      applyWysiwygFormat('undo', wysiwygEl.value)
      commitWysiwyg()
    }
    return
  }
  if (action === 'redo') {
    if (!redoContent()) {
      applyWysiwygFormat('redo', wysiwygEl.value)
      commitWysiwyg()
    }
    return
  }
  const root = wysiwygEl.value
  if (!root) return
  applyWysiwygFormat(action, root)
  commitWysiwyg()
  pushHistory(ws.content || '', true)
}

async function onToolbar(action: ToolbarAction) {
  if (!ws.activePath) return
  if (action === 'link' && ws.editorMode === 'wysiwyg') {
    const url = await askPrompt({
      title: '插入链接',
      message: '输入链接地址',
      defaultValue: 'https://',
      placeholder: 'https://',
      confirmText: '插入',
    })
    if (url == null) return
    const href = url.trim() || 'https://'
    const sel = window.getSelection()
    const selected = sel?.toString() || ''
    if (!selected) {
      document.execCommand('insertHTML', false, '<a href="' + href.replace(/"/g, '&quot;') + '">链接文字</a>')
    } else {
      document.execCommand('createLink', false, href)
    }
    commitWysiwyg()
    return
  }
  if (ws.editorMode === 'source') applySourceAction(action)
  else applyWysiwygAction(action)
}

function sourceOffsetAtLine(text: string, lineIndex: number): number {
  let offset = 0
  const target = Math.max(0, lineIndex)
  for (let current = 0; current < target; current += 1) {
    const nextBreak = text.indexOf('\n', offset)
    if (nextBreak < 0) return text.length
    offset = nextBreak + 1
  }
  return offset
}

function focusTaskDiagnostic(lineIndex: number) {
  ws.setEditorMode('source')
  nextTick(() => {
    const text = sourceText.value || ws.content || ''
    const start = sourceOffsetAtLine(text, lineIndex)
    const endOfLine = text.indexOf('\n', start)
    sourceEl.value?.focus()
    sourceEl.value?.setSelectionRange(start, endOfLine < 0 ? text.length : endOfLine)
  })
}

async function insertTaskBlock() {
  if (!ws.activePath) return

  // Task Block 依赖注释边界；先进入源码模式再写入，避免 WYSIWYG 往返改写注释。
  if (ws.editorMode !== 'source') {
    ws.setEditorMode('source')
    await nextTick()
  }

  const current = sourceText.value || ws.content || ''
  const editor = sourceEl.value
  const start = editor?.selectionStart ?? current.length
  const end = editor?.selectionEnd ?? start
  const blockId = `tasks-${newTaskId()}`
  const taskId = newTaskId()
  const taskTitle = '待办事项'
  const block = `<!-- mdw:tasks id="${blockId}" name="任务组" color="blue" -->\n\n## ${taskTitle}\n- [ ] ${taskTitle} @id(${taskId})\n\n<!-- /mdw:tasks -->`
  const before = current.slice(0, start)
  const after = current.slice(end)
  const prefix = before && !before.endsWith('\n') ? '\n\n' : before && !before.endsWith('\n\n') ? '\n' : ''
  const suffix = after && !after.startsWith('\n') ? '\n\n' : ''
  const next = `${before}${prefix}${block}${suffix}${after}`
  const titleOffset = block.lastIndexOf(taskTitle)

  sourceText.value = next
  ws.setContent(next)
  pushHistory(ws.content || next, true)
  await nextTick()
  const selectionStart = before.length + prefix.length + titleOffset
  sourceEl.value?.focus()
  sourceEl.value?.setSelectionRange(selectionStart, selectionStart + taskTitle.length)
}

function onInsertTaskBlock() {
  void insertTaskBlock()
}

function onWysiwygClick(e: MouseEvent) {
  const target = e.target as HTMLElement
  if (target?.matches?.('input[data-role="task-check"]')) {
    nextTick(() => commitWysiwyg())
  }
}

function handleEditorKeydown(e: KeyboardEvent) {
  const action = resolveEditorShortcut({
    key: e.key,
    code: e.code,
    ctrlKey: e.ctrlKey,
    metaKey: e.metaKey,
    shiftKey: e.shiftKey,
    altKey: e.altKey,
  })
  if (!action) return

  // 留给全局：Ctrl+S / Ctrl+N / Ctrl+1..4（标题用 Ctrl+Alt）
  e.preventDefault()
  e.stopPropagation()

  if (ws.editorMode === 'source') applySourceAction(action)
  else applyWysiwygAction(action)
}

function onSourceKeydown(e: KeyboardEvent) {
  handleEditorKeydown(e)
}

function onWysiwygKeydown(e: KeyboardEvent) {
  handleEditorKeydown(e)
}

watch(
  () => ws.editorMode,
  (mode, prev) => {
    if (mode === prev) return
    if (mode === 'source') {
      if (wysiwygEl.value) commitWysiwyg()
      sourceText.value = ws.content || ''
      nextTick(() => sourceEl.value?.focus())
    } else {
      commitSource()
      sourceText.value = ws.content || ''
      nextTick(() => {
        if (wysiwygEl.value) {
          syncing = true
          wysiwygEl.value.innerHTML = markdownToEditableHtml(ws.content || '')
          syncing = false
          wysiwygEl.value.focus()
        }
      })
    }
  }
)

watch(
  () => ws.activePath,
  () => loadFromStore()
)

watch(
  () => ws.content,
  (val) => {
    if (syncing || applyingHistory) return
    const next = typeof val === 'string' ? val : ''
    if (ws.editorMode === 'source') {
      if (sourceText.value !== next) {
        sourceText.value = next
        pushHistory(next)
      }
    } else if (wysiwygEl.value) {
      const current = isEditableEmpty(wysiwygEl.value)
        ? ''
        : editableHtmlToMarkdown(wysiwygEl.value)
      if (current.trim() !== next.trim()) {
        syncing = true
        wysiwygEl.value.innerHTML = markdownToEditableHtml(next)
        syncing = false
        pushHistory(next)
      }
    }
  }
)

onMounted(() => {
  loadFromStore()
  window.addEventListener('mdw:insert-task-block', onInsertTaskBlock)
})

onBeforeUnmount(() => {
  if (historyTimer) clearTimeout(historyTimer)
  window.removeEventListener('mdw:insert-task-block', onInsertTaskBlock)
})
</script>

<template>
  <div class="editor-view">
    <div v-if="!ws.activePath" class="empty-state onboarding editor-empty">
      <div class="empty-icon" aria-hidden="true">◇</div>
      <div class="empty-title">{{ ws.isEmptyWorkspace ? '还没有笔记' : '选择一篇笔记' }}</div>
      <p class="empty-desc">
        {{
          ws.isEmptyWorkspace
            ? '新建空白笔记开始书写。清单放进「任务组」后才会出现在待办、日历和甘特。'
            : '从左侧打开一篇，或新建空白笔记。'
        }}
      </p>
      <div class="empty-actions">
        <button type="button" class="btn-solid" @click="ws.createNote()">新建笔记</button>
        <button type="button" class="btn-ghost" @click="ws.openSampleNote()">查看示例</button>
      </div>
    </div>

    <template v-else>
      <div class="editor-toolbar" role="toolbar" aria-label="编辑工具条">
        <template v-for="(group, gIdx) in toolbarGroups" :key="group.group">
          <span v-if="gIdx > 0" class="editor-tool-sep" aria-hidden="true" />
          <button
            v-for="item in group.items"
            :key="item.id"
            type="button"
            class="editor-tool-btn is-icon"
            :title="item.title"
            :aria-label="item.title"
            @mousedown.prevent
            @click="onToolbar(item.id)"
          >
            <svg v-if="item.icon === 'h1'" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 5v14M13 5v14M5 12h8M17 12v7M17 8.5V7" stroke="currentColor" stroke-width="1.8" fill="none" stroke-linecap="round" /></svg>
            <svg v-else-if="item.icon === 'bold'" viewBox="0 0 24 24" aria-hidden="true"><path d="M7 5h6.2a3.8 3.8 0 0 1 0 7.6H7V5Zm0 7.6h7.2A3.9 3.9 0 0 1 14.2 20H7v-7.4Z" fill="currentColor" /></svg>
            <svg v-else-if="item.icon === 'italic'" viewBox="0 0 24 24" aria-hidden="true"><path d="M11 5h8M5 19h8M14.5 5 9.5 19" stroke="currentColor" stroke-width="1.8" fill="none" stroke-linecap="round" /></svg>
            <svg v-else-if="item.icon === 'list'" viewBox="0 0 24 24" aria-hidden="true"><path d="M9 7h11M9 12h11M9 17h11M5 7h.01M5 12h.01M5 17h.01" stroke="currentColor" stroke-width="1.8" fill="none" stroke-linecap="round" /></svg>
            <svg v-else-if="item.icon === 'task'" viewBox="0 0 24 24" aria-hidden="true"><path d="M5.5 6.5h13v11h-13z" stroke="currentColor" stroke-width="1.6" fill="none" /><path d="m8.2 12.1 2.2 2.2 5-5" stroke="currentColor" stroke-width="1.8" fill="none" stroke-linecap="round" stroke-linejoin="round" /></svg>
            <svg v-else-if="item.icon === 'link'" viewBox="0 0 24 24" aria-hidden="true"><path d="M10 13.5a4 4 0 0 0 5.7.3l2.5-2.5a4 4 0 1 0-5.7-5.7l-1.3 1.3M14 10.5a4 4 0 0 0-5.7-.3l-2.5 2.5a4 4 0 1 0 5.7 5.7l1.2-1.2" stroke="currentColor" stroke-width="1.6" fill="none" stroke-linecap="round" /></svg>
            <svg v-else viewBox="0 0 24 24" aria-hidden="true"><path d="M7 4v3M17 4v3M5 9h14M6.5 6.5h11A1.5 1.5 0 0 1 19 8v11a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 5 19V8A1.5 1.5 0 0 1 6.5 6.5Z" stroke="currentColor" stroke-width="1.6" fill="none" stroke-linecap="round" /><path d="M9 14h2v4H9z" fill="currentColor" /></svg>
          </button>
        </template>
        <span class="editor-tool-sep" aria-hidden="true" />
        <button
          type="button"
          class="editor-tool-btn editor-tool-block"
          title="插入任务组（可进待办/甘特/日历）Ctrl+Alt+T"
          aria-label="插入任务组 Ctrl+Alt+T"
          @mousedown.prevent
          @click="insertTaskBlock"
        >
          任务组
        </button>
        <span class="editor-tool-sep" aria-hidden="true" />
        <button
          type="button"
          class="editor-tool-btn is-icon"
          title="撤销 Ctrl+Z"
          aria-label="撤销 Ctrl+Z"
          @mousedown.prevent
          @click="ws.editorMode === 'source' ? applySourceAction('undo') : applyWysiwygAction('undo')"
        >
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 8H4v4M4.5 12A7.5 7.5 0 1 0 7 6.4" stroke="currentColor" stroke-width="1.7" fill="none" stroke-linecap="round" stroke-linejoin="round" /></svg>
        </button>
        <button
          type="button"
          class="editor-tool-btn is-icon"
          title="重做 Ctrl+Y"
          aria-label="重做 Ctrl+Y"
          @mousedown.prevent
          @click="ws.editorMode === 'source' ? applySourceAction('redo') : applyWysiwygAction('redo')"
        >
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M16 8h4v4M19.5 12A7.5 7.5 0 1 1 17 6.4" stroke="currentColor" stroke-width="1.7" fill="none" stroke-linecap="round" stroke-linejoin="round" /></svg>
        </button>
      </div>

      <section
        v-if="taskDiagnosticCount > 0"
        class="task-block-status"
        aria-label="任务问题"
      >
        <div class="task-block-status-summary">
          <span class="has-diagnostics">{{ taskDiagnosticCount }} 个问题</span>
          <span v-if="taskBlockCount" class="task-block-meta">任务组 {{ taskBlockCount }}</span>
        </div>
        <button
          type="button"
          class="task-diagnostic-toggle"
          :aria-expanded="diagnosticsOpen"
          @click="diagnosticsOpen = !diagnosticsOpen"
        >
          {{ diagnosticsOpen ? '收起' : '查看' }}
        </button>
        <div v-if="diagnosticsOpen" class="task-diagnostic-list" role="list">
          <button
            v-for="diagnostic in ws.taskDiagnostics"
            :key="`${diagnostic.code}-${diagnostic.lineIndex}-${diagnostic.taskId || diagnostic.blockId || ''}`"
            type="button"
            class="task-diagnostic-item"
            :class="`is-${diagnostic.severity}`"
            role="listitem"
            @click="focusTaskDiagnostic(diagnostic.lineIndex)"
          >
            <span class="task-diagnostic-line">第 {{ diagnostic.lineIndex + 1 }} 行</span>
            <span>{{ diagnostic.message }}</span>
          </button>
        </div>
      </section>

      <textarea
        v-if="ws.editorMode === 'source'"
        ref="sourceEl"
        v-model="sourceText"
        class="source-editor"
        spellcheck="false"
        placeholder="开始书写…"
        wrap="off"
        @input="commitSource"
        @keydown="onSourceKeydown"
      />
      <div
        v-else
        ref="wysiwygEl"
        class="wysiwyg-editor md-body"
        contenteditable="true"
        data-placeholder="开始书写…"
        @input="commitWysiwyg"
        @click="onWysiwygClick"
        @keydown="onWysiwygKeydown"
        @blur="commitWysiwyg"
      />
    </template>
  </div>
</template>
