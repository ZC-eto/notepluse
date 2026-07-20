# Handoff: md-workspace v0.7 用户级上线冲刺

## Session Metadata
- Created: 2026-07-20 08:23 (Asia/Shanghai)
- Project (权威源码): `C:\Users\Zebra\Documents\Codex\2026-07-19\ztoolscenter-ztools-https-github-com-ztoolscenter\work\md-workspace`
- 安装/发布目录: `D:\Code\ZTools_Plugin\md-workspace`（仅子目录，勿占整个 ZTools_Plugin）
- 交付/报告: `C:\Users\Zebra\Documents\Codex\2026-07-19\ztoolscenter-ztools-https-github-com-ztoolscenter\outputs`
- 宿主参考: `E:\Tools\ZTools`
- 当前版本: **0.7.0**（package.json + public/plugin.json 已对齐）
- 安装包: `release/md-workspace-v0.7.0.zip`（zip 根目录含 plugin.json）
- Session duration: 多轮连续会话（v0.4→v0.7）
- Goal: 多子代理迭代到用户级可上线；缺真机冒烟签字前不要 mark goal complete

## Current State Summary

正在把 ZTools 宿主上的 Markdown 工作台插件（md-workspace）打磨成可日常使用的产品：本地 Markdown 为真源，显式 `- [ ]` 语法驱动待办/甘特/日历，双向可编辑。

v0.7.0 已打包，`npm run test:core` 曾通过 67 pass。相对 v0.6 的主要缺口（原生弹窗、甘特/日历无「全部」、无「今日」、甘特混入单日）在代码层已收口。仍卡在：ZTools 真机 15 分钟冒烟未签字；PM 自动复审 agent 曾断流。产品目标未完成，直到真机验收通过。

## Important Context

1. 权威源码永远是 Documents 下 `work/md-workspace`；改完必须 `npm run pack` 并复制 zip 到 `D:\Code\ZTools_Plugin\md-workspace\release\`。
2. Goal 未完成：用户要求「PM 认为可上线再停」；缺真机签字则继续迭代，不要 update_goal complete。
3. 产品语义（官方说法）：待办=所有 `- [ ]`（默认今日跨笔记）；甘特=跨多天（start≠end）；日历=落在某天；长期=长甘特条+「长期待办」夹；每日重复=本版没有。
4. 禁止原生 confirm/prompt；禁止把整个 ZTools_Plugin 当单插件根；禁止宣称 WebDIV 已同步。
5. contenteditable 任务必须用 div.task-item，禁止多 li（浏览器会合并）。
6. 插件只能在 md-workspace 子目录；中文 UI；UTF-8 无 BOM 写源码。
7. 全局任务用 applyToNote；当前笔记用 setContent；今日/全部添加走 useTodayPlan 写入今日计划。

## Immediate Next Steps

1. 用户真机：ZTools 导入 `D:\Code\ZTools_Plugin\md-workspace\release\md-workspace-v0.7.0.zip`，按 8 条冒烟清单签字。
2. 若失败：按失败项修 → test:core → pack → 同步 D + outputs → 可升 0.7.1。
3. 若通过：写 outputs/pm-ship-v0.7-signed.md，经用户确认后再考虑 goal complete。
4. 继续打磨：甘特全部拖拽边界、标签点选、提醒/Webhook 路线图。
5. 旧数据可能仍有「本周计划.md」或损坏合并任务——引导「快速开始」或清理。

## Architecture Overview

本地 notesRoot/*.md --parse--> Task/GlobalTask；write-back 经 writeTasks；投影 UI 为 Todo/Gantt/Calendar；编辑器经 markdownBridge 双向；对话框 uiDialog；preload services 读写盘；WebDIV 仅预留。

数据流：Markdown 真源 → parseTasks/globalTasks → 视图 → onToggle/onSchedule/onAdd → setContent/applyToNote → 文件。

## Critical Files

| File | Purpose | Relevance |
|------|---------|-----------|
| src/core/taskSyntax.ts | 语法、isMultiDay、isTodayFocus | 投影语义 |
| src/core/parseTasks.ts | parseGanttTasks 等 | 甘特仅跨日 |
| src/core/writeTasks.ts | 增删改任务行 | 回写 |
| src/core/globalTasks.ts | 跨笔记聚合 | 今日/全部 |
| src/core/markdownBridge.ts | WYSIWYG 桥；task-item | 防合并 |
| src/composables/useWorkspace.ts | 状态中枢；onAddTask | 默认 todo |
| src/composables/uiDialog.ts | askConfirm/askPrompt | 无原生弹窗 |
| src/views/TodoView.vue | 今日/本篇/全部 | 早上路径 |
| src/views/GanttView.vue | 本篇/全部；跨日拖拽 | 甘特 |
| src/views/CalendarView.vue | 本篇/全部；内联添加 | 日历 |
| src/components/ScopeSeg.vue | 范围切换 | 复用 |
| public/preload/services.js | 宿主文件 API | 安装运行 |
| scripts/pack.mjs | 打 zip | 发版 |
| vite.ship.config.js | 生产构建 | pack |

## Key Patterns Discovered

- Markdown 是唯一持久化真源，视图不是第二库
- 全局任务 applyToNote；当前笔记 setContent
- contenteditable 用 div.task-item 防 li 合并
- 发版：npm run pack → release zip → 同步 D 盘
- 插件仅 md-workspace 子目录；多插件共存
- 写中文源码用 UTF-8 无 BOM，避免 PowerShell 重定向

## Work Completed

### Tasks Finished

- [x] 显式任务语法 vs 纯记录分层
- [x] 待办：今日（默认）/本篇/全部
- [x] 今日与全部可添加 → 今日计划
- [x] 甘特/日历 本篇|全部
- [x] 甘特仅跨日
- [x] 消灭原生 confirm/prompt
- [x] 日历内联添加 + 任务操作
- [x] 待办极简行 + 详情展开
- [x] 示例「快速开始」
- [x] WebDIV 即将推出
- [x] 默认视图 todo
- [x] v0.7.0 pack + 67 tests
- [x] 同步 D 与 outputs

## Files Modified

| File | Changes | Rationale |
|------|---------|-----------|
| src/core/taskSyntax.ts | isMultiDay, isTodayFocus | 甘特/今日语义 |
| src/core/parseTasks.ts | parseGanttTasks | 甘特过滤 |
| src/core/task.test.ts | 新单测 | 回归 |
| src/composables/useWorkspace.ts | onAddTask 目标；defaultView=todo | 早上路径 |
| src/composables/uiDialog.ts | 对话框总线 | 去原生弹窗 |
| src/App.vue | 挂载 Confirm/Prompt | 全局 UI |
| src/views/TodoView.vue | 三范围 + 摘要 | 产品核心 |
| src/views/GanttView.vue | 范围+跨日+全局 | 甘特可用 |
| src/views/CalendarView.vue | 范围+内联添加 | 日历可用 |
| src/components/* | ScopeSeg/Dialogs | UI 一致 |
| package.json / plugin.json | 0.7.0 | 版本对齐 |

## Decisions Made

| Decision | Options Considered | Rationale |
|----------|-------------------|-----------|
| 甘特仅跨日 | 全排期 / 仅跨日 | 用户：单日归日历 |
| 今日=逾期+今天+无日期未完成 | 仅 due=today | 早上收件箱 |
| 全部添加→今日计划 | 弹窗选笔记 | 降摩擦 |
| 默认打开待办 | editor / todo | 早上 90 秒 |
| 禁止原生弹窗 | confirm / 自绘 | UI 一体 |
| 插件子目录 | 根 / 子目录 | 多插件 |
| WebDIV 诚实预留 | 可选 / 即将推出 | 不假装可用 |

## Pending Work

真机冒烟 8 条：
1. 默认待办·今日
2. 今日添加写入今日计划
3. 甘特仅跨日；本篇/全部
4. 日历内联添加与任务操作
5. 删除自绘弹窗
6. WYSIWYG 多任务不合并
7. WebDIV 即将推出
8. 保存与 Ctrl+1..4

### Blockers/Open Questions

- [ ] Blocker: 无宿主真机签字；PM agent 断流不能代替用户
- [ ] Question: 用户旧 config defaultView=editor 是否强制迁移到 todo
- [ ] Question: 无日期未完成全进今日是否过吵

### Deferred Items

- 真正每日重复 / 提醒 / Webhook / AI
- 日历拖拽改期
- 文件夹重命名删除
- SVG 图标
- 跨插件 API 文档
- 合并双撤销栈（P1）

## Assumptions Made

- ZTools 导入 zip 根含 plugin.json
- 今日计划落在「今日待办」文件夹
- 用户接受「全部添加 → 今日计划」

## Potential Gotchas

- vue-tsc 对 ToolbarAction 类型敏感（需含 italic/link）
- PowerShell 写中文易乱码
- 正则改 useWorkspace 易截断 return reactive
- contenteditable 任务合并回归
- 导入务必选 v0.7.0 不是旧 zip
- D 盘无 node_modules 勿在 D 跑 test

## Environment State

- Node/npm 在 work/md-workspace
- test:core 67 pass（记录时）；pack 成功 v0.7.0 ~86KB
- 无必须常驻 dev server
- 命令：`cd work/md-workspace` → `npm run test:core` → `npm run pack` → 复制 zip 到 D 与 outputs

## Related Resources

- 插件内 HANDOFF.md（本文件稳定副本）
- 时间戳副本：`.claude/handoffs/2026-07-20-082338-md-workspace-v07-ship.md`
- outputs 下 agent-pm-v0.7-checklist.md、agent-user-morning-path-v0.7.md、v0.7-implement-progress.md、md-workspace-v0.7.0.zip
- 宿主: https://github.com/ZToolsCenter/ZTools

## Resume Checklist

1. 读本 handoff
2. 确认 package version 与 D 盘 zip 一致
3. npm run test:core 必须绿
4. 优先真机冒烟或修用户新吐槽，勿重做语法层
5. 发版：升版本 → pack → 同步 D/outputs → 写 ship 记录

---
Next agent: start at Immediate Next Steps #1（真机导入 v0.7.0）。