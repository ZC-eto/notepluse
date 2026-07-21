# 稿笺（Garben）UI 设计系统

> **状态**：设计规格 v1.1（随 v0.8.7 减噪对齐）  
> **产品**：本地 Markdown 工作区「稿笺」；Markdown 是唯一真源，任务仅来自显式任务组。  
> **目标用户**：用 Markdown 记录、写作并规划工作的知识工作者；他们需要在「读写原文」与「看见可执行计划」之间无损切换。

---

## 1. 设计命题

### 1.1 一句话

**稿笺不是把 Markdown 套进项目管理壳子；它是一张可书写的纸面，在同一条“工作线”上把笔记、任务、日期和进度投影出来。**

### 1.2 要解决的体验问题

现有界面已具备 Sidebar、编辑器、Todo/Gantt/Calendar 和保存状态，但仍是四个并列页面：

- 顶栏将笔记标题、全局视图、编辑模式、保存、设置拥挤在同一区域，当前上下文和操作优先级不清；
- 侧栏把文件夹、最近笔记、创建动作和 onboarding 混在一起，不能体现“笔记库 / 工作视图”的差异；
- Todo 将「今天 + 逾期 + 无日期」聚合，和新产品的 Inbox / Today 语义冲突；
- Gantt 与 Calendar 直接承担“快速新建任务”，没有明确任务组目标，可能诱导不安全回写；
- 编辑器工具栏仅是文字按钮，所见即所得与源码模式没有明确的保真边界；
- 甘特、日历、空状态的视觉语言相对独立，任务缺乏同一个可识别的“来源、状态、颜色、时间”身份；
- 用 emoji 作为图标、不完整的键盘提示、抽屉/弹窗层级和小屏策略，会降低专业感与可访问性。

### 1.3 设计原则

1. **原文优先，投影可追溯**：任何任务卡、甘特条和日历项都显示来源；进入详情可「定位到笔记」。UI 不暗示自动迁移或自动修复。
2. **工作线统一，不靠装饰统一**：任务的颜色、完成态、优先级、日期语义和来源在三种视图保持一致。左侧细线、任务色条和时间线都表达同一件事。
3. **内容有主次，控制不抢戏**：编辑内容是大面积留白中的主体；工具仅在需要时出现。顶部只放全局、当前、保存三个层级的必要信息。
4. **日期是语义，不是染色**：`@date`、`@due`、`@start + @end`、milestone 的图例、文案和图形必须可区分；颜色不是唯一编码。
5. **安静但不冷漠**：使用纸、墨、铅灰和有限的矿物色；避免泛滥的渐变、玻璃、药丸标签和纯黑大面积。
6. **可键盘完成核心工作**：创建笔记、切换视图、打开命令面板、聚焦搜索、编辑任务、定位来源、保存均有可发现的键盘入口。

### 1.4 标志性元素：工作线（Workline）

一条 2px 的垂直或水平细线作为真实信息载体，而非装饰：

- 桌面端左侧的**工作区 rail**用当前视图色标记；
- Todo 的任务树在同一对齐线上展示父子关系；
- Gantt 将它延伸为今日线和任务条起点；
- Calendar 的跨日条、截止标记和里程碑与它使用相同的几何语言；
- 选中任务时，来源、详情面板和投影位置使用同一色号与 `taskId` 高亮联动。

这是一项有意的风险：它把“纸面工作台”的静态风格变成可操作的空间线索，而不是流行的卡片网格。

---

## 2. 信息架构与桌面布局

### 2.1 顶层结构

- **工作区导航**：Home（默认）、笔记、待办、日历、甘特；它是产品级导航，不属于某一篇 Markdown。
- **笔记库**：文件夹、最近、搜索、创建；它是原文入口。
- **主画布**：Home / Editor / Todo / Calendar / Gantt 中的一个。
- **上下文检查器**：根据选择显示文档大纲、任务详情、日期信息或诊断。无选择时默认显示文档大纲或视图帮助。
- **瞬态层**：命令面板、确认对话框、迁移向导、快捷键帮助、通知。它们不与页面布局竞争。

### 2.2 1440px 参考布局

```text
┌─────────────────────────────────────────────────────────────────────────────────────────────┐
│ Product bar: 稿笺 · [⌘K 搜索/命令]             同步/保存状态 · Theme · Settings         │ 48
├───────────┬───────────────────────────────────────────┬─────────────────────────────────────┤
│ Workspace │ Context bar: Home / 笔记名 / 当前任务块       │ Inspector header                    │ 44
│ rail  64  ├───────────────────────────────────────────┤                                     │
│ (icons +  │                                           │  任务详情 / 文档大纲 / 诊断            │
│ labels)   │       主画布：最大 980px 内容列               │  320px 可收起                       │
│           │       Editor / Todo / Calendar / Gantt     │                                     │
├───────────┼───────────────────────────────────────────┼─────────────────────────────────────┤
│ Note rail │ 状态栏：源文件 · 字数 · 模式 · 保存时间       │  可选：相关任务、块信息、快捷操作       │ 28
│ 264px     │                                           │                                     │
└───────────┴───────────────────────────────────────────┴─────────────────────────────────────┘
```

- **工作区 rail**：64px（展开标签时 172px），常驻；不是传统“第二个侧栏”。
- **笔记库**：默认 264px，可拖拽为 220–360px，可关闭；仅在笔记和编辑场景默认展开。
- **主画布**：占据剩余宽度；编辑正文宽度 `min(100%, 760px)`，阅读舒适性优先，不让行长随大屏无限增长。
- **检查器**：320px，可拖拽为 280–400px，可关闭；任务视图默认打开，编辑视图默认显示大纲。关闭后，任务详情改为右侧 Sheet。
- **最小桌面宽度**：1024px。低于 1180px 时笔记库默认折叠为图标；低于 1024px 时检查器变为覆盖 Sheet。

### 2.3 视图导航与命名

默认入口是 **Home / 今日工作台**，不是名为“本周计划”的 Markdown。它只显示用户已有数据与明确操作：

- **Home**：今天的行动、即将到期、进行中的区间、Inbox、最近笔记；没有任务时给出“创建笔记 / 新建任务块 / 打开示例”三选一。
- **笔记**：聚焦编辑器。当前 Markdown 标题来自用户内容，不能被应用默认标题替代。
- **待办**：Inbox、Today、Upcoming、All 四个互斥且可解释的范围。
- **日历**：Month / Week；按日期语义而不是“所有排期”显示。
- **甘特**：范围任务和里程碑；单日任务不伪装为跨日条。

每项使用 Lucide 风格 20px SVG 图标，并有中文标签、tooltip、快捷键提示。禁止 emoji 作为产品图标。

---

## 3. 设计 Tokens

所有值应在未来的 `src/styles/tokens.css` 中以 CSS Custom Properties 提供；组件不得写散乱色值。Token 名称表达用途而非具体颜色。

### 3.1 色彩：浅色主题 `data-theme="light"`

| Token | 值 | 用途 |
|---|---:|---|
| `--color-canvas` | `#F4F1EA` | 应用外层纸面，非纯白，体现纸张质感 |
| `--color-surface` | `#FFFEFA` | 主编辑面、Sheet、浮层 |
| `--color-surface-subtle` | `#EEEAE1` | 工具条、hover 背景、次级区域 |
| `--color-surface-raised` | `#FFFFFF` | 菜单、浮起卡、输入框 |
| `--color-ink` | `#18211D` | 标题与主文字 |
| `--color-ink-muted` | `#52605A` | 辅助文字；正文最小对比目标 4.5:1 |
| `--color-ink-faint` | `#738078` | 非关键说明、禁用前仍不得用于正文 |
| `--color-line` | `#D8D4C9` | 普通分隔线 |
| `--color-line-strong` | `#B8B2A5` | 拖拽分割线、聚焦外轮廓辅助 |
| `--color-accent` | `#1F5C4B` | 主操作、当前工作线、链接 |
| `--color-accent-hover` | `#17483B` | 主操作 hover |
| `--color-accent-soft` | `#DCEBE3` | 当前选择浅背景 |
| `--color-focus` | `#2F7E67` | 可见焦点环（2px） |
| `--color-danger` | `#A9342F` | 破坏操作、逾期 |
| `--color-danger-soft` | `#F8E0DD` | 逾期/错误背景 |
| `--color-warning` | `#9A651B` | 日期风险、未闭合任务组 |
| `--color-warning-soft` | `#F8EDCF` | 警告背景 |
| `--color-success` | `#2D6A4F` | 完成、成功保存 |
| `--color-info` | `#2F5F83` | 只读来源、信息提示 |

### 3.2 色彩：深色主题 `data-theme="dark"`

| Token | 值 | 说明 |
|---|---:|---|
| `--color-canvas` | `#161A17` | 深石墨，不用纯黑 |
| `--color-surface` | `#1D2420` | 主画布 |
| `--color-surface-subtle` | `#262F2A` | 次级容器 |
| `--color-surface-raised` | `#2A342E` | 浮层、输入 |
| `--color-ink` | `#F2F0E8` | 高对比主文字 |
| `--color-ink-muted` | `#C3C8BF` | 辅助文字，仍满足可读性 |
| `--color-ink-faint` | `#98A197` | 非关键视觉信息 |
| `--color-line` | `#39433D` | 普通线 |
| `--color-line-strong` | `#58635B` | 分割与 hover |
| `--color-accent` | `#7FC6A6` | 主操作，避免荧光绿 |
| `--color-accent-hover` | `#A0D7BE` | hover |
| `--color-accent-soft` | `#1D4134` | 当前选择 |
| `--color-focus` | `#B6E9D1` | 焦点环 |
| `--color-danger` | `#F19A93` | 错误主色 |
| `--color-danger-soft` | `#4D2828` | 错误背景 |
| `--color-warning` | `#E6C06E` | 警告主色 |
| `--color-warning-soft` | `#493A18` | 警告背景 |

**规则**：主题切换默认遵循系统，可在设置中改为浅/深；切换不得引起布局跳动。阴影在深色中改用边框与低透明度阴影，不能仅把白色卡片透明化。

### 3.3 任务语义色（两主题均映射到 Token）

| 任务颜色 | Token | 浅色建议 | 深色建议 | 图形辅助 |
|---|---|---:|---:|---|
| gray | `--task-gray` | `#66736C` | `#AAB4AD` | 实线 + 中性圆点 |
| blue | `--task-blue` | `#2E628C` | `#82B8E4` | 实线 + 蓝色条 |
| green | `--task-green` | `#2F7756` | `#83C9A3` | 实线 + 叶形端点 |
| orange | `--task-orange` | `#A76520` | `#E4A968` | 实线 + 方形端点 |
| red | `--task-red` | `#AD4841` | `#EE9C96` | 实线 + 三角警示标签（仅风险） |
| violet | `--task-violet` | `#695192` | `#B59CE0` | 实线 + 菱形端点 |

任务色表达用户分类，不表达完成/逾期；完成态使用勾选、删除线、透明度和状态文字，逾期使用日期图标+文案+错误色。

### 3.4 字体与排版

| 角色 | 字体栈 | 尺寸 / 行高 | 用途 |
|---|---|---|---|
| Display | `"Source Han Serif SC", "Noto Serif SC", Georgia, serif` | 24/32、30/38 | 应用级标题、文档 H1；只在大标题使用，避免“报纸模板感” |
| Interface | `"Inter", "Noto Sans SC", "Microsoft YaHei UI", sans-serif` | 12–16 / 18–24 | 控件、导航、正文辅助 |
| Body | `"Noto Sans SC", "Microsoft YaHei", sans-serif` | 16/28 | 阅读与编辑正文 |
| Mono | `"JetBrains Mono", "Cascadia Code", Consolas, monospace` | 13/22 | 源码、Task Block、日期与快捷键 |

- 用 `font-variant-numeric: tabular-nums` 显示日期、数量、时间轴；
- 正文最大行长 68 个 CJK 全角字符左右（约 760px），源码可水平滚动；
- H1/H2/H3 用清晰层级，不将“本周计划”作为默认标题；
- 中文界面字重以 400 / 500 / 600 为主，避免每处加粗。

### 3.5 尺寸、圆角、阴影、层级、动效

```css
--space-1: 4px; --space-2: 8px; --space-3: 12px; --space-4: 16px;
--space-5: 20px; --space-6: 24px; --space-8: 32px; --space-10: 40px; --space-12: 48px;
--radius-sm: 4px; --radius-md: 8px; --radius-lg: 12px; --radius-xl: 16px; --radius-pill: 999px;
--control-sm: 28px; --control-md: 36px; --control-lg: 44px;
--shadow-float: 0 12px 32px rgb(24 33 29 / 14%); /* 深色改为 0 16px 40px rgb(0 0 0 / 28%) */
--z-base: 0; --z-sticky: 10; --z-popover: 20; --z-sheet: 30; --z-modal: 40; --z-toast: 50;
--motion-fast: 120ms; --motion-base: 180ms; --motion-slow: 240ms;
--ease-standard: cubic-bezier(.2, .8, .2, 1);
```

- 仅菜单、检查器、任务详情与 dialog 使用 `--shadow-float`；主界面依靠线和表面区隔。
- hover 只改变颜色、边框、阴影或透明度，**不得**用 scale 导致布局抖动。
- `prefers-reduced-motion: reduce` 时取消非必要转换、甘特拖动惯性、面板滑动；保留立即可见的状态变化。

---

## 4. 组件规格

### 4.1 App Shell

| 属性 | 规格 |
|---|---|
| 容器 | CSS Grid；`grid-template-columns: var(--workspace-rail) var(--library-width) minmax(0,1fr) var(--inspector-width)` |
| 分隔 | 四个区域之间 1px `--color-line`；可拖拽分隔区至少 8px 命中宽度 |
| 状态 | `libraryOpen`、`inspectorOpen`、`focusMode`、`mobileDrawer`；用户偏好持久化 |
| Focus mode | 按 `Ctrl/Cmd+Shift+F` 隐藏左右 rail，只保留上下文条与画布；Escape 恢复 |
| 禁止 | 不让固定顶部栏遮住内容；不在宽屏中央堆一组无意义卡片 |

### 4.2 Product Bar（48px）与 Context Bar（44px）

- Product Bar 左侧为小型文字标识 `Ink Ledger` 与当前 workspace 名称；中间是 command/search trigger；右侧是保存状态、主题、设置。
- 保存状态为可操作文本而非颜色点：`正在保存…`、`已保存 10:42`、`保存失败 · 重试`、`只读`。失败含 alert 图标和重试按钮。
- Context Bar 左侧显示**面包屑**：`笔记 / 工作 / 项目 Alpha.md`，并提供定位文件夹；中间给出视图级控制（如 Calendar 的月周切换）；右侧收纳当前任务块、过滤器与检查器开关。
- 笔记标题在编辑器中作为用户 Markdown 内容展示；若没有 H1，Context Bar 显示文件名，不生成标题。

### 4.3 Workspace Rail（64px）

| 项目 | 规格 |
|---|---|
| 项 | Home、笔记、待办、日历、甘特，底部设置/帮助 |
| 状态 | current：左侧 2px 工作线 + `--color-accent-soft`；hover：`--color-surface-subtle`；tooltip：延迟 500ms |
| 可访问性 | `<nav aria-label="工作区">`；当前项 `aria-current="page"`；图标按钮 `aria-label` |
| 小屏 | 不常驻；转换为底部导航，仅展示 Home/笔记/待办/日历/更多；甘特在“更多”中 |

### 4.4 Note Library

- Header：`笔记库`、新建笔记、更多（新建文件夹 / 导入 / 管理）；每个 icon button 36px，触摸环境 44px。
- 搜索是 `Ctrl/Cmd+P` 或 `/` 触发的本地即时搜索，结果显示标题、路径、最后编辑时间和匹配片段，键盘上下选择。
- 文件夹可展开、折叠、右键菜单；文档行有状态：默认 / hover / selected / dirty / external-change / rename。
- `dirty` 用细小 6px 墨点和“未保存”文字，不只靠颜色；外部变更给出明确动作“重新载入 / 查看差异 / 保留本地”。
- 任务型文件夹**不能**暗示所有 checkbox 都会进入任务系统；Task Block 是唯一可投影范围。

### 4.5 Editor Canvas

#### 编辑模式

| 模式 | 视觉 / 交互 | 保真边界 |
|---|---|---|
| 阅读（P1） | 纯渲染、可选择文本、任务块有只读标记 | 任何链接和 HTML 必须经过安全渲染 |
| Markdown 源码 | `textarea` / CodeMirror 类编辑器；行号、当前行、折叠、最小语法高亮 | 唯一承诺 1:1 的编辑方式 |
| 结构化编辑（现有 WYSIWYG 的替代方向） | 只在被支持的元素上提供块操作；未知语法显示原始 inline token | 未实现高保真之前不得声称全量 Markdown 往返无损 |

- 工具条采用分组的 SVG 图标+文字 tooltip：文字、块、列表、插入、历史；无 emoji。
- Task Block 在源码模式保留可见注释。在结构化模式用低调边框包裹，header 显示 `任务块 · alpha-plan`、任务数量、诊断；点击 header 可打开块详情，不能把普通 checklist 自动包装。
- 编辑器底部状态栏：文件路径、Markdown/结构化模式、字符/字数、光标行列、保存状态；小屏只留保存状态。
- 文档大纲在 Inspector 内，展示 H1–H3；单击滚动定位，当前 heading 有工作线。

### 4.6 通用 Task Row / Task Tree

任务行是 Todo、Inspector、Calendar popover 的共同组件，必须消费统一 Task domain。

| 部件 | 规格 |
|---|---|
| 左部 | 20px checkbox；group 用折叠按钮，milestone 用菱形图标。完成后仍保留原始 title 与元数据。 |
| 工作线 | 行左 2px 色条，继承 `@color`；无色用中性灰。嵌套层级用 16px 缩进与细连接线。 |
| 主文 | 标题一行截断；次行仅按需显示日期、优先级、标签、来源。任务色和状态文字不可只以颜色表达。 |
| 右部 | 仅在 hover/focus 出现“打开详情”“定位来源”；触摸端常显 `更多`。 |
| 选中 | `--color-accent-soft` 背景、2px focus 环；行本身不是 button，内部控件按 Tab 顺序访问。 |
| 状态 | open、done、overdue、blocked（P2）、editing、saving、error、conflict、read-only。 |

### 4.7 Task Detail Inspector / Sheet

**这是所有编辑任务属性的唯一通用入口**，避免各视图出现不一致的 inline form。

```text
┌ 任务详情                                      [关闭] ┐
│ [色条] 发布准备                   [● 未完成]         │
│ 项目 Alpha / Alpha 计划 / 本周交付                    │
│                                                       │
│ 类型  [任务 v]       优先级 [高 v]      颜色 [蓝 v]   │
│ 执行  [开始日期] → [结束日期]                          │
│ 截止  [无 / 2026-07-24]      单日 [无 / 2026-07-22]  │
│ 标签  [发布 ×] [+ 添加]                                │
│                                                       │
│ 来源  项目 Alpha.md · 行 12–15       [定位到原文]      │
│ 子任务 (2)                                            │
│ [取消]                                  [保存更改]     │
└───────────────────────────────────────────────────────┘
```

- 所有字段有文字 label、help text 和校验文案；`start > end` 阻止保存并在字段旁提示。
- 任务类型会驱动字段显隐：group 没有日期必填；milestone 默认只使用单日 `@date`；task 可有 date、due、范围，三者语义独立。
- 当前 Task Block 只读展示，新增任务/移动任务必须显式选目标 Task Block；若无块，主按钮是“在笔记中创建任务块”，不是隐式落盘。
- `@due`、未知 metadata、格式和不受影响的文本均被视为需保留的原文；UI 在提交前显示“将更新：完成状态、开始日期”之类的最小改动摘要。
- 关闭未保存详情时提供“保留编辑 / 放弃更改”；写入冲突时以 source 为准，显示重试/打开原文，不覆盖。

### 4.8 Todo

- 顶部：标题、范围 Tabs `Inbox | Today | Upcoming | All`、筛选（状态/优先级/标签/来源）、排序（手动/日期/优先级）。桌面用工具条，小屏为可横向滚动的 segmented tabs。
- **Inbox**：没有 `@date`、`@due`、`@start/@end` 的未完成任务；不可混入 Today。
- **Today**：`@date=today`、范围包含 today、以及已到期的 `@due`；逾期单独分组，显示“逾期 2 项”，不混成普通今日任务。
- **Upcoming**：未来 14 天按日期分组；仅 due 显示“截止”，单日显示“安排”，范围显示“进行中”。
- **All**：按来源笔记 / Task Block 分组，可折叠，支持树状父子关系。
- Completed 默认折叠并显示数量；完成父任务不自动勾选子任务。
- 新建操作：`新建任务`打开放置选择器 → Task Block → 任务类型 → 详情；若任务块不明确则不能保存。

### 4.9 Calendar

- 桌面默认 Month，提供 Week；顶部有前后期、今天、时区/LocalDate 提示、视图切换和过滤。
- 网格周起始随本地设置（默认周一）；日格最小高度 124px，Month 小屏转换为 agenda。
- 单日 `@date`：实心圆点 + 任务行；仅截止 `@due`：虚线边/旗标 + “截止”；范围：横跨日期的连续条；milestone：菱形单点。每个都提供屏幕阅读器文字。
- 单元最多显示 3 项，之后显示 `+N 项`；点击打开该日 agenda Sheet，不做只能 hover 才能看见的隐藏信息。
- 选中项同步打开 Task Detail；点击空白日期只进入“新增至 Task Block”流程，不直接创建无来源任务。
- 拖动属于 P1：keyboard 替代为“更改日期”字段；拖动完成必须在详情/Toast 中复述新的语义字段，防止把 due 误当 end。

### 4.10 Gantt

- 仅渲染合法范围 `start < end` 的 task/group 与 `@type(milestone) + @date`。单日普通任务不作零宽条。
- 顶部：范围（本周/本月/季度/自定义）、缩放（日/周/月）、今天、筛选、图例。缩放切换保持选中任务可见。
- 左侧为可折叠任务树（最小 280px）；右侧可横向滚动时间轴，表头 sticky。今日线为 2px accent，包含可读 label。
- 条：最小高度 28px；task 为圆角矩形，group 为更粗的括号/横线，milestone 为 12px 菱形。颜色继承 Task color，完成态降低 40% opacity + check 图标，不能仅灰掉。
- Hover/focus Tooltip：标题、开始、结束、进度、优先级、来源；点击选择并开 Inspector。
- P1 拖动：左右手柄至少 12px 可命中；移动与缩放显示 ghost 日期；释放时显示确认 Toast，错误/冲突回退；键盘提供移动一天/一周的菜单操作。
- 无范围/非法范围：不显示假条，移到“排期诊断”列表，并提供定位原文。

### 4.11 基础控件、反馈与空状态

| 组件 | 规格 |
|---|---|
| Button | `primary`、`secondary`、`ghost`、`danger`；高度 36/44px；命令动词明确；loading 禁用并保留宽度 |
| Icon button | 36×36（touch 44×44）；必须有 `aria-label` 和 tooltip；统一 Lucide SVG 20px |
| Input / Select | 标准高度 36px，移动 44px；始终有 visible label；错误文本紧邻字段；日期输入支持本地格式辅助 |
| Chip | 仅作可移除过滤/标签/状态摘要，不把每个状态都做成胶囊；含图标或文字，颜色非唯一信息 |
| Menu / Popover | 键盘箭头导航、Esc 关闭、焦点返回触发器；右侧对齐，不切屏 |
| Toast | 保存成功 4 秒自动消失；错误不自动消失；`aria-live="polite"`，关键失败用 `assertive` |
| Empty state | 说明“为什么为空”+一个主操作+最多一个次操作，不伪造示例数据；使用简洁 SVG/几何符号，不用 emoji |
| Skeleton | 只为加载中的真实列表保留布局；不要把空数据当 loading |

---

## 5. 状态、反馈与异常规格

### 5.1 数据与写入状态

| 状态 | 触发 | 视觉 | 可操作性 |
|---|---|---|---|
| Loading | 扫描笔记/切换视图 | 对应区域 skeleton，保留尺寸 | 不阻断工作区导航 |
| Saved | 成功写入 | `已保存 10:42` | 点击可查看文件路径/保存详情 |
| Saving | 用户显式保存或自动保存 | 文本 + 细线进度，不无限旋转 | 仍可继续编辑；再次保存合并 |
| Save failed | I/O 异常 | 顶栏 danger 状态 + Toast | `重试`、`复制错误`、`另存为`（P1） |
| External conflict | 源文件被外部修改 | 任务/文档行 warning 标记 | 重新载入、查看差异、保留编辑；禁止静默覆盖 |
| Read-only | 无法写入 | 明确 banner | 禁用提交并保留“复制内容” |
| Parse diagnostic | 未闭合块、重复 ID、非法日期 | Inspector 的诊断计数和源行波浪线 | `定位原文`；绝不自动纠正 |

### 5.2 空状态文案准则

- **Workspace 空**：`还没有笔记。先建立一篇自己的记录，或查看任务块示例。` 操作：`新建笔记` / `查看语法示例`。
- **Inbox 空**：`Inbox 已清空。没有日期的任务会在这里出现。` 操作：`新建任务`。
- **Today 空**：`今天没有被安排的任务。` 操作：`查看 Upcoming`。
- **Calendar 空**：`这个月没有带日期的任务。` 操作：`创建带日期的任务`。
- **Gantt 空**：`没有跨日执行区间。甘特只显示开始日期早于结束日期的任务。` 操作：`查看任务语法`。
- **无 Task Block**：`此笔记没有任务块；普通 checklist 不会进入计划视图。` 操作：`创建任务块` / `只作为 Markdown 继续写`。

任何空状态不得创建“本周计划”、今日计划或任务块作为副作用。

---

## 6. 快捷键与命令面板

### 6.1 全局快捷键

| 快捷键 | 动作 | 限制 |
|---|---|---|
| `Ctrl/Cmd+K` | 打开命令面板 | 输入框中也允许 |
| `Ctrl/Cmd+P` | 搜索并打开笔记 | 输入框中不劫持 |
| `Ctrl/Cmd+N` | 新建笔记 | 显式打开位置选择 |
| `Ctrl/Cmd+Shift+N` | 新建任务 | 必须经过 Task Block 选择 |
| `Ctrl/Cmd+S` | 保存 | 状态栏反馈 |
| `Ctrl/Cmd+1…5` | Home / 笔记 / Todo / Calendar / Gantt | 与当前宿主快捷键冲突时可设置 |
| `Ctrl/Cmd+Shift+F` | 专注模式 | Escape 恢复 |
| `?` | 打开快捷键帮助 | 非文字输入焦点时 |
| `Escape` | 关闭最内层 Menu/Sheet/Modal，最后清除选择 | 不丢弃未保存编辑 |

### 6.2 编辑器快捷键

- 遵循 Typora / Obsidian 的常见约定：`Ctrl/Cmd+B` 粗体、`I` 斜体、`K` 链接、`Shift+K` 删除线、`Shift+7/8` 有序/无序列表、`Alt+↑/↓` 移动当前行（仅安全的 source editor）。
- `Ctrl/Cmd+Enter` 切换当前合法任务；若光标不在 Task Block，提示“普通 checklist 不属于任务系统”。
- `Ctrl/Cmd+Shift+T` 在当前笔记中插入 Task Block 模板，但必须让用户填写 block id/name；不覆盖已有文本。
- 快捷键帮助支持搜索、按组展示、可配置冲突提示；所有动作也必须能经鼠标/触摸完成。

---

## 7. 响应式策略

| 断点 | 布局 | 关键降级 |
|---|---|---|
| `≥1440px` | 四区完整布局 | Library 和 Inspector 默认开 |
| `1180–1439px` | rail + 主画布 + 一个辅助栏 | Library 或 Inspector 按当前任务显示，另一个折叠 |
| `1024–1179px` | rail + 主画布 | 两个侧栏为可开 Sheet；Gantt 左列可压至 240px |
| `768–1023px` | 顶栏 + 主画布 | 笔记库为左 Sheet；Inspector 为右 Sheet；Calendar 保持 Month |
| `<768px` | 顶栏 + 内容 + 底部导航 | 文本 16px；触控目标 44px；Editor 单列；Calendar 默认 agenda；Gantt 显示时间轴摘要 + 表格/列表替代 |

- 不允许 375px 宽出现横向滚动（Gantt 时间轴自身除外，且必须含 sticky 任务列和滚动提示）。
- Modal 在小屏使用底部 Sheet；所有 Sheet 可拖拽/关闭并具备 focus trap。
- 移动端不依赖 hover 才能访问任务详情、删除、来源定位。

---

## 8. 可访问性与质量门槛

1. **对比**：正文、控件标签、状态信息达到 WCAG AA（普通文字至少 4.5:1）；深浅主题均验证。颜色从不单独表达任务状态、日期语义或错误。
2. **焦点**：所有可交互项用 `:focus-visible` 的 2px `--color-focus` 外环；焦点顺序符合视觉顺序；拖拽区也有键盘替代。
3. **语义**：导航、工具栏、树、tablist、dialog 用原生/正确 ARIA；任务树提供层级、展开状态和完成状态；图标按钮均有名称。
4. **键盘**：弹层 focus trap，Esc 关闭并回到触发器；命令面板支持键盘筛选；Calendar/Gantt 的点击功能均有表单/菜单替代。
5. **读屏**：保存、解析和写入失败经 live region 朗读；任务的日期用完整语言（如“截止于 2026 年 7 月 24 日”）。
6. **动效**：遵守 `prefers-reduced-motion`；不以闪烁、自动运动表达关键状态。
7. **缩放与本地化**：200% 缩放不截断关键功能；支持 CJK、长文件名、长任务标题；所有日期按 LocalDate 显示和编辑，不因 UTC 偏移。

---

## 9. 验收清单（UI 层）

- [ ] 首次打开是 Home，不自动创建或显示“本周计划”文档标题。
- [ ] 当前笔记和当前 Task Block 的边界在任何视图都可辨识。
- [ ] Task Row 在 Todo、Calendar、Gantt、Inspector 的颜色、状态、来源一致。
- [ ] 不存在任何“普通 checkbox 将自动进入任务视图”的文案或流程。
- [ ] 新建/移动任务时先选 Task Block；取消不写文件。
- [ ] `due`、单日、范围、milestone 在 Calendar/Gantt 有不同文字与形状。
- [ ] 无日期未完成任务仅在 Inbox，不在 Today 中被隐式混入。
- [ ] 任务详情能够定位源笔记与源行，并展示最小回写摘要。
- [ ] 1024、768、375px 与深/浅主题都可完成：打开笔记、编辑、保存、创建任务、定位来源。
- [ ] 仅键盘可完成导航、搜索、保存、打开任务详情、修改日期；200% 缩放仍可用。
