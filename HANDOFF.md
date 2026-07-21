# Handoff: md-workspace v0.8.4 design-critique 与主目录发版

## Session Metadata
- Created: 2026-07-21 08:35:26 (Asia/Shanghai)
- Project (权威源码 = 安装目录): `D:\Code\ZTools_Plugin\md-workspace`
- Branch: `master`（clean @ `c104997`）
- 当前版本: **0.8.4**（`package.json` + `public/plugin.json` 已对齐）
- 安装包: `D:\Code\ZTools_Plugin\md-workspace\release\md-workspace-v0.8.4.zip`
- Session duration: 跨会话连续迭代（v0.7.6 handoff → v0.8.0–0.8.4；本段含头脑风暴、design critique 落地、主目录合并）
- Goal: 用户级可上线的 Markdown 工作台；**缺真机冒烟签字前不要 mark goal complete**

### Recent Commits (for context)
- c104997 fix(build): type bits array for sample seed status (v0.8.4)
- b2a5b76 fix(ui): v0.8.4 design-critique follow-ups
- 840cb01 fix(ui): v0.8.3 topbar view titles, coach marks, settings layout, mini sticky
- c359279 chore(release): repack md-workspace v0.8.2 from main tree
- 68f6cbe fix(ui): v0.8.2 quieter chrome, todo workline chips, settings IA
- ea167de fix(ui): v0.8.1 library push layout, editor toolbar, calendar panel
- f62e649 feat(ui): v0.8.0 startup prefs, onboarding, density, quieter task blocks

## Handoff Chain

- **Continues from**: [2026-07-20-231933-md-workspace-v076-ui-polish.md](./2026-07-20-231933-md-workspace-v076-ui-polish.md)
  - Previous title: md-workspace v0.7.6 UI 打磨与上线续冲
- **Supersedes**: `2026-07-20-231933-md-workspace-v076-ui-polish.md` 与根目录 `HANDOFF.md` 中「版本 0.7.6 / worktree 权威」段落
- 根目录稳定副本：`HANDOFF.md`（应与本文件同步）

## Current State Summary

md-workspace 已从 v0.7.6 迭代到 **v0.8.4**，工作全部应在 **主目录** `D:\Code\ZTools_Plugin\md-workspace` 完成（用户明确要求：不要再在 `.claude/worktrees/...` 里改）。已落地：笔记优先默认、可关笔记导航、显示密度、spotlight 引导、设置信息架构重排、小窗透明度与回主窗提示、顶栏投影视图用「待办/甘特/日历」而非文件名、待办 workline+标签芯片、示例数据修复逻辑、design-critique 跟进修复。`test:core` 48 pass，已 pack。**用户真机冒烟与引导/小窗宿主联动仍需签字。**

## Important Context

1. **权威源码 = 主目录** `D:\Code\ZTools_Plugin\md-workspace`。`.claude/worktrees/elegant-mirzakhani-93df5f` 曾用于 v0.7.7–0.8.2 开发，已 **fast-forward 合并进 master**；后续禁止在 worktree 改。
2. 用户导入路径永远是：`release\md-workspace-vX.Y.Z.zip`（当前 **v0.8.4**）。
3. 产品语义未变：Markdown 真源；仅 `<!-- mdw:tasks -->` 任务组内任务进投影；甘特=跨日+里程碑；单日/截止归日历或待办。
4. 禁止原生 `confirm`/`prompt`；contenteditable 任务用 `div.task-item`；中文 UI；UTF-8 无 BOM；WebDIV 诚实「实验/未接通」。
5. 改完一批：`npm run test:core` → 升版本（package + plugin.json）→ `npm run pack` → `git commit`（含 zip）。
6. 用户偏好：笔记优先；设置常用项在上、笔记目录偏下；引导要 spotlight 不是纯弹窗；小窗样式认可，保持轻量（不内联改标题/日期）。
7. 用户本地示例文件若已损坏（多任务组边界、裸 `@id`），需在设置高级里再点「填充示例数据」触发修复逻辑，或手动源码修好。

## Immediate Next Steps

1. 用户真机导入 `D:\Code\ZTools_Plugin\md-workspace\release\md-workspace-v0.8.4.zip`。
2. 冒烟清单（最低）：
   - 顶栏：待办/甘特/日历主标题是视图名，不是「示例-待办甘特」
   - 设置 → 重新开始引导：spotlight 高亮；未命中有黄底兜底文案
   - 设置：常用在上；笔记目录在「数据与高级」；便签在「外观与桌面便签」折叠
   - 便签：透明度滑条；点标题/任务有提示（主窗唤起依赖宿主 API）
   - 若仍「任务组结构需修复」：再点填充示例（修复）或源码修边界
3. 若 UI/功能失败：在**主目录**修 → test → 升 **0.8.5** → pack → commit。
4. 若通过：写 ship 签字记录到 `docs/`，再谈 goal complete。
5. 同步根 `HANDOFF.md` 与本 handoff；归档过时 `docs/pm-ship-decision.md` 语义。

## Architecture Overview

本地 `notesRoot/*.md` → parse（taskSyntax / parseTasks / globalTasks）→ 投影 UI（Todo / Gantt / Calendar / Editor / MiniSticky）→ 写回 writeTasks / applyToNote / setContent。preload `public/preload/services.js` 负责磁盘与配置。小窗：`ztools.createBrowserWindow('index.html?mode=mini')`。主窗↔小窗：`BroadcastChannel('mdw-plugin')`。发版：`npm run pack` → `release/md-workspace-vX.Y.Z.zip`（zip 根含 plugin.json）。

数据流：Markdown 真源 → 任务组内显式任务 → 视图 → onToggle / onSchedule / onAdd → 写回文件。

## Critical Files

| File | Purpose | Relevance |
|------|---------|-----------|
| src/components/TopBar.vue | 顶栏标题：投影=视图名 | v0.8.3/0.8.4 文件名错绑修复 |
| src/components/OnboardingTour.vue | Spotlight 教练式引导 | v0.8.3–0.8.4 |
| src/components/SettingsPanel.vue | 设置 IA：常用/高级/便签折叠 | v0.8.3–0.8.4 |
| src/components/ShortcutsPanel.vue | Ctrl+/ 快捷键表 | v0.8.1+ |
| src/views/MiniStickyView.vue | 桌面便签 + 回主窗提示 | v0.8.3–0.8.4 |
| src/views/TodoView.vue | 待办；workline/芯片/空态 CTA | v0.8.2 |
| src/views/EditorView.vue | 工具条主/更多；诊断文案 | v0.8.2 |
| src/views/GanttView.vue / CalendarView.vue | 投影；详情关闭在上 + Esc | v0.8.1 |
| src/composables/useWorkspace.ts | 状态中枢；prefs；示例修复；小窗 API | 核心 |
| src/core/markdownBridge.ts | WYSIWYG；任务组边界静音 | v0.8.2 |
| src/styles/main.css | Ink Ledger + coach + settings cards | 大文件，注意追加块 |
| public/preload/services.js | 宿主文件 API | 安装运行 |
| scripts/pack.mjs | 打 zip | 发版 |
| HANDOFF.md | 根目录稳定 handoff | 与 `.claude/handoffs` 同步 |

## Key Patterns Discovered

- Markdown 唯一真源；仅合法 Task Block 可写回
- 空态：真实 UI 壳 + 小浮层，非整页大卡
- contenteditable：`div.task-item` 防 li 合并
- 发版节奏：test:core → 升版本 → pack → commit（含 zip）
- **只在主目录改**；worktree 仅历史
- 用户可见文案统一「任务组」；源码保留 `mdw:tasks`
- 小窗保持轻量：勾选 + 跳转主窗；不在小窗改排期/标题
- 投影顶栏主标题=视图名；文件名最多 title 悬停

## Work Completed

### Tasks Finished

- [x] 合并 worktree 进度到主目录 master（0.7.7–0.8.2 链）
- [x] v0.8.0：默认视图可配、笔记可关、密度、可跳过引导
- [x] v0.8.1：库挤压布局、编辑器工具条扩展、日历/甘特关详情+Esc、快捷键面板
- [x] v0.8.2：工具条折叠、边界静音、待办芯片、设置高级折叠
- [x] v0.8.3：顶栏视图名、spotlight 引导、设置重排、小窗透明度/回主窗
- [x] v0.8.4：critique 跟进（引导兜底、顶栏去副标题、便签折叠、小窗 toast、示例修复）
- [x] test:core 48 pass；pack v0.8.4

### Files Modified（相对 v0.7.6 的关键 UI 链）

| File | Changes | Rationale |
|------|---------|-----------|
| TopBar.vue | 投影视图标题=待办/甘特/日历 | 修「示例-待办甘特」错绑 |
| OnboardingTour.vue | Spotlight + fallback | 引导可用性 |
| SettingsPanel.vue | 常用/数据分层、便签折叠、透明度 | 设置 IA |
| MiniStickyView.vue | 透明度、回主窗、失败提示 | 小窗体验 |
| useWorkspace.ts | prefs、示例修复、小窗 opacity/focus | 状态与数据 |
| markdownBridge.ts | 边界静音、代码块等 | 排版噪音 |
| TodoView / EditorView / Gantt / Calendar | 多轮 UI | 见各版 commit |
| main.css | coach/settings/todo chips | 视觉 |
| release/*.zip | 0.8.0–0.8.4 | 真机导入 |

### Decisions Made

| Decision | Options Considered | Rationale |
|----------|-------------------|-----------|
| 权威目录=主目录非 worktree | 继续 worktree / 双写 | 用户导入找不到新包；明确禁止 worktree |
| 投影顶栏用视图名 | 一直显示文件名 | 避免「全是示例-待办甘特」 |
| 小窗不内联深度编辑 | 小窗可改标题日期 | 保持便签轻量；跳转主窗 |
| 待办四分固定不可改名 | 用户自定义分段 | 可教、稳定；规则可配后再做 |
| 引导 spotlight 失败仍显示 tip | 静默 | 空库/未切视图时不白屏 |

## Pending Work

### 真机冒烟建议清单（v0.8.4）

1. 导入最新 zip；确认版本 0.8.4  
2. 顶栏待办/甘特/日历主标题正确  
3. 设置 → 重新开始引导；spotlight 或 fallback 文案  
4. 设置：常用在上；笔记目录在下；便签在折叠内；透明度可调  
5. 小窗：勾选；点标题有 toast；宿主允许时主窗出现  
6. 填充示例：若旧文件坏，应显示「修复 N」  
7. 待办行：workline + 优先级/标签芯片  
8. 笔记工具条：主条短，「更多」展开；诊断「定位源码」  
9. WebDIV 仍诚实实验态  

### Blockers/Open Questions

- [ ] Blocker: 无宿主真机签字；agent 不能代替用户  
- [ ] Question: 小窗 `showMainWindow` / BroadcastChannel 在用户 ZTools 版本上是否有效  
- [ ] Question: 引导 selector 在真机 DOM（是否带 is-editor class）是否稳定  
- [ ] Question: 用户是否还要小窗内改标题/日期（当前明确不做）

### Deferred Items

- 真正每日重复 / 提醒 / Webhook / AI  
- 日历拖拽改期（可先键盘改期）  
- 命令面板完整化（Ctrl+P 现偏笔记搜索）  
- 统一 Undo 栈（编辑器 vs 任务 patch）  
- 文件夹重命名删除完善  
- SVG 图标体系统一  
- 刷新 `docs/pm-ship-decision.md` 到 v0.8  
- 自定义快捷键绑定  

## Assumptions Made

- 用户会从主目录 `release` 导入最新 zip  
- 宿主提供 `createBrowserWindow` 与可选 `setOpacity`  
- 接受「任务组必须选目标再添加」而非乱建笔记  
- master 本地迭代，不强制 feature 分支  

## Potential Gotchas

- **Worktree 陷阱**：shell 有时仍显示 worktree cwd；写文件必须用主目录绝对路径  
- 旧 zip（0.8.3 及以前）顶栏/引导行为不同  
- 用户磁盘上已损坏的「示例-待办甘特」不会自动覆盖，除非再跑填充示例修复逻辑或手动改  
- `main.css` 多版追加块，改样式先搜选择器避免重复冲突  
- vue-tsc：注意 `const bits: string[]` 一类推断  
- contenteditable 任务合并回归风险  
- PowerShell 写中文易乱码 → Edit/Write 工具  

## Environment State

- Node/npm 可用；`node_modules` 在主目录  
- `npm run test:core` → 48 pass（v0.8.4 记录）  
- `npm run pack` → `release/md-workspace-v0.8.4.zip`  
- Git: `master` @ `c104997`（本 handoff 创建时）  
- 命令：`cd D:\Code\ZTools_Plugin\md-workspace` → test → 升版本 → pack → commit  

## Related Resources

- 本 handoff：`.claude/handoffs/2026-07-21-083526-md-workspace-v084-critique-fixes.md`
- 根副本：`HANDOFF.md`（请同步）
- 前序：`.claude/handoffs/2026-07-20-231933-md-workspace-v076-ui-polish.md`
- 文档：`docs/product-spec-v1.md`、`docs/ui-design-system.md`、`docs/task-language.md`
- 宿主参考：ZTools / `@ztools-center/ztools-api-types`

## Resume Checklist

1. 读本 handoff（优先于 v0.7.6 旧文）  
2. 确认工作目录是 **主目录** 不是 worktree  
3. 确认 `package.json` / `plugin.json` = 0.8.4 与 `release` 最新 zip 一致  
4. `npm run test:core` 必须绿  
5. 优先：真机导入 0.8.4 冒烟；按失败项在主目录修  
6. 发版：升版本 → pack → commit（含 zip）→ 更新 HANDOFF  

---
Next agent: start at Immediate Next Steps #1（真机导入 v0.8.4 + 冒烟清单）。
