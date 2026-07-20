import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  attachNoteMeta,
  collectGlobalTasks,
  countGlobalTasks,
  globalTaskKey,
  noteDisplayName,
  type NoteTaskCacheEntry,
} from './globalTasks.ts'
import { parseTasks } from './parseTasks.ts'

const block = (id: string, body: string) =>
  `<!-- mdw:tasks id="${id}" -->\n${body}\n<!-- /mdw:tasks -->`

describe('global Task Block aggregation', () => {
  it('noteDisplayName strips .md', () => {
    assert.equal(noteDisplayName('本周计划.md'), '本周计划')
    assert.equal(noteDisplayName('README'), 'README')
  })

  it('attachNoteMeta preserves Task Block source fields', () => {
    const tasks = parseTasks(block('plan', '- [ ] A @id(a1)\n- [x] B @id(b1)'))
    const globals = attachNoteMeta(tasks, {
      path: '/notes/工作/plan.md',
      name: 'plan.md',
      folder: '工作',
    })
    assert.equal(globals.length, 2)
    assert.equal(globals[0].notePath, '/notes/工作/plan.md')
    assert.equal(globals[0].noteName, 'plan')
    assert.equal(globals[0].folder, '工作')
    assert.equal(globals[0].blockId, 'plan')
  })

  it('aggregates only Task Blocks and keeps ordinary markdown invisible', () => {
    const notes = [
      { path: 'n1', name: '有任务.md', folder: '工作', mtime: 10 },
      { path: 'n2', name: '纯文字.md', folder: '记录', mtime: 20 },
      { path: 'n3', name: '另一篇.md', folder: '个人', mtime: 30 },
    ]
    const bodies: Record<string, string> = {
      n1: `# a\n\n- [ ] 普通清单\n${block('work', '- [ ] 任务一 @id(t1)')}`,
      n2: '# 日记\n\n今天天气不错\n- [ ] 仅文档 checklist\n',
      n3: block('personal', '- [x] 已完成 @id(t2)\n- [ ] 未完成 @id(t3)'),
    }
    const cache = new Map<string, NoteTaskCacheEntry>()
    const all = collectGlobalTasks(notes, { readContent: (path) => bodies[path], cache })
    assert.deepEqual(all.map((task) => task.id).sort(), ['t1', 't2', 't3'])
    assert.equal(all.find((task) => task.id === 't1')?.folder, '工作')
    assert.equal(all.find((task) => task.id === 't3')?.noteName, '另一篇')

    const stats = countGlobalTasks(all)
    assert.deepEqual(stats, { total: 3, done: 1, open: 2 })
  })

  it('mtime cache avoids re-read when unchanged', () => {
    const notes = [{ path: 'n1', name: 'a.md', folder: '', mtime: 100 }]
    let reads = 0
    const cache = new Map<string, NoteTaskCacheEntry>()
    const readContent = () => {
      reads++
      return block('cache', '- [ ] once @id(x1)')
    }
    const first = collectGlobalTasks(notes, { readContent, cache })
    const second = collectGlobalTasks(notes, { readContent, cache })
    assert.equal(first.length, 1)
    assert.equal(second.length, 1)
    assert.equal(reads, 1)

    const third = collectGlobalTasks([{ ...notes[0], mtime: 200 }], { readContent, cache })
    assert.equal(third.length, 1)
    assert.equal(reads, 2)
  })

  it('activeContent overrides disk and remains subject to Task Block rules', () => {
    const notes = [
      { path: 'active', name: '当前.md', folder: '工作', mtime: 1 },
      { path: 'other', name: '其他.md', folder: '个人', mtime: 2 },
    ]
    const disk: Record<string, string> = {
      active: block('old', '- [ ] 磁盘旧版 @id(old)'),
      other: block('other', '- [ ] 其他任务 @id(o1)'),
    }
    const cache = new Map<string, NoteTaskCacheEntry>()
    const all = collectGlobalTasks(notes, {
      readContent: (path) => disk[path],
      cache,
      activePath: 'active',
      activeContent: `- [ ] 块外\n${block('new', '- [ ] 内存新版 @id(new)\n- [x] 额外 @id(extra)')}`,
    })
    assert.deepEqual(all.map((task) => task.id).sort(), ['extra', 'new', 'o1'])
    assert.ok(!all.some((task) => task.id === 'old'))
  })

  it('globalTaskKey is unique across notes with the same task id', () => {
    const a = globalTaskKey({ notePath: 'p1', id: 'same', lineIndex: 0 })
    const b = globalTaskKey({ notePath: 'p2', id: 'same', lineIndex: 0 })
    assert.notEqual(a, b)
  })
})