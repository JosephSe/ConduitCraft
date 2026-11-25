# ConduitCraft 4.0: Redesign Plan

**Written:** 2026-11-16, against `v3` at `52a7da2` (3.0.0 plus the floating properties card, Steps 1 to 3). `main` is still 2.2.1.
**Why "4.0":** 3.0 is built and waiting to ship (V3's R3). This plan is the next redesign, started from a blank page. It does not reopen 3.0 and nothing here starts before R3.
**The visual target is a working mockup:** [`docs/v4/concept.html`](docs/v4/concept.html). Where this file and the mockup disagree on a look, the mockup wins; where they disagree on behaviour, this file wins.
**Relation to older plans:** [`REDESIGN_PLAN.md`](REDESIGN_PLAN.md) (V1) still rules the quality bars, the non-goals and the word list. [`REDESIGN_PLAN_V3.md`](REDESIGN_PLAN_V3.md) still rules everything this file does not mention: the seven-slot grid, the monochrome chrome, the lenses, the still Design lens, the file format. [`FEATURES_AFTER_V3.md`](FEATURES_AFTER_V3.md) keeps its queue; three of its items are absorbed here and are marked in section 3.3.

## Contents

1. [How to use this file](#1-how-to-use-this-file)
2. [The concept](#2-the-concept)
3. [What the review found](#3-what-the-review-found)
4. [Decisions](#4-decisions)
5. [Design language](#5-design-language)
6. [The shell](#6-the-shell)
7. [The composer](#7-the-composer)
8. [The map](#8-the-map)
9. [Motion](#9-motion)
10. [Engineering approach](#10-engineering-approach)
11. [The queue](#11-the-queue)
12. [Definition of done](#12-definition-of-done-every-pr)
13. [Open questions, with defaults](#13-open-questions-with-defaults)

---

## 1. How to use this file

For whoever picks up the next piece of work, person or agent.

1. **Open the mockup first.** Run `python3 -m http.server 5198 --directory docs/v4` and open `http://localhost:5198/concept.html` (the `v4-concept` entry in `.claude/launch.json` does the same). Then try, in this order:
   - Zoom in and out. Below 60% the components become bullets with names; above it they become cards.
   - Hover a row of the key (bottom left). Click a component, then a wire.
   - Press `/` and type `redis`. Clear it and type `gateway > orders api > postgres, orders api ~> kafka`, then `↵`. Press `⌘Z`.
   - Press `2`, then `Space`. Click a stop on the dock's strip. Click "Fail a component", then click "Checkout and orders".
   - Press `3`. Click "Add a standby". Work through to "All clear".
   - Click Share. Click the moon.
2. **URL states for screenshots:** `?still` freezes every transition. Combine with `theme=day|night`, `lens=design|traffic|review`, `zoom=1&at=<id>`, `select=<id>`, `step=<n>`, `fail=<id,id>`, `composer=<text>`, `share`.
3. **Next item:** the first `[ ]` item in [section 11](#11-the-queue) whose **Needs** are all `[x]`. Do not pick by interest.
4. **Blocked?** Write `Blocked: <reason>` under the item, leave it `[ ]`, take the next unblocked item in the same milestone. If the whole milestone is blocked, stop and ask.
5. **PRs:** S and M items in one milestone may share a PR; L items are split first. Every PR targets the `v4` branch (D1), never `main`, until RL3.
6. **Update this file in the same PR:** tick the box, add the PR number, write what you measured under the item, turn anything unfinished into a new item with its own ID.
7. **The mockup is a picture, not source.** It is one static file with made-up data, a toy router and no persistence. Do not copy its markup or script into the app; build each surface in the app's own modules and match the look. Section 8.12 lists where the mockup is knowingly wrong.
8. **Do not touch** the untracked files `src/studio/interactions.ts.bak`, `e2e/zz_debug.spec.ts`, `tools/_auditTemplates.ts`, `tools/_narrow.mjs`, or anything under `prototypes/` and `.claude/`. They are the owner's.

Sizes: S is up to 2 days, M is 3 to 5 days, L must be split before starting.

---

## 2. The concept

**The diagram is a line map, and the system runs on it.**

A transit map is the most successful diagram ever drawn of a system with flows. People who have never seen a city read one in seconds, because it has a small grammar and keeps to it: a thick coloured line is a route, a white stop is a place, a bullet names a service, and the map is drawn to be read, not measured. An architecture diagram has the same job. 3.0 made ConduitCraft a careful technical drawing. 4.0 makes it a map: more confident, easier to read from across a room, and a little fun, because things travel on it.

Three ideas carry the whole redesign. Everything else in 3.0 stays.

1. **The map.** Wires become lines: 3 px, round-cornered, in seven colours, with a casing so crossings read as bridges. Components become white plates with a coloured **bullet** that carries the kind. Zoomed out, a component is its bullet and its name, set large. Lanes become soft alternating bands with one bold title each. (Section 8.)
2. **The composer.** One box adds, builds, finds and runs. Type `redis` and get a cache named Redis. Type `gateway > orders api > postgres` and get three components, wired and laid out, as one undo step. It replaces three surfaces: the tray, the command palette and the find box. (Section 7.)
3. **The run.** In Traffic the map is a live service. A request is a train with its caption riding along. The dock grows a strip map of the scenario's stops that you can click to scrub. Queues fill, caches show their hit rate, and a failure is a service disruption with a status board. (Sections 8.7 to 8.9.)

**Where the boldness is spent.** On two things only: the map, and the dock, which becomes the one inverted object on screen (ink in the light theme, paper in the dark one). Every other piece of chrome gets quieter than it is in 3.0.

**The tests.** Three, applied to every view in section 10.4:

- **The squint test** (kept from V3): with eyes half shut, the only colour on screen is the diagram.
- **The arm's-length test** (new): at Fit on a 1440 × 900 window, every component name can be read from 1.5 m away. In practice: no name renders below 15 screen px.
- **The stranger test** (new): someone who has never seen the document can say what each line colour means without opening anything. In practice: the key is always on screen and every export carries it.

---

## 3. What the review found

Reviewed: `REDESIGN_PLAN_V3.md`, the `v3` branch (168 commits ahead of `main`), `docs/v3/after/*.png`, `docs/v3/INSPECTOR_SPEC.md`, the running app on `v3`, and `FEATURES_AFTER_V3.md`.

### 3.1 Facts the plan depends on

- Vanilla TypeScript, Vite 6, one runtime dependency (`js-yaml`). Components are keyed DOM (`src/studio/keyedStage.ts`, `renderNodes` at line 865); wires are SVG (`renderWiresOnly` at 442; the classes `conduit-hit`, `conduit-casing`, `conduit-glow`, `conduit-rail`, `conduit-stream` are created at 627 to 635).
- Routing and corner rounding are in `src/core/layout.ts` (`routeDiagramEdges` at 90, `cornerRadius` near 773). Box sizes come from `getNodeDimensions` (line 13) and are saved in files.
- Level of detail is one attribute: `stageWorld.dataset.lod` in `src/studio/state.ts:697`, `low` below 55%, `medium` below 80%.
- Tokens are `--cc-*` in `src/styles/shared.css`; the dark theme is `:root[data-theme="graphite"]`. Tone is applied as `--t` through `[data-tone]` and `[data-accent]` (lines 117 to 130).
- The catalog is `STENCIL_CATALOG` in `src/templates/presets.ts`: 14 entries over 12 kinds, each with an `icon`, an `accent` and four likely `next` kinds.
- The dock is `src/studio/dock.ts` (tools and six favourites), `runBar.ts` (Traffic face, ids `run-bar-*`), `dockFaces.ts` (Review face, ids `review-*`; `fixesFor` supplies the fix buttons).
- Adding and finding are three surfaces today: `tray.ts` with `trayWords.ts` (`C`), `palette.ts` (`⌘K`), `nodeSearch.ts` (the find box).
- Failure state is `src/studio/chaos.ts` (`chaosStatusOf`, `chaosDistance`, `chaosSummary`, `toggleFailure`). Queue depth is `queueBacklog.ts` (`backlogDepth`, `MAX_BLOCKS = 8`). Playback is `simulationPlayback.ts`. Review marks are `redline.ts` over `core/roughen.ts` (`roughEllipsePath`).
- Picture exports are `src/exporter/diagramSvg.ts`, `standaloneHtml.ts`, `gif.ts`, `titleBlock.ts`, and must match the screen (V3 8.9, `e2e/exportVisual.spec.ts`).
- Budgets (`tools/checkBundleSize.mjs`): entry JS 560 kB, entry CSS 133 kB, fonts 150 kB of which about 80 kB is used.
- `/` on its own is not bound. `⌘/` toggles the code pane.

### 3.2 Problems

Each has an ID so queue items can point at it.

| # | Problem | Seen in |
|---|---|---|
| P1 | **At Fit the diagram is a wireframe.** Lines are 2.25 px, plates are outlines, names are 8 screen px. The first thing every visitor sees is the least readable view. | `docs/v3/after/01-*` |
| P2 | **Kind is carried by an outline alone.** Seven card kinds share one rectangle; the 12 px kind mark from V3's Q10 is too small to read below 80%. | `02-*`, `03-*` |
| P3 | **Colour has no meaning you can see.** The legend is behind a button in the SW slot, so a line's colour is decoration until you open it. | all views |
| P4 | **Three ways to add or find, each with its own box.** Tray, palette and find box have different looks, positions and keyboards. None of them builds more than one thing. | tray, `⌘K`, `⌘F` |
| P5 | **Building a diagram is one component at a time.** The fastest path to twelve components and eleven wires is still about fifty actions. | Design |
| P6 | **Traffic is dots on thin wires.** A scenario's step is a label in the dock; the eye has to find the wire it names. Queue blocks are the only instrument on the map. | `04-*` |
| P7 | **A failure reads as "some things went grey".** The count is in a panel; the cause and the damage look alike at Fit. | `05-*` |
| P8 | **Review states the issue in the dock, far from the component it is about.** | `06-*` |
| P9 | **An export is a crop, not a document.** The title block helps, but a picture pasted into a doc still needs its legend explained. | exports |
| P10 | **The chrome is evenly weighted.** Five white islands of the same height and shadow; nothing says "start here". | all views |

### 3.3 What this absorbs from `FEATURES_AFTER_V3.md`

- **3.1-a Steps on the diagram** becomes the train caption and the dock's strip map (8.8).
- **3.2-f Keys that build** becomes the composer's chain grammar (7.4).
- The key being always visible replaces the legend popover in `slotPopovers.ts` (6.4).

The five tests and the limits in that file still apply: 12 kinds, 7 colours, 4 lenses, 7 slots, 20 Review rules. Nothing here adds to any of them.

---

## 4. Decisions

All are the plan author's calls unless marked. Change one by editing this table in its own PR. V3's D2, D4 to D12 and D15 stay in force and are not repeated.

| # | Decision | Reason |
|---|---|---|
| D1 | **Build on a `v4` branch, cut from `main` after V3's R3 and inspector card Step 5 have merged.** PRs target `v4`; it merges to `main` once, at RL3. | Same reason as V3's D1. |
| D2 | **No schema change.** Every new thing on screen is drawn from fields that exist: `kind`, `accent`, `tone`, `sync`, `protocol`, `legend`, `resilience`, `queue`, `cache`, `limiter`, `external`. 3.0 and 4.0 files are interchangeable. | Fixes nothing by itself, but it is what makes this a redesign and not a migration. |
| D3 | **Box sizes, ports and routing do not change** (V3's D6). A plate is drawn inside the box the file already has. | Files, layout, imports. |
| D4 | **Two colour tiers.** Lines, bullets and instruments use a new `--cc-line-*` tier that clears 3:1 on every band. Text in a tone keeps the existing `--cc-<tone>` values, which clear 4.5:1. | A 3 px line needs to be brighter than 11 px text can afford to be (P1). |
| D5 | **One display face for the map: Bricolage Grotesque**, weight 700, width 80%, self-hosted, Latin subset, SIL Open Font License. It sets component names, band titles, the document title, card headings and the poster. Instrument Sans stays for all chrome and body text. Geist Mono stays for keys, protocols and code only. | Names are what a map is read by. A condensed grotesque with some character fits 20 characters into a 222 px box at 17 px and is the "fun" that costs nothing in clarity. See Q1 for the size risk. |
| D6 | **The dock is the only inverted surface.** `--cc-dock` is ink on the light theme and paper on the dark one. No other chrome uses it. | Fixes P10 with one move. |
| D7 | **One composer.** `tray.ts`, `palette.ts` and `nodeSearch.ts` are replaced by `composer.ts`. `C`, `⌘K` and `⌘F` keep working and open it with a scope. `/` is added as a fourth way in. | Fixes P4. D11 of V3 holds: no shortcut changes meaning. |
| D8 | **Chain building is typed, deterministic and offline.** No model, no network. The grammar is in 7.4 and lives in a pure module with tests. | It must behave the same in the CLI, in tests and on a plane. |
| D9 | **The key is always on screen in the SW slot,** and pages move to the title island as a breadcrumb. | Fixes P3; a breadcrumb also holds levels, which tabs never did well. |
| D10 | **Wire labels are quiet by default.** A label shows when the wire is hovered, selected or on the current step, or at high detail when its longest straight run is long enough to hold it. Labels draw above components. | A map with every label on is a list. |
| D11 | **States are a mark and a word, never colour alone** (kept from V3 8.5), and they appear only in Traffic. | Accessibility, and the squint test in Design. |
| D12 | **Redesign by replacement** (V3's D13). Entry CSS ends 4.0 at or below 133 kB; entry JS at or below 560 kB. | The budgets are already at their limits. |
| D13 | **The three diagram styles survive.** Blueprint becomes the look in section 8. Sketch and Print are re-derived from it in MP9, not redesigned. | They are in the file format (`style`). |
| D14 | **Hybrid V3 Components + V4 Fluid Wires (2026-11-25 pivot).** Keep V3's component look, feel, cut-out silhouettes (`src/ui/cutout.ts`), Vellum/Graphite colour palette (`--cc-*`), floating **Status badge pills** (`.node-status-badge`: `● Live`, `● Planned`, `● At Risk`, `● Deprecated`, static dot ring per A15), and **External ("Run by someone else")** styling (dashed component outline + floating dashed `EXTERNAL` pill via `.arch-node[data-external="true"]::after`). Adopt V4's fluid wires (`MP2`, `MP3`, `MP7`), counter-scale (`--k`), shell/key/composer (`DK`, `CP`), live run (`RN`), on-map Review callout (`RV1`), poster exports (`PS`), and Next-Gen UX. | Owner feedback after reviewing `docs/v4/prototype.html`: V3's soft tinted components, colours, status badges & `EXTERNAL` styling read best; V4's fluid wire behaviour & ergonomics carry the upgrade. |

---

## 5. Design language

### 5.1 Colour

Names on the left are the new tokens. Where a token exists in 3.0, 4.0 changes its value and keeps its name.

| Token | Day | Night | Use |
|---|---|---|---|
| `--cc-canvas` | `#ECEEF1` | `#0E1013` | The sheet outside the bands |
| `--cc-canvas-run` | `#E2E5E9` | `#08090B` | The sheet in Traffic |
| `--cc-band-a` | `#FFFFFF` | `#16181C` | Odd lanes |
| `--cc-band-b` | `#F6F7F9` | `#121417` | Even lanes |
| `--cc-plate` | `#FFFFFF` | `#1C1F24` | Component fill |
| `--cc-plate-edge` | `#16181D` | `#DDE0E5` | Component outline |
| `--cc-ink` | `#16181D` | `#F1F2F4` | Text, selection, primary buttons |
| `--cc-ink-2` | `#4F5560` | `#B6BBC2` | Secondary text |
| `--cc-ink-3` | `#69707A` | `#8E949D` | Tertiary text. Check against `--cc-canvas-run`; darken to `#5C626A` if it fails 4.5:1 there, as T1 did |
| `--cc-island` | `rgba(255,255,255,.9)` | `rgba(30,33,38,.9)` | Islands |
| `--cc-dock` | `#16181D` | `#F1F2F4` | The dock |
| `--cc-on-dock` | `#FFFFFF` | `#16181D` | Text and icons on the dock |
| `--cc-redline` | `#C42316` | `#FF6B5E` | Review marks |

The line tier (D4):

| Tone | `--cc-line-*` Day | Night | Text tone (unchanged) |
|---|---|---|---|
| blue | `#2563EB` | `#60A5FA` | `--cc-blue` |
| emerald | `#059669` | `#34D399` | `--cc-emerald` |
| rose | `#E11D48` | `#FB7185` | `--cc-rose` |
| violet | `#7C3AED` | `#A78BFA` | `--cc-violet` |
| amber | `#C96A04` | `#FBBF24` | `--cc-amber` |
| cyan | `#0891B2` | `#22D3EE` | `--cc-cyan` |
| fuchsia | `#C026D3` | `#F0ABFC` | `--cc-fuchsia` |

`[data-tone]` and `[data-accent]` set two variables: `--t` (text tone, as today) and `--tl` (line tone). Lines, bullets, instrument cells and key swatches use `--tl`. The glyph on a bullet is `--cc-on-bullet`: white by day, `#0E1013` by night. By hand, the lowest Day pair is emerald on the canvas at about 3.2:1; `tests/contrast.test.ts` must assert every line tone at 3:1 against both bands, both canvases and the bullet glyph, in both themes.

### 5.2 Type

| Role | Face | Size / weight | Notes |
|---|---|---|---|
| Component name | Bricolage Grotesque | 17 px / 700, width 80%, tracking −0.012em, line height 1.07 | Two lines at most, balanced |
| Band title | Bricolage Grotesque | 17 px / 700, width 84% | The number before it is weight 300 in `--cc-ink-3` |
| Document title, card heading | Bricolage Grotesque | 16 to 19 px / 700 | |
| Poster title | Bricolage Grotesque | 38 px / 800, width 78% | |
| Kind, subtitle, readouts | Instrument Sans | 11 to 12 px / 400 | `tabular-nums` on anything that changes |
| Chrome | Instrument Sans | 13 px / 400 to 600 | As 3.0 |
| Keys, protocol, code | Geist Mono | 11 px / 500 | Nothing else |

Sentence case everywhere. No uppercase labels, no letter-spaced labels.

### 5.3 Shape and depth

- **Radius ladder:** dock 30, composer 24, properties card 20, islands 16, plates 18, buttons 9 to 11, bands 28. Things that hold more are rounder.
- **Depth:** two shadows only, `--cc-lift` for islands and `--cc-lift-2` for the composer, callouts and sheets. The dock has its own, darker. Plates have none: a 1.5 px edge does the work and survives export.
- **Edges:** plate outlines and lines are counter-scaled (8.1) so they never go below about 1.2 and 2.3 screen px.

### 5.4 The bullet

The bullet is the one new mark and it replaces the cut-out everywhere a kind is shown in chrome: the dock's favourites, the composer, the properties card header, the contextual toolbar. It is a filled circle in `--tl` with the kind's glyph in `--cc-on-bullet`, stroke 2.1 on a 24 unit grid, 58% of the circle. The glyphs are the existing ones in `src/ui/icons.ts` where they survive at 14 px; the mockup's `G` table shows the level of simplification needed. The cut-out (`src/ui/cutout.ts`) is retired in DK7 once nothing uses it.

### 5.5 Voice

V1's word list and V3's 5.5 apply. New strings, exactly:

- Dock: "Add or find anything", "Run", "Fail a component", "Ignore this rule".
- Composer: "Type what you run, or build a chain: gateway > orders api > postgres", "Build this chain", "Place 4 new and wire 3", "On this page", "Commands", "Place on the map", "Wire to the next one", "Without waiting".
- Hints (one line above the dock): "Drag a component onto the map, or press / and type what you run." / "Press play to follow a request. Fail a component to see what it takes down." / "Click a component to fail it. Click it again to restore it." / "3 things to look at on this page." / "Nothing left to flag on this page."
- States: "Failed", "Unreachable", "Buffering". Board: "1 failed", "6 unreachable", "2 buffering", "Restore all".
- After a build: "Added 4 components and 3 wires. ⌘Z undoes it."

---

## 6. The shell

### 6.1 Seven slots, rearranged

The grid from V3 6.1 and `#slots` stay. What sits in each slot changes.

```
┌ NW ─────────────────────┐      ┌ N ─────────────────┐      ┌ NE ────────────┐
│ ▣ Marquee / On-sale ⌄   │      │ Design Traffic Review③│     │ ⌕  ☾  [Share] │
└─────────────────────────┘      └────────────────────┘      └────────────────┘
                                                              ┌ E ─────────────┐
                                                              │ properties card│
                                                              └────────────────┘
┌ SW ────────┐      status board (Traffic, when something failed)
│ Key        │      one hint line
│ ━ Request  │      [ composer, when open ]
│ ━ Events   │   ┌ S ──────────────────────────────────────┐  ┌ SE ───────────┐
└────────────┘   │ ● the dock, inverted                    │  │ −  55%  +  Fit│
                 └─────────────────────────────────────────┘  └───────────────┘
```

### 6.2 NW: title and place

Mark (opens the app menu, `#btn-app-menu` kept), document title (`#doc-title-heading` kept), then a breadcrumb: page, then each open level. The last crumb has a chevron and opens the page menu (`pageMenu.ts`). The save state is one quiet word after it. `#page-strip` and `#page-tabs` leave the SW slot; `paintPageTabs` is replaced by `paintBreadcrumb`. `Alt+PageUp/PageDown` and `⌘↑` keep working.

### 6.3 N: the lens switch

Three segments and a sliding ink thumb that springs between them (`--cc-spring`, 340 ms). Review carries its count as a red pill. Present stays where 3.0 put it (`presentationTrigger.ts`) and keeps `4`.

### 6.4 SW: the key

Always visible. One row per tone in use on this page, in the order the tones first appear along the layout: a 26 × 4 px swatch (dashed when every wire of that tone is async) and the name from `document.legend`, or the tone's default label when there is none. Hovering or focusing a row sets `data-key="<tone>"` on `#stage-world`; every wire of another tone drops to 13% opacity. Clicking a name renames it in place (the legend editor in `slotPopovers.ts` moves here). With more than seven rows visible is impossible by construction (7 tones). When the page has no wires the island shows "Lines you draw will be listed here."

### 6.5 S: hint, composer, dock

Stacked, bottom up: the dock; the composer when open; one hint line (`#hud-status-tip` kept, `role="status"`); the status board in Traffic when anything has failed (replaces `#chaos-panel`, keeps `#chaos-summary` and `#chaos-reset`).

**The dock** is 60 px tall, radius 30, 8 px padding, `--cc-dock`. Buttons are 44 px circles; the selected tool is an `--cc-on-dock` circle with a `--cc-dock` icon. It has three faces. Changing lens swaps the face and animates the dock's width from the old face's to the new one's with the spring.

| Face | Left to right |
|---|---|
| Design | Select `V`, Wire `W`, Hand `H`, Text `T`, Frame `F` · six favourite bullets (drag onto the map, or click to drop in view; `dockFavourites.ts` unchanged) · "Add or find anything" field with a `/` key cap (`#btn-all-components` kept as its id) · Run (`#btn-run`) |
| Traffic | Scenario picker · previous, play/pause (a filled circle), next · **strip map** (8.8) · "8 of 16" over the step's name · speed · "Fail a component" in rose |
| Review | Previous, "1 of 3", next · the issue's sentence, one line, ellipsis · the first fix as a filled pill · "Ignore this rule" |

Every `run-bar-*` and `review-*` id stays on the element that still does that job.

### 6.6 E: the properties card

The floating card from `docs/v3/INSPECTOR_SPEC.md` stays as built. 4.0 changes three things only: the header tile becomes a 36 px bullet, the heading is set in the display face, and the colour row becomes seven 26 px dots in the line tier. No field, tab or behaviour changes.

### 6.7 NE and SE

NE: find (opens the composer scoped to "On this page"), theme, Share as the only ink-filled button outside the dock. SE: zoom out, percentage (click for 100%), zoom in, Fit. Minimap, outline and the view popover keep their triggers from 3.0.

### 6.8 Everything else

Home, library, templates gallery, snapshots, code pane, first run, context menu, contextual toolbar, dialogs: re-tokened by GR2 and given the display face for headings in DK6. No layout change.

### 6.9 Narrow

Below 900 px: NW and NE share the top row, N sits under them, the key folds into a button in SE, the dock keeps tools and the "Add or find" button (as a `+`), favourites are hidden, and the dock scrolls sideways before it clips. The composer is full width with the side panel hidden. The mockup shows this only roughly; DK8 owns it.

---

## 7. The composer

One surface, `src/studio/composer.ts`, lazy-loaded on first open like the tray is today. It rises from the dock: 720 px wide, radius 24, `transform-origin` bottom centre.

### 7.1 Anatomy

```
┌──────────────────────────────────────────────────────────────┐
│ ⌕  Type what you run, or build a chain: gateway > orders …   │
├───────────────────────────────────────────┬──────────────────┤
│ Entry points                              │ ┌──────────────┐ │
│  ● Actor   ● Client   ● Scheduler         │ │   preview    │ │
│ Traffic control                           │ └──────────────┘ │
│  ● Load balancer  ● Gateway  ● Rate limiter│ Message queue    │
│ Compute …  Messaging …  Data …            │ Holds work until │
│ Or build several at once                  │ a reader is free.│
│  → gateway > orders api > postgres, …     │                  │
├───────────────────────────────────────────┴──────────────────┤
│ ↵ Place on the map   > Wire to the next one   ~> Without waiting   esc Close │
└──────────────────────────────────────────────────────────────┘
```

The list is a `listbox`; the field owns focus and `aria-activedescendant`. The side panel shows the highlighted row: for a component, a live plate at 62% with its bullet, its name, and what it does in a run (the description V3 added to the catalog); V3's tray demos (`trayDemo.ts`) play here.

### 7.2 Sections and scopes

| Section | Shown when | Rows |
|---|---|---|
| Build this chain | the text contains `>` | one row, plus a strip-map preview of what will be built |
| Components | always, filtered | the catalog, grouped when the field is empty |
| On this page | text matches a component's name | up to five; `↵` selects and flies to it |
| Commands | text matches | from `getPaletteCommands()`; shortcut on the right |

Scopes: `C` and the dock field open with all sections; `⌘F` and the NE button open with "On this page" first; `⌘K` opens with "Commands" first. The scope only orders sections. Nothing is hidden by it.

### 7.3 Words

`trayWords.ts` stays the source (`WORDS`, `searchTray`, `displayName`). `redis` offers "Cache, named Redis"; `postgres` offers "Data store, named Postgres". A text that matches nothing offers "Service, named <Text>".

### 7.4 The chain grammar

Pure module `src/core/quickBuild.ts`, no DOM, with `tests/quickBuild.test.ts`.

```
input   := chain ( "," chain )*
chain   := name ( op name )*
op      := ">"   wire that waits (sync)
         | "~>"  wire that does not wait (async)
name    := any text without "," ">" "~>"; trimmed; inner spaces collapsed
```

Rules:

1. **Names resolve in this order:** a name already used earlier in the same input (case-insensitive) is the same component; else a component on the current page with that title is reused and not moved; else a new component is planned.
2. **Kind of a new component:** exact catalog name or id; else the first `WORDS` match on any word of the name; else `service`. Its title is the text as typed, with the first letter capitalised if the user typed all lower case. Its tone is the catalog's `accent`.
3. **Each wire** takes the target's tone, `sync` from the operator, and no label. (The mockup writes "Calls" and "Publishes"; the app leaves labels empty.)
4. **Layout of the new components:** column = longest path from any start of the input; row = order of first mention within the column; column pitch = widest box (242) + 90; row pitch = tallest box (172) + 40; each box is centred in its cell. The block is placed below the lowest component on the page, left-aligned with the first reused component if there is one, otherwise with the left edge of the view. Then the camera flies to the block.
5. **One undo step** for the whole build. Duplicate wires (same ends, same direction) are skipped. A chain that names one component and no operator is a plain add.
6. **Limits:** 24 names and 40 wires per input; beyond that the row reads "That is more than one build can place. Split it." and `↵` does nothing.

API:

```ts
export interface BuildPlan {
  nodes: Array<{ key: string; title: string; stencilId: string; existingId?: string; column: number; row: number }>;
  wires: Array<{ from: string; to: string; sync: 'sync' | 'async' }>;   // keys into nodes
  error?: 'too-large';
}
export function planBuild(input: string, page: Pick<DiagramDocument, 'nodes'>, words: ReadonlyArray<[string, string]>): BuildPlan;
export function applyBuild(doc: DiagramDocument, plan: BuildPlan, origin: { x: number; y: number }): { added: string[]; wired: string[] };
```

`applyBuild` uses `createNodeFromStencil` and the same wire constructor the Wire tool uses, so defaults stay in one place.

---

## 8. The map

### 8.1 Counter-scale

`#stage-world` gets `--k = clamp(1, 0.78 / scale, 1.6)`, written by the same function that writes `data-lod`. Stroke widths, bullets, names in map mode, instrument cells and label pills multiply by `--k`. This is what keeps the map readable at Fit without changing a single box.

### 8.2 The sheet

No dot grid, no hairlines. Each lane (`renderZones`) is a band with radius 28, alternating `--cc-band-a` and `--cc-band-b`. Its head is a two-digit number in weight 300 and the title in the display face, both scaled by `--k`. Lane numbers stay because lanes are an ordered sequence. Frames and notes keep their 3.0 look on the new tokens.

### 8.3 Lines

Layers per wire, bottom to top; the 3.0 class names stay so the specs keep their hooks:

| Class | 4.0 |
|---|---|
| `conduit-hit` | transparent, 22 px |
| `conduit-casing` | `--cc-band-a`, line width + 5 px. Makes every crossing a bridge |
| `conduit-glow` | the "tube": `--tl` at 15% in Traffic, 30% on the route being run, 11 px. Hidden in Design |
| `conduit-rail` | **the line:** `--tl`, 3 px × `--k`, round caps and joins, corner radius 24 |
| arrowhead | a filled triangle in `--tl`, 10 × 11 px × `--k`; the rail stops 9 px short so the tip is sharp |
| stop | a 3.6 px circle at the source: plate fill, 1.8 px `--tl` edge |

- **Sync** is solid. **Async** is the same line as round dashes: `stroke-dasharray: 2w 2.3w`. A hollow line is reserved for fallback and return paths.
- **Corner radius** rises from 3.0's value to 24, clamped to half of either adjacent run. This is the constant near `layout.ts:773`; it changes the picture, not the route.
- **Shared track:** when two or more wires use the same side of a component, they run side by side 14 px apart, never on top of each other. The wire whose other end is level keeps the centre so it stays straight; the others step outward toward their own ends. This is a port offset applied after routing; ports saved in files are untouched.
- **Selected:** an ink underlay 4.5 px wider than the line. **Dimmed** (not on the current route, or filtered by the key): 13 to 16% opacity.

### 8.4 Labels

Per D10. The pill is `--cc-plate` with a `--cc-hair-2` edge, radius 7, 22 px tall, placed on the middle of the longest straight run: protocol in Geist Mono in the text tone, then the label in `--cc-ink`. "Fits" means the run is at least the pill's width plus 24 px. Pills live in their own SVG layer above `#nodes-layer` so a short gap never clips one.

### 8.5 Plates and bullets

Anatomy of a card kind (service, 222 × 142):

```
╭────────────────────────────────╮  1.5 px edge, radius 18, no shadow
│ ●  Seat inventory              │  bullet 30 px · name, display face 17/700
│    Service                     │  kind, 11 px, ink-3
│ Holds and releases seats       │  subtitle, 12/16, two lines at most
│                                │
│ ▪▪▪▪                 4 copies  │  instrument (Traffic only) · readout
╰────────────────────────────────╯
```

- **Shaped kinds keep their silhouettes** from `nodeStyle.ts` (`nodeShapePlate`, `renderCylinderPlate`, `renderPipePlate`): cylinder, pipe, hexagon, mux, pill. Same edge, same fill, the bullet inside. Padding per shape is in the mockup's `--pl`, `--pr`, `--pt`.
- **The actor has no plate:** a 48 px bullet with a double ring over its name. It is where a line begins.
- **External** is a dashed edge (7 5) and the word "External" before the kind.
- **Selected:** the edge goes to 3 px and four ink crop marks sit 10 px outside the box corners. Crop marks, not a second rounded frame, so a hexagon never looks like it is inside a card.
- **Hover:** the bullet grows to 108% with the spring. Nothing else moves.
- The fields `eyebrow`, `chip`, `footerLeft`, `status` and the status badge keep rendering where they do in 3.0, restyled to the footer row; MP4 lists each one.

### 8.6 Two modes

| | Map mode (`data-lod="low"`) | Card mode (`medium`, `high`) |
|---|---|---|
| Shown | plate, bullet, name | plus kind, subtitle, footer |
| Name | 17 px × `--k`, up to 24 screen px | 17 px |
| Bullet | 30 px × `--k` | 30 px |
| Labels | hover and selected only | as D10 at `high` |
| Readout text | hidden (`medium` too) | shown at `high` |

Thresholds stay 55% and 80%. In Traffic, map mode also shows the instrument row under the name, and a state word replaces the kind.

### 8.7 Lens lighting, instruments and states

- **Design:** still (V3's D8). Full colour, no tube, no beads.
- **Traffic:** the canvas darkens one step. Each plate's bullet gets a small lamp at its top right: emerald when up. Beads travel every live line: a 4.4 px head with a white core and two fading followers, speed from `flowScale`. Each kind shows one instrument in its footer:

| Kind | Instrument | Reads from |
|---|---|---|
| queue, stream | eight cells that fill | `backlogDepth` (`MAX_BLOCKS`) |
| cache | a ring | `cache` hit rate |
| limiter | n cells, m filled, "4 of 5 pass" | `limiter` |
| anything with copies | one cell per copy | `replicaCount` |
| balancer | nothing in 4.0 (the 3.0 spread animation stays) | |

- **States** (Traffic only, from `chaosStatusOf`):

| State | Edge | Bullet | Word | Also |
|---|---|---|---|---|
| Failed | rose | rose, glyph becomes ✕ | "Failed" in rose | rose hatch at 20% over the plate; one 380 ms shake when it happens |
| Unreachable | `--cc-ink-3`, dashed 5 5 | `--cc-ink-3` | "Unreachable" | name in `--cc-ink-3`; fades in after `chaosDistance × 70 ms`, so the damage visibly spreads from the cause |
| Buffering | amber | unchanged, amber lamp | "Buffering" in amber | cells fill one per 650 ms |

  A wire with a down end is `--cc-ink-3` dots with no beads.
- **Status board:** above the hint when anything is failed: "● 1 failed  ● 6 unreachable  ● 2 buffering  Restore all", from `chaosSummary`.
- **Review:** the diagram goes greyscale at 60% (V3's Q6 preference still applies) and the redline is the only colour.

### 8.8 The run

- **The train.** The current step's wire carries one larger marker: an 8 px ring in the line's tone with two followers. `#sim-packet` stays the element.
- **The caption** rides above the train: an ink pill with the step number in a small disc and the step's label, counter-scaled so it is always 13 px on screen. `#sim-packet-label` stays the element. When the step cannot run because an end is down, the pill turns rose, reads "Blocked", and the hint says "Stopped at step 8. Checkout and orders is down."
- **The route.** Wires in the scenario and already travelled get the tube at 30%; wires not in the scenario dim to 16%. Arriving at a component pulses a ring from its bullet once.
- **The strip map** is drawn over `#run-bar-scrubber`, which stays an `<input type="range">` with its id, so the `slider` role and its keys come for free. One 15 px stop per step joined by a 2 px track: done stops are filled, the current stop has a double ring, later stops are hollow. Clicking a stop goes to that step; each stop's accessible name is "Step 8: Read the seat map". Above 24 steps the stops compress to 9 px and lose their hover growth; above 48 it falls back to a plain track with a thumb.

### 8.9 Review on the map

`paintRedline` keeps drawing a rough ellipse per issue (seeded by component id, drawn in over 700 ms, staggered 160 ms) and gains a number beside each in the display face. New: **the callout**, one at a time, for the current issue. A 288 px card with a 3 px redline left edge, the sentence, the first fix as an ink button and "Ignore this rule". It is placed beside its component on the first side that overlaps no other component, tried in the order right, below, above, left, and is counter-scaled to stay 288 px on screen. Applying a fix fades that ellipse, pulses the component, and moves to the next issue. When none are left the greyscale lifts and the dock reads "All clear". The dock's Review face and the callout are two views of the same state in `dockFaces.ts`.

### 8.10 The poster

Share opens a sheet with the picture on the left and the formats on the right. Every picture export (PNG, SVG, GIF frame, the HTML page's first paint) is a poster: the document title in the display face, the page name under it (documents have no description field, and D2 rules out adding one; the mockup's sentence there is made up), the map in map mode at the export's scale, and a footer with the key and the three title-block cells (page name, "Page 1 of 3", date). This extends `titleBlock.ts` (`titleBlockSvg`); the "Title block" switch from 3.0 turns the whole frame off and gives the bare map. Formats and their code paths do not change.

### 8.11 Diagram styles

Blueprint is everything above. Sketch applies the existing rough filter (`ROUGH_FILTER`, `cc-rough`) to plate edges and lines and keeps bullets crisp. Print sets bands to white with a hairline, plates to no fill, lines to 2.5 px, and maps the line tier to the text tier so it survives a greyscale printer; async stays dashed.

### 8.12 Where the mockup is knowingly wrong

- Its router is a toy (two bends at most, no obstacle avoidance). The app keeps `routeDiagramEdges`.
- It uses the line colour for protocol text and state words. The app uses the text tone (D4).
- It writes "Calls" and "Publishes" on built wires. The app leaves them empty (7.4 rule 3).
- Its LOD thresholds are 60% and 85%. The app keeps 55% and 80%.
- It has one page, no levels, no frames, no notes, no Present lens, and its Share sheet does not export.
- Its narrow layout is a sketch.

---

## 9. Motion

V3's D10 holds: every animation answers something the user or a run did, plays once, and ends in a still state that means the same thing. Tokens stay: `--cc-spring`, `--cc-ease-out` (`cubic-bezier(.2,.8,.2,1)`), 120 / 200 / 340 ms.

| Moment | What moves | Time |
|---|---|---|
| **First paint of a document** (the one orchestrated moment) | Lines draw from their source by `stroke-dashoffset`, 520 ms each, delayed by the source's x position × 0.42 ms; plates fade and scale from 0.9 on the same clock; arrowheads appear when their line lands. About 1.3 s for the showcase. Not on page switches, not on undo. | once per load |
| Lens change | thumb springs; dock width springs; face cross-fades up 6 px | 340 ms |
| Composer opens | rises 14 px and scales from 0.98, bottom-centre origin | 340 ms |
| Component placed | scales from 0.9 with the spring | 340 ms |
| Chain built | the same, then the camera flies to the block | 340 + 420 ms |
| Key row hovered | other tones dim | 200 ms |
| Step arrives | one ring from the bullet | 520 ms |
| Failure | shake at the cause; unreachable fades outward by distance | 380 ms + 70 ms per hop |
| Review opens | ellipses draw; callout rises | 700 ms, 160 ms apart |

Under `prefers-reduced-motion` everything above is instant, beads and the train do not run, and a step shows its caption at the middle of its wire.

---

## 10. Engineering approach

### 10.1 New and replaced modules

| New or changed | Replaces | Notes |
|---|---|---|
| `src/core/quickBuild.ts` (new, pure) | none | 7.4. Unit-tested without a DOM |
| `src/studio/composer.ts`, `styles/studio/composer.css` (new, lazy) | `tray.ts`, `palette.ts`, `nodeSearch.ts` and their CSS | `trayWords.ts`, `trayDemo.ts` and `getPaletteCommands` are kept and imported |
| `src/ui/bullet.ts` (new) | `src/ui/cutout.ts` | `renderBulletMarkup(stencilId, { size, tone })`; used by stage, dock, composer, card, contextual toolbar, exports |
| `src/studio/mapKey.ts` (new) | the legend half of `slotPopovers.ts` | 6.4 |
| `src/studio/breadcrumb.ts` (new) | `pageTabs.ts` painting | `pageMenu.ts` and `levels.ts` are reused |
| `src/studio/stripMap.ts` (new) | the scrubber markup in `runBar.ts` | 8.8 |
| `src/studio/statusBoard.ts` (new) | `chaosPanel.ts` | reads `chaosSummary` |
| `src/studio/reviewCallout.ts` (new) | none | 8.9; shares state with `dockFaces.ts` |
| `src/studio/instruments.ts` (new) | the block drawing in `queueBacklog.ts` (`paintBacklog`) | one painter per kind, 8.7 |
| `src/core/portSpread.ts` (new, pure) | none | 8.3 shared track; called after `routeDiagramEdges` |
| `keyedStage.ts` (changed) | | plate anatomy, bullets, label layer, `--k` |
| `nodeStyle.ts` (changed) | | same geometry, new edge and padding constants |
| `exporter/diagramSvg.ts`, `standaloneHtml.ts`, `titleBlock.ts`, `styles/viewer.css` (changed) | | 8.10, and parity with the stage |

Action ids do not change: `open-insert` opens the composer; the palette and find actions open it with a scope.

### 10.2 CSS

- New files under `src/styles/studio/`: `map.css` (bands, plates, bullets, modes), `lines.css`, `run.css` (instruments, states, train, board), `composer.css`, `dockFaces.css`. Each replaces rules in `stage.css`, `palette.css`, `components.css` or `layout.css`, which shrink in the same PR.
- `map.css`, `lines.css` and `run.css` are what the HTML export and `viewer.css` share. Keep them free of chrome selectors.
- Budget checkpoints for entry CSS: ≤ 138 kB during MP (raise the limit in GR1 and say so), ≤ 133 kB after DK, ≤ 130 kB at RL1, then set the limit to 133 kB again.
- Entry JS: ≤ 560 kB throughout. The composer chunk is ≤ 36 kB and gets its own line in `tools/checkBundleSize.mjs`.

### 10.3 What must not change

- `src/core/` behaviour: parsing, layout, routing, reachability, insights, schema. `portSpread` and `quickBuild` are additions.
- Every file format, box size and saved port (D2, D3).
- Shortcuts and action ids. `/` is the only new key.
- Ids, roles and accessible names on any element that survives (V3's D12). Specs for replaced surfaces (`tray.spec.ts`, `slots.spec.ts`, `runBar.spec.ts`, `capsules.spec.ts`, `states.spec.ts`, `map.spec.ts`) are rewritten in the PR that replaces the surface, never skipped.

### 10.4 Seeing what changed

GR1 adds `e2e/v4Visual.spec.ts` beside `v3Visual.spec.ts`, same rules (both themes, 1440 × 900, `reducedMotion: 'reduce'`), ten views:

1. Showcase, Design, Fit.
2. Showcase, Design, 100%, one component selected, card open.
3. Showcase, Design, composer open on a component ("redis").
4. Showcase, Design, composer open on a chain.
5. Showcase, Traffic, paused on step 8.
6. Showcase, Traffic, one component failed.
7. Showcase, Review, first issue.
8. Blank sheet with first run.
9. Share sheet with the poster.
10. Home.

Each PR re-records only what it meant to change and attaches before, after and the same state of the mockup (`?still&…`).

### 10.5 Accessibility

All of V1 section 10 and V3 10.5 apply. Specific to 4.0:

- Zero axe violations in every view of 10.4, both themes.
- The composer is a `dialog` with a labelled `combobox` and `listbox`; the chain preview is announced as a sentence ("Builds Gateway, Orders api, Postgres and Kafka with 3 wires"); focus returns to whatever opened it.
- The strip map is one `slider` (kept) whose `aria-valuetext` is the step's name; stops are also buttons for pointer users and are not tab stops.
- The key's rows are focusable and filter on focus exactly as on hover.
- A state is always a mark and a word. The lamp is never the only signal.
- The dock's contrast is measured on `--cc-dock` in both themes; the focus ring on the dock is `--cc-on-dock`.
- Line tones are graphics (3:1). Any text in a tone uses the text tier (4.5:1).

---

## 11. The queue

**Done** always also means section 12. **Read** lists what to open before starting.

### Milestone GR: Ground

#### [x] GR1. Branch and baseline · S
- **Do:** confirm V3's R3 and inspector card Step 5 are merged. Cut `v4` from `main`. Run the four commands in section 12 and write counts and sizes into the baseline table below. Add `e2e/v4Visual.spec.ts` (10.4) and save the ten views to `docs/v4/before/`. Raise the entry CSS limit to 138 kB with a comment naming this plan.
- **Done:** the spec passes twice in a row with no diff. **Needs:** none.
- **Measured (2026-11-25, branch `v4` from `main@86dc5ba`):** `e2e/v4Visual.spec.ts` (8/8) captured 20 PNGs to `docs/v4/before/` and passed twice consecutively with zero diff. `pnpm test`: 1,046/1,046 (209 suites). `pnpm check:size`: Entry JS 403.6 kB / 410 kB, Entry CSS 134.7 kB / 138 kB, Fonts 78.6 kB / 150 kB (2 files). `pnpm test:e2e`: 425 passed, 1 pre-existing skip (`propertiesCard.spec.ts:40`), 8 stale `e2e/v3Visual.spec.ts` snapshot diffs on `main`.

#### [x] GR2. Tokens · M (revised by D14)
- **Read:** `src/styles/shared.css`, `tests/contrast.test.ts`.
- **Do (revised by D14):** Preserve 100% of V3's Vellum & Graphite colours (`--cc-canvas*`, `--cc-sheet`, `--cc-ink*`, `--cc-blue..fuchsia`, `--cc-*-soft`). Add non-breaking V4 chrome tokens (`--cc-dock`, `--cc-on-dock`, `--cc-lift-2`) and write `--k` beside `data-lod` in `src/studio/state.ts`.
- **Done:** every contrast pair (`on-dock` on `dock` >= 4.5:1) and `--k` assertion passes; `v4Visual.spec.ts` stays green with zero pixel diff. **Needs:** GR1.
- **Measured (2026-11-25, PR #182, D14):** `pnpm test` 1,047/1,047 passed; Entry JS `403.7 kB / 410 kB`, Entry CSS `134.9 kB / 138 kB`, HTML export `100.5 kB / 101 kB`; `e2e/v4Visual.spec.ts` 8/8 passed with zero pixel diff.

#### [x] GR3. The display face · S
- **Do:** add Bricolage Grotesque as a self-hosted Latin `woff2` with its licence file, instanced as Q1 says. `@font-face` with `swap` and a size-adjusted fallback as Z4 did. Precache it (`tools/swPrecache.ts`). Add `--cc-font-map`.
- **Done:** fonts ≤ 150 kB together; `fonts.spec.ts` and the offline test pass; write the measured size here. **Needs:** GR1.
- **Measured (2026-11-25, branch `v4-gr3-font`, Q1 static fallback):** Variable Latin instance (`opsz=24, wdth=78..88, wght=700..800`) measured `77.9 kB` (`> 60 kB` Q1 cap); per **Q1**, dropped to static Latin `opsz=24, wdth=80, wght=700` at **`40.4 kB`** (`41,348 bytes` + `OFL.txt` in `src/styles/fonts/`), with `@font-face` + fallback metrics in `src/styles/fonts.css`, `--cc-font-map` in `src/styles/studio/tokens.css` & `src/studio/stagePicture.ts`, and `tools/swPrecache.ts` verified in `dist/sw.js`. `pnpm test`: 1,054/1,054 passed (211 suites); Fonts `119.0 kB / 150 kB` (`3 files`), Entry JS `408.0 kB / 410 kB`, Entry CSS `137.8 kB / 138 kB`, HTML export `100.5 kB / 101 kB`; `e2e/fonts.spec.ts` (3/3), `e2e/offline.spec.ts` (1/1), and `e2e/v4Visual.spec.ts` (8/8, zero diff) passed.

### Milestone MP: The map

#### [ ] MP1. Bands · S
- **Read:** `renderZones` in `keyedStage.ts`; the zone rules in `stage.css`.
- **Do:** 8.2. Remove the dot grid and lane hairlines.
- **Done:** view 1 matches the mockup's bands and heads. **Needs:** GR2, GR3.

#### [x] MP2. Lines · M
- **Read:** `renderWiresOnly` and lines 600 to 860 of `keyedStage.ts`; `stage.css` 452 to 765; `layout.ts` 773 to 846.
- **Do:** 8.3 except shared track: widths, casing, round joins, radius 24, the arrowhead, the stop, async dashes, selection underlay, counter-scale. Remove the seven `arrow-*` and `chevron-*` markers from `index.html` if nothing else uses them.
- **Done:** views 1 and 2; `wireProtocol.spec.ts`, `capsules.spec.ts` pass or are rewritten; a crossing in the showcase reads as a bridge in both themes. **Needs:** GR2.
- **Measured (2026-11-25, PR #183):** Added `src/core/wireGeom.ts` (`wireEndAngle`), orthogonal corner radius `24` in `src/core/layout.ts`, `src/styles/studio/lines.css`, SVG underlay/arrowhead/stop anatomy in `src/studio/keyedStage.ts`, and removed 13 unused markers from `index.html`. `pnpm test`: 1,049/1,049 (210 suites); Entry JS `404.6 kB / 410 kB`, Entry CSS `136.2 kB / 138 kB`, HTML export `100.5 kB / 101 kB`; `e2e/wireProtocol.spec.ts` + `e2e/capsules.spec.ts`: 5/5 passed; `e2e/v4Visual.spec.ts` re-recorded & passed twice consecutively (8/8, zero diff).

#### [x] MP3. Shared track · S
- **Do:** `src/core/portSpread.ts` and its test: given routed wires, return per-end offsets by the rule in 8.3. Apply in the stage and in `diagramSvg.ts`.
- **Done:** a fixture with three wires leaving one side shows three parallel lines; a level wire stays straight; saved files are byte-identical after open and save. **Needs:** MP2.
- **Measured (2026-11-25, PR #184):** Extracted `src/core/portSpread.ts` (`computePortOffsets`, `SHARED_TRACK_GAP = 14`, level-anchored straight centerline) wired into `routeDiagramEdges()` in `src/core/layout.ts` (consumed by stage + exports) and added `tests/portSpread.test.ts` (`4/4` tests passing, including byte-identical open/save verification).

#### [~] MP4. Plates and bullets · M *(Skipped — superseded by D14: keep V3 component cards, cut-out silhouettes, and soft tinted icon tiles; only update v3.1.0 Callouts if needed for `--k`)*
- **Read:** `renderNodes` (`keyedStage.ts:865`), `nodeStyle.ts`, `src/ui/icons.ts`, `src/ui/cutout.ts`.

#### [~] MP5. Selection, hover, ports · S *(Skipped — superseded by D14: keep V3 selection ring and port styling)*

#### [ ] MP6. Two modes · M
- **Read:** `map.spec.ts`; the `data-lod` rules in `stage.css`.
- **Do:** 8.6 (applied to V3 component cards using `--k` so Fit names stay >= 15 screen px).
- **Done:** the arm's-length test on view 1 (assert no component name below 15 px computed × scale); `map.spec.ts` rewritten. **Needs:** GR2, GR3.

#### [x] MP7. Labels · S
- **Do:** 8.4: the pill, the "fits" rule, the layer above the components, hover and selected.
- **Done:** at 100% in the showcase no pill overlaps a plate; hovering any wire shows its label. **Needs:** MP2.
- **Measured (2026-11-25, PR #184):** Added `longestStraightRun()` in `src/core/wireGeom.ts` + `labelFits` (`>= badgeWidth + 24`) in `src/core/layout.ts`, `#wire-labels-svg` (`z-index: 90000`) above `#nodes-layer` in `index.html`/`dom.ts`/`render.ts`/`keyedStage.ts`, and `22 px` (`rx=7`) D10 quiet-by-default rules + Geist Mono protocol spans in `lines.css`. `pnpm test`: 1,054/1,054 passed (211 suites); Entry JS `408.0 kB / 410 kB`, Entry CSS `136.7 kB / 138 kB`, HTML export `100.5 kB / 101 kB`; 16/16 Playwright tests passed across `wireProtocol`, `capsules`, `wireLabels`, `map`, and `diagramStyle`; `v4Visual.spec.ts` 8/8 passed twice consecutively (zero diff).

#### [ ] MP8. Export parity · M
- **Read:** `diagramSvg.ts`, `standaloneHtml.ts`, `viewer.css`, `exportVisual.spec.ts`.
- **Do:** everything in MP1 to MP7 in the SVG and HTML exports and the viewer. Embed the display face under V3's Q3 rule.
- **Done:** export baselines re-recorded; the stage and the SVG of the showcase differ by less than 2% of pixels at Fit. **Needs:** MP1 to MP7.

#### [ ] MP9. Sketch and Print · S
- **Do:** 8.11. **Done:** `diagramStyle.spec.ts` passes with re-recorded pictures. **Needs:** MP8.

### Milestone DK: The dock and the shell

#### [ ] DK1. The inverted dock, Design face · M
- **Read:** `dock.ts`, `dockFavourites.ts`, the dock rules in `layout.css`, `toolRail.spec.ts`.
- **Do:** 6.5: the surface, tools, favourites as V3 cut-outs (per D14), the "Add or find anything" field (still opening the tray until CP2), Run.
- **Done:** views 1 and 2; dragging a favourite to the sheet still places it; roving focus works. **Needs:** GR2.

#### [ ] DK2. Lens switch and dock morph · S
- **Do:** 6.3 and the width spring in 6.5. **Done:** `lensKeys.spec.ts` passes; no layout shift in any other slot during the morph. **Needs:** DK1.

#### [ ] DK3. Title island and breadcrumb · M
- **Read:** `pageTabs.ts`, `pageMenu.ts`, `levels.ts`, `pages.spec.ts`, `levels.spec.ts`, `topbar.spec.ts`.
- **Do:** 6.2. **Done:** pages and levels specs pass, rewritten where they named tabs. **Needs:** GR2.

#### [ ] DK4. The key · M
- **Read:** `slotPopovers.ts`, `slots.spec.ts`.
- **Do:** 6.4, `mapKey.ts`. **Done:** the stranger test on view 1; hover and focus both filter; renaming a row is one undo step. **Needs:** DK3 (the slot must be empty), MP2.

#### [ ] DK5. NE, SE, hint · S
- **Do:** 6.5's hint line and 6.7. **Done:** `tooltips.spec.ts`, `camera.spec.ts` pass. **Needs:** DK1.

#### [ ] DK6. Properties card and the rest · S
- **Do:** 6.8 (display headings in Home/dialogs; keep V3 properties card styling & cut-out header per D14). **Done:** `propertiesCard.spec.ts` passes; view 10. **Needs:** GR3.

#### [~] DK7. Retire the cut-out · S *(Skipped — superseded by D14: `src/ui/cutout.ts` is kept)*

#### [ ] DK8. Narrow and touch · M
- **Do:** 6.9. **Done:** `touch.spec.ts` passes; at 375 × 812 nothing scrolls sideways except the dock and every dock target is at least 44 px. **Needs:** DK1 to DK5, CP2.

### Milestone CP: The composer

#### [ ] CP1. `quickBuild` · M
- **Read:** `trayWords.ts`, `src/templates/presets.ts`, how the Wire tool makes a wire in `interactions.ts`.
- **Do:** 7.4 and its tests: every rule, the limits, reuse by title, duplicate wires, a cycle (`a > b > a`), unicode names.
- **Done:** tests pass with no DOM. **Needs:** GR1.

#### [ ] CP2. The composer surface · M
- **Read:** `tray.ts`, `trayDemo.ts`, `tray.spec.ts`.
- **Do:** 7.1 and the Components section, with `C`, `/` and the dock field. Delete `tray.ts` and its CSS.
- **Done:** view 3; `tray.spec.ts` rewritten as `composer.spec.ts`; chunk ≤ 36 kB. **Needs:** DK1, MP4.

#### [ ] CP3. Chains in the composer · S
- **Do:** the "Build this chain" row, the preview strip, `applyBuild`, the camera flight, the toast line.
- **Done:** view 4; the mockup's example builds four components and three wires and `⌘Z` removes all of them at once. **Needs:** CP1, CP2.

#### [ ] CP4. Find and commands · M
- **Read:** `palette.ts`, `nodeSearch.ts`, `commands.ts`.
- **Do:** 7.2's last two sections and the scopes for `⌘K` and `⌘F`. Delete `palette.ts`'s surface and `nodeSearch.ts`.
- **Done:** every command reachable in 3.0's palette is reachable here with the same name and shortcut. **Needs:** CP2.

### Milestone RN: The run

#### [ ] RN1. Traffic face and strip map · M
- **Read:** `runBar.ts`, `runBar.spec.ts`, `simulationPlayback.ts`.
- **Do:** 6.5 Traffic face and 8.8's strip map (`stripMap.ts`).
- **Done:** view 5; arrow keys, Home and End still scrub; a 30-step and a 60-step scenario fall back as specified. **Needs:** DK2.

#### [ ] RN2. Beads, train, caption, route · M
- **Do:** 8.7 beads and 8.8. **Done:** `capsules.spec.ts`, `traces.spec.ts`, `reducedMotion.spec.ts` pass; with reduced motion the caption sits at the middle of the step's wire. **Needs:** MP2, RN1.

#### [ ] RN3. Instruments · M
- **Read:** `queueBacklog.ts`, `core/queues.ts`, `core/balancers.ts`, `queue.spec.ts`, `cache-limiter-scheduler.spec.ts`.
- **Do:** `instruments.ts`, the table in 8.7. **Done:** each instrument has a unit test on its numbers and appears in view 5. **Needs:** MP4, MP6.

#### [ ] RN4. States and the status board · M
- **Read:** `chaos.ts`, `chaosPanel.ts`, `states.spec.ts`, `chaos.spec.ts`.
- **Do:** 8.7 states, the staggered spread, `statusBoard.ts`. Delete `chaosPanel.ts`.
- **Done:** view 6; `states.spec.ts` rewritten; each state is distinguishable in a greyscale screenshot. **Needs:** RN3.

### Milestone RV: Review

#### [ ] RV1. Callout and numbers · M
- **Read:** `redline.ts`, `dockFaces.ts`, `insights.spec.ts`.
- **Do:** 8.9 and the Review face in 6.5. **Done:** view 7; fixing all issues in the showcase ends at "All clear" with colour restored; the callout never overlaps a component at Fit or at 100%. **Needs:** DK2, MP4.

### Milestone PS: Poster

#### [ ] PS1. The poster frame · M
- **Read:** `titleBlock.ts`, `titleBlockStrip.ts`, `exportAllPages.ts`, `gif.ts`.
- **Do:** 8.10 for SVG and PNG, then GIF and HTML. **Done:** `exportVisual.spec.ts` re-recorded; "Title block" off gives the bare map; the CLI output matches the app's. **Needs:** MP8, DK4.

#### [ ] PS2. The Share sheet · S
- **Read:** `shareLink.ts`, `share.spec.ts`. **Do:** the two-column sheet with a live preview. **Done:** view 9. **Needs:** PS1.

### Milestone RL: Release

#### [ ] RL1. First paint and cleanup · S
- **Do:** the orchestrated draw-in (section 9). Delete dead rules and tokens; lower the CSS limit to 133 kB. **Done:** budgets met; the draw-in does not run under reduced motion or on page switches. **Needs:** every item above.

#### [ ] RL2. Final review · S
- **Do:** the three tests in section 2 on all ten views, both themes; axe on all ten; README pictures via `tools/captureReadmeMedia.mjs`; save the ten views to `docs/v4/after/`. **Needs:** RL1.

#### [ ] RL3. Ship 4.0.0 · S
- **Do:** release notes, version, merge `v4` to `main`. **Needs:** RL2, and the owner's go-ahead.

### Baseline (filled in by GR1)

| Measure | Value |
|---|---|
| Unit tests | 1046 passed (209 suites) |
| Playwright specs / tests | 75 files / 434 tests (425 passed, 1 skipped, 8 stale `v3Visual` snapshot diffs on `main`; `v4Visual` 8/8 passed twice) |
| Entry JS | 403.6 kB / 410 kB |
| Entry CSS | 134.7 kB / 138 kB |
| Fonts | 78.6 kB / 150 kB (2 files) |

---

## 12. Definition of done (every PR)

```bash
pnpm test
pnpm build
pnpm check:size
pnpm test:e2e
```

Paste the summary lines into the PR. Also:

- Before and after images of every view the PR meant to change, both themes, beside the same state of the mockup.
- The same change is in the SVG and HTML exports once MP8 has landed.
- The surface it replaces is deleted in the same PR (D12); budgets are at or below their checkpoint.
- No shortcut changed. No spec skipped: a spec for a replaced surface is rewritten.
- Zero axe violations; reduced motion stops everything; reduced transparency makes islands solid.
- A file saved by 3.0 opens unchanged, and a file saved by this branch opens in 3.0 (D2).
- New strings follow the word list and 5.5.
- This file is updated.

---

## 13. Open questions, with defaults

Use the default if the question is open when its item comes up, and say so in the PR.

| # | Question | Needed by | Default |
|---|---|---|---|
| Q1 | Bricolage Grotesque has three axes and its size as a subset has not been measured. Does it fit in the 70 kB of font budget that is left? | GR3 | Instance it: weight 700 and 800 only, width 78 to 88, optical size fixed at 24, Latin. If that is over 60 kB, drop to weight 700 and width 80 as a static face. If it is still over, do not ship it: set the map in Instrument Sans at width 78%, weight 700, and say so here. |
| Q2 | Is this release called 4.0, or is it folded into 3.0 before 3.0 ships? | GR1 | 4.0. 3.0 is finished work; ship it. |
| Q3 | Is an inverted dock too heavy on a small laptop? | DK1 | Keep it. If the owner disagrees after seeing view 1 in the app, the fallback is an island-coloured dock with an ink Run button; no other item depends on the colour. |
| Q4 | Should the key be collapsible? | DK4 | Yes, to a single "Key" button, remembered per browser; open by default. |
| Q5 | Do built wires get a default label? | CP3 | No (7.4 rule 3). |
| Q6 | Should `>` chains also be accepted in the CLI (`tools/conduitcraft.ts`)? | after RL3 | Not in 4.0. `quickBuild` is pure so it can be added later without change. |
| Q7 | Do instruments show in Design at high detail? | RN3 | No. Design is still and quiet (V3's D8); the readout text ("4 copies") shows, the cells do not. |
| Q8 | Greyscale in Review: keep V3's "Keep colour in Review" preference? | RV1 | Yes, unchanged. |
| Q9 | Does the poster frame apply to "Copy as picture" too? | PS1 | No. Copy gives the bare map; download gives the poster. |
| Q10 | One release, or the map first and the composer second? | RL3 | One release from `v4`. If time runs short, the order to cut is PS, then RV1's callout, then RN3. MP, DK and CP are the redesign. |
