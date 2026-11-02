# ConduitCraft 2.0: Redesign Plan

**Branch:** `redesign-vision` (cut from `main` at `e4ce9ab`, after PR #3)
**Status:** Proposal. Nothing in this file is built yet.
**How to use this file:** Each work item has an ID (`R-xx` for redesign work, `F-xx` for features, `T-xx` for technical foundations). Pick up items in the order given in [section 9](#9-delivery-plan-pr-by-pr). Each item says why it matters, what to build, how to know it is done, and where relevant the files it touches and rough effort. Tick the checkbox and add the PR number when an item ships.

---

## Contents

1. [The goal, in one paragraph](#1-the-goal-in-one-paragraph)
2. [What ConduitCraft is today](#2-what-conduitcraft-is-today)
3. [What holds it back](#3-what-holds-it-back)
4. [Design principles](#4-design-principles)
5. [The redesigned app: structure and screens](#5-the-redesigned-app-structure-and-screens)
6. [Visual language](#6-visual-language)
7. [Missing features](#7-missing-features)
8. [Technical foundations the redesign needs](#8-technical-foundations-the-redesign-needs)
9. [Delivery plan, PR by PR](#9-delivery-plan-pr-by-pr)
10. [Quality bars](#10-quality-bars)
11. [What we will not do](#11-what-we-will-not-do)
12. [Open questions](#12-open-questions)

---

## 1. The goal, in one paragraph

ConduitCraft should be **the best tool for explaining how a system works**, not one more box-and-arrow editor. Draw.io, Excalidraw, Miro and Lucid already win at drawing. ConduitCraft stands apart because its wires carry *live traffic*, you can *run a scenario* through the system, and the diagram is *also code* (Mermaid and Blueprint YAML). The redesign makes that combination the product's identity: **draw it, run it, ship it**. "Award winning" here means the craft that design awards reward: a calm, focused interface; motion that explains rather than decorates; keyboard, screen reader and touch treated as first-class; and at least one interaction nobody else has. For ConduitCraft that interaction is *watching a request travel through your architecture, then seeing what breaks when a component fails*.

---

## 2. What ConduitCraft is today

This is the baseline after PRs #1 to #3. It is a strong base, and the redesign keeps almost all of it.

| Area | What exists |
|---|---|
| **Canvas** | 7 component kinds, 7 shapes, 13 icons plus custom image icons, swimlane zones, notes/checklist cards, 9 wire routing styles, waypoints, parallel-lane separation, multi-select, marquee, align and distribute, z-order, lock, group, copy and paste, inline rename (F2 or double-click), drop-a-wire-to-create, draggable wire ends, proportional zoom, Space+drag pan, minimap, fit and fit-selection, pinch and touch. |
| **Modes** | `Design` (edit) and `Data View` (lineage highlight, tone filters, trace, telemetry metrics and JSON contracts). Presentation mode. |
| **Simulation** | Named multi-step scenarios with play, step, speed and loop. |
| **Code** | Bidirectional Mermaid (`.mmd`) and Blueprint Markdown (`.md`, YAML front matter) with line-numbered diagnostics. |
| **Files** | Autosave, session restore, File System Access save and save-as, `.blueprint.json`, share link (compressed URL). |
| **Export** | Standalone interactive HTML, GIF (in a worker), SVG, PNG, Mermaid. |
| **History** | Gesture-grouped undo, named snapshots with a diff engine. |
| **Platform** | Installable PWA with offline precache. Static site on GitHub Pages: **no backend**. |
| **Quality** | TypeScript strict, 237 unit tests, 62 Playwright tests with axe scans, bundle budget (entry JS ≤ 480 kB, CSS ≤ 115 kB), CI on every PR. |

---

## 3. What holds it back

These come from the code and from the reviews in `reiview notes/` and `MUST_DO_PLAN.md`. Each one maps to a redesign item.

| # | Problem | Evidence | Fixed by |
|---|---|---|---|
| P1 | **Too many controls at once.** `index.html` has 105 `<button>` elements. The header alone carries undo/redo, auto-layout with 7 sub-options, motion, a file menu, snapshots, import, code, matrix, export, install, palette, present, shortcuts, settings and two panel toggles, plus an overflow menu that repeats 8 of them. | `grep -c '<button' index.html` → 105 | R-01, R-02 |
| P2 | **The two modes feel like two apps.** Design and Data View swap the inspector, change what a click means, and hide features from each other. People have to know which mode a feature lives in. | Mode branches in `inspector.ts` and `interactions.ts` | R-03 |
| P3 | **The best feature is buried.** Simulation lives in the third inspector tab of Data View. A first-time visitor never sees a packet move unless they open a template and find the tab. | `#tab-simulations` | R-04, F-01 |
| P4 | **One document only.** Nothing lists your diagrams. A new canvas replaces the current one (with a restore offer), so people keep one diagram in the browser and juggle files by hand. | `state.ts`, single autosave key | F-08 |
| P5 | **Keyboard navigation is a tab marathon.** Each node, wire and port is its own tab stop: roughly 100 stops on a template. | `MUST_DO_PLAN.md` item 15.4 | R-06 |
| P6 | **No right-click and no visible groups.** Groups exist in the data but have no outline. Every action lives in the inspector or behind a shortcut. | `MUST_DO_PLAN.md` item 15.5 | R-07, F-09 |
| P7 | **Flat structure.** Real systems have levels (system → container → component). Today a big system is one huge canvas. | `DiagramDocument` has one `nodes` array | F-03 |
| P8 | **The diagram cannot tell you anything.** It never flags a single point of failure, a cycle or an orphan, or adds up latency along a path, even though it knows the whole graph. | `core/layout.ts` already builds adjacency lists | F-02 |
| P9 | **Code editing is a modal, not a partner.** You edit text, press Apply, and lose unapplied edits when you switch format. | `MUST_DO_PLAN.md` item 16 | F-05 |
| P10 | **Starting is slow.** The empty state offers templates, a quick starter, a showcase, import and code: five doors and no clear first step. | `#btn-empty-*` | R-08, F-12 |

---

## 4. Design principles

Use these to settle any argument during the redesign. When two conflict, the higher one wins.

1. **Never lose work, never lie.** Data safety and honest status come first. This is already the rule in `MUST_DO_PLAN.md`; keep it.
2. **The canvas is the interface.** Act on things where they are: select, then act next to the selection. Panels are for depth, not for the common path.
3. **One canvas, many lenses.** "Design", "Traffic", "Review" and "Present" change what is emphasised, not what you are allowed to do.
4. **Motion means something.** Animation shows data flow, cause and effect, or where something went. Nothing moves just to look alive. Everything respects `prefers-reduced-motion`.
5. **Keyboard-complete, touch-complete, screen-reader-complete.** Every action works without a mouse and with a finger. Every change is announced.
6. **Local-first and private by default.** Works offline, stores data in the browser, needs no account. Anything that talks to a server is opt-in and labelled.
7. **Text is a first-class citizen.** Anything you can draw you can write, and the round trip is lossless.
8. **Calm by default, powerful on demand.** Show the 10 things most people need. Put the other 90 behind the command palette, the context menu and progressive disclosure.

---

## 5. The redesigned app: structure and screens

### 5.1 New layout (the studio screen)

```
┌────────────────────────────────────────────────────────────────────────────────────┐
│ ◆ ConduitCraft ▸ Payments Platform ▾   [Design|Traffic|Review|Present]  ⌘K  ● Saved  Share │  ← top bar (≤ 8 controls)
├────┬──────────────────────────────────────────────────────────────┬────────────────┤
│ ▢  │                                                              │ Inspector      │
│ ◯  │                     CANVAS                                   │ (only while    │
│ ◇  │     ┌────────┐      ╭── contextual toolbar ──╮                │  something is  │
│ ⬡  │     │ API GW │━━━━▶ │ ✎  ◐  ⬡  ⇄  🔒  ⋯     │                │  selected,     │
│ ⎔  │     └────────┘      ╰────────────────────────╯                │  or pinned)    │
│ ✎  │                                                              │                │
│ ⧉  │                                         ┌─────────┐          │                │
│ ✋ │                                         │ minimap │ − 100% + ⤢│                │
├────┴──────────────────────────────────────────────────────────────┴────────────────┤
│ ▶ Checkout happy path ▾   ◀  ▮▮  ▶   ━━━━━━●━━━━━━━  step 3/7   1×   ⚠ 2 issues      │  ← run bar (Traffic lens)
└────────────────────────────────────────────────────────────────────────────────────┘
```

| Region | Contents | Replaces |
|---|---|---|
| **Top bar** | Logo and breadcrumb (diagram › level), lens switcher, command palette button, save status, Share. Nothing else. | The current header buttons and the overflow menu. |
| **Tool rail (left)** | Vertical tools: select, components (opens a flyout of kinds and shapes), zone, note, connector, frame, text, hand. One-letter shortcuts (V, C, Z, N, W, F, T, H). | The wide stencil sidebar, which becomes the flyout plus a searchable Insert panel. |
| **Canvas** | The same engine. Adds the contextual toolbar, visible group and frame outlines, smart guides and a right-click menu. | |
| **Inspector (right)** | Slides in only while something is selected. Sections collapse. A pin keeps it open for power users. | The always-on inspector with three tabs. |
| **Run bar (bottom)** | Appears in the Traffic lens: scenario picker, transport controls, scrubber, speed, issue count. | The Simulations tab. |
| **Zoom cluster** | Bottom right, next to the minimap. | The HUD zoom buttons. |

Every control that leaves the header goes into the **command palette** (already built in `src/studio/palette.ts`) and the **context menu**, so no capability is lost.

### 5.2 Lenses (replace the two modes)

| Lens | Emphasis | Editing | Bottom area |
|---|---|---|---|
| **Design** | Shapes, labels, structure. Wires calm (no animation by default). | Full | None |
| **Traffic** | Animated flow, tones, packets, lineage on hover, metrics on nodes. | Full; edits update the run live | Run bar |
| **Review** | Insight issues, comments, snapshot diff overlay (added green, removed red, changed amber). | Comments and fixes | Issue list |
| **Present** | Chrome hidden, step-through storyboard, laser pointer. | None | Story controls |

Switch with `1` `2` `3` `4` or the segmented control. The camera, the selection and the undo stack survive a lens switch (camera stability already shipped in PR #3).

### 5.3 Home screen (new)

A local library of diagrams. It opens when the URL holds no diagram, or with `⌘O`.

```
┌────────────────────────────────────────────────────────────────┐
│ ◆ ConduitCraft                      🔍 Search diagrams    + New │
├────────────────────────────────────────────────────────────────┤
│ Recent                                                         │
│ ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐                │
│ │ thumb   │ │ thumb   │ │ thumb   │ │  + New  │                │
│ │Payments │ │Auth flow│ │CI/CD    │ │ blank / │                │
│ │2 min ago│ │Yesterday│ │Oct 12   │ │template │                │
│ └─────────┘ └─────────┘ └─────────┘ └─────────┘                │
│ Start from a template   [All] [Cloud] [Events] [Auth] [CI]     │
│ …existing templates gallery…                                   │
│ Open file…    Paste Mermaid…    Import infrastructure…         │
└────────────────────────────────────────────────────────────────┘
```

### 5.4 First run (replaces the five-door empty state)

One sentence and one action: *"Watch a request travel through a real system."* It opens the `lumen-relay` example in the Traffic lens with its scenario playing. A small card offers **Start blank** · **Pick a template** · **Paste Mermaid**. Coach marks (F-12) appear only after the user has seen the product work.

### 5.5 Contextual toolbar

Floats 8 px above the selection and flips below it near the top edge. Reuse `placeTooltip` from `src/studio/tooltips.ts` for placement.

| Selection | Actions |
|---|---|
| Node | Rename, kind, colour, shape, connect, duplicate, lock, ⋯ |
| Wire | Label, tone, route style, flow direction, reverse, ⋯ |
| Several | Align, distribute, group, frame, colour, ⋯ |
| Zone or note | Rename, colour, lock, ⋯ |

`⋯` opens the same menu as right-click.

---

## 6. Visual language

### 6.1 Tokens

Keep the existing `--wl-*` tokens (`src/styles/shared.css`, 142 of them) and add a layer on top instead of renaming everything at once.

| Group | New tokens | Notes |
|---|---|---|
| Surface | `--cc-surface-0..4` | 0 is the canvas, 4 is a popover. Five steps in both themes. |
| Ink | `--cc-ink`, `--cc-ink-muted`, `--cc-ink-faint` | Map onto the existing `--wl-ink*`. |
| Accent | `--cc-accent`, `--cc-on-accent` | One brand accent. `--wl-on-blue` from PR #2 becomes `--cc-on-accent`. |
| Stream tones | Keep `blue`, `emerald`, `rose`, `violet`, `amber` | Check each against both canvas backgrounds: 3:1 for wires, 4.5:1 for text. Add to `tests/contrast.test.ts`. |
| Elevation | `--cc-shadow-1..3` | Popovers use 3, the contextual toolbar uses 2. |
| Radius | `--cc-radius-s/m/l` = 6 / 10 / 16 px | |
| Space | 4 px base: `--cc-space-1..8` | |
| Motion | `--cc-ease-out: cubic-bezier(.2,.8,.2,1)`; `--cc-dur-fast/base/slow` = 120 / 200 / 320 ms | All drop to 0 ms under `prefers-reduced-motion`. |

### 6.2 Type

- **UI:** the system font stack. No web-font download, which protects the bundle budget and the offline story.
- **Diagram text:** the same stack, with tabular figures for metrics.
- **Code:** the `ui-monospace` stack.
- **Scale:** 11 / 12 / 13 / 15 / 18 / 24 px. UI body text is 13 px.

### 6.3 Motion vocabulary

| Motion | Meaning | Duration |
|---|---|---|
| Packet travels along a wire | A request or message | Proportional to wire length, or to `latencyMs` when set (F-17) |
| Node pulses once | Received a packet | 200 ms |
| Node shakes once and turns rose | Failed in a chaos run (F-01) | 320 ms |
| Wire dims to 20% | Not on the hovered or selected path | 120 ms |
| Panel slides in from its edge | Context appeared | 200 ms |
| Camera eases to a target | Navigation: fit, jump to issue, storyboard step | 320 ms, never during a drag |

### 6.4 Canvas look

- A dot grid that fades out below 50% zoom (ties into the existing level-of-detail attribute).
- Selection: a 2 px accent outline with a soft 6 px halo. Groups: a 1 px dashed outline, shown on hover or when a member is selected. Frames: a solid outline with a title tab.
- Wires: 2 px at rest, 3 px on hover, with the end arrow sitting outside the node border.

---

## 7. Missing features

Ranked by how much each makes ConduitCraft *different*, then by user value per day of effort. **Effort:** S = up to 2 days, M = 3 to 5 days, L = 1 to 2 weeks, XL = over 2 weeks.

### Summary

| ID | Feature | Why it matters | Effort | Needs a server? |
|---|---|---|---|---|
| F-01 | Chaos and failure simulation | The signature feature: see the blast radius when a component fails | M | No |
| F-02 | Architecture insights | The diagram flags single points of failure, cycles, orphans and latency overruns | M | No |
| F-03 | Nested levels (drill-down) | Big systems stay readable; C4-style zoom into a component | L | No |
| F-04 | Storyboards | Turn a diagram into a guided, captioned walkthrough | M | No |
| F-05 | Live split code editor | Text and canvas update each other as you type | M | No |
| F-06 | Import from real infrastructure | Docker Compose, Kubernetes, OpenAPI, AsyncAPI, Terraform → diagram | L | No |
| F-07 | Comments and review | Threads pinned to nodes and wires, resolvable, exported | M | No for local; yes for live sharing |
| F-08 | Diagram library | Many diagrams, searchable, with thumbnails, in IndexedDB | M | No |
| F-09 | Frames and containers | VPC, subnet and cluster boxes that own their children | M | No |
| F-10 | Smart guides and snapping | Precise layout without the align panel | S | No |
| F-11 | Better auto-layout (ELK) | Layered layout with fewer crossings, ports respected | M | No |
| F-12 | Onboarding that teaches by doing | The first 60 seconds show the magic, then teach | S | No |
| F-13 | Embeds and read-only viewer | A live diagram in docs, wikis and READMEs | M | No (static files) |
| F-14 | Real-time collaboration | Multiplayer cursors and edits | XL | Yes |
| F-15 | AI assist (opt-in) | Describe a system → draft diagram; explain a diagram | M | Yes, or bring your own key |
| F-16 | Icon packs | Tech and cloud icon sets | S per pack | No |
| F-17 | Wire labels and protocols | Label, protocol, sync/async, latency | S | No |
| F-18 | Diagram styles | Blueprint, sketch, high-contrast, print | M | No |
| F-19 | Video export (WebM/MP4) | Share a scenario run in chat or a deck | S | No |
| F-20 | Internationalisation | Translated UI, RTL-safe layout | M | No |

### F-01 Chaos and failure simulation *(signature feature)*

- [ ] Shipped in PR —

**Why.** I don't know of a mainstream diagram tool that lets you ask "what happens if the queue dies?" ConduitCraft already animates traffic and knows the graph, so this is a short step with a large payoff. This is the screenshot for the landing page.

**What to build.**
1. In the Traffic lens, right-click a node (or press `X`) → **Fail this component**. The node turns rose and shakes once (table 6.3).
2. Run the current scenario. Packets that reach a failed node stop. Everything downstream with *no other path* from an entry point is marked **unreachable** (dimmed, with a broken-link badge). Components that still have a redundant path stay lit and show a "rerouted" badge.
3. The run bar summarises: `2 failed · 5 unreachable · 1 rerouted`. Clicking the summary lists them; clicking an item pans to it.
4. Per-node `resilience` options in the inspector: `replicas` (number), `fallback` (another node), `circuitBreaker` (on/off). A node with more than one replica degrades (amber) instead of failing outright.
5. **Blast-radius preview:** with no scenario running, holding `Alt` while hovering a node previews what would become unreachable.
6. Failures belong to the lens, not the document. They are never saved or exported unless the user saves them as a named chaos scenario.

**Data model.** Add `resilience?: { replicas?: number; fallbackId?: string; circuitBreaker?: boolean }` to `DiagramNode` and `failures?: string[]` (node ids) to `SimulationScenario`. Both are optional, so old files load unchanged. Round-trip them through Blueprint YAML and `.blueprint.json`. Mermaid import and export drop them and add an `info` line to the import report.

**Code.** A new pure module `src/core/reachability.ts`: `reachableFrom(doc, entryIds, failedIds) → { reachable, unreachable, rerouted }`, unit tested against every bundled template. Wire it into `simulationPlayback.ts` and the paint in `keyedStage.ts`.

**Done when.** Failing each node of each bundled template gives the expected unreachable set (unit tests). A Playwright test fails the broker in `event-driven-microservices` and sees the summary. axe passes. The live region announces "Payments Queue failed. 5 components unreachable."

### F-02 Architecture insights

- [ ] Shipped in PR —

**Why.** The diagram knows the graph but never says anything about it. Insights turn a drawing into a design-review partner.

**First rule set.**

| Code | Rule | Level |
|---|---|---|
| `spof` | A node whose removal disconnects an entry point from a sink | warning |
| `cycle` | A synchronous cycle (async wires are excluded once F-17 lands) | warning |
| `orphan` | A node with no wires | info |
| `dangling-store` | A data store nothing reads from | info |
| `deprecated-in-path` | A `status: deprecated` node on a scenario path | warning |
| `at-risk-fan-in` | An `at-risk` node with 3 or more upstream dependents | warning |
| `latency-budget` | Sum of wire `latencyMs` along a scenario exceeds the scenario's `budgetMs` | error |
| `unlabeled-wire` | A wire between two services with no label | info |

**UI.** The Review lens lists issues grouped by rule, and the top bar shows a count (`⚠ 2`). Each issue pans to and selects its target. Issue badges appear on the canvas in Review only. Each rule can be muted per diagram (`doc.insights.muted: string[]`).

**Code.** `src/core/insights.ts` reuses the `ImportIssue` shape (`level`, `message`, `code`) and adds a `target` (node or edge id). It is pure, unit tested, and runs on idle after each history commit (debounced 300 ms). `spof` uses articulation points on the undirected graph, restricted to entry-to-sink paths.

**Done when.** Each rule has positive and negative unit tests. No bundled template produces an `error`. A Playwright test clicks an issue and the target is selected.

### F-03 Nested levels (drill-down)

- [ ] Shipped in PR —

**Why.** Large systems turn into wallpaper. The C4 model (context → container → component) is how architects explain systems, and drilling into a box is the natural gesture for it.

**What to build.**
1. Any node can **open as a level**: `⌘↵`, or a click on its small "⤵" badge. Double-click on the node body stays rename (PR #2).
2. Opening eases the camera into the node, then fades in its child diagram. The top-bar breadcrumb shows `Payments ▸ Checkout API ▸ …`. `⌘↑`, or `Esc` when nothing else is active, goes up a level.
3. Wires that cross the boundary appear on the child level as **boundary ports** on the frame edge, labelled with the outside node's name.
4. Search (`nodeSearch.ts`) and insights cover all levels and show the path.
5. HTML export includes every level with the same drill-down. SVG and PNG export the current level.

**Data model.** `DiagramNode.child?: { nodes; edges; zones; notesCards }`, a sub-document without document-level fields, kept inline so `.blueprint.json` stays one file. Blueprint YAML gets a nested `children:` key. Mermaid `subgraph` blocks can import as frames or as levels (user's choice in the import dialog).

**Risks.** Undo must work across levels: keep one history stack whose entries record the level path. Share links grow, so measure against the URL size limit and fall back to "Copy file" when too big.

### F-04 Storyboards

- [ ] Shipped in PR —

**Why.** Presentation mode shows the whole diagram at once. Explaining a system is a sequence: "a request comes in here, then this, then that fails". Storyboards make the diagram tell its own story, and they feed video export (F-19).

**What to build.** A story is a list of steps. Each step stores a camera (x, y, zoom), a lens, highlighted ids, an optional scenario step range and a caption (Markdown, up to 280 characters). Build one in the Present lens by framing the view and pressing `+ Step`. Playback eases the camera (320 ms) and reveals the caption. Arrow keys move between steps. Exported HTML includes stories.

**Data model.** `DiagramDocument.stories?: Story[]`.

### F-05 Live split code editor

- [ ] Shipped in PR —

**Why.** "Diagram as code" is a headline feature, but today it is a modal with an Apply button. The existing plan already lists this as the top differentiator (`MUST_DO_PLAN.md` item 16).

**What to build.**
1. A resizable code pane on the right (at the bottom on narrow screens), toggled with `⌘/`.
2. Parse on input, debounced 250 ms. Valid text updates the canvas live, one history entry per typing pause. Invalid text keeps the last good canvas and marks the bad lines using the existing line-numbered diagnostics.
3. Selecting on the canvas highlights the matching lines. Putting the cursor in a node's block selects that node.
4. Switching Mermaid ↔ Blueprint warns before dropping anything that cannot round-trip, and never discards unapplied text silently.
5. Start with a light textarea plus a line-number gutter and simple syntax colouring. Bring in CodeMirror 6 only if that is not good enough, and only as a lazy chunk outside the entry bundle.

### F-06 Import from real infrastructure

- [ ] Shipped in PR —

**Why.** Drawing what already exists is the most tedious part of architecture docs. Import makes the first diagram take seconds.

| Source | Mapping | Effort |
|---|---|---|
| `docker-compose.yml` | Services → nodes; `depends_on` and shared networks → wires; volumes → stores | S |
| OpenAPI 3 | One node per server or tag; operations listed as node metrics | S |
| AsyncAPI | Channels → bus nodes; publishers and subscribers → wires | S |
| Kubernetes manifests (multi-document YAML) | Deployments and StatefulSets → services; Services and Ingress → wires; namespaces → zones | M |
| Terraform state JSON (`terraform show -json`) | Resources → nodes by type; references → wires; modules → frames | L |

All parsing runs in the browser and files never leave the machine. Every importer reports skipped resources through the existing import report. `js-yaml` is already a dependency, so the YAML-based importers add little code. Load each importer as its own lazy chunk.

### F-07 Comments and review

- [ ] Shipped in PR —

Pin a thread to a node, a wire or a canvas point (`C` in the Review lens, or the context menu). Threads can be resolved and reopened, show as small markers on the canvas, and are listed in the Review lens next to insight issues. They are stored in the document (`doc.comments`), so they travel in `.blueprint.json` and show read-only in exported HTML. The existing `DiagramNode.comment` string migrates into a node's first thread. Live multi-user comments wait for F-14.

### F-08 Diagram library

- [ ] Shipped in PR —

**Why.** One diagram per browser is the biggest gap for repeat users (P4).

**What to build.** The home screen in 5.3. Storage moves from `localStorage` to IndexedDB (already on the plan's item 14 list). Each diagram is one record: id, title, updated time, a 320 × 200 thumbnail rendered by the existing `stagePicture.ts`, and the document. Autosave writes to the open diagram's record. Rename, duplicate, delete (with a 10-second Undo toast; never a delete without it) and "Export all as .zip". Show a storage warning above 80% of `navigator.storage.estimate()`.

**Migration.** On first load the existing autosave becomes the first library entry. Never overwrite or drop it. Add a Playwright test that seeds the old key and checks the entry exists.

**Note.** `MUST_DO_PLAN.md` section 3 rejected *multi-document tabs*. A library is different: one open document at a time, many stored. The single-document state model in `state.ts` stays as it is.

### F-09 Frames and containers

- [ ] Shipped in PR —

Frames are titled boxes that *own* their children: moving a frame moves its contents, dropping a node inside adds it, and frames can nest (VPC › subnet › service). Swimlane zones stay as full-height columns; frames are free-form. This also covers the "visible group bounds" half of `MUST_DO_PLAN.md` item 15.5, because a group can be promoted to a frame in one click. Data model: `DiagramFrame { id, title, x, y, width, height, tone, parentId? }` and `DiagramNode.frameId?`.

### F-10 Smart guides and snapping

- [ ] Shipped in PR —

While dragging, show accent guide lines when an edge or centre lines up with another component within 6 screen px, and snap to it. Show equal-spacing marks between three or more items. Hold `⌘` (`Ctrl` elsewhere) to suspend snapping; hold `Alt` to show distances in px. Put the pure function `snapToGuides(moving, others, threshold)` in a new `src/studio/guides.ts` with unit tests, and draw the guides on the existing `#wire-handles-svg` overlay.

### F-11 Better auto-layout

- [ ] Shipped in PR —

Add ELK (`elkjs`) as a **lazy chunk** behind a new "Layered (ELK)" option in the auto-layout menu. Keep the current layout as the default until ELK is proven on every template. Respect fixed ports, treat zones as layers and locked nodes as fixed. Animate the move (320 ms) and record it as one undo step. Measure the chunk; it must not affect the entry budget.

### F-12 Onboarding that teaches by doing

- [ ] Shipped in PR —

The first-run flow from 5.4, then three optional coach marks that appear only when relevant: the first selection (contextual toolbar), the first wire drag (drop on empty canvas to create), the first visit to Traffic (fail a component). Each can be dismissed for good. `MUST_DO_PLAN.md` warns that a tour which walks users into a bug is worse than none, so this ships last in its phase and every step has a Playwright test.

### F-13 Embeds and read-only viewer

- [ ] Shipped in PR —

A read-only viewer build (`view.html`) that takes a share-link payload and renders the diagram with Traffic and storyboards but no editing UI. "Share › Embed" copies an `<iframe>` snippet, plus a Markdown image-and-link snippet for READMEs. Target a viewer chunk under 120 kB gzipped. It works on GitHub Pages with no server.

### F-14 Real-time collaboration *(needs a server; later)*

- [ ] Shipped in PR —

Use a CRDT (Yjs) with a pluggable provider: WebRTC for peer-to-peer rooms that need no server of our own, and a WebSocket provider for teams that self-host. Presence cursors, follow mode and per-user undo. This is the largest item and it changes the history model (undo becomes per user, through `Y.UndoManager`), so it waits until F-08's storage layer is settled. Answer question 1 in section 12 first.

### F-15 AI assist *(opt-in; later)*

- [ ] Shipped in PR —

Two features only. **Draft:** "Describe your system" produces a Blueprint YAML draft that goes through the normal parser and import report, so the user sees and accepts it. **Explain:** generate a plain-language summary and a storyboard from the diagram. No server of our own: the user supplies their own API key, stored only in their browser, with a clear notice of what is sent. Off by default and absent from the entry bundle.

### F-16 Icon packs

- [ ] Shipped in PR —

Optional, lazy-loaded icon sets, generic tech icons first. Check the licence of any cloud-provider set before bundling it in an MIT project; providers publish their own terms. Keep the custom image icon path for everything else.

### F-17 Wire labels and protocols

- [ ] Shipped in PR —

`DiagramEdge` already has `label`, `animated`, `flow` and `comment`. Add `protocol` (`http`, `grpc`, `graphql`, `kafka`, `amqp`, `sql`, `custom`), `sync` (`sync` | `async`) and `latencyMs`. Async wires draw dashed. Labels sit on the wire on a background chip, with the protocol as a small prefix (`gRPC · charge card`). `latencyMs` feeds F-02's latency budget and the packet speed in Traffic. It's a small change that F-01 and F-02 both build on.

### F-18 Diagram styles

- [ ] Shipped in PR —

Separate the **app theme** (light and dark, already supported) from the **diagram style**: `Studio` (current), `Blueprint` (white ink on a deep-blue grid), `Sketch` (hand-drawn strokes from a deterministic path roughener, no library), `High contrast` and `Print` (no shadows, black ink). Each style is a CSS variable set plus a stroke treatment, applied to the canvas and to every export.

### F-19 Video export

- [ ] Shipped in PR —

Record the canvas during a scenario or storyboard with `MediaRecorder`: WebM everywhere, MP4 where the browser supports it. Reuse the GIF exporter's frame loop. Files are far smaller than GIF for long runs.

### F-20 Internationalisation

- [ ] Shipped in PR —

Move UI strings out of `index.html` and the TypeScript modules into a small message catalogue. Use logical CSS properties so right-to-left layouts work. Ship English plus one other language to prove the pipeline.

---

## 8. Technical foundations the redesign needs

Build these as part of the R-items; each unblocks several features.

| ID | Foundation | Unblocks | Notes |
|---|---|---|---|
| T-01 | **Action registry.** Every user action (rename, lock, align, fail node…) is one `Action { id, label, shortcut, when(selection, lens), run() }`. The top bar, context menu, contextual toolbar, command palette and keyboard shortcuts all read from it. | R-01, R-02, R-07, F-12 | `commands.ts` already has `SHORTCUTS` and the palette has its own commands; merge them. This is what makes removing most header buttons safe. |
| T-02 | **Lens state** replacing `workspaceMode`: `app.lens: 'design' \| 'traffic' \| 'review' \| 'present'`. | R-03 | Migrate caller by caller. Keep `workspaceMode` as a derived getter until the last caller is gone. |
| T-03 | **Document schema version** and migrations: `doc.version` plus a `migrate(doc)` chain. | F-03, F-07, F-09, F-17 | Every new optional field gets a round-trip test through YAML, JSON and the share link. |
| T-04 | **IndexedDB storage layer**, migrating from the `localStorage` autosave. | F-08, F-14 | Item 14 on the existing plan. |
| T-05 | **Lazy chunk discipline.** ELK, importers, code editor, video export, viewer and AI each load on first use. Add per-chunk budgets to `tools/checkBundleSize.mjs`. | F-05, F-06, F-11, F-13, F-15, F-19 | The entry stays ≤ 480 kB. |
| T-06 | **One live-region announcer** used by every action ("Grouped 3 components", "Payments Queue failed"). | R-06, F-01 | `src/studio/a11y.ts` exists; make it the single path. |

---

## 9. Delivery plan, PR by PR

Each phase ends with a releasable app. Never leave `main` half redesigned. New chrome ships behind a `?ui=2` flag (remembered per viewer) until phase 2 ends. It then becomes the default, with a "Classic layout" option in settings for one release.

### Phase 0: Finish the existing plan (about 1 week)

- [ ] **R-06 Roving tabindex** (plan item 15.4). The canvas becomes one tab stop. Arrow keys move to the nearest component in that direction; `Tab` inside the canvas cycles the focused node's wires; `Enter` selects; `Esc` returns focus to the canvas container. Announce position, for example "API Gateway, service, 3 of 14, 2 outgoing wires". Playwright check: tabbing from the toolbar to the inspector takes 6 presses or fewer on a template.
- [ ] **R-07 Context menu and group outlines** (plan item 15.5). Right-click and `Shift+F10` open a menu built from T-01. Groups get the dashed outline from 6.4.
- [ ] **T-06** announcer consolidation.

### Phase 1: New shell (about 2 weeks, behind `?ui=2`)

- [ ] **T-01 Action registry.**
- [ ] **R-01 Top bar** with at most 8 controls (5.1). Every removed control stays reachable from the palette; a unit test asserts that every registry action is reachable from at least one surface.
- [ ] **R-02 Tool rail and Insert flyout** replacing the stencil sidebar.
- [ ] **Contextual toolbar** (5.5).
- [ ] **Inspector** that appears with a selection, with collapsible sections and a pin.
- [ ] **Tokens** from 6.1, applied to the new chrome only.
- [ ] Playwright: the existing 62 tests pass under both `?ui=1` and `?ui=2` (parametrise the fixtures).

### Phase 2: Lenses and the run bar (about 1.5 weeks)

- [ ] **T-02 Lens state** and **R-03 lens switcher**, keys `1` to `4`.
- [ ] **R-04 Run bar** replacing the Simulations tab.
- [ ] **F-17 Wire labels and protocols** (small, and F-01 and F-02 depend on it).
- [ ] Make `?ui=2` the default and keep "Classic layout" in settings.

### Phase 3: The signature (about 2 weeks)

- [ ] **F-01 Chaos simulation.**
- [ ] **F-02 Insights**, with the Review lens.
- [ ] **R-08 first run** (5.4), pointing at the chaos demo.
- [ ] Re-record the README GIFs to show a failure run.

### Phase 4: Many diagrams, real systems (about 2.5 weeks)

- [ ] **T-03 Schema versioning** and **T-04 IndexedDB**.
- [ ] **F-08 Library and home screen.**
- [ ] **F-06 Importers:** Docker Compose and OpenAPI first, then Kubernetes.
- [ ] **F-10 Smart guides.**

### Phase 5: Depth (about 3 weeks)

- [ ] **F-09 Frames**, then **F-03 Nested levels**.
- [ ] **F-05 Live code editor.**
- [ ] **F-11 ELK layout** (lazy).

### Phase 6: Telling the story (about 2 weeks)

- [ ] **F-04 Storyboards**, **F-19 Video export**, **F-13 Embeds and viewer.**
- [ ] **F-18 Diagram styles.**
- [ ] **F-07 Comments** (local).
- [ ] **F-12 Coach marks.**

### Phase 7: Beyond one browser (answer section 12 first)

- [ ] **F-14 Collaboration**, **F-15 AI assist**, **F-16 Icon packs**, **F-20 Internationalisation.**

---

## 10. Quality bars

Every PR in this plan meets all of these. CI already enforces the first five.

| Bar | Target | How it's checked |
|---|---|---|
| Types | `tsc` clean, strict | CI `verify` job |
| Unit tests | All pass; every new pure module (`reachability`, `insights`, `guides`, importers, migrations) has its own test file | `pnpm test` |
| Browser tests | All pass; every new feature has at least one Playwright test | `pnpm test:e2e` |
| Accessibility | Zero axe violations at 375, 1280 and 1600 px, light and dark, in every lens | Extend `e2e/a11y.spec.ts` with lenses |
| Bundle | Entry JS ≤ 480 kB, CSS ≤ 115 kB; every lazy chunk has its own budget | `pnpm check:size` (extend for chunks) |
| Contrast | Text 4.5:1; wires and focus rings 3:1; both themes and every diagram style | `tests/contrast.test.ts` |
| Smoothness | Drag, pan and zoom hold 60 fps on the largest template; full render stays ≤ 16 ms (today's figure) | Performance trace before and after each phase |
| Reduced motion | No animation runs under `prefers-reduced-motion: reduce` | Playwright with `reducedMotion: 'reduce'` |
| Data safety | Nothing can lose an autosave, a library entry or unapplied code text without an Undo | Playwright tests named `never loses …` |
| Round trip | Every new field survives JSON, YAML and the share link; anything Mermaid drops is reported | Unit round-trip tests |

**Award-readiness checklist** (review at the end of phases 3 and 6):

- [ ] A new visitor sees a packet travel and a failure ripple out within 10 seconds, without reading anything.
- [ ] Every action works by keyboard alone and is announced to a screen reader.
- [ ] Every action works by touch on a tablet.
- [ ] The app works fully offline after the first visit.
- [ ] No screen has more than 8 always-visible controls outside the canvas.
- [ ] Every animation explains something (audit against table 6.3).
- [ ] Exports, embeds and shared links look as good as the studio.

---

## 11. What we will not do

| Idea | Why not |
|---|---|
| Rewrite the renderer on Canvas or WebGL | The keyed DOM renderer measures about 16 ms per full render, and the DOM gives accessibility and text selection for free. Revisit only if a real diagram of roughly 1,000 nodes is slow. |
| Adopt a UI framework (React, Svelte) | The vanilla keyed reconciliation works and the bundle budget is tight. The real problem is duplicated control wiring, which the action registry (T-01) solves. |
| Accounts and a hosted backend by default | Breaks principle 6 and the GitHub Pages deployment. Collaboration and AI stay opt-in. |
| General whiteboard features (freehand drawing, sticky-note walls) | Miro and Excalidraw own that space, and it dilutes "explain how a system works". |
| Split `state.ts` into a store library | Still no user-visible payoff (`MUST_DO_PLAN.md` section 3). T-02 only changes the mode field. |
| Patch-based undo | Same reason as in `MUST_DO_PLAN.md`. Revisit with F-14, where Yjs provides it. |

---

## 12. Open questions

Answer each before the phase that needs it.

1. **Collaboration hosting (phase 7).** Peer-to-peer WebRTC only (no server, and a room ends when everyone leaves), or also document a self-hosted WebSocket server? Running a hosted service would be a separate project.
2. **AI (phase 7).** Bring-your-own-key only, or leave AI out entirely? Which providers, if any?
3. **Brand (phase 1).** Keep the current ConduitCraft mark, or refresh the logo and accent as part of the redesign? The tokens in 6.1 make either easy.
4. **Classic layout (phase 2).** Remove the `?ui=1` option after one release, or keep it longer?
5. **Levels and frames (phase 5).** Ship both, or only frames if levels prove too complex for undo and share links?
6. **Icon packs (phase 7).** Which icon sets have licences that allow bundling in an MIT project?
