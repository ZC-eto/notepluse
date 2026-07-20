<script setup lang="ts">
import { computed, inject, nextTick, ref } from 'vue'
import type { useWorkspace } from '../composables/useWorkspace'
import type { GlobalTask, Task, TaskBlockTarget, TaskPatch } from '../core/types'
import { displayTaskTitle } from '../core/taskSyntax'
import ScopeSeg from '../components/ScopeSeg.vue'
import HelpTip from '../components/HelpTip.vue'
import TaskInspector from '../components/TaskInspector.vue'
import { globalTaskKey } from '../core/globalTasks'

const ws = inject('workspace') as ReturnType<typeof useWorkspace>

const calendarHelpText = '○ 单日、⌄ 截止、— 执行区间 与 ◆ 里程碑 分别显示；截止日不会被当作执行条。单日、截止、执行区间和里程碑分别呈现；截止不是执行结束日期。'
const calendarEmptyHelpText = '此范围内没有可投影的日期任务。普通 Markdown checklist 不会进入日历。'
const calendarDayEmptyHelpText = '这一天没有来自合法 Task Block 的日程。'
const calendarWriteHelpText = '当前工作区没有合法 Task Block；请在源码模式创建合法任务组后再新建任务。'
const cursor = ref(new Date())
const WEEKDAYS = ['一', '二', '三', '四', '五', '六', '日']
const scope = ref<'current' | 'all'>('current')

const composeDay = ref<string | null>(null)
const composeTitle = ref('')
const composeTargetKey = ref('')
const composeInput = ref<HTMLInputElement | null>(null)
const selectedEventKey = ref<string | null>(null)

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
const mobileDay = ref(today)

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

function selectEvent(event: CalendarEvent) {
  selectedEventKey.value = selectedEventKey.value === event.key ? null : event.key
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
  <div class="calendar-view">
    <header class="view-toolbar cal-toolbar" aria-label="日历工具栏">
      <div class="view-toolbar-primary">
        <div class="cal-nav">
          <button type="button" class="btn-ghost" aria-label="上个月" @click="shiftMonth(-1)">上月</button>
          <div class="cal-title" aria-live="polite">{{ monthLabel(cursor) }}</div>
          <button type="button" class="btn-ghost" aria-label="下个月" @click="shiftMonth(1)">下月</button>
          <button type="button" class="btn-solid" @click="goToday">今天</button>
        </div>
        <div class="view-toolbar-cluster">
          <ScopeSeg v-model="scope" :options="scopeOptions" aria-label="日历范围" />
          <HelpTip :text="calendarHelpText" label="日历图例与语义说明" placement="left" />
        </div>
      </div>
    </header>

    <div v-if="!calendarEvents.length" class="cal-banner">
      <div class="cal-banner-text">
        <span>暂无日期任务</span>
        <HelpTip :text="calendarEmptyHelpText" label="空日历说明" />
      </div>
      <button type="button" class="btn-ghost sm" :disabled="!hasTargets" @click="openAdd(today)">为今天新建</button>
    </div>

    <section class="cal-mobile-agenda" aria-label="移动端日程">
      <div class="cal-mobile-agenda-head">
        <label>查看日期 <input v-model="mobileDay" class="date-input" type="date" /></label>
        <button type="button" class="btn-ghost sm" :disabled="!hasTargets" @click="openAdd(mobileDay)">在这天新建</button>
      </div>

      <div v-if="eventsForDay(mobileDay).length" class="cal-mobile-event-list">
        <button v-for="event in eventsForDay(mobileDay)" :key="event.key" type="button" class="cal-mobile-event" :class="[{ selected: selectedEventKey === event.key, done: event.task.done, 'is-readonly': !canWrite(event.task) }, `cal-task-${event.kind}`]" :style="eventStyle(event)" @click="selectEvent(event)">
          <span class="cal-mobile-event-kind">{{ eventKindLabel(event.kind) }}</span>
          <strong>{{ displayTitle(event.task) }}</strong>
          <span>{{ eventDateSummary(event) }}</span>
        </button>
      </div>
      <div v-else class="empty-state compact day-empty"><div class="empty-title-row"><div class="empty-desc">这天没有日程</div><HelpTip :text="calendarDayEmptyHelpText" label="空日程说明" /></div></div>
    </section>

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
        >
          <template v-if="cell.date">
            <div class="cal-daynum">
              {{ cell.date.getDate() }}
              <button
                type="button"
                class="btn-ghost sm"
                :disabled="!hasTargets"
                :aria-label="`在 ${cell.key} 新建单日任务`"
                title="新建单日任务"
                @click="openAdd(cell.key)"
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
                :title="gridEventAriaLabel(event)"
                @click="selectEvent(event)"
              ><span aria-hidden="true">{{ gridEventPrefix(event) }}</span> {{ gridEventLabel(event) }}</button>
              <div v-if="eventsForDay(cell.key).length > 3" class="cal-more">+{{ eventsForDay(cell.key).length - 3 }}</div>
            </div>
          </template>
        </div>
      </div>
    </div>

    <div v-if="composeDay" class="cal-compose">
      <div class="cal-compose-head">
        <strong>在 {{ composeDay }} 新建单日任务</strong>
        <button type="button" class="btn-ghost sm" @click="cancelAdd">关闭</button>
      </div>
      <div class="cal-compose-row">
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
        <select v-model="composeTargetKey" class="date-input" :disabled="!hasTargets" aria-label="新任务写入目标">
          <option value="" disabled>选择笔记与任务组</option>
          <option v-for="target in taskBlockTargets" :key="targetKey(target)" :value="targetKey(target)">
            {{ target.folder ? `${target.folder} / ` : '' }}{{ target.noteName }} · {{ target.blockName }}
          </option>
        </select>
        <button type="button" class="btn-solid" :disabled="!composeTitle.trim() || !selectedTarget" @click="submitAdd">添加</button>
      </div>
      <div class="composer-inline-help">
        <HelpTip
          :text="hasTargets ? ('将写入所选任务组：- [ ] 标题 @date(' + composeDay + ')') : calendarWriteHelpText"
          label="写入说明"
        />
        <span v-if="hasTargets">写入 @date({{ composeDay }})</span>
        <span v-else>需先创建任务组</span>
      </div>
    </div>

    <div v-if="selectedEvent" class="cal-task-panel">
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
      <div class="cal-task-panel-actions">
        <button type="button" class="btn-ghost sm" @click="selectedEventKey = null">关闭详情</button>
      </div>
    </div>
  </div>
</template>
