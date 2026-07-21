# Handoff: 诺麦笔记（NotePluse）v0.9.0

## Identity
| 项 | 值 |
|----|-----|
| 中文名 | **诺麦笔记** |
| 技术 ID | **`notepluse`** |
| 作者 | **zebra** |
| 版本 | **0.9.0** |
| Zip | `release/notepluse-v0.9.0.zip` |
| 源码 | `D:\Code\ZTools_Plugin\md-workspace` @ `master` |

## Full handoff
`.claude/handoffs/2026-07-21-145346-notepluse-v090-ztools-install.md`

## Critical: ZTools install
**Must write LMDB registry** (`Roaming\ZTools\lmdb` → `main` → `ZTOOLS/plugins`), not only copy files to `plugins\notepluse\`.  
Copy-only causes: missing from list + re-import error「插件目录已存在」.

## This machine (as of handoff)
- Disk: `C:\Users\Zebra\AppData\Roaming\ZTools\plugins\notepluse\`
- Registry: notepluse@0.9.0 registered; garben entry removed
- Config: `notepluse-config.json` (migrated notesRoot etc.)
- ZTools restarted after registry fix

## Next
1. User confirm 已安装插件 shows 诺麦笔记 v0.9.0  
2. Smoke: calendar scroll, rail dblclick/context, settings notesRoot  
3. Fail → 0.9.1 + proper install  
