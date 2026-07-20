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
import MiniStickyView from './views/MiniStickyView.vue'
import OnboardingTour from './components/OnboardingTour.vue'
import ShortcutsPanel from './components/ShortcutsPanel.vue'

const isMiniMode =
  typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('mode') === 'mini'

if (isMiniMode) {
  document.documentElement.classList.add('mini-mode')
}

const ws = useWorkspace()
provide('workspace', ws)

const ui = useUiDialogState()
/** 默认收起：写正文时不抢空间；需要时点「笔记库」打开 */
const libraryOpen = ref(false)
const shortcutsOpen = ref(false)
const mobileLibraryToggle = ref<HTMLButtonElement | null>(null)

const allViewMeta: {
  id: AppView
  label: string
  title: string
  icon: 'editor' | 'todo' | 'gantt' | 'calendar'
}[] = [
  { id: 'editor', label: '笔记', title: '笔记（Ctrl+1；双击打开笔记库）', icon: 'editor' },
  { id: 'todo', label: '待办', title: '待办（Ctrl+2）', icon: 'todo' },
  { id: 'gantt', label: '甘特', title: '甘特（Ctrl+3）', icon: 'gantt' },
  { id: 'calendar', label: '日历', title: '日历（Ctrl+4）', icon: 'calendar' },
]

const viewMeta = computed(() => {
  const enabled = ((ws as any).enabledViews as AppView[] | undefined) || [
    'editor',
    'todo',
    'gantt',
    'calendar',
  ]
  return allViewMeta.filter((v) => enabled.includes(v.id))
})

const viewLabels = computed(() =>
  Object.fromEntries(allViewMeta.map((v) => [v.id, v.label])) as Record<AppView, string>
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
  const enabled = ((ws as any).enabledViews as AppView[] | undefined) || allViewMeta.map((v) => v.id)
  if (!enabled.includes(view)) {
    // 笔记可被关闭：仍允许「在源码中打开」类 force 路径；导航点击则落到已启用项
    if (view === 'editor') {
      ws.setView('editor' as AppView, { force: true } as any)
      return
    }
    const fallback = enabled[0] || 'todo'
    ws.setView(fallback)
    return
  }
  ws.setView(view)
  // 单击导航只切视图，不自动弹出笔记库（双击笔记才开库）
}

/** 双击「笔记」：打开笔记库并挤压主画布（非覆盖） */
function onRailActivate(view: AppView, ev: MouseEvent) {
  if (view === 'editor' && ev.detail >= 2) {
    selectView('editor')
    libraryOpen.value = true
    return
  }
  selectView(view)
}

function openLibraryPushed() {
  libraryOpen.value = true
  if (ws.view !== 'editor' && ((ws as any).enabledViews as AppView[] | undefined)?.includes('editor')) {
    // 从其它视图开库时不必强制切笔记
  }
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

  if (ev.key === 'Escape') {
    if (shortcutsOpen.value) {
      ev.preventDefault()
      shortcutsOpen.value = false
      return
    }
    if ((ws as any).settingsOpen) {
      ev.preventDefault()
      ws.setSettingsOpen(false)
      return
    }
    if (libraryOpen.value) {
      // 宽屏挤压布局与窄屏抽屉：Esc 均关闭笔记库
      ev.preventDefault()
      libraryOpen.value = false
      mobileLibraryToggle.value?.focus()
      return
    }
    // 日历/甘特详情关闭由各视图自行监听 mdw:escape-layer
    window.dispatchEvent(new CustomEvent('mdw:escape-layer'))
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
    // Ctrl+B 在编辑区是粗体；输入区外不抢
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
    shortcutsOpen.value = true
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
    // Ctrl+1 只进笔记视图，不开关库；Ctrl+\ 或顶栏「笔记库」开库
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
  if (isMiniMode) {
    // 小窗只需要任务投影，不占主工作台高度
    await ws.refreshNotes()
    return
  }
  applyPluginHeight()
  await ws.refreshNotes()
  if ((ws as any).defaultView) ws.setView((ws as any).defaultView)
  if ((ws as any).defaultEditorMode) ws.setEditorMode((ws as any).defaultEditorMode)
  // 默认收起侧栏；若设置要求默认打开再展开
  libraryOpen.value = Boolean((ws as any).libraryDefaultOpen)
  window.addEventListener('keydown', onKeydown)
  window.addEventListener('mdw:open-shortcuts', () => { shortcutsOpen.value = true })

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
  // open-shortcuts is anonymous; rely on page unload in plugin session
  void ws.flushSave()
})
</script>

<template>
  <MiniStickyView v-if="isMiniMode" />
  <div
    v-else
    class="app-shell"
    :data-view="ws.view"
    :data-library="libraryOpen ? 'open' : 'closed'"
  >
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
          @click="onRailActivate(v.id, $event)"
          @dblclick.prevent="onRailActivate(v.id, $event)"
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
        v-if="workspaceState"
        class="workspace-status"
        aria-live="polite"
      >
        <span class="status-workline" aria-hidden="true" />
        <span class="workspace-status-label">{{ viewLabels[ws.view] }}</span>
        <span class="workspace-status-copy">{{ workspaceState }}</span>
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
    <OnboardingTour />
    <ShortcutsPanel :open="shortcutsOpen" @close="shortcutsOpen = false" />
  </div>
</template>
