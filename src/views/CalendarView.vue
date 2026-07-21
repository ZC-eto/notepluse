<script setup lang="ts">
import { computed, inject, nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import type { useWorkspace } from '../composables/useWorkspace'
import type { GlobalTask, Task, TaskBlockTarget, TaskPatch } from '../core/types'
import { displayTaskTitle } from '../core/taskSyntax'
import ScopeSeg from '../components/ScopeSeg.vue'
import TaskInspector from '../components/TaskInspector.vue'
import { globalTaskKey } from '../core/globalTasks'

const ws = inject('workspace') as ReturnType<typeof useWorkspace>

const cursor = ref(new Date())
const WEEKDAYS = ['一', '二', '三', '四', '五', '六', '日']
const scope = ref<'current' | 'all'>('current')
/** month = 月网格；day = 单日议程 */
const calMode = ref<'month' | 'day'>('month')
const focusDay = ref<string | null>(null)

const composeDay = ref<string | null>(null)
const composeTitle = ref('')
const composeTargetKey = ref('')
const composeInput = ref<HTMLInputElement | null>(null)
const selectedEventKey = ref<string | null>(null)

function closeTaskPanel() {
  selectedEventKey.value = null
  composeDay.value = null
}

function onEscapeLayer() {
  if (selectedEventKey.value || composeDay.value) {
    closeTaskPanel()
    return
  }
  if (calMode.value === 'day') {
    calMode.value = 'month'
    focusDay.value = null
  }
}

function onCalKeydown(ev: KeyboardEvent) {
  // 输入框内不劫持
  const t = ev.target as HTMLElement | null
  if (t && ['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName)) return
  if (ev.ctrlKey || ev.metaKey || ev.altKey) return

  if (calMode.value === 'month') {
    if (ev.key === 'ArrowLeft' || ev.key === 'ArrowUp' || ev.key === 'PageUp') {
      ev.preventDefault()
      shiftMonth(-1)
      return
    }
    if (ev.key === 'ArrowRight' || ev.key === 'ArrowDown' || ev.key === 'PageDown') {
      ev.preventDefault()
      shiftMonth(1)
      return
    }
    if (ev.key === 't' || ev.key === 'T') {
      ev.preventDefault()
      goToday()
      return
    }
  } else if (calMode.value === 'day' && focusDay.value) {
    if (ev.key === 'ArrowLeft' || ev.key === 'ArrowUp') {
      ev.preventDefault()
      shiftFocusDay(-1)
      return
    }
    if (ev.key === 'ArrowRight' || ev.key === 'ArrowDown') {
      ev.preventDefault()
      shiftFocusDay(1)
      return
    }
    if (ev.key === 'Escape') {
      ev.preventDefault()
      calMode.value = 'month'
      focusDay.value = null
      return
    }
    if (ev.key === 't' || ev.key === 'T') {
      ev.preventDefault()
      focusDay.value = today
      return
    }
  }
}

onMounted(() => {
  window.addEventListener('mdw:escape-layer', onEscapeLayer)
  window.addEventListener('keydown', onCalKeydown)
})
onBeforeUnmount(() => {
  window.removeEventListener('mdw:escape-layer', onEscapeLayer)
  window.removeEventListener('keydown', onCalKeydown)
})


type TaskLike = Task | GlobalTask
type CalendarKind = 'date' | 'due' | 'range' | 'milestone'
interface CalendarEvent {
  key: string
  day: string
  kind: CalendarKind
  task: TaskLike
  rangePosition?: 'start' | 'continuation'
}

const COLOR_HEX: Record<string, string> = {
  gray: 'var(--task-gray)',
  blue: 'var(--task-blue)',
  green: 'var(--task-green)',
  orange: 'var(--task-orange)',
  red: 'var(--task-red)',
  violet: 'var(--task-violet)',
}

function isLocalDate(value?: string | null): value is string {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const [year, month, day] = value.split('-').map(Number)
  const parsed = new Date(year, month - 1, day)
  return parsed.getFullYear() === year && parsed.getMonth() === month - 1 && parsed.getDate() === day
}

function fmt(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function monthLabel(d: Date) {
  return `${d.getFullYear()} 年 ${d.getMonth() + 1} 月`
}

function shiftMonth(n: number) {
  const d = new Date(cursor.value)
  d.setMonth(d.getMonth() + n)
  cursor.value = d
}

function goToday() {
  cursor.value = new Date()
  if (calMode.value === 'day') focusDay.value = today
}

function shiftFocusDay(n: number) {
  if (!focusDay.value) return
  const [y, m, d] = focusDay.value.split('-').map(Number)
  const next = new Date(y, m - 1, d + n)
  focusDay.value = fmt(next)
  cursor.value = new Date(next.getFullYear(), next.getMonth(), 1)
}

function openDayView(day: string) {
  if (!day) return
  focusDay.value = day
  calMode.value = 'day'
  const [y, m] = day.split('-').map(Number)
  cursor.value = new Date(y, m - 1, 1)
  selectedEventKey.value = null
}

function backToMonth() {
  calMode.value = 'month'
  focusDay.value = null
}

function onCellClick(cellKey: string, inMonth: boolean, ev: MouseEvent) {
  if (!inMonth || !cellKey) return
  // 点在任务或 + 上时不进日视图
  const t = ev.target as HTMLElement | null
  if (t?.closest?.('.cal-task, .cal-day-add, button')) return
  openDayView(cellKey)
}

function selectEvent(event: CalendarEvent) {
  // 单击：仅选中高亮，不强制开面板
  selectedEventKey.value = event.key
}

function openEventDetail(event: CalendarEvent) {
  selectedEventKey.value = event.key
}

function openGanttFromDay() {
  // 跳转甘特查看排期（宿主视图切换）
  ws.setView('gantt')
}

function taskKey(task: TaskLike): string {
  return 'notePath' in task ? globalTaskKey(task) : task.id
}

function displayTitle(task: TaskLike): string {
  return displayTaskTitle(task.title)
}

function taskColor(task: TaskLike): string {
  const blockColor = taskBlockTargets.value.find((target) => target.notePath === notePath(task) && target.blockId === task.blockId)?.color
  return COLOR_HEX[task.color || blockColor || 'blue'] || COLOR_HEX.blue
}

function notePath(task: TaskLike) {
  return 'notePath' in task ? task.notePath : ws.activePath
}

function eventStyle(event: CalendarEvent) {
  const color = taskColor(event.task)
  return {
    borderInlineStartColor: color,
    backgroundColor: `${color}18`,
    color,
  }
}

function eventKindLabel(kind: CalendarKind) {
  return { date: '单日', due: '截止', range: '执行区间', milestone: '里程碑' }[kind]
}

function eventPrefix(kind: CalendarKind) {
  return { date: '○', due: '⌄', range: '—', milestone: '◆' }[kind]
}

function gridEventLabel(event: CalendarEvent) {
  if (event.kind === 'range' && event.rangePosition === 'continuation') return '进行中'
  return displayTitle(event.task)
}

function gridEventPrefix(event: CalendarEvent) {
  return event.kind === 'range' && event.rangePosition === 'continuation' ? '↳' : eventPrefix(event.kind)
}

function gridEventAriaLabel(event: CalendarEvent) {
  const continuation = event.kind === 'range' && event.rangePosition === 'continuation' ? '（执行中）' : ''
  return `${eventKindLabel(event.kind)} · ${displayTitle(event.task)}${continuation} · ${eventDateSummary(event)} · ${sourceLabel(event.task)}`
}

const currentTasks = computed<TaskLike[]>(() => (ws.tasks || []) as Task[])
const allTasks = computed<TaskLike[]>(() => ((ws as any).allTasks || []) as GlobalTask[])
const sourceTasks = computed(() => (scope.value === 'all' ? allTasks.value : currentTasks.value))
const taskBlockTargets = computed<TaskBlockTarget[]>(() => ((ws as any).taskBlockTargets || []) as TaskBlockTarget[])
const selectedTarget = computed(() => taskBlockTargets.value.find((target) => targetKey(target) === composeTargetKey.value) || null)
const hasTargets = computed(() => taskBlockTargets.value.length > 0)

const scopeOptions = computed(() => [
  { id: 'current', label: '本篇', title: '仅当前笔记的显式 Task Block 任务' },
  {
    id: 'all',
    label: '全部',
    title: '所有笔记的显式 Task Block 任务',
    count: allTasks.value.filter(hasCalendarProjection).length || undefined,
  },
])

function hasCalendarProjection(task: TaskLike): boolean {
  if (task.type === 'milestone') return isLocalDate(task.date)
  if (isLocalDate(task.date) || isLocalDate(task.due)) return true
  return Boolean(isLocalDate(task.start) && isLocalDate(task.end) && task.start <= task.end)
}

function eventsForTask(task: TaskLike): CalendarEvent[] {
  const taskId = taskKey(task)
  if (task.type === 'milestone') {
    return isLocalDate(task.date) ? [{ key: `${taskId}:milestone:${task.date}`, day: task.date, kind: 'milestone', task }] : []
  }

  const result: CalendarEvent[] = []
  if (isLocalDate(task.date)) result.push({ key: `${taskId}:date:${task.date}`, day: task.date, kind: 'date', task })
  if (isLocalDate(task.due)) result.push({ key: `${taskId}:due:${task.due}`, day: task.due, kind: 'due', task })
  if (isLocalDate(task.start) && isLocalDate(task.end) && task.start <= task.end) {
    const cursorDate = new Date(`${task.start}T00:00:00`)
    const end = new Date(`${task.end}T00:00:00`)
    while (cursorDate <= end) {
      const day = fmt(cursorDate)
      result.push({
        key: `${taskId}:range:${day}`,
        day,
        kind: 'range',
        task,
        rangePosition: day === task.start ? 'start' : 'continuation',
      })
      cursorDate.setDate(cursorDate.getDate() + 1)
    }
  }
  return result
}

const calendarEvents = computed(() => sourceTasks.value.flatMap(eventsForTask))

const cells = computed(() => {
  const y = cursor.value.getFullYear()
  const m = cursor.value.getMonth()
  const first = new Date(y, m, 1)
  const startPad = (first.getDay() + 6) % 7
  const daysInMonth = new Date(y, m + 1, 0).getDate()
  const list: { date: Date | null; key: string; inMonth: boolean }[] = []
  for (let i = 0; i < startPad; i++) list.push({ date: null, key: `pad-${i}`, inMonth: false })
  for (let day = 1; day <= daysInMonth; day++) {
    const date = new Date(y, m, day)
    list.push({ date, key: fmt(date), inMonth: true })
  }
  while (list.length % 7 !== 0) list.push({ date: null, key: `tail-${list.length}`, inMonth: false })
  return list
})

const today = fmt(new Date())

function eventsForDay(day: string) {
  return calendarEvents.value.filter((event) => event.day === day)
}

function targetKey(target: TaskBlockTarget) {
  return `${target.notePath}::${target.blockId}`
}

async function openAdd(day: string) {
  composeDay.value = day
  composeTitle.value = ''
  composeTargetKey.value = ''
  selectedEventKey.value = null
  await nextTick()
  composeInput.value?.focus()
}

function cancelAdd() {
  composeDay.value = null
  composeTitle.value = ''
  composeTargetKey.value = ''
}

async function submitAdd() {
  if (!composeDay.value || !selectedTarget.value) return
  const title = composeTitle.value.trim()
  if (!title) {
    composeInput.value?.focus()
    return
  }
  const target = selectedTarget.value
  const added = await ws.onAddTask(
    { title, date: composeDay.value },
    { notePath: target.notePath, blockId: target.blockId },
  )
  if (added) cancelAdd()
}

const selectedEvent = computed(() => calendarEvents.value.find((event) => event.key === selectedEventKey.value) || null)

function canWrite(task: TaskLike) {
  return task.isWritable === true
}

function toggleTask(task: TaskLike) {
  if (!canWrite(task)) return
  if ('notePath' in task) {
    ;(ws as any).onToggleGlobalTask?.(task)
  } else {
    ws.onToggleTask(task.id)
  }
}

async function openSource(task: TaskLike) {
  if ('notePath' in task && typeof (ws as any).openGlobalTask === 'function') {
    await (ws as any).openGlobalTask(task, { view: 'editor' })
  }
}

function blockLabel(task: TaskLike) {
  const target = taskBlockTargets.value.find((candidate) => candidate.notePath === notePath(task) && candidate.blockId === task.blockId)
  return target?.blockName || task.blockId
}

function handleInspectorPatch(task: TaskLike, patch: TaskPatch) {
  if ('notePath' in task) {
    ;(ws as any).patchGlobalTask?.(task, patch)
    return
  }
  ws.patchTask(task, patch)
}

function handleInspectorToggle(task: TaskLike) {
  toggleTask(task)
}

async function handleInspectorOpenSource(task: TaskLike) {
  if ('notePath' in task) {
    await (ws as any).openGlobalTask?.(task, { view: 'editor' })
    return
  }
  ws.setView('editor')
}

function sourceLabel(task: TaskLike) {
  if ('notePath' in task) return `${task.folder ? `${task.folder} / ` : ''}${task.noteName}`
  return ws.activeNote?.name || '当前笔记'
}

function headingLabel(task: TaskLike) {
  return task.headingPath.length ? task.headingPath.join(' / ') : '未归类标题'
}

function eventDateSummary(event: CalendarEvent) {
  const task = event.task
  if (event.kind === 'range') return `${task.start} → ${task.end}`
  if (event.kind === 'due') return `截止 ${task.due}`
  return task.date || ''
}
</script>

<template>
  <div class="calendar-view" :data-mode="calMode" tabindex="0">
    <header class="view-toolbar cal-toolbar" aria-label="日历工具栏">
      <div class="view-toolbar-primary">
        <div class="cal-nav quiet">
          <template v-if="calMode === 'month'">
            <button type="button" class="icon-nav" aria-label="上个月" title="上个月 · ←/↑" @click="shiftMonth(-1)">
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14.5 6 8.5 12l6 6" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" /></svg>
            </button>
            <div class="cal-title" aria-live="polite">{{ monthLabel(cursor) }}</div>
            <button type="button" class="icon-nav" aria-label="下个月" title="下个月 · →/↓" @click="shiftMonth(1)">
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9.5 6 6 6-6 6" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" /></svg>
            </button>
            <button type="button" class="text-link" title="今天 · T" @click="goToday">今天</button>
          </template>
          <template v-else>
            <button type="button" class="text-link" @click="backToMonth">← 月视图</button>
            <button type="button" class="icon-nav" aria-label="前一天" title="前一天 · ←" @click="shiftFocusDay(-1)">
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14.5 6 8.5 12l6 6" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" /></svg>
            </button>
            <div class="cal-title" aria-live="polite">{{ focusDay }}</div>
            <button type="button" class="icon-nav" aria-label="后一天" title="后一天 · →" @click="shiftFocusDay(1)">
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9.5 6 6 6-6 6" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" /></svg>
            </button>
            <button type="button" class="text-link" @click="openGanttFromDay">甘特</button>
          </template>
        </div>
        <div class="view-toolbar-cluster quiet">
          <ScopeSeg v-model="scope" :options="scopeOptions" aria-label="日历范围" />
        </div>
      </div>
    </header>

    <!-- 月视图 -->
    <template v-if="calMode === 'month'">
      <div class="cal-board">
        <div class="cal-weekdays" aria-hidden="true">
          <div v-for="weekday in WEEKDAYS" :key="weekday" class="cal-weekday">{{ weekday }}</div>
        </div>
        <div class="cal-grid">
          <div
            v-for="cell in cells"
            :key="cell.key"
            class="cal-cell"
            :class="{ empty: !cell.inMonth, today: cell.key === today, composing: composeDay === cell.key }"
            @click="onCellClick(cell.key, cell.inMonth, $event)"
          >
            <template v-if="cell.date">
              <div class="cal-daynum">
                <span class="cal-daynum-text">{{ cell.date.getDate() }}</span>
                <button
                  type="button"
                  class="cal-day-add quiet"
                  :disabled="!hasTargets"
                  :aria-label="`在 ${cell.key} 新建`"
                  title="新建"
                  @click.stop="openAdd(cell.key)"
                >＋</button>
              </div>
              <div class="cal-tasks">
                <button
                  v-for="event in eventsForDay(cell.key).slice(0, 3)"
                  :key="event.key"
                  type="button"
                  class="cal-task"
                  :class="[
                    { done: event.task.done, selected: selectedEventKey === event.key, 'is-readonly': !canWrite(event.task) },
                    `cal-task-${event.kind}`,
                    { 'cal-range-continuation': event.kind === 'range' && event.rangePosition === 'continuation' },
                  ]"
                  :style="eventStyle(event)"
                  :aria-label="gridEventAriaLabel(event)"
                  :title="gridEventAriaLabel(event) + ' · 双击详情'"
                  @click.stop="selectEvent(event)"
                  @dblclick.stop="openEventDetail(event)"
                ><span aria-hidden="true">{{ gridEventPrefix(event) }}</span> {{ gridEventLabel(event) }}</button>
                <button
                  v-if="eventsForDay(cell.key).length > 3"
                  type="button"
                  class="cal-more"
                  @click.stop="openDayView(cell.key)"
                >+{{ eventsForDay(cell.key).length - 3 }}</button>
              </div>
            </template>
          </div>
        </div>
      </div>
    </template>

    <!-- 日视图 -->
    <template v-else>
      <div class="cal-day-view" role="region" :aria-label="`${focusDay} 日程`">
        <div v-if="focusDay && eventsForDay(focusDay).length" class="cal-day-list">
          <button
            v-for="event in eventsForDay(focusDay)"
            :key="event.key"
            type="button"
            class="cal-day-row"
            :class="{ selected: selectedEventKey === event.key, done: event.task.done }"
            @click="selectEvent(event)"
            @dblclick="openEventDetail(event)"
          >
            <span class="cal-day-kind">{{ eventPrefix(event.kind) }} {{ eventKindLabel(event.kind) }}</span>
            <span class="cal-day-row-title">{{ displayTitle(event.task) }}</span>
            <span class="cal-day-row-meta">{{ eventDateSummary(event) }}</span>
          </button>
        </div>
        <div v-else class="cal-day-empty">这一天还没有日程</div>
        <div class="cal-day-actions">
          <button type="button" class="text-link" :disabled="!hasTargets || !focusDay" @click="focusDay && openAdd(focusDay)">新建</button>
          <button type="button" class="text-link" @click="openGanttFromDay">在甘特中查看</button>
        </div>
      </div>
    </template>

    <div v-if="composeDay" class="cal-compose quiet">
      <div class="cal-compose-row">
        <span class="cal-compose-day">{{ composeDay }}</span>
        <input
          ref="composeInput"
          v-model="composeTitle"
          class="composer-input"
          type="text"
          placeholder="任务标题"
          :disabled="!hasTargets"
          @keyup.enter="submitAdd"
          @keyup.esc="cancelAdd"
        />
        <select v-model="composeTargetKey" class="date-input" :disabled="!hasTargets" aria-label="写入目标">
          <option value="" disabled>笔记 · 任务组</option>
          <option v-for="target in taskBlockTargets" :key="targetKey(target)" :value="targetKey(target)">
            {{ target.folder ? `${target.folder} / ` : '' }}{{ target.noteName }} · {{ target.blockName }}
          </option>
        </select>
        <button type="button" class="text-link" @click="cancelAdd">取消</button>
        <button type="button" class="text-link strong" :disabled="!composeTitle.trim() || !selectedTarget" @click="submitAdd">添加</button>
      </div>
    </div>

    <div v-if="selectedEvent" class="cal-task-panel">
      <div class="cal-task-panel-actions">
        <button type="button" class="text-link" @click="closeTaskPanel">关闭</button>
      </div>
      <TaskInspector
        :task="selectedEvent.task"
        :related-tasks="sourceTasks"
        :diagnostics="ws.taskDiagnostics"
        :block-name="blockLabel(selectedEvent.task)"
        :source-note="{ name: ws.activeNote?.name || '当前笔记', path: ws.activePath }"
        @request-patch="handleInspectorPatch"
        @request-toggle="handleInspectorToggle"
        @request-open-source="handleInspectorOpenSource"
      />
    </div>
  </div>
</template>
