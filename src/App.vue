<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, provide, ref } from 'vue'
import { useWorkspace } from './composables/useWorkspace'
import { useUiDialogState } from './composables/uiDialog'
import type { AppView } from './core/types'
import NoteSidebar from './components/NoteSidebar.vue'
import TopBar from './components/TopBar.vue'
import ConfirmDialog from './components/ConfirmDialog.vue'
import PromptDialog from './components/PromptDialog.vue'
import EditorView from './views/EditorView.vue'
import TodoView from './views/TodoView.vue'
import GanttView from './views/GanttView.vue'
import CalendarView from './views/CalendarView.vue'

const ws = useWorkspace()
provide('workspace', ws)

const ui = useUiDialogState()
/** 默认打开笔记库：插件窗体偏窄时也要能看到多笔记列表 */
const libraryOpen = ref(true)
const mobileLibraryToggle = ref<HTMLButtonElement | null>(null)

const viewMeta: {
  id: AppView
  label: string
  title: string
  icon: 'editor' | 'todo' | 'gantt' | 'calendar'
}[] = [
  { id: 'editor', label: '笔记', title: '笔记（Ctrl+1）', icon: 'editor' },
  { id: 'todo', label: '待办', title: '待办（Ctrl+2）', icon: 'todo' },
  { id: 'gantt', label: '甘特', title: '甘特（Ctrl+3）', icon: 'gantt' },
  { id: 'calendar', label: '日历', title: '日历（Ctrl+4）', icon: 'calendar' },
]

const viewLabels = computed(() =>
  Object.fromEntries(viewMeta.map((v) => [v.id, v.label])) as Record<AppView, string>
)

const workspaceState = computed(() => {
  if (ws.saving) return '保存中…'
  if (ws.saveError || ws.status === '保存失败') return '保存失败'
  if (ws.dirty) return '未保存'
  if (ws.activePath) return '已保存'
  return ''
})

function applyPluginHeight() {
  try {
    // 笔记工作台需要足够高度；宿主可再拖拽
    window.ztools?.setExpendHeight?.(760)
  } catch (e) {
    console.warn('[md-workspace] setExpendHeight failed', e)
  }
}

function extractFilePath(action: any): string | null {
  const payload = action?.payload
  if (!payload) return null
  if (typeof payload === 'string') return payload
  if (Array.isArray(payload)) {
    const first = payload[0]
    if (typeof first === 'string') return first
    if (first && typeof first.path === 'string') return first.path
  }
  if (typeof payload.path === 'string') return payload.path
  return null
}

function selectView(view: AppView) {
  ws.setView(view)
  // 切到笔记视图时自动展开笔记库，避免“找不到其它笔记”
  if (view === 'editor') libraryOpen.value = true
}

function viewShortcut(view: AppView) {
  return `Control+${view === 'editor' ? 1 : view === 'todo' ? 2 : view === 'gantt' ? 3 : 4}`
}

function isTextEntryTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false
  return target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)
}

function toggleLibrary() {
  libraryOpen.value = !libraryOpen.value
}

async function focusNoteSearch() {
  libraryOpen.value = true
  await nextTick()
  document.getElementById('note-search')?.focus()
}

async function insertTaskBlockFromShortcut() {
  selectView('editor')
  await nextTick()
  window.dispatchEvent(new CustomEvent('mdw:insert-task-block'))
}

function toggleEditorModeFromShortcut() {
  selectView('editor')
  ws.setEditorMode(ws.editorMode === 'source' ? 'wysiwyg' : 'source')
}

function handleEnter(action: any) {
  applyPluginHeight()
  const code = action?.code || 'workspace'
  if (code === 'todo') selectView('todo')
  else if (code === 'gantt') selectView('gantt')
  else if (code === 'calendar') selectView('calendar')
  else selectView('editor')

  if (code === 'open-file') {
    const p = extractFilePath(action)
    if (p) void ws.openNote(p)
  }
}

function onKeydown(ev: KeyboardEvent) {
  if (ui.confirm.open || ui.prompt.open) return

  if (ev.key === 'Escape' && libraryOpen.value) {
    // 窄屏抽屉模式才收起；宽屏常驻笔记库时不因 Esc 关掉
    const narrow = window.matchMedia('(max-width: 900px)').matches
    if (narrow) {
      ev.preventDefault()
      libraryOpen.value = false
      mobileLibraryToggle.value?.focus()
    }
    return
  }

  const mod = ev.ctrlKey || ev.metaKey
  if (!mod) return
  const isTextEntry = isTextEntryTarget(ev.target)
  const key = ev.key.toLowerCase()
  if (key === 'p' && !isTextEntry) {
    ev.preventDefault()
    void focusNoteSearch()
    return
  }
  if (key === 'b' && !isTextEntry && !ev.shiftKey && !ev.altKey) {
    // Ctrl+B 在编辑区是粗体；输入区外切换笔记库
    // 交给输入区走格式快捷键，这里仅非输入时
  }
  if (key === '\\' && !isTextEntry) {
    ev.preventDefault()
    toggleLibrary()
    return
  }
  if (key === ',' && !isTextEntry) {
    ev.preventDefault()
    ws.setSettingsOpen(true)
    return
  }
  if (key === '/' && !ev.shiftKey && !ev.altKey && !isTextEntry) {
    ev.preventDefault()
    toggleEditorModeFromShortcut()
    return
  }
  if (key === 'm' && ev.shiftKey && !ev.altKey && !isTextEntry) {
    ev.preventDefault()
    toggleEditorModeFromShortcut()
    return
  }
  if (key === 't' && ev.altKey && !ev.shiftKey && !isTextEntry) {
    ev.preventDefault()
    void insertTaskBlockFromShortcut()
    return
  }
  if (key === 's') {
    ev.preventDefault()
    void ws.flushSave()
    return
  }
  if (key === 'n' && !isTextEntry) {
    ev.preventDefault()
    void ws.createNote()
    return
  }
  if (key === 'z' && !ev.shiftKey && !ev.altKey && !isTextEntry) {
    ev.preventDefault()
    if (typeof (ws as any).undoContent === 'function') (ws as any).undoContent()
    return
  }
  if ((key === 'y' || (key === 'z' && ev.shiftKey)) && !isTextEntry) {
    ev.preventDefault()
    if (typeof (ws as any).redoContent === 'function') (ws as any).redoContent()
    return
  }
  if (key === '1' && !isTextEntry) {
    ev.preventDefault()
    selectView('editor')
    return
  }
  if (key === '2' && !isTextEntry) {
    ev.preventDefault()
    selectView('todo')
    return
  }
  if (key === '3' && !isTextEntry) {
    ev.preventDefault()
    selectView('gantt')
    return
  }
  if (key === '4' && !isTextEntry) {
    ev.preventDefault()
    selectView('calendar')
  }
}

onMounted(async () => {
  applyPluginHeight()
  await ws.refreshNotes()
  if ((ws as any).defaultView) ws.setView((ws as any).defaultView)
  if ((ws as any).defaultEditorMode) ws.setEditorMode((ws as any).defaultEditorMode)
  // 进入后始终可见笔记库（多笔记浏览核心路径）
  libraryOpen.value = true
  window.addEventListener('keydown', onKeydown)

  if (window.ztools?.onPluginEnter) {
    window.ztools.onPluginEnter((action) => {
      handleEnter(action)
    })
  }
  if (window.ztools?.onPluginOut) {
    window.ztools.onPluginOut(() => {
      void ws.flushSave()
    })
  }
})

onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKeydown)
  void ws.flushSave()
})
</script>

<template>
  <div class="app-shell" :data-view="ws.view" :data-library="libraryOpen ? 'open' : 'closed'">
    <nav class="work-rail" aria-label="工作台导航">
      <div class="rail-signature" title="墨线工作台" aria-label="墨线工作台">
        <span class="rail-mark" aria-hidden="true">墨</span>
      </div>

      <div class="rail-nav">
        <button
          v-for="v in viewMeta"
          :key="v.id"
          type="button"
          class="rail-nav-item"
          :class="[{ active: ws.view === v.id }, `is-${v.id}`]"
          :aria-current="ws.view === v.id ? 'page' : undefined"
          :title="v.title"
          :aria-label="v.title"
          :aria-keyshortcuts="viewShortcut(v.id)"
          @click="selectView(v.id)"
        >
          <span class="rail-icon" aria-hidden="true">
            <!-- 清晰 SVG，避免 CSS 伪图标重叠错乱 -->
            <svg v-if="v.icon === 'editor'" viewBox="0 0 24 24">
              <path d="M6 4.5h8.5L18 8v11.5H6z" fill="none" stroke="currentColor" stroke-width="1.7" />
              <path d="M14 4.5V8h3.5M8.5 12h7M8.5 15.5h5" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" />
            </svg>
            <svg v-else-if="v.icon === 'todo'" viewBox="0 0 24 24">
              <rect x="4.5" y="4.5" width="15" height="15" rx="2.5" fill="none" stroke="currentColor" stroke-width="1.7" />
              <path d="m8 12 2.6 2.6L16.5 9" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" />
            </svg>
            <svg v-else-if="v.icon === 'gantt'" viewBox="0 0 24 24">
              <path d="M5 6h8M5 12h12M5 18h6" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" />
            </svg>
            <svg v-else viewBox="0 0 24 24">
              <rect x="4.5" y="5.5" width="15" height="14" rx="2" fill="none" stroke="currentColor" stroke-width="1.7" />
              <path d="M4.5 9.5h15M9 5.5v3M15 5.5v3" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" />
            </svg>
          </span>
          <span class="rail-label">{{ v.label }}</span>
        </button>
      </div>
    </nav>

    <div class="library-drawer" :class="{ open: libraryOpen }" :aria-hidden="!libraryOpen && false">
      <NoteSidebar />
    </div>
    <button
      v-if="libraryOpen"
      type="button"
      class="library-backdrop"
      aria-label="关闭笔记库"
      @click="libraryOpen = false"
    />

    <main class="main-pane" aria-label="工作画布">
      <TopBar :library-open="libraryOpen" @toggle-library="toggleLibrary" />
      <div class="content-pane">
        <EditorView v-if="ws.view === 'editor'" />
        <TodoView v-else-if="ws.view === 'todo'" />
        <GanttView v-else-if="ws.view === 'gantt'" />
        <CalendarView v-else />
      </div>
      <footer
        v-if="workspaceState || ws.view !== 'editor'"
        class="workspace-status"
        aria-live="polite"
      >
        <span class="status-workline" aria-hidden="true" />
        <span class="workspace-status-label">{{ viewLabels[ws.view] }}</span>
        <span v-if="workspaceState" class="workspace-status-copy">{{ workspaceState }}</span>
        <button
          type="button"
          class="status-library-link"
          title="打开笔记库"
          @click="libraryOpen = true"
        >
          全部笔记
        </button>
      </footer>
    </main>

    <ConfirmDialog
      :open="ui.confirm.open"
      :title="ui.confirm.title"
      :message="ui.confirm.message"
      :confirm-text="ui.confirm.confirmText"
      :cancel-text="ui.confirm.cancelText"
      :danger="ui.confirm.danger"
      @confirm="ui.resolveConfirm(true)"
      @cancel="ui.resolveConfirm(false)"
    />
    <PromptDialog
      :open="ui.prompt.open"
      :title="ui.prompt.title"
      :message="ui.prompt.message"
      :model-value="ui.promptDraft.value"
      :placeholder="ui.prompt.placeholder"
      :confirm-text="ui.prompt.confirmText"
      :cancel-text="ui.prompt.cancelText"
      @update:model-value="ui.setPromptValue"
      @confirm="(v) => ui.resolvePrompt(v)"
      @cancel="ui.resolvePrompt(null)"
    />
  </div>
</template>
