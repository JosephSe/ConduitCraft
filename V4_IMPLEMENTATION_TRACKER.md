# ConduitCraft 4.0 & Next-Gen UX Implementation Tracker

**Branch:** `v4` (cut from `main` at `86dc5ba`, v3.1.1 + PRs #173–#180)
**Started:** 2026-11-25
**Visual Reference:** [`docs/v4/concept.html`](docs/v4/concept.html) · **Interactive Prototype (V4 + Next-Gen UX):** [`docs/v4/prototype.html`](docs/v4/prototype.html)
**Source Specs:** [`REDESIGN_PLAN_V4.md`](REDESIGN_PLAN_V4.md) · [`FEATURES_AFTER_V3.md`](FEATURES_AFTER_V3.md)

> **Purpose:** Single live checklist for executing V4, our Next-Gen UX features, and the post-V3 queue. Every item is ticked `[x]` in the same PR/commit that implements and verifies it, along with measured bundle sizes and test counts.

---

## Live Progress Dashboard

| Track | Scope | Done | Total | Status |
|---|---|---:|---:|---|
| **Track 0: Pre-Flight** | Branch + interactive V4/UX prototype (`PRE-1`–`PRE-2`) | 2 | 2 | Complete |
| **Track 1: V4 Ground (`GR`)** | Baseline, V3-preserving tokens + `--k`, Bricolage Grotesque (`GR1`–`GR3`) | 3 | 3 | Complete (`GR1`–`GR3` done) |
| **Track 1: V4 The Map (`MP`)** | Bands, fluid wires, shared track, LoD, labels, exports (`MP4`/`MP5` skipped per D14) | 7 | 7 | **Complete** (`MP1`–`MP3`, `MP6`–`MP9` done; `MP4`/`MP5` skipped per D14) |
| **Track 1: V4 Dock & Shell (`DK`)** | Inverted dock, morph, breadcrumb, always-on Key, card, narrow (`DK7` skipped per D14, `DK3` skipped per user preference) | 5 | 6 | In progress (`DK1`–`DK2`, `DK4`–`DK6` done; `DK3` skipped per user preference; `DK7` skipped per D14; ready for `CP1`, `RN1`, `RV1`, `PS1`) |
| **Track 1: V4 Composer (`CP`)** | Pure `quickBuild`, unified `/` composer, chains, find/commands (`CP1`–`CP4`) | 2 | 4 | In progress (`CP1`–`CP2` done; ready for `CP3`, `CP4`, `DK8`) |
| **Track 1: V4 Live Run (`RN`)** | Strip map, beads/train/caption, instruments, states/board (`RN1`–`RN4`) | 0 | 4 | Unblocked (`DK2` done) |
| **Track 1: V4 Review (`RV`)** | On-map 288 px callout + redline numbers (`RV1`) | 0 | 1 | Unblocked (`DK2` done) |
| **Track 1: V4 Poster & Release (`PS`, `RL`)** | Poster exports, 2-col Share sheet, draw-in, final audit, ship (`PS1`–`RL3`) | 0 | 5 | Ready for `PS1` (unblocked by `MP8` & `DK4`) |
| **Track 2: Next-Gen UX (`UX`)** | Splice, Cone/Path, Geiger, `@Patterns`, Fold, Loupe, Wipe, RFC, Tidy (`UX-1`–`UX-9`) | 0 | 9 | Prototype-verified; phased with V4 & Post-V4 |
| **Track 3: After V3 (`3.1`–`3.4`)** | Scenarios, 3 fields + 40 marks, Load, `conduitcraft mcp`, Compare (`3.1-a`–`3.4-d`) | 0 | 18 | Sequenced post-V4 (except `3.2-c`) |
| **Overall** | | **19** | **59** | **32.2%** _(4 items skipped: `MP4`/`MP5`/`DK7` per D14, `DK3` per user preference)_ |

---

## Bundle Budget Checkpoints (`tools/checkBundleSize.mjs`)

Current `main` (`86dc5ba`) limits after PRs #178–#180 lazy-loading work:
- **Entry JS (`index-*.js`):** cap `410 kB` (V4 ceiling: `<= 560 kB`; keep as close to `<= 430 kB` as possible)
- **Entry CSS (`index-*.css`):** cap `135 kB` (V4 checkpoint: `<= 138 kB` during `MP`, `<= 133 kB` after `DK`, `<= 130 kB` at `RL1`, final `<= 133 kB`)
- **Self-hosted Fonts (`*.woff2`):** cap `150 kB` total (~80 kB currently used; `~70 kB` headroom for Bricolage Grotesque)
- **Composer lazy chunk (new in `CP2`):** cap `<= 36 kB`

---

## Track 0: Pre-Flight (Completed)

- [x] **PRE-1. Cut `v4` branch from `main`** · S · **Priority:** P0
  - Created `v4` off `main` (`86dc5ba`), keeping `main` clean for `3.x` maintenance.
  - **Completed:** 2026-11-25 · Branch `v4` active.

- [x] **PRE-2. Interactive V4 + Next-Gen UX prototype** · M · **Priority:** P0
  - Built standalone prototype at [`docs/v4/prototype.html`](docs/v4/prototype.html) without modifying [`docs/v4/concept.html`](docs/v4/concept.html) or `src/`.
  - Showcases V4 transit map design language, `light-dark()` two-tier theming, native `<dialog closedby="any">` with `@starting-style` + `allow-discrete` fallbacks, plus all 9 Next-Gen UX concepts.
  - **Completed:** 2026-11-25 · Playwright Chromium verified (`1440x900`, `ERRORS: []`, Fit `scale: 0.5459`, min screen font size `15.3 px`).

---

## Track 1: `REDESIGN_PLAN_V4.md` Core Milestones (17 / 30 active, 4 skipped)

> **Key Gap Note vs. `REDESIGN_PLAN_V4.md`:** v3.1.0 shipped **Callouts** (`variant: 'callout'`, schema v15) after the V4 plan was drafted. Callout styling, counter-scaling, and export parity must be carried into `MP4`, `MP8`, and `PS1`.

### Milestone GR: Ground

- [x] **GR1. Baseline measurements & `v4Visual.spec.ts`** · S · **Priority:** P0 · **Needs:** `PRE-1`
  - **Read:** `REDESIGN_PLAN_V4.md` §10.4, §11 (`GR1`), `e2e/v3Visual.spec.ts`, `tools/checkBundleSize.mjs`.
  - [x] Run `pnpm test`, `pnpm build`, `pnpm check:size`, `pnpm test:e2e` and record baseline counts/sizes in the Baseline Log below.
  - [x] Add `e2e/v4Visual.spec.ts` covering the 10 views in both themes (reduced motion) and save `docs/v4/before/` baselines.
  - [x] Raise entry CSS budget comment/limit in `tools/checkBundleSize.mjs` to `138 kB` for `MP` headroom (and updated `tests/primitives.test.ts:72` assertion; note: entry JS cap is already `410 kB`).
  - **Done when:** `v4Visual.spec.ts` passes twice consecutively with zero diff.
  - **Completed:** 2026-11-25 · `v4Visual.spec.ts` (8/8) passed twice with zero diff (`20` PNGs in `docs/v4/before/`). `pnpm test`: 1,046/1,046 (209 suites); Entry JS `403.6 kB`, Entry CSS `134.7 kB`, Fonts `78.6 kB`; `pnpm test:e2e`: 425 passed, 1 skipped (`propertiesCard.spec.ts:40`), 8 stale `v3Visual.spec.ts` snapshot diffs on `main`.

- [x] **GR2. V3-preserving tokens & `--k` counter-scale (revised per D14)** · M · **Priority:** P0 · **Needs:** `GR1`
  - **Read:** `src/styles/shared.css`, `src/studio/state.ts`, `tests/contrast.test.ts`.
  - [x] Preserve 100% of V3's Vellum & Graphite colours (`--cc-canvas*`, `--cc-sheet`, `--cc-ink*`, `--cc-blue..fuchsia`, `--cc-*-soft`).
  - [x] Add additive V4 chrome tokens (`--cc-dock`, `--cc-on-dock`, `--cc-lift-2`) in both Vellum and Graphite.
  - [x] Write `--k = clamp(1, 0.78 / scale, 1.6)` beside `data-lod` in `src/studio/state.ts`.
  - [x] Assert `on-dock` on `dock` >= 4.5:1 (both themes) and `--k` in `tests/contrast.test.ts`.
  - **Done when:** Contrast tests and `v4Visual.spec.ts` pass in both themes with zero pixel diff.
  - **Completed:** 2026-11-25 (PR #182 merged) · `pnpm test` 1,047/1,047 passed (exact suite/test counts verified); Entry JS `403.7 kB / 410 kB`, Entry CSS `134.9 kB / 138 kB`, HTML export `100.5 kB / 101 kB`; `e2e/v4Visual.spec.ts` 8/8 passed with zero pixel diff; prototype updated and verified (`ERRORS: []`).

- [x] **GR3. Self-hosted display face (Bricolage Grotesque)** · S · **Priority:** P0 · **Needs:** `GR1`
  - **Read:** `src/styles/fonts.css`, `tools/swPrecache.ts`, `e2e/fonts.spec.ts`, `REDESIGN_PLAN_V4.md` §5.2 & Q1.
  - [x] Add Latin-subsetted Bricolage Grotesque `.woff2` (Q1 static fallback `opsz=24, wght=700, wdth=80`, `40.4 kB`) + OFL licence under `src/styles/fonts/`.
  - [x] Define `@font-face` (`font-display: swap` + size-adjusted fallback) and `--cc-font-map`; precached in `tools/swPrecache.ts` / `dist/sw.js`.
  - **Done when:** Total `.woff2` fonts <= `150 kB`, `fonts.spec.ts` and offline tests pass.
  - **Completed:** 2026-11-25 (`v4-gr3-font`) · Fonts `119.0 kB / 150 kB` (`3 files`); `pnpm test` 1,054/1,054 passed (`211` suites); Entry JS `408.0 kB / 410 kB`, Entry CSS `137.8 kB / 138 kB`, HTML export `100.5 kB / 101 kB`; `e2e/fonts.spec.ts` (3/3), `e2e/offline.spec.ts` (1/1), `e2e/v4Visual.spec.ts` (8/8, zero diff).

### Milestone MP: The Map

- [x] **MP1. Alternating bands & sheet cleanup** · S · **Priority:** P0 · **Needs:** `GR2`, `GR3`
  - **Read:** `renderZones` in `src/studio/keyedStage.ts`, `src/styles/studio/stage.css`.
  - [x] Remove dot grid and lane hairlines; style lanes as radius-28 alternating `--cc-band-a` / `--cc-band-b` bands.
  - [x] Render tabular weight-300 lane number + display-face (`--cc-font-map`) title scaled by `--k`.
  - **Done when:** View 1 matches `docs/v4/concept.html` bands and heads.
  - **Completed:** 2026-11-25 (`v4-mp1-mp6-bands-lod`) · Added Vellum/Graphite `--cc-band-a`/`--cc-band-b` tokens in `tokens.css` & `diagramStyles.css`, removed dot-grid CSS/`data-faint` and superseded wire CSS from `stage.css`/`state.ts`, updated Design `.conduit-casing` in `lines.css` to `--cc-band-a`, and styled `.zone-banner::before` as radius-28 alternating bands. Entry CSS reduced to `137.5 kB / 138 kB`.

- [x] **MP2. Transit lines, bridge casings & radius 24** · M · **Priority:** P0 · **Needs:** `GR2`
  - **Read:** `renderWiresOnly` in `src/studio/keyedStage.ts`, `src/core/layout.ts` (`cornerRadius`), `src/styles/studio/stage.css`, `index.html` markers.
  - [x] Extract `src/styles/studio/lines.css`; implement 3 px × `--k` `--t` rails (per D14), `--cc-canvas`/`--cc-canvas-run` casing (`+5 px`) for bridges, round caps/joins, corner radius 24.
  - [x] Add filled arrowhead (`10 x 11 px x --k` rotated via `wireEndAngle`) + `3.6 px` source stop; round async dashes (`6px * --k`, `6.9px * --k`); `4.5 px` wider ink selection underlay.
  - [x] Remove unused `arrow-emerald..fuchsia` / `chevron-*` SVG `<defs>` from `index.html` (keeping `arrow-blue` for `#draft-wire`).
  - **Done when:** Crossings read as bridges in both themes; `wireProtocol.spec.ts` and `capsules.spec.ts` pass/rewritten.
  - **Completed:** 2026-11-25 (PR #183) · `pnpm test`: 1,049/1,049 passed (210 suites); Entry JS `404.6 kB / 410 kB`, Entry CSS `136.2 kB / 138 kB`, HTML export `100.5 kB / 101 kB`; `e2e/wireProtocol.spec.ts` + `e2e/capsules.spec.ts` 5/5 passed; `e2e/v4Visual.spec.ts` 8/8 passed twice consecutively (zero diff).

- [x] **MP3. Pure shared-track port spreading (`src/core/portSpread.ts`)** · S · **Priority:** P0 · **Needs:** `MP2`
  - **Partial groundwork on `main`:** `spreadPorts()` already exists in `src/core/layout.ts` (PRs #162/#163).
  - [x] Extract/align pure `src/core/portSpread.ts` + `tests/portSpread.test.ts` enforcing 14 px parallel spacing on shared sides with level wires kept straight.
  - [x] Apply identically in `keyedStage.ts` and `src/exporter/diagramSvg.ts` (via shared `routeDiagramEdges()`) without mutating saved port fields.
  - **Done when:** 3-wire fixture shows parallel lines, level wire stays straight, open/save is byte-identical.
  - **Completed:** 2026-11-25 (PR #184) · `tests/portSpread.test.ts` 4/4 passed; `routeDiagramEdges()` drives both stage & SVG/HTML exports with zero mutation to persisted JSON.

- [~] **MP4. Plates and bullets** *(Skipped — superseded by D14: keep V3 component cards, cut-out silhouettes, soft tinted icon tiles, `.node-status-badge` pills, and `.arch-node[data-external="true"]` dashed outline + `EXTERNAL` pill)*

- [~] **MP5. Selection crop marks & bullet hover** *(Skipped — superseded by D14: keep V3 selection ring and port dots)*

- [x] **MP6. Two LoD modes (Map vs Card) & arm's-length test** · M · **Priority:** P0 · **Needs:** `GR2`, `GR3`
  - **Partial groundwork on `main`:** `data-lod="low"` and `"medium"` hooks already toggle at 55% / 80% in `src/studio/state.ts` and `src/styles/studio/stage.css`.
  - [x] Style map/plate LoD rules (`unlayered.css`) in `--cc-font-map`, preserving V3 `.node-status-badge` (`Live`/`Planned`/`At Risk`/`Deprecated`) and `.arch-node[data-external="true"]::after` (`EXTERNAL` dashed pill + dashed outline) per D14 (`viewer.css` export parity deferred to `MP8`).
  - [x] In Map mode (`data-lod="low"`), scale `.node-title` (`clamp(17px, 15.2px / --cam-scale, 35px)`), `.zone-title`, `.zone-num`, and `.frame-title-bar` so Fit renders cleanly at arm's length with zero clipping.
  - [x] Assert in `e2e/map.spec.ts` (View 1) that no component name or lane title renders below 15 screen px at Fit.
  - **Done when:** Arm's-length assertion passes; `e2e/map.spec.ts` rewritten and green.
  - **Completed:** 2026-11-25 (`v4-mp1-mp6-bands-lod`) · `pnpm test`: 1,054/1,054 (211 suites); Entry JS `408.1 kB / 410 kB`, Entry CSS `137.5 kB / 138 kB`, Fonts `119.0 kB / 150 kB`, HTML export `100.7 kB / 101 kB`; `e2e/map.spec.ts`: 7/7 passed (`>= 15 px` View 1 legibility + `1440×900`, `1280×720`, `1024×700` zero-cutoff); `e2e/v4Visual.spec.ts`: 8/8 passed twice consecutively (zero diff) after `--update-snapshots=all`.

- [x] **MP7. Wire labels layer above `#nodes-layer` & "fits" rule** · S · **Priority:** P0 · **Needs:** `MP2`
  - **Partial groundwork on `main`:** Draggable wire labels and low-zoom hover-show landed in PR #176.
  - [x] Render 22 px label pills (`rx=7`) in `#wire-labels-svg` *above* `#nodes-layer` (`z-index: 90000`) so tight gaps never clip pill text.
  - [x] Show automatically at `high` zoom only when longest straight run >= `badgeWidth + 24 px` (`data-fits="1"`); always show on hover, selection, or highlight.
  - **Done when:** Zero label-behind-plate clipping at 100% in showcase; hover shows any wire's label.
  - **Completed:** 2026-11-25 (PR #184) · `pnpm test`: 1,054/1,054 (211 suites); Entry JS `408.0 kB / 410 kB`, Entry CSS `136.7 kB / 138 kB`, HTML export `100.5 kB / 101 kB`; 16/16 Playwright tests passed across `diagramStyle`, `wireProtocol`, `capsules`, `wireLabels`, and `map`; `v4Visual.spec.ts` 8/8 passed twice consecutively (zero diff).

- [x] **MP8. Export parity (SVG, standalone HTML, viewer)** · M · **Priority:** P1 · **Needs:** `MP1`–`MP7`
  - **Read:** `src/exporter/diagramSvg.ts`, `src/exporter/standaloneHtml.ts`, `src/styles/viewer.css`, `e2e/exportVisual.spec.ts`.
  - [x] Port bands, lines, bridges, labels layer above nodes, V3 `.node-status-badge` & `EXTERNAL` dashed pill/outline, and v3.1.0 Callouts to `diagramSvg.ts`, `standaloneHtml.ts`, and `viewer.css`.
  - [x] Verify Bricolage Grotesque embedded & loaded in SVG clone and standalone HTML exports (`e2e/exportVisual.spec.ts` asserts all 3 fonts).
  - **Done when:** Export baselines re-recorded and green; HTML export within `<= 101 kB`.
  - **Completed:** 2026-11-25 (`v4-mp8-mp9-exports-styles`) · `pnpm test`: 1,054/1,054 (211 suites); Entry JS `408.1 kB / 410 kB`, Entry CSS `137.9 kB / 138 kB`, Fonts `119.0 kB / 150 kB`, HTML export `101.0 kB / 101 kB`; `e2e/exportVisual.spec.ts` (6/6) passed twice consecutively after `--update-snapshots=all`; `e2e/v4Visual.spec.ts` (8/8) green.

- [x] **MP9. Sketch & Print styles re-derived** · S · **Priority:** P1 · **Needs:** `MP8`
  - [x] Re-derive Print (white hairline bands, no-fill plates, 2.5 px lines, dashed async) and Sketch (rough filter on plate edges/lines, warm paper bands) across `diagramStyles.css` and `diagramSvg.ts`.
  - **Done when:** `diagramStyle.spec.ts` and `exportVisual.spec.ts` pass with updated baselines.
  - **Completed:** 2026-11-25 (`v4-mp8-mp9-exports-styles`) · `e2e/diagramStyle.spec.ts` (2/2), `e2e/exportVisual.spec.ts` (6/6), and `e2e/v4Visual.spec.ts` (8/8) passed.

### Milestone DK: The Dock & The Shell

- [x] **DK1. Inverted dock — Design face** · M · **Priority:** P0 · **Needs:** `MP4`
  - **Read:** `src/studio/dock.ts`, `src/studio/dockFavourites.ts`, `src/styles/studio/layout.css`, `e2e/toolRail.spec.ts`.
  - [x] Style `--cc-dock` 60 px pill (radius 30, `--cc-on-dock`) as the sole inverted surface on screen (`tokens.css`, `unlayered.css`).
  - [x] Render 5 tools (`V/W/H/T/F`), 6 favourite V3 cut-outs (per D14, crisp on inverted dock in Vellum & Graphite), "Add or find anything `C`" trigger (`#btn-all-components`), and Run (`#btn-run`) moved into dock while making Share (`#btn-share`) the sole `.solid` button in NE.
  - **Done when:** Views 1 & 2 match; favourite drag-to-sheet and roving focus pass.
  - **Completed:** 2026-11-25 (`v4-dk1-dk2-inverted-dock`) · `pnpm test`: 1,054/1,054 (211 suites); Entry JS `408.8 kB / 410 kB`, Entry CSS `137.2 kB / 138 kB`, Fonts `119.0 kB / 150 kB`, HTML export `101.0 kB / 101 kB`; `tests/contrast.test.ts` asserts `>= 4.5:1` for `--cc-dock-rose` & `--cc-on-dock-2` on `--cc-dock`; `e2e/toolRail.spec.ts`, `e2e/topbar.spec.ts`, `e2e/slots.spec.ts`, `e2e/touch.spec.ts`, `e2e/a11y.spec.ts`, and `e2e/v4Visual.spec.ts` (8/8 zero-diff) passed.

- [x] **DK2. Sliding lens switch & dock width morph** · S · **Priority:** P0 · **Needs:** `DK1`
  - [x] Add `--cc-spring` (340 ms) sliding ink thumb (`radius 11px`) to N lens switch (`ui.css`) and animated width morph + 6 px face cross-fade (`@keyframes cc-face-in`) to dock (`dockFaces.ts`, `runBar.ts`, `unlayered.css`), respecting `prefers-reduced-motion`.
  - **Done when:** `lensKeys.spec.ts` passes with zero layout shift in sibling slots.
  - **Completed:** 2026-11-25 (`v4-dk1-dk2-inverted-dock`) · `dockFaces.ts` owns all `[data-face]` transitions with zero lingering inline `width`; `e2e/lensKeys.spec.ts` & `e2e/toolRail.spec.ts` verify inverted Vellum/Graphite geometry, zero horizontal clipping at `1440×900`, and zero shift in `#slot-sw` / `#slot-se`.

- [~] **DK3. Title island & page/level breadcrumb** *(Skipped — reverted PR #189 per user preference to keep visible SW page tabs in `#page-strip`)*

- [x] **DK4. Always-visible Key (`src/studio/mapKey.ts`)** · M · **Priority:** P0 · **Needs:** `MP2` *(co-exists with SW `#page-strip` page tabs)*
  - **Read:** `src/studio/slotPopovers.ts`, `e2e/slots.spec.ts`.
  - [x] Render always-on SW Key listing tones in layout order (26 × 4 px swatch, dashed if all wires async), collapsible to a single "Key" button (remembered per browser, open by default).
  - [x] Hovering/focusing a row sets `data-key="<tone>"` on `#stage-world` (dims others to 13%); clicking label renames in place as one undo step.
  - **Done when:** Stranger test passes on View 1; hover & focus filtering + undoable rename pass.
  - **Completed:** 2026-11-26 (`v4-dk4-map-key`) · Pure `collectMapKeyRows` / `updateLegendLabel` (`src/core/mapKey.ts`), lazy `src/studio/mapKeyChunk.ts` + `src/studio/mapKey.ts` (`6.1 kB` chunk), and `src/styles/mapKey.css`; `#legend-card` sits cleanly above `#page-strip` (auto-collapsed `<= 900 px`), passes `pnpm test` (`1,061/1,061`, `213` suites), Entry JS `408.2 kB / 410 kB`, Entry CSS `137.6 kB / 138 kB`, Fonts `119.0 kB / 150 kB`, HTML export `101.0 kB / 101 kB`, `e2e/mapKey.spec.ts` + 6 shell/a11y specs (`77/77`), and `e2e/v4Visual.spec.ts` (`8/8` zero-diff x2).

- [x] **DK5. NE, SE & single hint line** · S · **Priority:** P0 · **Needs:** `DK1`
  - [x] Update NE (Find, Theme, ink Share button), SE (zoom out, `%` double-click + `#btn-zoom-100` for 100%, zoom in, Fit + existing minimap/outline triggers), and single `#hud-status-tip` hint line above dock.
  - **Done when:** `tooltips.spec.ts` and `camera.spec.ts` pass.
  - **Completed:** 2026-11-26 (`v4-dk5-ne-se-hint`) · Added `#btn-theme-toggle` in NE (`index.html`, `src/main.ts`, `layout.css`), `#btn-zoom-100` + `#zoom-readout` double-click reset in SE (`src/studio/interactions.ts`), and V4 plain-sentence `#hud-status-tip` hints across Design/Traffic/Review (`pointerTool.ts`, `dockFaces.ts`, `interactions.ts`, `layout.css`); `pnpm test`: `1,061/1,061` (`213` suites), Entry JS `409.6 kB / 410 kB`, Entry CSS `137.8 kB / 138 kB`, Fonts `119.0 kB / 150 kB`, HTML export `101.0 kB / 101 kB`, `tooltips.spec.ts` + `camera.spec.ts` + `slots.spec.ts` + `topbar.spec.ts` + `touch.spec.ts` + `a11y.spec.ts` (`70/70`), and `e2e/v4Visual.spec.ts` (`8/8` zero-diff x2) passed.

- [x] **DK6. Properties card & remaining chrome re-styled (D14)** · S · **Priority:** P0 · **Needs:** `GR3`
  - [x] Preserve V3 properties card styling, `.prop-head-art` cut-out tile, and colour swatches per D14 while overriding `--cc-font-panel` (`700 16px/20px var(--cc-font-map)`) and `.inspector .prop-head .prop-head-name` specificity; apply display headings to `.dialog-header h2`, `.first-run-line`, `.template-card-title`, and lazy chrome CSS (`home.css`, `codePane.css`, `library.css`, `presentation.css`, `snapshots.css` + `--cc-amber`/`--cc-amber-soft` diff tokens).
  - **Done when:** `propertiesCard.spec.ts` passes and View 10 (Home) matches.
  - **Completed:** 2026-11-26 (`v4-dk6-chrome-headings`) · `pnpm test`: `1,061/1,061` (`213` suites); Entry JS `409.6 kB / 410 kB`, Entry CSS `137.9 kB / 138 kB`, Fonts `119.0 kB / 150 kB`, HTML export `101.0 kB / 101 kB`; targeted Playwright specs (`propertiesCard`, `home`, `inspectorAutoShow`, `appearancePickers`, `a11y`: `40` passed, `1` pre-existing fixme; plus `firstRun`, `codePane`, `library`, `presentation`, `fonts`) and `e2e/v4Visual.spec.ts` (`8/8` zero-diff x2 on updated heading views `02`/`03`/`08`/`09`/`10`) passed.

- [~] **DK7. Retire the cut-out (`src/ui/cutout.ts`)** *(Skipped — superseded by D14: `src/ui/cutout.ts` is kept)*

- [ ] **DK8. Narrow & touch layout (< 900 px)** · M · **Priority:** P1 · **Needs:** `DK1`–`DK5`, `CP2`
  - [ ] Stack NW+NE over N, fold Key into SE button, hide favourites, allow horizontal dock scroll without clipping, full-width composer without side panel.
  - **Done when:** `touch.spec.ts` passes at `375x812` with >= 44 px dock targets.
  - **Completed:** _pending_

### Milestone CP: The Composer

- [x] **CP1. Pure chain grammar (`src/core/quickBuild.ts`)** · M · **Priority:** P0 · **Needs:** `GR1`
  - **Read:** `src/studio/trayWords.ts`, `src/templates/presets.ts`, wire creation in `src/studio/interactions.ts`.
  - [x] Implement pure `planBuild` and `applyBuild` (`>` sync, `~>` async, `,` branch, reuse by title, `WORDS` kind inference, longest-path DAG column/row layout, 24-node / 40-wire limits, one undo step).
  - **Done when:** `tests/quickBuild.test.ts` passes with zero DOM (including cycles, unicode names, duplicates, limits).
  - **Completed:** 2026-11-26 (`v4-cp1-quick-build`) · Added pure `src/core/quickBuild.ts` (`planBuild`, `applyBuild`), extracted shared `createWireEdge` into `src/templates/presets.ts` (reused by `src/studio/interactions.ts` and `applyBuild`), added `gateway: 'gate'` to `src/studio/trayWords.ts`, and added 11 DOM-free unit tests in `tests/quickBuild.test.ts`. `pnpm test`: `1,072/1,072` (`214` suites); `pnpm build` + `pnpm check:size`: Entry JS `409.6 kB / 410 kB`, Entry CSS `137.9 kB / 138 kB`, Fonts `119.0 kB / 150 kB`, HTML export `101.0 kB / 101 kB`; targeted Playwright specs (`e2e/tray.spec.ts` + `e2e/wireProtocol.spec.ts`): `26/26` passed.

- [x] **CP2. Unified Composer surface (`src/studio/composer.ts`)** · M · **Priority:** P0 · **Needs:** `DK1`, `MP4`
  - **Read:** `src/studio/tray.ts`, `src/studio/trayDemo.ts`, `e2e/tray.spec.ts`.
  - [x] Lazy-loaded 720 px rising composer (`combobox` + `listbox` + D14 V3 cut-outs & `trayDemo` side pane), opened via `/`, `C`, and dock field.
  - [x] Delete `src/studio/tray.ts` and its CSS; enforce `<= 36 kB` composer chunk budget in `tools/checkBundleSize.mjs`.
  - **Done when:** View 3 matches; `composer.spec.ts` passes; chunk `<= 36 kB`.
  - **Completed:** 2026-11-26 (`v4-cp2-composer-surface`) · Created lazy `src/studio/composer.ts` + `src/styles/composer.css`, deleted `src/studio/tray.ts` & removed tray CSS from `unlayered.css`/`ui.css`, wired `#btn-all-components` (`<kbd>/</kbd>`), `/` & `C`, `dock.ts`, `interactions.ts`, and `palette.ts`, and replaced `e2e/tray.spec.ts` with `e2e/composer.spec.ts`. `pnpm test`: `1,072/1,072` (`214` suites); `pnpm build` + `pnpm check:size`: composer chunk `13.9 kB / 36 kB`, Entry JS `409.7 kB / 410 kB`, Entry CSS `133.3 kB / 138 kB`, Fonts `119.0 kB / 150 kB`, HTML export `101.0 kB / 101 kB`; `99/99` targeted Playwright tests (`composer`, `toolRail`, `touch`, `topbar`, `a11y`, `slots`, `queue`) and `e2e/v4Visual.spec.ts` (`8/8` zero-diff x2 on updated View 3 composer baselines) passed.

- [ ] **CP3. Chains in the Composer** · S · **Priority:** P0 · **Needs:** `CP1`, `CP2`
  - [ ] Render "Build this chain" row + horizontal strip-map preview when input contains `>`, execute `applyBuild` in one undo step, fly camera, announce toast.
  - **Done when:** View 4 matches; `gateway > orders api > postgres, orders api ~> kafka` builds 4 nodes + 3 wires and `⌘Z` removes all.
  - **Completed:** _pending_

- [ ] **CP4. Find & Commands scopes (`⌘F`, `⌘K`)** · M · **Priority:** P0 · **Needs:** `CP2`
  - **Read:** `src/studio/palette.ts`, `src/studio/nodeSearch.ts`, `src/studio/commands.ts`.
  - [ ] Add "On this page" (top-5 jump & select) and "Commands" sections ordered by entry shortcut (`⌘F` vs `⌘K`).
  - [ ] Delete `palette.ts` UI surface and `nodeSearch.ts` (keep `getPaletteCommands`).
  - **Done when:** Every 3.0 palette command remains reachable with same name and shortcut.
  - **Completed:** _pending_

### Milestone RN: The Run

- [ ] **RN1. Traffic dock face & Strip Map (`src/studio/stripMap.ts`)** · M · **Priority:** P0 · **Needs:** `DK2`
  - **Read:** `src/studio/runBar.ts`, `src/studio/simulationPlayback.ts`, `e2e/runBar.spec.ts`.
  - [ ] Render clickable 15 px stops (9 px > 24 steps, plain track > 48 steps) synced over accessible `<input type="range" id="run-bar-scrubber">`.
  - [ ] Update Traffic dock face (scenario picker, prev, filled-circle play/pause, next, step readout, speed, rose "Fail a component").
  - **Done when:** View 5 matches; Arrow/Home/End keys and 30/60-step fallbacks verified.
  - **Completed:** _pending_

- [ ] **RN2. Beads, train, riding caption & route lighting** · M · **Priority:** P0 · **Needs:** `MP2`, `RN1`
  - **Partial groundwork on `main`:** `src/studio/trafficBeads.ts` already animates beads on live wires.
  - [ ] Add 8 px train ring (`#sim-packet`), counter-scaled 13 px riding pill (`#sim-packet-label`, turns rose `"Blocked"` when end is down), 30% route tube + 16% off-route dim, and arrival bullet pulse.
  - **Done when:** `capsules.spec.ts`, `traces.spec.ts`, `reducedMotion.spec.ts` pass.
  - **Completed:** _pending_

- [ ] **RN3. Per-kind Traffic instruments (`src/studio/instruments.ts`)** · M · **Priority:** P0 · **Needs:** `MP4`, `MP6`
  - **Partial groundwork on `main`:** `src/studio/queueBacklog.ts` handles queue depth blocks.
  - [ ] Implement Traffic-only footer gauges: queue/stream 8 cells (`backlogDepth`), cache hit ring (`cache.hitRate`), limiter pass cells (`limiter`), and replica cells (`replicaCount`).
  - **Done when:** Unit test per instrument passes and instruments appear in View 5.
  - **Completed:** _pending_

- [ ] **RN4. Failure states, cascade & Status Board (`src/studio/statusBoard.ts`)** · M · **Priority:** P0 · **Needs:** `RN3`
  - **Read:** `src/studio/chaos.ts`, `src/studio/chaosPanel.ts`, `e2e/states.spec.ts`, `e2e/chaos.spec.ts`.
  - [ ] Style Failed (rose edge, ✕ bullet, `"Failed"`, 20% hatch, 380 ms shake), Unreachable (dashed `--cc-ink-3`, `chaosDistance * 70ms` fade), and Buffering (amber lamp + filling cells); add `src/styles/studio/run.css`.
  - [ ] Replace `#chaos-panel` (`chaosPanel.ts`) with `statusBoard.ts` above hint line (clears First-Run / Dock collisions).
  - **Done when:** View 6 matches; `states.spec.ts` rewritten; all states distinguishable in greyscale.
  - **Completed:** _pending_

### Milestone RV: Review

- [ ] **RV1. On-map Review Callout & numbered redline (`src/studio/reviewCallout.ts`)** · M · **Priority:** P0 · **Needs:** `DK2`, `MP4`
  - **Partial groundwork on `main`:** `src/studio/redline.ts` draws seeded rough ellipses with issue numbers; `src/studio/dockFaces.ts` holds `fixesFor`.
  - [ ] Build 288 px counter-scaled callout card (3 px redline left border, issue text, primary ink fix button, "Ignore this rule") placed cleanly via right → below → above → left collision check.
  - [ ] Share live state with `dockFaces.ts`; fade ellipse + pulse node on fix; lift greyscale and show `"All clear"` when 0 issues remain.
  - **Done when:** View 7 matches; fixing all showcase issues ends at `"All clear"` with colour restored; callout never overlaps a component at Fit or 100%.
  - **Completed:** _pending_

### Milestone PS: Poster

- [ ] **PS1. Poster frame across exports** · M · **Priority:** P1 · **Needs:** `MP8`, `DK4`
  - **Read:** `src/exporter/titleBlock.ts`, `src/studio/titleBlockStrip.ts`, `src/studio/exportAllPages.ts`, `src/exporter/gif.ts`.
  - [ ] Wrap SVG, PNG, GIF frame, HTML first-paint, and CLI renders in the V4 Poster frame (display title, page subtitle, map-mode sheet, footer Key + 3 title-block cells), toggleable via "Title block" switch.
  - **Done when:** `exportVisual.spec.ts` re-recorded; CLI output matches app output.
  - **Completed:** _pending_

- [ ] **PS2. Two-column Share sheet** · S · **Priority:** P1 · **Needs:** `PS1`
  - [ ] Replace single-column Share/Export UI with 2-column sheet (live poster preview left, formats & link right).
  - **Done when:** View 9 matches and `share.spec.ts` passes.
  - **Completed:** _pending_

### Milestone RL: Release

- [ ] **RL1. First-paint draw-in & dead-code cleanup** · S · **Priority:** P1 · **Needs:** `GR`–`PS`
  - [ ] Implement orchestrated first-paint `stroke-dashoffset` wire draw-in + plate fade/scale (disabled on page switch, undo, and `prefers-reduced-motion`).
  - [ ] Delete unused V3 CSS rules/tokens and lower entry CSS cap in `tools/checkBundleSize.mjs` back to `133 kB`.
  - **Done when:** All bundle budgets pass (`<= 133 kB` CSS).
  - **Completed:** _pending_

- [ ] **RL2. Final 10-view visual, axe & README audit** · S · **Priority:** P1 · **Needs:** `RL1`
  - [ ] Pass squint, arm's-length, stranger, and zero-axe tests across all 10 views in both themes; run `tools/captureReadmeMedia.mjs`; save `docs/v4/after/`.
  - **Completed:** _pending_

- [ ] **RL3. Ship ConduitCraft 4.0.0** · S · **Priority:** P1 · **Needs:** `RL2` + owner go-ahead
  - [ ] Update `package.json` (`4.0.0`) and `RELEASE_NOTES.md`; merge `v4` into `main`.
  - **Completed:** _pending_

---

## Track 2: Next-Gen UX Features (0 / 9)

> All 9 features are prototyped in [`docs/v4/prototype.html`](docs/v4/prototype.html) and designed to respect ConduitCraft's 7-slot chrome ceiling, offline static operation, and single-undo-step ergonomics.

- [ ] **UX-1. Drop-on-Wire Auto-Splice & Midpoint Quick-Actions** · M · **Priority:** P1 · **Needs:** `MP2`, `DK1`
  - **Target modules:** `src/core/spatial.ts`, `src/studio/interactions.ts`, `src/studio/dock.ts`.
  - [ ] Magnetic wire highlight + split indicator when dragging a dock favourite or component over an existing wire; drop splices `A -> Node -> B` in one undo step (preserving tone/protocol, smart async defaults for Queue/Stream, updating matching scenario hops).
  - [ ] Selected-wire midpoint micro-pill: Flip (`⇄`), Toggle Sync/Async (`⚡`), Insert between (`+` scoped Composer).
  - **Completed:** _pending_

- [ ] **UX-2. Dependency Cone (`I`) & A-to-B Critical Path Finder** · M · **Priority:** P1 · **Needs:** `MP2`, `MP5`
  - **Target modules:** `src/core/lineage.ts` (new, pure, reusing `reachability.ts`), `src/studio/keyedStage.ts`, `src/studio/contextToolbar.ts`.
  - [ ] Pressing `I` (or clicking `Trace` in contextual toolbar) isolates upstream callers + downstream dependents at full opacity while dimming unrelated graph to 13%; floating readout pill displays upstream/downstream counts.
  - [ ] `Shift+Click` second component highlights directed path(s) with summed latency (`ms`) and async hop count. Works in View-Only mode.
  - **Completed:** _pending_

- [ ] **UX-3. Geiger Blast-Radius Hover & Status Board Cohort Spotlight** · S · **Priority:** P1 · **Needs:** `RN4`
  - **Target modules:** `src/studio/chaos.ts`, `src/studio/statusBoard.ts`, `src/core/reachability.ts`.
  - [ ] Holding `Alt` (or when "Fail a component" is armed) in Traffic computes live BFS impact on hover without DOM rebuilds, toggling `.geiger-hit`/`.geiger-buf` and floating an impact badge (`✕ N unreachable` vs `✓ Resilient — N copies`).
  - [ ] Hovering any Status Board count (`failed`, `unreachable`, `buffering`) spotlights that cohort on the map.
  - **Completed:** _pending_

- [ ] **UX-4. Context-Aware `@Pattern` Recipes in Composer** · S · **Priority:** P1 · **Needs:** `CP1`, `CP3`
  - **Target modules:** `src/core/quickBuild.ts`, `src/studio/composer.ts`.
  - [ ] Typing `@` lists deterministic multi-node recipes (`@cache-aside`, `@outbox`, `@dlq`, `@rate-limit`) with mini strip preview.
  - [ ] Context-binds to current selection (e.g., `@cache-aside` on a Store wires a Cache + sets `backingId`; `@dlq` on a Queue wires a DLQ + sets `deadLetterId`).
  - **Completed:** _pending_

- [ ] **UX-5. Swimlane Accordion Fold** · M · **Priority:** P2 · **Needs:** `MP1`, `MP3`
  - **Target modules:** `src/core/layout.ts`, `src/studio/keyedStage.ts` (ephemeral UI view state, zero schema change).
  - [ ] Double-click or click header chevron to collapse any swimlane into a 64–68 px vertical pillar showing component + crossing-wire counts; crossing wires neatly route to the pillar edge.
  - **Completed:** _pending_

- [ ] **UX-6. Level Loupe ("Peek Inside") & Spatial Drill-In** · M · **Priority:** P2 · **Needs:** `MP4`, `DK3`
  - **Target modules:** `src/studio/levels.ts`, `src/studio/keyedStage.ts`.
  - [ ] Hovering/focusing a component's `↓ N` level pill floats a miniature live SVG preview of its `child` level; clicking zooms smoothly into the child level and updates NW breadcrumb (`⌘↑` returns).
  - **Completed:** _pending_

- [ ] **UX-7. Before/After Architecture Wipe Compare** · M · **Priority:** P2 · **Needs:** `RV1`, `3.4-b`
  - **Target modules:** `src/studio/reviewCompare.ts` (new), `src/core/diff.ts`.
  - [ ] Toggle inside Review Compare between Redline Overlay and a synchronized `clip-path: inset(...)` vertical split-wipe divider (`role="slider"` on unclipped handle) comparing baseline vs current architecture.
  - **Completed:** _pending_

- [ ] **UX-8. Copy RFC Summary (Markdown) & Keynote Present Mode** · S · **Priority:** P1 · **Needs:** `PS2`, `3.1-c`
  - **Target modules:** `src/core/describe.ts`, `src/studio/shareLink.ts`, `src/studio/presentation.ts`.
  - [ ] One-click "Copy RFC Summary" in Share sheet generating deterministic Markdown (component inventory, numbered scenario flow, latency budget, open Review findings, view-only link).
  - [ ] Live animated beads along the active step's wire during Present mode + optional click-hold pointer spotlight.
  - **Completed:** _pending_

- [ ] **UX-9. Gentle Tidy & Equal-Gap Spacing Handles** · M · **Priority:** P2 · **Needs:** `MP3`
  - **Target modules:** `src/core/tidy.ts` (new, pure), `src/studio/interactions.ts`.
  - [ ] `Shift+L` ("Tidy Selection / Sheet") snaps near-aligned rows/columns (`±20 px`) and resolves overlaps without destroying the author's layout; 3+ aligned selected nodes expose inline equal-gap drag handles.
  - **Completed:** _pending_

---

## Track 3: `FEATURES_AFTER_V3.md` Queue (0 / 18)

### Release 3.1: Scenarios Everywhere

- [ ] **3.1-a. Numbered scenarios on the sheet (Design + exports)** · M · **Priority:** P2 · **Needs:** `MP7`, `MP8`
  - Add optional `wires?: string[]` on `SimulationStep`; show numbered scenario markers on Design wires + SVG/PNG exports with scenario name in poster/title block.
  - **Completed:** _pending_

- [ ] **3.1-b. Record a scenario by clicking** · M · **Priority:** P1 · **Needs:** `3.1-a` (or compatible step wire lookup)
  - Add "Record" mode in `src/studio/inspector.ts` scenario editor: clicking components appends hops and lights travelled wires (`Enter` ends step, `Esc` ends recording, one undo step).
  - **Completed:** _pending_

- [ ] **3.1-c. Present walks a scenario** · M · **Priority:** P1 · **Needs:** `3.1-a`
  - Replace file-order node tour in `src/studio/presentation.ts` (`buildTourSteps`) with selected scenario's story (overview + step framing + sentence caption; falls back to node tour when no scenario exists).
  - **Completed:** _pending_

- [ ] **3.1-d. Auto-generated Sequence View (`scenarioToSequence`)** · M · **Priority:** P1 · **Needs:** `3.1-a`
  - Pure `scenarioToSequence(doc, scenarioId)` in `src/core/` + read-only SVG overlay/dialog + SVG/PNG export.
  - **Completed:** _pending_

### Release 3.2: Fewer, Clearer

- [ ] **3.2-a. Name, Technology, Description (8 fields -> 3)** · M · **Priority:** P2 · **Needs:** `RL3` (requires schema bump after V4 D2 freezes schema for 4.0)
  - Audit template field usage first; migrate `eyebrow` -> `technology`, merge extra text fields into `summary`, derive readout when `chip` empty, simplify inspector Look tab.
  - **Completed:** _pending_

- [ ] **3.2-b. ~40 Monochrome Technology Marks** · S · **Priority:** P2 · **Needs:** `3.2-a`, `MP4`
  - Lazy `< 30 kB` SVG mark table rendered inside V4 `src/ui/bullet.ts` (never brand colours) + export parity.
  - **Completed:** _pending_

- [ ] **3.2-c. Simplify wire route picker (9 -> 4)** · S · **Priority:** P3 · **Needs:** none (can pull forward into `DK6`)
  - Show Auto, Straight, Elbow, Curve in `src/studio/inspector.ts` (plus 5th entry only if an opened file uses one of the legacy routes).
  - **Completed:** _pending_

- [ ] **3.2-d. Colour by Owner & Swimlane** · S · **Priority:** P3 · **Needs:** `DK4` (legend half already absorbed by V4 `mapKey.ts`)
  - Add `owner` and `lane` to `ColourBy` in `src/core/meta.ts` with stable 7-tone assignment and counts.
  - **Completed:** _pending_

- [ ] **3.2-e. Three "Reading" rules in Review** · S · **Priority:** P3 · **Needs:** `3.2-a`
  - Add `no-description`, `two-way-unlabeled`, and `too-dense` (> 25 nodes) to `INSIGHT_RULES` in `src/core/insights.ts`.
  - **Completed:** _pending_

- [ ] **3.2-f. `Alt+Arrow` keys that build** · S · **Priority:** P3 · **Needs:** `CP3` (partially absorbed by Composer chains)
  - Quick-add connected component of same kind in arrow direction with one component selected.
  - **Completed:** _pending_

### Release 3.3: Load

- [ ] **3.3-a. Deterministic load model (`src/core/load.ts`)** · M · **Priority:** P2 · **Needs:** `RL3`
  - Add `capacity?: number` next to Copies; pure `computeLoad(doc, rps, failed)` modelling entry split, balancer/cache/limiter/queue/stream rules, 80% near-limit & 100% saturated states.
  - **Completed:** _pending_

- [ ] **3.3-b. Load stepper (`1x / 2x / 5x / 10x`) in Traffic dock** · M · **Priority:** P2 · **Needs:** `3.3-a`, `RN1`
  - Add Load control to Traffic dock face (hidden when no component has `capacity`), show "Near limit" & "Saturated" states and denser beads.
  - **Completed:** _pending_

- [ ] **3.3-c. "First to give out" summary & `no-headroom` (rule #20)** · S · **Priority:** P2 · **Needs:** `3.3-b`
  - Add bottleneck sentence ("a sketch, not a load test") to run summary, `describeDiagram`, HTML export, and rule #20 in `insights.ts`.
  - **Completed:** _pending_

### Release 3.4: Agents & Change

- [ ] **3.4-a. `conduitcraft mcp` agent tool interface** · M · **Priority:** P1 · **Needs:** none (pure CLI/MCP addition to `tools/conduitcraft.ts`)
  - Hand-written stdio MCP server exposing `read`, `write` (coordinate-free + ELK layout), `check`, `fail`, `render`, and `load` (post-3.3); pipe tests + `docs/guide.md`.
  - **Completed:** _pending_

- [ ] **3.4-b. Visual Compare in Review lens** · M · **Priority:** P2 · **Needs:** `RV1`
  - Unify `computeDocumentDiff` (`src/core/diff.ts`), `snapshotsDialog.ts`, and `driftDialog.ts` into the Review lens with colour-new / struck-removed / circled-changed marks + export.
  - **Completed:** _pending_

- [ ] **3.4-c. Visual "What changed" in GitHub Action (`tools/action.sh`)** · S · **Priority:** P3 · **Needs:** `3.4-b`
  - Render and attach Compare picture when PR modifies a Blueprint file.
  - **Completed:** _pending_

- [ ] **3.4-d (1). View-only share link** · S · **Priority:** P1 · **Needs:** `PS2`
  - Share link flag opening diagram in read-only viewer mode (`src/studio/shareLink.ts` + viewer).
  - **Completed:** _pending_

- [ ] **3.4-d (2). Direct Print / PDF** · S · **Priority:** P3 · **Needs:** `MP9`, `PS1`
  - Print sheet using Print style + poster title block (`@media print` + Print trigger).
  - **Completed:** _pending_

---

## Baseline & Bundle Measurement Log

| Checkpoint | Unit Tests | Playwright Specs | Entry JS | Entry CSS | Fonts | Composer Chunk |
|---|---:|---:|---:|---:|---:|---:|
| **GR1 Baseline (`v4` start)** | 1,046 (209 suites) | 75 files / 434 tests (425 pass, 1 skip, 8 stale `v3Visual`) | 403.6 kB / 410 kB | 134.7 kB / 138 kB | 78.6 kB / 150 kB | — |
| **After `MP` (Map)** | | | | | | — |
| **After `DK` (Dock/Shell)** | | | | | | — |
| **After `CP` (Composer)** | | | | | | _TBD (cap 36 kB)_ |
| **After `RN` + `RV` + `PS`** | | | | | | |
| **RL1 Final (`<= 133 kB` CSS)** | | | | | | |

---

## How to Update This Tracker

1. **Follow `Needs`:** Pick the next `[ ]` item whose dependencies are all `[x]` (respecting Priority `P0` → `P1` → `P2` → `P3`).
2. **Tick in the same PR/commit:** Change `[ ]` to `[x]` on both the item and its sub-bullets, fill in the `Completed:` line with PR/commit SHA + measured numbers, and update the **Live Progress Dashboard** counts.
3. **Verify before ticking:** Every V4/app PR must pass:
   ```bash
   pnpm test && pnpm build && pnpm check:size && pnpm test:e2e
   ```
   and include Day/Night screenshots for changed visual views with zero axe violations.
