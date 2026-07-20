<script setup lang="ts">
import { computed, inject, onMounted, onBeforeUnmount } from 'vue'
import type { useWorkspace } from '../composables/useWorkspace'
import type { AppView, EditorMode, SyncProvider } from '../core/types'

defineProps<{ open: boolean }>()
const emit = defineEmits<{ (e: 'close'): void }>()
const ws = inject('workspace') as ReturnType<typeof useWorkspace>

const syncLabel = computed(() => ws.syncStatus?.label || '本地文件')
const syncDetail = computed(() => ws.syncStatus?.detail || '')
const syncReady = computed(() => !!ws.syncStatus?.ready)
const defView = computed(() => (ws.defaultView || 'editor') as AppView)
const defMode = computed(() => (ws.defaultEditorMode || 'wysiwyg') as EditorMode)

const viewOptions: { id: AppView; label: string }[] = [
  { id: 'editor', label: '编辑' },
  { id: 'todo', label: '待办' },
  { id: 'gantt', label: '甘特' },
  { id: 'calendar', label: '日历' },
]

const shortcutGroups: { title: string; items: { keys: string[]; desc: string }[] }[] = [
  {
    title: '全局（文本输入区外）',
    items: [
      { keys: ['Ctrl', 'S'], desc: '保存当前笔记' },
      { keys: ['Ctrl', 'N'], desc: '新建空白 Markdown' },
      { keys: ['Ctrl', 'P'], desc: '聚焦笔记库搜索' },
      { keys: ['Ctrl', ','], desc: '打开设置与快捷键说明' },
      { keys: ['Ctrl', '/'], desc: '切换源码 / 所见即所得' },
      { keys: ['Ctrl', 'Shift', 'M'], desc: '切换源码 / 所见即所得' },
      { keys: ['Ctrl', 'Alt', 'T'], desc: '插入任务组' },
      { keys: ['Ctrl', 'Z'], desc: '撤销内容编辑' },
      { keys: ['Ctrl', 'Y'], desc: '重做内容编辑' },
      { keys: ['Ctrl', '1'], desc: '切换到编辑视图' },
      { keys: ['Ctrl', '2'], desc: '切换到待办视图' },
      { keys: ['Ctrl', '3'], desc: '切换到甘特视图' },
      { keys: ['Ctrl', '4'], desc: '切换到日历视图' },
    ],
  },
  {
    title: '编辑',
    items: [
      { keys: ['Ctrl', 'B'], desc: '粗体' },
      { keys: ['Ctrl', 'I'], desc: '斜体' },
      { keys: ['Ctrl', 'U'], desc: '下划线' },
      { keys: ['Ctrl', 'K'], desc: '插入链接' },
      { keys: ['Ctrl', 'Shift', 'X'], desc: '删除线' },
      { keys: ['Ctrl', 'Shift', '`'], desc: '行内代码' },
      { keys: ['Ctrl', 'Alt', '1–6'], desc: '标题 1 到 6 级' },
      { keys: ['Ctrl', 'Shift', '8'], desc: '无序列表' },
      { keys: ['Ctrl', 'Shift', '9'], desc: '有序列表' },
      { keys: ['Ctrl', 'Shift', 'T'], desc: '切换当前 Markdown 勾选框' },
      { keys: ['Ctrl', 'Enter'], desc: '切换当前 Markdown 勾选框' },
      { keys: ['Tab'], desc: '缩进 / 循环标题' },
      { keys: ['Shift', 'Tab'], desc: '减少缩进' },
    ],
  },
]

function onBackdrop(ev: MouseEvent) {
  if (ev.target === ev.currentTarget) emit('close')
}

function onKey(ev: KeyboardEvent) {
  if (ev.key === 'Escape') emit('close')
}

function setProvider(p: SyncProvider) {
  if (p === 'webdiv' && !syncReady.value) {
    // 未接通时禁用选择
    return
  }
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
            <p class="settings-sub">笔记存储、默认视图、同步与快捷键</p>
          </div>
          <button type="button" class="icon-action" title="关闭" aria-label="关闭设置" @click="emit('close')">
            <span aria-hidden="true">×</span>
          </button>
        </header>

        <div class="settings-body">
          <section class="settings-block">
            <h3 class="settings-block-title">笔记目录</h3>
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
            <p class="settings-foot">笔记以 Markdown 保存在该目录下的文件夹中；可随时更换。</p>
          </section>

          <section class="settings-block">
            <h3 class="settings-block-title">打开时默认</h3>
            <div class="settings-row">
              <div class="settings-row-main">
                <span class="settings-label">默认打开视图</span>
                <span class="settings-desc">下次启动进入的视图（写入配置）</span>
              </div>
            </div>
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
            <div class="settings-row settings-row-gap">
              <div class="settings-row-main">
                <span class="settings-label">默认编辑模式</span>
                <span class="settings-desc">所见即所得或 Markdown 源码</span>
              </div>
            </div>
            <div class="settings-seg" role="group" aria-label="默认编辑模式">
              <button
                type="button"
                class="seg-btn"
                :class="{ active: defMode === 'wysiwyg' }"
                @click="pickMode('wysiwyg')"
              >
                所见即所得
              </button>
              <button
                type="button"
                class="seg-btn"
                :class="{ active: defMode === 'source' }"
                @click="pickMode('source')"
              >
                源码
              </button>
            </div>
          </section>


          <section class="settings-block">
            <h3 class="settings-block-title">同步方式</h3>
            <div
              class="settings-row clickable"
              :class="{ selected: ws.syncProvider === 'local' }"
              @click="setProvider('local')"
            >
              <div class="settings-row-main">
                <span class="settings-label">本地文件</span>
                <span class="settings-desc">Markdown 保存在本机，可接网盘同步文件夹</span>
              </div>
              <span class="settings-badge" :class="{ muted: ws.syncProvider !== 'local' }">
                {{ ws.syncProvider === 'local' ? '当前' : '可选' }}
              </span>
            </div>
            <div class="settings-row disabled" title="WebDIV 尚未接通，暂不可用">
              <div class="settings-row-main">
                <span class="settings-label">WebDIV / 远程</span>
                <span class="settings-desc">即将推出 · 当前不会上传任何数据</span>
              </div>
              <span class="settings-badge muted">即将推出</span>
            </div>
            <p class="settings-foot">
              当前有效：{{ syncLabel }}。远程同步协议尚未实现，选 WebDIV 不会上传数据。
            </p>
          </section>

          <section class="settings-block">
            <h3 class="settings-block-title">文件夹约定</h3>
            <ul class="settings-hotkeys">
              <li><strong>个人 / 工作</strong>：分类笔记</li>
              <li><strong>今日待办 / 长期待办</strong>：任务向笔记</li>
              <li><strong>记录</strong>：日记/流水，纯文字不进待办投影</li>
            </ul>
          </section>

          <section class="settings-block">
            <h3 class="settings-block-title">快捷键一览</h3>
            <div v-for="group in shortcutGroups" :key="group.title" class="settings-hotkey-group">
              <div class="settings-hotkey-group-title">{{ group.title }}</div>
              <ul class="settings-hotkey-table">
                <li v-for="(item, idx) in group.items" :key="group.title + idx" class="settings-hotkey-row">
                  <span class="settings-hotkey-keys">
                    <template v-for="(k, ki) in item.keys" :key="ki">
                      <kbd>{{ k }}</kbd>
                      <span v-if="ki < item.keys.length - 1" class="settings-hotkey-plus">+</span>
                    </template>
                  </span>
                  <span class="settings-hotkey-desc">{{ item.desc }}</span>
                </li>
              </ul>
            </div>
          </section>

          <section class="settings-block">
            <div class="settings-row">
              <div class="settings-row-main">
                <span class="settings-label">自动保存</span>
                <span class="settings-desc">编辑后约 0.5 秒写入；失败可点「重试」</span>
              </div>
              <span class="settings-badge">已启用</span>
            </div>
            <div class="settings-row">
              <div class="settings-row-main">
                <span class="settings-label">主题</span>
                <span class="settings-desc">跟随系统深浅色</span>
              </div>
              <span class="settings-badge muted">系统</span>
            </div>
          </section>
        </div>
      </div>
    </div>
  </Teleport>
</template>
