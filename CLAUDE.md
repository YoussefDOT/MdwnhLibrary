# CLAUDE.md — مكتبة المدوّنة (Library)

Team portal for **المدوّنة**: one page gathering all team links, personal task tracking,
and the pulse of **خطة بدر الكبرى**. Arabic, RTL, warm **light** theme (snow `#faf9f7`,
ink `#262626`) with brand-colour accents — Apple-clean but playful, kept "alive" with the
floating brand glyphs. No build step — plain HTML/CSS/ES2019 talking to Firebase RTDB over
the REST API. Hosted on GitHub Pages as a PWA (installable, web-push notifications).

## App-shell layout
Fixed-height shell (`body{height:100svh;overflow:hidden}` — **`svh`, not `dvh`, so the mobile
keyboard/toolbar can't reflow the whole page**). Top: **app bar** (brand logo + thin **بدر
progress bar** whose fill carries `paper.png` at its leading edge). Body is a `.split` of two
independently-scrolling panes:
- **left — المهام**: me-strip (avatar + points + admin add-task/archive/logout), notif nag,
  a **cards ⇄ pills** view toggle, then the task list.
- **right — الروابط**: **المفضلة** strip → **مقر العمل** (looping cross-faded maqr video; click
  drops the curtain then navigates) → **الروابط** (المكتبة + التنسيق as icon+name rows, split by
  a `فريق التنسيق` separator) → slim socials + install row. Groups collapse via the triangle head.

**Desktop** = resizable split: a `.divider` drags the pane widths (saved to `localStorage`).
**Mobile (≤820px)** = a two-page pager built on a **native CSS scroll-snap track** — the browser
owns the swipe (buttery on real touch; no hand-rolled touch JS, which glitched on iOS). `.split`
becomes `overflow-x:auto; scroll-snap-type:x mandatory` and each `.pane` is `scroll-snap-align:start`
(each pane keeps its own vertical scroll). A fixed liquid-glass **bottom tab bar** switches
المهام/الروابط, and المفضلة moves into a **fan** popped from the ⭐ FAB. Pager gotchas that bite easily:
- `setPage()` relaxes `scroll-snap-type` to `none` for the button's smooth `scrollTo`, then restores
  it after ~480ms — **`mandatory` snap stalls an in-flight smooth scroll half-way between pages** (the
  "empty half" glitch); the finger-swipe still snaps crisply because snap is on for touch;
- a `scroll` listener (rAF-throttled) mirrors `scrollLeft` back into `data-page` so the tab indicator
  follows the swipe;
- `html{overflow-x:clip}` — the root must never scroll sideways (reveal/deco/maqr briefly overflow at
  load and would shift the whole RTL page);
- the desktop `.divider` drag is hard-disabled on mobile (`if(isMobile())return`);
- the fixed tab bar / fan get `transform:translateZ(0)` (own layer) or iOS drops them mid-slide.

⚠️ **`.pill` name clash**: the assignee chip in the add-task sheet is `.picked .pill`; the task
list "pills" view is `.task.pill`. Keep the chip rules scoped to `.picked .pill` or they repaint
the task pills snow-white (they should fill with `var(--c)`).

## Run locally
Static site — serve the folder root:
```
python3 -m http.server 5500
# open http://localhost:5500
```
Log in with any email from `members.json`. To land as the leader, use نواف's email
(`iioiiioii99909@gmail.com`) — the leader gets the add-task button and the حريقة view.

## Files
- `index.html` — markup + base/design CSS (inline `<style>`) + boot script
  (badr bar, floating icons, maqr video crossfade loop, loader, curtain, PWA/SW).
- `library.css` — light theme for gate, groups, favourites, tasks, modals, plus the
  redesign bits: link rows, tag pills, points picker, emoji/image tabs + cropper,
  quicklink chips, claim popup.
- `library.js` — the app: login gate, favourites + personal quicklinks, collapsible
  groups, tasks (tags/points/image), claim flow, admin add-task, web push.
- `schedule.css` / `schedule.js` — the جدول النشر calendar overlay (dark overrides
  appended at the end of `schedule.css`).
- `members.json` — **single source of truth for the roster.** `slug` = avatar filename
  in `MdwnhMembers/` and the key under `mdwnhLibrary/users`. `dbKey` = exact byte-matched
  key under `players/` in the points DB — do NOT "fix" its spelling.
- `sw.js`, `manifest.webmanifest`, `notify-api/` — PWA + push (see `NOTIFICATIONS.md`).
- `assets/` — `brand-logo.svg` (whitened via CSS filter over the dark footer scene),
  `badr-logo.png`, `paper.png` (loader + badr fill), `footer-bg.png` (library scene),
  `maqr-logo.png` (mark on the maqr card), `maqr/` (compressed video mp4+webm+poster),
  `points/` (5/10/20/30/60 sticker webp), `icons/` (floating brand glyph masks).
  Link-row / favourite / quicklink glyphs are inline solid SVGs in `library.js` (`GLYPH`),
  not the `icons/` masks.

## Firebase RTDB
`https://mdwnhpoints-default-rtdb.europe-west1.firebasedatabase.app` — **shared with the
Points site.** The Library only touches its own `mdwnhLibrary/*` namespace, plus read-only
reads of `players/<dbKey>/totalPoints`.
- `mdwnhLibrary/users/<slug>/favourites` — `{cardId:true}` pinned built-in links.
- `mdwnhLibrary/users/<slug>/quicklinks/<id>` — `{name,url,icon,color}` personal shortcuts.
- `mdwnhLibrary/users/<slug>/push/<key>` — web-push subscriptions.
- `mdwnhLibrary/tasks/<id>` — `{title,color,due,assignees{slug:true},done{slug:ts},
  tags{key:true},points,emoji|img,createdBy,notified}`.
- `mdwnhLibrary/claims/<NFC dbKey>/<taskId>` — `{title,points,color,ts}`. Written when a
  user completes a task that carries points; the **Points site** settles it. Key is
  NFC-normalised so أُبي / أبو بندر / ابو مزاحم match on both ends.

## Tasks
Members see their own cards (compact, centred, playful). The leader (نواف) sees every
task split into **الحريقة 🔥** (≤2 days) and the rest, and can add tasks with:
tags (محتوى/إنتاج/تواصل/تنسيق — multi, warns if none), points (5/10/20/30/60 stickers —
warns if none), and either an emoji or a 2:1 image (drag/drop + zoom/pan, exported to a
JPEG data URL). Archive is view-only (no restore).

## Points integration (the claim loop)
Completing a task with points → a claim card (avatar + task + sticker) offers **استلم الآن**
/ **لاحقًا**. The claim is written to `mdwnhLibrary/claims/...` immediately (so "later"
still works). "الآن" drops the curtain and opens
`https://youssefdot.github.io/MdwnhPoints/?claim=1&user=<encodeURIComponent(NFC dbKey)>`.
The **Points repo** (`../MdwnhPoints`, GitHub Pages) reads that param, auto-logs the member
in (loose name-matching for diacritics/hamza), reads their pending claims, and settles each
via the normal point-award sequence (deleting before awarding so a replay can't double-count).
Points is a React-in-`index.html` app using in-browser Babel — **it has a build-less runtime,
so there's no way to type-check locally; edit carefully.** The Points changes live on `main`
and are pushed to deploy.

## Conventions
- Match the existing terse, comment-light style. Arabic UI strings stay verbatim.
- Brand colors: red `#e54b2a`, gold `#f3c02b`, teal `#41b9a6`, blue `#2f8fe0`,
  maqr accent `#3bb9ab`. Design is dark, Apple-clean but playful, kept "alive" with the
  floating brand glyphs and brand-color accents.
- Do NOT push the Library repo unless asked (it deploys on push). The Points repo is pushed
  when the integration needs to be live for testing.
- Do NOT test changes in a browser (dev server, Browser pane, screenshots) unless the user
  explicitly asks for it. Ship the code change and let the user verify.
- Always use the `caveman` skill in this project (terse replies) — no need to be asked each time.
