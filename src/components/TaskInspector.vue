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
  <aside class="task-inspector" aria-label="任务检查器">
    <template v-if="task">
      <header class="inspector-head">
        <div class="inspector-kicker">
          <span class="color-mark" :style="{ backgroundColor: taskColor }" aria-hidden="true"></span>
          <span>任务检查器</span>
          <span class="type-pill" :class="`type-${task.type}`">{{ typeLabels[task.type] }}</span>
        </div>
        <div class="inspector-title-row">
          <h2 class="inspector-title">{{ displayTaskTitle(task.title) }}</h2>
          <span class="status-pill" :class="{ done: task.done }">{{ task.done ? '已完成' : '未完成' }}</span>
        </div>
        <p class="inspector-subtitle">修改会写回源笔记中的任务组。</p>
        <div class="inspector-actions">
          <button type="button" class="btn-solid inspector-primary" :disabled="!canWrite" :aria-label="task.done ? '将任务标记为未完成' : '将任务标记为已完成'" @click="requestToggle">
            {{ task.done ? '标记未完成' : '完成任务' }}
          </button>
          <button type="button" class="btn-ghost" @click="requestOpenSource">在源码中打开</button>
          <button v-if="!editing" type="button" class="btn-ghost" :disabled="!canWrite" @click="beginEdit">编辑属性</button>
        </div>
      </header>

      <div v-if="readonlyMessages.length" class="readonly-notice" role="status">
        <strong>只读保护</strong>
        <p v-for="message in readonlyMessages" :key="message">{{ message }}</p>
      </div>

      <section v-if="editing" class="inspector-section edit-section" aria-labelledby="task-inspector-edit-title">
        <div class="section-heading">
          <h3 id="task-inspector-edit-title">编辑属性</h3>
          <span>仅提交有变化的字段</span>
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
            <span>单日事项</span>
            <input :id="`${fieldPrefix}-date`" v-model="draft.date" type="date" />
            <small>写入 @date；里程碑必填。</small>
          </label>
          <label class="field" :for="`${fieldPrefix}-due`">
            <span>截止承诺</span>
            <input :id="`${fieldPrefix}-due`" v-model="draft.due" type="date" />
            <small>写入 @due，不会变成甘特结束日。</small>
          </label>
          <label class="field" :for="`${fieldPrefix}-start`">
            <span>执行开始</span>
            <input :id="`${fieldPrefix}-start`" v-model="draft.start" type="date" />
            <small>需与结束日期成对设置。</small>
          </label>
          <label class="field" :for="`${fieldPrefix}-end`">
            <span>执行结束</span>
            <input :id="`${fieldPrefix}-end`" v-model="draft.end" type="date" />
            <small>严格跨日区间才进入甘特图。</small>
          </label>
          <label class="field field-wide" :for="`${fieldPrefix}-tags`">
            <span>标签</span>
            <input :id="`${fieldPrefix}-tags`" v-model="draft.tags" type="text" placeholder="#设计 #发布" autocomplete="off" />
            <small>以空格或逗号分隔；保存时会规范为 Markdown 标签。</small>
          </label>
          <p v-if="formError" class="form-error" role="alert">{{ formError }}</p>
          <div class="form-actions">
            <button type="submit" class="btn-solid">保存修改</button>
            <button type="button" class="btn-ghost" @click="cancelEdit">取消</button>
          </div>
        </form>
      </section>

      <section v-else class="inspector-section" aria-labelledby="task-inspector-overview-title">
        <div class="section-heading">
          <h3 id="task-inspector-overview-title">任务语义</h3>
          <span>来自本地 Markdown</span>
        </div>
        <dl class="detail-grid">
          <div class="detail-item">
            <dt>单日事项</dt><dd>{{ task.date || '未设置' }}</dd><small>对应 @date</small>
          </div>
          <div class="detail-item">
            <dt>截止承诺</dt><dd>{{ task.due || '未设置' }}</dd><small>对应 @due，非执行结束</small>
          </div>
          <div class="detail-item">
            <dt>执行区间</dt><dd>{{ task.start && task.end ? `${task.start} 至 ${task.end}` : '未设置' }}</dd>
            <small>{{ task.start && task.end && task.start < task.end ? '严格跨日区间会显示在甘特图' : '开始与结束日期必须同时存在' }}</small>
          </div>
          <div class="detail-item">
            <dt>优先级</dt><dd>{{ task.priority ? priorityLabels[task.priority] : '未设置' }}</dd><small>对应 @priority</small>
          </div>
          <div class="detail-item">
            <dt>颜色</dt><dd class="color-value"><span class="color-mark small" :style="{ backgroundColor: taskColor }" aria-hidden="true"></span>{{ task.color ? colorLabels[task.color] : '跟随任务组' }}</dd><small>对应 @color</small>
          </div>
          <div class="detail-item">
            <dt>标签</dt>
            <dd v-if="task.tags.length" class="tag-list"><span v-for="tag in task.tags" :key="tag" class="tag">#{{ tag }}</span></dd>
            <dd v-else>未设置</dd><small>用于跨视图筛选</small>
          </div>
        </dl>
      </section>

      <section class="inspector-section" aria-labelledby="task-inspector-source-title">
        <div class="section-heading">
          <h3 id="task-inspector-source-title">来源与结构</h3>
          <span>{{ isGlobalTask ? '跨笔记任务' : '当前笔记任务' }}</span>
        </div>
        <dl class="source-list">
          <div><dt>来源笔记</dt><dd :title="sourcePath || sourceLabel">{{ sourceLabel }}</dd></div>
          <div><dt>任务组</dt><dd :title="task.blockId">{{ taskBlockLabel }}</dd></div>
          <div><dt>标题层级</dt><dd>{{ hierarchyLabel }}</dd></div>
          <div><dt>任务缩进</dt><dd>第 {{ task.depth + 1 }} 层</dd></div>
          <div><dt>源码行</dt><dd>第 {{ task.sourceRange.startLine + 1 }}–{{ task.sourceRange.endLine + 1 }} 行</dd></div>
          <div><dt>任务标识</dt><dd class="mono">{{ task.explicitId ? `@id(${task.explicitId})` : '未声明显式 @id' }}</dd></div>
        </dl>
      </section>

      <section class="inspector-section" aria-labelledby="task-inspector-relation-title">
        <div class="section-heading">
          <h3 id="task-inspector-relation-title">父子关系</h3>
          <span>{{ task.childIds.length }} 个子任务</span>
        </div>
        <div class="relationship-row">
          <span>父任务</span><strong>{{ task.parentId ? formatTaskName(parentTask) : '无（顶层任务）' }}</strong>
        </div>
        <ul v-if="task.childIds.length" class="relation-list" aria-label="子任务">
          <li v-for="childId in task.childIds" :key="childId">
            <span class="relation-dot" aria-hidden="true"></span>
            {{ formatTaskName(childTasks.find((child) => child.id === childId) || null) }}
          </li>
        </ul>
        <p v-else class="empty-relation">没有子任务。</p>
      </section>

      <section v-if="matchingDiagnostics.length" class="inspector-section diagnostics-section" aria-labelledby="task-inspector-diagnostics-title">
        <div class="section-heading">
          <h3 id="task-inspector-diagnostics-title">源码诊断</h3><span>{{ matchingDiagnostics.length }} 项</span>
        </div>
        <ul class="diagnostic-list">
          <li v-for="diagnostic in matchingDiagnostics" :key="`${diagnostic.code}-${diagnostic.lineIndex}-${diagnostic.message}`" :class="diagnostic.severity">
            <strong>{{ diagnostic.severity === 'error' ? '错误' : '提示' }}</strong>
            <span>{{ diagnostic.message }}（第 {{ diagnostic.lineIndex + 1 }} 行）</span>
          </li>
        </ul>
      </section>
    </template>

    <div v-else class="empty-inspector" role="status">
      <strong>尚未选择任务</strong>
      <p>从待办、日历或甘特中选择一项任务，查看详情。</p>
    </div>
  </aside>
</template>

<style scoped>
.task-inspector {
  --inspector-accent: var(--accent);
  min-width: 0;
  color: var(--ink);
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: var(--radius);
  overflow: hidden;
}

.inspector-head,
.inspector-section,
.empty-inspector { padding: 18px; }

.inspector-head {
  border-bottom: 1px solid var(--line);
  background: linear-gradient(135deg, color-mix(in srgb, var(--accent-soft) 58%, var(--surface)), var(--surface));
}

.inspector-kicker,
.inspector-title-row,
.inspector-actions,
.section-heading,
.color-value,
.tag-list,
.form-actions,
.relationship-row { display: flex; align-items: center; }

.inspector-kicker {
  gap: 7px;
  color: var(--muted);
  font-size: 12px;
  font-weight: 700;
  letter-spacing: .04em;
}

.color-mark {
  width: 9px;
  height: 9px;
  flex: 0 0 auto;
  border-radius: 999px;
  box-shadow: 0 0 0 3px color-mix(in srgb, currentColor 8%, transparent);
}
.color-mark.small { width: 8px; height: 8px; }

.type-pill,
.status-pill,
.tag { display: inline-flex; align-items: center; border-radius: 999px; white-space: nowrap; }

.type-pill {
  padding: 3px 7px;
  border: 1px solid var(--line);
  background: var(--surface);
  color: var(--muted);
  font-size: 11px;
  letter-spacing: 0;
}
.type-milestone { color: #7c3aed; border-color: color-mix(in srgb, #7c3aed 35%, var(--line)); }
.type-group { color: var(--accent-ink); border-color: color-mix(in srgb, var(--accent) 35%, var(--line)); }

.inspector-title-row {
  justify-content: space-between;
  align-items: flex-start;
  gap: 12px;
  margin-top: 10px;
}
.inspector-title { margin: 0; font-size: 19px; line-height: 1.35; letter-spacing: -.02em; }
.status-pill {
  flex: 0 0 auto;
  padding: 4px 8px;
  background: var(--accent-soft);
  color: var(--accent-ink);
  font-size: 12px;
  font-weight: 700;
}
.status-pill.done { background: var(--surface-2); color: var(--muted); text-decoration: line-through; }

.inspector-subtitle,
.empty-inspector p,
.readonly-notice p,
.empty-relation { margin: 8px 0 0; color: var(--muted); font-size: 12px; line-height: 1.6; }
.inspector-actions { flex-wrap: wrap; gap: 8px; margin-top: 15px; }
.inspector-actions :deep(.btn-solid),
.inspector-actions :deep(.btn-ghost),
.form-actions :deep(.btn-solid),
.form-actions :deep(.btn-ghost) { min-height: 32px; padding: 0 10px; font-size: 12px; }

.readonly-notice {
  margin: 14px 18px 0;
  padding: 10px 12px;
  border: 1px solid color-mix(in srgb, var(--danger) 35%, var(--line));
  border-radius: var(--radius-sm);
  background: var(--danger-soft);
  color: var(--ink);
}
.readonly-notice strong { font-size: 12px; color: var(--danger); }
.readonly-notice p { margin-top: 3px; }

.inspector-section { border-bottom: 1px solid var(--line); }
.inspector-section:last-child { border-bottom: 0; }
.section-heading { justify-content: space-between; gap: 12px; margin-bottom: 13px; }
.section-heading h3 { margin: 0; font-size: 13px; letter-spacing: .01em; }
.section-heading span { color: var(--faint); font-size: 11px; text-align: right; }

.detail-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 9px;
  margin: 0;
}
.detail-item {
  min-width: 0;
  padding: 10px;
  border: 1px solid var(--line);
  border-radius: var(--radius-sm);
  background: var(--surface-2);
}
.detail-item dt,
.source-list dt,
.relationship-row > span { color: var(--muted); font-size: 11px; }
.detail-item dd,
.source-list dd {
  min-width: 0;
  margin: 4px 0 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 13px;
  font-weight: 650;
}
.detail-item small,
.field small { display: block; margin-top: 5px; color: var(--faint); font-size: 10px; line-height: 1.45; }
.color-value { gap: 7px; }
.tag-list { flex-wrap: wrap; gap: 4px; }
.tag { padding: 2px 6px; background: var(--accent-soft); color: var(--accent-ink); font-size: 11px; font-weight: 650; }

.source-list {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px 16px;
  margin: 0;
}
.source-list dd.mono { font-family: var(--mono); font-size: 11px; font-weight: 500; }
.relationship-row { justify-content: space-between; gap: 12px; min-height: 32px; padding: 0 1px; }
.relationship-row strong {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 13px;
  text-align: right;
}
.relation-list,
.diagnostic-list { display: grid; gap: 6px; margin: 11px 0 0; padding: 0; list-style: none; }
.relation-list li {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  padding: 7px 9px;
  border-radius: 8px;
  background: var(--surface-2);
  color: var(--ink);
  font-size: 12px;
}
.relation-dot { width: 6px; height: 6px; flex: 0 0 auto; border-radius: 50%; background: var(--accent); }
.task-form {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}
.field { display: block; min-width: 0; }
.field-wide,
.form-actions,
.form-error { grid-column: 1 / -1; }
.field > span {
  display: block;
  margin-bottom: 6px;
  color: var(--muted);
  font-size: 11px;
  font-weight: 700;
}
.field input,
.field select {
  width: 100%;
  height: 34px;
  border: 1px solid var(--line);
  border-radius: 8px;
  outline: none;
  background: var(--surface);
  padding: 0 9px;
  color: var(--ink);
  font-size: 12px;
}
.field input:focus,
.field select:focus,
.inspector-actions button:focus-visible,
.form-actions button:focus-visible {
  border-color: var(--accent);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--accent) 18%, transparent);
}
.form-error {
  margin: 0;
  padding: 8px 10px;
  border-radius: 8px;
  background: var(--danger-soft);
  color: var(--danger);
  font-size: 12px;
  line-height: 1.45;
}
.form-actions { gap: 8px; margin-top: 2px; }

.diagnostics-section { background: color-mix(in srgb, var(--danger-soft) 30%, var(--surface)); }
.diagnostic-list li {
  display: grid;
  grid-template-columns: 32px minmax(0, 1fr);
  gap: 8px;
  padding: 8px 9px;
  border-radius: 8px;
  background: var(--surface);
  font-size: 12px;
  line-height: 1.45;
}
.diagnostic-list li strong { font-size: 11px; }
.diagnostic-list li.error strong { color: var(--danger); }
.diagnostic-list li.warning strong { color: #b45309; }

.empty-inspector { min-height: 176px; display: grid; align-content: center; }
.empty-inspector strong { font-size: 14px; }

@media (max-width: 520px) {
  .detail-grid,
  .source-list,
  .task-form { grid-template-columns: 1fr; }
  .field-wide,
  .form-actions,
  .form-error { grid-column: auto; }
}

@media (prefers-reduced-motion: reduce) {
  .task-inspector * { transition: none !important; }
}
</style>
