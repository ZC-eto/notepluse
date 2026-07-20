# 架构说明

## 设计原则

1. **Markdown 是唯一数据源**（Layer 1）
2. **只有显式任务语法进入领域层**（Layer 2）
3. **待办 / 甘特 / 未来日历都是投影**，不另存业务库
4. **视图改动能回写 Markdown**，保证双向一致

## 模块

- `src/core/taskSyntax.ts` — 语法定义与序列化
- `src/core/parseTasks.ts` — Markdown → Task[]
- `src/core/writeTasks.ts` — Task 变更 → Markdown
- `src/core/markdownBridge.ts` — 所见即所得 ⟷ 源码
- `src/composables/useWorkspace.ts` — 状态与自动保存
- `public/preload/services.js` — 本地文件读写

## 扩展点

后续接入日历 / 通知时：

1. 仍从 `parseTasks` / 新 parser 读 Layer 2
2. 新视图只消费 Task 或新实体
3. 写回走 `writeTasks` 同类 API
4. 不要为投影单独建权威数据库（除非用户明确要求）
## v0.4 文件夹与同步预埋

- 物理布局：`notesRoot/{个人,工作,今日待办,长期待办,记录}/…/*.md`
- 「记录」文件夹：日记模板，纯文字不强行进入任务投影（投影仍仅识别任务语法行）
- preload：`listFolders` / `createFolder` / `createNote(title, folder)` / `listNotes` 递归带 `folder`
- `useWorkspace.noteGroups`：侧栏按文件夹分组
- 同步：`syncProvider: local | webdiv`，见 `docs/webdiv-sync.md`（webdiv 未接通）
