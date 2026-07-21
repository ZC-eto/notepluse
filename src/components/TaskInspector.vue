<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { GlobalTask, Task, TaskColor, TaskDiagnostic, TaskKind, TaskPatch, TaskPriority } from '../core/types'
import { displayTaskTitle, isLocalDate } from '../core/taskSyntax'

type TaskLike = Task | GlobalTask

interface TaskDraft {
  title: string
  type: TaskKind
  date: string
  due: string
  start: string
  end: string
  priority: TaskPriority | ''
  color: TaskColor | ''
  tags: string
}

const props = withDefaults(defineProps<{
  /** 当前选中的任务；为空时显示稳定的空检查器状态。 */
  task?: TaskLike | null
  /** 用于解析父子任务标题的同源任务集合，可省略。 */
  relatedTasks?: readonly TaskLike[]
  /** 解析器诊断，用于说明为什么任务不可写或需要回到源码修复。 */
  diagnostics?: readonly TaskDiagnostic[]
  /** Task 本身以外的只读锁定原因，例如外部同步冲突。 */
  readonlyReason?: string | null
  /** 普通 Task 没有跨笔记来源字段时，由父级提供当前笔记信息。 */
  sourceNote?: { name: string; path?: string; folder?: string } | null
  /** Task Block 的显示名称；未提供时回退显示 block id。 */
  blockName?: string | null
}>(), {
  task: null,
  relatedTasks: () => [],
  diagnostics: () => [],
  readonlyReason: null,
  sourceNote: null,
  blockName: null,
})

const emit = defineEmits<{
  /** 父级负责映射至 patchTask / patchGlobalTask；组件不会直接写入 Markdown。 */
  (event: 'request-patch', task: TaskLike, patch: TaskPatch): void
  /** 父级负责映射至 onToggleTask / onToggleGlobalTask。 */
  (event: 'request-toggle', task: TaskLike): void
  /** 父级负责打开来源笔记并定位源码。 */
  (event: 'request-open-source', task: TaskLike): void
}>()

const editing = ref(false)
const formError = ref('')
const draft = ref<TaskDraft>(emptyDraft())

const typeLabels: Record<TaskKind, string> = { task: '任务', group: '任务组', milestone: '里程碑' }
const priorityLabels: Record<TaskPriority, string> = { urgent: '紧急', high: '高', medium: '中', low: '低' }
const colorLabels: Record<TaskColor, string> = { gray: '灰', blue: '蓝', green: '绿', orange: '橙', red: '红', violet: '紫' }
const colorValues: Record<TaskColor, string> = { gray: '#64748b', blue: '#2563eb', green: '#15803d', orange: '#c2410c', red: '#dc2626', violet: '#7c3aed' }

const taskId = computed(() => props.task?.id || '')
const fieldPrefix = computed(() => `task-inspector-${(taskId.value || 'empty').replace(/[^\w-]/g, '-')}`)
const isGlobalTask = computed(() => !!props.task && 'notePath' in props.task)
const canWrite = computed(() => Boolean(props.task?.isWritable) && !props.readonlyReason)
const sourceLabel = computed(() => {
  const task = props.task
  if (!task) return '—'
  if ('notePath' in task) return [task.folder, task.noteName].filter(Boolean).join(' / ') || task.notePath
  return [props.sourceNote?.folder, props.sourceNote?.name].filter(Boolean).join(' / ') || '当前笔记'
})
const sourcePath = computed(() => {
  const task = props.task
  if (!task) return ''
  return 'notePath' in task ? task.notePath : props.sourceNote?.path || ''
})
const hierarchyLabel = computed(() => props.task?.headingPath.length ? props.task.headingPath.join(' / ') : '未归属 Markdown 标题')
const taskBlockLabel = computed(() => props.blockName || props.task?.blockId || '未识别任务组')
const taskColor = computed(() => props.task?.color ? colorValues[props.task.color] : 'var(--line-strong)')
const matchingDiagnostics = computed(() => {
  const task = props.task
  if (!task) return []
  return props.diagnostics.filter((diagnostic) => {
    if (diagnostic.taskId && (diagnostic.taskId === task.id || diagnostic.taskId === task.explicitId)) return true
    return Boolean(diagnostic.blockId && diagnostic.blockId === task.blockId)
  })
})
const readonlyMessages = computed(() => {
  const task = props.task
  if (!task) return []
  const messages: string[] = []
  if (!task.isWritable) messages.push(task.explicitId ? '此任务的标识不唯一，无法安全地最小化回写 Markdown。' : '此任务缺少显式 @id(...)，为避免改错内容目前只能查看。')
  if (props.readonlyReason) messages.push(props.readonlyReason)
  return messages
})
const parentTask = computed(() => findRelatedTask(props.task?.parentId))
const childTasks = computed(() => {
  const ids = new Set(props.task?.childIds || [])
  return props.relatedTasks.filter((candidate) => ids.has(candidate.id) && isSameSource(candidate, props.task))
})

watch(
  () => {
    const task = props.task
    return task ? [task.id, task.title, task.type, task.date, task.due, task.start, task.end, task.priority, task.color, task.tags.join('\u0001')] : []
  },
  () => resetDraft(),
  { immediate: true },
)

function emptyDraft(): TaskDraft {
  return { title: '', type: 'task', date: '', due: '', start: '', end: '', priority: '', color: '', tags: '' }
}

function resetDraft() {
  const task = props.task
  formError.value = ''
  if (!task) {
    draft.value = emptyDraft()
    editing.value = false
    return
  }
  draft.value = {
    title: displayTaskTitle(task.title), type: task.type, date: task.date || '', due: task.due || '', start: task.start || '', end: task.end || '',
    priority: task.priority || '', color: task.color || '', tags: task.tags.map((tag) => `#${tag}`).join(' '),
  }
}

function isSameSource(candidate: TaskLike, task: TaskLike | null | undefined) {
  if (!task) return false
  const candidateGlobal = 'notePath' in candidate
  const taskGlobal = 'notePath' in task
  return candidateGlobal === taskGlobal && (!candidateGlobal || candidate.notePath === (task as GlobalTask).notePath)
}

function findRelatedTask(id: string | undefined) {
  if (!id || !props.task) return null
  return props.relatedTasks.find((candidate) => candidate.id === id && isSameSource(candidate, props.task)) || null
}

function formatTaskName(task: TaskLike | null) {
  return task ? displayTaskTitle(task.title) : '未找到关联任务'
}

function beginEdit() {
  if (!canWrite.value) return
  resetDraft()
  editing.value = true
}

function cancelEdit() {
  resetDraft()
  editing.value = false
}

function requestToggle() {
  if (props.task && canWrite.value) emit('request-toggle', props.task)
}

function requestOpenSource() {
  if (props.task) emit('request-open-source', props.task)
}

function normalizeTags(value: string): string[] {
  const tags = value.split(/[\s,，]+/).map((tag) => tag.trim().replace(/^#/, '')).filter(Boolean)
  return Array.from(new Set(tags))
}

function sameList(left: string[], right: string[]) {
  return left.length === right.length && left.every((item, index) => item === right[index])
}

function dateOrNull(value: string) { return value || null }
function validOptionalDate(value: string) { return !value || isLocalDate(value) }

function submitEdit() {
  const task = props.task
  if (!task || !canWrite.value) return
  const title = draft.value.title.trim()
  const nextTags = normalizeTags(draft.value.tags)
  formError.value = ''

  if (!title) { formError.value = '任务标题不能为空。'; return }
  if (![draft.value.date, draft.value.due, draft.value.start, draft.value.end].every(validOptionalDate)) {
    formError.value = '日期必须采用有效的 YYYY-MM-DD 格式。'
    return
  }
  if (Boolean(draft.value.start) !== Boolean(draft.value.end)) {
    formError.value = '执行区间需要同时填写开始日期和结束日期；如不排期请同时清空。'
    return
  }
  if (draft.value.start && draft.value.end && draft.value.start > draft.value.end) {
    formError.value = '结束日期不能早于开始日期。'
    return
  }
  if (draft.value.type === 'milestone' && !draft.value.date) {
    formError.value = '里程碑必须设置单日日期 @date(...)。'
    return
  }

  const patch: TaskPatch = {}
  if (title !== task.title) patch.title = title
  if (draft.value.type !== task.type) patch.type = draft.value.type
  if (dateOrNull(draft.value.date) !== (task.date || null)) patch.date = dateOrNull(draft.value.date)
  if (dateOrNull(draft.value.due) !== (task.due || null)) patch.due = dateOrNull(draft.value.due)
  if (dateOrNull(draft.value.start) !== (task.start || null)) patch.start = dateOrNull(draft.value.start)
  if (dateOrNull(draft.value.end) !== (task.end || null)) patch.end = dateOrNull(draft.value.end)
  if ((draft.value.priority || null) !== (task.priority || null)) patch.priority = draft.value.priority || null
  if ((draft.value.color || null) !== (task.color || null)) patch.color = draft.value.color || null
  if (!sameList(nextTags, task.tags)) patch.tags = nextTags
  if (!Object.keys(patch).length) { editing.value = false; return }

  emit('request-patch', task, patch)
  editing.value = false
}
</script>

<template>
  <aside class="task-inspector" aria-label="任务详情">
    <template v-if="task">
      <!-- 主区：标题 + 关键动作 + 关键元数据 -->
      <header class="inspector-head">
        <div class="inspector-title-row">
          <span class="color-mark" :style="{ backgroundColor: taskColor }" aria-hidden="true" />
          <h2 class="inspector-title">{{ displayTaskTitle(task.title) }}</h2>
          <span class="status-pill" :class="{ done: task.done }">{{ task.done ? '已完成' : '未完成' }}</span>
        </div>
        <div class="inspector-hero-meta">
          <span v-if="task.priority" class="hero-chip is-priority" :data-priority="task.priority">{{ priorityLabels[task.priority] }}</span>
          <span v-if="task.due" class="hero-chip">截止 {{ task.due }}</span>
          <span v-else-if="task.date" class="hero-chip">单日 {{ task.date }}</span>
          <span v-if="task.start && task.end" class="hero-chip">{{ task.start }} → {{ task.end }}</span>
          <span v-for="tag in task.tags.slice(0, 3)" :key="tag" class="hero-chip is-tag">#{{ tag }}</span>
          <span class="type-pill" :class="`type-${task.type}`">{{ typeLabels[task.type] }}</span>
        </div>
        <div class="inspector-actions">
          <button type="button" class="btn-solid inspector-primary" :disabled="!canWrite" @click="requestToggle">
            {{ task.done ? '标为未完成' : '完成' }}
          </button>
          <button type="button" class="btn-ghost sm" @click="requestOpenSource">源码</button>
          <button v-if="!editing" type="button" class="btn-ghost sm" :disabled="!canWrite" @click="beginEdit">编辑</button>
        </div>
      </header>

      <div v-if="readonlyMessages.length" class="readonly-notice" role="status">
        <strong>只读</strong>
        <p v-for="message in readonlyMessages" :key="message">{{ message }}</p>
      </div>

      <section v-if="editing" class="inspector-section edit-section" aria-labelledby="task-inspector-edit-title">
        <div class="section-heading">
          <h3 id="task-inspector-edit-title">编辑</h3>
        </div>
        <form class="task-form" @submit.prevent="submitEdit">
          <label class="field field-wide" :for="`${fieldPrefix}-title`">
            <span>标题</span>
            <input :id="`${fieldPrefix}-title`" v-model="draft.title" type="text" autocomplete="off" required />
          </label>
          <label class="field" :for="`${fieldPrefix}-type`">
            <span>类型</span>
            <select :id="`${fieldPrefix}-type`" v-model="draft.type">
              <option value="task">任务</option>
              <option value="group">任务组</option>
              <option value="milestone">里程碑</option>
            </select>
          </label>
          <label class="field" :for="`${fieldPrefix}-priority`">
            <span>优先级</span>
            <select :id="`${fieldPrefix}-priority`" v-model="draft.priority">
              <option value="">未设置</option>
              <option value="urgent">紧急</option>
              <option value="high">高</option>
              <option value="medium">中</option>
              <option value="low">低</option>
            </select>
          </label>
          <label class="field" :for="`${fieldPrefix}-color`">
            <span>颜色</span>
            <select :id="`${fieldPrefix}-color`" v-model="draft.color">
              <option value="">跟随 Block</option>
              <option v-for="(_, color) in colorLabels" :key="color" :value="color">{{ colorLabels[color] }}</option>
            </select>
          </label>
          <label class="field" :for="`${fieldPrefix}-date`">
            <span>单日</span>
            <input :id="`${fieldPrefix}-date`" v-model="draft.date" type="date" />
          </label>
          <label class="field" :for="`${fieldPrefix}-due`">
            <span>截止</span>
            <input :id="`${fieldPrefix}-due`" v-model="draft.due" type="date" />
          </label>
          <label class="field" :for="`${fieldPrefix}-start`">
            <span>开始</span>
            <input :id="`${fieldPrefix}-start`" v-model="draft.start" type="date" />
          </label>
          <label class="field" :for="`${fieldPrefix}-end`">
            <span>结束</span>
            <input :id="`${fieldPrefix}-end`" v-model="draft.end" type="date" />
          </label>
          <label class="field field-wide" :for="`${fieldPrefix}-tags`">
            <span>标签</span>
            <input :id="`${fieldPrefix}-tags`" v-model="draft.tags" type="text" placeholder="#设计 #发布" autocomplete="off" />
          </label>
          <p v-if="formError" class="form-error" role="alert">{{ formError }}</p>
          <div class="form-actions">
            <button type="submit" class="btn-solid">保存</button>
            <button type="button" class="btn-ghost" @click="cancelEdit">取消</button>
          </div>
        </form>
      </section>

      <!-- 次要：折叠的来源 / 结构 / 关系 -->
      <details class="inspector-fold" open>
        <summary>来源 · {{ sourceLabel }}</summary>
        <dl class="source-list compact">
          <div><dt>笔记</dt><dd :title="sourcePath || sourceLabel">{{ sourceLabel }}</dd></div>
          <div><dt>任务组</dt><dd>{{ taskBlockLabel }}</dd></div>
          <div><dt>层级</dt><dd>{{ hierarchyLabel }}</dd></div>
          <div><dt>行</dt><dd>{{ task.sourceRange.startLine + 1 }}–{{ task.sourceRange.endLine + 1 }}</dd></div>
          <div v-if="task.explicitId"><dt>@id</dt><dd class="mono">{{ task.explicitId }}</dd></div>
        </dl>
      </details>

      <details v-if="task.parentId || task.childIds.length" class="inspector-fold">
        <summary>关系 · {{ task.childIds.length }} 子任务</summary>
        <div class="relationship-row">
          <span>父</span><strong>{{ task.parentId ? formatTaskName(parentTask) : '顶层' }}</strong>
        </div>
        <ul v-if="task.childIds.length" class="relation-list">
          <li v-for="childId in task.childIds" :key="childId">
            {{ formatTaskName(childTasks.find((child) => child.id === childId) || null) }}
          </li>
        </ul>
      </details>

      <details v-if="matchingDiagnostics.length" class="inspector-fold is-warn">
        <summary>诊断 · {{ matchingDiagnostics.length }}</summary>
        <ul class="diagnostic-list">
          <li v-for="diagnostic in matchingDiagnostics" :key="`${diagnostic.code}-${diagnostic.lineIndex}-${diagnostic.message}`" :class="diagnostic.severity">
            <strong>{{ diagnostic.severity === 'error' ? '错误' : '提示' }}</strong>
            <span>{{ diagnostic.message }}（第 {{ diagnostic.lineIndex + 1 }} 行）</span>
          </li>
        </ul>
      </details>
    </template>

    <div v-else class="empty-inspector" role="status">
      <strong>未选择任务</strong>
      <p>在列表中点任务展开详情；甘特中双击条打开。</p>
    </div>
  </aside>
</template>

<style scoped>
.task-inspector {
  min-width: 0;
  color: var(--ink);
  background: transparent;
  border: 0;
  border-radius: 0;
  overflow: hidden;
}
.inspector-head {
  padding: 12px 12px 10px;
  border-bottom: 1px solid var(--line);
  background: color-mix(in srgb, var(--surface) 92%, var(--surface-2));
}
.inspector-title-row { display: flex; align-items: flex-start; gap: 8px; }
.inspector-title {
  flex: 1 1 auto; min-width: 0; margin: 0;
  font-size: 15px; font-weight: 650; line-height: 1.3;
}
.color-mark {
  width: 8px; height: 8px; margin-top: 5px; flex: 0 0 auto; border-radius: 999px;
}
.status-pill, .type-pill, .hero-chip, .tag {
  display: inline-flex; align-items: center; border-radius: 999px;
  white-space: nowrap; font-size: 10.5px; font-weight: 600;
}
.status-pill {
  flex: 0 0 auto; padding: 2px 7px;
  background: var(--accent-soft); color: var(--accent-ink);
}
.status-pill.done {
  background: var(--surface-2); color: var(--muted); text-decoration: line-through;
}
.type-pill {
  padding: 2px 6px; border: 1px solid var(--line);
  background: var(--surface); color: var(--muted);
}
.inspector-hero-meta {
  display: flex; flex-wrap: wrap; gap: 5px; margin-top: 8px;
}
.hero-chip {
  padding: 2px 7px; background: var(--surface-2); color: var(--ink);
  border: 1px solid var(--line);
}
.hero-chip.is-priority[data-priority='urgent'],
.hero-chip.is-priority[data-priority='high'] {
  color: var(--danger);
  border-color: color-mix(in srgb, var(--danger) 30%, var(--line));
  background: color-mix(in srgb, var(--danger-soft) 70%, var(--surface));
}
.hero-chip.is-tag {
  color: var(--accent-ink); background: var(--accent-soft); border-color: transparent;
}
.inspector-actions { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 10px; }
.inspector-actions :deep(.btn-solid),
.inspector-actions :deep(.btn-ghost),
.form-actions :deep(.btn-solid),
.form-actions :deep(.btn-ghost) {
  min-height: 28px; padding: 0 10px; font-size: 12px;
}
.readonly-notice {
  margin: 8px 12px 0; padding: 8px 10px;
  border: 1px solid color-mix(in srgb, var(--danger) 30%, var(--line));
  border-radius: 6px; background: var(--danger-soft); font-size: 12px;
}
.readonly-notice strong { color: var(--danger); font-size: 11px; }
.readonly-notice p { margin: 2px 0 0; color: var(--ink); }
.inspector-section { padding: 10px 12px 12px; border-bottom: 1px solid var(--line); }
.section-heading { display: flex; justify-content: space-between; margin-bottom: 8px; }
.section-heading h3 { margin: 0; font-size: 12px; font-weight: 650; }
.task-form { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; }
.field { display: block; min-width: 0; }
.field-wide, .form-actions, .form-error { grid-column: 1 / -1; }
.field > span {
  display: block; margin-bottom: 4px; color: var(--muted);
  font-size: 10.5px; font-weight: 600;
}
.field input, .field select {
  width: 100%; height: 30px; border: 1px solid var(--line); border-radius: 6px;
  outline: none; background: var(--surface); padding: 0 8px; color: var(--ink); font-size: 12px;
}
.field input:focus, .field select:focus {
  border-color: var(--accent);
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--accent) 16%, transparent);
}
.form-actions { display: flex; gap: 6px; }
.form-error { margin: 0; color: var(--danger); font-size: 12px; }
.inspector-fold { border-bottom: 1px solid var(--line); }
.inspector-fold > summary {
  list-style: none; cursor: pointer; padding: 8px 12px;
  font-size: 11.5px; font-weight: 600; color: var(--muted); user-select: none;
}
.inspector-fold > summary::-webkit-details-marker { display: none; }
.inspector-fold > summary::before { content: '▸ '; color: var(--faint); font-size: 10px; }
.inspector-fold[open] > summary::before { content: '▾ '; }
.inspector-fold[open] > summary { color: var(--ink); }
.inspector-fold.is-warn > summary { color: var(--warning); }
.source-list {
  display: grid; grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 6px 12px; margin: 0; padding: 0 12px 10px;
}
.source-list.compact dt { color: var(--faint); font-size: 10px; }
.source-list.compact dd {
  margin: 1px 0 0; font-size: 12px; font-weight: 600;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.source-list dd.mono { font-family: var(--mono); font-size: 11px; font-weight: 500; }
.relationship-row {
  display: flex; justify-content: space-between; gap: 8px;
  font-size: 12px; padding: 0 12px 6px;
}
.relation-list, .diagnostic-list {
  display: grid; gap: 4px; margin: 0; padding: 0 12px 10px; list-style: none;
}
.relation-list li, .diagnostic-list li {
  padding: 5px 8px; border-radius: 6px; background: var(--surface-2); font-size: 12px;
}
.diagnostic-list li.error { color: var(--danger); }
.empty-inspector { padding: 16px 12px; color: var(--muted); font-size: 12px; }
.empty-inspector strong { display: block; color: var(--ink); margin-bottom: 4px; }
.empty-inspector p { margin: 0; }
@media (max-width: 720px) {
  .task-form, .source-list { grid-template-columns: 1fr; }
}
</style>
