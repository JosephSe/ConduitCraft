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

#### [x] A2. Reclaim CSS headroom · S (#PR)
- **Why:** 3 kB is left and milestone A adds UI (D3).
- **Do:** list the selectors in `src/styles/studio.css` that nothing in `index.html` or `src/` uses any more (the playback deck replaced by R-04, the old Simulations tab, the old empty-state doors kept until A6) and delete them. Move CSS used only by lazy dialogs (snapshots, matrix, GIF export) into the chunk that opens them, if the build allows it. Leave CSS used only by Classic until B1.
- **Done when:** entry CSS is at most 104 kB, `check:size` passes, the e2e suite passes, and the axe scans still pass.

#### [x] A3. Plan and baseline hygiene · S (shipped with this file; the README quotes no counts)
- **Do:** add a two-line banner to the top of `REDESIGN_PLAN.md` saying that status and order now live in this file. Don't edit V1's checkboxes, because V2 is the record. Update the counts in `README.md` if it quotes any.
- **Done when:** someone who opens V1 is sent here first.

#### [ ] A4. Chaos across levels (D5) · S
- **Needs:** none.
- **Do:** in `src/studio/chaos.ts`, keep failures keyed by level path rather than by bare node id, so ids that repeat at different levels don't collide. When a level opens under a failed ancestor, paint its contents as failed and say so once ("Inside Checkout API, which has failed"). In `src/studio/levels.ts`, mark boundary ports whose outside component has failed as cut off. Run the reachability maths in `core/reachability.ts` unchanged on each level's view.
- **Tests:** unit tests for the failure keying, and a Playwright test that fails a parent, drills in and sees the children marked failed and announced.
- **Done when:** failures never leak into the saved document (V1 F-01 rule 6, which still holds).

#### [ ] A5. Mermaid subgraphs as levels (D6) · S
- **Do:** add "Subgraphs as: Swimlanes / Levels" to the import dialog. With Levels, each `subgraph` becomes a component whose `child` holds the subgraph's nodes, and wires that cross a subgraph boundary attach to that component. Nested subgraphs become nested levels, capped at the existing 8-level limit with an `info` line when the cap is hit. Export with levels writes subgraphs back.
- **Files:** `src/core/parser.ts` (`ParsedSubgraph`), the import dialog in `src/studio/interactions.ts`, `tests/mermaidCoverage.test.ts`.
- **Done when:** a round trip with Levels selected (Mermaid → levels → Mermaid) keeps every node and wire, and the Swimlanes default produces exactly what it produced before (snapshot test).

#### [ ] A6. R-08 First run · M
- **Needs:** A2.
- **Spec:** V1 section 5.4.
- **Do:** when there is no autosave, no share link and no `?ui=1`, open `lumen-relay` in the Traffic lens with its first scenario playing, and after one loop fail one component on a single-path branch so the ripple shows. One sentence, "Watch a request travel through a real system.", and a small card: **Start blank** · **Pick a template** · **Paste Mermaid**. Remove the five `#btn-empty-*` doors from `index.html`. The empty state after "Start blank" is a one-line hint, not doors. A visitor who has been here before (any autosave or library entry) never sees first run. Under reduced motion, play nothing: show the failed state at once with the summary.
- **Never loses work:** first run must not overwrite an existing autosave. Add a Playwright test that seeds an autosave and checks first run doesn't appear.
- **Done when:** in Playwright, a fresh profile sees a moving packet in under 3 s and a failure summary in under 10 s; axe passes; the card is keyboard-reachable in 3 Tab presses or fewer.

#### [ ] A7. F-28 `describeDiagram` and export alt text · M
- **Spec:** V1 F-28, items 1 to 3 plus "Copy as text".
- **Do:** write a pure `src/core/describe.ts` (no DOM, so it already meets T-07). The outline is: summary; each swimlane with its components; main flows grouped by source, with protocol from F-17; levels ("Checkout API opens into 6 components"); scenarios; and the legend from F-26 when one is set. Use it for `<title>` and `<desc>` in `diagramSvg.ts`, a visually hidden description in `standaloneHtml.ts`, an "Alt text" box with Copy in the PNG export dialog, and a palette command "Copy as text".
- **Tests:** one golden-text test per bundled example in `tests/describe.test.ts`, and a test that the module imports with no DOM globals.
- **Done when:** every SVG and HTML export carries the description, and the output reads as sentences with no ids in it.

#### [ ] A8. F-28 Text outline panel · M
- **Needs:** A7, A2.
- **Do:** a panel, opened from the palette and the View menu, that lists components as a tree (swimlane → component → its outgoing wires; child levels as expandable rows). It uses roving focus (reuse `studio/rovingFocus.ts`). Selecting a row selects the component and pans to it; Enter on a level row drills in. It updates on history commit.
- **Done when:** axe passes with the panel open in all four lenses, and a Playwright test navigates to a component by keyboard only and selects it.

#### [ ] A9. R-10 Contextual help · M
- **Needs:** A2.
- **Do:**
  1. Grow `docs/guide.md` (194 lines today) with one section per panel or concept: Lenses, Traffic and scenarios, Failing components, Review and insights (one paragraph per rule code), Levels, Legend and tags, Links and owner, Wire fields, Text outline, Share and export. Remove "Blueprint Markdown" in favour of "Blueprint file" (Appendix A).
  2. Add a `?` button to each inspector section, the run bar, the chaos summary and the Review panel. It opens a popover (placed with `placeTooltip`) with 2 or 3 sentences and a link to the guide section on GitHub.
  3. Keep the help text in one module, `src/core/helpTopics.ts` (`{ id, title, body, guideAnchor }`), so the palette can search it ("help: routing styles") and a unit test can check every `guideAnchor` exists in `docs/guide.md`.
- **Done when:** the anchor test passes, and every `?` is reachable by keyboard and closes with `Esc`.

#### [ ] A10. README and media refresh · S
- **Needs:** A6.
- **Do:** re-record the README GIFs to show a failure run (the existing GIF exporter can make them), refresh `docs/images/*.png` for the new chrome, and rewrite the README feature list around "draw it, run it, ship it".
- **Done when:** no image in the README shows the classic header.

#### [ ] A11. Award checklist review and `v2.0.0` · S
- **Needs:** A1 to A10.
- **Do:** go through the award-readiness checklist in V1 section 10 and record a pass, or a gap with a new queue item, for each line in a table in this file under A11. Bump `package.json` to `2.0.0`, write release notes (they announce that Classic layout goes away in the next release), and tag `v2.0.0`.
- **Done when:** the tag exists, and any checklist gap is a queue item, not a note.

### Milestone B: Many diagrams, real systems (phase 4)

**Goal:** many diagrams per browser, and a first diagram that takes seconds because it's imported.

#### [ ] B1. Remove Classic layout · M
- **Needs:** A11 (D2).
- **Do:** delete the `?ui=1` path: the classic header and overflow menu in `index.html`, the `uiV2Only` flags in `core/keymap.ts`, the branches on UI version in `interactions.ts`, `inspectorAutoShow.ts`, `main.ts` and `core/uiVersion.ts`, the "Classic layout" setting, the classic-only CSS, and the `?ui=1` e2e project. A stored "classic" preference is silently dropped, with a one-time toast.
- **Done when:** `grep -ri classic src index.html` finds nothing except the release-notes reference, the e2e suite runs once (not twice), and entry CSS and JS have both dropped (record the numbers).

#### [ ] B2. T-04 IndexedDB storage layer · M
- **Do:** write `src/studio/storage.ts`, a small promise wrapper over one database (`conduitcraft`) with stores `diagrams`, `snapshots` and `meta`. Write no library. Move autosave, recovery and snapshots (`conduitcraft-autosave-v1`, `conduitcraft-recovery-v1`, `conduitcraft-snapshots-v1`, and the legacy `blueprint-studio-autosave-v1`) over on first load. Keep the `localStorage` copies until a later release, read-only. If IndexedDB isn't available (private mode in some browsers), fall back to `localStorage` with a visible notice. Quota errors are shown, never swallowed (`MUST_DO_PLAN.md` rule).
- **Tests:** Playwright tests named `never loses …` that seed each legacy key and check the data survives, and that a quota failure shows a message.
- **Done when:** nothing in `state.ts` or `snapshots.ts` calls `localStorage` for document data.

#### [ ] B3. F-08 Library: data and commands · M
- **Needs:** B2.
- **Do:** one record per diagram (`id`, `title`, `updatedAt`, `thumbnail`, `doc`). Autosave writes to the open diagram's record. Add commands for new, open, rename, duplicate and delete; delete always comes with a 10-second Undo toast. The thumbnail is 320 × 200, made with `stagePicture.ts` on idle after a save. The existing autosave becomes the first entry. Add "Export all as .zip" (write a store-only zip by hand, with no compression, or ask first if a dependency is wanted).
- **Done when:** unit tests cover the record operations; a Playwright test opens two diagrams, switches between them and loses neither.

#### [ ] B4. F-08 Home screen · M
- **Needs:** B3, A6.
- **Spec:** V1 section 5.3.
- **Do:** it opens when the URL holds no diagram and the user has been here before (otherwise first run from A6 shows), or with `⌘O`. It has a Recent grid with search, the template gallery (reuse `templatesGallery.ts`), and Open file, Paste Mermaid and Import links. Show a storage warning above 80% of `navigator.storage.estimate()`.
- **Done when:** axe passes at 375, 1280 and 1600 px; the grid works with arrow keys; with reduced motion nothing animates.

#### [ ] B5. F-31 Share-link hygiene · S
- **Spec:** V1 F-31, items 1 to 3. Item 4 waits for F-13.
- **Note:** levels (F-03) make links bigger, so measure every bundled example and record the sizes in the PR.

#### [ ] B6. F-25 draw.io import · M
- **Do:** read uncompressed and compressed (`DecompressionStream('deflate-raw')`) mxGraph pages. Map shapes to kinds by style, edges with labels to wires, swimlanes to zones, and containers to zones for now (frames once D1 lands). Multiple pages: ask "one diagram per page" or "pages as levels"; the second is possible now because F-03 exists. Load it as a lazy chunk with its own budget, and report everything skipped.
- **Tests:** fixtures in `tests/fixtures/drawio/` (plain, compressed, multi-page, container) with expected counts, and a Playwright test that drops a `.drawio` file on the canvas.

#### [ ] B7. F-25 Excalidraw import · S
- **Needs:** B6 (shares the import-report and lazy-chunk plumbing).
- **Spec:** V1 F-25.

#### [ ] B8. F-06 Docker Compose and OpenAPI import · M
- **Do:** one lazy chunk per importer, using the existing `js-yaml`. Every created component records `source: { kind, ref }` now, so F-24 drift needs no migration later. Bump the schema to v8 and add a round-trip test.
- **Tests:** fixtures and expected nodes and wires for each format.

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

### Milestone D: Depth (phase 6, the rest)

#### [ ] D1. F-09 Frames · M (part 1) + M (part 2)
- **Part 1:** data model (`DiagramFrame`, `node.frameId`), drawing, Frame tool on the rail (`F`), moving a frame moves its contents, dropping a node in adopts it. Schema bump.
- **Part 2:** nesting, "Group to frame", YAML and Mermaid round trip (Mermaid subgraph import gains the "Frames" option from D6), HTML export.
- Split into two PRs: D1a and D1b.

#### [ ] D2. F-05 Live split code editor · M (part 1) + M (part 2)
- **Part 1 (D2a):** the pane, live parse with a 250 ms debounce, last good canvas kept, line diagnostics, one history entry per typing pause, never discards text.
- **Part 2 (D2b):** canvas ↔ line selection sync, a warning before switching Mermaid ↔ Blueprint drops anything. A textarea with a gutter first; CodeMirror only as a lazy chunk, and only if needed.
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
- [ ] **F4. F-18 Diagram styles** · M. Add each style to `tests/contrast.test.ts`.
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

- Every V1 section 10 quality bar applies, in particular the reduced-motion, round-trip, data-safety and secrets rows.
- A new document field bumps `CURRENT_SCHEMA_VERSION` in `src/core/schema.ts` (7 today), adds a `MIGRATIONS` step, and adds a round-trip test through JSON, YAML and the share link.
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

Questions 3, 4 and 7 from V1 were already decided and are unchanged.
