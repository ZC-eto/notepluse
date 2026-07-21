# Quiet Density 壳层重设计

> **分支**：`ui/quiet-shell`  
> **状态**：设计稿 v1（先审再码）  
> **参考**：Linear（icon rail + tooltip）、GitHub（紧凑 chrome）、Obsidian（正文最大、库可隐）  
> **约束**：插件窗体小；主画布是唯一重点；Chrome 只服务上下文，不抢面积

---

## Design Read

**Reading this as:** product shell redesign for a small ZTools plugin window (note-first knowledge worker), with a Linear / GitHub / Obsidian quiet-density language, leaning toward icon-only rails, tooltip labels, and maximal canvas.

| Dial | Value | Why |
|---|---:|---|
| `DESIGN_VARIANCE` | **3** | Product chrome stays symmetric and predictable |
| `MOTION_INTENSITY` | **2** | Hover/focus only; no decorative motion |
| `VISUAL_DENSITY` | **7** | Cockpit-tight chrome, airy content |

This is **not** a marketing page redesign. Landing-page flourishes (hero, bento, marquees, serif display) are out of scope. Preserve paper/ink tokens; recompose density and hierarchy only.

---

## 1. 现状问题（对照代码）

| 区域 | 现状 | 问题 |
|---|---|---|
| Work rail | 56px；每项 `min-height: 50px` + 图标 18px + **文字 label** | 标签占高度；4 个视图 + 品牌约吃掉整列视觉重量 |
| Brand mark | 30×30「诺」方块 | 插件里品牌不必占首屏 |
| TopBar | 「笔记库」带文字+计数 + 大号 serif 标题 +「新建」+ 排版/源码 + 保存 pill + 保存按钮 + 帮助 + 设置 | 一行塞满；标题用 Georgia 18px 抢戏；「新建」与库内/快捷键重复 |
| Library | header「笔记库」+ 新建文件夹 + 新建笔记 + 搜索 + 排序三钮 + 最近 + 树 + footer | 打开时信息平铺；排序芯片常驻浪费 |
| Main pane | `margin: 8–10px` + `border-radius: 10–16px` + shadow | 卡片式外壳吃边距；小窗更疼 |
| Status footer | 24px 状态条 + workline | 与 TopBar 保存状态重复 |
| Editor toolbar | 图标工具条尚可 | 「任务组」文字按钮可缩 |

用户原话对齐：

1. 侧栏图标不必占大篇幅 → **icon-only rail，label 进 tooltip**
2. 新建笔记：双击打开侧栏即可，无需单独按钮 → **去掉顶栏「新建」**
3. 部分图标过大 → **rail 16px / chrome 14–16px**
4. 标题栏太宽 → **顶栏压到 36px，标题 13px 文件名**
5. 主体留出来 → **默认 library 关闭；无卡片边距；无底栏重复状态**

---

## 2. 设计原则（本次唯一准则）

1. **Canvas first**：任何 chrome 增加前先问「能否 tooltip / 菜单 / 快捷键？」
2. **Icon + title，不 Icon + 常显字**：导航、设置、库开关默认无可见标签
3. **一个动作一个入口**：新建笔记 = Ctrl+N / 库内 + / 右键 rail「笔记」；不在顶栏再放「新建」
4. **状态单点呈现**：保存态只在顶栏右侧（点/字），去掉 footer 重复
5. **默认安静**：library 默认关；打开靠 双击笔记 / Ctrl+\ / 顶栏汉堡
6. **不换品牌色**：保留 `--paper / --ink / --accent / --workline`；改尺寸与层级

---

## 3. 目标壳层（ASCII）

### 3.1 默认：library 关闭（推荐主态）

```text
┌────┬──────────────────────────────────────────────────────────┐
│ 诺 │  ☰   meeting-notes.md              ·已保存   Aa  ⚙       │ 36px
│    ├──────────────────────────────────────────────────────────┤
│ 📄 │                                                          │
│ ☑  │                                                          │
│ ▤  │                    主画布（正文 / 待办 / 甘特 / 日历）      │
│ 📅 │                    几乎全宽 · 无卡片外框 · 无底栏          │
│    │                                                          │
└────┴──────────────────────────────────────────────────────────┘
 44px
```

- **Rail 44px**，仅图标；hover 出 native `title` / 自绘 tooltip（含快捷键）
- **Top 36px**：左库开关（图标）+ 文件名；右 模式 / 保存点 / 设置
- **无**底栏；**无**顶栏「新建」；**无**「笔记库」文字

### 3.2 library 打开（挤压）

```text
┌────┬──────────────────┬───────────────────────────────────────┐
│    │ 搜索…        ⋯ ＋ │  ☰  meeting-notes.md     ·  排版  ⚙  │
│ 📄 │ 最近…             │                                       │
│ ☑  │ ▾ 工作            │              正文                     │
│ ▤  │   · alpha.md      │                                       │
│ 📅 │   · beta.md       │                                       │
└────┴──────────────────┴───────────────────────────────────────┘
 44   220–240px              剩余全给画布
```

- 库宽 **220px**（可后调 200–260），去掉大 brand header
- 排序收入「⋯」菜单；新建「＋」保留在库头（上下文正确）
- 主区仍无卡片 margin 浪费

---

## 4. 分区规格

### 4.1 Work Rail（常驻）

| 项 | 规格 |
|---|---|
| 宽 | **44px**（现 56） |
| 项高 | **36px** hit；视觉 **28–32** 圆角方 |
| 图标 | **16×16** stroke 1.6（现 18 + 50px 项） |
| 标签 | **不渲染** `.rail-label`；`title` + `aria-label` 承载「笔记 Ctrl+1 · 双击开库」 |
| 品牌 | 顶上 **22×22** 小标或直接去掉「诺」字块，只留细工作线 |
| Active | 左侧 2px workline + 轻 surface 底；**不要**大块 elevation |
| 交互（已有，保留） | 单击切视图；**双击笔记** 开/关库；**右键笔记** 新建菜单 |
| 设置 | 不进 rail；只在顶栏 ⚙ |

```css
/* 目标量级 */
.work-rail { width: 44px; padding: 8px 4px; }
.rail-nav-item { min-height: 36px; padding: 6px 0; gap: 0; }
.rail-label { display: none; }
.rail-icon, .rail-icon svg { width: 16px; height: 16px; }
```

### 4.2 TopBar（Context chrome）

| 左 | 中 | 右 |
|---|---|---|
| 库开关 **图标按钮** 28×28（无「笔记库」字、无 count pill） | 文件名 **13px / 500** sans，ellipsis；非编辑视图显示视图名 | 排版\|源码（仅 editor，segment 24px 高）· 保存态 · ⚙ |

**删除 / 迁出：**

| 现控件 | 处理 |
|---|---|
| 「新建」按钮 | **删除**；Ctrl+N / 库内 + / rail 右键 |
| 「笔记库」文字 + count | **图标 only**；count 仅在 library header 小字 |
| HelpTip「？」 | 收入设置或 Ctrl+/ 快捷键表 |
| 大号 serif `doc-title` | 改为 interface 13–13.5px |
| 显式「保存」实心钮 | 默认隐藏；仅 `dirty` 或 `saveError` 时出现紧凑「保存」/「重试」 |
| 底栏 `workspace-status` | **删除**（与 save pill 重复） |

保存态显示规则（Linear 味）：

- 干净：`·` 或 无文案（title 可写「已保存」）
- dirty：小橙点 +「未保存」（可点保存）
- saving：`…`
- error：红字「失败」+ 重试

### 4.3 Note Library

| 区 | 规格 |
|---|---|
| Header | 一行：`搜索` 占满 + `⋯`（排序/更换目录/打开文件夹）+ `＋`（新建笔记） |
| 去掉 | 大「笔记库」标题行；常显「名称/时间/↑↓」三芯片；每 folder 右侧常显 +（hover 再显） |
| 最近 | 可折叠；默认开；行高 28px |
| 笔记行 | 28–30px；mtime 仅 hover 或右侧淡字 10px |
| Footer | 路径一行 mono 10px；动作进 ⋯ |
| 宽 | 220px 默认 |

**新建路径（用户要求）：**

1. 双击 rail「笔记」→ 开库 → 点库内 ＋ 或空白右键  
2. Ctrl+N（已有）  
3. 右键 rail「笔记」→「新建笔记」（已有）  
**禁止**再在顶栏放第三入口。

### 4.4 Main canvas

| 项 | 现 | 目标 |
|---|---|---|
| 外边距 | 8–10px + 圆角卡片 | **0**；rail 右边 1px 线即可，或极轻 4px |
| 圆角/阴影 | 10–16px + shadow | 无或仅 1px 边 |
| 编辑工具条 | ~36px | **32px**；图标 14–15px；「任务组」改图标+title |
| 正文 | 尚可 | 保持；max-width 仍可 760 居中阅读 |

### 4.5 视图内 chrome（轻触，本阶段可选）

- Todo / Gantt / Calendar 顶部分段：高度压到 32；filter 收入菜单  
- 不在本设计改任务语义与回写

---

## 5. 交互地图（最终用户可感知）

| 动作 | 方式 |
|---|---|
| 切视图 | 单击 rail 图标 / Ctrl+1..4 |
| 开/关笔记库 | 双击「笔记」图标 · 顶栏 ☰ · Ctrl+\ · Esc 关 |
| 新建笔记 | Ctrl+N · 库内 ＋ · 右键「笔记」 |
| 新建文件夹 | 库 ⋯ 或右键菜单 |
| 搜索笔记 | Ctrl+P（开库并 focus） |
| 保存 | Ctrl+S；dirty 时顶栏出现保存 |
| 模式切换 | Ctrl+Shift+M · 顶栏 segment |
| 设置 | ⚙ · Ctrl+, |
| 快捷键表 | Ctrl+/ |

Tooltip 文案示例（hover 400–500ms）：

- 笔记：`笔记 · Ctrl+1 · 双击打开笔记库`
- 待办：`待办 · Ctrl+2`
- ☰：`笔记库 · Ctrl+\`
- ＋：`新建笔记 · Ctrl+N`

---

## 6. 视觉 token 微调（不换色）

```css
:root {
  --rail: 44px;
  --sidebar: 220px;
  --topbar: 36px;
  --chrome-icon: 16px;
  --chrome-hit: 28px;
  --radius-chrome: 6px;   /* chrome 更利落；内容区可保持原 radius */
  --font: Inter, "Segoe UI", "PingFang SC", "Microsoft YaHei UI", system-ui, sans-serif;
  /* 标题不再用 Georgia 做 chrome 字 */
}
```

对比度、focus ring、深浅主题 token **保持**现有 paper/ink。

---

## 7. 组件改动清单（实施时）

| 文件 | 改动 |
|---|---|
| `src/App.vue` | 隐藏 `.rail-label` 或模板去掉 span；收紧 brand；去掉 footer；rail title 文案带快捷键 |
| `src/components/TopBar.vue` | 库开关 icon-only；去「新建」；标题降级；保存条件显；去 HelpTip 常显 |
| `src/components/NoteSidebar.vue` | 压 header；排序进菜单；行高/间距；新建只留库内 |
| `src/styles/main.css`（quiet 段 ~2709+） | rail/topbar/library/main-pane 密度覆写；删 status 依赖 |
| `src/views/EditorView.vue` | 工具条高度；任务组 icon-only（可选同 PR） |

**不改**：task parser/writer、视图业务逻辑、快捷键注册表语义（只对齐 UI 入口）。

---

## 8. 前后对比（一句话）

| | 前（quiet-shell 现状） | 后（Quiet Density） |
|---|---|---|
| Rail | 56px + 字 | 44px 纯图标 + tooltip |
| Top | ~44–48 多按钮多字 | 36px 图标+文件名+必要状态 |
| 新建 | 顶栏 + 库 + 快捷键 | 库 + 快捷键 + 右键 |
| 主区 | 卡片 margin | 贴边全画布 |
| 状态 | 顶栏 + 底栏 | 仅顶栏 |

---

## 9. 验收清单

- [ ] 默认打开：rail + 主画布，库关；主画布宽度 ≥ 窗宽 − 44px − 细缝
- [ ] rail 无可见中文标签；hover 有完整 title
- [ ] 顶栏无「新建」「笔记库」文字
- [ ] 双击笔记图标开/关库；Ctrl+N 仍新建
- [ ] 顶栏高度 ≤ 36px；rail 宽 = 44px
- [ ] 无 workspace footer
- [ ] 深浅主题仍可读；focus-visible 保留
- [ ] 900px / 560px 挤压策略不回退成遮罩盖正文（保持现有 push 布局）

---

## 10. 实施顺序（批准后）

1. **CSS 密度覆写**（rail / topbar / main-pane / hide labels）— 最大观感，最小风险  
2. **TopBar 精简**（去新建、icon 库开关、标题、保存）  
3. **Library 精简**（header/sort）  
4. **App 去 footer + tooltip 文案**  
5. **Editor 工具条微调**  
6. 本地 `npm run dev` 目视 + 关键路径冒烟  

---

## 11. 明确不做（本轮）

- 不引入新 UI 框架 / 新图标库依赖（继续内联 SVG）
- 不重做 Todo/Gantt/Calendar 信息架构
- 不做 Home 今日工作台（规格另案）
- 不把 library 改成悬浮 overlay（用户要的是主体空间，push 更稳）
- 不改 Markdown / 任务语义

---

**下一步**：你确认本设计后，在 `ui/quiet-shell` 按 §10 落地；若只要更狠（rail 36px、顶栏 32px、完全无 main 边框），说一声可再压一档。
