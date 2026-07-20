# WebDIV 同步预埋说明

> 状态：**未接通真实云同步**。`syncProvider: 'webdiv'` 仅为配置与接口占位。

## 查阅结论（ZTools 源码 / API 类型）

路径：`E:\Tools\ZTools`（可读时已查）

| 线索 | 结果 |
|------|------|
| `webdiv` / `WebDIV` 命名 API | **未找到** |
| 插件侧文档库 | `window.ztools.db`（put / get / allDocs / bulkDocs / attachments） |
| 简易 KV | `window.ztools.dbStorage` |
| 云复制状态 | `ztools.db.replicateStateFromCloud()` → `null` 未开同步 / `0` 完成 / `1` 复制中 |
| 主程序 SyncClient | 服务内部设置同步（WebSocket + changelog），**不是**插件笔记文件同步 API |

因此「WebDIV」在本插件中被定义为：**未来可能的远程笔记同步 Provider 名称**，实现时优先评估：

1. 将笔记内容镜像进 `ztools.db`（若宿主已为 db 开启云复制），或
2. 对接独立 WebDIV 服务（待官方/内部 API 明确后）

## 本仓库预埋点

| 位置 | 作用 |
|------|------|
| `src/core/types.ts` → `SyncProvider` | `'local' \| 'webdiv'` |
| `src/core/webdivSync.ts` | 配置读写、能力探测、`webdivSyncApi` 空实现 |
| `public/preload/services.js` → `readConfig` / `writeConfig` | 持久化 `syncProvider` |
| 侧栏设置区 | 切换 provider（webdiv 会提示未接通） |

配置键：`md-workspace-config.json` 内的 `syncProvider`。

## 禁止事项

- 不要在 UI 显示「已同步到云端」，除非 `webdivSyncApi` 真的 push/pull 成功
- 不要用假的 setTimeout 模拟上传进度
- 切换到 `webdiv` 时仍应继续用本地文件作为权威数据源（当前行为）

## 建议接入步骤（TODO）

1. **文档 ID 约定**  
   `_id: md-workspace/notes/<hash(path)>`  
   字段：`folder`, `name`, `content`, `mtime`, `kind`

2. **文件夹映射**  
   远端 `folder` 字符串 ↔ 本地 `notesRoot/<folder>/`

3. **冲突策略**  
   初版建议 last-write-wins（mtime），与 ZTools revision tree 对齐可后续升级

4. **触发时机**  
   `flushSave` 成功后异步 `pushNote`；进入插件时 `pullNotes`

5. **鉴权 / 可用性**  
   先 `probeWebdivCapabilities()`；`replicateState === null` 时提示用户在 ZTools 开启同步

## 当前默认

- `syncProvider = 'local'`
- 笔记仍只读写磁盘 Markdown