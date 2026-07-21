<script setup lang="ts">
import { computed, inject, onMounted, onBeforeUnmount, ref } from 'vue'
import type { useWorkspace } from '../composables/useWorkspace'
import type { GlobalTask } from '../core/types'
import { displayTaskTitle, isTodayFocus, hasSchedule } from '../core/taskSyntax'
import { globalTaskKey } from '../core/globalTasks'

const ws = inject('workspace') as ReturnType<typeof useWorkspace>

const tick = ref(0)
const focusHint = ref('')
let focusHintTimer: ReturnType<typeof setTimeout> | null = null
let pollTimer: ReturnType<typeof setInterval> | null = null

function showFocusHint(msg: string) {
  focusHint.value = msg
  if (focusHintTimer) clearTimeout(focusHintTimer)
  focusHintTimer = setTimeout(() => {
    focusHint.value = ''
  }, 3200)
}

function todayStr() {
  const now = new Date()
  const y = now.getFullYear()
  const m = String(now.getMonth() + 1).padStart(2, '0')
  const d = String(now.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

const today = computed(() => {
  void tick.value
  return todayStr()
})

const globalTasks = computed<GlobalTask[]>(() => {
  const list = (ws as any).allTasks as GlobalTask[] | undefined
  return Array.isArray(list) ? list : []
})

/** 便签：今日焦点 + 少量收件箱，已完成压到底部 */
const stickyTasks = computed(() => {
  const openToday = globalTasks.value.filter((t) => isTodayFocus(t, today.value))
  const inbox = globalTasks.value
    .filter((t) => !t.done && !hasSchedule(t))
    .slice(0, 4)
  const seen = new Set(openToday.map((t) => globalTaskKey(t)))
  const merged = [...openToday]
  for (const t of inbox) {
    const k = globalTaskKey(t)
    if (seen.has(k)) continue
    seen.add(k)
    merged.push(t)
  }
  return merged
    .slice()
    .sort((a, b) => Number(a.done) - Number(b.done) || (a.priority === 'high' || a.priority === 'urgent' ? -1 : 0))
    .slice(0, 12)
})

const openCount = computed(() => stickyTasks.value.filter((t) => !t.done).length)
const totalCount = computed(() => stickyTasks.value.length)

function metaLine(task: GlobalTask): string {
  const bits: string[] = []
  if (task.due) bits.push(task.due < today.value ? `逾期 ${task.due.slice(5)}` : `截止 ${task.due.slice(5)}`)
  else if (task.date) bits.push(task.date === today.value ? '今日' : task.date.slice(5))
  else if (task.start && task.end) bits.push(`${task.start.slice(5)}–${task.end.slice(5)}`)
  else bits.push('未排期')
  if (task.noteName) bits.push(task.noteName)
  return bits.join(' · ')
}

function priorityClass(task: GlobalTask) {
  if (task.priority === 'urgent' || task.priority === 'high') return 'is-high'
  if (task.priority === 'low') return 'is-low'
  return ''
}

function colorClass(task: GlobalTask) {
  return task.color ? `color-${task.color}` : 'color-gray'
}

function onToggle(task: GlobalTask) {
  ;(ws as any).onToggleGlobalTask?.(task)
}

function closeWindow() {
  try {
    if (typeof window.close === 'function') window.close()
  } catch {
    /* ignore */
  }
  try {
    // 宿主子窗有 close
    const anyWin = window as any
    if (typeof anyWin.ztools?.outPlugin === 'function') {
      /* 小窗不是主插件，忽略 */
    }
  } catch {
    /* ignore */
  }
}

function openMain() {
  let ok = false
  try {
    ok = Boolean((ws as any).focusMainPluginWindow?.())
  } catch { /* ignore */ }
  if (ok) {
    showFocusHint('已尝试打开主窗口')
    return
  }
  try {
    const z = window as any
    if (typeof z.ztools?.showMainWindow === 'function') {
      z.ztools.showMainWindow()
      showFocusHint('已尝试打开主窗口')
      return
    }
    if (typeof z.ztools?.showPlugin === 'function') {
      z.ztools.showPlugin()
      showFocusHint('已尝试打开主窗口')
      return
    }
    let broadcast = false
    if (typeof BroadcastChannel !== 'undefined') {
      const ch = new BroadcastChannel('mdw-plugin')
      ch.postMessage({ type: 'focus-main' })
      ch.close()
      broadcast = true
    }
    if (broadcast) {
      showFocusHint('已通知主窗口；若未出现，请从 ZTools 搜索再次打开「Markdown 工作台」')
    } else {
      showFocusHint('当前宿主无法直接唤起主窗，请从 ZTools 搜索打开「Markdown 工作台」')
    }
  } catch {
    showFocusHint('打开主窗失败，请从 ZTools 搜索打开插件')
  }
}

function openTaskInMain(task: GlobalTask) {
  try {
    if (typeof BroadcastChannel !== 'undefined') {
      const ch = new BroadcastChannel('mdw-plugin')
      ch.postMessage({
        type: 'open-task',
        notePath: task.notePath,
        taskId: task.id,
      })
      ch.close()
    }
  } catch { /* ignore */ }
  openMain()
}

onMounted(async () => {
  try {
    const o = Number((ws as any).miniWindowOpacity)
    if (Number.isFinite(o)) {
      document.documentElement.style.setProperty('--mini-opacity', String(Math.min(1, Math.max(0.35, o))))
    }
  } catch { /* ignore */ }
  await ws.refreshNotes()
  // 小窗独立进程/会话时定期刷新跨笔记缓存
  pollTimer = setInterval(() => {
    tick.value += 1
    try {
      ;(ws as any).invalidateTaskCache?.()
      void ws.refreshNotes()
    } catch {
      /* ignore */
    }
  }, 8000)
})

onBeforeUnmount(() => {
  if (pollTimer) clearInterval(pollTimer)
  if (focusHintTimer) clearTimeout(focusHintTimer)
})
</script>

<template>
  <div class="mini-sticky" data-mode="mini">
    <header class="mini-sticky-head">
      <div class="mini-sticky-drag">
        <span class="mini-sticky-mark" aria-hidden="true" />
        <button type="button" class="mini-sticky-titles is-btn" title="打开主窗口" @click="openMain">
          <strong class="mini-sticky-title">今日便签</strong>
          <span class="mini-sticky-sub">{{ openCount }}/{{ totalCount || 0 }} · {{ today.slice(5) }} · 点此打开主窗</span>
        </button>
      </div>
      <div class="mini-sticky-actions">
        <button type="button" class="mini-icon-btn" title="打开主窗口" aria-label="打开主窗口" @click="openMain">
          <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true">
            <path d="M7 7h10v10H7z" fill="none" stroke="currentColor" stroke-width="1.7" />
            <path d="M10 4h10v10" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" />
          </svg>
        </button>
        <button type="button" class="mini-icon-btn danger" title="关闭便签" aria-label="关闭便签" @click="closeWindow">
          <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true">
            <path d="M7 7l10 10M17 7 7 17" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" />
          </svg>
        </button>
      </div>
    </header>

    <ul v-if="stickyTasks.length" class="mini-sticky-list" aria-label="今日待办">
      <li
        v-for="task in stickyTasks"
        :key="globalTaskKey(task)"
        class="mini-sticky-item"
        :class="[{ done: task.done }, priorityClass(task), colorClass(task)]"
      >
        <button
          type="button"
          class="mini-check"
          :aria-pressed="task.done"
          :aria-label="task.done ? '标为未完成' : '标为完成'"
          @click="onToggle(task)"
        >
          <span class="mini-check-box" aria-hidden="true">
            <svg v-if="task.done" viewBox="0 0 16 16" width="12" height="12">
              <path d="M3.5 8.2 6.4 11 12.5 4.5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" />
            </svg>
          </span>
        </button>
        <button type="button" class="mini-sticky-body is-btn" :title="'在主窗口打开：' + displayTaskTitle(task.title)" @click="openTaskInMain(task)">
          <div class="mini-sticky-task-title">{{ displayTaskTitle(task.title) }}</div>
          <div class="mini-sticky-meta">{{ metaLine(task) }}</div>
        </button>
      </li>
    </ul>

    <div v-else class="mini-sticky-empty">
      <p>今日暂无待办</p>
      <p class="mini-sticky-empty-hint">在主窗口任务组中添加后会出现在这里</p>
    </div>

    <p v-if="focusHint" class="mini-focus-hint" role="status">{{ focusHint }}</p>
    <footer class="mini-sticky-foot">
      <span class="mini-sticky-hint">勾选完成 · 点标题/任务回主窗 · 拖拽顶栏移动</span>
    </footer>
  </div>
</template>
