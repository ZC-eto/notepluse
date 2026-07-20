# Markdown 工作台（md-workspace）

ZTools 插件：本地 Markdown 笔记 + **显式任务语法**驱动的待办/甘特投影。

## 分层模型

```
Layer 0  本地 .md 文件（默认可同步目录，后续可接网盘/同步）
Layer 1  原始 Markdown 文本
Layer 2  Task Domain（仅匹配任务语法的行）
Layer 3  投影视图
         - Editor：全文（默认所见即所得，可切源码）
         - Todo：全部任务行
         - Gantt：带排期元数据的任务
         - [Future] Calendar / Notification ...
```

**纯文字笔记**没有任务语法时：可正常编辑，但不会出现待办/甘特条目。

## 任务语法（唯一入口）

```markdown
- [ ] 写产品需求 @start(2026-07-20) @end(2026-07-24) #产品
- [x] 完成调研 @due(2026-07-18)
- [ ] 买咖啡
```

| 写法 | 待办 | 甘特 |
|------|------|------|
| `- [ ] 标题` | ✅ | ❌ |
| 带 `@start` / `@end` / `@due` | ✅ | ✅ |
| 普通列表 `- 文本` | ❌ | ❌ |
| 段落/标题 | ❌ | ❌ |

## 本地开发

```bash
pnpm install   # 或 npm install
pnpm dev
```

在 ZTools 中加载本插件（开发模式会读 `plugin.json` 的 `development.main`）。

## 构建

```bash
pnpm build
```

产物在 `dist/`，可安装到 ZTools 或 `ztools publish`。

## 文件夹（v0.4）

默认在笔记根目录下维护：

| 文件夹 | 用途 |
|--------|------|
| 个人 | 私人笔记 |
| 工作 | 工作笔记 |
| 今日待办 | 当日任务（可写 `- [ ]`） |
| 长期待办 | 长期任务 |
| 记录 | 日记/流水；纯文字不进待办投影 |

可在侧栏新建文件夹，并在文件夹下新建笔记。

## 默认存储

笔记目录默认：`文档/ZToolsNotes`（可通过 preload 配置扩展）。
文件即数据，后续可对该目录做同步。
