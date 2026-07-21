# NotePluse · DESIGN.md

> Open Design alignment: **linear-app** (closest official system)  
> Product: 诺麦笔记 — local Markdown notes + task-block projections  
> Mode: dark-native productivity shell (not marketing site)

## Why linear-app

| Open Design system | Fit for NotePluse |
|---|---|
| **linear-app** | Best match: dark canvas, quiet chrome, high density, issue/note shell |
| notion | Too warm/document-y for pure-black tool chrome |
| raycast / cursor | Overlay/palette tools, not full app shell |
| vercel | Marketing + dashboard, not note workspace |

Adapt Linear for a **Chinese Markdown plugin window** (ZTools): keep density and calm hierarchy; keep pure-black surfaces already shipping; use **steel indigo** accent sparingly (Linear’s violet-indigo family), not craft-teal or warm paper.

## Visual contract

### Surfaces (dark-native)

| Role | Token | Value |
|------|--------|--------|
| Canvas | `--paper` / `--bg` | `#000000` |
| Deep | `--paper-deep` | `#050505` |
| Panel | `--surface` | `#0a0a0a` |
| Elevated / hover | `--surface-2` | `#141414` |
| Line | `--line` | `#1f1f1f` |
| Line strong | `--line-strong` | `#2e2e2e` |

Linear reference blacks (`#08090a`, `#0f1011`) are slightly lifted; we stay **pure black** per product direction while matching hierarchy (canvas < panel < elevated).

### Text

| Role | Token | Value | Weight |
|------|--------|--------|--------|
| Primary | `--ink` | `#f2f2f2` | 400–500 |
| Secondary | `--muted` | `#9a9a9a` | 400–500 |
| Tertiary | `--faint` | `#666666` | 400–500 |
| Emphasis max | — | — | **550** (never 700+ in chrome) |

### Accent (Linear indigo family, single chromatic)

| Role | Token | Value |
|------|--------|--------|
| Accent | `--accent` | `#5e6ad2` (Linear brand indigo) |
| Hover | `--accent-hover` | `#7170ff` |
| Soft | `--accent-soft` | `#12141f` |
| Ink on soft | `--accent-ink` | `#c8c9f0` |
| Workline | `--workline` | same as accent |

Use accent only for: active rail indicator, primary CTA, focus ring, selected row inset.

### Typography

- UI: `Inter, system-ui, "PingFang SC", "Microsoft YaHei UI", sans-serif`
- Mono: `ui-monospace, Cascadia Mono, Consolas`
- Chrome weight band: **400–550** only
- No serif display titles in shell

### Radius & density

- Radius: **8px** controls / **6px** small
- Rail: **44px** icon-only
- Topbar: **36px**
- Hit target chrome: **28px**
- Borders: 1px solid `--line` (no thick pill walls)

### Component rules (anti-patterns)

1. No boxed text button rows (use icon / text-link / underline tabs)
2. No title-bold + long essay description in dialogs
3. Secondary info in `<details>` or mono meta, not equal cards
4. Undo/redo: shortcuts only, not toolbar
5. Settings: flat sheet rows matching shell, not nested “help walls”

### Shell map

```
[ rail 44 ][ › 16 ][ library optional 220 ][ main ]
  icons       collapse    notes tree            topbar 36 + content
```

### Views

- Editor: content first; toolbar icon strip
- Todo / Gantt / Calendar: quiet scope tabs; projections only from Task Blocks
- Inspector: hero meta + folded source

## Implementation

- Live tokens: `src/styles/main.css` `:root` + dark media
- Product notes: `docs/design-anti-patterns.md`
- Open Design catalog ref: `design-systems/linear-app/DESIGN.md` (upstream)

When regenerating prototypes in Open Design, set design system to **linear-app** and fidelity to product-shell / dark.
