# 稿笺（Garben）

ZTools 插件：本地 Markdown 笔记 + **显式任务语法**驱动的待办/甘特/日历投影。

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
npm install
npm run dev          # 固定 http://127.0.0.1:5173（与 plugin.json development.main 对齐）
npm run dev:any      # 端口被占用时自动换端口（仅浏览器预览，宿主开发勿用）
npm run test:core
```

### 在 ZTools 宿主中调试（推荐）

1. `npm run dev`，保证 **5173 空闲**（`vite` 配置了 `strictPort: true`，被占用会直接失败）。
2. ZTools 以开发模式加载本插件目录（或指向含 `plugin.json` 的构建输出）。
3. 宿主会读 `plugin.json` 的 `development.main`：`http://localhost:5173`，并注入 preload 与 `window.ztools`。

纯浏览器打开 Vite 地址**没有**宿主 API（读写笔记目录、小窗、`onPluginEnter` 等会降级或走 demo），只能看 UI，不能代替真机。

### 安装包

```bash
npm run pack
# → release/md-workspace-vX.Y.Z.zip（zip 根含 plugin.json）
```

ZTools：设置 → 插件 → 导入本地插件 → 选 zip。

## 构建

```bash
npm run build
```

产物在 `dist/`。发版请用 `npm run pack`（会剥离 `development` / `$schema` 并打 zip）。

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

笔记目录默认：`文档/GarbenNotes`（可通过设置更换；旧版 `ZToolsNotes` 若已存在可在设置里继续指向）。
配置写在宿主 userData 的 `garben-config.json`（会尝试从旧版 `md-workspace-config.json` 迁移）。
文件即数据，后续可对该目录做同步。
