<script setup lang="ts">
import { computed, inject, onMounted, onBeforeUnmount } from 'vue'
import type { useWorkspace } from '../composables/useWorkspace'
import type { AppView, EditorMode, SyncProvider, UiDensity } from '../core/types'

defineProps<{ open: boolean }>()
const emit = defineEmits<{ (e: 'close'): void }>()
const ws = inject('workspace') as ReturnType<typeof useWorkspace>

const syncLabel = computed(() => ws.syncStatus?.label || '本地文件')
const defView = computed(() => (ws.defaultView || 'editor') as AppView)
const defMode = computed(() => (ws.defaultEditorMode || 'wysiwyg') as EditorMode)
const enabled = computed(() => ((ws as any).enabledViews as AppView[]) || ['editor', 'todo', 'gantt', 'calendar'])
const libraryDefaultOpen = computed(() => Boolean((ws as any).libraryDefaultOpen))
const miniWindowEnabled = computed(() => Boolean((ws as any).miniWindowEnabled))
const miniOpacity = computed(() => {
  const o = Number((ws as any).miniWindowOpacity)
  return Number.isFinite(o) ? o : 0.88
})
const miniOpacityPct = computed(() => Math.round(miniOpacity.value * 100))
const density = computed(() => ((ws as any).uiDensity as UiDensity) || 'compact')

const viewToggles: { id: AppView; label: string }[] = [
  { id: 'editor', label: '笔记' },
  { id: 'todo', label: '待办' },
  { id: 'gantt', label: '甘特' },
  { id: 'calendar', label: '日历' },
]

const viewOptions: { id: AppView; label: string }[] = [
  { id: 'editor', label: '笔记' },
  { id: 'todo', label: '待办' },
  { id: 'gantt', label: '甘特' },
  { id: 'calendar', label: '日历' },
]

function onBackdrop(ev: MouseEvent) {
  if (ev.target === ev.currentTarget) emit('close')
}

function onKey(ev: KeyboardEvent) {
  if (ev.key === 'Escape') emit('close')
}

function setProvider(p: SyncProvider) {
  void ws.setSyncProvider(p)
}

function changeRoot() {
  void ws.changeNotesRoot()
}

function openRoot() {
  ws.openInFolder(ws.notesRoot)
}

function pickView(v: AppView) {
  ws.setDefaultView?.(v)
}

function pickMode(m: EditorMode) {
  ws.setDefaultEditorMode?.(m)
}

function isViewOn(id: AppView) {
  return enabled.value.includes(id)
}

function toggleView(id: AppView) {
  ;(ws as any).toggleEnabledView?.(id)
}

function setLibraryOpen(on: boolean) {
  ;(ws as any).setLibraryDefaultOpen?.(on)
}

function toggleMini(on: boolean) {
  ;(ws as any).toggleMiniWindow?.(on)
}

function seedSamples() {
  void (ws as any).ensureDemoSamples?.()
}

function pickDensity(d: UiDensity) {
  ;(ws as any).setUiDensity?.(d)
}

function restartTour() {
  ;(ws as any).restartOnboarding?.()
}

function openShortcuts() {
  emit('close')
  window.dispatchEvent(new CustomEvent('mdw:open-shortcuts'))
}

function onOpacityInput(ev: Event) {
  const v = Number((ev.target as HTMLInputElement).value) / 100
  ;(ws as any).setMiniWindowOpacity?.(v)
}

onMounted(() => window.addEventListener('keydown', onKey))
onBeforeUnmount(() => window.removeEventListener('keydown', onKey))
</script>

<template>
  <Teleport to="body">
    <div
      v-if="open"
      class="settings-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="settings-title"
      @click="onBackdrop"
    >
      <div class="settings-sheet" tabindex="-1">
        <header class="settings-sheet-head">
          <h2 id="settings-title">设置</h2>
          <button type="button" class="icon-action" title="关闭" aria-label="关闭设置" @click="emit('close')">
            <span aria-hidden="true">×</span>
          </button>
        </header>

        <div class="settings-sheet-body">
          <!-- 启动 -->
          <section class="set-block">
            <div class="set-label">启动视图</div>
            <div class="set-tabs" role="group" aria-label="默认视图">
              <button
                v-for="opt in viewOptions"
                :key="opt.id"
                type="button"
                class="set-tab"
                :class="{ active: defView === opt.id }"
                @click="pickView(opt.id)"
              >{{ opt.label }}</button>
            </div>
            <div class="set-tabs set-gap" role="group" aria-label="默认编辑模式">
              <button type="button" class="set-tab" :class="{ active: defMode === 'wysiwyg' }" @click="pickMode('wysiwyg')">排版</button>
              <button type="button" class="set-tab" :class="{ active: defMode === 'source' }" @click="pickMode('source')">源码</button>
            </div>
            <label class="set-check">
              <input type="checkbox" :checked="libraryDefaultOpen" @change="setLibraryOpen(($event.target as HTMLInputElement).checked)" />
              <span>启动时打开笔记库</span>
            </label>
          </section>

          <section class="set-block">
            <div class="set-label">导航显示</div>
            <div class="set-checks">
              <label v-for="opt in viewToggles" :key="opt.id" class="set-check">
                <input type="checkbox" :checked="isViewOn(opt.id)" @change="toggleView(opt.id)" />
                <span>{{ opt.label }}</span>
              </label>
            </div>
          </section>

          <section class="set-block">
            <div class="set-label">密度</div>
            <div class="set-tabs" role="group" aria-label="显示密度">
              <button type="button" class="set-tab" :class="{ active: density === 'compact' }" @click="pickDensity('compact')">紧凑</button>
              <button type="button" class="set-tab" :class="{ active: density === 'comfortable' }" @click="pickDensity('comfortable')">舒适</button>
            </div>
          </section>

          <section class="set-block">
            <div class="set-label">桌面小窗</div>
            <label class="set-check">
              <input type="checkbox" :checked="miniWindowEnabled" @change="toggleMini(($event.target as HTMLInputElement).checked)" />
              <span>固定小窗</span>
            </label>
            <div class="set-row">
              <span class="set-muted">透明度 {{ miniOpacityPct }}%</span>
              <input
                class="set-range"
                type="range"
                min="40"
                max="100"
                step="5"
                :value="miniOpacityPct"
                aria-label="小窗透明度"
                @input="onOpacityInput"
              />
            </div>
            <div class="set-links">
              <button type="button" class="text-link" @click="(ws as any).openMiniWindow?.()">打开</button>
              <button type="button" class="text-link" @click="(ws as any).closeMiniWindow?.()">关闭</button>
            </div>
          </section>

          <section class="set-block">
            <div class="set-label">笔记目录</div>
            <div class="set-path" :title="ws.notesRoot">{{ ws.notesRoot || '未设置' }}</div>
            <div class="set-links">
              <button type="button" class="text-link" @click="changeRoot">更换</button>
              <button type="button" class="text-link" @click="openRoot">打开</button>
            </div>
          </section>

          <section class="set-block">
            <div class="set-label">同步</div>
            <button
              type="button"
              class="set-choice"
              :class="{ active: ws.syncProvider === 'local' }"
              @click="setProvider('local')"
            >
              <span>本地文件</span>
              <em v-if="ws.syncProvider === 'local'">当前</em>
            </button>
            <button
              type="button"
              class="set-choice"
              :class="{ active: ws.syncProvider === 'webdiv' }"
              @click="setProvider('webdiv')"
            >
              <span>宿主云（实验）</span>
              <em>{{ ws.syncProvider === 'webdiv' ? '已选' : '实验' }}</em>
            </button>
            <div class="set-muted">{{ syncLabel }}</div>
          </section>

          <section class="set-block">
            <div class="set-label">其它</div>
            <div class="set-links">
              <button type="button" class="text-link" @click="restartTour">引导</button>
              <button type="button" class="text-link" @click="openShortcuts">快捷键</button>
              <button type="button" class="text-link" @click="seedSamples">示例数据</button>
              <button type="button" class="text-link" @click="ws.openSampleNote()">快速开始</button>
            </div>
          </section>
        </div>
      </div>
    </div>
  </Teleport>
</template>
