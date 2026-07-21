# Handoff: 稿笺（Garben）v0.8.6 品牌更名

## Session Metadata
- Created: 2026-07-21
- Project (权威源码): `D:\Code\ZTools_Plugin\md-workspace`（磁盘目录名暂未改）
- Branch: `master`
- 当前版本: **0.8.6**
- 插件 ID: **`garben`**
- 展示名: **稿笺**
- 安装包: `D:\Code\ZTools_Plugin\md-workspace\release\garben-v0.8.6.zip`
- Goal: 用户级可上线；**缺真机冒烟签字前不要 mark complete**

## Brand
| 项 | 值 |
|----|-----|
| 中文名 | 稿笺 |
| 英文 / 技术 ID | garben |
| 搜索词 | md / 笔记 / markdown / 稿笺 / garben |
| 配置文件 | `garben-config.json`（自动从 `md-workspace-config.json` 迁移） |
| 默认笔记目录 | `文档/GarbenNotes`（已有 `ZToolsNotes` 可在设置中继续指向） |
| 侧栏标记 | 「笺」 |
| 小窗标题 | 稿笺 · 今日 |

## Immediate Next Steps
1. 真机导入 `release\garben-v0.8.6.zip`（新 ID，会显示为新插件「稿笺」）
2. 可卸掉旧的「Markdown 工作台 / md-workspace」避免双份
3. 若有旧设置：启动时会读 legacy 配置并写入 `garben-config.json`
4. 若有旧笔记在 `ZToolsNotes`：设置 → 选择该目录即可

## Work Completed (v0.8.6)
- [x] 更名 稿笺 / garben 全用户可见面
- [x] plugin.json name/title/cmds/open-file label
- [x] 配置迁移 + 默认目录名
- [x] 小窗/引导/设置文案
- [x] test:core 48；pack garben-v0.8.6.zip

## Potential Gotchas
- 磁盘仓库夹仍叫 `md-workspace`，仅品牌与插件 ID 变了
- `package-lock` name 已对齐；历史 docs 里仍可能出现旧名
- Task Block 注释仍是 `mdw:tasks`（语法 ID，勿改，否则旧笔记失效）

---
Next: 真机导入 0.8.6 冒烟；确认标题栏显示「稿笺」。
