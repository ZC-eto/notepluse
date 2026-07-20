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
              <HelpTip
                text="关闭后左侧导航隐藏对应入口。Markdown 文件始终是真源；即使关闭「笔记」入口，也可从任务「在源码中打开」临时进入编辑。"
                label="启用视图说明"
              />
            </h3>
            <div class="settings-toggle-grid">
              <label v-for="opt in viewToggles" :key="opt.id" class="settings-toggle">
                <input
                  type="checkbox"
                  :checked="isViewOn(opt.id)"
                  @change="toggleView(opt.id)"
                />
                <span>{{ opt.label }}</span>
              </label>
            </div>
            <p class="settings-foot">至少保留一个视图。关闭不等于删除数据。</p>
          </section>

          <section class="settings-block">
            <h3 class="settings-block-title">
              打开时默认
              <HelpTip text="下次启动插件时优先显示的工作面。可与「启用视图」独立：默认可记笔记，即使你暂时关掉了笔记导航。" label="默认视图说明" />
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

          <section class="settings-block">
            <h3 class="settings-block-title">
              显示密度
              <HelpTip text="紧凑适合 ZTools 窄窗，一屏显示更多内容；舒适适合大屏长文阅读。" label="显示密度说明" />
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

          <section class="settings-block">
            <h3 class="settings-block-title">
              使用引导
              <HelpTip text="第一次打开会弹出流程式引导。可随时跳过，也可在这里重新开始。" label="引导说明" />
            </h3>
            <div class="settings-actions">
              <button type="button" class="btn-solid sm" @click="restartTour">重新开始引导</button>
              <button type="button" class="btn-ghost sm" @click="openShortcuts">快捷键一览</button>
            </div>
            <div class="settings-help-topics">
              <details class="settings-help">
                <summary>任务组是什么？</summary>
                <p>用「任务组」按钮插入的 Markdown 注释块。只有块内的 <code>- [ ]</code> 会进入待办 / 日历 / 甘特。普通清单与代码示例不会被收录。</p>
              </details>
              <details class="settings-help">
                <summary>日期如何进甘特 / 日历？</summary>
                <p><code>@date</code> 单日、<code>@due</code> 截止、<code>@start</code>+<code>@end</code> 跨日执行、里程碑 <code>@type(milestone)</code>+<code>@date</code>。甘特只显示跨日与里程碑；单日与截止看日历或待办。</p>
              </details>
              <details class="settings-help">
                <summary>排版模式里的「任务组 / 结束」</summary>
                <p>是任务组边界标记，保证切换排版/源码时不丢注释。完整注释在源码模式可见；悬停标记可看原文。</p>
              </details>
              <details class="settings-help">
                <summary>顶栏「N 个问题」怎么办？</summary>
                <p>点「查看」会切到源码并定位到出错行。常见原因：任务组未闭合、嵌套、重复 id、日期写反。修好保存后诊断会消失。</p>
              </details>
            </div>
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
