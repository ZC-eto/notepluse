<script setup lang="ts">
import { computed, inject, onBeforeUnmount, onMounted, reactive, ref } from 'vue'
import type { useWorkspace } from '../composables/useWorkspace'
import type { GlobalTask, Task, TaskBlockTarget, TaskPatch } from '../core/types'
import { displayTaskTitle } from '../core/taskSyntax'
import ConfirmDialog from '../components/ConfirmDialog.vue'
import HelpTip from '../components/HelpTip.vue'
import ScopeSeg from '../components/ScopeSeg.vue'
import TaskInspector from '../components/TaskInspector.vue'
import { globalTaskKey } from '../core/globalTasks'

const ws = inject('workspace') as ReturnType<typeof useWorkspace>
const dayWidth = 36
const scope = ref<'current' | 'all'>('current')

const draftTitle = ref('')
const draftStart = ref('')
const draftEnd = ref('')
const draftTargetKey = ref('')
const pendingDelete = ref<TaskLike | null>(null)
const scheduleMessage = ref('')
const selectedTaskKey = ref<string | null>(null)
/** 有列表时折叠添加条，空态默认展开 */
const composeOpen = ref(false)

type TaskLike = Task | GlobalTask
type GanttKind = 'range' | 'milestone'
type DragMode = 'move' | 'resize-start' | 'resize-end'
interface GanttEntry {
  task: TaskLike
  kind: GanttKind
}
interface DragState {
  entry: GanttEntry
  mode: DragMode
  originX: number
  originStart: string
  originEnd: string
  draftStart: string
  draftEnd: string
}

const COLOR_HEX: Record<string, string> = {
  gray: 'var(--task-gray)',
  blue: 'var(--task-blue)',
  green: 'var(--task-green)',
  orange: 'var(--task-orange)',
  red: 'var(--task-red)',
  violet: 'var(--task-violet)',
}

const drag = ref<DragState | null>(null)
const draftMap = reactive<Record<string, { start?: string; end?: string }>>({})
/** Skip the click that follows a drag so detail doesn't flash open/closed. */
let suppressBarClick = false

function isLocalDate(value?: string | null): value is string {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const [year, month, day] = value.split('-').map(Number)
  const parsed = new Date(year, month - 1, day)
  return parsed.getFullYear() === year && parsed.getMonth() === month - 1 && parsed.getDate() === day
}

function toDate(value: string): Date {
  return new Date(`${value}T00:00:00`)
}

function addDays(date: Date, days: number): Date {
  const next = new Date(date)
  next.setDate(next.getDate() + days)
  return next
}

function fmt(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function dayDiff(a: Date, b: Date) {
  return Math.round((a.getTime() - b.getTime()) / 86_400_000)
}

function rowId(task: TaskLike): string {
  return 'notePath' in task ? globalTaskKey(task) : task.id
}

function notePath(task: TaskLike) {
  return 'notePath' in task ? task.notePath : ws.activePath
}

const currentTasks = computed<TaskLike[]>(() => (ws.tasks || []) as Task[])
const allTasks = computed<TaskLike[]>(() => ((ws as any).allTasks || []) as GlobalTask[])
const taskBlockTargets = computed<TaskBlockTarget[]>(() => ((ws as any).taskBlockTargets || []) as TaskBlockTarget[])
const selectedTarget = computed(() => taskBlockTargets.value.find((target) => targetKey(target) === draftTargetKey.value) || null)
const hasTargets = computed(() => taskBlockTargets.value.length > 0)

function isRange(task: TaskLike) {
  return (task.type === 'task' || task.type === 'group')
    && isLocalDate(task.start)
    && isLocalDate(task.end)
    && task.start < task.end
}

function isMilestone(task: TaskLike) {
  return task.type === 'milestone' && isLocalDate(task.date)
}

function toEntry(task: TaskLike): GanttEntry | null {
  if (isRange(task)) return { task, kind: 'range' }
  if (isMilestone(task)) return { task, kind: 'milestone' }
  return null
}

const sourceTasks = computed(() => (scope.value === 'all' ? allTasks.value : currentTasks.value))
const scheduledTasks = computed<GanttEntry[]>(() => sourceTasks.value.map(toEntry).filter((entry): entry is GanttEntry => entry !== null))
const selectedEntry = computed(() => scheduledTasks.value.find((entry) => rowId(entry.task) === selectedTaskKey.value) || null)


const ganttHelpText = '仅显示合法的跨日 @start + @end 执行区间和 @type(milestone) + @date；单日、截止和无日期任务不会伪装成进度条。选中任务后可在详情或日期栏中键盘编辑，不依赖拖拽。'
const ganttEmptyHelpText = '请创建跨日执行区间，或在源码中定义带 @date 的里程碑。截止日期不属于甘特条。'
const ganttWriteHelpText = '没有可写的任务组；请在源码模式先创建合法任务组。'
const taskBlockHowToText =
  '在 Markdown 源码中用 HTML 注释包裹任务清单，例如：<!-- mdw:tasks id="sprint" name="迭代" color="violet" --> … - [ ] 事项 @start(2026-07-20) @end(2026-07-24) … <!-- /mdw:tasks -->。甘特仅投影任务组内合法区间与里程碑。'
const excludedHelpText = computed(() =>
  excludedCount.value
    ? `已有 ${excludedCount.value} 条带日期任务未进入甘特：它们是单日/截止任务、缺少完整区间，或日期无效。请在日历或源码中查看。`
    : ''
)
const excludedCount = computed(() => sourceTasks.value.filter((task) => {
  const hasAnyTiming = Boolean(task.date || task.due || task.start || task.end)
  return hasAnyTiming && !toEntry(task)
}).length)

const scopeOptions = computed(() => [
  { id: 'current', label: '本篇', title: '当前笔记中的合法执行区间和里程碑' },
  {
    id: 'all',
    label: '全部',
    title: '所有笔记中的合法执行区间和里程碑',
    count: allTasks.value.map(toEntry).filter(Boolean).length || undefined,
  },
])

function taskColor(task: TaskLike): string {
  const blockColor = taskBlockTargets.value.find((target) => target.notePath === notePath(task) && target.blockId === task.blockId)?.color
  return COLOR_HEX[task.color || blockColor || 'blue'] || COLOR_HEX.blue
}

function targetKey(target: TaskBlockTarget) {
  return `${target.notePath}::${target.blockId}`
}

function bounds(entry: GanttEntry): { start: Date; end: Date } {
  if (entry.kind === 'milestone') {
    const date = toDate(entry.task.date!)
    return { start: date, end: date }
  }
  const draft = draftMap[rowId(entry.task)]
  return {
    start: toDate(draft?.start || entry.task.start!),
    end: toDate(draft?.end || entry.task.end!),
  }
}

const range = computed(() => {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  if (!scheduledTasks.value.length) return { start: addDays(today, -2), end: addDays(today, 18) }

  let min = today.getTime()
  let max = today.getTime()
  for (const entry of scheduledTasks.value) {
    const { start, end } = bounds(entry)
    min = Math.min(min, start.getTime())
    max = Math.max(max, end.getTime())
  }
  return { start: addDays(new Date(min), -1), end: addDays(new Date(max), 4) }
})

const days = computed(() => {
  const result: Date[] = []
  for (let cursor = new Date(range.value.start); cursor <= range.value.end; cursor = addDays(cursor, 1)) result.push(new Date(cursor))
  return result
})

const todayStr = fmt(new Date())
const todayLineLeft = computed(() => {
  const offset = dayDiff(toDate(todayStr), range.value.start)
  return offset < 0 || offset >= days.value.length ? null : offset * dayWidth + dayWidth / 2
})

function barStyle(entry: GanttEntry) {
  const { start, end } = bounds(entry)
  const offset = dayDiff(start, range.value.start)
  const color = taskColor(entry.task)
  if (entry.kind === 'milestone') {
    return {
      left: `${offset * dayWidth + Math.max(7, dayWidth / 2 - 8)}px`,
      width: '16px',
      height: '16px',
      top: '10px',
      backgroundColor: color,
      transform: 'rotate(45deg)',
      borderRadius: '2px',
    }
  }
  const span = dayDiff(addDays(end, 1), start)
  return {
    left: `${offset * dayWidth}px`,
    width: `${Math.max(dayWidth - 6, span * dayWidth - 6)}px`,
    backgroundColor: color,
    opacity: entry.task.done ? '0.55' : '1',
  }
}

function barTitle(entry: GanttEntry) {
  const task = entry.task
  const dates = entry.kind === 'milestone' ? `里程碑 ${task.date}` : `${displayStart(task)} → ${displayEnd(task)}`
  return `${displayTaskTitle(task.title)}\n${dates}\n${headingLabel(task)}\n${sourceLabel(task)} / ${task.blockId}`
}

function displayStart(task: TaskLike) {
  return draftMap[rowId(task)]?.start || task.start || ''
}

function displayEnd(task: TaskLike) {
  return draftMap[rowId(task)]?.end || task.end || ''
}

function sourceLabel(task: TaskLike) {
  if ('notePath' in task) return `${task.folder ? `${task.folder} / ` : ''}${task.noteName}`
  return ws.activeNote?.name || '当前笔记'
}

function headingLabel(task: TaskLike) {
  return task.headingPath.length ? task.headingPath.join(' / ') : '未归类标题'
}

function canWrite(task: TaskLike) {
  return task.isWritable === true
}

function selectEntry(entry: GanttEntry, mode: 'open' | 'toggle' = 'toggle') {
  if (mode === 'toggle' && suppressBarClick) {
    suppressBarClick = false
    return
  }
  const id = rowId(entry.task)
  if (mode === 'open') {
    selectedTaskKey.value = id
    return
  }
  selectedTaskKey.value = selectedTaskKey.value === id ? null : id
}

function clearSelection() {
  selectedTaskKey.value = null
}

function isEntrySelected(entry: GanttEntry) {
  return selectedTaskKey.value === rowId(entry.task)
}

function onGanttKeydown(event: KeyboardEvent) {
  if (event.key !== 'Escape') return
  if (!selectedTaskKey.value) return
  const target = event.target as HTMLElement | null
  if (target && (target.tagName === 'INPUT' || target.tagName === 'SELECT' || target.tagName === 'TEXTAREA')) return
  event.preventDefault()
  clearSelection()
}

function blockLabel(task: TaskLike) {
  const target = taskBlockTargets.value.find((item) => item.notePath === notePath(task) && item.blockId === task.blockId)
  return target?.blockName || task.blockId
}

function handleInspectorPatch(task: TaskLike, patch: TaskPatch) {
  if (!canWrite(task)) return
  if ('notePath' in task) {
    ;(ws as any).patchGlobalTask?.(task, patch)
  } else {
    ws.patchTask(task, patch)
  }
}

function handleInspectorToggle(task: TaskLike) {
  toggleTask(task)
}

async function handleInspectorOpenSource(task: TaskLike) {
  if ('notePath' in task) {
    await (ws as any).openGlobalTask?.(task, { view: 'editor' })
  } else {
    ws.setView('editor')
  }
}

function entryAriaLabel(entry: GanttEntry) {
  const timing = entry.kind === 'milestone'
    ? `里程碑，${entry.task.date}`
    : `执行区间，${displayStart(entry.task)} 至 ${displayEnd(entry.task)}`
  const writable = canWrite(entry.task) ? '可编辑' : '只读'
  return `${displayTaskTitle(entry.task.title)}，${timing}，${writable}。按 Enter 查看详情；Alt 加左右方向键可调整排期。`
}

function onEntryKeydown(entry: GanttEntry, event: KeyboardEvent) {
  if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault()
    selectEntry(entry, 'toggle')
    return
  }
  if (!event.altKey || (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight')) return

  event.preventDefault()
  selectEntry(entry)
  if (!canWrite(entry.task)) {
    scheduleMessage.value = '该任务只读；请打开源码修复重复或缺失的 @id。'
    return
  }

  const delta = event.key === 'ArrowLeft' ? -1 : 1
  if (entry.kind === 'milestone') {
    const current = entry.task.date
    if (!isLocalDate(current)) return
    const date = fmt(addDays(toDate(current), delta))
    handleInspectorPatch(entry.task, { date })
    scheduleMessage.value = `已将里程碑调整至 ${date}。`
    return
  }

  const currentStart = displayStart(entry.task)
  const currentEnd = displayEnd(entry.task)
  if (!isLocalDate(currentStart) || !isLocalDate(currentEnd)) return
  const start = event.shiftKey && delta < 0
    ? fmt(addDays(toDate(currentStart), -1))
    : event.shiftKey
      ? currentStart
      : fmt(addDays(toDate(currentStart), delta))
  const end = event.shiftKey && delta > 0
    ? fmt(addDays(toDate(currentEnd), 1))
    : event.shiftKey
      ? currentEnd
      : fmt(addDays(toDate(currentEnd), delta))
  commitRange(entry.task, start, end)
  scheduleMessage.value = event.shiftKey
    ? `已扩展执行区间：${start} 至 ${end}。`
    : `已整体移动执行区间：${start} 至 ${end}。`
}

function onPointerDown(entry: GanttEntry, mode: DragMode, event: PointerEvent) {
  if (entry.kind !== 'range' || !canWrite(entry.task)) return
  event.preventDefault()
  event.stopPropagation()
  const start = displayStart(entry.task)
  const end = displayEnd(entry.task)
  if (!isLocalDate(start) || !isLocalDate(end) || start >= end) return
  scheduleMessage.value = ''
  drag.value = {
    entry,
    mode,
    originX: event.clientX,
    originStart: start,
    originEnd: end,
    draftStart: start,
    draftEnd: end,
  }
  draftMap[rowId(entry.task)] = { start, end }
  window.addEventListener('pointermove', onPointerMove)
  window.addEventListener('pointerup', onPointerUp)
  window.addEventListener('pointercancel', onPointerUp)
}

function onPointerMove(event: PointerEvent) {
  if (!drag.value) return
  const state = drag.value
  const delta = Math.round((event.clientX - state.originX) / dayWidth)
  let start = toDate(state.originStart)
  let end = toDate(state.originEnd)
  if (state.mode === 'move') {
    start = addDays(start, delta)
    end = addDays(end, delta)
  } else if (state.mode === 'resize-start') {
    start = addDays(start, delta)
  } else {
    end = addDays(end, delta)
  }

  const startText = fmt(start)
  const endText = fmt(end)
  if (startText >= endText) {
    scheduleMessage.value = '开始日期必须早于结束日期；已拒绝反向或零长度区间。'
    state.draftStart = state.originStart
    state.draftEnd = state.originEnd
    draftMap[rowId(state.entry.task)] = { start: state.originStart, end: state.originEnd }
    return
  }
  scheduleMessage.value = ''
  state.draftStart = startText
  state.draftEnd = endText
  draftMap[rowId(state.entry.task)] = { start: startText, end: endText }
}

function cleanupDragListeners() {
  window.removeEventListener('pointermove', onPointerMove)
  window.removeEventListener('pointerup', onPointerUp)
  window.removeEventListener('pointercancel', onPointerUp)
}

function onPointerUp() {
  if (!drag.value) return
  const state = drag.value
  cleanupDragListeners()
  drag.value = null
  const id = rowId(state.entry.task)
  const moved = state.draftStart !== state.originStart || state.draftEnd !== state.originEnd
  if (moved) {
    commitRange(state.entry.task, state.draftStart, state.draftEnd)
    // Drag gesture ends with a synthetic click — don't toggle the detail panel closed.
    suppressBarClick = true
    window.setTimeout(() => { suppressBarClick = false }, 0)
  }
  window.setTimeout(() => delete draftMap[id], 250)
}

function commitRange(task: TaskLike, start: string, end: string) {
  if (!canWrite(task)) return
  if (!isLocalDate(start) || !isLocalDate(end) || start >= end) {
    scheduleMessage.value = '开始日期必须早于结束日期；没有保存任何变更。'
    return
  }
  scheduleMessage.value = ''
  if ('notePath' in task) {
    ;(ws as any).onScheduleGlobalTask?.(task, start, end)
  } else {
    ws.onScheduleChange(task.id, start, end)
  }
}

function onRangeDateChange(task: TaskLike, field: 'start' | 'end', event: Event) {
  const next = (event.target as HTMLInputElement).value
  const start = field === 'start' ? next : displayStart(task)
  const end = field === 'end' ? next : displayEnd(task)
  if (!isLocalDate(start) || !isLocalDate(end) || start >= end) {
    scheduleMessage.value = '开始日期必须早于结束日期；没有自动交换日期。'
    return
  }
  draftMap[rowId(task)] = { start, end }
  commitRange(task, start, end)
  window.setTimeout(() => delete draftMap[rowId(task)], 250)
}

function onMilestoneDateChange(task: TaskLike, event: Event) {
  const date = (event.target as HTMLInputElement).value
  if (!canWrite(task) || !isLocalDate(date)) return
  if ('notePath' in task) {
    ;(ws as any).patchGlobalTask?.(task, { date })
  } else {
    ws.patchTask(task, { date })
  }
}

function toggleTask(task: TaskLike) {
  if (!canWrite(task)) return
  if ('notePath' in task) {
    ;(ws as any).onToggleGlobalTask?.(task)
  } else {
    ws.onToggleTask(task.id)
  }
}

function requestRemove(task: TaskLike) {
  if (canWrite(task)) pendingDelete.value = task
}

function confirmRemove() {
  const task = pendingDelete.value
  if (!task || !canWrite(task)) return
  if ('notePath' in task) {
    ;(ws as any).onRemoveGlobalTask?.(task)
  } else {
    ws.onRemoveTask(task.id)
  }
  pendingDelete.value = null
}

function cancelRemove() {
  pendingDelete.value = null
}

async function quickAdd() {
  const title = draftTitle.value.trim()
  const target = selectedTarget.value
  if (!title || !target) return
  if (!isLocalDate(draftStart.value) || !isLocalDate(draftEnd.value) || draftStart.value >= draftEnd.value) {
    scheduleMessage.value = '请填写合法的跨日执行区间（开始日期必须早于结束日期）。'
    return
  }
  const added = await ws.onAddTask(
    { title, start: draftStart.value, end: draftEnd.value, type: 'task' },
    { notePath: target.notePath, blockId: target.blockId },
  )
  if (added) {
    draftTitle.value = ''
    draftStart.value = ''
    draftEnd.value = ''
    draftTargetKey.value = ''
    scheduleMessage.value = ''
  }
}

function fillDemoSamples() {
  void (ws as any).ensureDemoSamples?.()
}

function weekday(date: Date) {
  return ['日', '一', '二', '三', '四', '五', '六'][date.getDay()]
}

onMounted(() => {
  window.addEventListener('keydown', onGanttKeydown)
  window.addEventListener('mdw:escape-layer', clearSelection as any)
})

onBeforeUnmount(() => {
  cleanupDragListeners()
  window.removeEventListener('keydown', onGanttKeydown)
  window.removeEventListener('mdw:escape-layer', clearSelection as any)
})
</script>

<template>
  <div class="gantt-view">
    <header class="view-toolbar gantt-toolbar" aria-label="甘特工具栏">
      <div class="view-toolbar-primary">
        <div class="view-title-row">
          <h2 class="gantt-title">排期</h2>
          <HelpTip :text="ganttHelpText" label="甘特视图说明" />
          <span
            v-if="excludedCount"
            class="status-chip"
            :title="excludedHelpText"
          >
            未投影 {{ excludedCount }}
            <HelpTip :text="excludedHelpText" label="未进入甘特的任务说明" />
          </span>
        </div>
        <div class="view-toolbar-cluster">
          <ScopeSeg v-model="scope" :options="scopeOptions" aria-label="甘特范围" />
          <button
            v-if="hasTargets && scheduledTasks.length"
            type="button"
            class="btn-ghost sm"
            :class="{ active: composeOpen }"
            :aria-expanded="composeOpen"
            aria-controls="gantt-compose-bar"
            @click="composeOpen = !composeOpen"
          >{{ composeOpen ? '收起添加' : '添加' }}</button>
        </div>
      </div>
      <p v-if="scheduleMessage" class="view-alert" role="status">{{ scheduleMessage }}</p>
    </header>

    <div
      v-if="hasTargets && (composeOpen || !scheduledTasks.length)"
      id="gantt-compose-bar"
      class="gantt-compose-bar"
      aria-label="快速添加跨日任务"
    >
      <input
        v-model="draftTitle"
        class="composer-input"
        :placeholder="scheduledTasks.length ? '继续添加跨日任务' : '跨日任务标题'"
        @keyup.enter="quickAdd"
      />
      <input v-model="draftStart" class="date-input" type="date" aria-label="开始日期" />
      <span class="date-sep" aria-hidden="true">→</span>
      <input v-model="draftEnd" class="date-input" type="date" aria-label="结束日期" />
      <select v-model="draftTargetKey" class="date-input" aria-label="新任务写入目标">
        <option value="" disabled>选择笔记与任务组</option>
        <option v-for="target in taskBlockTargets" :key="targetKey(target)" :value="targetKey(target)">
          {{ target.folder ? `${target.folder} / ` : '' }}{{ target.noteName }} · {{ target.blockName }}
        </option>
      </select>
      <button type="button" class="btn-solid" :disabled="!draftTitle.trim() || !selectedTarget" @click="quickAdd">添加</button>
    </div>
    <p v-if="!hasTargets && scheduledTasks.length" class="composer-inline-help gantt-compose-hint">
      <HelpTip :text="ganttWriteHelpText" label="写入目标说明" />
      <span>需先有任务组</span>
    </p>

    <div class="gantt-stage" :class="{ 'is-empty': !scheduledTasks.length }">
      <div class="gantt-board" :aria-hidden="!scheduledTasks.length">
        <div class="gantt-left">
          <div class="gantt-corner">任务</div>
          <template v-if="scheduledTasks.length">
            <div
              v-for="entry in scheduledTasks"
              :key="rowId(entry.task)"
              class="gantt-label"
              :class="{ done: entry.task.done, 'is-readonly': !canWrite(entry.task) }"
              :style="{ paddingInlineStart: `${12 + entry.task.depth * 12}px` }"
            >
              <input type="checkbox" :checked="entry.task.done" :disabled="!canWrite(entry.task)" :aria-label="`切换 ${displayTaskTitle(entry.task.title)} 完成状态`" @change="toggleTask(entry.task)" />
              <button
                type="button"
                class="gantt-label-select"
                :class="{ selected: isEntrySelected(entry) }"
                :title="barTitle(entry)"
                @click="selectEntry(entry)"
              >
                <span class="gantt-label-text">
                  <span :style="{ color: taskColor(entry.task) }" aria-hidden="true">{{ entry.kind === 'milestone' ? '◆' : '—' }}</span>
                  {{ displayTaskTitle(entry.task.title) }}
                  <small> · {{ headingLabel(entry.task) }} · {{ sourceLabel(entry.task) }}</small>
                </span>
              </button>
              <button type="button" class="gantt-del" :disabled="!canWrite(entry.task)" :title="canWrite(entry.task) ? '删除' : '只读任务不可删除'" @click="requestRemove(entry.task)">×</button>
            </div>
          </template>
          <div v-else class="gantt-label gantt-label-placeholder" aria-hidden="true">
            <span class="gantt-label-text muted">暂无跨日任务</span>
          </div>
        </div>

        <div class="gantt-right">
          <div class="gantt-timeline" :style="{ width: `${days.length * dayWidth}px` }">
            <div class="gantt-days">
              <div
                v-for="day in days"
                :key="fmt(day)"
                class="gantt-day"
                :class="{ today: fmt(day) === todayStr, weekend: day.getDay() === 0 || day.getDay() === 6 }"
                :style="{ width: `${dayWidth}px` }"
              >
                <span class="d-num">{{ day.getDate() }}</span>
                <span class="d-week">{{ weekday(day) }}</span>
              </div>
            </div>
            <div v-if="todayLineLeft != null" class="gantt-today-line" :style="{ left: `${todayLineLeft}px` }" title="今天" />
            <template v-if="scheduledTasks.length">
              <div v-for="entry in scheduledTasks" :key="`bar-${rowId(entry.task)}`" class="gantt-row">
                <div
                  v-if="entry.kind === 'range'"
                  class="gantt-bar"
                  :class="{ done: entry.task.done, dragging: drag?.entry && rowId(drag.entry.task) === rowId(entry.task), selected: isEntrySelected(entry), 'is-readonly': !canWrite(entry.task) }"
                  :style="barStyle(entry)"
                  :title="barTitle(entry)"
                  role="button"
                  tabindex="0"
                  :aria-label="entryAriaLabel(entry)"
                  @click="selectEntry(entry)"
                  @keydown="onEntryKeydown(entry, $event)"
                  @pointerdown="selectEntry(entry, 'open'); onPointerDown(entry, 'move', $event)"
                >
                  <span class="gantt-handle left" :aria-hidden="!canWrite(entry.task)" @pointerdown.stop="selectEntry(entry, 'open'); onPointerDown(entry, 'resize-start', $event)" />
                  <span class="gantt-bar-label">{{ displayTaskTitle(entry.task.title) }}</span>
                  <span class="gantt-handle right" :aria-hidden="!canWrite(entry.task)" @pointerdown.stop="selectEntry(entry, 'open'); onPointerDown(entry, 'resize-end', $event)" />
                </div>
                <div v-else class="gantt-milestone" :class="{ selected: isEntrySelected(entry), 'is-readonly': !canWrite(entry.task) }" :style="barStyle(entry)" :title="barTitle(entry)" role="button" tabindex="0" :aria-label="entryAriaLabel(entry)" @click="selectEntry(entry)" @keydown="onEntryKeydown(entry, $event)" />
              </div>
            </template>
            <div v-else class="gantt-row gantt-row-placeholder" aria-hidden="true">
              <div class="gantt-ghost-bar" />
              <div class="gantt-ghost-bar short" />
            </div>
          </div>
        </div>
      </div>

      <div v-if="!scheduledTasks.length" class="gantt-empty" role="status">
        <div class="empty-title-row">
          <div class="empty-title">暂无可绘制的排期</div>
          <HelpTip :text="ganttEmptyHelpText" label="空排期说明" />
        </div>
        <template v-if="!hasTargets">
          <p class="empty-desc">只显示任务组里的跨日区间与里程碑。可先填示例，或在源码声明任务组。</p>
          <div class="empty-actions">
            <button type="button" class="btn-solid" @click="fillDemoSamples">填充示例数据</button>
            <span class="composer-inline-help">
              <HelpTip :text="taskBlockHowToText" label="如何写任务组" />
              <span>如何写任务组</span>
            </span>
          </div>
        </template>
        <p v-else class="empty-desc">在上方填写标题与跨日区间即可添加。</p>
      </div>
    </div>

    <template v-if="selectedEntry">
      <div class="gantt-task-panel" role="region" aria-label="任务详情">
        <div class="gantt-panel-head">
          <strong class="gantt-panel-title">{{ displayTaskTitle(selectedEntry.task.title) }}</strong>
          <button type="button" class="btn-ghost sm" @click="clearSelection">关闭</button>
        </div>

        <div class="gantt-panel-dates" :class="{ 'is-readonly': !canWrite(selectedEntry.task) }">
          <template v-if="selectedEntry.kind === 'range'">
            <label class="gantt-date-field">
              <span>开始</span>
              <input class="date-input" type="date" :disabled="!canWrite(selectedEntry.task)" :value="displayStart(selectedEntry.task)" aria-label="开始日期" @change="onRangeDateChange(selectedEntry.task, 'start', $event)" />
            </label>
            <span class="date-sep" aria-hidden="true">→</span>
            <label class="gantt-date-field">
              <span>结束</span>
              <input class="date-input" type="date" :disabled="!canWrite(selectedEntry.task)" :value="displayEnd(selectedEntry.task)" aria-label="结束日期" @change="onRangeDateChange(selectedEntry.task, 'end', $event)" />
            </label>
          </template>
          <template v-else>
            <span class="date-sep" aria-hidden="true">◆</span>
            <label class="gantt-date-field">
              <span>里程碑</span>
              <input class="date-input" type="date" :disabled="!canWrite(selectedEntry.task)" :value="selectedEntry.task.date" aria-label="里程碑日期" @change="onMilestoneDateChange(selectedEntry.task, $event)" />
            </label>
          </template>
          <span v-if="!canWrite(selectedEntry.task)" class="status-chip muted">只读</span>
        </div>

        <div class="gantt-task-panel-actions">
          <button type="button" class="btn-ghost" @click="clearSelection">关闭详情</button>
          <button type="button" class="btn-ghost danger" :disabled="!canWrite(selectedEntry.task)" @click="requestRemove(selectedEntry.task)">删除任务</button>
        </div>
        <TaskInspector
          :task="selectedEntry.task"
          :related-tasks="sourceTasks"
          :diagnostics="ws.taskDiagnostics"
          :block-name="blockLabel(selectedEntry.task)"
          :source-note="{ name: ws.activeNote?.name || '当前笔记', path: ws.activePath }"
          @request-patch="handleInspectorPatch"
          @request-toggle="handleInspectorToggle"
          @request-open-source="handleInspectorOpenSource"
        />
      </div>
    </template>

    <ConfirmDialog
      :open="!!pendingDelete"
      title="删除任务"
      :message="pendingDelete ? `确定删除「${displayTaskTitle(pendingDelete.title)}」？` : ''"
      confirm-text="删除"
      danger
      @confirm="confirmRemove"
      @cancel="cancelRemove"
    />
  </div>
</template>