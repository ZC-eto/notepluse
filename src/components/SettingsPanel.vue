<script setup lang="ts">
import { computed, inject, onMounted, onBeforeUnmount } from 'vue'
import type { useWorkspace } from '../composables/useWorkspace'
import type { AppView, EditorMode, SyncProvider } from '../core/types'
import HelpTip from './HelpTip.vue'

defineProps<{ open: boolean }>()
const emit = defineEmits<{ (e: 'close'): void }>()
const ws = inject('workspace') as ReturnType<typeof useWorkspace>

const syncLabel = computed(() => ws.syncStatus?.label || '本地文件')
const syncDetail = computed(() => ws.syncStatus?.detail || '')
const defView = computed(() => (ws.defaultView || 'editor') as AppView)
const defMode = computed(() => (ws.defaultEditorMode || 'wysiwyg') as EditorMode)
const enabled = computed(() => ((ws as any).enabledViews as AppView[]) || ['editor', 'todo', 'gantt', 'calendar'])
const libraryDefaultOpen = computed(() => Boolean((ws as any).libraryDefaultOpen))
const miniWindowEnabled = computed(() => Boolean((ws as any).miniWindowEnabled))

const viewToggles: { id: AppView; label: string; locked?: boolean }[] = [
  { id: 'editor', label: '笔记', locked: true },
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
  if (id === 'editor') return
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
      <div class="settings-panel" tabindex="-1">
        <header class="settings-head">
          <div class="settings-head-text">
            <h2 id="settings-title" class="settings-title">设置</h2>
          </div>
          <button type="button" class="icon-action" title="关闭" aria-label="关闭设置" @click="emit('close')">
            <span aria-hidden="true">×</span>
          </button>
        </header>

        <div class="settings-body">
          <section class="settings-block">
            <h3 class="settings-block-title">
              笔记目录
              <HelpTip text="Markdown 保存在本地文件夹。可改到网盘/同步盘目录，由外部同步。" label="笔记目录说明" />
            </h3>
            <div class="settings-row">
              <div class="settings-row-main">
                <span class="settings-label">本地根目录</span>
                <span class="settings-desc settings-path" :title="ws.notesRoot">{{ ws.notesRoot || '未设置' }}</span>
              </div>
            </div>
            <div class="settings-actions">
              <button type="button" class="btn-solid sm" @click="changeRoot">更换目录</button>
              <button type="button" class="btn-ghost sm" @click="openRoot">打开文件夹</button>
            </div>
          </section>

          <section class="settings-block">
            <h3 class="settings-block-title">
              启用视图
              <HelpTip text="关闭后左侧导航隐藏对应入口。笔记视图始终开启。" label="启用视图说明" />
            </h3>
            <div class="settings-toggle-grid">
              <label v-for="opt in viewToggles" :key="opt.id" class="settings-toggle">
                <input
                  type="checkbox"
                  :checked="isViewOn(opt.id)"
                  :disabled="opt.locked"
                  @change="toggleView(opt.id)"
                />
                <span>{{ opt.label }}</span>
              </label>
            </div>
          </section>

          <section class="settings-block">
            <h3 class="settings-block-title">打开时默认</h3>
            <div class="settings-seg" role="group" aria-label="默认视图">
              <button
                v-for="opt in viewOptions.filter((o) => isViewOn(o.id))"
                :key="opt.id"
                type="button"
                class="seg-btn"
                :class="{ active: defView === opt.id }"
                @click="pickView(opt.id)"
              >
                {{ opt.label }}
              </button>
            </div>
            <div class="settings-seg settings-row-gap" role="group" aria-label="默认编辑模式">
              <button type="button" class="seg-btn" :class="{ active: defMode === 'wysiwyg' }" @click="pickMode('wysiwyg')">
                排版
              </button>
              <button type="button" class="seg-btn" :class="{ active: defMode === 'source' }" @click="pickMode('source')">
                源码
              </button>
            </div>
            <label class="settings-toggle settings-row-gap">
              <input type="checkbox" :checked="libraryDefaultOpen" @change="setLibraryOpen(($event.target as HTMLInputElement).checked)" />
              <span>启动时打开笔记库</span>
            </label>
          </section>

          <section class="settings-block">
            <h3 class="settings-block-title">
              示例数据
              <HelpTip text="生成多篇示例：今日计划、工作迭代、个人琐事、长期目标与灵感记录。已有同名文件会跳过，不会覆盖。" label="示例说明" />
            </h3>
            <div class="settings-actions">
              <button type="button" class="btn-solid sm" @click="seedSamples">填充示例数据</button>
              <button type="button" class="btn-ghost sm" @click="ws.openSampleNote()">打开快速开始</button>
            </div>
          </section>

          <section class="settings-block">
            <h3 class="settings-block-title">
              桌面便签
              <HelpTip text="无标题栏磨砂便签：置顶列出今日/收件箱任务，可勾选完成。不是缩小的主窗口。" label="便签说明" />
            </h3>
            <label class="settings-toggle">
              <input type="checkbox" :checked="miniWindowEnabled" @change="toggleMini(($event.target as HTMLInputElement).checked)" />
              <span>固定桌面便签（磨砂列表）</span>
            </label>
            <div class="settings-actions">
              <button type="button" class="btn-ghost sm" @click="(ws as any).openMiniWindow?.()">打开便签</button>
              <button type="button" class="btn-ghost sm" @click="(ws as any).closeMiniWindow?.()">关闭便签</button>
            </div>
          </section>

          <section class="settings-block">
            <h3 class="settings-block-title">
              同步
              <HelpTip
                text="ZTools 官方云同步已从旧 WebDAV 迁到 Changelog/WebSocket 文档库。本插件笔记以本地 Markdown 为真源；可将笔记目录放到网盘同步文件夹，或后续接入宿主 db 复制。设置中的 WebDAV 若仍存在，属于宿主旧能力/其它模块，不是插件内假同步。"
                label="同步说明"
              />
            </h3>
            <div
              class="settings-row clickable"
              :class="{ selected: ws.syncProvider === 'local' }"
              @click="setProvider('local')"
            >
              <div class="settings-row-main">
                <span class="settings-label">本地文件</span>
                <span class="settings-desc">权威数据在本机目录；可用网盘同步该目录</span>
              </div>
              <span class="settings-badge" :class="{ muted: ws.syncProvider !== 'local' }">
                {{ ws.syncProvider === 'local' ? '当前' : '可选' }}
              </span>
            </div>
            <div
              class="settings-row clickable"
              :class="{ selected: ws.syncProvider === 'webdiv' }"
              @click="setProvider('webdiv')"
            >
              <div class="settings-row-main">
                <span class="settings-label">宿主云同步（实验）</span>
                <span class="settings-desc">
                  {{ syncDetail || '对接 ZTools db 复制；未完全接通前仍以本地文件为准' }}
                </span>
              </div>
              <span class="settings-badge muted">{{ ws.syncProvider === 'webdiv' ? '已选' : '实验' }}</span>
            </div>
            <p class="settings-foot">当前：{{ syncLabel }}。请在 ZTools 设置中登录/开启同步后，再评估云复制状态。</p>
          </section>
        </div>
      </div>
    </div>
  </Teleport>
</template>
