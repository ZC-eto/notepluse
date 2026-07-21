# Handoff: md-workspace v0.8.5 ZTools 规范对齐

## Session Metadata
- Created: 2026-07-21（接 v0.8.4 handoff 续）
- Project (权威源码 = 安装目录): `D:\Code\ZTools_Plugin\md-workspace`
- Branch: `master` @ `559b371`
- 当前版本: **0.8.5**（`package.json` + `public/plugin.json` 已对齐）
- 安装包: `D:\Code\ZTools_Plugin\md-workspace\release\md-workspace-v0.8.5.zip`
- Goal: 用户级可上线的 Markdown 工作台；**缺真机冒烟签字前不要 mark goal complete**

### Recent Commits (for context)
- 559b371 fix(plugin): align ZTools docs and ship v0.8.5
- 26a6606 docs: handoff md-workspace v0.8.4 critique fixes for next agent
- c104997 fix(build): type bits array for sample seed status (v0.8.4)
- b2a5b76 fix(ui): v0.8.4 design-critique follow-ups

## Handoff Chain

- **Continues from**: v0.8.4 design-critique handoff
- **Supersedes**: 版本号 0.8.4 与「development 端口随意」的表述
- 根目录稳定副本：`HANDOFF.md`

## Current State Summary

md-workspace **v0.8.5**：在 v0.8.4 UI 基础上对齐 ZTools 官方开发文档约定——`plugin.json` `$schema` 相对路径、`pluginSetting.single`、Vite 固定 `127.0.0.1:5173` + `strictPort`、README 宿主调试说明、workspace 入口尊重 `defaultView`、小窗 `alwaysOnTop` 拼写清理。`test:core` 48 pass；已 pack。**真机冒烟仍待用户签字。**

## Important Context

1. **权威源码 = 主目录**；禁止在 `.claude/worktrees/...` 改。
2. 导入：`release\md-workspace-v0.8.5.zip`
3. **宿主开发必须 5173**：`development.main` = `http://localhost:5173`；`npm run dev` 占端口失败即报错。仅浏览器预览用 `npm run dev:any`。
4. 改完一批：`npm run test:core` → 升版本 → `npm run pack` → `git commit`（含 zip）
5. 产品语义未变：Markdown 真源；仅 Task Block 进投影。

## Immediate Next Steps

1. 用户真机导入 `release\md-workspace-v0.8.5.zip`
2. 冒烟（v0.8.4 清单 + 新增）：
   - 插件单开（single）行为正常
   - 默认入口 feature「workspace」进设置里的默认视图
   - 拖入 md 打开 open-file
   - 小窗置顶/透明度
3. 失败 → 主目录修 → 0.8.6 → pack → commit
4. 通过 → docs ship 签字

## Work Completed (v0.8.5)

- [x] 修正 `$schema` 相对 `public/plugin.json` 的路径
- [x] `pluginSetting.single: true`
- [x] Vite `server.host/port/strictPort` 与 `development.main` 对齐
- [x] `npm run dev:any` + launch.json 分档
- [x] README 宿主 vs 纯浏览器说明
- [x] `handleEnter` workspace 用 defaultView；open-file 先切 editor
- [x] 去掉错误 `alwayOnTop` 键；清理小窗 close 空逻辑
- [x] ship-checklist 升到 v0.8+
- [x] test:core 48；pack v0.8.5

## Potential Gotchas

- 本机另工程占 5173 时：`npm run dev` 会失败——应停对方或换端口并同步改 `plugin.json` development.main
- Browser Preview（autoPort）与 ZTools 开发模式不是同一条链路
- 其余同 v0.8.4：损坏示例需再点填充；worktree 陷阱

## Resume Checklist

1. 主目录工作；版本 0.8.5；zip 最新
2. `npm run test:core` 绿
3. 真机导入 0.8.5 冒烟
4. 发版节奏：升版本 → pack → commit（含 zip）→ 更新 HANDOFF

---
Next agent: 真机导入 v0.8.5 + 冒烟；ZTools 宿主调试用 `npm run dev` @5173。
