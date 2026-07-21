import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  applySourceToolbar,
  applySourceFormat,
  resolveEditorShortcut,
  formatToday,
  markdownToEditableHtml,
  editableHtmlToMarkdown,
  sanitizeRenderedHtml,
} from './markdownBridge.ts'

describe('markdownBridge toolbar', () => {
  it('formats today as YYYY-MM-DD', () => {
    const d = new Date(2026, 6, 19)
    assert.equal(formatToday(d), '2026-07-19')
  })

  it('wraps selection with bold', () => {
    const r = applySourceToolbar('hello world', 0, 5, 'bold')
    assert.equal(r.text, '**hello** world')
  })

  it('prefixes heading lines', () => {
    const r = applySourceToolbar('标题', 0, 2, 'h1')
    assert.equal(r.text, '# 标题')
    const r2 = applySourceToolbar('小节', 0, 2, 'h2')
    assert.equal(r2.text, '## 小节')
  })

  it('creates bullet and task lines', () => {
    const list = applySourceToolbar('事项', 0, 2, 'list')
    assert.equal(list.text, '- 事项')
    const task = applySourceToolbar('待办', 0, 2, 'task')
    assert.equal(task.text, '- [ ] 待办')
  })

  it('inserts date at caret', () => {
    const r = applySourceToolbar('截止 ', 3, 3, 'date')
    assert.match(r.text, /^截止 \d{4}-\d{2}-\d{2}$/)
  })

  it('renders only a valid Task Block task line into editable task html', () => {
    const html = markdownToEditableHtml(`<!-- mdw:tasks id="editor-test" name="编辑器测试" -->

- [ ] 任务A @id(task-a) @start(2026-07-20)

<!-- /mdw:tasks -->
`)
    assert.match(html, /task-list/)
    assert.match(html, /任务A/)
    assert.match(html, /@start\(2026-07-20\)/)
  })

  it('keeps checkboxes outside a valid Task Block as ordinary Markdown', () => {
    const html = markdownToEditableHtml('- [ ] 普通文档清单\n')
    assert.doesNotMatch(html, /task-list/)
    assert.match(html, /普通文档清单/)
  })

  it('does not upgrade tasks from an unclosed Task Block', () => {
    const html = markdownToEditableHtml('<!-- mdw:tasks id="broken" -->\n- [ ] 不应互动 @id(broken-task)\n')
    assert.doesNotMatch(html, /task-list/)
  })

  it('preserves Task Block boundaries as non-editable source markers', () => {
    const opening = '<!-- mdw:tasks id="round-trip" name="Iteration" color="violet" -->'
    const closing = '<!-- /mdw:tasks -->'
    const html = markdownToEditableHtml(`${opening}\n- [ ] Round trip task @id(round-trip-task)\n${closing}\n`)

    assert.match(html, /class="task-block-boundary"/)
    assert.match(html, /data-mdw-task-boundary="open"/)
    assert.match(html, /data-mdw-task-boundary="close"/)
    assert.match(html, /data-mdw-source="&lt;!-- mdw:tasks id=&quot;round-trip&quot; name=&quot;Iteration&quot; color=&quot;violet&quot; --&gt;"/)
    assert.match(html, /data-mdw-source="&lt;!-- \/mdw:tasks --&gt;"/)
    assert.match(html, /task-block-boundary/)
    assert.match(html, /data-mdw-task-boundary="close"/)
    assert.doesNotMatch(html, /\u4efb\u52a1\u5757\u5f00\u59cb/)
  })

  it('keeps Task Block-looking comments inside fenced code as ordinary Markdown', () => {
    const html = markdownToEditableHtml('```md\n<!-- mdw:tasks id="example" -->\n- [ ] Example @id(example)\n<!-- /mdw:tasks -->\n```')
    assert.doesNotMatch(html, /task-block-boundary/)
    assert.doesNotMatch(html, /task-list/)
    assert.match(html, /mdw:tasks/)
  })

  it('empty markdown becomes empty html', () => {
    assert.equal(markdownToEditableHtml(''), '')
    assert.equal(markdownToEditableHtml('   \n'), '')
  })
})

describe('markdownBridge format shortcuts', () => {
  it('italic / underline / strike / code wrap and unwrap', () => {
    assert.equal(applySourceFormat('ab', 0, 2, 'italic').text, '*ab*')
    assert.equal(applySourceFormat('*ab*', 0, 4, 'italic').text, 'ab')
    assert.equal(applySourceFormat('ab', 0, 2, 'underline').text, '<u>ab</u>')
    assert.equal(applySourceFormat('<u>ab</u>', 0, 9, 'underline').text, 'ab')
    assert.equal(applySourceFormat('ab', 0, 2, 'strikethrough').text, '~~ab~~')
    assert.equal(applySourceFormat('~~ab~~', 0, 6, 'strikethrough').text, 'ab')
    assert.equal(applySourceFormat('ab', 0, 2, 'code').text, '`ab`')
    assert.equal(applySourceFormat('`ab`', 0, 4, 'code').text, 'ab')
  })

  it('bold unwraps when already marked', () => {
    const r = applySourceFormat('**hello** world', 0, 9, 'bold')
    assert.equal(r.text, 'hello world')
  })

  it('link wraps selection and selects url', () => {
    const r = applySourceFormat('docs', 0, 4, 'link')
    assert.equal(r.text, '[docs](https://)')
    assert.equal(r.text.slice(r.start, r.end), 'https://')
  })

  it('link from bare url uses selection as href', () => {
    const r = applySourceFormat('https://a.com', 0, 13, 'link')
    assert.equal(r.text, '[链接文字](https://a.com)')
  })

  it('h1-h6 levels', () => {
    assert.equal(applySourceFormat('T', 0, 1, 'h3').text, '### T')
    assert.equal(applySourceFormat('T', 0, 1, 'h6').text, '###### T')
  })

  it('ordered list', () => {
    assert.equal(applySourceFormat('事项', 0, 2, 'ol').text, '1. 事项')
    assert.equal(applySourceFormat('- 事项', 0, 4, 'ol').text, '1. 事项')
  })

  it('toggle task checkbox', () => {
    const on = applySourceFormat('- [ ] 待办', 0, 0, 'toggleTask')
    assert.equal(on.text, '- [x] 待办')
    const off = applySourceFormat('- [x] 待办', 0, 0, 'toggleTask')
    assert.equal(off.text, '- [ ] 待办')
  })

  it('tab cycles heading then plain; shiftTab reverse', () => {
    let t = '# 标题'
    t = applySourceFormat(t, 0, 0, 'tab').text
    assert.equal(t, '## 标题')
    t = applySourceFormat(t, 0, 0, 'tab').text
    assert.equal(t, '### 标题')
    // jump to h6
    for (let i = 0; i < 3; i++) t = applySourceFormat(t, 0, 0, 'tab').text
    assert.equal(t, '###### 标题')
    t = applySourceFormat(t, 0, 0, 'tab').text
    assert.equal(t, '标题')
    t = applySourceFormat('# 标题', 0, 0, 'shiftTab').text
    assert.equal(t, '标题')
  })

  it('tab indents list / task; shiftTab outdents', () => {
    const ind = applySourceFormat('- 项', 0, 0, 'tab')
    assert.equal(ind.text, '  - 项')
    const out = applySourceFormat('  - 项', 0, 0, 'shiftTab')
    assert.equal(out.text, '- 项')
    const task = applySourceFormat('- [ ] A', 0, 0, 'tab')
    assert.equal(task.text, '  - [ ] A')
  })

  it('tab on plain inserts two spaces at caret', () => {
    const r = applySourceFormat('hello', 2, 2, 'tab')
    assert.equal(r.text, 'he  llo')
    assert.equal(r.start, 4)
  })
})

describe('resolveEditorShortcut', () => {
  const base = { key: '', ctrlKey: true, metaKey: false, shiftKey: false, altKey: false }

  it('maps common inline shortcuts', () => {
    assert.equal(resolveEditorShortcut({ ...base, key: 'b', code: 'KeyB' }), 'bold')
    assert.equal(resolveEditorShortcut({ ...base, key: 'i', code: 'KeyI' }), 'italic')
    assert.equal(resolveEditorShortcut({ ...base, key: 'u', code: 'KeyU' }), 'underline')
    assert.equal(resolveEditorShortcut({ ...base, key: 'k', code: 'KeyK' }), 'link')
  })

  it('maps shift combos', () => {
    assert.equal(
      resolveEditorShortcut({ ...base, key: 'x', code: 'KeyX', shiftKey: true }),
      'strikethrough'
    )
    assert.equal(
      resolveEditorShortcut({ ...base, key: '`', code: 'Backquote', shiftKey: true }),
      'code'
    )
    assert.equal(
      resolveEditorShortcut({ ...base, key: '*', code: 'Digit8', shiftKey: true }),
      'ul'
    )
    assert.equal(
      resolveEditorShortcut({ ...base, key: '(', code: 'Digit9', shiftKey: true }),
      'ol'
    )
    assert.equal(
      resolveEditorShortcut({ ...base, key: 't', code: 'KeyT', shiftKey: true }),
      'toggleTask'
    )
  })

  it('maps ctrl+enter toggle and ctrl+alt headings', () => {
    assert.equal(resolveEditorShortcut({ ...base, key: 'Enter', code: 'Enter' }), 'toggleTask')
    assert.equal(
      resolveEditorShortcut({ ...base, key: '1', code: 'Digit1', altKey: true }),
      'h1'
    )
    assert.equal(
      resolveEditorShortcut({ ...base, key: '6', code: 'Digit6', altKey: true }),
      'h6'
    )
  })

  it('does not steal global ctrl+1..4 view keys', () => {
    assert.equal(resolveEditorShortcut({ ...base, key: '1', code: 'Digit1' }), null)
    assert.equal(resolveEditorShortcut({ ...base, key: 's', code: 'KeyS' }), null)
    assert.equal(resolveEditorShortcut({ ...base, key: 'n', code: 'KeyN' }), null)
  })

  it('maps undo / redo shortcuts', () => {
    assert.equal(resolveEditorShortcut({ ...base, key: 'z', code: 'KeyZ' }), 'undo')
    assert.equal(
      resolveEditorShortcut({ ...base, key: 'z', code: 'KeyZ', shiftKey: true }),
      'redo'
    )
    assert.equal(resolveEditorShortcut({ ...base, key: 'y', code: 'KeyY' }), 'redo')
  })

  it('maps tab / shift+tab', () => {

    assert.equal(
      resolveEditorShortcut({
        key: 'Tab',
        code: 'Tab',
        ctrlKey: false,
        shiftKey: false,
        altKey: false,
      }),
      'tab'
    )
    assert.equal(
      resolveEditorShortcut({
        key: 'Tab',
        code: 'Tab',
        ctrlKey: false,
        shiftKey: true,
        altKey: false,
      }),
      'shiftTab'
    )
  })
})

describe('wysiwyg task meta fidelity', () => {
  it('keeps id start end tags in data attributes', () => {
    const md = `<!-- mdw:tasks id="meta-test" -->

- [ ] 任务甲 @start(2026-07-20) @end(2026-07-22) @due(2026-07-23) @priority(high) @color(violet) @id(t_demo1) #产品

<!-- /mdw:tasks -->
`
    const html = markdownToEditableHtml(md)
    assert.match(html, /data-title="任务甲"/)
    assert.match(html, /@start\(2026-07-20\)/)
    assert.match(html, /@end\(2026-07-22\)/)
    assert.match(html, /@due\(2026-07-23\)/)
    assert.match(html, /@priority\(high\)/)
    assert.match(html, /@color\(violet\)/)
    assert.match(html, /@id\(t_demo1\)/)
    assert.match(html, /#产品/)
    assert.match(html, /task-title/)
  })
})


describe('task list integrity', () => {
  it('does not merge consecutive task lines into one item', () => {
    const md = `<!-- mdw:tasks id="integrity-test" -->

- [ ] 写产品需求 @id(requirements) @start(2026-07-20) @end(2026-07-24) #产品
- [ ] 设计交互稿 @id(design) @start(2026-07-24) @end(2026-07-28) #设计
- [x] 完成技术调研 @id(research) @start(2026-07-15) @end(2026-07-18) #研发

<!-- /mdw:tasks -->
`
    const html = markdownToEditableHtml(md)
    const items = html.match(/class="task-item"/g) || []
    assert.equal(items.length, 3)
    assert.match(html, /data-title="写产品需求"/)
    assert.match(html, /data-title="设计交互稿"/)
    assert.match(html, /data-title="完成技术调研"/)
    assert.ok(!html.includes('写产品需求 设计交互稿'))
  })
})


describe('markdown preview sanitizer', () => {
  it('removes executable elements, event attributes and unsafe URLs', () => {
    const safe = sanitizeRenderedHtml(
      '<img src=x onerror="globalThis.pwned=1"><a href="javascript:alert(1)">bad</a><a href="&#x6a;avascript:alert(2)">encoded</a><script>alert(3)</script><svg onload=alert(4)><circle /></svg>'
    )
    assert.doesNotMatch(safe, /onerror|onload|javascript:|<script|<svg/i)
    assert.match(safe, /<img src=x>/)
  })

  it('sanitizes raw Markdown HTML before it reaches the editable preview', () => {
    const html = markdownToEditableHtml('<a href="data:text/html,x" onclick="alert(1)">危险链接</a>')
    assert.doesNotMatch(html, /data:|onclick/i)
    assert.match(html, /危险链接/)
  })
})

describe('soft line-break fidelity', () => {
  it('renders single newlines as <br> (breaks:true)', () => {
    const html = markdownToEditableHtml('line1\nline2\n')
    assert.match(html, /line1\s*<br\s*\/?>\s*line2/i)
  })

  it('keeps paragraph breaks as separate blocks', () => {
    const html = markdownToEditableHtml('line1\n\nline2\n')
    assert.match(html, /<p>line1<\/p>/i)
    assert.match(html, /<p>line2<\/p>/i)
  })

  it('renders multi soft-breaks inside one paragraph', () => {
    const html = markdownToEditableHtml('a\nb\nc\n')
    assert.match(html, /a\s*<br\s*\/?>\s*b\s*<br\s*\/?>\s*c/i)
  })

  it('renders Chinese soft breaks without collapsing', () => {
    const html = markdownToEditableHtml('第一行\n第二行\n\n第三段\n')
    assert.match(html, /第一行\s*<br\s*\/?>\s*第二行/i)
    assert.match(html, /第三段/)
  })

  it('hard-break trailing spaces also become <br>', () => {
    const html = markdownToEditableHtml('hello  \nworld\n')
    assert.match(html, /hello\s*<br\s*\/?>\s*world/i)
  })

  it('round-trips soft newlines via turndown-compatible HTML string', async () => {
    // 不依赖 jsdom：用 marked + 与生产一致的 turndown 规则做纯函数往返
    const { marked } = await import('marked')
    const TurndownService = (await import('turndown')).default
    marked.setOptions({ gfm: true, breaks: true })
    const turndown = new TurndownService({
      headingStyle: 'atx',
      codeBlockStyle: 'fenced',
      bulletListMarker: '-',
      emDelimiter: '*',
      strongDelimiter: '**',
    })
    turndown.addRule('softLineBreak', {
      filter: 'br',
      replacement: () => '\n',
    })
    const normalize = (md: string) =>
      md
        .replace(/\n{3,}/g, '\n\n')
        .replace(/[ \t]+\n/g, '\n')
        .replace(/^(\s*[-*+]|\s*\d+\.)\s{2,}/gm, '$1 ')
        .trim() + '\n'

    const samples = [
      'line1\nline2\n',
      'line1\n\nline2\n',
      'hello  \nworld\n',
      'a\nb\nc\n',
      '第一行\n第二行\n\n第三段\n',
      '**粗** 与 *斜*\n下一行\n',
    ]
    for (const md of samples) {
      const html = marked.parse(md, { async: false }) as string
      const back = normalize(turndown.turndown(html))
      // 行尾两空格硬换行归一为软换行
      const expectMd = md.replace(/[ \t]+\n/g, '\n')
      assert.equal(back, expectMd, `round-trip failed for ${JSON.stringify(md)} → ${JSON.stringify(back)}`)
    }
  })
})
