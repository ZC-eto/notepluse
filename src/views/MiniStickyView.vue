<script setup lang="ts">
import { computed, inject, onMounted, onBeforeUnmount, ref } from 'vue'
import type { useWorkspace } from '../composables/useWorkspace'
import type { GlobalTask } from '../core/types'
import { displayTaskTitle, isTodayFocus, hasSchedule } from '../core/taskSyntax'
import { globalTaskKey } from '../core/globalTasks'

const ws = inject('workspace') as ReturnType<typeof useWorkspace>

const tick = ref(0)
let pollTimer: ReturnType<typeof setInterval> | null = null

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
  try {
    // 宿主：显示主搜索/插件窗
    if (typeof (window as any).ztools?.showMainWindow === 'function') {
      ;(window as any).ztools.showMainWindow()
      return
    }
    if (typeof (window as any).ztools?.showOpenDialog === 'function') {
      /* no-op: keep sticky usable without main */
    }
  } catch {
    /* ignore */
  }
}

onMounted(async () => {
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
})
</script>

<template>
  <div class="mini-sticky" data-mode="mini">
    <header class="mini-sticky-head">
      <div class="mini-sticky-drag">
        <span class="mini-sticky-mark" aria-hidden="true" />
        <div class="mini-sticky-titles">
          <strong class="mini-sticky-title">今日便签</strong>
          <span class="mini-sticky-sub">{{ openCount }}/{{ totalCount || 0 }} · {{ today.slice(5) }}</span>
        </div>
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
        <div class="mini-sticky-body">
          <div class="mini-sticky-task-title">{{ displayTaskTitle(task.title) }}</div>
          <div class="mini-sticky-meta">{{ metaLine(task) }}</div>
        </div>
      </li>
    </ul>

    <div v-else class="mini-sticky-empty">
      <p>今日暂无待办</p>
      <p class="mini-sticky-empty-hint">在主窗口任务组中添加后会出现在这里</p>
    </div>

    <footer class="mini-sticky-foot">
      <span class="mini-sticky-hint">拖拽顶栏移动 · 置顶便签</span>
    </footer>
  </div>
</template>
