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
| **Track 1: V4 Ground (`GR`)** | Baseline, V4 two-tier tokens, Bricolage Grotesque (`GR1`–`GR3`) | 1 | 3 | In progress (`GR1` done; `GR2`/`GR3` unblocked) |
| **Track 1: V4 The Map (`MP`)** | Bands, lines, shared track, plates/bullets, LoD, labels, exports (`MP1`–`MP9`) | 0 | 9 | Blocked on `GR` (partial groundwork on `main`) |
| **Track 1: V4 Dock & Shell (`DK`)** | Inverted dock, morph, breadcrumb, always-on Key, card, narrow (`DK1`–`DK8`) | 0 | 8 | Blocked on `GR2`/`MP4` |
| **Track 1: V4 Composer (`CP`)** | Pure `quickBuild`, unified `/` composer, chains, find/commands (`CP1`–`CP4`) | 0 | 4 | Blocked on `GR1`/`DK1` |
| **Track 1: V4 Live Run (`RN`)** | Strip map, beads/train/caption, instruments, states/board (`RN1`–`RN4`) | 0 | 4 | Blocked on `DK2`/`MP2`/`MP4` |
| **Track 1: V4 Review (`RV`)** | On-map 288 px callout + redline numbers (`RV1`) | 0 | 1 | Blocked on `DK2`/`MP4` |
| **Track 1: V4 Poster & Release (`PS`, `RL`)** | Poster exports, 2-col Share sheet, draw-in, final audit, ship (`PS1`–`RL3`) | 0 | 5 | Blocked on `MP8`/`DK4` |
| **Track 2: Next-Gen UX (`UX`)** | Splice, Cone/Path, Geiger, `@Patterns`, Fold, Loupe, Wipe, RFC, Tidy (`UX-1`–`UX-9`) | 0 | 9 | Prototype-verified; phased with V4 & Post-V4 |
| **Track 3: After V3 (`3.1`–`3.4`)** | Scenarios, 3 fields + 40 marks, Load, `conduitcraft mcp`, Compare (`3.1-a`–`3.4-d`) | 0 | 18 | Sequenced post-V4 (except `3.2-c`) |
| **Overall** | | **3** | **63** | **4.8%** |

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

## Track 1: `REDESIGN_PLAN_V4.md` Core Milestones (0 / 34)

> **Key Gap Note vs. `REDESIGN_PLAN_V4.md`:** v3.1.0 shipped **Callouts** (`variant: 'callout'`, schema v15) after the V4 plan was drafted. Callout styling, counter-scaling, and export parity must be carried into `MP4`, `MP8`, and `PS1`.

### Milestone GR: Ground

- [x] **GR1. Baseline measurements & `v4Visual.spec.ts`** · S · **Priority:** P0 · **Needs:** `PRE-1`
  - **Read:** `REDESIGN_PLAN_V4.md` §10.4, §11 (`GR1`), `e2e/v3Visual.spec.ts`, `tools/checkBundleSize.mjs`.
  - [x] Run `pnpm test`, `pnpm build`, `pnpm check:size`, `pnpm test:e2e` and record baseline counts/sizes in the Baseline Log below.
  - [x] Add `e2e/v4Visual.spec.ts` covering the 10 views in both themes (reduced motion) and save `docs/v4/before/` baselines.
  - [x] Raise entry CSS budget comment/limit in `tools/checkBundleSize.mjs` to `138 kB` for `MP` headroom (and updated `tests/primitives.test.ts:72` assertion; note: entry JS cap is already `410 kB`).
  - **Done when:** `v4Visual.spec.ts` passes twice consecutively with zero diff.
  - **Completed:** 2026-11-25 · `v4Visual.spec.ts` (8/8) passed twice with zero diff (`20` PNGs in `docs/v4/before/`). `pnpm test`: 1,046/1,046 (209 suites); Entry JS `403.6 kB`, Entry CSS `134.7 kB`, Fonts `78.6 kB`; `pnpm test:e2e`: 425 passed, 1 skipped (`propertiesCard.spec.ts:40`), 8 stale `v3Visual.spec.ts` snapshot diffs on `main`.

- [ ] **GR2. Two-tier colour tokens & `--k` counter-scale** · M · **Priority:** P0 · **Needs:** `GR1`
  - **Read:** `src/styles/shared.css`, `src/studio/state.ts`, `tests/contrast.test.ts`.
  - [ ] Update surviving `--cc-*` values and add `--cc-canvas*`, `--cc-band-*`, `--cc-plate*`, `--cc-dock`, `--cc-on-dock`, `--cc-on-bullet`, and 7 `--cc-line-*` tokens for Day & Night (`graphite`).
  - [ ] Make `[data-tone]` and `[data-accent]` set `--tl` beside `--t`.
  - [ ] Write `--k = clamp(1, 0.78 / scale, 1.6)` (or `0.89 / scale` if needed for >= 15 px Fit test) beside `data-lod` in `src/studio/state.ts`.
  - [ ] Assert all line tones at 3:1 against bands, canvases, and `--cc-on-bullet` (both themes) in `tests/contrast.test.ts`.
  - **Done when:** Contrast tests pass in both themes with no unintended layout shifts.
  - **Completed:** _pending_

- [ ] **GR3. Self-hosted display face (Bricolage Grotesque)** · S · **Priority:** P0 · **Needs:** `GR1`
  - **Read:** `src/styles/fonts.css`, `tools/swPrecache.ts`, `e2e/fonts.spec.ts`, `REDESIGN_PLAN_V4.md` §5.2 & Q1.
  - [ ] Add Latin-subsetted Bricolage Grotesque `.woff2` (wght 700–800, wdth 78–88, opsz 24) + OFL licence under `src/styles/fonts/`.
  - [ ] Define `@font-face` (`font-display: swap` + size-adjusted fallback) and `--cc-font-map`; precache in `tools/swPrecache.ts`.
  - **Done when:** Total `.woff2` fonts <= `150 kB`, `fonts.spec.ts` and offline tests pass.
  - **Completed:** _pending_

### Milestone MP: The Map

- [ ] **MP1. Alternating bands & sheet cleanup** · S · **Priority:** P0 · **Needs:** `GR2`, `GR3`
  - **Read:** `renderZones` in `src/studio/keyedStage.ts`, `src/styles/studio/stage.css`.
  - [ ] Remove dot grid and lane hairlines; style lanes as radius-28 alternating `--cc-band-a` / `--cc-band-b` bands.
  - [ ] Render two-digit light lane number + display-face title scaled by `--k`.
  - **Done when:** View 1 matches `docs/v4/concept.html` bands and heads.
  - **Completed:** _pending_

- [ ] **MP2. Transit lines, bridge casings & radius 24** · M · **Priority:** P0 · **Needs:** `GR2`
  - **Read:** `renderWiresOnly` in `src/studio/keyedStage.ts`, `src/core/layout.ts` (`cornerRadius`), `src/styles/studio/stage.css`, `index.html` markers.
  - [ ] Extract `src/styles/studio/lines.css`; implement 3 px × `--k` `--tl` rails, `--cc-band-a` casing (`+5 px`) for bridges, round caps/joins, corner radius 24.
  - [ ] Add filled arrowhead (`10 x 11 px x --k`, rail trimmed 9 px) + 3.6 px source stop; round async dashes (`2w 2.3w`); 4.5 px wider ink selection underlay.
  - [ ] Remove unused `arrow-*` / `chevron-*` SVG `<defs>` from `index.html`.
  - **Done when:** Crossings read as bridges in both themes; `wireProtocol.spec.ts` and `capsules.spec.ts` pass/rewritten.
  - **Completed:** _pending_

- [ ] **MP3. Pure shared-track port spreading (`src/core/portSpread.ts`)** · S · **Priority:** P0 · **Needs:** `MP2`
  - **Partial groundwork on `main`:** `spreadPorts()` already exists in `src/core/layout.ts` (PRs #162/#163).
  - [ ] Extract/align pure `src/core/portSpread.ts` + `tests/portSpread.test.ts` enforcing 14 px parallel spacing on shared sides with level wires kept straight.
  - [ ] Apply identically in `keyedStage.ts` and `src/exporter/diagramSvg.ts` without mutating saved port fields.
  - **Done when:** 3-wire fixture shows parallel lines, level wire stays straight, open/save is byte-identical.
  - **Completed:** _pending_

- [ ] **MP4. Plates, bullets (`src/ui/bullet.ts`) & 3.1 Callout styling** · M · **Priority:** P0 · **Needs:** `GR2`, `GR3`
  - **Read:** `renderNodes` in `src/studio/keyedStage.ts`, `src/core/nodeStyle.ts`, `src/ui/icons.ts`, `src/ui/cutout.ts`, `src/styles/studio/callouts.css`.
  - [ ] Create `src/ui/bullet.ts` (`renderBulletMarkup(stencilId, { size, tone })`) with 24-grid crisp glyphs.
  - [ ] Implement card anatomy (`--cc-plate`, 1.5 px `--cc-plate-edge`, radius 18, no shadow), shaped silhouettes (cylinder, pipe, hex, mux, pill), ring-only Actor terminus, dashed External edge.
  - [ ] Map `eyebrow`, `chip`, `footerLeft`, `status`, status badge to footer row; update v3.1.0 Callouts (`callouts.css`) to V4 tokens and edge language.
  - **Done when:** All 14 catalog entries match mockup at 100%; 28-char titles wrap cleanly inside every shape.
  - **Completed:** _pending_

- [ ] **MP5. Selection crop marks, bullet hover & draft ports** · S · **Priority:** P0 · **Needs:** `MP4`
  - [ ] Selected plate gets 3 px edge + 4 outer ink crop marks 10 px outside box corners (no rounded outer box).
  - [ ] Bullet scales to 108% with `--cc-spring` on hover; restyle `.node-port` and draft wire to `--tl`.
  - **Done when:** View 2 matches; `interactions.spec.ts` and `roving.spec.ts` pass.
  - **Completed:** _pending_

- [ ] **MP6. Two LoD modes (Map vs Card) & arm's-length test** · M · **Priority:** P0 · **Needs:** `MP4`
  - **Partial groundwork on `main`:** `data-lod="low"` and `"medium"` hooks already toggle at 55% / 80% in `src/studio/state.ts` and `src/styles/studio/stage.css`.
  - [ ] Move map/plate/bullet CSS into `src/styles/studio/map.css` (shared with `viewer.css`).
  - [ ] In Map mode (`data-lod="low"`), scale name (`17 px x --k` up to 24 screen px) & bullet (`30 px x --k`), hide kind/subtitle/footer (except Traffic instruments & state words).
  - [ ] Assert in `e2e/map.spec.ts` (View 1) that no component name renders below 15 screen px at Fit.
  - **Done when:** Arm's-length assertion passes; `e2e/map.spec.ts` rewritten and green.
  - **Completed:** _pending_

- [ ] **MP7. Wire labels layer above `#nodes-layer` & "fits" rule** · S · **Priority:** P0 · **Needs:** `MP2`
  - **Partial groundwork on `main`:** Draggable wire labels and low-zoom hover-show landed in PR #176.
  - [ ] Render 22 px label pills in a dedicated SVG layer *above* `#nodes-layer` so tight gaps never clip pill text.
  - [ ] Show automatically at `high` zoom only when longest straight run >= `pillWidth + 24 px`; always show on hover, selection, or active scenario step.
  - **Done when:** Zero label-behind-plate clipping at 100% in showcase; hover shows any wire's label.
  - **Completed:** _pending_

- [ ] **MP8. Export parity (SVG, standalone HTML, viewer)** · M · **Priority:** P1 · **Needs:** `MP1`–`MP7`
  - **Read:** `src/exporter/diagramSvg.ts`, `src/exporter/standaloneHtml.ts`, `src/styles/viewer.css`, `e2e/exportVisual.spec.ts`.
  - [ ] Port bands, lines, bridges, bullets, plates, labels layer, and v3.1.0 Callouts to `diagramSvg.ts`, `standaloneHtml.ts`, and `viewer.css`.
  - [ ] Embed Bricolage Grotesque in exports per V3 Q3 rule.
  - **Done when:** Stage and SVG export of showcase differ by < 2% pixels at Fit; `exportVisual.spec.ts` baselines re-recorded and green.
  - **Completed:** _pending_

- [ ] **MP9. Sketch & Print styles re-derived** · S · **Priority:** P1 · **Needs:** `MP8`
  - [ ] Re-derive Sketch (rough filter on plate edges/lines, crisp bullets) and Print (white hairline bands, 2.5 px lines mapped to text tier, dashed async) from V4 Blueprint.
  - **Done when:** `diagramStyle.spec.ts` passes with updated baselines.
  - **Completed:** _pending_

### Milestone DK: The Dock & The Shell

- [ ] **DK1. Inverted dock — Design face** · M · **Priority:** P0 · **Needs:** `MP4`
  - **Read:** `src/studio/dock.ts`, `src/studio/dockFavourites.ts`, `src/styles/studio/layout.css`, `e2e/toolRail.spec.ts`.
  - [ ] Style `--cc-dock` 60 px pill (radius 30, `--cc-on-dock`) as the sole inverted surface on screen.
  - [ ] Render 5 tools (`V/W/H/T/F`), 6 favourite bullets (drag or click-arm), "Add or find anything `/`" trigger (`#btn-all-components`), and Run (`#btn-run`).
  - **Done when:** Views 1 & 2 match; favourite drag-to-sheet and roving focus pass.
  - **Completed:** _pending_

- [ ] **DK2. Sliding lens switch & dock width morph** · S · **Priority:** P0 · **Needs:** `DK1`
  - [ ] Add `--cc-spring` (340 ms) sliding ink thumb to N lens switch and animated width morph + 6 px face cross-fade to dock (`src/styles/studio/dockFaces.css`).
  - **Done when:** `lensKeys.spec.ts` passes with zero layout shift in sibling slots.
  - **Completed:** _pending_

- [ ] **DK3. Title island & page/level breadcrumb (`src/studio/breadcrumb.ts`)** · M · **Priority:** P0 · **Needs:** `GR2`
  - **Read:** `src/studio/pageTabs.ts`, `src/studio/pageMenu.ts`, `src/studio/levels.ts`.
  - [ ] Replace `paintPageTabs` with `paintBreadcrumb` inside NW island (`Mark`, title, page + open level trail + chevron opening `pageMenu.ts`, quiet save state).
  - [ ] Remove `#page-strip` / `#page-tabs` from SW slot; preserve `Alt+PageUp/PageDown` and `⌘↑`.
  - **Done when:** Rewritten `pages.spec.ts`, `levels.spec.ts`, `topbar.spec.ts` pass.
  - **Completed:** _pending_

- [ ] **DK4. Always-visible Key (`src/studio/mapKey.ts`)** · M · **Priority:** P0 · **Needs:** `DK3`, `MP2`
  - **Read:** `src/studio/slotPopovers.ts`, `e2e/slots.spec.ts`.
  - [ ] Render always-on SW Key listing tones in layout order (26 × 4 px swatch, dashed if all wires async), collapsible to a single "Key" button (remembered per browser, open by default).
  - [ ] Hovering/focusing a row sets `data-key="<tone>"` on `#stage-world` (dims others to 13%); clicking label renames in place as one undo step.
  - **Done when:** Stranger test passes on View 1; hover & focus filtering + undoable rename pass.
  - **Completed:** _pending_

- [ ] **DK5. NE, SE & single hint line** · S · **Priority:** P0 · **Needs:** `DK1`
  - [ ] Update NE (Find, Theme, ink Share button), SE (zoom out, `%` click for 100%, zoom in, Fit + existing minimap/outline triggers), and single `#hud-status-tip` hint line above dock.
  - **Done when:** `tooltips.spec.ts` and `camera.spec.ts` pass.
  - **Completed:** _pending_

- [ ] **DK6. Properties card & remaining chrome re-styled** · S · **Priority:** P0 · **Needs:** `MP4`
  - [ ] Update `src/studio/inspector.ts` header to 36 px bullet + display title + 26 px line-tier colour dots; apply V4 tokens & display headings to Home, Templates, Snapshots, Code pane, First run, Dialogs.
  - **Done when:** `propertiesCard.spec.ts` passes and View 10 (Home) matches.
  - **Completed:** _pending_

- [ ] **DK7. Retire the cut-out (`src/ui/cutout.ts`)** · S · **Priority:** P1 · **Needs:** `DK1`, `DK6`, `CP2`
  - [ ] Replace any remaining `renderCutoutMarkup` call with `renderBulletMarkup`; delete `src/ui/cutout.ts` and `tests/cutout.test.ts`.
  - **Done when:** `grep -rn cutout src/` returns empty.
  - **Completed:** _pending_

- [ ] **DK8. Narrow & touch layout (< 900 px)** · M · **Priority:** P1 · **Needs:** `DK1`–`DK5`, `CP2`
  - [ ] Stack NW+NE over N, fold Key into SE button, hide favourites, allow horizontal dock scroll without clipping, full-width composer without side panel.
  - **Done when:** `touch.spec.ts` passes at `375x812` with >= 44 px dock targets.
  - **Completed:** _pending_

### Milestone CP: The Composer

- [ ] **CP1. Pure chain grammar (`src/core/quickBuild.ts`)** · M · **Priority:** P0 · **Needs:** `GR1`
  - **Read:** `src/studio/trayWords.ts`, `src/templates/presets.ts`, wire creation in `src/studio/interactions.ts`.
  - [ ] Implement pure `planBuild` and `applyBuild` (`>` sync, `~>` async, `,` branch, reuse by title, `WORDS` kind inference, longest-path DAG column/row layout, 24-node / 40-wire limits, one undo step).
  - **Done when:** `tests/quickBuild.test.ts` passes with zero DOM (including cycles, unicode names, duplicates, limits).
  - **Completed:** _pending_

- [ ] **CP2. Unified Composer surface (`src/studio/composer.ts`)** · M · **Priority:** P0 · **Needs:** `DK1`, `MP4`
  - **Read:** `src/studio/tray.ts`, `src/studio/trayDemo.ts`, `e2e/tray.spec.ts`.
  - [ ] Lazy-loaded 720 px rising composer (`combobox` + `listbox` + 62% live plate preview & tray demos), opened via `/`, `C`, and dock field.
  - [ ] Delete `src/studio/tray.ts` and its CSS; enforce `<= 36 kB` composer chunk budget in `tools/checkBundleSize.mjs`.
  - **Done when:** View 3 matches; `composer.spec.ts` passes; chunk `<= 36 kB`.
  - **Completed:** _pending_

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
