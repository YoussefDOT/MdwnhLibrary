---
title: مِرصاد Design System
version: "1.0"
register: product
theme: dual (dark default / light)
colors:
  bg: "#1c1c1e"
  surface-1: "rgba(255,255,255,0.08)"
  surface-2: "rgba(255,255,255,0.12)"
  accent: "#0a84ff"
  green: "#30d158"
  red: "#ff453a"
  orange: "#ff9f0a"
  purple: "#bf5af2"
  tc: "#64d2ff"
  text-1: "#ffffff"
  text-2: "rgba(255,255,255,0.62)"
  text-3: "rgba(255,255,255,0.48)"
typography:
  primary: ThmanyahSans
  display: ThmanyahSerifDisplay
  mono: "SF Mono, Menlo"
  base-size: 14px
  scale: [11, 12, 13, 14, 15, 17, 18, 22, 28, 30]
radius:
  sm: 10px
  md: 14px
  lg: 18px
spacing:
  tight: 8px
  base: 16px
  loose: 24px
  section: 36px
---

## Overview

مِرصاد is a video shoot session management tool for Arabic-speaking video production teams. It is a single-page PWA (index.html ~9800 lines) backed by Firebase (Auth + Firestore + Storage) with an optional standalone teleprompter window (teleprompter.html).

The interface is fully RTL (`dir="rtl"`) with a dual theme — a deep dark mode default (`#1c1c1e`, Apple HIG dark) and a light mode (`#f2f2f7`, Apple HIG light). The design register is "product": design serves the workflow, not the brand.

**Philosophy**: the tool disappears into the workflow. Visual calm as a performance feature. Speed over decoration. No chrome that doesn't carry information.

---

## Colors

### Dark theme (default)

| Role | Token | Value |
|---|---|---|
| Page background | `--bg` | `#1c1c1e` |
| Topbar background | `--bg-topbar` | `rgba(28,28,30,0.75)` (blurred) |
| Surface level 1 | `--surface-1` | `rgba(255,255,255,0.08)` |
| Surface level 2 | `--surface-2` | `rgba(255,255,255,0.12)` |
| Surface level 3 | `--surface-3` | `rgba(255,255,255,0.18)` |
| Border | `--border` | `rgba(255,255,255,0.14)` |
| Border focused | `--border-focus` | `rgba(10,132,255,0.70)` |
| Primary text | `--text-1` | `#ffffff` |
| Secondary text | `--text-2` | `rgba(255,255,255,0.62)` |
| Tertiary text | `--text-3` | `rgba(255,255,255,0.48)` |
| Placeholder | `--placeholder` | `rgba(255,255,255,0.48)` |
| Accent (blue) | `--accent` | `#0a84ff` |
| Accent glow | `--accent-glow` | `rgba(10,132,255,0.25)` |
| Success (green) | `--green` | `#30d158` |
| Danger (red) | `--red` | `#ff453a` |
| Warning (orange) | `--orange` | `#ff9f0a` |
| Purple | `--purple` | `#bf5af2` |
| Timecode (cyan) | `--tc` | `#64d2ff` |

### Light theme (`html[data-theme="light"]`)

| Role | Token | Value |
|---|---|---|
| Page background | `--bg` | `#f2f2f7` |
| Accent | `--accent` | `#0071e3` |
| Primary text | `--text-1` | `#1d1d1f` |
| Success | `--green` | `#1c8a38` |
| Danger | `--red` | `#d70015` |

All other surface/border tokens scale appropriately; see `:root` vs `html[data-theme="light"]` in `index.html`.

### Usage rules

- Accent (`--accent`) is used for: focus rings, active states, filled CTAs, progress bars.
- `--green` is reserved for: done/complete states, shot timers running, success toasts.
- `--red` is reserved for: delete actions, destructive confirm buttons, error toasts.
- `--orange` is reserved for: saving indicator (`save-pill.saving`), warning states.
- `--tc` (timecode blue) is reserved for: timecode display and TC note text only.

---

## Typography

### Fonts

| Family | Variable | Weights | Usage |
|---|---|---|---|
| ThmanyahSans | `--font-body` | 300, 400, 500, 700, 900 | All UI copy |
| ThmanyahSerifDisplay | `--font-display` | 300, 400, 500, 700, 900 | Page h1, brand logotype, project titles, login heading |
| SF Mono / Menlo | monospace | — | Timecode values (`.tc-ts`) |

Fallback stack for Arabic: `ThmanyahSans, -apple-system, 'Geeza Pro', 'Arabic UI Text', 'Traditional Arabic', 'Helvetica Neue', Arial, sans-serif`

### Scale

| Name | Size | Weight | Usage |
|---|---|---|---|
| Hero h1 | 30px (28px mobile) | 700 | Home page title |
| Modal h2 | 18–22px | 600–700 | Modal and section headings |
| Card title | 17–18px | 600 | Project card name |
| Body | 14px | 400–500 | Default UI copy |
| Small | 13px | 400–500 | Secondary labels, buttons sm |
| Caption | 12px | 400–500 | Progress counts, timestamps |
| Micro | 11px | 400 | Tertiary metadata |

### Line heights

- Body and inputs: `1.55`
- Headings: `1.1–1.4`
- Teleprompter: `1.7` (reading optimised)

---

## Elevation

Three visual layers via backdrop-filter + surface tokens:

| Layer | CSS | Context |
|---|---|---|
| Page | `background: var(--bg)` | Raw page background |
| Cards | `surface-1` + `border` + `blur(10px)` | Shot cards, info cards, project cards |
| Topbar / overlay | `surface-2` + `saturate(180%) blur(20px)` | Sticky topbar, modals, sheets |
| Toast / highest | `surface-2` + `blur(20px)` + `box-shadow: 0 4px 28px rgba(0,0,0,0.35)` | Toast notifications |

### Z-index scale

| Layer | Z-index |
|---|---|
| Cards / content | 1 |
| Sticky shots header | 210 |
| Topbar | 300 |
| Columns dropdown | 500 |
| FCP / share modals | 700 |
| Login page | 900 |
| Custom dialog sheet | 9998 |
| Toast container | 9999 |

---

## Components

### Buttons

Three size variants, four style variants.

**Sizes**
- Default: `padding: 7px 15px`, `font-size: 13px`, `border-radius: var(--radius-sm)`
- Small (`.btn-sm`): `padding: 5px 12px`, `font-size: 12px`
- Mobile override: min-height 44px (default), 38px (sm) — WCAG touch target

**Variants**
- `.btn-filled` — solid `--accent` background, white text, glow shadow
- `.btn-green` — solid `--green` background, black text
- `.btn-glass` — `surface-2` background, `border` stroke
- `.btn-purple` — purple tint + border

**States**
- `:hover` — brightness filter or surface-3 background
- `:active` — `transform: scale(0.96)`
- `:disabled` — `opacity: 0.35`, no cursor, no shadow
- `:focus-visible` — `outline: 2px solid var(--accent)`, `outline-offset: 2px`

### Cards

**Project card** (`.proj-card`)
- `surface-1` + `border` + `border-radius: var(--radius-lg)` + `padding: 20px`
- Hover: lift `-3px`, `surface-2`, stronger shadow
- Active (touch): `scale(0.98)`
- Contains: title, status bar (scaleX progress fill), metadata footer

**Shot card** (`.shot-card`)
- `surface-1` + `border` + `border-radius: var(--radius-md)` + `margin-bottom: 10px`
- Done state: `rgba(48,209,88,0.04)` tint, green border
- Drag: `opacity: 0.38`

**Segment card** (`.segment-card`)
- Full-width collapsible container
- Header: `rgba(10,132,255,0.04)` tint, border-bottom
- Contains: shot cards (`.shot-card`)

### Progress bars

All progress fills use `transform: scaleX(ratio)` with `transform-origin: right` (RTL correct). Never `width: X%` — avoids layout triggers, enables GPU compositing.

```css
.p-fill { width: 100%; transform: scaleX(0); transform-origin: right; transition: transform 0.4s ease; }
```

### Toast system (`_showToast`)

Bottom-center, stacked column-reverse. Three types:
- Default — `surface-2` background, neutral text
- `.toast-error` — `rgba(255,59,48,0.14)` tint, red text
- `.toast-success` — `rgba(52,199,89,0.12)` tint, green text

Animation: `_toastIn` (translateY 10px → 0, opacity 0 → 1, 0.2s ease).

### Custom dialog (confirm / prompt)

Bottom sheet (`#_sheetOverlay` + `#_sheet`), replaces all browser `confirm()`, `alert()`, `prompt()`.
- Animation: `_sheetIn` (translateY 100% → 0, 0.28s ease)
- Escape key closes (confirm = false)
- Overlay click closes (confirm = false)
- Destructive confirm: `background: var(--red)` on confirm button

### Empty states

**Home page** (`.home-empty`) — shown when no projects, folders, or shared content exists.
- 56px icon, display heading, 2-line body, 2–3 CTA buttons
- Fades in via `pageFadeIn` animation

**Project page** (`#shotsEmpty`) — shown when a project has no segments.
- 48px icon, heading, body, two action buttons (Add Segment, Import Excel)

### Page transitions

`.page.active` triggers `pageFadeIn` animation (opacity 0→1, translateY 6px→0, 0.2s ease). Disabled under `prefers-reduced-motion`.

---

## Do's and Don'ts

### Do

- Use `--accent` for all primary interactive affordances (CTAs, focus, active states)
- Use `transform: scaleX()` on progress bar fills — never `width: X%`
- Use the `_showToast()` / `_showConfirm()` / `_showPrompt()` system for all user alerts — never `alert()`, `confirm()`, `prompt()`
- Use `_showToast(..., 'success')` for non-critical confirmations (copy, restore, duplicate)
- Use `_showToast(..., 'error')` for failures (network errors, invalid files)
- Wrap all Firebase writes in try/catch and show an error toast on failure
- Use `ThmanyahSerifDisplay` for page titles and section headings
- Maintain 44×44px minimum touch targets on all interactive elements (mobile override on `.btn`, `.btn-sm`)
- Keep all UI RTL: `dir="rtl"`, `text-align: right` by default, `transform-origin: right` on progress fills

### Don't

- Don't use `border-right/left > 1px solid` as a color accent on cards — use `background` tint instead (see blockquote rule: `background: var(--accent-glow)` + `border-right: 1px solid`)
- Don't use gradient text (`background-clip: text`)
- Don't use glassmorphism decoratively — only where it adds genuine depth (topbar, overlay modals)
- Don't use `position: absolute` dropdowns inside `overflow: hidden` containers — use `position: fixed` or body-level portals
- Don't use `alert()`, `confirm()`, or `prompt()` — they block the main thread and look wrong on iOS
- Don't hardcode colors outside of CSS tokens — always reference `var(--accent)`, `var(--red)`, etc.
- Don't add font-size below 12px — smallest legible size at 1x is 11px (micro captions only)
- Don't forget `prefers-reduced-motion` — all animations must have a fallback
