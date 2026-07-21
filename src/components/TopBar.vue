<script setup lang="ts">
import { computed, inject } from 'vue'
import type { useWorkspace } from '../composables/useWorkspace'
import type { EditorMode } from '../core/types'
import HelpTip from './HelpTip.vue'
import SettingsPanel from './SettingsPanel.vue'

const props = defineProps<{
  libraryOpen: boolean
}>()

const emit = defineEmits<{
  (e: 'toggle-library'): void
}>()

const ws = inject('workspace') as ReturnType<typeof useWorkspace>

/** 顶栏主标题：笔记视图用文件名；投影视图用视图名（不要全局绑死当前打开的笔记文件名） */
const docTitle = computed(() => {
  const view = ws.view
  if (view === 'todo') return '待办'
  if (view === 'gantt') return '甘特'
  if (view === 'calendar') return '日历'
  const name = ws.activeNote?.name
  if (!name) return ''
  return name.replace(/\.md$/i, '')
})

/** 投影视图下，若已打开某篇笔记，用次要文案提示「当前关联笔记」（不抢主标题） */
const contextNoteHint = computed(() => {
  if (ws.view === 'editor') return ''
  const name = ws.activeNote?.name
  if (!name) return ''
  return name.replace(/\.md$/i, '')
})

const noteCount = computed(() => (ws.notes?.length as number) || 0)

const saveLabel = computed(() => {
  if (ws.saving) return { text: '保存中', kind: 'muted' }
  if (ws.saveError || ws.status === '保存失败') {
    const detail = typeof ws.saveError === 'string' && ws.saveError ? ws.saveError : '请重试'
    return { text: '保存失败', kind: 'danger', detail }
  }
  if (ws.dirty) return { text: '未保存', kind: 'warn' }
  if (ws.status && !/同步|真源|工作台/.test(String(ws.status))) {
    return { text: String(ws.status), kind: 'muted' }
  }
  if (ws.activePath) return { text: '已保存', kind: 'ok' }
  return null
})

const canRetrySave = computed(
  () => Boolean(ws.activePath) && (Boolean(ws.saveError) || ws.status === '保存失败' || ws.dirty)
)

const modeHelp =
  '排版：所见即所得编辑；源码：直接编辑 Markdown。Ctrl+/ 可切换模式。左侧可切换视图；点「笔记库」浏览全部笔记。Ctrl+N 新建，Ctrl+P 搜索。'

function onRetrySave() {
  if (typeof ws.retrySave === 'function') void ws.retrySave()
  else void ws.flushSave()
}
</script>

<template>
  <header class="topbar">
    <div class="top-context">
      <button
        type="button"
        class="library-toggle-btn"
        :class="{ active: props.libraryOpen }"
        :aria-pressed="props.libraryOpen"
        :title="props.libraryOpen ? '收起笔记库' : '打开笔记库（查看全部笔记）'"
        :aria-label="props.libraryOpen ? '收起笔记库' : '打开笔记库'"
        @click="emit('toggle-library')"
      >
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M4 6h16M4 12h10M4 18h14" stroke="currentColor" stroke-width="1.8" fill="none" stroke-linecap="round" />
        </svg>
        <span>笔记库</span>
        <em v-if="noteCount" class="library-count">{{ noteCount }}</em>
      </button>
      <div class="doc-title-wrap">
        <h1 class="doc-title" :title="docTitle || (ws.view === 'editor' ? '未选择笔记' : docTitle)">
          {{ docTitle || (ws.view === 'editor' ? '选择一篇笔记' : '') }}
        </h1>
        <span
          v-if="contextNoteHint"
          class="doc-context-note"
          :title="'当前打开：' + contextNoteHint"
        >{{ contextNoteHint }}</span>
      </div>
    </div>

    <div class="top-actions">
      <button
        type="button"
        class="btn-ghost sm top-new-note"
        title="新建笔记（Ctrl+N）"
        @click="ws.createNote()"
      >
        新建
      </button>
      <div v-if="ws.view === 'editor'" class="seg editor-mode-seg" role="group" aria-label="编辑模式">
        <button
          type="button"
          class="seg-btn"
          :class="{ active: ws.editorMode === 'wysiwyg' }"
          :aria-pressed="ws.editorMode === 'wysiwyg'"
          title="所见即所得编辑"
          @click="ws.setEditorMode('wysiwyg' as EditorMode)"
        >
          排版
        </button>
        <button
          type="button"
          class="seg-btn"
          :class="{ active: ws.editorMode === 'source' }"
          :aria-pressed="ws.editorMode === 'source'"
          title="Markdown 源码编辑"
          @click="ws.setEditorMode('source' as EditorMode)"
        >
          源码
        </button>
      </div>

      <span
        v-if="saveLabel"
        class="save-pill"
        :class="saveLabel.kind"
        :title="saveLabel.detail || saveLabel.text"
        role="status"
      >
        <span class="save-state-dot" aria-hidden="true" />
        {{ saveLabel.text }}
      </span>
      <button
        v-if="ws.saveError || ws.status === '保存失败'"
        type="button"
        class="btn-ghost sm save-retry-btn"
        :disabled="ws.saving || !canRetrySave"
        title="重新保存当前笔记"
        @click="onRetrySave"
      >
        重试
      </button>
      <HelpTip :text="modeHelp" label="编辑器说明" />
      <button
        type="button"
        class="btn-solid btn-save"
        :disabled="ws.saving || (!ws.dirty && !ws.saveError)"
        title="保存当前笔记（Ctrl+S）"
        @click="onRetrySave"
      >
        保存
      </button>
      <button
        type="button"
        class="icon-action settings-btn"
        title="打开设置"
        aria-label="打开设置"
        @click="ws.setSettingsOpen(true)"
      >
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 8.2a3.8 3.8 0 1 0 0 7.6 3.8 3.8 0 0 0 0-7.6Zm0-5.2 1.05 2.12a7.1 7.1 0 0 1 1.9.79l2.25-.72 1.5 2.6-1.7 1.64c.12.61.12 1.23 0 1.84l1.7 1.64-1.5 2.6-2.25-.72a7.1 7.1 0 0 1-1.9.79L12 21l-3-1.5-1.05-2.12a7.1 7.1 0 0 1-1.9-.79l-2.25.72-1.5-2.6 1.7-1.64a7.6 7.6 0 0 1 0-1.84L2.3 9.59l1.5-2.6 2.25.72a7.1 7.1 0 0 1 1.9-.79L9 3h3Z" /></svg>
      </button>
    </div>

    <SettingsPanel :open="!!ws.settingsOpen" @close="ws.setSettingsOpen(false)" />
  </header>
</template>
