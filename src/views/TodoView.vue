<script setup lang="ts">
import { computed, inject, nextTick, ref, watch } from 'vue'
import type { useWorkspace } from '../composables/useWorkspace'
import type { GlobalTask, Task, TaskBlockTarget, TaskKind, TaskPatch, TaskPriority } from '../core/types'
import { displayTaskTitle, hasSchedule, isTodayFocus } from '../core/taskSyntax'
import ScopeSeg from '../components/ScopeSeg.vue'
import HelpTip from '../components/HelpTip.vue'
import ConfirmDialog from '../components/ConfirmDialog.vue'
import TaskInspector from '../components/TaskInspector.vue'
import { globalTaskKey } from '../core/globalTasks'

const ws = inject('workspace') as ReturnType<typeof useWorkspace>

type TodoScope = 'open' | 'done'
type DraftScheduleKind = 'none' | 'date' | 'due' | 'range'
type NatureFilter = 'all' | 'task' | 'goal'

const scope = ref<TodoScope>('open')
const natureFilter = ref<NatureFilter>('all')
const tagFilter = ref<string | null>(null)
const priorityFilter = ref<TaskPriority | null>(null)
const blockFilter = ref<string | null>(null)
const draft = ref('')
const draftScheduleKind = ref<DraftScheduleKind>('none')
const draftDate = ref('')
const draftStart = ref('')
const draftEnd = ref('')
const draftType = ref<TaskKind>('task')
const draftPriority = ref<TaskPriority | ''>('')
const selectedTargetKey = ref('')
const expanded = ref<Record<string, boolean>>({})
const pendingDelete = ref<GlobalTask | null>(null)
const draftInput = ref<HTMLInputElement | null>(null)
/** 有列表时：新建面板默认折叠，避免底部常驻大块 */
const composeOpen = ref(false)
const composeMoreOpen = ref(false)
/** 标签/优先级/任务组筛选默认收起，有激活条件时自动展开 */
const filtersOpen = ref(false)
const seeding = ref(false)

const globalTasks = computed<GlobalTask[]>(() => {
  const list = (ws as any).allTasks as GlobalTask[] | undefined
  return Array.isArray(list) ? list : []
})

/** 新建任务唯一允许写入的目标；普通 checklist 与无效 Block 不会出现在这里。 */
const taskBlockTargets = computed<TaskBlockTarget[]>(() => {
  const targets = (ws as any).taskBlockTargets as TaskBlockTarget[] | undefined
  return Array.isArray(targets) ? targets : []
})

const selectedTarget = computed(() => taskBlockTargets.value.find((target) => targetKey(target) === selectedTargetKey.value) || null)
const hasWritableTarget = computed(() => !!selectedTarget.value)
const today = computed(todayStr)
const isDraftScheduleValid = computed(() => {
  if (draftType.value === 'milestone') return draftScheduleKind.value === 'date' && !!draftDate.value
  if (draftScheduleKind.value === 'none') return true
  if (draftScheduleKind.value === 'date' || draftScheduleKind.value === 'due') return !!draftDate.value
  return !!draftStart.value && !!draftEnd.value && draftStart.value <= draftEnd.value
})
const canAddDraft = computed(() => !!draft.value.trim() && hasWritableTarget.value && isDraftScheduleValid.value)

const scopeHelpText = computed(() => {
  if (scope.value === 'open') {
    return '未完成任务。列表内按「今天 / 已排期 / 未排期」分组。带 #目标 的为长期目标，其余为事项。'
  }
  return '已完成的任务。可在筛选中按标签或任务组收窄。'
})

const emptyTitle = computed(() => {
  if (scope.value === 'open') return '暂无未完成事项'
  return '暂无已完成事项'
})

const emptyHelpText = computed(() =>
  taskBlockTargets.value.length
    ? '选择目标笔记与任务组后即可新建。只有任务组内的显式任务会出现在此。'
    : '还没有可投影的任务组。可在源码插入 <!-- mdw:tasks --> 任务块，或填充示例。'
)

const taskBlockHowToText =
  '在 Markdown 源码中用注释包裹任务清单，例如：<!-- mdw:tasks id="daily" name="今日" --> … - [ ] 事项 @date(2026-07-20) … <!-- /mdw:tasks -->。只有块内任务会进入待办 / 日历 / 甘特。长期目标可加标签 #目标。'

const composerHelpText = computed(() => {
  if (!taskBlockTargets.value.length) {
    return '没有可写的任务组。请在源码中创建合法任务组后再返回。'
  }
  if (!hasWritableTarget.value) {
    return '请选择要写入的笔记和任务组。'
  }
  return '任务写入所选笔记与任务组。可用选项设置排期（@date / @due / @start+@end）、类型与优先级。长期目标请加标签 #目标。'
})

const scopeOptions = computed(() => [
  { id: 'open', label: '未完成', title: '未勾选的任务', count: openTasks.value.length || undefined },
  { id: 'done', label: '已完成', title: '已勾选的任务', count: doneTasks.value.length || undefined },
])

const openTasks = computed(() => globalTasks.value.filter((task) => !task.done))
const doneTasks = computed(() => globalTasks.value.filter((task) => task.done))
const todayTasks = computed(() => globalTasks.value.filter((task) => isTodayFocus(task, today.value)))

const scopedTasks = computed<GlobalTask[]>(() => {
  if (scope.value === 'done') return doneTasks.value
  return openTasks.value
})

/** 列表内时间分组（仅未完成主视图使用） */
type TimeBucket = 'today' | 'scheduled' | 'unscheduled'

function timeBucket(task: GlobalTask): TimeBucket {
  if (isTodayFocus(task, today.value)) return 'today'
  if (hasSchedule(task)) return 'scheduled'
  return 'unscheduled'
}

function isGoalTask(task: GlobalTask): boolean {
  if (task.tags.some((t) => /^(目标|goal|长期)$/i.test(t))) return true
  return false
}

const stats = computed(() => ({
  total: scopedTasks.value.length,
  done: scope.value === 'done' ? scopedTasks.value.length : 0,
  open: scope.value === 'open' ? scopedTasks.value.length : openTasks.value.length,
}))

const progress = computed(() => {
  const all = globalTasks.value.length
  if (!all) return 0
  return Math.round((doneTasks.value.length / all) * 100)
})

const todaySummary = computed(() => {
  let overdue = 0
  let active = 0
  let dueToday = 0
  for (const task of todayTasks.value) {
    if (task.done) continue
    if (task.due && task.due < today.value) overdue++
    else if (task.due === today.value) dueToday++
    else active++
  }
  return { overdue, active, dueToday }
})

const allTags = computed(() => uniqueSorted(scopedTasks.value.flatMap((task) => task.tags)))
const allBlocks = computed(() => {
  const blocks = new Map<string, string>()
  for (const task of globalTasks.value) {
    const key = blockKey(task)
    blocks.set(key, blockLabel(task))
  }
  return Array.from(blocks, ([key, label]) => ({ key, label })).sort((a, b) => a.label.localeCompare(b.label, 'zh-CN'))
})

const list = computed(() => {
  let result = scopedTasks.value.slice()
  if (natureFilter.value === 'goal') result = result.filter((task) => isGoalTask(task))
  if (natureFilter.value === 'task') result = result.filter((task) => !isGoalTask(task))
  if (tagFilter.value) result = result.filter((task) => task.tags.includes(tagFilter.value!))
  if (priorityFilter.value) result = result.filter((task) => task.priority === priorityFilter.value)
  if (blockFilter.value) result = result.filter((task) => blockKey(task) === blockFilter.value)
  return result.sort(sortTasks)
})

/** 分组后的列表（未完成时按时间桶） */
const groupedList = computed(() => {
  if (scope.value === 'done') {
    return [{ id: 'done' as const, label: '已完成', items: list.value }]
  }
  const today: GlobalTask[] = []
  const scheduled: GlobalTask[] = []
  const unscheduled: GlobalTask[] = []
  for (const task of list.value) {
    const b = timeBucket(task)
    if (b === 'today') today.push(task)
    else if (b === 'scheduled') scheduled.push(task)
    else unscheduled.push(task)
  }
  const groups: { id: string; label: string; items: GlobalTask[] }[] = []
  if (today.length) groups.push({ id: 'today', label: '今天', items: today })
  if (scheduled.length) groups.push({ id: 'scheduled', label: '已排期', items: scheduled })
  if (unscheduled.length) groups.push({ id: 'unscheduled', label: '未排期', items: unscheduled })
  return groups
})

const emptyKind = computed(() => {
  if (!scopedTasks.value.length) return 'scope' as const
  if (!list.value.length) return 'filtered' as const
  return null
})

watch(scope, () => {
  clearFilters()
})

watch(taskBlockTargets, (targets) => {
  if (selectedTargetKey.value && targets.some((target) => targetKey(target) === selectedTargetKey.value)) return
  selectedTargetKey.value = ''
}, { immediate: true })

function todayStr(): string {
  const date = new Date()
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function targetKey(target: TaskBlockTarget): string {
  return `${encodeURIComponent(target.notePath)}#${encodeURIComponent(target.blockId)}`
}

function rowKey(task: GlobalTask): string {
  return globalTaskKey(task)
}

function blockKey(task: Pick<GlobalTask, 'notePath' | 'blockId'>): string {
  return `${task.notePath}::${task.blockId}`
}

function sourceLabel(task: GlobalTask): string {
  return task.folder ? `${task.folder} / ${task.noteName}` : task.noteName || '未命名笔记'
}

function blockLabel(task: GlobalTask): string {
  const target = taskBlockTargets.value.find((item) => item.notePath === task.notePath && item.blockId === task.blockId)
  const block = target?.blockName || task.blockId
  const note = task.noteName || target?.noteName || ''
  return note ? `${note} · ${block}` : block
}

function priorityLabel(priority?: TaskPriority | null): string {
  if (!priority) return ''
  return ({ urgent: '紧急', high: '高', medium: '中', low: '低' } as const)[priority]
}

function taskColorCss(color?: string | null): string {
  if (!color) return 'var(--workline, var(--accent))'
  return `var(--task-${color}, var(--workline, var(--accent)))`
}

function headingLabel(task: Task): string {
  return task.headingPath.length ? task.headingPath.join(' / ') : '未归入标题'
}

function parentLabel(task: GlobalTask): string | null {
  if (!task.parentId) return null
  const parent = globalTasks.value.find((candidate) => candidate.notePath === task.notePath && candidate.id === task.parentId)
  return parent ? displayTaskTitle(parent.title) : '父任务'
}

function uniqueSorted(values: string[]): string[] {
  return Array.from(new Set(values.filter(Boolean))).sort((a, b) => a.localeCompare(b, 'zh-CN'))
}

function priorityRank(priority?: TaskPriority): number {
  return ({ urgent: 0, high: 1, medium: 2, low: 3 } as const)[priority || 'medium']
}

/** due 是截止而非区间终点；排序只取下一项真实时间语义。 */
function sortDate(task: Task): string | null {
  if (task.due && task.due < today.value && !task.done) return task.due
  if (task.date) return task.date
  if (task.start && task.end && task.start <= task.end) return task.start
  if (task.due) return task.due
  return null
}

function isDueOverdue(task: Task): boolean {
  return !task.done && !!task.due && task.due < today.value
}

function isScheduleLag(task: Task): boolean {
  return !task.done && !!task.start && !!task.end && task.start <= task.end && task.end < today.value
}

/** 文档顺序仅在需要时使用；默认按时间与优先级。 */
function sortTasks(a: GlobalTask, b: GlobalTask): number {
  const aDueOverdue = isDueOverdue(a) ? 0 : 1
  const bDueOverdue = isDueOverdue(b) ? 0 : 1
  if (aDueOverdue !== bDueOverdue) return aDueOverdue - bDueOverdue
  const aDate = sortDate(a)
  const bDate = sortDate(b)
  if (aDate && bDate && aDate !== bDate) return aDate.localeCompare(bDate)
  if (aDate && !bDate) return -1
  if (!aDate && bDate) return 1
  const priority = priorityRank(a.priority) - priorityRank(b.priority)
  if (priority) return priority
  const source = sourceLabel(a).localeCompare(sourceLabel(b), 'zh-CN')
  if (source) return source
  if (a.depth !== b.depth) return a.depth - b.depth
  return a.lineIndex - b.lineIndex
}

function taskTiming(task: Task): string {
  const parts: string[] = []
  if (task.type === 'milestone' && task.date) parts.push(`里程碑：${task.date}`)
  else if (task.date) parts.push(`安排于 ${task.date}`)
  if (task.start && task.end && task.start <= task.end) parts.push(`执行：${task.start} → ${task.end}`)
  else if (task.start || task.end) parts.push('执行日期不完整或无效，请在源码中修复')
  if (task.due) parts.push(`截止：${task.due}`)
  if (!parts.length) parts.push('未排期')
  return parts.join(' · ')
}

function isExpanded(task: GlobalTask): boolean {
  return !!expanded.value[rowKey(task)]
}

function toggleExpand(task: GlobalTask) {
  const key = rowKey(task)
  expanded.value = { ...expanded.value, [key]: !expanded.value[key] }
}

function clearFilters() {
  natureFilter.value = 'all'
  tagFilter.value = null
  priorityFilter.value = null
  blockFilter.value = null
}

function toggleTag(tag: string) {
  tagFilter.value = tagFilter.value === tag ? null : tag
}

const filtersActive = computed(
  () => Boolean(natureFilter.value !== 'all' || tagFilter.value || priorityFilter.value || blockFilter.value)
)
const showFilterPanel = computed(() => filtersOpen.value || filtersActive.value)
const activeFilterCount = computed(() => {
  let n = 0
  if (natureFilter.value !== 'all') n += 1
  if (tagFilter.value) n += 1
  if (priorityFilter.value) n += 1
  if (blockFilter.value) n += 1
  return n
})

async function focusComposer() {
  composeOpen.value = true
  await nextTick()
  draftInput.value?.focus()
}

function toggleCompose() {
  composeOpen.value = !composeOpen.value
  if (composeOpen.value) {
    void nextTick(() => draftInput.value?.focus())
  }
}

async function seedSamples() {
  if (seeding.value) return
  seeding.value = true
  try {
    await (ws as any).ensureDemoSamples?.()
  } finally {
    seeding.value = false
  }
}

function goInsertTaskBlock() {
  ws.setView('editor')
  window.dispatchEvent(new CustomEvent('mdw:insert-task-block'))
}

async function add() {
  const title = draft.value.trim()
  const target = selectedTarget.value
  if (!title || !target || !isDraftScheduleValid.value) return

  const input: {
    title: string
    date?: string
    due?: string
    start?: string
    end?: string
    type?: TaskKind
    priority?: TaskPriority
  } = { title, type: draftType.value }

  if (draftPriority.value) input.priority = draftPriority.value
  if (draftScheduleKind.value === 'date' && draftDate.value) input.date = draftDate.value
  if (draftScheduleKind.value === 'due' && draftDate.value) input.due = draftDate.value
  if (draftScheduleKind.value === 'range') {
    if (!draftStart.value || !draftEnd.value || draftStart.value > draftEnd.value) return
    input.start = draftStart.value
    input.end = draftEnd.value
  }

  const added = await ws.onAddTask(input, { notePath: target.notePath, blockId: target.blockId })
  if (!added) return
  draft.value = ''
  draftDate.value = ''
  draftStart.value = ''
  draftEnd.value = ''
  draftScheduleKind.value = 'none'
  draftType.value = 'task'
  draftPriority.value = ''
  composeMoreOpen.value = false
  await focusComposer()
}

function toggle(task: GlobalTask) {
  if (!task.isWritable) return
  if (typeof (ws as any).onToggleGlobalTask === 'function') {
    ;(ws as any).onToggleGlobalTask(task)
  }
}

function handleInspectorPatch(task: Task | GlobalTask, patch: TaskPatch) {
  if ('notePath' in task) {
    ;(ws as any).patchGlobalTask?.(task, patch)
    return
  }
  ws.patchTask(task, patch)
}

function handleInspectorToggle(task: Task | GlobalTask) {
  if ('notePath' in task) {
    ;(ws as any).onToggleGlobalTask?.(task)
    return
  }
  ws.onToggleTask(task.id)
}

async function handleInspectorOpenSource(task: Task | GlobalTask) {
  if ('notePath' in task) {
    await (ws as any).openGlobalTask?.(task, { view: 'editor' })
    return
  }
  ws.setView('editor')
}

function askRemove(task: GlobalTask) {
  if (task.isWritable) pendingDelete.value = task
}

function cancelRemove() {
  pendingDelete.value = null
}

function confirmRemove() {
  const task = pendingDelete.value
  pendingDelete.value = null
  if (!task?.isWritable) return
  if (typeof (ws as any).onRemoveGlobalTask === 'function') {
    ;(ws as any).onRemoveGlobalTask(task)
  }
}

async function openSource(task: GlobalTask) {
  if (typeof (ws as any).openGlobalTask === 'function') {
    await (ws as any).openGlobalTask(task)
    return
  }
  await ws.openNote(task.notePath)
}
</script>

<template>
  <div class="todo-view">
    <header class="view-toolbar" aria-label="待办工具栏">
      <div class="view-toolbar-primary">
        <div class="view-toolbar-cluster todo-scope-cluster">
          <ScopeSeg v-model="scope" :options="scopeOptions" aria-label="完成状态" />
          <HelpTip :text="scopeHelpText" label="待办说明" placement="left" />
          <span class="todo-progress-mini" :aria-label="`完成进度 ${progress}%`">{{ doneTasks.length }}/{{ globalTasks.length }}</span>
          <button
            type="button"
            class="btn-ghost sm"
            :class="{ active: showFilterPanel }"
            :aria-expanded="showFilterPanel"
            aria-controls="todo-filter-panel"
            @click="filtersOpen = !filtersOpen"
          >{{ filtersActive ? `筛选 · ${activeFilterCount}` : '筛选' }}</button>
          <button
            v-if="emptyKind !== 'scope' && taskBlockTargets.length"
            type="button"
            class="btn-ghost sm todo-compose-toggle"
            :class="{ active: composeOpen }"
            :aria-expanded="composeOpen"
            aria-controls="todo-compose-panel"
            @click="toggleCompose"
          >{{ composeOpen ? '收起' : '添加' }}</button>
        </div>
      </div>

      <div
        v-if="scope === 'open' && todaySummary.overdue"
        class="today-summary is-compact"
        aria-label="今日摘要"
      >
        <span class="sum-chip warn">逾期 {{ todaySummary.overdue }}</span>
        <span v-if="todaySummary.dueToday" class="sum-chip">今日截止 {{ todaySummary.dueToday }}</span>
      </div>

      <section
        v-if="composeOpen && emptyKind !== 'scope' && taskBlockTargets.length"
        id="todo-compose-panel"
        class="todo-compose-panel"
        aria-label="新建任务"
      >
        <div class="todo-compose-head">
          <span class="composer-label">新建任务</span>
          <HelpTip :text="composerHelpText" label="新建任务说明" placement="left" />
        </div>
        <div class="composer-main">
          <select v-model="selectedTargetKey" class="date-input" aria-label="目标笔记和任务组">
            <option value="">选择目标笔记 / 任务组</option>
            <option v-for="target in taskBlockTargets" :key="targetKey(target)" :value="targetKey(target)">
              {{ target.folder ? target.folder + ' / ' : '' }}{{ target.noteName }} / {{ target.blockName }}
            </option>
          </select>
          <input
            ref="draftInput"
            v-model="draft"
            class="composer-input"
            :disabled="!hasWritableTarget"
            placeholder="输入任务标题"
            @keyup.enter="add"
          />
          <button type="button" class="btn-solid" :disabled="!canAddDraft" @click="add">添加</button>
          <button
            type="button"
            class="btn-ghost sm"
            :aria-expanded="composeMoreOpen"
            @click="composeMoreOpen = !composeMoreOpen"
          >{{ composeMoreOpen ? '收起选项' : '更多' }}</button>
        </div>
        <div v-if="composeMoreOpen" class="composer-dates">
          <select
            v-model="draftScheduleKind"
            class="date-input"
            aria-label="任务日期语义"
            title="未排期（收件箱） / 单日安排 @date / 截止日期 @due / 执行区间 @start + @end"
          >
            <option value="none">未排期</option>
            <option value="date">单日安排 @date</option>
            <option value="due">截止日期 @due</option>
            <option value="range">执行区间 @start + @end</option>
          </select>
          <input v-if="draftScheduleKind === 'date' || draftScheduleKind === 'due'" v-model="draftDate" class="date-input" type="date" :aria-label="draftScheduleKind === 'due' ? '截止日期' : '安排日期'" />
          <template v-if="draftScheduleKind === 'range'">
            <input v-model="draftStart" class="date-input" type="date" aria-label="执行开始日期" />
            <span class="date-sep">至</span>
            <input v-model="draftEnd" class="date-input" type="date" aria-label="执行结束日期" />
          </template>
          <select v-model="draftType" class="date-input" aria-label="任务类型">
            <option value="task">事项</option>
            <option value="group">分组</option>
            <option value="milestone">里程碑</option>
          </select>
          <select v-model="draftPriority" class="date-input" aria-label="任务优先级">
            <option value="">无优先级</option>
            <option value="urgent">紧急</option>
            <option value="high">高</option>
            <option value="medium">中</option>
            <option value="low">低</option>
          </select>
        </div>
        <p v-if="composeMoreOpen && draftScheduleKind === 'range' && draftStart && draftEnd && draftStart > draftEnd" class="view-alert" role="alert">结束日期不能早于开始日期；请修正后再添加，系统不会自动交换日期。</p>
        <p v-if="composeMoreOpen && draftType === 'milestone' && draftScheduleKind !== 'date'" class="view-alert" role="alert">里程碑应使用 @type(milestone) + @date；请选择“单日安排”。</p>
      </section>
    </header>

    <div
      v-if="showFilterPanel"
      id="todo-filter-panel"
      class="tag-filter"
      aria-label="任务属性筛选"
    >
      <button type="button" class="tag-chip" :class="{ active: !filtersActive }" @click="clearFilters">清除</button>
      <button type="button" class="tag-chip" :class="{ active: natureFilter === 'all' }" @click="natureFilter = 'all'">全部性质</button>
      <button type="button" class="tag-chip" :class="{ active: natureFilter === 'task' }" @click="natureFilter = 'task'">事项</button>
      <button type="button" class="tag-chip" :class="{ active: natureFilter === 'goal' }" @click="natureFilter = 'goal'">目标</button>
      <button v-for="tag in allTags" :key="tag" type="button" class="tag-chip" :class="{ active: tagFilter === tag }" @click="toggleTag(tag)">#{{ tag }}</button>
      <select v-model="priorityFilter" class="date-input" aria-label="按优先级筛选">
        <option :value="null">所有优先级</option>
        <option value="urgent">紧急</option>
        <option value="high">高</option>
        <option value="medium">中</option>
        <option value="low">低</option>
      </select>
      <select v-model="blockFilter" class="date-input" aria-label="按任务组筛选">
        <option :value="null">所有任务组</option>
        <option v-for="block in allBlocks" :key="block.key" :value="block.key">{{ block.label }}</option>
      </select>
    </div>

    <div v-if="emptyKind === 'scope'" class="empty-state compact todo-empty">
      <div class="empty-title-row">
        <div class="empty-title">{{ emptyTitle }}</div>
        <HelpTip :text="emptyHelpText" label="空状态说明" />
      </div>
      <template v-if="!taskBlockTargets.length">
        <p class="empty-desc">待办只聚合任务组中的事项。标签与优先级写在任务属性里（Markdown 行上），不是单独数据库。</p>
        <div class="empty-actions">
          <button type="button" class="btn-solid" @click="goInsertTaskBlock">在当前笔记插入任务组</button>
          <button type="button" class="btn-ghost" :disabled="seeding" @click="seedSamples">
            {{ seeding ? '正在填充…' : '填充示例数据' }}
          </button>
          <span class="composer-inline-help">
            <HelpTip :text="taskBlockHowToText" label="如何写任务组" />
            <span>如何写任务组</span>
          </span>
        </div>
      </template>
      <section v-else class="todo-compose-panel todo-compose-empty" aria-label="新建任务">
        <div class="todo-compose-head">
          <span class="composer-label">新建任务</span>
          <HelpTip :text="composerHelpText" label="新建任务说明" placement="left" />
        </div>
        <div class="composer-main">
          <select v-model="selectedTargetKey" class="date-input" aria-label="目标笔记和任务组">
            <option value="">选择目标笔记 / 任务组</option>
            <option v-for="target in taskBlockTargets" :key="targetKey(target)" :value="targetKey(target)">
              {{ target.folder ? target.folder + ' / ' : '' }}{{ target.noteName }} / {{ target.blockName }}
            </option>
          </select>
          <input
            ref="draftInput"
            v-model="draft"
            class="composer-input"
            :disabled="!hasWritableTarget"
            placeholder="输入任务标题"
            @keyup.enter="add"
          />
          <button type="button" class="btn-solid" :disabled="!canAddDraft" @click="add">添加</button>
          <button
            type="button"
            class="btn-ghost sm"
            :aria-expanded="composeMoreOpen"
            @click="composeMoreOpen = !composeMoreOpen"
          >{{ composeMoreOpen ? '收起选项' : '更多' }}</button>
        </div>
        <div v-if="composeMoreOpen" class="composer-dates">
          <select
            v-model="draftScheduleKind"
            class="date-input"
            aria-label="任务日期语义"
            title="未排期（收件箱） / 单日安排 @date / 截止日期 @due / 执行区间 @start + @end"
          >
            <option value="none">未排期</option>
            <option value="date">单日安排 @date</option>
            <option value="due">截止日期 @due</option>
            <option value="range">执行区间 @start + @end</option>
          </select>
          <input v-if="draftScheduleKind === 'date' || draftScheduleKind === 'due'" v-model="draftDate" class="date-input" type="date" :aria-label="draftScheduleKind === 'due' ? '截止日期' : '安排日期'" />
          <template v-if="draftScheduleKind === 'range'">
            <input v-model="draftStart" class="date-input" type="date" aria-label="执行开始日期" />
            <span class="date-sep">至</span>
            <input v-model="draftEnd" class="date-input" type="date" aria-label="执行结束日期" />
          </template>
          <select v-model="draftType" class="date-input" aria-label="任务类型">
            <option value="task">事项</option>
            <option value="group">分组</option>
            <option value="milestone">里程碑</option>
          </select>
          <select v-model="draftPriority" class="date-input" aria-label="任务优先级">
            <option value="">无优先级</option>
            <option value="urgent">紧急</option>
            <option value="high">高</option>
            <option value="medium">中</option>
            <option value="low">低</option>
          </select>
        </div>
        <p v-if="composeMoreOpen && draftScheduleKind === 'range' && draftStart && draftEnd && draftStart > draftEnd" class="view-alert" role="alert">结束日期不能早于开始日期；请修正后再添加，系统不会自动交换日期。</p>
        <p v-if="composeMoreOpen && draftType === 'milestone' && draftScheduleKind !== 'date'" class="view-alert" role="alert">里程碑应使用 @type(milestone) + @date；请选择“单日安排”。</p>
      </section>
    </div>

    <div v-else-if="emptyKind === 'filtered'" class="empty-state compact todo-empty">
      <div class="empty-title-row">
        <div class="empty-title">当前筛选无结果</div>
        <HelpTip text="可清除标签、优先级、任务组或完成状态筛选。" label="筛选说明" />
      </div>
      <button type="button" class="btn-ghost" @click="clearFilters">清除筛选</button>
    </div>

    <div v-else class="todo-list-wrap" aria-label="任务列表">
      <section
        v-for="group in groupedList"
        :key="group.id"
        class="todo-group"
      >
        <h3 v-if="groupedList.length > 1 || scope === 'open'" class="todo-group-label">{{ group.label }} · {{ group.items.length }}</h3>
        <ul class="todo-list">
          <li
            v-for="task in group.items"
            :key="rowKey(task)"
            class="todo-row"
            :class="{
              done: task.done,
              overdue: isDueOverdue(task),
              global: true,
              open: isExpanded(task),
              'todo-readonly': !task.isWritable,
              'todo-schedule-lag': isScheduleLag(task),
              'is-goal': isGoalTask(task),
            }"
            :style="{ '--task-depth': task.depth, '--task-color': task.color || 'var(--accent)' }"
          >
            <div
              class="todo-row-main"
              :style="{
                paddingInlineStart: `${Math.min(task.depth, 5) * 16}px`,
                '--task-color': taskColorCss(task.color),
              }"
            >
              <span class="todo-workline" aria-hidden="true" />
              <input
                type="checkbox"
                :checked="task.done"
                :disabled="!task.isWritable"
                :title="task.isWritable ? '切换完成状态' : '此任务不可安全写入；请打开源码修复任务组或任务 ID'"
                :aria-label="`${task.done ? '标记未完成' : '标记完成'}：${displayTaskTitle(task.title)}`"
                @change="toggle(task)"
              />
              <span v-if="isDueOverdue(task)" class="todo-dot-overdue" title="截止已逾期" aria-label="截止已逾期" />
              <span v-else-if="isScheduleLag(task)" class="todo-dot-overdue" title="执行区间已结束" aria-label="执行区间已结束" />
              <button
                type="button"
                class="todo-title"
                :title="displayTaskTitle(task.title)"
                :aria-expanded="isExpanded(task)"
                @click="toggleExpand(task)"
              >{{ displayTaskTitle(task.title) }}</button>
              <span class="todo-meta-chips" aria-hidden="false">
                <span v-if="isGoalTask(task)" class="todo-chip is-goal" title="长期目标（标签 #目标）">目标</span>
                <span v-if="task.priority" class="todo-chip is-priority" :data-priority="task.priority" :title="'优先级 ' + priorityLabel(task.priority)">{{ priorityLabel(task.priority) }}</span>
                <span v-for="tag in task.tags.slice(0, 3)" :key="tag" class="todo-chip is-tag">#{{ tag }}</span>
                <span v-if="task.tags.length > 3" class="todo-chip is-more">+{{ task.tags.length - 3 }}</span>
              </span>
              <button
                type="button"
                class="todo-expand-btn"
                :aria-label="`${isExpanded(task) ? '收起' : '展开'} ${displayTaskTitle(task.title)} 的详情`"
                :title="isExpanded(task) ? '收起详情' : '展开详情'"
                @click="toggleExpand(task)"
              >
                {{ isExpanded(task) ? '收起' : '···' }}
              </button>
            </div>

            <div v-if="isExpanded(task)" class="todo-row-detail">
              <TaskInspector
                :task="task"
                :related-tasks="globalTasks"
                :diagnostics="ws.taskDiagnostics"
                :block-name="blockLabel(task)"
                @request-patch="handleInspectorPatch"
                @request-toggle="handleInspectorToggle"
                @request-open-source="handleInspectorOpenSource"
              />
              <div class="todo-inspector-actions">
                <button type="button" class="todo-icon-btn danger" :disabled="!task.isWritable" @click="askRemove(task)">删除任务</button>
              </div>
            </div>
          </li>
        </ul>
      </section>
    </div>

    <ConfirmDialog
      :open="!!pendingDelete"
      title="删除任务"
      :message="pendingDelete ? ('确定删除「' + displayTaskTitle(pendingDelete.title) + '」？此操作只会删除该任务行。') : ''"
      confirm-text="删除"
      danger
      @confirm="confirmRemove"
      @cancel="cancelRemove"
    />
  </div>
</template>
