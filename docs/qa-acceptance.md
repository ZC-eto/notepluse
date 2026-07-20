# QA 验收记录（md-workspace / 任务层）

> 工作副本：`work/md-workspace`  
> 范围：`src/core` 任务语法、解析、回写（ensureTaskIds / 改标题保 id / removeTask）  
> 日期：2026-07-20  
> 角色：QA Agent

---

## 1. 自动化测试结果

### 命令

```text
node --import file:///D:/Code/ZTools_Plugin/md-workspace/node_modules/tsx/dist/esm/index.mjs --test src/core/task.test.ts
```

> 仅使用 D 盘已有 `tsx` 运行时，**未修改** `D:\Code\ZTools_Plugin\md-workspace` 源码。

### 结果摘要

| 项 | 值 |
| --- | --- |
| suites | 1 |
| tests | **19** |
| pass | **19** |
| fail | **0** |
| cancelled / skipped / todo | 0 |
| 结论 | **全部通过** |

### 本轮新增 / 增强覆盖

| 能力 | 用例要点 |
| --- | --- |
| `ensureTaskIds` | 缺 id 只补一次；纯文本/空串 noop；多任务唯一 id 且保留 start/end/tags；不处理 `* [ ]` |
| 改标题保 id | `@id` 存在时改标题 id 不变；同时保留排期与标签；多兄弟任务互不串号 |
| `removeTask` | 按 id 删除；不存在 id 为 noop；首/中/尾/最后一条；非任务正文保留 |
| 回归 | 显式 `- [ ]` 识别、甘特仅排期、append 写 id、toggle/改期保 id、serialize 稳定 |

---

## 2. 失败项

- **无**（本轮 0 fail）

---

## 3. 上线前手动清单

### 安装与启动

- [ ] zip 根目录含 `plugin.json`，可导入 ZTools
- [ ] 命令 `md` / 笔记 / todo / gantt 可打开
- [ ] 插件高度与窗口正常

### 笔记与文件

- [ ] 本地目录可见、可切换、可打开文件夹
- [ ] 新建 / 打开 / 删除 / 重命名
- [ ] `Ctrl+S` 保存，`Ctrl+N` 新建，`Ctrl+1/2/3` 切视图

### 编辑器

- [ ] 默认所见即所得，可切源码
- [ ] 工具条：H1/H2/粗体/列表/任务/今天
- [ ] 模式切换不丢任务 meta（`@id` / 日期 / 标签）

### 待办（重点）

- [ ] 仅显式 `- [ ]` 进入待办；`* [ ]`、普通列表不投影
- [ ] 勾选、改标题、删除、添加
- [ ] **改标题后 id 不变**，再勾选仍命中同一行
- [ ] 删除任务后相邻任务与正文段落仍在
- [ ] 标签筛选、过期高亮可用

### 甘特（重点）

- [ ] 仅有日期任务出现
- [ ] 拖拽平移 / 拉伸改期
- [ ] 空态可添加排期
- [ ] **拖期后任务不串号**（稳定 `@id`）

### 数据与稳定 id

- [ ] 打开旧笔记（无 `@id`）会自动补 id 并落盘
- [ ] 对已补 id 的笔记再打开，**不会重复改写**
- [ ] 新建任务自带 `@id`
- [ ] 退出插件后磁盘文件已保存
- [ ] 纯文字笔记 total/scheduled 均为 0

### 回归冒烟（建议 5 分钟）

1. 新建笔记 → 添加 3 条任务（1 条带日期）  
2. 待办改标题 → 勾选 → 源码确认 `@id` 未变  
3. 甘特拖一条任务改期 → 回待办确认仍是同一条  
4. 删除中间一条 → 另两条与段落文字仍在  
5. 重新打开同一文件 → 状态与 id 一致  

---

## 4. 风险与建议

| 风险 | 说明 | 建议 |
| --- | --- | --- |
| 无 `@id` 旧数据 | 打开时依赖 `ensureTaskIds` 写回 | 上线包确认自动保存开启 |
| 仅认 `- [ ]` | `* [ ]` / `+ [ ]` 不投影 | 文档写清语法；工具条只插 `- [ ]` |
| UI 层未在本轮自动化 | 本轮只覆盖 `src/core` | 上线前必须完成第 3 节手动清单 |
| 运行时路径 | 测试依赖 D 盘 node_modules/tsx | 正式 CI 建议项目内装 devDependency |

---

## 5. 交付物

| 路径 | 说明 |
| --- | --- |
| `work/md-workspace/src/core/task.test.ts` | 扩展后的任务层测试（19 例全过） |
| `work/md-workspace/docs/qa-acceptance.md` | 本验收记录 |
| **未改动** | `D:\Code\ZTools_Plugin\md-workspace` 插件源码目录 |
