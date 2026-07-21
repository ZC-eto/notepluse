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

type TodoScope = 'inbox' | 'today' | 'upcoming' | 'all'
type CompletionFilter = 'all' | 'open' | 'done'
type DraftScheduleKind = 'none' | 'date' | 'due' | 'range'

const scope = ref<TodoScope>('today')
const filter = ref<CompletionFilter>('open')
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
  if (scope.value === 'inbox') return '收件箱只显示无完整日期语义的未完成任务；它们不会被当作“今天”。'
  if (scope.value === 'today') return '今日显示单日、进行中区间，以及今天到期或已逾期的截止项；截止日不会被当作执行结束日。'
  if (scope.value === 'upcoming') return '即将到来显示未来 14 天的单日、开始或截止承诺。'
  return '全部只汇总任务组中的事项；普通勾选清单不会出现在这里。'
})

const emptyTitle = computed(() => {
  if (scope.value === 'inbox') return '收件箱为空'
  if (scope.value === 'today') return '今日暂无待办'
  if (scope.value === 'upcoming') return '未来 14 天暂无待办'
  return '尚未声明可管理任务'
})

const emptyHelpText = computed(() =>
  taskBlockTargets.value.length
    ? '选择目标笔记与任务组后即可新建任务。普通勾选清单不会自动进待办。'
    : '当前没有可投影的任务组。可一键填充示例，或在源码中插入 <!-- mdw:tasks --> 任务块。普通勾选清单不会自动进待办。'
)

const taskBlockHowToText =
  '在 Markdown 源码中用 HTML 注释包裹任务清单，例如：<!-- mdw:tasks id="daily" name="今日" color="blue" --> … - [ ] 事项 @date(2026-07-20) … <!-- /mdw:tasks -->。只有块内的显式任务会进入待办 / 日历 / 甘特。'

const composerHelpText = computed(() => {
  if (!taskBlockTargets.value.length) {
    return '没有可写的任务组。请在源码中创建合法的任务组后再返回这里。'
  }
  if (!hasWritableTarget.value) {
    return '请选择要写入的笔记和任务组；不会自动创建计划文档或追加到文末。'
  }
  return '任务会写入左侧所选笔记与任务组。可用下方选项设置排期语义（@date / @due / @start+@end）、类型与优先级。'
})

const scopeOptions = computed(() => [
  { id: 'inbox', label: '收件箱', title: '未排期的未完成任务，不等于今天必须处理', count: inboxTasks.value.length || undefined },
  { id: 'today', label: '今日', title: '今天的单日、进行中区间，以及今天到期/已逾期的截止项', count: todayTasks.value.length || undefined },
  { id: 'upcoming', label: '即将到来', title: '未来 14 天内的单日、开始或截止承诺', count: upcomingTasks.value.length || undefined },
  { id: 'all', label: '全部', title: '所有有效任务组内的任务', count: globalTasks.value.length || undefined },
])

const inboxTasks = computed(() => globalTasks.value.filter((task) => !task.done && !hasSchedule(task)))
const todayTasks = computed(() => globalTasks.value.filter((task) => isTodayFocus(task, today.value)))
const upcomingTasks = computed(() => globalTasks.value.filter((task) => isUpcoming(task, today.value)))

const scopedTasks = computed<GlobalTask[]>(() => {
  if (scope.value === 'inbox') return inboxTasks.value
  if (scope.value === 'today') return todayTasks.value
  if (scope.value === 'upcoming') return upcomingTasks.value
  return globalTasks.value
})

const stats = computed(() => ({
  total: scopedTasks.value.length,
  done: scopedTasks.value.filter((task) => task.done).length,
}))

const progress = computed(() => stats.value.total ? Math.round((stats.value.done / stats.value.total) * 100) : 0)

const todaySummary = computed(() => {
  let overdue = 0
  let active = 0
  let dueToday = 0
  for (const task of todayTasks.value) {
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
  if (filter.value === 'open') result = result.filter((task) => !task.done)
  if (filter.value === 'done') result = result.filter((task) => task.done)
  if (tagFilter.value) result = result.filter((task) => task.tags.includes(tagFilter.value!))
  if (priorityFilter.value) result = result.filter((task) => task.priority === priorityFilter.value)
  if (blockFilter.value) result = result.filter((task) => blockKey(task) === blockFilter.value)
  return result.sort(scope.value === 'all' ? sortAllTasks : sortTasks)
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
  // 不自动选中目标：新任务的写入位置必须由用户明确决定。
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

/** 全部视图保留文档 → Task Block → 源码树顺序，避免把子任务与父上下文打散。 */
function sortAllTasks(a: GlobalTask, b: GlobalTask): number {
  const source = sourceLabel(a).localeCompare(sourceLabel(b), 'zh-CN')
  if (source) return source
  const block = blockLabel(a).localeCompare(blockLabel(b), 'zh-CN')
  if (block) return block
  return a.lineIndex - b.lineIndex
}

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

function isUpcoming(task: Task, localToday: string): boolean {
  if (task.done) return false
  const upperBound = addLocalDays(localToday, 14)
  const dates = [task.date, task.due]
  if (task.start && task.end && task.start <= task.end) dates.push(task.start)
  return dates.some((date) => !!date && date > localToday && date <= upperBound)
}

function addLocalDays(value: string, days: number): string {
  const [year, month, day] = value.split('-').map(Number)
  const date = new Date(year, month - 1, day + days)
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
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
  filter.value = 'open'
  tagFilter.value = null
  priorityFilter.value = null
  blockFilter.value = null
}

function toggleTag(tag: string) {
  tagFilter.value = tagFilter.value === tag ? null : tag
}

const filtersActive = computed(
  () => Boolean(tagFilter.value || priorityFilter.value || blockFilter.value)
)
const showFilterPanel = computed(() => filtersOpen.value || filtersActive.value)
const activeFilterCount = computed(() => {
  let n = 0
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
          <ScopeSeg v-model="scope" :options="scopeOptions" aria-label="待办范围" />
          <HelpTip :text="scopeHelpText" label="当前范围说明" placement="left" />
          <div class="filter-seg" role="group" aria-label="完成状态筛选">
            <button type="button" class="seg-btn" :class="{ active: filter === 'open' }" @click="filter = 'open'">未完成</button>
            <button type="button" class="seg-btn" :class="{ active: filter === 'done' }" @click="filter = 'done'">已完成</button>
            <button type="button" class="seg-btn" :class="{ active: filter === 'all' }" @click="filter = 'all'">全部</button>
          </div>
          <span class="todo-progress-mini" :aria-label="`当前范围完成 ${stats.done}/${stats.total}`">{{ stats.done }}/{{ stats.total }}</span>
          <button
            v-if="allTags.length || allBlocks.length"
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
        v-if="scope === 'today' && todaySummary.overdue"
        class="today-summary is-compact"
        aria-label="今日任务摘要"
      >
        <span class="sum-chip danger">截止逾期 {{ todaySummary.overdue }}</span>
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
            <option value="none">未排期（收件箱）</option>
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
            <option value="task">任务</option>
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
      v-if="showFilterPanel && (allTags.length || allBlocks.length)"
      id="todo-filter-panel"
      class="tag-filter"
      aria-label="任务属性筛选"
    >
      <button type="button" class="tag-chip" :class="{ active: !filtersActive }" @click="clearFilters">清除</button>
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
            <option value="none">未排期（收件箱）</option>
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
            <option value="task">任务</option>
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

    <ul v-else class="todo-list" aria-label="任务列表">
      <li
        v-for="task in list"
        :key="rowKey(task)"
        class="todo-row"
        :class="{
          done: task.done,
          overdue: isDueOverdue(task),
          global: true,
          open: isExpanded(task),
          'todo-readonly': !task.isWritable,
          'todo-schedule-lag': isScheduleLag(task),
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
