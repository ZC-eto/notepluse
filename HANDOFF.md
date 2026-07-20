# Handoff: md-workspace v0.7.6 UI 打磨与上线续冲

## Session Metadata
- Created: 2026-07-20 23:19:33 (Asia/Shanghai)
- Project (权威源码 = 安装目录): `D:\Code\ZTools_Plugin\md-workspace`
- Branch: `master`（clean）
- 当前版本: **0.7.6**（`package.json` + `public/plugin.json` 已对齐）
- 安装包: `release/md-workspace-v0.7.6.zip`
- Session duration: 本会话 ~1h（加载旧 handoff + 甘特空态 UI 修复）；项目连续多轮从 v0.7.0→0.7.6
- Goal: 多子代理迭代到用户级可上线；**缺真机冒烟签字前不要 mark goal complete**

### Recent Commits (for context)
- 8d21a93 fix(ui): calm Gantt empty stage over timeline shell (v0.7.6)
- 2fd54b4 chore(release): pack md-workspace v0.7.5
- f68f048 feat(ui): integrate Todo compose under toolbar / empty state
- 60bbc0e feat(ui): calm Gantt empty card + toolbar compose bar
- beb4d15 chore(release): pack md-workspace v0.7.4
- 975511e feat(ui): quieter HelpTip toolbars + v0.7.4
- b84fee1 feat(ui): sample data pack + frosted desktop sticky mini-window
- aefd987 feat(ui): quieter shell, nested folders, view toggles, mini-window (v0.7.3)
- 432f8f3 chore: initial git baseline for md-workspace v0.7.2

## Handoff Chain

- **Continues from**: [2026-07-20-082338-md-workspace-v07-ship.md](./2026-07-20-082338-md-workspace-v07-ship.md)
  - Previous title: md-workspace v0.7 用户级上线冲刺（停在 0.7.0；语义已过期）
- **Supersedes**: `2026-07-20-082338-md-workspace-v07-ship.md` 与根目录 `HANDOFF.md` 中「版本 0.7.0 / Documents 权威源码」段落
- 根目录稳定副本：`HANDOFF.md`（应与本文件内容同步）

## Current State Summary

ZTools 宿主上的 Markdown 工作台插件（md-workspace）已迭代到 **v0.7.6**。本会话先恢复了过期的 v0.7.0 handoff，确认权威源码已切换到本目录（旧 Documents/Codex 路径已不存在），再按用户真机截图修复了甘特**空态**的布局/视觉问题：去掉整页撑开的大卡与突兀 workline 装饰，改为时间轴壳 + 居中浮层小卡。`test:core` 48 pass，已 pack 并 commit。产品目标仍未完成——**用户尚未对 v0.7.6 做真机冒烟签字**；UI 仍可能继续吐槽（浮卡透明度、有数据时甘特板、其它视图空态一致性）。

## Important Context

1. **权威源码 = 本仓库** `D:\Code\ZTools_Plugin\md-workspace`。旧 handoff 写的 Documents/Codex `work/md-workspace` **已不存在**；`.local-backups/20260720-123303-pre-d-authority-switch/` 是切换前备份。
2. 本目录**有** `node_modules`，可直接 `npm run test:core` / `npm run pack`（旧 handoff 说 D 盘不能跑 test 已过期）。
3. Goal 未完成：缺真机签字则继续迭代，不要宣称可上线完成。
4. 产品语义：Markdown 真源；仅任务组 `<!-- mdw:tasks -->` 内显式任务进投影；甘特 = 跨日 `@start`+`@end` 与里程碑 `@type(milestone)+@date`；单日/截止归日历或待办，不伪装成甘特条。
5. 禁止原生 `confirm`/`prompt`；contenteditable 任务用 `div.task-item` 禁止多 `li`；中文 UI；UTF-8 无 BOM；不要假装 WebDIV 已同步。
6. 全局任务写回走 `applyToNote` / patchGlobal*；当前笔记走 `setContent` / patchTask。
7. 用户偏好：改完一批要 **git commit**；中间产物默认清理；文件操作用 Read/Grep/Glob/Edit 而非终端读码。
8. `docs/pm-ship-decision.md` 仍是 v0.2 时代文案，**不能当当前 ship 判定**。

## Immediate Next Steps

1. 用户真机：ZTools 导入 `D:\Code\ZTools_Plugin\md-workspace\release\md-workspace-v0.7.6.zip`，确认甘特空态是否满意；按冒烟清单签字。
2. 若 UI 仍吐槽：优先调浮卡透明度/位置、时间轴淡化、有数据时的板面，而不是重做语法层。
3. 若功能失败：按失败项修 → `npm run test:core` → 升 `0.7.7` → `npm run pack` → commit。
4. 若通过：在 `docs/` 下写 ship 签字记录，用户确认后再谈 goal complete。
5. 文档债：保持根 `HANDOFF.md` 与最新 timestamped handoff 一致；刷新或归档过时 `docs/pm-ship-decision.md`。

## Architecture Overview

本地 `notesRoot/*.md` → parse（taskSyntax / parseTasks / globalTasks）→ 投影 UI（Todo / Gantt / Calendar / Editor / MiniSticky）→ 编辑回写 writeTasks / applyToNote / setContent。preload `public/preload/services.js` 负责磁盘与宿主窗口 API。发版：`npm run pack`（vue-tsc + vite.ship + scripts/pack.mjs）→ `release/md-workspace-vX.Y.Z.zip`（zip 根含 plugin.json）。

数据流：Markdown 真源 → 任务组内显式任务 → 视图 → onToggle / onSchedule / onAdd → 写回文件。

## Critical Files

| File | Purpose | Relevance |
|------|---------|-----------|
| src/views/GanttView.vue | 甘特视图；空态 stage + 时间轴壳 | 本会话主要改动 |
| src/styles/main.css | 全局样式；`.gantt-stage` / `.gantt-empty` | 空态视觉 |
| src/views/TodoView.vue | 待办；工具栏/空态 compose | v0.7.5 模式参考 |
| src/composables/useWorkspace.ts | 状态中枢；demo samples；视图开关 | 核心状态 |
| src/views/MiniStickyView.vue | 桌面磨砂便签迷你窗 | v0.7.3+ |
| src/core/taskSyntax.ts | 语法、isMultiDay、isTodayFocus | 投影语义 |
| src/core/parseTasks.ts | parseGanttTasks 等 | 甘特仅跨日 |
| src/core/writeTasks.ts | 增删改任务行 | 回写 |
| src/core/globalTasks.ts | 跨笔记聚合 | 今日/全部 |
| src/core/markdownBridge.ts | WYSIWYG；task-item | 防 li 合并 |
| src/composables/uiDialog.ts | askConfirm/askPrompt | 无原生弹窗 |
| public/preload/services.js | 宿主文件 API / 迷你窗 | 安装运行 |
| scripts/pack.mjs | 打 zip | 发版 |
| HANDOFF.md | 根目录稳定 handoff | 与 `.claude/handoffs` 同步 |

## Key Patterns Discovered

- Markdown 是唯一持久化真源；视图不是第二库
- 只有合法 Task Block 内任务可写回；普通 checklist 不进投影
- 空态 UI 方向：不要整页实心大卡；优先「真实 UI 壳 + 小浮层/虚线卡」（甘特 0.7.6、Todo compose 0.7.5 同思路）
- 全局任务 applyToNote；当前笔记 setContent
- contenteditable 用 `div.task-item` 防浏览器合并 li
- 发版：`npm run test:core` → 升版本（package + plugin.json）→ `npm run pack` → commit（含 release zip）
- 插件仅 `md-workspace` 子目录；勿把整个 `ZTools_Plugin` 当单插件根
- 写中文源码用 UTF-8 无 BOM；避免 PowerShell 重定向乱码

## Work Completed

### Tasks Finished（本会话 + 自 0.7.2 基线的连续迭代）

- [x] 恢复并校准旧 handoff（权威源码已切 D 盘；版本漂移到 0.7.5/0.7.6）
- [x] 甘特空态：时间轴壳 + 居中浮层小卡 + 去掉 workline 装饰 + ghost bars
- [x] v0.7.6 pack + commit `8d21a93`
- [x] test:core 48 pass；vue-tsc 干净
- [x] （历史）v0.7.3 安静壳层、嵌套文件夹、视图开关、迷你窗入口
- [x] （历史）示例数据包 + 磨砂 sticky 迷你窗
- [x] （历史）HelpTip 收长文案；Gantt/Todo compose 条；Todo 底部常驻新建移除

### Files Modified（本会话 v0.7.6）

| File | Changes | Rationale |
|------|---------|-----------|
| src/views/GanttView.vue | 空态始终渲染 board；浮层 empty；ghost placeholder | 消除整页大空卡 |
| src/styles/main.css | `.gantt-stage`、空态浮层、ghost bars、淡化 board | 视觉与尺寸 |
| package.json / public/plugin.json | 0.7.6 | 版本对齐 |
| release/md-workspace-v0.7.6.zip | 新安装包 | 真机导入 |

### Decisions Made

| Decision | Options Considered | Rationale |
|----------|-------------------|-----------|
| 空态保留时间轴壳 + 浮层卡 | 仅小卡 / 仅空板 / 整页卡 | 用户嫌大框与中间装饰；壳让页面仍像甘特 |
| 去掉 workline-mini 装饰 | 保留 / 去掉 | 截图中间细线难看 |
| 权威源码以 D 盘本仓库为准 | 恢复 Documents 双源 | Documents 路径已不存在；已有 pre-d backup |
| 版本直接 0.7.6 并 pack | 只改样式不发版 | 用户真机靠 zip 导入 |

## Pending Work

### 真机冒烟建议清单（v0.7.6）

1. 默认打开待办·今日；范围切换正常
2. 待办添加写入所选任务组（非自动乱建）
3. 甘特空态：时间轴可见、浮卡居中、无突兀细线；「填充示例」可用
4. 甘特有数据：跨日条可拖/拉伸；本篇|全部；单日不进甘特
5. 日历内联添加与任务操作
6. 删除用自绘弹窗（无原生 confirm）
7. WYSIWYG 多任务不合并；Ctrl+1..4 / 保存
8. WebDIV 仍为「即将推出」诚实态；迷你窗（若开）磨砂今日列表

### Blockers/Open Questions

- [ ] Blocker: 无宿主真机签字；agent 不能代替用户
- [ ] Question: 用户对 0.7.6 甘特空态浮卡是否满意（透明度/阴影/文案）
- [ ] Question: 旧 config `defaultView=editor` 是否强制迁移到 todo
- [ ] Question: 无日期未完成进今日是否过吵

### Deferred Items

- 真正每日重复 / 提醒 / Webhook / AI
- 日历拖拽改期
- 文件夹重命名删除完善
- SVG 图标体系
- 跨插件 API 文档
- 合并双撤销栈（P1）
- 刷新 `docs/pm-ship-decision.md` 到 v0.7 语义

## Assumptions Made

- ZTools 导入 zip 根含 `plugin.json`（pack 已保证）
- 用户会用「填充示例数据」验证甘特，而非手写任务组起步
- 接受「全部/今日添加 → 选任务组写入」而非弹窗乱建笔记
- 继续用 `master` 本地迭代，不强制开 feature 分支

## Potential Gotchas

- 旧 handoff / `docs/pm-ship-decision.md` 版本与路径过期，勿照抄
- 导入务必选 **最新** zip（现为 v0.7.6），不是 0.7.0–0.7.5
- vue-tsc 对 ToolbarAction 类型敏感（历史）
- contenteditable 任务合并回归风险
- 正则/大段改 `useWorkspace.ts` 易截断 `return reactive`
- PowerShell 写中文易乱码 → 用 Edit/Write 工具
- `.claude/` 可能被 gitignore；根 `HANDOFF.md` 才是仓库内稳定副本
- 宿主窗体常见宽度 ~640–900：库侧栏在窄宽下变覆盖抽屉

## Environment State

- Node/npm 可用；`node_modules` 已装
- `npm run test:core` → 48 pass（记录时）
- `npm run pack` 成功 → `release/md-workspace-v0.7.6.zip`
- 无必须常驻 dev server
- Git: `master` clean @ `8d21a93`
- 命令：`cd D:\Code\ZTools_Plugin\md-workspace` → `npm run test:core` → 升版本 → `npm run pack` → `git commit`

## Related Resources

- 本 handoff：`.claude/handoffs/2026-07-20-231933-md-workspace-v076-ui-polish.md`
- 根副本：`HANDOFF.md`（应同步）
- 前序：`.claude/handoffs/2026-07-20-082338-md-workspace-v07-ship.md`
- 备份：`.local-backups/20260720-123303-pre-d-authority-switch/`
- 文档：`docs/product-spec-v1.md`、`docs/ui-design-system.md`、`docs/ui-chrome-pass-v071.md`、`docs/task-language.md`
- 宿主参考：https://github.com/ZToolsCenter/ZTools ；本地 `E:\Tools\ZTools`（若仍存在）

## Resume Checklist

1. 读本 handoff（优先于 v0.7.0 旧文）
2. 确认 `package.json` / `plugin.json` 版本与 `release/` 最新 zip 一致
3. `npm run test:core` 必须绿
4. 优先：真机导入 v0.7.6 或修用户新吐槽；勿重做语法层
5. 发版节奏：升版本 → pack → commit（含 zip）→ 写简短 ship 记录

---
Next agent: start at Immediate Next Steps #1（真机导入 v0.7.6 看甘特空态 + 冒烟）。
