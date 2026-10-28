# ConduitCraft — UX Review & Improvement Plan

**Repository:** [JosephSe/ConduitCraft](https://github.com/JosephSe/ConduitCraft) (`v1.0.0`, MIT)
**Review date:** 28 October 2026
**Scope:** user experience of the studio app (`index.html` + `src/studio/*`, `src/styles/*`) and of the exported artefacts.
**Prior art noted:** [`IMPROVEMENTS.md`](https://github.com/JosephSe/ConduitCraft/blob/main/IMPROVEMENTS.md) (20/20 done) and [`ROADMAP.md`](https://github.com/JosephSe/ConduitCraft/blob/main/ROADMAP.md) (20/20 done). **Nothing below repeats those lists.** Everything here was found by running the built app, not by reading the docs.

---

## 1. How this review was done

I did not stop at reading the source. The recommendations are anchored in measurements from the shipped build:

| What I ran | Result |
| --- | --- |
| `pnpm install && tsc --noEmit && vite build` | Clean. 52 modules, 483 kB JS (130 kB gzip), 92 kB CSS (16 kB gzip) |
| `npm test` | **142 tests / 33 suites pass** — all pure-logic, zero browser tests |
| Headless Chromium (Playwright) driving the real UI | 40+ scripted journeys: onboarding, reload, import, export, simulation, presentation, mobile, dark mode |
| `axe-core` audit (light + dark, empty state + 70-node showcase) | 4 violation classes, 13 failing nodes |
| Layout probing at 10 viewport widths | Canvas share of the screen collapses at specific breakpoints (see §5.1) |
| Real exports captured and opened in isolation | `.json`, `.html`, `.svg`, `.png`, `.mmd` measured and rendered |

**What is genuinely strong, and why it matters for what follows:** the autosave/history plumbing, undo grouping per gesture, 9 wire routing modes, keyed incremental rendering (no long tasks observed: 0 long tasks while zooming a 70-node diagram; pan/drag handlers measured at ≤1.2 ms), the command palette (77 commands, instant fuzzy filter), presentation mode, the simulation playback deck, snapshot/diff, PWA, and a11y work already in place (visible 2 px focus rings on every button, 6 live regions, focusable wires). This is a mature app. **The remaining problems are not missing features — they are trust, state-feedback, and a handful of outright bugs that make it feel unreliable.**

---

## 2. Findings at a glance

Ordered by *user harm × frequency ÷ effort*. S = under half a day, M = 1–2 days, L = 3–5 days.

| # | Finding | Category | Severity | Effort |
| --- | --- | --- | --- | --- |
| 1 | Session restore silently overwrites your saved work, and the restore button keeps offering a doc it has already replaced | **Data loss** | Critical | S |
| 2 | No "saved / unsaved" state anywhere; failed autosave is swallowed; one fragile localStorage slot | **Trust** | High | S |
| 3 | `New Blueprint…` throws away an unsaved canvas with no confirmation | **Data loss** | High | S |
| 4 | `[hidden]` loses to class-level `display` rules → dismissed coach mark returns, phantom buttons render | **Bug** | High | S |
| 5 | Share link can say "Generating shareable link…" forever, and "Copy Link" then copies the placeholder | **Bug** | High | S |
| 6 | Data View inspector shows the wrong selection (often none) after switching modes | **Bug** | High | S |
| 7 | SVG export is the live DOM in a `foreignObject` + 104 kB of studio CSS → breaks in most renderers | **Export quality** | High | M |
| 8 | Canvas is unreachable by keyboard: nodes have no tab stop or role; 100 focusable port buttons per diagram | **Accessibility** | High | M |
| 9 | Mobile/tablet: both side panels open by default, no scrim, tapping a stencil doesn't close the drawer | **Responsive** | High | M |
| 10 | Between 1008–1056 px the canvas collapses to 232 px (22% of screen) with both panels open | **Responsive** | Medium | M |
| 11 | Import/editor gives no live validation; diagnostics appear only *after* Apply, with no line numbers | **Feedback** | Medium | M |
| 12 | Tooltips clip on the first palette row and at panel edges (~half of all tooltips) | **Polish** | Medium | S |
| 13 | Two controls labelled "Pause" with opposite meanings; "Search" means two different things | **Clarity** | Medium | S |
| 14 | Toast stack overlaps the coach mark and the node-search field | **Polish** | Medium | S |
| 15 | Windows/Linux users see `⌘` everywhere (10 hardcoded spots) even though `isMac()` exists | **Polish** | Medium | S |
| 16 | axe: unlabeled file input (critical), label-in-name mismatches (serious), `role="listitem"` on buttons (minor) | **Accessibility** | Medium | S |
| 17 | Dark mode contrast failures: brand name 3.41:1, toast action button 2.54:1 | **Accessibility** | Medium | S |
| 18 | Undo history = 60 `structuredClone`d full documents in memory | **Performance** | Medium | M |
| 19 | PNG export is a fixed 4096 px / 5.1 MB file; SVG/PNG have no "current view only" option | **Export quality** | Medium | S |
| 20 | Onboarding: 13 visible panels/controls on first paint; no tour, no next-step guidance | **Onboarding** | Medium | M |
| 21 | `npm test` fails on Node 20/21 (`--experimental-strip-types`); no `engines` field | **Onboarding (dev)** | Low | S |
| 22 | Zero UI/e2e tests — the class of bug in #4 and #6 cannot be caught by the current suite | **Robustness** | Medium | M |

---

## 3. Data safety and trust (findings 1–3)

> These three cost you users. Everything else in this document is secondary to them.

### 1. Session restore silently overwrites the saved session — **Critical**

The app autosaves to `conduitcraft-autosave-v1` on every change (debounced 320 ms, `src/studio/state.ts:100-118`). On reload it deliberately does **not** restore; it shows a blank canvas plus a `↺ Restore Previous Session (14 nodes)` button inside the empty-state card.

**Reproduced exactly as follows** (`/tmp/dataloss.py`):

1. Build a diagram (`Load showcase` → 14 nodes). Autosave now holds 14 nodes.
2. Reload. Canvas is empty; the app still holds 14 nodes in storage.
3. *The user does not notice the button* (it sits 5th in a stack of six buttons) and clicks a stencil in the palette instead — the very first thing the empty state tells them to do ("Click to add or drag directly onto the canvas", left panel).
4. 320 ms later the autosave key now contains **1 node**. The 14-node session is gone.
5. The `Restore Previous Session (14 nodes)` button is *still on screen* — the count is stale — and clicking it restores the good document. But if the user instead closes the tab, presses `Ctrl+Z` (which only undoes the stencil add), or starts working, the session is unrecoverable. There is no second slot, no IndexedDB copy, no snapshot with the pre-restore state.

**Fix (small, high impact):**

```ts
// src/studio/interactions.ts — at boot, keep the candidate in memory
const pendingRestore = app.doc.nodes.length === 0 ? loadSavedSessionDoc() : null;

// src/studio/state.ts — never overwrite a saved session that the user has
// not explicitly accepted or replaced
export function flushAutosave(): void {
  const isEmpty = !app.doc.nodes.length && !app.doc.zones.length && !app.doc.notesCards.length;
  if (isEmpty) return;
  const previous = safeParse(localStorage.getItem(AUTOSAVE_KEY));
  if (pendingRestore && app.doc.nodes.length < previous.nodes.length) {
    // write to the *recovery* slot instead of destroying the bigger document
    localStorage.setItem(RECOVERY_KEY, JSON.stringify(app.doc));
    return;
  }
  localStorage.setItem(AUTOSAVE_KEY, JSON.stringify(app.doc));
}
```

Plus: (a) show the restore offer as a **banner above the canvas** (`Your 14-component diagram was restored from this browser → [Open] [Discard]`), not as one of six buttons; (b) keep "Discard" explicit so choosing a template is a decision, not an accident; (c) when there is a saved session, offer *that* as the primary empty-state action and demote "Browse Templates" to secondary.

### 2. There is no saved/unsaved state anywhere — **High**

Verified: after editing the title, `document.title` is unchanged, no "Saved" text exists in the DOM (`/\\bsaved\\b/i` → false), and the only persistence feedback is a toast that fires on explicit *file* save. Meanwhile `flushAutosave` swallows all failures:

```ts
} catch {
  // Ignore storage quota or private mode restrictions
}
```

So in Safari private mode, or once the origin hits ~5 MB (a showcase with embedded icon/logo data URLs is 14 kB today, but custom PNG icons are unbounded), **the user loses everything with zero indication.** I confirmed the failure mode is silent by filling localStorage and continuing to edit: no toast, no error, autosave key frozen at the old document.

**Fix (S):**

- A three-state indicator in the top bar next to the title: `Saving… → Saved just now → Not saved (storage full)` — click it to open Save As. Reserve `aria-live="polite"` for the transition only.
- On quota failure: toast with an error tone and a **Save to file** action, and stop claiming to autosave.
- Mirror the autosave into IndexedDB (quota measured in hundreds of MB) and keep localStorage as a fast-read cache. Snapshots (`src/studio/snapshots.ts`) currently live in the *same* five-megabyte-quota localStorage and will be the first thing to break in real use.
- Set `document.title = '• ' + doc.title + ' — ConduitCraft'` when dirty; it is what makes a browser tab trustworthy.

### 3. "New Blueprint…" discards work without asking — **High**

`btnNewCanvas` opens the template gallery (`src/studio/interactions.ts:1553`); picking a template or "Create Blank Canvas" replaces `app.doc`. I confirmed there is **no** "you have unsaved changes" prompt anywhere in the flow. Whether the document is dirtier or cleaner than the autosave slot, `pushHistory` is *not* called on the blank-canvas path, so Undo does not bring it back either.

Either route New through the same confirm-then-replace flow as restore (§1), or make it an explicit multi-document model: "New" creates a second tab/slot in the gallery list instead of destroying the current one. For a draw.io-class tool users expect several open documents.

---

## 4. Bugs that read as sloppiness (findings 4–7)

### 4. `[hidden]` is defeated by class rules — **High, one-line fix**

The app toggles visibility with the `hidden` attribute in dozens of places, but component classes set `display`, which wins over the UA's `[hidden] { display: none }` because `@layer reset` is declared first and component rules come later. Confirmed in the live DOM:

| Element | Should be hidden when | Actual computed |
| --- | --- | --- |
| `#hud-coach-card` (the dismissible hint) | After `Dismiss hint` (`interactions.ts:1926`) | `display:flex`, 588×33 px, still on screen; `conduitcraft-coach-dismissed=1` is written to storage but never has any effect — **the hint can never be dismissed, forever, for every returning user** |
| `#btn-clear-search` | Always, until a search is typed | `display:flex`, 14×18 px "×" rendered next to the search field at all times |
| `#btn-restore-session` | Always, until `loadSavedSessionDoc()` returns a doc | `display:flex` — a phantom Restore button on a truly first visit |
| `#btn-install-app` | When not installable | `display:flex` in the File menu |

**Fix (S):** `@layer reset { [hidden] { display: none !important; } }` — or, cleaner, stop using `hidden` and drive these with a `.is-hidden` utility plus `hidden` for semantics. Add a test that asserts `getComputedStyle(el).display === 'none'` for every `[hidden]` element; it would have caught all four.

### 5. The share link can hang on "Generating shareable link…" — **High**

`createShareUrl` → `compressStringToBase64Url` (`src/studio/shareLink.ts:33`) writes the whole payload into a `CompressionStream('deflate')` writer and *then* reads from the other end. In the headless Chromium I tested, `writer.write()` never resolves when nothing is draining the readable side, so the promise hangs indefinitely. In `interactions.ts:1693` the input is set to `'Generating shareable link…'` and only replaced on resolve.

Two user-visible consequences, both verified:

- The field can sit on "Generating shareable link…" forever (no timeout, no error path).
- **`Copy Link` copies the placeholder string.** The guard is only `if (!value || value.startsWith('Add components'))`, so it happily writes `"Generating shareable link…"` to the clipboard and toasts **"Copied shareable diagram link"**. That is the worst possible outcome: the user believes they copied a URL.
- Also note the copy says "Anyone with the link opens this diagram directly", but the URL is never written to `location.hash` on click — the user must copy it manually, which is a reasonable choice but should be stated as "Copy this link" rather than implying the address bar already has it.

**Fix (S–M):** drive the stream correctly (write and read concurrently, or `new Response(blob.stream().pipeThrough(cs)).arrayBuffer()`), add a 3 s timeout with a visible fallback ("Compression unavailable — export a file instead"), disable `Copy Link` until a URL exists, and assert `value.startsWith(location.origin)` before copying. Add a unit test with a fake hung stream.

### 6. Data View inspector shows a stale or unrelated selection — **High**

Sequence: load showcase → click a node (inspector shows *Night Desk*) → switch to **Data View** → the inspector's Overview panel shows **"Untitled Architecture"**, a hardcoded placeholder, because `#insp-title` (`index.html:505`) is written by Design-mode code only — nothing in the codebase ever updates it (`grep insp-title src/studio/*.ts` → only the DOM binding at `dom.ts:163`). Switching back to Design and editing the title then shows *"Resident — Night caller"* in the same slot.

Meanwhile the canvas keeps a selection ring on the previously selected node, so the panel and the canvas disagree. Node search has the same symptom: typing `Permit` reports "1 of 2", Enter moves the camera, but the inspector keeps describing the old node.

**Fix (S):** one `renderInspector()` keyed off `app.selection` + `app.workspaceMode`, called from the same `onSelectionChange` subscription that already exists in `src/main.ts`. Delete the hardcoded title. Add a test asserting that after `setSelection({type:'node', id})` the inspector's title equals that node's title in **both** modes.

### 7. SVG export cannot be opened by most tools — **High**

`Export → Vector Picture (.svg)` calls `renderStagePictureSvg()` (`src/studio/stagePicture.ts:89`), which clones `#stage-world` and wraps it in `<foreignObject width="2920" height="1172">` with the **entire studio stylesheet inlined**. Measured on the showcase:

- 152 kB file, of which **104 kB is CSS** with 12 `@layer` blocks and **692 `var(--wl-*)` references**, plus 47 studio classes.
- Rendered via `<img src>` (what GitHub, Notion, Confluence, Figma import, VS Code preview and most CMSs do) the node cards and text **vanish** — only the SVG `<text>` route pills and the foreignObject-rendered HTML survive in a direct browser view; inside an `<img>` nothing but a fragment of the top-left corner paints because the foreignObject has no intrinsic layout constraints.

Ironically, `src/exporter/diagramSvg.ts` is a **true SVG renderer** (real `<rect>/<polygon>/<text>`, tone hexes, `sanitizeIconImage`) and it is not used by the export button. In fact nothing in `src/studio/*` imports it.

**Fix (M):** point `btnExportSvg` at `diagramSvg.ts` (the CLI/test path already covers it — `tests/exportShared.test.ts`), keep the DOM-clone rasteriser only for PNG/GIF where it is genuinely needed, and add a "Copy as SVG" for embedding. Expected result: ~15–30 kB, editable in Figma/Illustrator, renders in any `<img>`. Then validate by asserting the file contains no `foreignObject` and no `var(--wl-` in a test.

---

## 5. Layout, responsive behaviour, and clarity (findings 8–15)

### 8. The canvas is not reachable by keyboard — **High**

Tab order from a fresh load reaches 12 top-bar buttons, 11 palette cards, then panel controls. Pressing `Tab` **40 times never lands on a node.** Structural facts:

- Node cards (`[data-node-id]`) have no `tabindex` and no `role` — they are plain `div`s.
- Ports are `<button>`s with 56 of them per showcase diagram, so if a keyboard user *does* get into the stage they face ~100 tab stops with labels like *"Connect from Resident top port"* per diagram, and wires add more.
- `aria-label` on ports names the port but not the **node pair** the wire would connect.

**Fix (M):** roving tabindex. One tab stop for the canvas; arrow keys move between nodes in geometric order (left/right = spatial neighbours, which is far better than document order); `Enter` selects, `F2`/`Enter` on selected node moves focus into the inspector's Title field; `Tab` from a selected node cycles its ports only while in Connect mode. Announce with the existing live region: *"Night Desk, service, 3 wires out — 4 of 70"*. This is the single highest-leverage a11y change because the canvas *is* the product.

### 9. Mobile and tablet: the app opens with both drawers covering the canvas — **High**

Measured at 390×844 (mobile, touch) and 820×1180 (tablet): `.palette-sidebar` is 264 px and `#inspector-panel` 344 px, **both open by default**, absolutely positioned over a 232 px canvas; the inspector starts at x=46, so the two overlap each other. There is **no scrim**, and after tapping a stencil the palette stays open, so every subsequent tap risks dropping another node you didn't ask for. Correlation: the CSS knows `pointer: coarse` and `prefers-reduced-motion` but never `max-width`-collapses the panels by default (only `.workspace[data-*-collapsed]` opt-in).

**Fix (M):** below `66rem`, default both panels to their collapsed rails (the rail UI already exists and is good); opening one closes the other; add a scrim that closes on tap; auto-close the palette after a stencil tap on touch (`(pointer: coarse)` + `matchMedia`) while keeping drag-to-canvas behaviour on desktop. The tablet experience goes from "unusable" to "usable" with default-state changes alone.

### 10. Canvas share collapses at a breakpoint — **Medium**

Canvas width as a share of the viewport, panels open, fresh load:

| Viewport | 1600 | 1440 | 1280 | 1100 | **1056** | 1024 | 900 | 390 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Canvas px | 976 | 816 | 704 | 524 | **232** | 232 | 232 | 232 |
| % of width | 61% | 57% | 55% | 48% | **22%** | 23% | 26% | 59% |

At 1056 the grid switches to `232px 448px 344px` (palette + canvas + inspector) while the panels remain statically laid out; from 1024 down they become overlays but *still start open*, so the canvas stays at 232 px because the overlays cover it. A 13" laptop at 1056–1100 px is the modal case here.

**Fix (M):** single breakpoint plan — wide: three columns; medium (< 72rem): canvas + auto-collapsed inspector rail; narrow (< 60rem): canvas only, drawers on demand. Persist rail state per width so a user who collapses panels on a laptop keeps that on reload.

### 11. Import validation is post-hoc, with no line numbers — **Medium**

The README and the code-dialog copy promise "line-numbered validation diagnostics". Actual behaviour, measured:

- Typing/editing the editor produces **no** parse feedback at all (`input` has no listener; the hint text never changes from *"Standard Mermaid (.mmd): live-generated from your visual canvas."*).
- The only diagnostics element is `#code-sync-diagnostics` (note: `dom.ts` binds `code-sync-diagnostics`, not the `editor-diagnostics` class name), and it is written **only when Apply is pressed**.
- Applying a deliberately broken Mermaid (`B --> Z[Ghost]`, dangling `C --x`, unsupported `classDef`) produced a toast *"Imported 4 nodes with warnings"* and **no visible warning detail** — the issues array built in `interactions.ts:874` is only surfaced when node count is zero (`formatIssue(0)`), so partial imports hide their warnings entirely.

**Fix (M):** debounce a validate-on-type pass (parser is already pure and fast), render per-line messages next to the caret using a real gutter (the textarea already uses a monospace font, `JetBrains Mono`, so a line-number gutter is straightforward), surface *all* warnings for a successful-but-lossy import in a scrollable "Import report" (what was approximated: `classDef` colours, unsupported shapes, unknown IDs), and make each issue clickable to jump the caret to that line. This is the difference between "Mermaid import works" and "Mermaid import can be trusted".

### 12–15. Small clarity and polish items — **Medium**

- **12. Tooltips clip.** `[data-tip]::after` is absolutely positioned inside ancestors with `overflow: auto/hidden` (`palette-scroll`, `workspace`). The first stencil card's tooltip (*"Actor — Human outline role"*) is **cut off ~60% off the left edge** of the panel; 20 of the ~100 tooltips set no `data-tip-pos`, so they use the default downward placement, which is wrong for anything in the bottom HUD or the right rail. Fix: a single `<div role="tooltip">` positioned with `position: fixed` + flip logic (or the Popover API), and delete the per-element `::after` rules.
- **13. Two "Pause" controls, opposite meanings.** `#btn-toggle-motion` is labelled *Pause* and pauses **animation**; `#btn-sim-play` toggles *Play/Pause* of the **simulation**. Both are in the top bar, adjacent on mobile. Rename the first *Freeze motion* (icon + `aria-pressed`), and only show the second in Data View. Similarly, the `Search` button opens **node search**, while `⌘K` is **commands** — call them *Find node* and *Commands*.
- **14. Toast stack collides with the HUD.** Measured: toast `(535,787,370×37)` overlaps both the coach card `(498,794,306×33)` and the search field `(844,798,222×29)`; the toast even covers the coach mark's dismiss button. Anchor toasts above the HUD (or bottom-right of the canvas) and give the HUD a reserved band.
- **15. Hardcoded `⌘` on Windows/Linux.** `commands.ts` exports `isMac()`/`getModifierKey()` and the palette uses them, but `index.html` hardcodes `⌘O`, `⌘S`, `⌘⇧S`, `⌘K`, `⌘F`, `⌘L`, `⌘G`, `⌘D`, `⌘Z`, `⌘⇧Z` in tooltips, aria-labels and menu items. Given the audience (Windows-dominant for enterprise architecture work) this is a constant small irritant. Fix: render shortcut strings from `SHORTCUTS` at boot instead of authoring them in HTML.

---

## 6. Accessibility detail (findings 16–18)

`axe-core` results (identical in light and dark for all but contrast):

| Rule | Impact | Nodes | Detail |
| --- | --- | --- | --- |
| `label` | **critical** | 1 | `#file-upload` — the hidden file input has no label (`index.html`, `class="visually-hidden"`); it is *also* in the tab order, so keyboard users hit an invisible, unlabelled control |
| `label-content-name-mismatch` | serious | 3 | `#btn-focus-doc-title` (visible "Untitled Architecture" vs `aria-label="Edit diagram title…"`), `#btn-open-palette` (icon-only), `#btn-enter-presentation` ("Present" vs "Presentation mode (P)") — Voice-control users cannot say what they see |
| `aria-allowed-role` | minor | 7 | `role="listitem"` on `<button>` stencil cards (`interactions.ts:231`) |
| `color-contrast` | serious | 2 | `#doc-brand-name` 3.41:1 (`#0f766e` on `#0c1220`, 11.5 px bold) and `.toast-action-btn` **2.54:1** (`#ffffff` on `#60a5fa`) — the Undo button inside a toast fails badly, and it is the safety net for destructive actions |

Additional manual findings:

- **18. Undo memory.** `MAX_HISTORY = 60` full `structuredClone`s (`state.ts:155`). A 14 kB document is fine; a document with a few embedded PNG icons (data URLs) reaches megabytes, so 60 copies can exceed 100 MB and force GC pauses mid-drag. Move to patch-based history (or store reverse-diffs), or cap total history *bytes* rather than entry count.
- Live regions: six `aria-live` islands including `#zoom-readout`. Zoom changes are announced on every keypress of `+`/`-`; consider `aria-live="off"` and only announce zoom on keyboard use, otherwise the region becomes noise.
- The palette card that shows "0 NODES · 0 WIRES" is styled like a button but is not one; it also duplicates the canvas stats pill. Either make it a real status region or fold it into the header count.

---

## 7. Exports — the product's differentiator (finding 19)

Captured from the 70-node showcase:

| Format | Size | Issues worth fixing |
| --- | --- | --- |
| `.blueprint.json` | 23 kB | Good. Consider a `$schema`/`version` field for forward compatibility |
| `.html` (interactive) | 112 kB | Solid; keep it as the default "send this to someone" option |
| `.svg` | 152 kB | See §7 — unusable in most renderers |
| `.png` | **5.1 MB, fixed 4096×1644** | No scale control, no transparent-background option, no "current view" option; 2× of an already wide stage is more than most docs need |
| `.mmd` | 1.3 kB | Good |

**Recommended export UX:**

1. Replace the modal's single-file-click behaviour with **one export dialog**: format on the left, options on the right (scope: whole diagram / current view / selection; scale ×1/×2/×3; theme: light/dark/current; background: transparent/solid; include editor notes: yes/no), then a primary "Export" button. All options already exist in the renderers; they are just not exposed.
2. Add **Copy to clipboard** for PNG and SVG (huge for pasting into a PR description or ticket).
3. Show a live size estimate next to Export and warn above ~2 MB.
4. Offer "Export as editable SVG" (the true-SVG path) and "Export as picture" as distinct choices, so users pick knowingly.

---

## 8. Onboarding and discoverability (finding 20)

First paint at 1440 px contains **13 distinct interactive regions**: brand/title, undo/redo, mode switch, tool switch, auto-layout + caret, simulation chips, motion toggle, File, Export, Search, Present, help, settings, two panel toggles, an 11-card palette, a 6-button empty state with 4 template cards, a 22-field inspector, and a 4-card HUD. The one thing a new user should do (drop a component, wire it) competes with everything else.

Concrete improvements, cheapest first:

1. **One primary action in the empty state.** Make "Drop your first component" the hero, with templates and import demoted to a secondary row. Currently `Browse Templates (7)` is the loudest button, which is the opposite of what the copy says to do.
2. **A 3-step first-run tour** (`?` overlay exists, so the shell is there): *1) drop a component → 2) drag from a port → 3) press Play to run telemetry*. Persist completion; make it dismissible once (§4 — it currently never dismisses).
3. **Progressive disclosure in the inspector.** It is 737 px tall with 22 inputs across 5 `<details>` sections, all collapsed except the first. Good start; next: surface the 4 fields people actually edit (Title, Subtitle, Accent, Status) as a "quick edit" strip, and move Metrics/Matrix/Payload behind an "Advanced" disclosure.
4. **Inline editing on the canvas.** Double-clicking a node should put its title in place. Right now the only path is select → move pointer to the right panel → find Title. This is the single biggest speed win for daily use, and it removes a panel round-trip for the most common edit.
5. **Contextual empty states per mode.** Data View on an empty document shows the *Design* empty state ("Build Your Architecture From Scratch") with simulation chips in the toolbar. It should say "Nothing to simulate yet — add components or load a showcase", with a one-click showcase button.
6. **Shortcut hints in tooltips** for the top five commands only (undo, redo, find, commands, delete), rendered from `SHORTCUTS` so labels never drift.

---

## 9. Engineering hygiene that shows up as UX (findings 21–22)

- **Node version trap.** `npm test` runs `node --experimental-strip-types`, which exists only in Node ≥ 22.6. On Node 20 (still the most common LTS in CI images) it fails with `node: bad option: --experimental-strip-types`, and `package.json` declares no `engines`. I had to install Node 22 to run the suite. Add `"engines": { "node": ">=22.6" }`, a `.nvmrc`, and (better) move to `vitest`/`tsx` so contributors aren't gated on a nightly flag.
- **No UI tests.** All 142 tests are pure logic. Both bugs in §4.4 (`hidden` defeated by CSS) and §4.6 (stale inspector) are *invisible* to that suite and obvious to a 20-line Playwright test. Add a thin e2e layer covering: empty state → drop component → reload → restore; export each format and assert non-empty + no `foreignObject`; mode switch keeping selection in sync; every `[hidden]` element computing to `display:none`.
- **`index.html` is 56 kB of hand-authored markup with 102 buttons**, while the TS modules separately own the same elements by ID. The hardcoded `⌘` (§5.15) and the unused `diagramSvg.ts` (§4.7) are both symptoms. Moving the toolbar/menus to small render functions would let shortcut labels, disabled states and roles be generated once.
- **`state.ts` mixes five concerns** (document, selection, history, autosave, viewport). The `flushAutosave` guard in §3.1 and the "who owns the title" bug in §4.6 both stem from that. A `documentStore` with explicit `commit(mutation)`/`subscribe()` would make save-state and inspector-sync fall out for free.

---

## 10. Suggested sequencing

| Phase | Items | Why this order |
| --- | --- | --- |
| **Week 1 — stop losing work** (≈3 days) | 1, 2, 3, 4 | Data loss and a permanently-broken dismiss button destroy trust faster than any missing feature. All four are small, surgical changes. |
| **Week 2 — make the app feel correct** (≈4 days) | 5, 6, 12, 13, 14, 15, 16, 17, 21 | Cheap, visible bugs plus the critical/serious a11y items. This is the phase where the app stops "feeling buggy". |
| **Week 3 — export quality & reach** (≈5 days) | 7, 19, 8 | Exports are the growth loop (people see ConduitCraft in someone else's README/ticket). Keyboard canvas access is the main a11y gap left. |
| **Week 4 — responsive & editor depth** (≈5 days) | 9, 10, 11, 18, 22 | Tablet/mobile viability, trustworthy Mermaid import, and the test layer that keeps the above fixed. |
| **Later** | 20 | Onboarding polish presupposes the above; a tour that shows off a bug is worse than no tour. |

> **One piece of shared infrastructure pays for four items:** a tiny `saveState` store + `renderInspector` + `[hidden] { display:none }` + a real tooltip layer. Findings 1, 2, 4, 6, 12, 14 all collapse to that work. Do it first.

---

## Appendix — reproducibility notes

Scripts used live outside the repo (`/tmp/probe*.py`, Playwright + axe-core). To reproduce the top findings manually:

```bash
pnpm install && pnpm build && npx vite preview --port 4180
```

1. **Restore overwrite:** Load showcase → reload → click any palette stencil → open DevTools ▸ Application ▸ Local Storage: `conduitcraft-autosave-v1` shrinks from 14 nodes to 1 while `Restore Previous Session (14 nodes)` is still displayed.
2. **Dismissal bug:** click `×` on the "Drag stencils onto grid…" hint → it stays; reload → it is still there and `conduitcraft-coach-dismissed=1` is set.
3. **Stale inspector:** click a node in Design → switch to Data View → the Overview title is the hardcoded "Untitled Architecture".
4. **SVG export:** Export ▸ Vector Picture (.svg), then open the file as `<img src="...">` in any HTML page: node cards disappear; `grep -c foreignObject` on the file returns 2 and the inlined CSS is ~104 kB.
5. **Mobile takeover:** open DevTools device toolbar at 390×844: palette (264 px) and inspector (344 px) both open over a 232 px canvas, no scrim, tapping a stencil leaves the drawer open.
6. **Share link:** export dialog shows "Generating shareable link…" in Chromium builds where the compression write/read pair deadlocks; `Copy Link` still toasts "Copied shareable diagram link".
