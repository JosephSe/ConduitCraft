# ConduitCraft 2.0: Implementation Plan, V2

**Written:** 2026-11-03, against `main` at `ad4b336` (after PR #28).
**Replaces:** the status, order and delivery sections of [`REDESIGN_PLAN.md`](REDESIGN_PLAN.md) (V1). V1 is still the **spec**: its principles (section 4), screens (5), visual language (6), feature descriptions (7), foundations (8), quality bars (10), non-goals (11) and word list (Appendix A) all still apply.
**Rule when the two disagree:** on *what to do next* and *what is done*, V2 wins. On *how a feature behaves*, V1 wins unless a V2 item says otherwise.

---

## Contents

1. [How to use this file](#1-how-to-use-this-file)
2. [Verified status](#2-verified-status)
3. [Why work stalled](#3-why-work-stalled)
4. [Decisions taken in V2](#4-decisions-taken-in-v2)
5. [The queue](#5-the-queue)
6. [Definition of done (every PR)](#6-definition-of-done-every-pr)
7. [Open questions, with defaults](#7-open-questions-with-defaults)

---

## 1. How to use this file

These rules are for whoever picks up the next piece of work, person or agent.

1. **Next item:** the first `[ ]` item in [section 5](#5-the-queue) whose **Needs** items are all `[x]`. Do not skip ahead and do not pick by interest.
2. **Blocked?** Write `Blocked: <reason>` under the item, leave it `[ ]`, and take the next unblocked item *in the same milestone*. If every item in the milestone is blocked, stop and ask.
3. **One item, one branch, one PR.** Branch from a fresh `main` and name it after the item: `a3-first-run`, `b2-indexeddb`. Never reuse a branch whose PR has merged. (`t02-lens-state` carried five PRs about F-01 and F-17, and `f02-architecture-insights` carried F-03. That made the history hard to read.)
4. **Update this file in the same PR:** tick the box, add the PR number, and turn anything you didn't finish into a **new queue item** with its own ID placed right after the current one. Don't leave it as a "still open" note inside a done item. Most of V1's confusion came from those notes.
5. **Size:** S is up to 2 days, M is 3 to 5 days, L is more. An L item must be split into PRs of size M or smaller before work starts. The splits are listed below.
6. **When in doubt about behaviour:** use the default in [section 7](#7-open-questions-with-defaults), say so in the PR description, and keep going.

---

## 2. Verified status

Checked against the source, the PR list and a local run on 2026-11-03: `npm test` gives **359/359 passing**, `npm run build` is clean, and `npm run check:size` passes. Entry JS is 429.0 / 480 kB and **entry CSS is 111.9 / 115 kB**, which leaves only 3 kB of CSS headroom (see A2).

### 2.1 Done

| Item | What shipped | PR |
|---|---|---|
| Honest wording | README and app no longer claim live telemetry | #6 |
| R-06 | Roving tabindex, canvas is one tab stop | #7 |
| T-06 | One live-region announcer (`studio/a11y.ts`) | #8 |
| R-07 | Context menu (right-click, `Shift+F10`), dashed group outlines | #9 |
| T-01 | Action registry (`core/actions.ts`, `core/keymap.ts`) | #10 |
| R-01 | Top bar with at most 8 controls | #11 |
| R-02 (part) | Tool rail with Select and Wire; V, W, Z, N, C shortcuts | #12 |
| Contextual toolbar (part) | Rename, duplicate, lock, group, ungroup, delete, wire, arrange, ⋯ | #13 |
| T-05 | Lazy starter templates, per-chunk budgets | #14, #16 |
| Inspector | Appears with a selection, collapsible sections, pin | #15, #16 |
| R-09 | Plain-language pass, simpler component form | #17 |
| `--cc-*` tokens | Applied to the new chrome | #21 |
| e2e under both UIs | Whole Playwright suite runs under `?ui=1` and `?ui=2` | #20 |
| T-02, R-03 | Lens state, switcher, keys `1` to `4` | #22 |
| R-04 | Run bar replaces the Simulations tab | #22 |
| T-03 | Schema version and migration chain (now **v7**) | #22 |
| F-17 | Wire protocol, sync/async, latency; latency sets packet and dash pace | #22, #23, #24 |
| F-26, F-27 | Legend, tags, colour-by, tag filter, owner, links | #22, #23 |
| `?ui=2` default | Redesign is default; "Classic layout" in settings | #22 |
| **F-01** | Fail and restore (`X`, menu), reachability, resilience (replicas, fallback, circuit breaker), summary panel, Alt blast-radius preview, saved chaos scenarios, wires stop, orange "potential disruption" on callers, announcements | #25, #26 |
| **F-02** | All 8 rules, Review lens and issues panel, canvas badges, per-rule muting, fail from Review | #27 |
| **F-03 (most)** | Drill-down (`⌘↵`, `⌘↑`, `Esc`, ⤵ badge, breadcrumb), boundary ports, one undo stack across levels, search and insights across levels, YAML `children:`, HTML export with drill-down, schema v7 | #28 |

### 2.2 Shipped with leftovers (each leftover is now a queue item)

| Item | Leftover | Queue ID |
|---|---|---|
| R-02 tool rail | Hand tool, Text tool, Frame tool (the Frame tool needs F-09) | C1, D1 |
| Contextual toolbar | Colour, kind and shape buttons | C2 |
| F-03 levels | Mermaid `subgraph` import as levels; chaos doesn't cross levels (it runs on `app.doc`, the open level only) | A4, A5 |
| Classic layout | To be removed "after one release", but no release has been defined | A11, B1 |
| e2e | `e2e/camera.spec.ts:75` (window resize keeps the zoom) fails, on a clean `main` too | A1 |

### 2.3 Not started

R-08, R-10, F-04 to F-16, F-18 to F-25, F-28 to F-31, T-04, T-07, and the README GIF re-record. All of these are scheduled in section 5.

---

## 3. Why work stalled

The last agent wasn't sure what to do next, and V1 explains why:

1. **Two sets of checkboxes that disagree.** Every feature in V1 section 7 still says `[ ] Shipped in PR —`, including F-01, F-02, F-17, F-26 and F-27, which have shipped. Section 9 ticks some of them. F-01 is unticked in section 9 even though #25 and #26 shipped it.
2. **The order was broken and never repaired.** F-03 belongs to phase 6, after F-09 Frames, but it shipped straight after F-02. After that, "next" could mean the rest of phase 3, phase 4, or the rest of phase 6.
3. **Leftovers were prose, not items.** "Still open: Frame, Text and Hand tools" and "Still open: colour, kind and shape buttons" are sentences inside done items, so nothing in the queue points at them.
4. **The header and baseline are stale.** The header says "Phase 1 is partly done", and the baseline counts 237 unit tests and 62 e2e tests. The real figures are 359 unit tests and 25 spec files run under two UIs.
5. **Phases 4 to 8 are themes, not PRs.** For example, "F-06 Importers: Docker Compose and OpenAPI first, then Kubernetes" doesn't say what one PR is.
6. **A hidden blocker.** Every remaining phase-3 item adds UI (first-run card, help popovers, outline panel), and the CSS budget has 3 kB left.

V2 fixes these with one queue, explicit IDs for leftovers, PR-sized items and a budget task at the front.

---

## 4. Decisions taken in V2

Each decision here settles something that would otherwise block an item. Change one by editing this section in its own PR.

| # | Decision | Reason |
|---|---|---|
| D1 | **Finish phase 3 before starting phase 4.** Milestone A covers the rest of phase 3 plus the F-03 leftovers. | The phase-3 award checklist ("a new visitor sees a failure ripple out within 10 seconds") depends on R-08, and F-01 is already built for it. |
| D2 | **"One release" means a `v2.0.0` tag.** Tag it at the end of milestone A (item A11). Classic layout is removed in B1, the first item after the tag. | V1 promised one release of Classic but never defined a release. `package.json` is still `1.0.0`. |
| D3 | **CSS budget:** reclaim at least 8 kB before adding new UI (A2). Raise the budget only as a last resort, by at most 5 kB, with the reason in the PR. B1 (removing Classic) should free much more. | Every item in milestone A adds CSS. |
| D4 | **Levels before frames is fine (open question 5).** Frames (F-09) still ship, in milestone D, as free-form boxes on one level. "Open frame as level" is a later option, not a requirement. | Levels already shipped and undo across levels works. Frames are a layout tool, not a structure tool. |
| D5 | **Chaos crosses levels in one direction.** Failing a component that has a child level marks every component in that child level as failed when the child level is opened. Failing a component inside a child level does **not** fail its parent. A child level's boundary ports show as "cut off" when the outside component they connect to has failed. | This is the simplest rule that is still honest. Tracing reachability through every level is out of scope until someone asks for it. |
| D6 | **Mermaid `subgraph` import:** the import dialog asks "Subgraphs as: Swimlanes (current) / Levels". The default stays Swimlanes, so existing imports don't change. Frames become a third option once F-09 exists. | Keeps old behaviour and the import report unchanged by default. |
| D7 | **Phase 5 order:** T-07 headless core goes first, then F-23 CLI, then F-21 live data, then F-24 drift. | T-07 is the riskiest part (it may expose DOM coupling). F-24 needs the importers from milestone B. F-21 has an open CORS question that can be answered while T-07 is built. |
| D8 | **Mermaid is import only.** ConduitCraft reads Mermaid flowcharts (paste, open, drop) but never writes them: no `.mmd` export, no Mermaid view in the code dialog, no `.mmd` save. The Blueprint file is the one text format we write. This replaces the export half of D6 and A5, and the Mermaid ↔ Blueprint switching in V1 F-05 rule 4. Removal is item A5b. | Keeping a lossy second writer in step with every new field (levels, frames, legend, wire fields) costs time on every item and adds little: people bring Mermaid in, and they keep working in ConduitCraft or the Blueprint file. |

---

## 5. The queue

Status key: `[ ]` todo, `[~]` in review, `[x]` merged. Add the PR number after the ID when it ships.

### Milestone A: Finish the signature (phase 3 and F-03 leftovers)

**Goal:** a first-time visitor watches a request travel, sees a failure ripple out, and can read the diagram without sight. It ends with the `v2.0.0` tag.

#### [x] A1. Fix the failing camera resize test · S (#30)
- **Why:** an e2e test that always fails trains people to ignore red builds.
- **Do:** find out why `e2e/camera.spec.ts:75` fails on a clean `main`, using the systematic-debugging approach (reproduce, isolate, fix the cause). Fix the app if the camera really does drift on resize. Fix the test only if its assumptions are wrong, and say which it was in the PR. Don't skip the test or add retries.
- **Files:** `src/studio/camera.ts`, `src/studio/viewportFrame.ts`, `e2e/camera.spec.ts`.
- **Done when:** the full Playwright suite passes locally and in CI under both UIs.

#### [x] A2. Reclaim CSS headroom · S (#31)
- **Why:** 3 kB is left and milestone A adds UI (D3).
- **Do:** list the selectors in `src/styles/studio.css` that nothing in `index.html` or `src/` uses any more (the playback deck replaced by R-04, the old Simulations tab, the old empty-state doors kept until A6) and delete them. Move CSS used only by lazy dialogs (snapshots, matrix, GIF export) into the chunk that opens them, if the build allows it. Leave CSS used only by Classic until B1.
- **Done when:** entry CSS is at most 104 kB, `check:size` passes, the e2e suite passes, and the axe scans still pass.

#### [x] A3. Plan and baseline hygiene · S (shipped with this file; the README quotes no counts)
- **Do:** add a two-line banner to the top of `REDESIGN_PLAN.md` saying that status and order now live in this file. Don't edit V1's checkboxes, because V2 is the record. Update the counts in `README.md` if it quotes any.
- **Done when:** someone who opens V1 is sent here first.

#### [x] A4. Chaos across levels (D5) · S (#32)
- **Needs:** none.
- **Do:** in `src/studio/chaos.ts`, keep failures keyed by level path rather than by bare node id, so ids that repeat at different levels don't collide. When a level opens under a failed ancestor, paint its contents as failed and say so once ("Inside Checkout API, which has failed"). In `src/studio/levels.ts`, mark boundary ports whose outside component has failed as cut off. Run the reachability maths in `core/reachability.ts` unchanged on each level's view.
- **Tests:** unit tests for the failure keying, and a Playwright test that fails a parent, drills in and sees the children marked failed and announced.
- **Done when:** failures never leak into the saved document (V1 F-01 rule 6, which still holds).

#### [x] A5. Mermaid subgraphs as levels (D6) · S (#33)
- **Do:** add "Subgraphs as: Swimlanes / Levels" to the import dialog. With Levels, each `subgraph` becomes a component whose `child` holds the subgraph's nodes, and wires that cross a subgraph boundary attach to that component. Nested subgraphs become nested levels, capped at the existing 8-level limit with an `info` line when the cap is hit. *(Export of levels as subgraphs was dropped by D8: Mermaid is import only.)*
- **Files:** `src/core/parser.ts` (`ParsedSubgraph`), the import dialog in `src/studio/interactions.ts`, `tests/mermaidCoverage.test.ts`.
- **Done when:** importing with Levels selected keeps every node and wire of the source (as components inside levels, or as wires re-pointed to a subgraph component), and the Swimlanes default produces exactly what it produced before (snapshot test).

#### [x] A5b. Mermaid import only (D8) · S (#35)
- **Needs:** A5 (both touch `parser.ts` and the code dialog).
- **Do:**
  1. Remove the Mermaid writers people can reach: the **Mermaid (.mmd)** card in the export dialog (`#btn-export-mmd`), the **Mermaid / Blueprint** format switch in the code dialog (`code-format`), and the `.mmd` branch of `serializeForFilename` in `src/studio/pwa.ts`. Drop `.mmd` from the save picker's types.
  2. The code dialog becomes "Blueprint file": it shows the Blueprint file, and **Apply** still accepts pasted Mermaid or a Blueprint file, so import is unchanged. Rename the palette entry ("Mermaid (.mmd) & Blueprint Code Sync") to match, and keep `mermaid` as a search keyword so "paste mermaid" still finds it.
  3. `⌘S` on a file opened from `.mmd` never writes Mermaid and never overwrites that file: it opens Save As with a `.md` Blueprint file name. Say so once in a toast.
  4. `serializeToMermaid` stays only as the writer of the Blueprint file's embedded `mermaid` block (Q12). Make it module-private, or rename it to say so.
  5. Update `README.md` (the "Bidirectional Mermaid" feature line and the intro) and `docs/guide.md` (the exported-Mermaid wire syntax and the `## Mermaid` section become "Importing Mermaid"). They change in this PR, not before, because they describe the shipped app.
- **Tests:** keep every import test in `tests/mermaidCoverage.test.ts` and move it to an import-only file if that reads better. Delete tests that only check Mermaid output, except those that pin the Blueprint file's block. Add a Playwright test, `never loses an opened .mmd file`, that opens a `.mmd`, edits, presses `⌘S` and checks the original file isn't written.
- **Done when:** `grep -rn "btn-export-mmd\|code-format" src index.html` finds nothing; every bundled example and every Mermaid fixture still imports exactly as before (snapshot); the action-registry reachability test passes.

#### [x] A6. R-08 First run · M (#36)
- **Needs:** A2.
- **Spec:** V1 section 5.4.
- **Do:** when there is no autosave, no share link and no `?ui=1`, open `lumen-relay` in the Traffic lens with its first scenario playing, and after one loop fail one component on a single-path branch so the ripple shows. One sentence, "Watch a request travel through a real system.", and a small card: **Start blank** · **Pick a template** · **Paste Mermaid**. Remove the five `#btn-empty-*` doors from `index.html`. The empty state after "Start blank" is a one-line hint, not doors. A visitor who has been here before (any autosave or library entry) never sees first run. Under reduced motion, play nothing: show the failed state at once with the summary.
- **Never loses work:** first run must not overwrite an existing autosave. Add a Playwright test that seeds an autosave and checks first run doesn't appear.
- **Done when:** in Playwright, a fresh profile sees a moving packet in under 3 s and a failure summary in under 10 s; axe passes; the card is keyboard-reachable in 3 Tab presses or fewer.

#### [x] A6b. First run counts library entries (#55)
- **Needs:** A6, B3 (library entries are the records B3 adds; B2 only has the autosave and recovery copies).
- **Why:** A6 treats an autosave, a recovery copy or a "seen" flag (`conduitcraft-first-run-seen`, set once a visitor picks a card or edits) as "been here before". The library (B2) doesn't exist yet, so it can't be checked.
- **Do:** in `startFirstRunIfNew` (`src/studio/firstRun.ts`), add "the library holds any entry" to `FirstRunFacts.hasSavedWork`. (B2 already moved the autosave and recovery check onto the storage layer, and boot waits for storage before first run, so no extra waiting is needed.)
- **Done when:** a Playwright test seeds a library entry with no autosave and sees no first run.

#### [x] A7. F-28 `describeDiagram` and export alt text · M (#37)
- **Spec:** V1 F-28, items 1 to 3 plus "Copy as text".
- **Do:** write a pure `src/core/describe.ts` (no DOM, so it already meets T-07). The outline is: summary; each swimlane with its components; main flows grouped by source, with protocol from F-17; levels ("Checkout API opens into 6 components"); scenarios; and the legend from F-26 when one is set. Use it for `<title>` and `<desc>` in `diagramSvg.ts`, a visually hidden description in `standaloneHtml.ts`, an "Alt text" box with Copy in the PNG export dialog, and a palette command "Copy as text".
- **Tests:** one golden-text test per bundled example in `tests/describe.test.ts`, and a test that the module imports with no DOM globals.
- **Done when:** every SVG and HTML export carries the description, and the output reads as sentences with no ids in it.

#### [x] A8. F-28 Text outline panel · M (#38)
- **Needs:** A7, A2.
- **Do:** a panel, opened from the palette and the View menu, that lists components as a tree (swimlane → component → its outgoing wires; child levels as expandable rows). It uses roving focus (reuse `studio/rovingFocus.ts`). Selecting a row selects the component and pans to it; Enter on a level row drills in. It updates on history commit.
- **Done when:** axe passes with the panel open in all four lenses, and a Playwright test navigates to a component by keyboard only and selects it.
- **Shipped as:** `src/core/outline.ts` (pure tree), `src/studio/outlinePanel.ts`, opened from the palette ("Toggle Text Outline") and the More actions menu, since there is no View menu in this UI. It uses the ARIA tree pattern with one tab stop, which is the same idea as `rovingFocus.ts` but its own handler, because rows are in a panel and not on the canvas.

#### [x] A9. R-10 Contextual help · M (#39)
- **Needs:** A2.
- **Do:**
  1. Grow `docs/guide.md` (194 lines today) with one section per panel or concept: Lenses, Traffic and scenarios, Failing components, Review and insights (one paragraph per rule code), Levels, Legend and tags, Links and owner, Wire fields, Text outline, Importing Mermaid, Share and export. Remove "Blueprint Markdown" in favour of "Blueprint file" (Appendix A).
  2. Add a `?` button to each inspector section, the run bar, the chaos summary and the Review panel. It opens a popover (placed with `placeTooltip`) with 2 or 3 sentences and a link to the guide section on GitHub.
  3. Keep the help text in one module, `src/core/helpTopics.ts` (`{ id, title, body, guideAnchor }`), so the palette can search it ("help: routing styles") and a unit test can check every `guideAnchor` exists in `docs/guide.md`.
- **Done when:** the anchor test passes, and every `?` is reachable by keyboard and closes with `Esc`.
- **Shipped as:** `src/core/helpTopics.ts` (13 topics), `src/studio/helpPopover.ts` (one popover for every `?`, placed with `placeTooltip`), 13 palette commands ("Help: Routing styles" and so on), and 12 new sections in `docs/guide.md`. A `?` is on the five node inspector sections, the wire fields and routing style, the colour legend, the run bar, the failure summary and the Review panel. "Blueprint Markdown" is gone from the guide. Guide wording that was a judgement call (rule explanations, key tables) is mine, so a maintainer should read it once.

#### [x] A10. README and media refresh · S (#40)
- **Needs:** A6.
- **Do:** re-record the README GIFs to show a failure run (the existing GIF exporter can make them), refresh `docs/images/*.png` for the new chrome, and rewrite the README feature list around "draw it, run it, ship it".
- **Done when:** no image in the README shows the classic header.
- **Shipped as:** `tools/captureReadmeMedia.mjs` re-records the pictures from a build (design, traffic-failure and review screenshots, and `lumen-relay-failure.gif` from the GIF exporter with one component failed). The README feature list is now "draw it, run it, ship it". `docs/images/data-view.png` (classic header, unused) is deleted. The three older GIFs are stage-only exports with no header, so they stay.

#### [x] A11. Award checklist review and `v2.0.0` · S (#41)
- **Needs:** A1 to A10, including A5b.
- **Do:** go through the award-readiness checklist in V1 section 10 and record a pass, or a gap with a new queue item, for each line in a table in this file under A11. Bump `package.json` to `2.0.0`, write release notes (they announce that Classic layout goes away in the next release, and that Mermaid is now import only: D8), and tag `v2.0.0`.
- **Done when:** the tag exists, and any checklist gap is a queue item, not a note.
- **Shipped as:** `package.json` is `2.0.0` and `RELEASE_NOTES.md` has the notes (Classic layout goes in the next release; Mermaid is import only). The `v2.0.0` tag goes on the merge commit of this PR (a tag on the branch would point at a commit that is not on `main`). The review, from the checks named in each row:

| Award-readiness line (V1 section 10) | Result | Evidence |
|---|---|---|
| A new visitor sees a packet travel and a failure ripple out within 10 seconds | Pass | `e2e/firstRun.spec.ts`: packet moves in 3 s, failure summary in 10 s |
| Every action works by keyboard alone and is announced | Pass | `e2e/roving.spec.ts`, `lensKeys.spec.ts`, `announcer.spec.ts`, `outline.spec.ts`; action registry and keymap |
| Every action works by touch on a tablet | Gap, closed by A12 (leftovers: A12b, A12c) | `pinch.ts` and `historyGesture.ts` have unit tests, but no Playwright project uses touch |
| The app works fully offline after the first visit | **Gap: A13** | `public/sw.js` precaches the build and `tests/pwa.test.ts` covers the helper, but no test goes offline and reloads |
| No screen has more than 8 always-visible controls outside the canvas | **Gap: A14** | `e2e/topbar.spec.ts` caps the top bar at 8; the tool rail, run bar and side panels are not counted |
| Every animation explains something | **Gap: A15** | Audit below |
| Exports, embeds and shared links look as good as the studio | **Gap: A16** | No screenshot test of an export; the README pictures were checked by eye only |
| Every export carries a text description | Pass | `describeDiagram` feeds the SVG `<desc>`, the standalone HTML note and the export dialog alt text (`e2e/describeDiagram.spec.ts`); JSON and YAML are the description |
| Anything the app calls "live" really is | **Gap: A15** | The "live" status dot on a component pulses forever, though the status is a label the user sets |

Animation audit against V1 table 6.3: packet and dash flow, the chaos shake, the camera ease, panel slides, toasts, level fade and the drop-in all explain a change. `chaos-pulse` (at-risk) and `portPulse` (wiring targets) are state cues and both respect reduced motion. `pulseLiveDot` (`studio.css`, `.node-status-badge[data-status="live"] .status-dot`) is the one that fails: it is decorative, it suggests real-time data, and it has no `prefers-reduced-motion` guard.

#### [x] A12. Touch pass on a tablet · M (#42)
- **Needs:** A11.
- **Do:** add a Playwright project with `hasTouch` at 768 × 1024 and 1024 × 768. Cover place, select, move, wire, pan, pinch zoom, the context menu (long press), the palette, the inspector and the export dialog. Fix what fails; target size is 44 px for anything you tap.
- **Done when:** the project runs the same core flows as the desktop tests, and axe passes at 768 px.
- **Shipped as:** projects `tablet-portrait` (768 × 1024) and `tablet-landscape` (1024 × 768), touch plus a coarse pointer, running `e2e/touch.spec.ts` with real touch events (DevTools protocol). Flows: every control outside the canvas is 44 px, place (command palette), select with the contextual toolbar, inspector drawer, one-finger move, wire (toolbar Wire, then drag), pan, pinch in and out, long press for the menu, the export dialog and axe. Fixes: the 44 px rule was overridden by later layers (top bar 34 px, toolbar and toast buttons 28 px), so it is restated last in `studio.css`; context menu items are 44 px; a long press opens the context menu, timed in `contextMenu.ts` because Safari on iPad sends no `contextmenu` event for touch.

#### [x] A12b. Open the component palette and inspector by touch · S (#43)
- **Needs:** A12.
- **Do:** on a tablet the palette and inspector are drawers, and the redesigned top bar hides the buttons that open them (`.panel-rail-toggles`). A touch user can add components only by searching the command palette. Add a touch-reachable way to open each drawer (a button that shows only for a coarse pointer, or an edge tab), without raising the top bar past 8 controls (A14 counts them). Also check the canvas hit areas (ports 15 px, drag handle 9 px, level badge 9 × 7 px before the camera scale) and give them 44 px touch areas.
- **Done when:** a touch test places a component from the palette drawer and opens the inspector without the command palette, and a test measures canvas hit areas at 100% zoom.
- **Shipped as:** two edge tabs (`#btn-drawer-palette`, `#btn-drawer-inspector`) on the canvas edges, shown only for a coarse pointer at 66rem or narrower and hidden while their drawer is open, so the top bar is unchanged. Also fixed: the palette drawer sat under its own scrim (the palette layer's `z-index: 14` beat the layout layer's 40), so it could not be tapped. The drag handle and level badge get a 44 px touch area (a `::after`) only while shown; ports were already 44 px. New tests in `e2e/touch.spec.ts`: place from the palette drawer, tab sizes, hit areas at 100% zoom; the inspector test now opens its drawer by tap. Entry CSS is 106.0 kB.

#### [x] A12c. Tablet portrait keeps the full top bar · S (#45)
- **Needs:** A12.
- **Do:** at 768 px (below the 52rem phone breakpoint) the top bar loses the lens switch. Moving the breakpoint to 47.9rem made the page hang at 768 px (the cause was not found), so it was reverted in A12. Find the loop, then lower the breakpoint so an iPad in portrait gets the same bar as in landscape.
- **Done when:** `tablet-portrait` shows the lens switch and undo/redo, and the `layout.spec.ts` overlap test passes at 768 × 1024.
- **Shipped as:** the phone breakpoint in `studio.css` is now `max-width: 47.9rem` (was 52rem), so 768 px keeps the lens switch, undo/redo and the full bar. The hang A12 saw did not appear: with the new breakpoint all 13 touch tests pass at 768 × 1024, and so does the layout overlap test, which now also runs at 768 × 1024. The cause of that hang was never found, so if it comes back, look first at what lays out at exactly 768 px. New test: "the top bar keeps the lens switch and undo/redo" (fails on the old breakpoint).

#### [x] A13. Offline end-to-end test · S (#46)
- **Needs:** A11.
- **Do:** add a Playwright test: load once, wait for the service worker, go offline, reload, then open a template, run a simulation, export a PNG and a GIF (lazy chunks), and save a file. Fix any chunk the precache misses.
- **Done when:** the test is named `works offline …` and passes against `vite preview`.
- **Shipped as:** `e2e/offline.spec.ts` (redesign project only): load, wait for the service worker to control the page, go offline, reload, open Lumen Relay (lazy template chunk), run a scenario, export a PNG and a GIF (lazy chunk and worker), and Save (a stubbed `showSaveFilePicker`). Two real faults found and fixed: the app never registered the worker on `localhost`, and `public/sw.js` ignored `localhost`, so a production build on localhost could never be tested; both now accept an opt-in (`localStorage['conduitcraft-sw-localhost']`, registered as `sw.js?localhost=1`), and plain development is unchanged. And a precached chunk missed the cache whenever the host answered `Vary: Origin` (the page's `crossorigin` script sends an Origin header, the precache request did not), so the app loaded unstyled offline; the worker now matches with `ignoreVary`. The export capture helpers moved from `smoke.spec.ts` to `helpers.ts`.

#### [x] A14. Count every always-visible control · S (#47)
- **Needs:** A11.
- **Do:** extend `e2e/topbar.spec.ts` so the count covers the whole screen outside the canvas (top bar, tool rail, run bar, any open side panel) at 1280 px. If the total is over 8, decide with the number in hand: move controls into the palette, or amend the checklist line to "per region" in V1 section 10 and say why in the PR.
- **Done when:** the test states the rule it enforces and passes.
- **Shipped as:** three tests in `e2e/topbar.spec.ts` (Design, Traffic, Review, at 1280 × 800, diagram open, nothing selected). The numbers: top bar 8, tool rail 3, canvas HUD 6, inspector 1 (folded), run bar 10, Review panel 3, so the whole screen is 18 (Design), 25 (Traffic) and 18 (Review), and no layout that keeps a tool rail and a zoom HUD can reach 8 in total. **Decision: amend the checklist line to "per region"** (V1 section 10, ticked with the reason), because the 8 is a limit on what the eye takes in at once and each region is taken in on its own. The test states the rule in its comment and enforces 8 per region, and it fails on any visible control that belongs to no counted region, so new chrome cannot slip past. The one region over 8 was the run bar (10): it is now two labelled groups, Playback (7) and View (colour, tag filter, help: 3), with `display: contents` so the layout is unchanged. Not counted, with reasons in the test: component stencils in the rail (9: the component library as a strip, a list of things to place), findings in the Review panel (content), the inspector's property fields (the selected component's data; the inspector is folded when nothing is selected), toasts and anything inside the canvas.

#### [x] A15. Motion and "live" fixes · S (#48)
- **Needs:** A11.
- **Do:** stop `pulseLiveDot`: no animation on the status dot, so nothing on screen suggests live data. Add an e2e test that runs with `reducedMotion: 'reduce'` and asserts no element has a running animation. If `chaos-pulse` or `portPulse` fail the test, guard them.
- **Done when:** that test passes, and `grep -rn pulseLiveDot src` finds nothing.
- **Shipped as:** `pulseLiveDot` and its animation are gone; the live status dot keeps a still ring. New `e2e/reducedMotion.spec.ts` runs with `reducedMotion: 'reduce'` and, once finite animations have finished, asserts that `document.getAnimations()` has nothing running in three states: a component marked live, wiring targets (`portPulse`), and a failure with at-risk callers (`chaos-pulse`) while a scenario plays. It failed on `pulseLiveDot` before the fix. `chaos-pulse` and `portPulse` already pass, so they need no guard. A fourth test checks the dot has no animation even when motion is allowed. The test sees CSS animations and transitions only (not SMIL or script-driven drawing); the playing scenario is in it, and the first-run test also checks the packet is hidden under reduced motion.

#### [x] A16. Export visual check · S (#49)
- **Needs:** A11.
- **Do:** screenshot tests of the SVG, standalone HTML and GIF first frame for `lumen-relay`, in light and dark and in each diagram style. Compare them with the canvas by eye once and keep the images as baselines.
- **Done when:** baselines are committed and the test fails on a change to the export look.
- **Shipped as:** `e2e/exportVisual.spec.ts` exports Lumen Relay as SVG, standalone HTML and GIF, draws each file in a clean page (the GIF first frame decoded onto a canvas so the animation cannot move it) and compares with six committed baselines in `e2e/__screenshots__/exportVisual.spec.ts/`: light and dark for each format. Diagram styles (F-18) do not exist yet, so the one style is `studio`; the test loops over a `STYLES` list, and F4 must add each new style to it. Checked: changing the node fill in `diagramSvg.ts` fails the test (12% of pixels differ), and three repeat runs pass. Baselines are shared by all platforms (`snapshotPathTemplate` in `playwright.config.ts`) with a tolerance of 3% of pixels at colour threshold 0.05, because text uses system fonts and CI is Linux; they were taken on macOS, so the first CI run is the check that the tolerance is wide enough. By-eye comparison with the canvas: the GIF first frame and the standalone HTML match the studio; the **SVG is plainer** (no icons, kind labels or chips, and a diamond's text sits outside it), and it ignores light and dark (the two baselines are identical). That is the next item. The test duplicates the export capture from `smoke.spec.ts` so that it stands alone; A13 moves that capture into `helpers.ts`, so unify them once both are in.

#### [x] A16b. SVG export matches the canvas · M (#50)
- **Needs:** A16.
- **Do:** compare `renderDiagramSvg` with the canvas for Lumen Relay and close the gap: component icons, kind labels and chips, text inside non-rectangular shapes, and the colour scheme (today the SVG is the same in light and dark). Retake the SVG baselines from A16 once and say so in the PR.
- **Done when:** the SVG baselines show the same details as the canvas and the GIF first frame, and the A16 test passes with the new baselines.
- **Shipped as:** `renderDiagramSvg` takes a colour scheme (`'light'` by default, the studio passes the current one) and draws what the canvas draws: the icon in a tinted square (or the node's own picture), the eyebrow, the footer label and chip, a client's chip, centred stacked text inside circles, diamonds and hexagons, the actor figure with its caption, the store drum, pill labels on wires, and the outline in the border colour (the accent only when selected). I did not change the SVG's geometry or wire routing. Only the two SVG baselines were retaken (light and dark); the HTML and GIF baselines are untouched. One thing I found: Playwright's `--update-snapshots` leaves a baseline alone when the new picture is within the 3% tolerance, so retaking a baseline for a small change means deleting the file first.


### Milestone B: Many diagrams, real systems (phase 4)

**Goal:** many diagrams per browser, and a first diagram that takes seconds because it's imported.

#### [x] B1. Remove Classic layout · M (#51)
- **Needs:** A11 (D2).
- **Do:** delete the `?ui=1` path: the classic header and overflow menu in `index.html`, the `uiV2Only` flags in `core/keymap.ts`, the branches on UI version in `interactions.ts`, `inspectorAutoShow.ts`, `main.ts` and `core/uiVersion.ts`, the "Classic layout" setting, the classic-only CSS, and the `?ui=1` e2e project. A stored "classic" preference is silently dropped, with a one-time toast.
- **Done when:** `grep -ri classic src index.html` finds nothing except the release-notes reference, the e2e suite runs once (not twice), and entry CSS and JS have both dropped (record the numbers).

- **Shipped as:** the `?ui` switch (`core/uiVersion.ts`), the "Classic layout" setting, `keymap.ts`'s `uiV2Only` and `ui` context, every `dataset.ui` branch (`state.ts`, `insights.ts`, `chaosPanel.ts`, `contextToolbar.ts`, `inspectorAutoShow.ts`, `runBar.ts`, `firstRun`) and the `html[data-ui]` CSS prefixes are gone, and the redesign's rules now apply unconditionally. The header overflow menu (`#header-overflow-wrapper`, `ResponsiveToolbarManager`'s overflow code, its CSS and test) is removed. A stored `conduitcraft-ui` value is deleted at boot; if it was `1`, a toast says the old layout is retired. Playwright now has one desktop project (`chromium`) plus the two tablets, so the suite runs once. Classic-only tests are deleted (`classicLayout.spec.ts` and the "classic …" tests in six specs, plus a stencil-tooltip test that only ran in Classic). `grep -ri classic src index.html` finds nothing. `three-tier-web.blueprint.json` said "Classic scalable 3-tier", so its summary now says "Standard" and its import-snapshot hash was updated. Numbers: entry JS 454.5 kB, entry CSS 105.4 kB (106.0 kB after A12b). The top bar's remaining hidden buttons are B1b.

#### [x] B1b. Replace the hidden header buttons with direct handlers · M (#52)
- **Needs:** B1.
- **Why:** B1 removed the layout switch but left the old header's buttons in `index.html`, hidden by CSS (`display: none !important` in `studio.css`, "Redesigned top bar"). They are not Classic UI any more; they are the click targets that palette commands and menus trigger with `.click()` (`clickById('btn-new-canvas')`, `btn-import-file`, `btn-toggle-motion`, `btn-install-app`, `btn-auto-layout`, `btn-open-export`, `btn-open-settings`, `btn-open-shortcuts`, `btn-file-*`, `btn-enter-presentation`), with their listeners in `interactions.ts` and `responsiveToolbar.ts`.
- **Do:** give each of those actions a function that the palette, menu and shortcut call directly, bind the listener to that function, then delete the hidden elements from `index.html`, their `dom.ts` exports, the file menu code in `responsiveToolbar.ts`, and the CSS that hides them. Also delete the old playback deck (`#sim-playback-deck`, hidden since R-04) and the `.eyebrow-row` block. Keep the standalone HTML export's own `btn-*` ids (they are a separate page).
- **Done when:** `index.html`'s `<header>` holds only the controls the top bar shows, `grep -rn "clickById" src` finds nothing, the action-registry reachability test passes, and entry CSS and JS have both dropped (record the numbers).
- **Shipped as:** the header in `index.html` now holds the brand, title, save pill, undo/redo, the lens switch, Share and Search, and nothing else. The palette calls its actions directly: `PaletteDeps` gained `newBlueprint`, `importFile`, `toggleMotion` and `installApp`; the tool commands, Wire From Selection and Esc call the new `setPointerTool` (`pointerTool.ts`) instead of clicking a radio; `clickById` and `clickRadio` are gone. Deleted: the file menu (and its code in `responsiveToolbar.ts`), the Auto-Layout split button (the palette already had every layout command), the design and data tool strips (pointer radios, wire-colour radios and their duplicate Colour and Tag selects; the run bar has the live ones), the hidden scenario buttons, Pause, Export, Present, Shortcuts, Settings and panel-toggle buttons, the `.eyebrow-row`, the old playback deck and its code, 28 `dom.ts` exports and the CSS that hid or styled them. `#file-upload` stays (the palette's import opens it) but sits outside the header. Numbers: entry JS 445.0 kB (was 454.5), entry CSS 101.2 kB (was 105.4). New test `tests/topbarMarkup.test.ts` fails if any of the old ids come back to the header. No section-7 default was needed.

#### [x] B2. T-04 IndexedDB storage layer · M (#53)
- **Do:** write `src/studio/storage.ts`, a small promise wrapper over one database (`conduitcraft`) with stores `diagrams`, `snapshots` and `meta`. Write no library. Move autosave, recovery and snapshots (`conduitcraft-autosave-v1`, `conduitcraft-recovery-v1`, `conduitcraft-snapshots-v1`, and the legacy `blueprint-studio-autosave-v1`) over on first load. Keep the `localStorage` copies until a later release, read-only. If IndexedDB isn't available (private mode in some browsers), fall back to `localStorage` with a visible notice. Quota errors are shown, never swallowed (`MUST_DO_PLAN.md` rule).
- **Tests:** Playwright tests named `never loses …` that seed each legacy key and check the data survives, and that a quota failure shows a message.
- **Done when:** nothing in `state.ts` or `snapshots.ts` calls `localStorage` for document data.
- **Shipped as:** `src/studio/storage.ts` is a promise wrapper over one IndexedDB database, `conduitcraft`, with stores `diagrams` (records `autosave` and `recovery`), `snapshots` and `meta`; no library. Because the app reads and writes synchronously, the module keeps an in-memory copy that `initStorage()` fills at boot; writes update the copy, then persist in order, and a failed write rolls the copy back and rejects. On first load the old `localStorage` keys (`conduitcraft-autosave-v1`, `blueprint-studio-autosave-v1`, `conduitcraft-recovery-v1`, `conduitcraft-snapshots-v1`) are copied in once (a `legacy-migrated` marker in `meta`; nothing already in the database is overwritten) and left in place, read-only. If IndexedDB can't open, or the move fails, storage falls back to `localStorage` under those same keys, or to memory, with a toast saying so. Quota and other write failures are shown: autosave keeps its "Save to file" toast and the Not saved state, and a snapshot that can't be saved says so. An edit made before storage is read waits, so it can't replace the saved session. The write also starts when the tab is hidden, not only on unload. `state.ts` and `snapshots.ts` no longer touch `localStorage`; the `AUTOSAVE_KEY`, `RECOVERY_KEY` and `SNAPSHOTS_STORAGE_KEY` exports are gone. First run now reads the autosave and recovery records from the new layer (the part of A6b that B2 had to do so first run still sees saved work). Playwright: `e2e/storage.spec.ts` (six `never loses …` tests); unit: `tests/storage.test.ts`. Numbers: entry JS 450.4 kB (was 445.0), entry CSS 101.2 kB. No section-7 default was needed.

#### [ ] B2b. Retire the old `localStorage` document copies · S
- **Needs:** B2, and at least one release since B2 shipped.
- **Blocked:** no release since B2 shipped. `v2.0.0` was tagged before B2 merged and no later tag exists, so deleting the old `localStorage` copies now would remove the only fallback for a visitor who rolls back. Take it after the next tagged release.
- **Do:** stop reading `readLegacyContents` and delete the old keys after the first successful IndexedDB load, then drop the `localStorage` fallback's legacy-key mapping in favour of its own namespace. Keep the memory fallback and its notice.
- **Done when:** `grep -rn "conduitcraft-autosave-v1\|blueprint-studio-autosave-v1" src` finds nothing, and a Playwright test shows a returning visitor's work survives the release.

#### [x] B3. F-08 Library: data and commands · M (#54)
- **Needs:** B2.
- **Do:** one record per diagram (`id`, `title`, `updatedAt`, `thumbnail`, `doc`). Autosave writes to the open diagram's record. Add commands for new, open, rename, duplicate and delete; delete always comes with a 10-second Undo toast. The thumbnail is 320 × 200, made with `stagePicture.ts` on idle after a save. The existing autosave becomes the first entry. Add "Export all as .zip" (write a store-only zip by hand, with no compression, or ask first if a dependency is wanted).
- **Done when:** unit tests cover the record operations; a Playwright test opens two diagrams, switches between them and loses neither.
- **Shipped as:** `src/studio/library.ts` holds one record per diagram in the `diagrams` store (`id`, `title`, `updatedAt`, `thumbnail`, `doc`); the old autosave keeps its id (`autosave`) and is the first entry, the `recovery` scratch copy is not listed, and which diagram is open is remembered in `meta`. Autosave writes to the open diagram's record (`state.ts`; the recovery-slot rule is unchanged). The `localStorage` fallback now keeps extra entries under `conduitcraft-diagram:<id>`. Commands (palette: Your Diagrams…, New Diagram, Duplicate This Diagram, Delete This Diagram, Export All Diagrams (.zip)) and a small "Your diagrams" dialog (`libraryUi.ts`, styles lazy in `library.css`) cover new, open, rename, duplicate and delete. Every delete shows a 10-second Undo, as a toast and inside the dialog (the toast sits under an open dialog); discarding the previous session from the restore banner now has the same Undo. Opening a diagram saves the one before it, clears undo history (it can't cross diagrams) and hides the restore offer. The thumbnail is 320 × 200, drawn from `stagePicture.ts` on idle 1.5 s after a save and kept as a small WebP data URL (not the SVG, which was 186 kB for Lumen Relay); it is skipped when storage is not IndexedDB, when a sub-level is open, or while the tab is hidden. "Export all as .zip" writes a store-only zip by hand (`core/zip.ts`, about 100 lines, no dependency; Q11 default) holding one `.blueprint.json` per diagram. Tests: `tests/library.test.ts` (12) and `e2e/library.spec.ts` (four `never loses …` tests, including switching between two diagrams). Numbers: entry JS 461.5 kB (was 450.4), entry CSS 101.2 kB. Section-7 default used: Q11.

#### [x] B3b. Templates and imports open as new diagrams · S (#56)
- **Needs:** B3.
- **Why:** New Blueprint, the template gallery, Import File and Open File still replace the open diagram in place (undoable, but the old one is overwritten in the library). With a library they should add an entry and open it, as New Diagram does.
- **Do:** route `createBlankCanvas`, `loadTemplateDoc`, file open and import through `createDiagram` + `openDiagram` (flushing the open one first), keeping the Undo toast meaning "go back to the previous diagram".
- **Done when:** a Playwright test loads a template and the previous diagram is still in the library, unchanged.
- **Shipped as:** `openAsNewDiagram(doc, message, {pickSelection})` in `libraryUi.ts` saves the open diagram, adds the document as a library entry, opens it, and shows a toast whose Undo opens the previous diagram again (the new one stays in the library). The gallery's blank card (`createBlankCanvas`), `loadTemplateDoc`, and file open and import (`handleUploadedFile`, `handleOpenFile`, through a new `asNewDiagram` flag on `applyImportedText`) use it. The Code panel's "apply" still edits the open diagram in place, and snapshot restore stays in place on purpose (it is a step in one diagram's history). Playwright: two new `never loses …` tests in `e2e/library.spec.ts` (a template and a blank canvas leave the previous diagram unchanged and Undo returns to it; an imported file becomes a new diagram). No section-7 default was needed.

#### [x] B3c. Opening a shared link adds a library entry · S (#57)
- **Needs:** B3b.
- **Why:** when the visitor already has work open, the "Open" action on a shared-link toast still replaces the open diagram in place.
- **Do:** route that action through `openAsNewDiagram`. An empty canvas at boot may still take the shared document directly.
- **Done when:** a Playwright test boots with work open and a share link, picks Open, and finds the earlier diagram still in the library.
- **Shipped as:** the shared-link toast's "Open" calls `openAsNewDiagram`, so the diagram that was open stays in the library and the toast's Undo returns to it. The boot path for an empty canvas is unchanged. The "Open" toast only appears when work arrives on the canvas before the link has been decoded (for example the visitor restores their session in that gap), so the Playwright test (`e2e/library.spec.ts`) holds the decoding with an init script to make that happen, and it fails without the change. No section-7 default was needed.

#### [x] B4. F-08 Home screen · M (#58)
- **Needs:** B3, A6.
- **Spec:** V1 section 5.3.
- **Do:** it opens when the URL holds no diagram and the user has been here before (otherwise first run from A6 shows), or with `⌘O`. It has a Recent grid with search, the template gallery (reuse `templatesGallery.ts`), and Open file, Paste Mermaid and Import links. Show a storage warning above 80% of `navigator.storage.estimate()`.
- **Done when:** axe passes at 375, 1280 and 1600 px; the grid works with arrow keys; with reduced motion nothing animates.
- **Shipped as:** `src/studio/homeScreen.ts` (a dialog, `#home-dialog`; styles lazy in `home.css`) with the rules in `src/core/home.ts`. It has a search box and New diagram button, a Recent grid (thumbnail, title, "2 min ago" style time, and a "New diagram" card), the starter templates with their category filters (the same card markup as the template gallery, which stays for the palette), and the links Open file…, Paste Mermaid…, Import… and Manage diagrams… (the old Your diagrams dialog, which still does rename, duplicate and delete). A storage warning shows above the grid once `navigator.storage.estimate()` is over 80%. It opens at boot for a returning visitor (saved diagrams, no share link) on the first load of a tab only, so a reload while working goes straight to the canvas and the restore banner; first run still covers a visitor with nothing saved. Cmd/Ctrl+O now opens Home (it used to open a file; "Open File from Disk" stays in the palette with no shortcut, and is a link on Home). Picking the open diagram on an empty canvas loads it. Section-7 default used: none; the once-per-tab rule is a choice made here. Tests: `tests/home.test.ts` (5) and `e2e/home.spec.ts` (axe at 375, 1280 and 1600 px, arrow keys, search, templates, storage warning, reduced motion); `e2e/library.spec.ts` and `e2e/storage.spec.ts` mark Home as already shown in their seeding. Numbers: entry JS 469.4 kB (was 461.5), entry CSS 101.2 kB; `home.css` loads on first open.

#### [ ] B4b. Home: "Import infrastructure…" link · S
- **Needs:** B8.
- **Why:** the V1 mock shows an "Import infrastructure…" link beside Open file and Paste Mermaid. Home has a generic Import… link now; the infrastructure importers (Docker Compose, OpenAPI, Kubernetes) arrive in B8 and B9.
- **Do:** once B8 lands, point Import… at a short list of importers (file types the importers accept) and rename it.

#### [x] B5. F-31 Share-link hygiene · S (#59)
- **Spec:** V1 F-31, items 1 to 3. Item 4 waits for F-13.
- **Note:** levels (F-03) make links bigger, so measure every bundled example and record the sizes in the PR.
- **Shipped as:** the Share box in the export dialog now says "Anyone with this link can see the whole diagram. Nothing is uploaded." (V1 item 1). When the diagram has embedded images (`docHasImages`), the option "Leave out embedded images (logo and custom icons)" appears with a line giving both sizes ("With images 12.0 KB, without 3.0 KB"); it is hidden when there are none (item 2; the option itself already existed). Above 8 KB the size line says to download the file, "Download file instead" (same save as Blueprint file) becomes the primary button and Copy Link turns secondary; ticking the option can bring it back under the limit (item 3). The top-bar Share and the "Copy Shareable Link" command no longer copy a link over 8 KB: they open this dialog with a toast. The copied-link toast repeats the notice. The pure wording lives in `describeShareSize` (`shareLink.ts`). Link sizes of the bundled examples, with levels in the format: auth-oauth-oidc 3.5 KB, cicd-pipeline 3.7, cloud-data-pipeline 3.8, event-driven-microservices 3.8, kubernetes-ingress 3.5, three-tier-web 3.9, lumen-relay 6.3 (5.6 without images); none is over the 8 KB warning. Tests: two more in `tests/shareLink.test.ts`; `e2e/share.spec.ts` (four). Item 4 (view-only link) stays with F3. No section-7 default was needed.

#### [x] B6. F-25 draw.io import · M (#60)
- **Do:** read uncompressed and compressed (`DecompressionStream('deflate-raw')`) mxGraph pages. Map shapes to kinds by style, edges with labels to wires, swimlanes to zones, and containers to zones for now (frames once D1 lands). Multiple pages: ask "one diagram per page" or "pages as levels"; the second is possible now because F-03 exists. Load it as a lazy chunk with its own budget, and report everything skipped.
- **Tests:** fixtures in `tests/fixtures/drawio/` (plain, compressed, multi-page, container) with expected counts, and a Playwright test that drops a `.drawio` file on the canvas.
- **Shipped as:** `src/importers/drawio.ts` (lazy chunk, 13.3 kB of a 24 kB budget in `tools/checkBundleSize.mjs`) reads `.drawio` and `.xml` files, plain or compressed (`DecompressionStream('deflate-raw')`, capped at 40 MB), with a small hand-written XML reader (`importers/xml.ts`; no DTD or entity expansion, so a hostile file cannot reach out). Shapes map by style: cylinder or database → store, actor → actor, rhombus → gate (diamond), ellipse → circle, hexagon, rounded; unknown stencils become plain components and are reported once. Fill or stroke colour picks the nearest of the five colours. HTML labels become plain text (first line title, second line subtitle). Edges become wires with their label (including labels held in child shapes), dashed → async, a start arrow only → reversed, both arrows → two-way. Text shapes become notes. Swimlanes, containers and groups become swimlanes (a column spanning the shapes inside); nesting is flattened and reported. Shapes keep their draw.io layout, scaled up for the default component size, and are laid out again (reported) if any still collide. A file with several pages asks "One diagram per page" or "Pages as levels" (one overview whose components open the pages); the rest of the pages go to Your diagrams. Dropping, Open File and Import all route to it (`looksLikeDrawio` in `importers/sniff.ts`); the result opens as a new diagram, with Undo going back to the previous one. Everything skipped or changed is listed in a new Import report dialog, behind a "See report" action on a toast. Lines not attached at both ends, lines attached to a group, shapes with no size, pictures and unmapped shapes are all reported. Tests: `tests/drawio.test.ts` (14; fixtures `tests/fixtures/drawio/` plain, compressed, container, multi-page) and `e2e/drawio.spec.ts` (6, including dropping a `.drawio` file). Numbers: entry JS 473.0 kB (was 470.5; 7 kB of headroom left), entry CSS 101.2 kB. Leftover: containers become swimlanes only until frames exist (D1).

#### [ ] B6b. draw.io containers as frames · S
- **Needs:** D1.
- **Do:** import groups, containers and swimlanes as frames instead of swimlanes, keeping nesting, and drop the "nesting is lost" note from the import report.

#### [x] B7. F-25 Excalidraw import · S (#61)
- **Needs:** B6 (shares the import-report and lazy-chunk plumbing).
- **Spec:** V1 F-25.
- **Shipped as:** `src/importers/excalidraw.ts` (lazy chunk, 5.1 kB) reads `.excalidraw` scenes (and a scene saved as `.json`, found by its `"type": "excalidraw"` marker). Rectangles become components (rounded when the shape has rounded corners), ellipses circles, diamonds gates; text inside a shape is its title, second line its subtitle, the rest its summary; fill or stroke colour picks the nearest of the five colours. Arrows attached to two shapes become wires (label from text on the arrow, dashed or dotted → async, a start head only → reversed, two heads → two-way). Frames become swimlanes; free text becomes notes. Unattached arrows, plain lines, freehand strokes, pictures and embeds are skipped and listed in the Import report. Deleted elements are ignored. The helpers B6 and B7 share (ids, colour, placing shapes on the stage) moved to `importers/common.ts`; `studio/drawioImport.ts` became `studio/fileImports.ts` and holds both importers' studio side (`openConverted` opens the result and offers the report). Open File accepts `.excalidraw`. Tests: `tests/excalidraw.test.ts` (6, fixture `tests/fixtures/excalidraw/scene.excalidraw`) and `e2e/excalidraw.spec.ts` (3); the drop helper moved to `e2e/helpers.ts`. Numbers: entry JS 473.8 kB (was 473.0), entry CSS 101.2 kB. No section-7 default was needed.

#### [x] B8. F-06 Docker Compose and OpenAPI import · M (#62)
- **Do:** one lazy chunk per importer, using the existing `js-yaml`. Every created component records `source: { kind, ref }` now, so F-24 drift needs no migration later. Bump the schema to v8 and add a round-trip test.
- **Tests:** fixtures and expected nodes and wires for each format.
- **Shipped as:** schema v8: components may carry `source: { kind, ref }` (`NodeSource` in `types.ts`, `normalizeSource` in `core/meta.ts`: a short lower-case kind and a reference up to 200 characters, anything else dropped). It is saved in Blueprint JSON, the Blueprint file and the share link; `MIGRATIONS[7]` is a no-op and `docs/guide.md` has a short section. `src/importers/compose.ts` (lazy, 4.7 kB): services become components (store, bus or gate by image, else service; `deploy.replicas` becomes replicas), `depends_on` and `links` become wires from the dependent, named volumes become stores wired from each service that mounts them, a network shared by up to 4 services becomes wires and by more becomes a `net:` tag. Environment values, secrets and configs are never copied. Bind mounts, unknown dependencies and the rest are reported. `src/importers/openapi.ts` (lazy, 3.4 kB; JSON or YAML, OpenAPI 3 only, with a clear message for Swagger 2): one component per tag with every operation listed as a metric (an untagged API is one component named after it), one gate per server wired to every component. Refs are `docker-compose` `<service>` or `volume:<name>`, and `openapi` `tag:<name>`, `server:<url>` or `api:<title>`. Files are recognised by name or content (`looksLikeCompose`, `looksLikeOpenApi` in `importers/sniff.ts`), the file pickers accept `.yml` and `.yaml`, and the studio side is `importComposeText` and `importOpenApiText` in `studio/fileImports.ts`. Tests: `tests/importers.test.ts` (20, fixtures in `tests/fixtures/compose/` and `openapi/`, including the `source` round trip through JSON, the Blueprint file and the share link) and `e2e/infraImport.spec.ts` (3). Numbers: entry JS 475.3 kB (was 473.8; 4.7 kB of headroom left), entry CSS 101.2 kB. No section-7 default was needed; the 4-service limit for drawing a network is a choice made here.

#### [ ] B9. F-06 Kubernetes and AsyncAPI import · M
- **Needs:** B8.
- **Do:** Kubernetes: multi-document YAML; namespaces become swimlanes; Ingress → Service → Deployment chains become wires. AsyncAPI: channels become bus nodes, and publishers and subscribers become async wires.

#### [ ] B10. F-22 Trace import (OTLP and Jaeger JSON) · M
- **Needs:** B8 (`source` field).
- **Spec:** V1 F-22. "Update this diagram" matches on `source.ref`, then on title.

#### [ ] B11. F-10 Smart guides and snapping · S
- **Spec:** V1 F-10.
- **Done when:** `snapToGuides` has unit tests; dragging keeps 60 fps on `lumen-relay` (check with a performance trace).

Terraform import (V1 F-06, size L) is **not** in this milestone. It comes back as its own item once B8 and B9 have proved the importer pattern.

### Milestone C: Canvas polish (the R-02 and toolbar leftovers, plus bulk edit)

These are small items that make the shell complete. Each can run in parallel with milestone B, but they go in queue order when nothing else is free.

#### [ ] C1. Hand and Text tools · S
- **Do:** Hand (`H`) pans with a plain drag; Space+drag already works, so this is the rail button plus the tool mode. Text (`T`) places a free text label. Store it as a note with a new `variant: 'text'` (no border, no background) rather than as a new entity, which avoids a schema-wide change. Bump the schema and add a round-trip test.
- **Done when:** both tools appear on the rail with shortcuts, both appear in the palette, and both have Playwright tests.

#### [ ] C2. Contextual toolbar: colour, kind and shape · S
- **Do:** three popover pickers that reuse the inspector's controls. Each change is one undo step through `mutateWithHistory` and works on a multi-selection.
- **Done when:** a Playwright test recolours three selected components in one undo step.

#### [ ] C3. F-29 Find and replace, bulk edit · M
- **Needs:** C2 (the shared multi-select fields).
- **Spec:** V1 F-29. Scope "this level / all levels" uses `allLevelNodes` from `core/levels.ts`.

#### [ ] C4. Copy and paste components across browser tabs · M
- **Why:** requested by the user on 2026-11-03. Copy today fills an in-memory buffer (`app.clipboardNodes` and `app.clipboardEdges`), so it is lost in another tab and nothing can be pasted into a different diagram.
- **Do:** when the user copies, also write the selected components, the wires between them, and their nested levels to the system clipboard as text with a version marker (JSON with `conduitcraft: 1`), using `navigator.clipboard.writeText`. On paste, read the clipboard (the `paste` event, so no permission prompt), and use it when it carries that marker, otherwise fall back to the in-memory buffer. Give pasted components new ids and place them at the pointer or the view centre, as paste does now. Pasting into a diagram that has the same ids must not overwrite anything. Reject malformed or oversized input with a short message and no crash. Strip embedded images over the share-link size limit, as B5 does for links.
- **Done when:** a Playwright test with two pages in one browser context copies two connected components in one page and pastes them in the other, with the wire intact and fresh ids; a test that pasting plain text or broken JSON changes nothing and shows a message; the copy still works when the clipboard is denied (the in-tab buffer is used).
- **Default (section 7 rule 6):** system clipboard text, not `localStorage` or `BroadcastChannel`, so it also works between windows and after a reload.

### Milestone D: Depth (phase 6, the rest)

#### [ ] D1. F-09 Frames · M (part 1) + M (part 2)
- **Part 1:** data model (`DiagramFrame`, `node.frameId`), drawing, Frame tool on the rail (`F`), moving a frame moves its contents, dropping a node in adopts it. Schema bump.
- **Part 2:** nesting, "Group to frame", Blueprint file (YAML) round trip, Mermaid subgraph import gains the "Frames" option from D6 (import only, D8), HTML export.
- Split into two PRs: D1a and D1b.

#### [ ] D2. F-05 Live split code editor · M (part 1) + M (part 2)
- **Part 1 (D2a):** the pane, live parse with a 250 ms debounce, last good canvas kept, line diagnostics, one history entry per typing pause, never discards text.
- **Part 2 (D2b):** canvas ↔ line selection sync. The pane edits the Blueprint file only (D8): pasting Mermaid into it converts it once, with the import report, and there is no Mermaid ↔ Blueprint switch to warn about. A textarea with a gutter first; CodeMirror only as a lazy chunk, and only if needed.
- **Note:** with levels, the pane edits the open level's YAML by default, with a toggle for the whole tree.

#### [ ] D3. F-11 ELK layout (lazy) · M
- **Spec:** V1 F-11. Record the chunk size and add a budget for it.

### Milestone E: Keep it true (phase 5, order from D7)

#### [ ] E1. T-07 Headless core · M
- **Do:** move the pure diff out of `studio/snapshots.ts` into `src/core/diff.ts`. Add `tests/headless.test.ts`, which imports the parser, insights, reachability, describe, diff, each importer and the SVG and HTML exporters with no DOM globals defined, and renders every example. Fix any DOM coupling it finds.

#### [ ] E2. F-23 CLI · M
- **Needs:** E1, and question Q9 answered (the default is in section 7).
- **Do:** `conduitcraft render <file> --format svg|html|json --out <path>` and `conduitcraft check <file>`, which exits 1 on an insight `error`. Snapshot tests check the CLI output matches the browser export for every example.

#### [ ] E3. F-23 GitHub Action · S
- **Needs:** E2. It runs on this repo's own `src/examples/` in CI and posts a diff comment on PRs.

#### [ ] E4. F-21 Live data sources · M (part 1) + S (part 2)
- **Needs:** question Q8 answered (the default is in section 7).
- **Part 1 (E4a):** JSON URL and pasted snapshot, path mapping, status rules, stale marker, the document-level Live switch, and the no-secrets-in-exports tests.
- **Part 2 (E4b):** Prometheus instant queries.
- Until E4a ships, the word "Live" stays out of the UI (Appendix A).

#### [ ] E5. F-24 Drift check · M
- **Needs:** B8 (the `source` field), E2 (for the CLI half).
- **Spec:** V1 F-24. Show the differences with the snapshot diff overlay in the Review lens. That overlay doesn't exist yet, so this item builds it (V1 section 5.2: added green, removed red, changed amber), and snapshots can use it too.

### Milestone F: Telling the story (phase 7)

Each item follows its V1 spec. They are listed in the order to build them.

- [ ] **F1. F-04 Storyboards** · M. Build in the Present lens. Steps can hold a level path as well as a camera, so a story can drill down.
- [ ] **F2. F-19 Video export** · S. Needs F1.
- [ ] **F3. F-13 Read-only viewer and embeds** · M. Then finish B5 item 4 (the view-only link).
- [ ] **F4. F-18 Diagram styles** · M. Add each style to `tests/contrast.test.ts` and to the `STYLES` list in `e2e/exportVisual.spec.ts` (with new baselines).
- [ ] **F5. F-07 Comments (local)** · M. Migrate `node.comment` into the first thread, with a schema bump.
- [ ] **F6. F-12 Coach marks** · S. Last in this milestone. Every coach mark has a Playwright test.
- [ ] **F7. F-30 PDF and print export** · S. Needs A7 and F4 (the Print style).

### Milestone G: Beyond one browser (phase 8)

Answer Q1, Q2 and Q6 in section 7 before starting any of these.

- [ ] **G1. F-16 Icon packs** · S per pack.
- [ ] **G2. F-20 Internationalisation** · M. Start with `helpTopics.ts` (A9), which is already in one module.
- [ ] **G3. F-06 Terraform import** · L. Split it before starting.
- [ ] **G4. F-14 Collaboration** · XL. Split it before starting.
- [ ] **G5. F-15 AI assist** · M.

---

## 6. Definition of done (every PR)

Run these and paste the summary lines into the PR description:

```bash
npm test            # unit: all pass (359 today; the count only goes up)
npm run build       # tsc strict + vite
npm run check:size  # entry JS ≤ 480 kB, entry CSS ≤ 115 kB, every lazy chunk within its budget
npm run test:e2e    # Playwright + axe, all pass, no new skips or retries
```

Also:

- Every V1 section 10 quality bar applies, in particular the reduced-motion, round-trip, data-safety and secrets rows. Round trip means JSON, the Blueprint file and the share link. Mermaid is import only (D8): the import report lists anything it drops, and nothing is written back.
- A new document field bumps `CURRENT_SCHEMA_VERSION` in `src/core/schema.ts` (8 today), adds a `MIGRATIONS` step, and adds a round-trip test through JSON, YAML and the share link.
- A new user action goes through the action registry (`core/actions.ts`) so the palette, menu and shortcuts all get it. The registry reachability test must pass.
- A new user-visible string follows the Appendix A word list.
- This file is updated in the same PR (rule 4 in section 1).

---

## 7. Open questions, with defaults

If a question isn't answered by the time its item comes up, use the default and say so in the PR.

| # | Question | Needed by | Default if unanswered |
|---|---|---|---|
| Q1 | Collaboration hosting: WebRTC only, or also a documented self-hosted WebSocket server? | G4 | WebRTC only |
| Q2 | AI: bring your own key, or no AI at all? Which providers? | G5 | Bring your own key, off by default; one provider behind an interface |
| Q5 | Levels and frames | D1 | **Answered by D4:** both ship |
| Q6 | Which icon sets can be bundled under MIT? | G1 | Generic tech icons only, no cloud-provider sets |
| Q8 | Live data and CORS: document a proxy, or ship one? | E4 | Document a minimal proxy example; don't ship one |
| Q9 | CLI: publish to npm as `conduitcraft`, or Action only? | E2 | Action only at first; the CLI runs from the repo with `node` |
| Q10 *(new)* | Should chaos reachability ever trace through levels (D5 is one-way)? | after A4 | No, until a user asks |
| Q11 *(new)* | Is a zip dependency acceptable for "Export all", or should the zip writer be written by hand? | B3 | Write a store-only zip by hand (about 80 lines), no dependency |
| Q12 *(new)* | Should the Blueprint file keep its embedded `mermaid` block, or become YAML only (wires in `edges:`)? | A5b | Keep the block. It lets GitHub render a Blueprint file as a diagram, and old files keep importing either way |

Questions 3, 4 and 7 from V1 were already decided and are unchanged.
