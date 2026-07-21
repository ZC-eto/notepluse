import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  hasSchedule,
  isLocalDate,
  isMultiDay,
  isTodayFocus,
  taskOccursOnDay,
} from './taskSyntax.ts'
import {
  countTasks,
  parseGanttTasks,
  parseScheduledTasks,
  parseTaskDocument,
  parseTasks,
} from './parseTasks.ts'
import {
  appendTask,
  applyTaskPatch,
  ensureTaskIds,
  removeTask,
  reorderTasksInBlock,
  toggleTaskDone,
  updateTaskDue,
  updateTaskSchedule,
} from './writeTasks.ts'

const block = (id: string, body: string, attrs = '') =>
  `<!-- mdw:tasks id="${id}"${attrs} -->\n${body}\n<!-- /mdw:tasks -->`

describe('Task Block parsing', () => {
  it('projects only checkbox items inside an explicit block', () => {
    const md = [
      '# 随手文档',
      '- [ ] 普通 checklist',
      '```md',
      '- [ ] 代码示例',
      '```',
      block('plan', '- [ ] 进入系统 @id(in)\n* [x] 星号也可用 @id(star)\n+ [ ] 加号也可用 @id(plus)'),
      '- [ ] 块外依旧普通',
    ].join('\n')
    const tasks = parseTasks(md)
    assert.deepEqual(tasks.map((task) => task.id), ['in', 'star', 'plus'])
    assert.equal(countTasks(md).total, 3)
  })

  it('records headings and nested checkbox hierarchy', () => {
    const md = [
      '# 项目 Alpha',
      '## 本周交付',
      block('alpha', [
        '- [ ] 发布准备 @id(release) @type(group)',
        '  - [ ] 编写发布说明 @id(notes)',
        '    - [ ] 审核文案 @id(copy)',
        '- [ ] 验收安装包 @id(smoke)',
      ].join('\n')),
    ].join('\n')
    const tasks = parseTasks(md)
    assert.deepEqual(tasks[0].headingPath, ['项目 Alpha', '本周交付'])
    assert.equal(tasks[0].type, 'group')
    assert.equal(tasks[1].parentId, 'release')
    assert.equal(tasks[1].depth, 1)
    assert.equal(tasks[2].parentId, 'notes')
    assert.equal(tasks[2].depth, 2)
    assert.deepEqual(tasks[0].childIds, ['notes'])
    assert.deepEqual(tasks[1].childIds, ['copy'])
    assert.equal(tasks[3].parentId, undefined)
  })

  it('does not parse fenced checkboxes inside a Task Block', () => {
    const md = block('safe', [
      '- [ ] 真实任务 @id(real)',
      '```markdown',
      '- [ ] 代码里的任务 @id(code)',
      '```',
    ].join('\n'))
    assert.deepEqual(parseTasks(md).map((task) => task.id), ['real'])
  })

  it('reports invalid block structures and excludes unsafe blocks', () => {
    const md = [
      '<!-- mdw:tasks name="无 id" -->',
      '- [ ] 不投影 @id(no-id)',
      '<!-- /mdw:tasks -->',
      block('same', '- [ ] 第一个 @id(one)'),
      block('same', '- [ ] 第二个 @id(two)'),
      '<!-- mdw:tasks id="open" -->',
      '- [ ] 未关闭 @id(open-task)',
    ].join('\n')
    const parsed = parseTaskDocument(md)
    assert.equal(parsed.tasks.length, 0)
    assert.deepEqual(
      new Set(parsed.diagnostics.map((diagnostic) => diagnostic.code)),
      new Set(['task-block-missing-id', 'task-block-duplicate-id', 'task-block-unclosed'])
    )
  })

  it('keeps scans read-only and marks id-less / duplicate-id tasks non-writable', () => {
    const md = block('plan', [
      '- [ ] 没有 id',
      '- [ ] 重复一 @id(dup)',
      '- [ ] 重复二 @id(dup)',
    ].join('\n'))
    const parsed = parseTaskDocument(md)
    assert.equal(ensureTaskIds(md), md)
    assert.equal(parsed.tasks[0].explicitId, undefined)
    assert.equal(parsed.tasks[0].isWritable, false)
    assert.equal(parsed.tasks[1].isWritable, false)
    assert.equal(parsed.tasks[2].isWritable, false)
    assert.equal(parsed.diagnostics.filter((d) => d.code === 'task-duplicate-id').length, 2)
  })
})

describe('LocalDate and projection semantics', () => {
  it('uses strict LocalDate validation and keeps due distinct from end', () => {
    assert.equal(isLocalDate('2026-02-29'), false)
    assert.equal(isLocalDate('2028-02-29'), true)
    assert.equal(isLocalDate('2026-7-2'), false)
    const md = block('dates', [
      '- [ ] 单日 @id(day) @date(2026-07-20)',
      '- [ ] 截止 @id(due) @due(2026-07-21)',
      '- [ ] 区间 @id(range) @start(2026-07-20) @end(2026-07-23)',
      '- [ ] 非法日期 @id(bad) @date(2026-02-29)',
      '- [ ] 反向区间 @id(reverse) @start(2026-07-24) @end(2026-07-20)',
    ].join('\n'))
    const parsed = parseTaskDocument(md)
    const due = parsed.tasks.find((task) => task.id === 'due')!
    assert.equal(due.due, '2026-07-21')
    assert.equal(due.end, undefined)
    assert.deepEqual(parseScheduledTasks(md).map((task) => task.id), ['day', 'due', 'range'])
    assert.deepEqual(parseGanttTasks(md).map((task) => task.id), ['range'])
    assert.ok(parsed.diagnostics.some((diagnostic) => diagnostic.code === 'task-invalid-date'))
    assert.ok(parsed.diagnostics.some((diagnostic) => diagnostic.code === 'task-invalid-range'))
  })

  it('maps date, due, range and Inbox to their intended Todo/Calendar behavior', () => {
    assert.equal(taskOccursOnDay({ date: '2026-07-20' }, '2026-07-20'), true)
    assert.equal(taskOccursOnDay({ due: '2026-07-21' }, '2026-07-21'), true)
    assert.equal(taskOccursOnDay({ start: '2026-07-20', end: '2026-07-22' }, '2026-07-21'), true)
    assert.equal(taskOccursOnDay({ start: '2026-07-22', end: '2026-07-20' }, '2026-07-21'), false)
    assert.equal(hasSchedule({}), false)
    assert.equal(isMultiDay({ start: '2026-07-20', end: '2026-07-20' }), false)
    assert.equal(isTodayFocus({ done: false }, '2026-07-20'), false)
    assert.equal(isTodayFocus({ done: false, due: '2026-07-19' }, '2026-07-20'), true)
    assert.equal(isTodayFocus({ done: false, date: '2026-07-20' }, '2026-07-20'), true)
  })
})

describe('minimal Task Block write-back', () => {
  it('patches only explicit ids and preserves due, unknown metadata, tags and CRLF', () => {
    const md = [
      '# 文档',
      '',
      '<!-- mdw:tasks id="write" -->',
      '- [ ] 原标题 @due(2026-07-21) @custom(keep-me) #产品 @id(write-1)',
      '<!-- /mdw:tasks -->',
      '',
    ].join('\r\n')
    const task = parseTasks(md)[0]
    const renamed = applyTaskPatch(md, task, { title: '新标题' })
    assert.ok(renamed.includes('@due(2026-07-21) @custom(keep-me) #产品 @id(write-1)'))
    assert.ok(renamed.includes('- [ ] 新标题'))
    assert.ok(renamed.includes('\r\n'))

    const done = toggleTaskDone(renamed, 'write-1')
    assert.ok(done.includes('- [x] 新标题'))
    const dueChanged = updateTaskDue(done, 'write-1', '2026-07-23')
    assert.ok(dueChanged.includes('@due(2026-07-23)'))
    assert.ok(!dueChanged.includes('@end(2026-07-23)'))
  })

  it('rejects no-id, duplicate-id and invalid-date/range writes without changing text', () => {
    const idless = block('x', '- [ ] 没 id')
    const idlessTask = parseTasks(idless)[0]
    assert.equal(applyTaskPatch(idless, idlessTask, { done: true }), idless)

    const duplicate = block('x', '- [ ] A @id(same)\n- [ ] B @id(same)')
    assert.equal(toggleTaskDone(duplicate, 'same'), duplicate)

    const scheduled = block('x', '- [ ] A @id(one) @start(2026-07-20) @end(2026-07-22)')
    assert.equal(updateTaskSchedule(scheduled, 'one', '2026-07-24', '2026-07-21'), scheduled)
    assert.equal(updateTaskSchedule(scheduled, 'one', 'bad-date', '2026-07-23'), scheduled)
  })

  it('appends only to a user-selected valid Task Block and creates an explicit id', () => {
    const md = [
      block('first', '- [ ] 已有 @id(old)'),
      '',
      block('second', '- [ ] 另一个 @id(other)'),
    ].join('\n')
    assert.equal(appendTask(md, { title: '不应写入' }), md)
    const next = appendTask(md, {
      blockId: 'second',
      title: '新任务',
      due: '2026-07-25',
      tags: ['发布'],
    })
    const tasks = parseTasks(next)
    assert.equal(tasks.length, 3)
    const created = tasks.find((task) => task.title === '新任务')!
    assert.equal(created.blockId, 'second')
    assert.ok(created.explicitId)
    assert.equal(created.due, '2026-07-25')
    assert.ok(next.indexOf('新任务') > next.indexOf('id="second"'))
  })

  it('removes only a unique explicit task line inside its block', () => {
    const md = block('remove', '- [ ] 保留 @id(keep)\n- [ ] 删除 @id(delete)')
    const next = removeTask(md, 'delete')
    assert.deepEqual(parseTasks(next).map((task) => task.id), ['keep'])
    assert.ok(next.includes('<!-- /mdw:tasks -->'))
  })

  it('reorders two writable tasks inside the same block', () => {
    const md = block('ord', '- [ ] 甲 @id(a)\n- [ ] 乙 @id(b)\n- [ ] 丙 @id(c)')
    const next = reorderTasksInBlock(md, 'a', 'b')
    assert.deepEqual(parseTasks(next).map((t) => t.id), ['b', 'a', 'c'])
    // cross-block no-op
    const multi = [block('x', '- [ ] X @id(x)'), block('y', '- [ ] Y @id(y)')].join('\n')
    assert.equal(reorderTasksInBlock(multi, 'x', 'y'), multi)
  })
})