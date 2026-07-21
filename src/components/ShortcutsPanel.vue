<script setup lang="ts">
import { onMounted, onBeforeUnmount } from 'vue'

defineProps<{ open: boolean }>()
const emit = defineEmits<{ (e: 'close'): void }>()

type Row = { keys: string; action: string; group: string }

const rows: Row[] = [
  { group: '全局', keys: 'Ctrl+1', action: '笔记视图（单击）；双击笔记图标打开笔记库' },
  { group: '全局', keys: 'Ctrl+2 / 3 / 4', action: '待办 / 甘特 / 日历' },
  { group: '全局', keys: 'Ctrl+\\', action: '打开或关闭笔记库（挤压主画布）' },
  { group: '全局', keys: 'Ctrl+,', action: '打开设置' },
  { group: '全局', keys: 'Ctrl+/', action: '打开本快捷键表' },
  { group: '全局', keys: 'Ctrl+S', action: '保存当前笔记' },
  { group: '全局', keys: 'Ctrl+N', action: '新建笔记' },
  { group: '全局', keys: 'Ctrl+P', action: '打开笔记库并聚焦搜索' },
  { group: '全局', keys: 'Esc', action: '关闭浮层 / 笔记库 / 详情（按层级）' },
  { group: '编辑', keys: 'Ctrl+B / I / U', action: '粗体 / 斜体 / 下划线' },
  { group: '编辑', keys: 'Ctrl+Shift+X', action: '删除线' },
  { group: '编辑', keys: 'Ctrl+Shift+`', action: '行内代码' },
  { group: '编辑', keys: 'Ctrl+Shift+C', action: '代码块（围栏）' },
  { group: '编辑', keys: 'Ctrl+K', action: '链接' },
  { group: '编辑', keys: 'Ctrl+Shift+8 / 9', action: '无序列表 / 有序列表' },
  { group: '编辑', keys: 'Ctrl+Shift+.', action: '引用' },
  { group: '编辑', keys: 'Ctrl+Alt+1…6', action: '标题 H1–H6（避开视图切换）' },
  { group: '编辑', keys: 'Ctrl+Alt+T', action: '插入任务组（编辑中也可用）' },
  { group: '编辑', keys: 'Ctrl+Shift+M', action: '排版 ⇄ 源码（编辑中也可用）' },
  { group: '编辑', keys: 'Ctrl+Enter / Ctrl+Shift+T', action: '切换当前行任务勾选' },
  { group: '编辑', keys: 'Enter（排版）', action: '软换行（单行）；Shift+Enter 新段落' },
  { group: '编辑', keys: 'Ctrl+Z / Y', action: '撤销 / 重做' },
  { group: '编辑', keys: 'Tab / Shift+Tab', action: '缩进列表或循环标题级别' },
]

const groups = ['全局', '编辑']

function onBackdrop(ev: MouseEvent) {
  if (ev.target === ev.currentTarget) emit('close')
}

function onKey(ev: KeyboardEvent) {
  if (ev.key === 'Escape') emit('close')
}

onMounted(() => window.addEventListener('keydown', onKey))
onBeforeUnmount(() => window.removeEventListener('keydown', onKey))
</script>

<template>
  <Teleport to="body">
    <div
      v-if="open"
      class="shortcuts-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="shortcuts-title"
      @click="onBackdrop"
    >
      <div class="shortcuts-panel" tabindex="-1">
        <header class="shortcuts-head">
          <h2 id="shortcuts-title" class="shortcuts-title">快捷键</h2>
          <button type="button" class="icon-action" aria-label="关闭快捷键" @click="emit('close')">
            <span aria-hidden="true">×</span>
          </button>
        </header>
        <p class="shortcuts-lead">
          默认绑定如下。后续版本支持自定义；当前可在设置里查看说明。喜欢用快捷键写 Markdown 时，优先源码模式保真。
        </p>
        <div class="shortcuts-body">
          <section v-for="g in groups" :key="g" class="shortcuts-group">
            <h3 class="shortcuts-group-title">{{ g }}</h3>
            <table class="shortcuts-table">
              <tbody>
                <tr v-for="row in rows.filter((r) => r.group === g)" :key="row.keys + row.action">
                  <th scope="row"><kbd>{{ row.keys }}</kbd></th>
                  <td>{{ row.action }}</td>
                </tr>
              </tbody>
            </table>
          </section>
        </div>
      </div>
    </div>
  </Teleport>
</template>
