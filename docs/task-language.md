# md-workspace Task Block 语言规范（v1）

> **状态：产品规格 / 实现契约**  
> **版本：v1.0-draft（2026-07-20）**  
> **权威性：本文件与 `docs/product-spec-v1.md` 是后续解析器、回写器、编辑器和三种任务视图的共同验收依据。若旧实现与本文件冲突，以本文件为准。**

## 1. 目的与边界

md-workspace 是 Markdown-first 工作台：Markdown 文件是用户可长期保存、可在其他编辑器中阅读和编辑的唯一真源；Todo、Calendar、Gantt 是从其中**明确授权**的任务内容计算出的投影，而不是独立数据库。

本规范解决一个底线问题：普通 Markdown 中的 checkbox、引用、代码示例和临时 checklist 不应意外变成项目任务。只有显式 **Task Block** 中的 checkbox 才进入任务域。

### 1.1 规范目标

1. **可预期**：用户能从源码一眼判断一行会不会进入任务视图。
2. **可逆且保真**：切换任务、拖动排期或编辑标题只改目标字段，绝不重排整个文档或吞掉未知元数据。
3. **同源投影**：Todo、Calendar、Gantt 对同一 `Task` 领域对象显示不同信息，不各自重新解释 Markdown。
4. **兼容普通 Markdown**：Task Block 使用 HTML 注释包裹，对不认识本规范的编辑器可安全忽略；内部仍是标准 Markdown task list。
5. **可诊断**：歧义、非法日期、重复 ID、未闭合块必须可见；系统不得静默猜测并写坏原文。

### 1.2 非目标

- 不是把所有 Markdown list 都变成数据库记录。
- 不定义云同步、多人 CRDT、提醒推送、循环任务或依赖网络（这些是后续扩展，不能破坏 v1 的稳定 ID 和最小回写合同）。
- 不在扫描、索引、打开文件时自动迁移旧语法或自动补 `@id`。

---

## 2. 三层模型与真源

| 层 | 名称 | 存储位置 | 职责 | 可否成为真源 |
|---|---|---|---|---|
| L1 | Markdown 文档 | `.md` 文件 | 用户内容、Task Block、任务元数据、格式与未知扩展 | **是** |
| L2 | Task AST / Index | 内存；可重建 | Block、标题路径、父子树、日期、来源范围、诊断 | 否 |
| L3 | 投影视图 | Todo / Calendar / Gantt UI | 按工作流筛选、聚合、排序和编辑 L2 | 否 |

**写入路径只能是 L3 → 精准补丁 → L1 → 重新解析 L2 → 刷新所有 L3。**

任何 UI 缓存、筛选排序、拖拽临时状态均不可被当作权威数据。写入成功前不应永久更新 UI；写入失败或检测到冲突时应恢复以 L1 为准的状态并显示错误。

---

## 3. Task Block 容器

### 3.1 语法

```markdown
<!-- mdw:tasks id="alpha-plan" name="Alpha 计划" color="blue" -->

## 本周交付

- [ ] 发布准备 @id(alpha-release) @priority(high) @start(2026-07-20) @end(2026-07-24) @color(blue)
  - [ ] 编写发布说明 @id(alpha-notes) @due(2026-07-21)
  - [ ] 验收安装包 @id(alpha-smoke) @date(2026-07-24)

<!-- /mdw:tasks -->
```

- 开始标记必须独占一行：`<!-- mdw:tasks ... -->`。
- 结束标记必须独占一行：`<!-- /mdw:tasks -->`。
- 标记本身不渲染为文档正文；其他 Markdown 编辑器通常也会忽略其可见性。
- 文档可有零个、一个或多个 Block；Block **不可嵌套**，不可相互交叉。
- 同一个 Block 内可以有任意数量的 Markdown 标题、段落、表格与列表；只有其中合格 checkbox 行进入任务域。

### 3.2 Block 属性

| 属性 | 必填 | 值 | 含义 | 回写规则 |
|---|---:|---|---|---|
| `id` | 是 | `[A-Za-z0-9][A-Za-z0-9._-]{0,63}` | 文档内稳定 Block 身份；全局选择任务写入目标时展示 | 创建时生成；不得静默改名 |
| `name` | 否 | 1–80 个可见字符，双引号包裹 | 人类可读的工作区/计划名称 | 缺失时显示“未命名任务块”；编辑时仅改该属性 |
| `color` | 否 | `gray`/`blue`/`green`/`orange`/`red`/`violet` | Block 默认强调色；任务未设置颜色时继承 | 不应写入每个子任务 |

属性以 ASCII 空格分隔，字符串仅支持双引号；引号中不得包含未转义 `"`。未知 Block 属性允许保留，v1 不解释且回写不得删除。属性重复、未加引号或非法值为诊断，不可作为可编辑目标。

### 3.3 Block 有效性和容错

| 情况 | 解析结果 | 诊断级别 | 是否允许修改其中任务 |
|---|---|---|---|
| 合法开始与结束、唯一 id | 正常建 AST | 无 | 是 |
| 未闭合 Block | 结束前内容不进入任务投影 | error | 否；提供“补齐结束标记”修复动作 |
| 孤立结束标记 | 不影响其他块 | error | 否适用 |
| 嵌套 / 交叉 Block | 外层从嵌套开始处失效 | error | 否；必须人工或修复工具处理 |
| 文档内重复 Block id | 各块可展示为“存在冲突”，不得作为全局写入目标 | error | 否 |
| 非法属性 | 可尽力读取其他合法属性；受影响字段为空 | warning 或 error | 不修改该字段 |

**安全优先原则**：有结构性 error 的 Block 可以用于源码定位和只读预览，但任何会回写该 Block 的操作必须禁用，直到诊断被修复。

---

## 4. 任务行 DSL

### 4.1 合法任务行

在有效 Task Block 范围内，符合下列模式的**非代码围栏、非引用**列表行是任务：

```ebnf
TaskLine      = Indent, Bullet, Space, Checkbox, Space, Title, { Space, Annotation } ;
Indent        = { "  " } ;
Bullet        = "-" | "*" | "+" ;
Checkbox      = "[ ]" | "[x]" | "[X]" ;
Title         = NonEmptyText ;
Annotation    = Identifier | Type | Date | Due | Start | End | Priority | Color | Tag | UnknownAnnotation ;
```

- `Indent` 的规范格式是每层两个空格；实现应保留已有空白，但 tab、奇数空格和跳级缩进必须产生 warning。
- 任务标题必须在去掉受识别注解后仍然非空。标题可含普通 `@`、`#`、链接、强调等 Markdown 文本。
- `-`、`*`、`+` 均可用，创建任务时统一优先插入 `-`；修改既有行时保留原 bullet。
- `> - [ ]`、fenced code（` ``` ` 或 `~~~`）中的 checklist、HTML 示例中的文本、frontmatter 中的文本均**不是任务**。
- Task Block 之外任何 checkbox 都不是任务，即使形状完全相同。

### 4.2 任务属性 / 注解

注解可以任意排列，建议放在标题之后。v1 仅将完整 `@name(value)` 视为结构化属性；未知的同形注解不丢弃。

| 注解 | 值 | 必填 | 语义 | 视图影响 |
|---|---|---:|---|---|
| `@id(slug)` | `[A-Za-z0-9][A-Za-z0-9._-]{0,63}` | 新建任务是 | 任务稳定身份；在**同一文档**唯一，推荐全库唯一 | 所有反向编辑定位依据 |
| `@type(task)` | `task` | 否，默认 | 可执行工作项 | Todo、Calendar、Gantt（有区间时） |
| `@type(group)` | `group` | 否 | 粗粒度项目/阶段/汇总项；可含子任务 | Todo/Gantt 分组；无日期不进入 Calendar |
| `@type(milestone)` | `milestone` | 否 | 单点关键节点；必须有 `@date`，建议无子项 | Todo、Calendar 单点、Gantt 菱形 |
| `@date(YYYY-MM-DD)` | 严格 LocalDate | 否 | 单日执行日 / 发生日 | Todo（今日/近期）、Calendar 单日、Gantt 默认不显示 |
| `@due(YYYY-MM-DD)` | 严格 LocalDate | 否 | 截止承诺；与区间终点不同 | Todo 风险、Calendar 截止标记；不生成甘特条 |
| `@start(YYYY-MM-DD)` | 严格 LocalDate | 区间时是 | 执行开始日 | Todo/Calendar/Gantt 区间 |
| `@end(YYYY-MM-DD)` | 严格 LocalDate | 区间时是 | 执行结束日（含当天） | Todo/Calendar/Gantt 区间 |
| `@priority(level)` | `low`/`medium`/`high`/`urgent` | 否 | 重要性/紧急性 | Todo 排序与徽标；不改变日期 |
| `@color(token)` | 见色板 | 否 | 任务工作线颜色 | Calendar/Gantt/任务树强调色 |
| `#tag` | 不含空格的标签 | 否 | 多个分类标签 | Todo 筛选、详情与搜索 |

允许色板：`gray`、`blue`、`green`、`orange`、`red`、`violet`。任务没有 `@color` 时继承 Block 的 `color`；Block 也未设置时使用中性色 `gray`。颜色只用于识别和强调，**不得作为唯一的信息载体**。

### 4.3 日期校验与组合

所有日期均是无时区的 **LocalDate**：`YYYY-MM-DD`，必须是真实公历日期（闰年规则有效）。业务规则禁止通过 `Date.toISOString()` 生成或比较用户日期。

| 组合 | 含义 | 合法性 | 投影 |
|---|---|---|---|
| 无日期 | 未排期 | 合法 | Todo Inbox；Calendar/Gantt 均不显示 |
| 仅 `@date` | 单日工作 | 合法 | Calendar 单日项；不出现在甘特 |
| 仅 `@due` | 仅有截止承诺 | 合法 | Calendar 截止标记；Todo 临近/逾期；不出现在甘特 |
| `@start` + `@end` 且 start `<` end | 跨日执行区间 | 合法 | Calendar 连续条；Gantt 条 |
| `@start` + `@end` 且相等 | 单日排期 | 合法但提示建议改用 `@date` | Calendar 单日；Gantt 默认不显示 |
| 仅 start 或仅 end | 不完整排期 | warning，不进入 Calendar/Gantt | Todo “待补排期” |
| start `>` end | 反向区间 | error，不进入任何排期投影 | 只在诊断/源文档定位 |
| `@type(milestone)` + `@date` | 里程碑 | 合法 | Calendar 单点；Gantt 菱形 |
| milestone + 区间 | 语义冲突 | error | 不进入 Gantt |
| `@due` + 区间 | 执行窗口与截止日并存 | 合法 | Calendar 同时呈现区间和截止标记 |

`@due` 绝不可在解析或回写时折叠为 `@end`；同样，UI 修改结束日不得覆盖截止日。日期无效、重复同类日期属性、类型冲突均需显示原文与修复建议。

### 4.4 示例：粗细粒度与标题上下文

```markdown
<!-- mdw:tasks id="website-q3" name="网站 Q3" color="violet" -->

# 官网改版

## 发现与定义
- [ ] 研究阶段 @id(web-discovery) @type(group) @color(violet)
  - [ ] 访谈 5 位客户 @id(web-interviews) @priority(high) @date(2026-07-21) #research
  - [ ] 汇总关键洞察 @id(web-insights) @due(2026-07-23) #research

## 交付
- [ ] 第一版上线 @id(web-launch) @type(milestone) @date(2026-08-15) @priority(urgent)

<!-- /mdw:tasks -->
```

解析后：

- “研究阶段”是 `group`，用于表达粗粒度阶段，不应因为没有日期被错误标记为“今天待办”。
- “访谈 5 位客户”和“汇总关键洞察”是可执行 `task`，`parentId = web-discovery`，`headingPath = ["官网改版", "发现与定义"]`。
- “第一版上线”是 `milestone`，是单点节点，不是 8 月 15 日到下一日的假区间。

---

## 5. 层级、上下文与状态

### 5.1 层级来源

1. **Markdown 标题**提供 `headingPath`（例如 `[# 官网改版, ## 交付]`），是文档上下文而不是任务父子关系。
2. **任务列表缩进**提供任务树。每条任务的父项为同一 Block 中、向上最近的较浅层任务；根任务 `parentId` 为空。
3. 普通列表、段落和标题不会成为 `Task`，也不会作为树节点。
4. 缩进跳级（根任务后直接四空格子项）、tab 混入或父项缺失要给出 warning；可暂按最近较浅任务恢复树形预览，但写入前需明确用户修复或确认。

### 5.2 完成规则

- checkbox 是每个任务自身的完成状态；父项勾选**不级联**勾选子项，子项完成也不自动完成父项。
- 任务列表 / 详情面板可展示派生进度（如 `2/3`），但派生状态不得回写为 checkbox。
- 若用户勾选一个有未完成后代的父任务，显示非阻断确认：“仅完成阶段本身，保留 2 个未完成子任务”。确认后只改父项 checkbox。
- `group` 可有 checkbox，用于表达该阶段是否完成；它仍不改变子项。
- `milestone` 建议没有子任务。若有子任务，保留结构但显示 warning，不自动推断 milestone 完成。

### 5.3 删除和移动

- 删除任务必须提供三个明确动作：**仅删除本项（子项提升一级）**、**删除本项及全部子项**、**取消**。默认焦点是取消。
- 缩进/取消缩进仅允许保持同一 Block 内树形合法；跨 Block 移动应通过“移动到 Task Block”命令，并要求目标确认。
- 任务移动后 `@id` 不变；源/目标 Block 的 `blockId` 和来源范围重新解析。

---

## 6. 解析、诊断与写回合同

### 6.1 解析器必须产生的信息

每个可用任务至少输出：

```ts
{
  id, blockId, notePath, sourceRange: { startLine, endLine },
  headingPath, parentId, childIds, depth,
  title, done, type,
  date, due, start, end, priority, color, tags,
  rawLine, newline, diagnostics
}
```

`sourceRange` 用于精准定位；`rawLine` 和 token 范围用于最小文本补丁。解析结果还应包含 Block 清单、文档级/Block 级/任务级诊断以及可写性状态。

### 6.2 诊断分级

| 级别 | 行为 | 示例 |
|---|---|---|
| `error` | 受影响实体不可回写且不进入有风险投影 | Block 未闭合、重复 id、反向区间、里程碑缺 date |
| `warning` | 可只读展示或有降级投影；写前提醒 | 仅 start、缩进跳级、未知颜色、group 有 due |
| `info` | 说明性提示，不阻断 | 未排期任务在 Inbox、建议用 date 代替相等区间 |

每项诊断必须含：严重级别、代码、摘要、来源行列范围、原始片段、修复建议（若可自动修复则说明将修改的精确文本）。诊断不能只出现在开发者控制台。

### 6.3 最小回写规则

1. 扫描、打开、搜索、切换视图、索引、预览均是只读操作；禁止调用 `ensureTaskIds` 等隐式迁移。
2. 新建任务由 UI 生成 `@id`，插入用户选择的有效 Task Block；没有 Block 时先提供“插入任务块”动作，不得追加到文档末尾。
3. 切换完成状态只替换 checkbox 中的一个字符；不重排 metadata。
4. 修改一个已识别属性只替换/插入/移除该属性 token；保留 bullet、缩进、空格风格、标题 Markdown、未知 `@foo(...)`、未知 tags、相邻空行、行尾换行风格（LF/CRLF）。
5. `@due`、`@date`、`@start`、`@end` 是不同 token。任何编辑不得把一个 token 改名为另一个。
6. 写前需验证任务 id、Block id、来源片段和文件版本仍与索引一致。任一不一致则报“源文档已变化”，刷新并要求用户重试；禁止基于模糊标题匹配写入。
7. 同一文档有重复 Task ID 时，所有按 ID 的回写按钮禁用；必须先由迁移/修复工具显式分配新 ID。
8. 回写失败后不得把内存中的乐观修改伪装为已保存；显示可复制的错误信息和“重新载入 / 保留草稿”选择。

### 6.4 旧任务迁移

旧版本的任意 `- [ ]` 不能被静默视作 v1 任务，也不能在打开时自动补 id。提供显式“迁移旧 checklist”工具：

1. 在当前文档展示候选 checkbox（排除 fenced code、引用、frontmatter）。
2. 用户选择一个或多个范围，并选择新建或既有 Task Block。
3. 预览 diff：仅插入 Block 起止注释、必要的 `@id`；不改标题、日期、tags 或勾选状态。
4. 用户确认后写入；支持单次撤销。
5. 无法解析的旧 `@due` / `@end` 必须保留原文并列为诊断，绝不擅自转换。

---

## 7. 视图投影的语言级前提

所有投影先过滤：`有效 Block` → `无阻断 error 的任务` → 各视图自身规则。

| 任务数据 | Todo | Calendar | Gantt |
|---|---|---|---|
| 无日期 task | Inbox | 不显示 | 不显示 |
| `@date` task | Today / Upcoming / All | 单日卡片 | 不显示 |
| 仅 `@due` task | Upcoming / Overdue / All | 截止标记 | 不显示 |
| `@start + @end` task | Today / Upcoming / All | 连续区间条 | 甘特条 |
| `group` | 层级/进度 | 仅有合法日期时显示 | 行分组；有区间时可显示汇总条 |
| `milestone + @date` | 任务行 | 单点节点 | 菱形 |
| 已完成任务 | 默认折叠；可筛选显示 | 默认弱化显示 | 默认弱化显示 |

投影细节、排序、交互和可访问性见 `docs/product-spec-v1.md`；它们不能反向改变本语言的语义。

---

## 8. 反例（必须不投影）

````markdown
- [ ] 买咖啡（普通 checklist，不进入任务系统）

> - [ ] 引用里的待办（不进入任务系统）

```md
<!-- mdw:tasks id="demo" -->
- [ ] 文档示例（代码围栏，不进入任务系统）
<!-- /mdw:tasks -->
```

<!-- mdw:tasks id="real" -->
- [ ] 真正任务 @id(real-1) @due(2026-07-21)
<!-- /mdw:tasks -->
````

---

## 9. 版本演进约束

- 未来新增 `@dependency`、`@repeat`、`@reminder` 等属性必须遵守“未知属性原样保留”的前向兼容约束。
- 不可复用已发布属性的名称或改变已有日期语义。
- 若引入 Task Block 新版本，须通过显式 `version="2"` 或新的容器名称区分；v1 文档必须仍可只读解析。
- 本语言的每一条规则都应有对应解析与回写测试；完整验收编号见产品规格的 A01–A40。