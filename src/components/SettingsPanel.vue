<script setup lang="ts">
import { computed, inject, onMounted, onBeforeUnmount } from 'vue'
import type { useWorkspace } from '../composables/useWorkspace'
import type { AppView, EditorMode, SyncProvider, UiDensity } from '../core/types'
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
      <div class="settings-panel settings-panel-v083" tabindex="-1">
        <header class="settings-head">
          <div class="settings-head-text">
            <h2 id="settings-title" class="settings-title">设置</h2>
            <p class="settings-sub">常用项在上 · 数据与同步在下</p>
          </div>
          <button type="button" class="icon-action" title="关闭" aria-label="关闭设置" @click="emit('close')">
            <span aria-hidden="true">×</span>
          </button>
        </header>

        <div class="settings-body">
          <!-- ===== 常用 ===== -->
          <p class="settings-section-label">常用</p>

          <section class="settings-card">
            <h3 class="settings-card-title">
              打开时默认
              <HelpTip text="下次启动优先显示的工作面。可与启用视图独立。" label="默认视图说明" />
            </h3>
            <div class="settings-seg" role="group" aria-label="默认视图">
              <button
                v-for="opt in viewOptions"
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

          <section class="settings-card">
            <h3 class="settings-card-title">
              启用视图
              <HelpTip text="关闭后左侧导航隐藏。Markdown 真源不依赖导航开关；可从任务「在源码中打开」。" label="启用视图说明" />
            </h3>
            <div class="settings-toggle-grid">
              <label v-for="opt in viewToggles" :key="opt.id" class="settings-toggle">
                <input type="checkbox" :checked="isViewOn(opt.id)" @change="toggleView(opt.id)" />
                <span>{{ opt.label }}</span>
              </label>
            </div>
            <p class="settings-foot">至少保留一个视图。关闭不等于删除数据。</p>
          </section>

          <section class="settings-card">
            <h3 class="settings-card-title">
              显示密度
              <HelpTip text="紧凑适合 ZTools 窄窗；舒适适合大屏阅读。" label="显示密度说明" />
            </h3>
            <div class="settings-seg" role="group" aria-label="显示密度">
              <button type="button" class="seg-btn" :class="{ active: density === 'compact' }" @click="pickDensity('compact')">
                紧凑
              </button>
              <button type="button" class="seg-btn" :class="{ active: density === 'comfortable' }" @click="pickDensity('comfortable')">
                舒适
              </button>
            </div>
          </section>

          <section class="settings-card">
            <h3 class="settings-card-title">
              使用引导
              <HelpTip text="高亮真实界面控件的分步引导。可跳过，可重开。" label="引导说明" />
            </h3>
            <div class="settings-actions">
              <button type="button" class="btn-solid sm" @click="restartTour">重新开始引导</button>
              <button type="button" class="btn-ghost sm" @click="openShortcuts">快捷键一览</button>
            </div>
            <div class="settings-help-topics">
              <details class="settings-help">
                <summary>任务组是什么？</summary>
                <p>用「任务组」按钮插入的注释块。只有块内的 <code>- [ ]</code> 会进待办 / 日历 / 甘特。</p>
              </details>
              <details class="settings-help">
                <summary>日期如何进甘特 / 日历？</summary>
                <p><code>@date</code> 单日、<code>@due</code> 截止、<code>@start</code>+<code>@end</code> 跨日、里程碑 <code>@type(milestone)</code>+<code>@date</code>。甘特只显示跨日与里程碑。</p>
              </details>
              <details class="settings-help">
                <summary>标签与优先级怎么设？</summary>
                <p>在任务「详情 → 编辑属性」写入，会回写 Markdown（如 <code>#工作</code>、<code>@priority(high)</code>）。不是单独数据库。</p>
              </details>
            </div>
          </section>

          <details class="settings-fold">
            <summary class="settings-fold-summary">外观与桌面小窗</summary>
            <section class="settings-card is-nested">
              <h3 class="settings-card-title">
                桌面小窗
                <HelpTip text="磨砂置顶小窗：今日/收件箱勾选。点标题或任务可唤起主插件窗；小窗内不改标题/日期，保持轻量。" label="小窗说明" />
              </h3>
              <label class="settings-toggle">
                <input type="checkbox" :checked="miniWindowEnabled" @change="toggleMini(($event.target as HTMLInputElement).checked)" />
                <span>固定桌面小窗（磨砂列表）</span>
              </label>
              <div class="settings-slider-row">
                <label class="settings-slider-label" for="mini-opacity">透明度 {{ miniOpacityPct }}%</label>
                <input
                  id="mini-opacity"
                  class="settings-range"
                  type="range"
                  min="40"
                  max="100"
                  step="5"
                  :value="miniOpacityPct"
                  aria-label="小窗透明度"
                  @input="onOpacityInput"
                />
              </div>
              <p class="settings-foot">越低越通透。若点「打开主窗」无反应，请从 ZTools 搜索打开「稿笺」。</p>
              <div class="settings-actions">
                <button type="button" class="btn-ghost sm" @click="(ws as any).openMiniWindow?.()">打开小窗</button>
                <button type="button" class="btn-ghost sm" @click="(ws as any).closeMiniWindow?.()">关闭小窗</button>
              </div>
            </section>
          </details>

          <!-- ===== 数据与高级 ===== -->
          <p class="settings-section-label">数据与高级</p>

          <section class="settings-card is-muted">
            <h3 class="settings-card-title">
              笔记目录
              <HelpTip text="Markdown 保存在本地文件夹。可改到网盘同步盘目录。" label="笔记目录说明" />
            </h3>
            <div class="settings-path-row">
              <span class="settings-path" :title="ws.notesRoot">{{ ws.notesRoot || '未设置' }}</span>
            </div>
            <div class="settings-actions">
              <button type="button" class="btn-ghost sm" @click="changeRoot">更换目录</button>
              <button type="button" class="btn-ghost sm" @click="openRoot">打开文件夹</button>
            </div>
          </section>

          <details class="settings-advanced">
            <summary class="settings-advanced-summary">更多高级选项</summary>
            <div class="settings-advanced-body">
              <section class="settings-card is-nested">
                <h3 class="settings-card-title">
                  示例数据
                  <HelpTip text="生成示例笔记。已有同名文件会跳过。" label="示例说明" />
                </h3>
                <div class="settings-actions">
                  <button type="button" class="btn-solid sm" @click="seedSamples">填充示例数据</button>
                  <button type="button" class="btn-ghost sm" @click="ws.openSampleNote()">打开快速开始</button>
                </div>
              </section>

              <section class="settings-card is-nested">
                <h3 class="settings-card-title">
                  同步
                  <HelpTip
                    text="本插件以本地 Markdown 为真源。可将笔记目录放到网盘文件夹。宿主云同步为实验能力。"
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
                    <span class="settings-desc">权威数据在本机目录</span>
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
                    <span class="settings-desc">{{ syncDetail || '未完全接通前仍以本地为准' }}</span>
                  </div>
                  <span class="settings-badge muted">{{ ws.syncProvider === 'webdiv' ? '已选' : '实验' }}</span>
                </div>
                <p class="settings-foot">当前：{{ syncLabel }}</p>
              </section>
            </div>
          </details>
        </div>
      </div>
    </div>
  </Teleport>
</template>
