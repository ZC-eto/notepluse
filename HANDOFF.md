# Handoff: 诺麦笔记（NotePluse）v0.9.1

## Identity
| 项 | 值 |
|----|-----|
| 中文名 | **诺麦笔记** |
| 技术 ID | **`notepluse`** |
| 作者 | **zebra** |
| 版本 | **0.9.1** |
| 源码 | `D:\Code\ZTools_Plugin\md-workspace` @ `master` |

## Full handoff
`.claude/handoffs/2026-07-21-145346-notepluse-v090-ztools-install.md`（安装路径仍有效）

## v0.9.1 修复（本批）
1. **软换行 round-trip**：`marked` `breaks: true` + Turndown `<br>→\n`，单换行不再被吃成空格
2. **排版 Enter**：Enter=软换行，Shift+Enter=新段落；任务标题内吞 Enter
3. **快捷键**：`Ctrl+Shift+M` / `Ctrl+Alt+T` 在编辑焦点内可用；TopBar 文案修正；快捷键表补全

## Critical: ZTools install
**Must write LMDB registry** (`Roaming\ZTools\lmdb` → `main` → `ZTOOLS/plugins`), not only copy files to `plugins\notepluse\`.

## Next
1. `npm run pack` → 正确安装 0.9.1
2. 真机：源码单换行 ⇄ 排版；Enter / Shift+Enter；Ctrl+Shift+M 在编辑中
