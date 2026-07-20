# Markdown Workspace 质量、安全与交互审计

- **审计日期**：2026-07-20（Asia/Shanghai）
- **审计对象**：`C:\Users\Zebra\Documents\Codex\2026-07-19\ztoolscenter-ztools-https-github-com-ztoolscenter\work\md-workspace`
- **审计范围**：Markdown 编辑器安全、WYSIWYG 往返保真、XSS、LocalDate/时区、任务回写冲突，以及 Todo / Gantt / Calendar 的数据契约。
- **限制**：本审计没有修改任何 `src` 文件；仅依据当前工作区快照、静态检查和最小运行验证形成结论。

> **快照说明（重要）**：审计过程中发现工作区正在并行进行任务领域模型重构：`src/core/types.ts` 与 `src/core/taskSyntax.ts` 已声明 Task Block、`date/due` 分离、层级等新字段，而 `src/core/parseTasks.ts`、`src/core/writeTasks.ts`、`src/composables/useWorkspace.ts` 与三个视图仍依赖旧模型。下文将“当前构建中断”与“即使完成编译后仍存在的产品/安全缺陷”分别列出；不要以临时修改测试来掩盖前者。

---

## 1. 执行摘要

当前版本不适合作为可写入用户 Markdown 的发布候选：存在**可执行 HTML/`javascript:` 链接注入**、**任务解析误收录普通文档内容**、**打开笔记即静默改写**、**跨笔记无版本校验覆盖**和**当前类型契约导致构建失败**五类 P0 问题。

产品数据模型也尚未真正统一：Todo、Calendar、Gantt 都直接从旧 `Task.start/end` 推导含义；`@due` 仍被部分旧链路视作 `end`，而新语法已经将它们分离。若现在继续在视图层叠加颜色、拖拽、快捷新增或“本周计划”等功能，会扩大不可逆回写风险。

**建议发布闸门**：先完成 P0-01 至 P0-08、补足相应自动化测试，并使 `npm run test:core` 和 `npm run build` 全绿；再进入 UI 与交互重设计。

---

## 2. 已执行检查与结果

### 2.1 脚本和现有测试

`package.json` 当前仅提供：

| 脚本 | 作用 | 审计结论 |
| --- | --- | --- |
| `npm run test:core` | Node 内置 test + `tsx`，只运行 3 个 core 测试文件 | 没有浏览器/E2E、无真实 contenteditable、无 XSS、无文件冲突、无视图投影集成测试。 |
| `npm run build` | `vue-tsc --noEmit` + Vite ship build | 是正确的发布前最小门槛，但当前失败。 |
| `npm run dev` / `preview` | 本地人工验证 | 没有脚本化冒烟。 |
| `pack` / `pack:only` | 打包 | `pack` 依赖 build；当前应被构建失败阻断。 |

本次实际执行：

```powershell
npx tsx -e "import { markdownToEditableHtml } from './src/core/markdownBridge.ts'; /* XSS payload */"
npm run test:core
npm run build
```

结果：

- XSS 最小验证输出保留了 `<img src=x onerror=alert(1)>`、`href="javascript:alert(1)"` 和 `<script>alert(2)</script>`；见 P0-01。
- `npm run test:core`：**67 tests，37 passed，30 failed**。失败集中在 `Task` 新字段已变为必填、但解析器仍构造旧对象，及旧测试仍期待“全文 checkbox 即任务”的历史语义。
- `npm run build`：**失败**。`src/core/parseTasks.ts:32` 构造的对象缺少 `isWritable`、`blockId`、`sourceRange`、`headingPath`、`childIds`、`depth`、`type` 等必填字段。

### 2.2 现有测试覆盖缺口

现有 67 个测试主要覆盖行级解析、序列化、少量源码快捷键和跨笔记 mtime 缓存。下列高风险路径没有自动化验证：

- 不可信 Markdown 的 HTML、事件处理器、SVG、MathML、协议 URL 与粘贴 HTML；
- 真实浏览器 `contenteditable` 输入、粘贴、撤销、切换源码/WYSIWYG、IME；
- Markdown 完整文档往返（frontmatter、表格、引用、代码围栏、HTML、嵌套列表）；
- Task Block 边界、未闭合块、重复 block/task ID、标题路径和父子层级；
- `date` / `due` / 区间 / milestone 的三视图契约；
- 文件被外部进程修改后的写入冲突和原子失败；
- 非 UTC 时区、夏令时切换日与跨午夜本地日期；
- 键盘和读屏交互。

---

## 3. P0：必须在继续功能开发或发布前修复

### P0-01：Markdown 渲染可注入活动 HTML 与危险 URL（XSS）

- **证据**：`src/core/markdownBridge.ts:10, 472-521` 使用 `marked.parse()` 生成 HTML；`src/views/EditorView.vue:91,119,269` 直接赋给 `element.innerHTML`。没有 sanitizer、allowlist 或 URL scheme 校验。
- **复现**：在任意笔记源码输入：

  ```markdown
  <img src=x onerror=alert(document.domain)>
  [点击](javascript:alert(1))
  <script>alert(2)</script>
  ```

  切换到 WYSIWYG 或重新打开笔记。最小命令验证显示输出原样包含事件属性、`javascript:` URL 和 `script` 标签。
- **影响**：若宿主 WebView 允许脚本，打开本地笔记即可执行任意前端上下文代码；可能访问插件 API、文件路径、用户内容或诱导写操作。即使 CSP 阻止部分 payload，也不能将其作为防线。
- **明确修复建议**：
  1. 在 Markdown→DOM 的唯一入口采用严格 HTML sanitizer（allowlist 标签/属性/协议）；默认删除 `script/style/iframe/object/embed/svg/math`、所有 `on*` 属性、`srcdoc`、`data:`/`javascript:`/未知 URL scheme。
  2. 不要以 `escapeHtml` 替代 sanitizer：它只保护由程序拼接的任务标题，不能处理 `marked` 输出的原始 HTML。
  3. WYSIWYG 插入链接时也必须复用 `isSafeUrl`；`EditorView.vue:210` 当前只替换双引号，仍允许 `javascript:`。
  4. 优先禁用 Markdown 原始 HTML，或仅在明确产品需求下经 sanitizer 后渲染。
- **待补测试**：浏览器级测试：`script`、`img onerror`、`svg onload`、`<a href=javascript:...>`、编码/大小写变体、`data:text/html`、恶意粘贴 HTML；断言 DOM 中没有危险节点/属性，且点击链接不会执行脚本。

### P0-02：任务领域模型处于不一致中断态，核心测试与构建均失败

- **证据**：新 `src/core/types.ts:34-100` 要求 `Task.blockId/sourceRange/headingPath/childIds/depth/type/isWritable` 并分离 `date/due`；旧 `src/core/parseTasks.ts:14-45` 仍只生成 `start/end/tags/lineIndex`。`writeTasks.ts` 与视图也仍消费旧字段。
- **复现**：执行 `npm run test:core` 和 `npm run build`，可稳定复现 30 个测试失败与 `TS2345`。
- **影响**：项目不可交付；若跳过类型检查强行运行，解析、回写和视图将读取不同语义的对象，造成数据遗漏或错写。
- **明确修复建议**：以一个完整 PR/提交完成 Phase 1，而非逐文件半更新：
  1. 先固定 `TaskParseResult` 和 `Task` 合同；
  2. 让 parse、global aggregate、write、workspace、Todo/Gantt/Calendar 在同一次迁移中改为只消费该合同；
  3. 删除所有旧 `@due -> end` 兼容性歧义或改为明确的迁移适配层；
  4. 仅在 `test:core` 与 `build` 均通过后进行下一阶段 UI 修改。
- **待补测试**：对新类型建立编译期 fixture（`satisfies Task`）、Task Block 解析快照、跨视图投影契约测试；保留旧格式迁移测试但不再把旧行为当产品规则。

### P0-03：解析器仍全文扫描 checkbox，普通文档、代码与引用会进入任务系统

- **证据**：`src/core/parseTasks.ts:18-43` 对每一行运行 `TASK_LINE_RE`；不存在 Task Block 状态机，也没有 fenced code/frontmatter/HTML/comment 边界。`src/core/globalTasks.ts:46-70` 对所有笔记复用该解析器。
- **复现**：

  ```markdown
  # 普通说明
  - [ ] 普通 checklist，不应进入任务看板

  ```md
  - [ ] 代码示例，不应进入任务看板
  ```

  > - [ ] 引用内容，不应进入任务看板
  ```

  打开 Todo 的“全部”或 Calendar/Gantt，可见这些内容被投影（当前旧解析器仅看行首 `- [ ]`；代码围栏里的行同样满足）。
- **影响**：违反“Markdown 随便写的 checklist 不能渲染到任务视图”的核心数据边界；后续从视图修改会反向改坏普通文档。
- **明确修复建议**：实现单一 `parseTaskDocument(markdown): TaskParseResult`：仅识别 `<!-- mdw:tasks ... -->` 和 `<!-- /mdw:tasks -->` 之间的 checkbox；跳过 frontmatter、fenced code、HTML 示例和引用；对未闭合/嵌套/重复 block ID 输出诊断且不允许写回。
- **待补测试**：普通 checkbox、`*`/`+` 任务标记、代码围栏、四空格代码、引用、HTML、多个 block、相邻 block、未闭合 block、重复 block id、任务块外同名 task ID。

### P0-04：打开、编辑和新建路径仍会静默改写用户 Markdown

- **证据**：`src/composables/useWorkspace.ts:53-54,299-303,589-601,604-617` 默认 `autoStampTaskIds=true`，`openNote()` 调用 `ensureTaskIds()` 后标脏并自动保存；`createNote()` 和示例路径也调用 `ensureTaskIds()`。旧 `writeTasks.ts:20-57` 全文为缺 ID 行补 ID。
- **复现**：创建只含 `- [ ] 原始清单 @due(2026-07-21) #自定义` 的笔记，关闭应用后重新打开；不进行任何用户编辑，文件会被补入 `@id(...)` 并且被旧序列化规范化。
- **影响**：违反 Markdown 是唯一真源与“扫描/打开只读”；会污染普通文档，并可能丢失未知 metadata、任务符号、空行和 CRLF。
- **明确修复建议**：删除/默认关闭自动补写路径。解析时为缺 ID 任务生成只读派生身份，标记 `isWritable=false`；用户通过显式“迁移为任务块/补 ID”操作确认后，才产生最小补丁。新建任务由新建命令生成 ID，但必须选择 Task Block。
- **待补测试**：打开、扫描、切换视图、刷新笔记、聚合全局任务均 byte-for-byte 不改变文件；显式迁移才变更，且只改目标 token。

### P0-05：任务回写是整行重序列化，定位可退化为标题模糊匹配，存在误改与语义丢失

- **证据**：`src/core/writeTasks.ts:5-18` 在 ID/原行不匹配时以 `includes(task.title)` 回退；`60-77` 调 `serializeTaskLine()` 整行重写。旧语义的 `stripMeta()` 将 `@due` 映射到 `end`（`taskSyntax.ts` 的旧调用方/`writeTasks.ts` 未同步新模型），未知 `@xxx()`、原列表 marker、空格、属性顺序、CRLF 都不能保证保留。
- **复现**：

  ```markdown
  <!-- mdw:tasks id="plan" -->
  - [ ] 同名任务 @due(2026-07-21) @owner(alice) @id(a)
  - [ ] 同名任务 @owner(bob) @id(b)
  <!-- /mdw:tasks -->
  ```

  在一个旧快照中先编辑标题/外部修改使 `rawLine` 不同，再从视图勾选或排期；回退匹配可能选中第一条同名任务。即使命中正确条目，也会丢 `@owner` 并把 due/end 语义改写。
- **影响**：任务系统可能无提示修改错误任务或损失用户扩展 metadata；这是不可接受的数据完整性风险。
- **明确修复建议**：写回 API 必须接收 `TaskRef(notePath, blockId, explicitId, sourceRange, expectedRawToken/版本)`，并只对目标 checkbox/已请求 metadata token 做 token-level patch。没有唯一 `explicitId`、遇到重复 ID、源范围漂移或 expected 文本不符时必须失败并显示可恢复错误，绝不能标题模糊匹配。
- **待补测试**：同标题、重复 ID、外部插入行、未知 metadata、`@due`、`@date`、属性顺序、`*`/`+` marker、CRLF、尾随空格、Unicode/emoji 标题的最小差异断言。

### P0-06：跨笔记修改没有乐观并发控制，会覆盖外部修改

- **证据**：`src/composables/useWorkspace.ts:378-388` 对非活动笔记 `readNoteMarkdown -> transform -> writeNoteMarkdown`，没有 mtime/etag/内容哈希确认；`365-376` 直接写文件。活动笔记 `flushSave()` 只处理应用内编辑竞态（`639-700`），不会检测磁盘被外部编辑器改写。
- **复现**：在 Todo“全部”选一条非当前笔记任务；在外部编辑器修改同文件并保存；再在 Todo 勾选或拖动甘特条。插件会基于旧读取内容写回，覆盖外部编辑。
- **影响**：用户 Markdown 可被静默丢失；高频发生在 Obsidian、Typora、Git/同步工具并用时。
- **明确修复建议**：读取时保存版本指纹（mtime + size + hash/etag）；写入前重新校验。冲突时停止写入，提供“重新加载 / 查看差异 / 将我的字段变更重放到新版本”的明确 UI。底层写入应为原子替换，并返回写入后的版本。
- **待补测试**：活动/非活动笔记的外部修改、删除/重命名、写入失败、并行两次任务修改、冲突取消后源文件不变、重试仅重放已请求字段。

### P0-07：LocalDate 规则不统一；工作区仍用 UTC 日期，且旧逻辑接受反向/无效日期

- **证据**：`src/composables/useWorkspace.ts:93-95` 使用 `new Date().toISOString().slice(0,10)`；Todo/Calendar/Gantt 分别用本地 `getFullYear/getMonth/getDate`。旧 `taskSyntax.ts` 和 `parseTasks.ts` 只做 `\d{4}-\d{2}-\d{2}` 形式匹配，未在解析器层执行严格 LocalDate 校验；`taskOccursOnDay`、`isTodayFocus` 和多个视图还会交换反向区间或把它们当有效排期。
- **复现**：在 UTC+8 的 00:00–07:59 创建“今天计划”，`todayIso()` 可得到前一天；再输入 `@start(2026-02-31)` 或 `@start(2026-07-24) @end(2026-07-20)`，旧解析/视图会接受、交换或投影，而非产生诊断。
- **影响**：Today、Calendar、Gantt 和文件命名可能跨日不一致；非法排期无法被发现，之后会被“修正”成错误数据。
- **明确修复建议**：建立一个无时区的 LocalDate 工具模块：`formatLocalDate(now)`、`parseLocalDateStrict`、`compare/addDays`。禁止业务路径使用 `toISOString()`；只允许 Date 作为 UI 日历坐标，持久化永远是校验过的 `YYYY-MM-DD`。`start > end`、非法日期不得进入排期，必须发诊断。
- **待补测试**：通过注入时钟并设置 `TZ=Asia/Shanghai`、UTC、UTC-07；验证跨午夜、月末、闰年、DST 加减日、`2026-02-29`/`2024-02-29`、反向区间和非法日期。

### P0-08：Todo / Calendar / Gantt 没有消费同一份任务投影契约

- **证据**：
  - Todo (`TodoView.vue:36-72,102-110`) 将 `end || start` 统一当 due，并把无日期项目包含在 Today；
  - Calendar (`CalendarView.vue:30-37,96-98`) 以“带 `start/end`”为 scheduled，旧帮助文本把 due 作为 end；
  - Gantt (`GanttView.vue:71-79`) 仅以 `isMultiDay(start,end)` 过滤，并在 `265-278` 自动交换端点；
  - 新 `Task` 模型已声明 `date`、`due`、`type=milestone` 等，但视图未消费。
- **复现**：在 Task Block 写：

  ```markdown
  - [ ] 单日执行 @date(2026-07-21) @id(day)
  - [ ] 仅截止 @due(2026-07-21) @id(due)
  - [ ] 区间工作 @start(2026-07-20) @end(2026-07-24) @id(range)
  - [ ] 发布节点 @type(milestone) @date(2026-07-24) @id(ms)
  ```

  当前旧链路无法按四种语义稳定区分；新模型和旧视图混合后也会直接构建失败。
- **影响**：用户无法预测任务在哪个视图出现、操作后如何回写；`@due` 可能被改成区间结束日期，里程碑无法作为单点显示。
- **明确修复建议**：由 core 提供只读 selectors，而不是各视图自行解释字段：`selectTodoBuckets`（Inbox/Today/Upcoming/All）、`selectCalendarEvents`（date/due/interval/milestone）、`selectGanttRows`（仅合法区间、group/milestone）。明确约定：无日期→Inbox；due→Calendar 截止标记而非区间；Gantt 仅 `start < end`；milestone→单点。三视图只调用 selector 并用统一 TaskRef 写回。
- **待补测试**：一组任务 fixture 同时断言 Todo、Calendar、Gantt 的包含/排除、标签、颜色、点击定位和回写字段；不得仅对各视图分别写快照。

---

## 4. P1：P0 闭环后应纳入同一轮质量改造

### P1-01：WYSIWYG ↔ Markdown 使用全量 Turndown 往返，保真边界未定义且会损失内容

- **证据**：`markdownBridge.ts:472-521` 将任务行替换为专用 div；`524-583` clone DOM 后用 Turndown 全量转换、合并连续空行并 `trim()`。`buildMetaParts()` 只保留已知 meta；WYSIWYG 任务节点的 `data-meta` 不承载未知属性。前置/后置空行、frontmatter、原始 HTML、表格语法、引用格式、链接 title、list marker、任务块注释和属性顺序均不具备保真合同。
- **复现**：在一个文档同时放 YAML frontmatter、表格、嵌套引用、`*` 列表、HTML 注释 Task Block、未知 `@owner(alice)` 与尾随空行；切换 WYSIWYG 后不编辑或编辑一个标题再切回源码，比对文本 diff。
- **明确修复建议**：将源码模式作为保真主编辑器；WYSIWYG 只编辑结构化白名单节点，或使用保留 Markdown AST/source map 的编辑器实现。切换模式前应显示“可能格式化”风险，默认不做全量 `trim/normalize`。任务块必须保留容器注释和全部未知 metadata。
- **待补测试**：golden corpus 的 `md -> html -> md` byte/minimal-diff 测试，并将允许规范化范围写入文档；对 Task Block 与未知 metadata 要求精确保留。

### P1-02：WYSIWYG 编辑面存在未过滤粘贴与过时 `execCommand` 依赖

- **证据**：`EditorView.vue` 的 contenteditable 未见 `beforeinput/paste` 清洗；`markdownBridge.ts:613-700` 广泛依赖已废弃、实现不一致的 `document.execCommand`，并直接 `insertHTML`。
- **复现**：从网页粘贴带 style、事件属性、嵌套列表和图片的富文本；或在不同 Chromium/WebView 版本使用 Ctrl+Z、Tab、链接插入。
- **明确修复建议**：拦截粘贴，转换为纯文本/经过 sanitizer 的受控片段；用 Selection/Range 或成熟的编辑器事务模型替代 `execCommand`，以受控命令记录撤销历史。
- **待补测试**：Playwright 粘贴矩阵、IME、撤销/重做、跨浏览器 WebView 手工回归清单。

### P1-03：快捷新增仍把任务写入“今日计划”，没有 Task Block 选择与授权

- **证据**：Todo `add()` 和空状态 (`TodoView.vue:197-225`)、Calendar `submitAdd()` (`CalendarView.vue:113-129`)、Gantt `quickAdd()` (`GanttView.vue:310-328`) 在全局范围调用 `{ useTodayPlan: true }`；workspace `onAddTask()` (`1071-1094`) 会创建/写入今日计划。`todayPlanBody()` 也不含 Task Block。
- **影响**：即使新 parser 完成，新增任务仍缺少有效容器；同时用户在查看全部笔记时的新增操作会悄悄写到另一篇文档。
- **明确修复建议**：所有新增入口先显示“目标笔记 + Task Block”选择器；只有显式选择“创建新的 Task Block”才创建容器。不要默认创建标题为“今日计划/本周计划”的笔记。
- **待补测试**：无 block、单 block、多 block、当前笔记/全局笔记、取消选择、写入失败；断言不会新增任何未授权文件或标题。

### P1-04：日期编辑自动交换起止日，掩盖用户错误并与诊断合同冲突

- **证据**：Todo `normalizeSchedule` (`192-194`)、Gantt `normalizeSchedule` (`265-268`) 和 quick-add (`315-323`) 都自动调换或强制扩展日期。
- **明确修复建议**：输入层显示 inline error，禁止提交无效区间；只在用户明确选择“交换日期”时执行。甘特拖拽可以保持条形合法，但源 Markdown 的非法值必须显示诊断而非隐式修复。
- **待补测试**：键盘输入反向日期、拖拽越过端点、同日里程碑、取消错误提示后的源文本不变。

### P1-05：视图交互和可访问性不足

- **证据**：Calendar 日期格/任务使用可点击 `div`（`CalendarView.vue:209-225`），甘特条主要依赖 pointer drag；缺少明确的键盘焦点、`button` 语义、`aria-selected`、拖拽键盘替代和操作反馈。隐藏元数据、色彩也没有可访问替代文本。
- **明确修复建议**：可点击实体改用 `<button>` 或赋予正确 role/tabindex/键盘处理；甘特提供“编辑起止日期”键盘路径；色彩同时显示文字/图标；所有异步写入输出 `aria-live` 状态。
- **待补测试**：键盘 Tab/Enter/Space/Escape、焦点可见、屏幕阅读器语义快照、无鼠标完成新增/编辑/删除/排期。

### P1-06：全局任务缓存仅依赖 mtime，且错误读取被静默吞掉

- **证据**：`globalTasks.ts:55-70` 只用 mtime 命中缓存，`readContent` 异常直接跳过；相同 mtime 的同步/网络盘变更可能漏更新，用户也不知道某篇笔记未被索引。
- **明确修复建议**：缓存使用 mtime + size/内容 hash，记录每篇笔记的索引错误与最后成功版本；UI 明示“部分笔记未索引”。
- **待补测试**：同 mtime 内容变化、读取异常恢复、缓存失效、外部删除和重命名。

---

## 5. P2：增强项与长期质量债务

### P2-01：缺少安全发布治理

- **问题**：没有依赖漏洞扫描、lint、格式化检查、CSP/宿主权限审计、E2E 门禁或测试覆盖率阈值。
- **建议**：增加 `lint`、`test:unit`、`test:e2e`、`test:security`、`check` 聚合脚本；CI 将 build、核心契约、浏览器安全测试和打包置为必过。
- **待补测试**：依赖审计、构建产物扫描、CSP smoke、打包后宿主人工冒烟。

### P2-02：任务颜色、层级与依赖关系需要可访问的完整契约

- **问题**：新类型已提供 `color/type/parentId/childIds`，当前视图未定义颜色继承、group 完成规则、milestone 样式、折叠和删除父项策略。
- **建议**：在产品规格中写清颜色默认/覆盖/文本替代、父子状态不级联、删除父项的三种决策、依赖关系的循环检测；设计系统输出 token 与状态矩阵。
- **待补测试**：深层嵌套、颜色覆盖/回退、父项删除策略、树形键盘导航和高对比主题。

### P2-03：没有可恢复的 Markdown 变更记录

- **问题**：应用内撤销栈只覆盖当前会话；跨笔记任务回写、外部冲突和自动迁移没有持久化补丁/审计记录。
- **建议**：写入前生成最小 patch 和可回滚快照（短期本地历史），提供“查看变更/撤销此任务操作”。不要用全文件覆盖替代 patch。
- **待补测试**：重启后恢复、部分回滚、写入中断、磁盘空间不足。

---

## 6. 建议的修复顺序与验收门槛

1. **安全与构建**：先 P0-01、P0-02；任何 `innerHTML` 数据路径必须有 sanitizer 及浏览器测试。
2. **唯一解析/回写内核**：完成 P0-03 至 P0-07，建立 Task Block AST、严格 LocalDate、TaskRef 与冲突检测；禁止自动写入。
3. **统一投影**：完成 P0-08，以 core selector 向 Todo/Calendar/Gantt 提供同一份投影；删除视图内自行解释字段的逻辑。
4. **编辑器保真**：完成 P1-01/P1-02，决定 WYSIWYG 的支持边界后才重新设计工具条和快捷键。
5. **交互与 UI**：完成 P1-03 至 P1-05；任务目标块选择、错误/冲突体验、无障碍路径应先于颜色和拖拽美化。
6. **发布门槛**：
   - `npm run test:core`：全绿；
   - `npm run build`：全绿；
   - 新增浏览器安全/往返/冲突/跨时区/三视图契约测试：全绿；
   - 手工执行一次外部编辑冲突、WYSIWYG 粘贴、键盘甘特替代操作和跨午夜验证；
   - 任何 P0 未关闭时禁止 `pack`/发布。

---

## 7. 审计结论

当前代码的主要风险不是“功能不够多”，而是**没有建立安全、可验证、可最小回写的 Markdown 任务边界**。应把 Task Block parser、LocalDate、TaskRef、非破坏性回写、sanitize 和三视图 selector 作为同一条核心链路验收。待该链路稳定后，再实施“墨线工作台”等全新 UI 设计，才能避免漂亮界面驱动不可靠数据写回。