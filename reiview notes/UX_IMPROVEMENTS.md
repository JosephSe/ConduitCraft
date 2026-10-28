# ConduitCraft — User Experience (UX) Review & Improvement Guide

**Reviewed Repository:** [`JosephSe/ConduitCraft`](https://github.com/JosephSe/ConduitCraft) (commit `4e233f2`)  
**Scope:** `index.html`, `src/studio/*`, `src/core/*`, `src/exporter/*`, `src/styles/*`, `public/sw.js`, `docs/guide.md`, `ROADMAP.md`, and `IMPROVEMENTS.md`.

---

## Executive Summary

ConduitCraft already delivers an impressive feature set inside an ultra-lean (`js-yaml`-only) TypeScript and CSS `@layer` architecture:
- **What works well:** 9 wire routing modes with lane separation, incremental keyed DOM reconciliation, gesture-grouped undo/redo, live telemetry & packet scenarios, standalone interactive HTML and looping GIF exports, deflate URL-hash sharing, command palette (`⌘K`), starter templates gallery, and View Transitions.
- **Where the UX breaks down today:**
  1. **Cross-module selector & state regressions:** Because Suggestions 1–19 in `IMPROVEMENTS.md` shipped rapidly, several contracts between modules drifted—for example, `⌘F` node search currently dims 100% of nodes (including matches), low-zoom Level-of-Detail disables all connection ports on default laptop `Fit` views, collapsed palette rail buttons do nothing on click, and `⌘S` can overwrite `.mmd`/`.md` files with JSON.
  2. **Indirect canvas manipulation:** Common authoring actions (renaming nodes/wires, branching a new downstream component from a wire, reconnecting wire endpoints, or recording simulation hops) still require constant round-trips to the right sidebar or modal dialogs rather than direct manipulation on the canvas.

---

## Prioritized UX Roadmap

Items are ordered by **impact-to-effort ratio**, starting with critical regressions and data-trust fixes, followed by direct canvas ergonomics and core differentiator workflows.

| # | Status | Area | Improvement | Impact | Effort | Category |
| :- | :---: | :--- | :--- | :--- | :---: | :--- |
| **1** | `[ ]` | Search & Motion | Fix broken `.arch-node` DOM identity breaking `⌘F` highlights, drop-in animations, and wiring feedback | **Critical** | XS | Bug / Regression |
| **2** | `[ ]` | File Safety | Prevent `⌘S` from overwriting `.mmd`/`.md` files with JSON, reset file handles on template load, and show dirty/file status | **Critical** | S | Data Trust |
| **3** | `[ ]` | Wiring & Zoom | Keep connection ports interactive at `< 55%` zoom (`data-lod="low"`) and frame small diagrams at readable zoom | **Very High** | S | First-Run UX |
| **4** | `[ ]` | Compact UI | Fix non-functional collapsed palette rail buttons (`database`/`queue`/`cloud` + `.click()`) and include all 7 stencils | **High** | XS | Bug / Regression |
| **5** | `[ ]` | Direct Editing | Add double-click inline text editing on nodes, wire labels, swimlanes, and notes cards | **Very High** | M | Canvas Ergonomics |
| **6** | `[ ]` | Fast Wiring | Add "drop wire on blank canvas to create node" quick-picker and draggable wire source/target endpoints | **Very High** | M | Canvas Ergonomics |
| **7** | `[ ]` | Camera & Input | Stop resetting zoom/pan on window resize & mode switch; fix trackpad scroll/pinch, `Space+drag`, and `⌘K` spawn coordinates | **High** | S | Navigation |
| **8** | `[ ]` | Groups & Multi-Select | Show visual group bounds, add right-click context menu, fix `"left Align Left"` labels, extend marquee/copy-paste, and resolve `[` / `]` shortcut collisions | **High** | M | Authoring Depth |
| **9** | `[ ]` | Code Sync | Replace destructive modal `#code-dialog` workflow with a live split-pane drawer, line numbers, and safe format toggling | **High** | M–L | Core Differentiator |
| **10** | `[ ]` | Chrome & Feedback | Decouple `#hud-status-tip` from dismissible coach card, simplify `File` menu (`Open` vs `Import`), fix `Escape` in Connect mode, and fix SVG/edge tooltips | **High** | S | Clarity & Polish |
| **11** | `[ ]` | Telemetry & Scenarios | Surface simulation playback controls in all modes, animate packets along SVG wire paths, add visual hop recording, and add missing `Async` + Status filters | **High** | M | Core Differentiator |
| **12** | `[ ]` | Review, Present & Export | Scope snapshots per diagram with an on-canvas diff overlay, fix Presentation HUD/export bugs, auto-collapse drawers `< 66rem`, and add clean vector/progress exports | **Medium–High** | M–L | Sharing & Polish |

*Effort scale: **XS** (< 2 hours) · **S** (0.5 day) · **M** (1–2 days) · **L** (3–4 days)*

---

## Detailed Findings & Implementation Blueprints

### 1. Fix the Broken Node DOM Identity Contract (`⌘F` Search, Drop-In Motion & Active Wiring)
**Category:** Bug / Regression · **Impact:** Critical · **Effort:** XS  
**Files:** `src/studio/keyedStage.ts:619`, `src/studio/nodeSearch.ts:76`, `src/studio/interactions.ts:206, 237`

#### Current UX Problem
- `createNodeElement()` in `keyedStage.ts:619` creates `<div class="arch-node" data-node="${nodeId}" data-kind="${node.kind}">`—it **never sets `wrapper.id`** (`node-${nodeId}`) and **never sets `wrapper.dataset.nodeId`**.
- Meanwhile, `applySearchHighlightsToStage()` in `nodeSearch.ts:76` reads:
  ```ts
  const id = el.dataset.nodeId || el.id.replace(/^node-/, '');
  ```
  On live stage nodes, `id` evaluates to `""` for **every single node**. Typing any query into `⌘F` sets `isMatch = false` across 100% of nodes—**dimming the entire diagram (including matched nodes)** and never applying `.is-search-match` or `.is-active-match`.
- Similarly, `tagEnteringNodes()` (`interactions.ts:206`) and `beginPortWireDrag()` (`interactions.ts:237`) look up `document.getElementById('node-' + id)`, which always returns `null`—silently disabling node drop/paste entrance animations (`.is-entering`) and source-node wiring highlights (`.is-wiring-source`).

#### How to Improve
1. In `createNodeElement()` (`keyedStage.ts:619`) and `paintNode()`, set `wrapper.id = `node-${node.id}`` alongside `wrapper.dataset.node = node.id`.
2. Update `nodeSearch.ts:76` to check `const id = el.dataset.node || el.dataset.nodeId || el.id.replace(/^node-/, '');`.
3. In `initNodeSearch` (`interactions.ts:2038`), avoid calling `fitSelection()` with aggressive zoom jumps on every `input` keystroke; instead, smoothly pan only if the active match lies outside the viewport while typing, and zoom-frame on `Enter` / `Shift+Enter`.
4. Update `tests/nodeSearch.test.ts` and `tests/motion.test.ts` to render nodes through `renderNodes()` rather than synthetic mock `<div>` fixtures so selector mismatches fail CI immediately.

---

### 2. Eliminate Silent File-Overwrite Hazards & Surface Document Save State
**Category:** Data Trust · **Impact:** Critical · **Effort:** S  
**Files:** `src/studio/pwa.ts:88–167`, `src/studio/interactions.ts:1485, 1599, 1611–1639`

#### Current UX Problem
- **Cross-format file corruption:** `openWithNativeFilePicker()` (`pwa.ts:88`) accepts `.blueprint.json`, `.mmd`, and `.md` files (`BLUEPRINT_FILE_TYPES`) and stores the returned `FileSystemFileHandle` in `activeFileHandle`. When the user presses `⌘S` (`handleSaveDiagram` in `interactions.ts:1611`), it **unconditionally** serializes `serializeBlueprintJson(app.doc)` and writes raw JSON bytes into `activeFileHandle`—silently overwriting an opened `.mmd` or `.md` file with JSON! Even in `Save As…`, choosing `.mmd` or `.md` in the OS picker still writes JSON content.
- **Stale file-handle overwrite:** `resetActiveFile()` is only called by `btnNewCanvas` (`interactions.ts:1607`). Opening `prod-arch.blueprint.json` via `⌘O`, then clicking **Load showcase**, picking a template, restoring an autosave, or dropping a new file leaves `activeFileHandle` pointing at `prod-arch.blueprint.json`. Pressing `⌘S` overwrites the user's original file on disk with the template.
- **Invisible save state:** There is no visual indicator showing whether the user is editing `localStorage` scratch state or a linked disk file, nor whether disk changes are unsaved (`beforeunload` at `interactions.ts:1599` only checks `app.hasPendingAutosave`, which clears 320 ms after any edit).

#### How to Improve
1. Inspect the active filename extension inside `handleSaveDiagram()`:
   - `.mmd` / `.mermaid` → `serializeToMermaid(app.doc)` (with a one-time confirmation toast/prompt noting `.mmd` omits metrics/scenarios and offering **Save as `.blueprint.json`**).
   - `.md` / `.markdown` → `serializeToBlueprintMarkdown(app.doc)`.
   - `.json` → `serializeBlueprintJson(app.doc)`.
2. Call `resetActiveFile()` inside `loadTemplateDoc()`, `handleUploadedFile()`, `btnRestoreSession`, snapshot restore, and URL-hash diagram loads.
3. Add a subtle save-status pill next to `#doc-title-heading` (`Saved to local storage` vs. `orders.blueprint.json • Unsaved` when `diskDirty` is true), and trigger `beforeunload` whenever `diskDirty || app.hasPendingAutosave`.

---

### 3. Keep Ports Interactive at Low Zoom & Fix Empty/Small-Diagram Framing
**Category:** First-Run UX · **Impact:** Very High · **Effort:** S  
**Files:** `src/styles/studio.css:2128–2135`, `src/studio/state.ts:250, 273–296`

#### Current UX Problem
- `applyTransform()` (`state.ts:250`) sets `stageWorld.dataset.lod = 'low'` whenever `scale < 0.55`.
- `studio.css:2128–2135` applies `opacity: 0; pointer-events: none;` to `#stage-world[data-lod="low"] .node-port`.
- On a standard 13"–15" laptop, the center canvas between the 264 px palette and 360 px inspector is ~800–900 px wide. Because `fitToViewport()` divides viewport width by the full `1680×920` stage (`scale ≈ 0.46`, or `0.38` on the `2920×1172` showcase), **the default `Fit` zoom starts in `data-lod="low"`**.
- Consequently, a first-time user clicks **+ Add Starter Pair** (or drops two stencils), reads the HUD hint *"Drag from any port dot to wire animated streams"*, hovers over the nodes, and finds **every port dot invisible and unclickable** until they zoom past 55%.

#### How to Improve
1. Remove `.node-port` from the `pointer-events: none` rule under `#stage-world[data-lod="low"]`. Keep ports visually quiet when idle at low zoom, but reveal them on `.arch-node:hover .node-port`, `.arch-node:focus-within .node-port`, and `.workspace[data-wiring="true"] .node-port`.
2. Expose `--stage-scale` on `#stage-world` and counter-scale `.node-port` hit targets (`transform: scale(clamp(1, calc(0.85 / var(--stage-scale, 1)), 2.2))`) so ports remain easy to grab even at 40% zoom.
3. Update `fitToViewport()` so that when `doc.nodes.length > 0` and `doc.zones.length === 0`, it frames `contentWorldBounds(doc)` with generous padding clamped to `[0.65, 1.0]` rather than shrinking two starter nodes into the middle of an empty `1680×920` world at 46%.

---

### 4. Repair the Collapsed Palette Icon Rail & Support Dragging from Rail Icons
**Category:** Bug / Regression · **Impact:** High · **Effort:** XS  
**Files:** `index.html:253–271`, `src/studio/responsiveToolbar.ts:170–188`, `src/studio/interactions.ts:213–258, 2469`

#### Current UX Problem
- When the left Component Palette is collapsed (`[`), `#palette-rail-content` displays 6 quick-add buttons: `service`, `database`, `queue`, `cloud`, `zone`, and `notes`.
- Three of those `data-stencil-kind` values (`database`, `queue`, `cloud`) **do not match any `NodeKind`** (`'actor' | 'core' | 'service' | 'bus' | 'gate' | 'store' | 'client'`).
- Furthermore, `bootStudio()` calls `responsiveToolbar.init()` with no `onAddStencil` handler, so `responsiveToolbar.ts:185` falls back to `document.querySelector('.stencil-card[data-kind="..."]')?.click()`. Because `.stencil-card` in `initStencilPalette()` binds `pointerdown`/`pointerup` and `keydown`—**not `click`**—clicking **any** of the 4 component stencil buttons in the collapsed rail does nothing at all.
- Three stencils (`Actor`, `Core System`, `Control Gate`, `External Client`) are missing from the rail altogether.

#### How to Improve
1. Populate `#palette-rail-content` dynamically from `STENCIL_CATALOG` inside `initStencilPalette()` so all 7 component stencils + Swimlane + Notes share one canonical source of icons, tooltips, and accent colors.
2. Bind the exact same pointer drag-onto-canvas + click-to-insert gesture used on `.stencil-card` so users working with a collapsed sidebar can both click and drag stencils directly onto the stage.

---

### 5. Add On-Canvas Double-Click Inline Text Editing (Nodes, Wires, Zones & Notes)
**Category:** Canvas Ergonomics · **Impact:** Very High · **Effort:** M  
**Files:** `src/studio/keyedStage.ts`, `src/styles/studio.css`

#### Current UX Problem
- `dblclick` is currently bound only on `.conduit-waypoint-handle` (`keyedStage.ts:528` to reset a bend). Double-clicking a node title, wire, swimlane header, or notes item does nothing.
- Renaming 10 services and labeling 12 wires forces 22 context switches between the canvas and the right-hand Property Inspector—and is completely blocked when the right inspector rail is collapsed (`]`).

#### How to Improve
1. **Nodes:** Double-clicking `.arch-node` (or pressing `Enter` / `F2` when a single node is selected in Design mode) mounts a lightweight inline `<input>` directly over `.node-title` (`Tab` advances to `.node-sub`, `Enter` commits, `Escape` reverts, wrapped in `beginHistoryGesture()` / `endHistoryGesture()`).
2. **Wires:** Double-clicking `.conduit-hit` or `.conduit-badge-hit` mounts a centered pill `<input>` at `edge.badgePos` (or the path midpoint when unlabeled) to type/edit `edge.label` in place. Also allow pressing `Enter` immediately after drawing a new wire to label it without moving the pointer.
3. **Zones & Notes:** Double-clicking `.zone-title`, `.zone-sub`, or any `.blueprint-spec` checklist row edits its text inline.

---

### 6. Add "Drop Wire on Empty Space to Create" & Draggable Wire Endpoints
**Category:** Canvas Ergonomics · **Impact:** Very High · **Effort:** M  
**Files:** `src/studio/interactions.ts:295–325`, `src/studio/keyedStage.ts:484–545`

#### Current UX Problem
- In `beginPortWireDrag()` (`interactions.ts:295–325`), releasing a dragged wire over blank canvas (whether intentionally building the next downstream hop or missing a port by a few pixels) discards the draft wire silently.
- Once an edge is created, only its midpoint waypoint circle is draggable. Moving a wire’s source or destination to another component requires deleting the wire and redrawing it—destroying its label, tone, routing mode, custom waypoint, and review comment.

#### How to Improve
1. **Drop-to-Create Quick Picker:** When `beginPortWireDrag` releases on empty canvas after moving ≥ 32 px, keep `#draft-wire` visible at `(wx, wy)` and open a compact radial/list popover at the cursor with the 7 stencils (keyboard-filterable: `1–7` or typing `s` for Service, `d` for Data Store, `e` for Event Broker, `Esc` to cancel). Choosing a stencil creates the node centered at `(wx, wy)` and connects the wire in one undo step.
2. **Reconnectable Wire Endpoints:** When `app.selection.type === 'edge'` in Design mode, render draggable endpoint handles at `edge.startPoint` and `edge.endPoint`. Dragging either handle snaps to any valid port or node and updates `edge.from`/`edge.sourcePort` or `edge.to`/`edge.targetPort` while preserving all wire metadata.

---

### 7. Stabilize Viewport Framing & Modernize Trackpad / Pan Ergonomics
**Category:** Navigation · **Impact:** High · **Effort:** S  
**Files:** `src/studio/interactions.ts:1173, 2098, 2268–2292`, `src/studio/palette.ts:62–188`

#### Current UX Problem
- **Unexpected zoom/pan resets:** `window.addEventListener('resize', fitToViewport)` (`interactions.ts:2292`) and switching `Design` ↔ `Data View` (`interactions.ts:1173`) both invoke `fitToViewport()`. If a user zooms to 140% on a microservice cluster and then opens DevTools, resizes their browser split, or switches to Data View to inspect that cluster's telemetry, their camera framing is wiped out back to whole-diagram zoom.
- **Trackpad wheel spikes & missing pan gestures:** The `wheel` handler (`interactions.ts:2268`) multiplies `app.scale` by a fixed `1.08` or `0.92` per event regardless of `deltaY` magnitude. On MacBook and Windows precision trackpads (which fire 60+ wheel events/sec), a brief two-finger brush rockets zoom to min/max, and two-finger trackpad panning is unsupported. Middle-mouse drag (`e.button === 1`) and `Space + Left-drag` (needed to pan while `Connect` tool is active) are also missing.
- **Off-screen `⌘K` stencil placement:** All 8 `Add * Stencil` and `Add Notes` commands in `palette.ts:62–188` hardcode `(200, 200)` instead of `getViewportWorldCenter()`, placing new components off-screen when panned and stacking repeated additions directly on top of one another.

#### How to Improve
1. Track a `userAdjustedCamera` boolean (set on wheel/pan/zoom/fitSelection, cleared on `fitToViewport` and new document loads). On `resize` and mode switches, if `userAdjustedCamera` is true, preserve `app.scale` and shift `(panX, panY)` by half the viewport size delta so the world point at screen center stays anchored.
2. Distinguish pinch-zoom (`e.ctrlKey || e.metaKey`) and mouse-wheel steps (`e.deltaMode === 1 || (Math.abs(e.deltaY) >= 40 && e.deltaX === 0)`) from smooth two-finger trackpad pans (`panX -= e.deltaX; panY -= e.deltaY`), scaling zoom smoothly via `Math.exp(-e.deltaY * 0.0025)`. Add a **Trackpad Mode** preference in `#settings-dialog`, plus **Middle-click drag** and **`Space + drag`** panning in all modes.
3. Refactor `palette.ts` `add-*` commands to call a shared helper using `getViewportWorldCenter()` + cascade offset, switching to `Design` mode automatically if invoked from `Data View`.

---

### 8. Polish Groups, Multi-Select, Alignment & Shortcut Ergonomics
**Category:** Authoring Depth · **Impact:** High · **Effort:** M  
**Files:** `src/studio/keyedStage.ts:106, 714`, `src/studio/zOrderLockGroup.ts`, `src/studio/inspector.ts:969–1031`, `src/studio/interactions.ts:740–784, 2160–2170, 2409–2452`, `src/templates/presets.ts:192`

#### Current UX Problem
- **Undiscoverable group editing:** Grouping components (`⌘G`) sets `groupId`, but draws **no visual group indicator** on the canvas. Clicking any grouped node selects the entire group (`MULTI-SELECT`), hiding Title, Subtitle, Metrics, Status, and Payload fields. Selecting a single member requires `Alt+Click` (`keyedStage.ts:714`), which is **undocumented** in `?` Shortcuts, `docs/guide.md`, and the UI.
- **Malformed align button labels & missing batch controls:** In `inspector.ts:971–990`, multi-select align buttons render literal lowercase words prepended to their labels (`"left Align Left"`, `"center Align Center X"`, `"top Align Top"`, `"middle Align Middle Y"`), and **Align Right** & **Align Bottom** are missing. Multi-select only supports batch Accent Color—not Status, Shape, or Kind.
- **Incomplete marquee & clipboard:** `Shift+drag` marquee (`interactions.ts:2160`) ignores Swimlane Zones and Notes Cards and overwrites any existing selection instead of adding/toggling. `⌘C`/`⌘V` (`copySelection`/`pasteSelection`) also ignores Zones and Notes Cards and stores items only in memory, preventing cross-tab copy/paste.
- **`[` / `]` shortcut collision & false undo snapshots:** `[` and `]` toggle the sidebars when nothing is selected, but trigger `sendToBack` / `bringToFront` when anything is selected (`interactions.ts:2432`)—despite the topbar tooltip advertising `Toggle inspector (])` unconditionally (and `[` / `]` do nothing at all in Data View!). Additionally, `interactions.ts:2409–2452` calls `pushHistory()` *before* checking whether `bringToFront`/`bringForward` actually changed anything (`bringForward`/`sendBackward` always return `false` for `multi`), pushing duplicate snapshots and firing false toasts.
- **Decoupled swimlanes:** Dragging a `.zone-banner` (`keyedStage.ts:106`) leaves all nodes inside that column behind, and `node.zoneLabel` defaults to `'ARCHITECTURE STAGE'` (`presets.ts:192`) instead of syncing with the Swimlane Stage containing the node (and when `zoneLabel` is `""`, `inspector.ts:1491` renders a dangling dot: `"PLATFORM · "`).

#### How to Improve
1. Render a subtle dashed group frame on hover/selection with a pill badge (`Group · Alt+click or double-click to edit item`) and document `Alt+click` in `commands.ts`.
2. Add a **right-click context menu** on nodes, wires, multi-selections, and blank canvas (Edit Label, Duplicate, Tone, Status, Lock, Group/Ungroup, Z-Order, Auto-Layout Selection, Delete) plus a compact floating toolbar above multi-selections.
3. Replace `'left '` / `'center '` prefixes in `inspector.ts` with 14 px alignment SVGs, add **Align Right** & **Align Bottom**, and add batch **Status** and **Node Shape** controls.
4. Include Zones and Notes Cards in marquee hit-testing (unioning when `Shift` is held) and in `⌘C`/`⌘V` (mirroring serialized JSON to `navigator.clipboard` with in-memory fallback).
5. Use dedicated sidebar shortcuts (`⌘\` for Palette, `⌘/` or `Alt+]` for Inspector) in both Design and Data View; check the boolean return of z-order helpers before calling `pushHistory()`; move enclosed nodes when dragging a Swimlane Stage (`Alt+drag` to move banner only); and auto-derive `zoneLabel` from enclosing Swimlanes (omitting ` · ` when empty).

---

### 9. Upgrade Mermaid & Blueprint Code Sync from a Modal to a Live Split Drawer
**Category:** Core Differentiator · **Impact:** High · **Effort:** M–L  
**Files:** `index.html:536–581`, `src/studio/interactions.ts:1744–1781`

#### Current UX Problem
- **Data loss on format toggle:** Inside `#code-dialog`, toggling the radio between `Mermaid (.mmd)` and `Blueprint (.md)` (`interactions.ts:1762`) runs `refreshCodeModalTextarea()`, overwriting `codeSyncTextarea.value` from `app.doc` and **wiping out any unapplied code edits** the user just typed or pasted.
- **Blind modal edit loop:** `#code-dialog` covers the canvas with a modal backdrop, validates only when clicking `Apply to Canvas` (which immediately closes the dialog on success), truncates diagnostics to 3 items in a single `<p>`, and provides **no line numbers** despite diagnostics citing `[Line 14]`.

#### How to Improve
1. Replace or supplement `#code-dialog` with a **dockable, resizable Code Sync split-pane** (`⌘E` or toolbar `</> Code` toggle) beside the canvas, with a **Live Sync (400 ms debounce)** toggle and `⌘Enter` to apply without closing.
2. Add a synchronized line-number gutter alongside the editor that highlights error/warning lines and renders clickable diagnostic pills that jump focus to `issue.line`.
3. Track `isCodeDirty`: if the user switches between `Mermaid (.mmd)` and `Blueprint (.md)` with unapplied edits, parse the edited buffer into a temporary `DiagramDocument` first and serialize that into the target format (or prompt before discarding if invalid).

---

### 10. Clean Up Toolbar Hierarchy, Coach-Mark Coupling, `Escape` Behavior & Tooltips
**Category:** Clarity & Polish · **Impact:** High · **Effort:** S  
**Files:** `index.html:163–240, 385–388`, `src/studio/interactions.ts:1831, 1986, 2015–2028, 2046, 2457`, `src/studio/inspector.ts:1255, 1344`, `src/styles/studio.css:3449`

#### Current UX Problem
- **Dismissing the coach hint permanently hides all HUD status messages:** `#hud-status-tip` is nested inside `#hud-coach-card` (`index.html:385–388`). Clicking `×` once sets `conduitcraft-coach-dismissed = '1'` and hides `#hud-coach-card` forever—silencing Connect-mode guidance, Data View hints, and GIF/PNG rendering messages (`"Rendering a short animation…"`).
- **Redundant `File` menu entries:** `File` contains both `Open File… (⌘O)` and `Import File… (.mmd / .json)` (which perform the same import), plus `Export Dialog…` directly adjacent to the top-level `Export` button.
- **Incomplete `Escape` & missing tool hotkeys:** `commands.ts:37` and `docs/guide.md:27` promise `Escape` clears Connect mode and selection, yet `interactions.ts:2457` only clears `app.connectSourceNodeId = null`—it **never switches `pointerTool` back from `'connect'` to `'select'`**, nor does `Escape` abort an active `beginPortWireDrag` wire drag. Single-key tool switches (`V` for Select, `C` for Connect) are also absent.
- **Additional UI paper cuts:**
  - Opening Export from `⌘K` (`interactions.ts:1986`) skips `updateShareLinkPreview()`, leaving `#share-link-input` stuck on `"Generating shareable link…"`.
  - `snapshotsDialog` is omitted from `allDialogs` (`interactions.ts:2046`), missing smooth-close animation and `closedBy` outside-click handling.
  - Changing `Auto-Layout Flow Direction` in Document Properties (`inspector.ts:1255`) immediately runs `autoLayoutDocument()` and scrambles manual positions without an Undo toast, and Brand Logo (`inspector.ts:1344`) still uses an unstyled native `<input type="file">` instead of the `.custom-icon-upload-zone` component.
  - CSS `::after` `[data-tip]` tooltips **do not render on SVG `<g>` elements**, so hovering edge review-comment badges (`<g class="conduit-comment-badge" data-tip="...">` in `keyedStage.ts:480`) shows nothing at all; and tooltips on rightmost topbar icons (`#btn-toggle-inspector`) clip past `100vw`.

#### How to Improve
1. Extract `#hud-coach-card` as a standalone first-run banner and route operational status/progress (such as multi-frame GIF encoding) through `notify()` toasts with progress updates.
2. Merge `Open File…` and `Import File…` into a single `Open / Import… (⌘O)` command and remove the duplicate `Export Dialog…` item from `File` (or keep it only at mobile breakpoints where `Export` collapses).
3. Update `Escape` to cancel active wire drags, reset `pointerTool` to `'select'` (updating the radio input), and clear selection; add `V` (Select) and `C` (Connect) shortcuts; add `snapshotsDialog` to `allDialogs`; call `void updateShareLinkPreview()` in a shared `openExportModal()` helper; reuse `.custom-icon-upload-zone` for Brand Logo; and replace `[data-tip]::after` with a tiny JS viewport-clamped tooltip layer so SVG `<g>` badges and right-edge buttons render tooltips reliably.

---

### 11. Elevate Live Telemetry & Packet Simulations Across Modes
**Category:** Core Differentiator · **Impact:** High · **Effort:** M  
**Files:** `index.html:122–153, 479–520`, `src/studio/interactions.ts:536, 2081`, `src/studio/simulationPlayback.ts:291–358`, `src/studio/inspector.ts:1486–1503, 1609–1975`

#### Current UX Problem
- **Hidden playback deck & two competing "Pause" controls:** Scenario buttons (`#sim-buttons-slot`) appear in the topbar in **both** Design Mode and Data View right beside `#btn-toggle-motion` (`Pause`). Clicking a scenario button while in Design Mode (or with the inspector collapsed) starts the simulation on the canvas while keeping `#sim-playback-deck` and `#trace-list` **completely hidden**. Clicking the adjacent topbar `Pause` button only toggles `.motion-paused` CSS dashes—it **does not pause the active simulation timer**.
- **Teleporting packet & unlit wires in custom scenarios:** `simulationPlayback.ts:295` only highlights an edge when `step.nodes.length >= 2 && step.nodes.includes(edge.from) && step.nodes.includes(edge.to)`. Yet **Add scenario** and **Add hop** (`inspector.ts:1618, 1966`) initialize hops with a **single** node (`nodes: [node.id]`), so custom scenarios highlight **zero wires** by default. Moreover, `#sim-packet` jumps between static `(cx, cy - 62)` coordinates rather than traveling along the routed SVG wire path.
- **High-friction hop authoring & keyboard trace gap:** Authoring a 6-hop scenario on a 15-node architecture requires toggling 90 flat node chips (`15 × 6`) inside narrow sidebar cards. Also, `.trace-item` elements set `role="button" tabindex="0"` (`simulationPlayback.ts:354`) with a `click` listener but no `keydown` (`Enter`/`Space`) listener.
- **Missing `Async` (`amber`) filter & hidden review metadata in Data View:** `#stream-filter-group` (`index.html:122–149`) lists `Primary`, `Success`, `Exception`, and `Control`, omitting **`Async` (`amber`)** even though `Event Broker` stencils default to `amber`. Furthermore, `syncDataViewInspector()` (`inspector.ts:1486`) never displays `node.status` (`Live`, `Planned`, `At Risk`, `Deprecated`) or `node.comment` (nor edge comments when clicking a wire in Data View), and Data View has no Status filter.

#### How to Improve
1. Mount a compact **floating Simulation Pill** at the top-center of `.canvas-shell` whenever a simulation is loaded (Play/Pause, Prev/Next Hop, Scrubber, Speed, Loop, `× End`) so controls are always accessible in Design Mode, Data View, and Presentation Mode. Rename/re-icon `#btn-toggle-motion` to *"Ambient Pulse"* (or move it to Settings / HUD) so it never collides with simulation Play/Pause.
2. When advancing from `step[i - 1]` to `step[i]`, automatically highlight connecting wires `(u → v)` between `step[i - 1].nodes` and `step[i].nodes` (even when each hop lists 1 node), and animate `#sim-packet` smoothly along the SVG `<path>` via `getTotalLength()` / `getPointAtLength()`.
3. Add a **"Record Hops on Canvas"** mode in the Scenarios tab: clicking nodes or wires on the stage appends hops sequentially with pre-filled labels and trace templates. Add `Enter`/`Space` handling on `#trace-list`.
4. Add the **Async (`amber`)** radio pill to `#stream-filter-group`, add a **Status filter/legend** in Data View, render `status` + `comment` cards in `#panel-inspector` (plus JSON syntax validation / "Format JSON" on `node.code` in Design mode), and inspect wire metadata when clicking a wire in Data View.

---

### 12. Upgrade Snapshots/Diff, Presentation Mode, Narrow-Viewport Drawers & Export Fidelity
**Category:** Sharing & Polish · **Impact:** Medium–High · **Effort:** M–L  
**Files:** `src/studio/snapshots.ts`, `src/styles/studio.css:445–480, 4321–4325`, `src/studio/presentation.ts`, `src/exporter/standaloneHtml.ts:838`, `src/studio/stagePicture.ts`, `public/sw.js`

#### Current UX Problem
- **Snapshots & Diff (`snapshots.ts`):**
  - Snapshots live in one global `localStorage` key (`conduitcraft-snapshots-v1`) across **all** diagrams—opening Template B diffs it against Diagram A's latest snapshot—and ~5 MB `localStorage` overflows rapidly when custom base64 icons are present.
  - Wire diffs display internal IDs (`Wire: service-2-x9k ➔ store-4-a1b` at `snapshots.ts:397`) instead of node titles, inject unescaped HTML (`${s.name}`, `${node?.title}`), and lack an **on-canvas visual diff overlay**.
- **Presentation Mode (`studio.css:4321–4325`, `presentation.ts`, `standaloneHtml.ts:838`):**
  - `studio.css:4321` targets `.hud-actions` and `.minimap-panel`, which do not match `index.html`’s `.hud-minimap-card`, `.hud-coach-card`, and Zoom `.hud-card`—leaving bottom HUD cards visible behind `.presentation-caption`.
  - Tours step through `doc.nodes` in raw insertion order rather than topological flow order (`LR`/`TD`), lack scenario play controls in `#presentation-bar`, and in exported HTML (`standaloneHtml.ts:838`), empty summaries render `"Active component in system architecture transmitting undefined telemetry."` (`n.tone` instead of `n.accent`).
- **Narrow viewports `< 66rem` (`1056px`, `studio.css:445–480`):**
  - Below `1056px` (tablets, half-screen laptop windows, phones), both sidebars become `position: absolute` overlays (`264px + 344px = 608px`) that start **open simultaneously** with no backdrop scrim—obscuring almost the entire canvas—and collapsing a sidebar at `< 66rem` removes `position: absolute`, pushing `.canvas-shell` into a broken implicit grid row.
- **Export & PWA polish (`stagePicture.ts`, `diagramSvg.ts`, `public/sw.js`):**
  - PNG/SVG/GIF exports clone `#stage-world` with active `.is-selected` rings, `.conduit-waypoint-handle`, and `.is-dimmed` classes still applied if anything is selected.
  - `.svg` export wraps HTML+CSS inside `<foreignObject>`, which Figma, Illustrator, Inkscape, and GitHub `<img>` tags reject or render blank, whereas `diagramSvg.ts` already has a pure-vector renderer.
  - `public/sw.js` only precaches `./index.html` (not Vite's hashed `/assets/*` bundles) on first install and never shows an "Update available — Reload" toast when a new version activates.

#### How to Improve
1. **Snapshots & Visual Diff:** Move snapshots to **IndexedDB** scoped by a `documentId` field on `DiagramDocument`, resolve edge endpoint IDs to node titles (escaping all HTML interpolations), and add a **"Show Diff on Canvas"** toggle that highlights added (emerald), modified (amber), and ghosted-removed (rose dashed) nodes/wires directly on the stage.
2. **Presentation Mode:** Hide `.canvas-hud` cleanly under `body[data-presenting="true"]`, sort tour steps topologically (with optional custom step ordering in Data View), add scenario trigger pills to `#presentation-bar`, and fix `n.tone` → `n.accent` in `standaloneHtml.ts:838`.
3. **Responsive Drawers (`< 66rem`):** Auto-collapse both sidebars when booting below `66rem`, keep collapsed rails/drawers out of vertical grid flow, add a click-outside scrim, and ensure opening one drawer on narrow screens closes the other.
4. **Exports & Offline PWA:** Strip `.is-selected`, `.is-dimmed`, `.node-drag-handle`, `.node-port`, and `.conduit-waypoint-handle` inside `renderStagePictureSvg()` clones; offer both **Rich Stage SVG** and **Portable Vector SVG (Figma / GitHub)**; and inject built `/assets/*` manifest URLs into `sw.js` at build time in `vite.config.ts`.

---

## Suggested Implementation Phasing

1. **Phase 1 — Bug & Data-Trust Sweep (1–2 days | Items 1, 2, 3, 4, 10):**  
   Fix `.arch-node` IDs (`⌘F` + motion), format-aware `⌘S` + `resetActiveFile()`, low-zoom port interactivity, dynamic collapsed palette rail, decoupled HUD status/toasts, `Escape` in Connect mode, and `standaloneHtml.ts` `n.accent`.
2. **Phase 2 — Direct Canvas Authoring (3–4 days | Items 5, 6, 7, 8):**  
   Ship double-click inline editing on nodes/wires/zones, drop-wire-on-canvas quick-create + draggable wire endpoints, camera-preserving resize/mode switches, trackpad pan/pinch + `Space+drag`, right-click context menu, alignment SVG icons, and visual group bounds.
3. **Phase 3 — Differentiator Workflows & Review Polish (4–5 days | Items 9, 11, 12):**  
   Convert `#code-dialog` into a live split drawer with line numbers, add the floating simulation playback bar + SVG path packet motion + on-canvas hop recording + `Async`/Status filters, and upgrade snapshots to per-document IndexedDB with an on-canvas visual diff overlay.
