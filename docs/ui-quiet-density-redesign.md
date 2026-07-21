# Quiet Density — A+B 混搭（已实现）

> 分支 `ui/quiet-shell` · v0.9.3-quiet  
> 参考：Linear（chrome 退后）+ Obsidian Ribbon（库可隐）+ GitHub Primer（1px 线、紧列表）  
> 配色：**冷灰 slate + 钢蓝 accent**，告别暖米色 paper

---

## Design Read

**Reading this as:** small-window product shell for a Markdown note plugin, quiet high-density language (Linear receding chrome + Obsidian ribbon + Primer lines), cool luxury slate palette.

| Dial | Value |
|---|---:|
| VARIANCE | 3 |
| MOTION | 2 |
| DENSITY | 8 |

---

## Palette (Cold Luxury)

| Token | Light | Dark |
|---|---|---|
| paper | `#f2f3f6` | `#0f1115` |
| surface | `#fbfbfc` | `#15181e` |
| ink | `#12141a` | `#eceef2` |
| accent | `#3a5f8a` steel blue | `#7aa2c9` |
| line | `#e0e3e9` | `#2a303a` |

No warm craft beige. No teal-ink “notebook” green. No AI purple.

---

## Shell metrics

| Element | Spec |
|---|---|
| Rail | 44px, icon-only 16px, hit 36px, labels sr-only + `title` tooltip |
| Topbar | 36px, file name 13px sans, library icon-only, no New button |
| Library | 220px when open; search + sort/new icons; no “笔记库” header, no sort chips |
| Main | edge-to-edge, no card margin/radius/shadow |
| Footer status | removed (save state lives in topbar only) |

---

## Interaction map

| Action | How |
|---|---|
| Switch view | click rail / Ctrl+1–4 |
| Open library | double-click Notes · topbar ☰ · Ctrl+\ |
| New note | Ctrl+N · library + · right-click Notes |
| Save | Ctrl+S; topbar action only when dirty/error |

---

## Files touched

- `src/styles/main.css` — tokens + shell cascade + final override block
- `src/App.vue` — icon rail, tooltips, no footer
- `src/components/TopBar.vue` — compact chrome
- `src/components/NoteSidebar.vue` — denser library header
- `src/views/EditorView.vue` — empty-state copy
- `package.json` / `public/plugin.json` — 0.9.3-quiet
