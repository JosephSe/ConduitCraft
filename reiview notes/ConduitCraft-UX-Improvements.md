# ConduitCraft — User Experience Review

**Repository:** [JosephSe/ConduitCraft](https://github.com/JosephSe/ConduitCraft) · MIT · v1.0.0
**Commit reviewed:** `e22cdc6` (`main`) · 143 tests / 33 suites passing · `npm run build` exit 0
**Review date:** 28 October 2026
**Reviewed build:** `dist/` produced by `npm run build` — 486 kB JS (131 kB gzip), 93 kB CSS (16 kB gzip)

---

## How this review was produced

This is not a read-through. Every claim below was produced by running the actual production build in a real Chromium (156.0.8078.4, headless) driven by Playwright, measuring the live DOM — computed styles, bounding boxes, accessibility tree, downloaded file bytes — plus reading the source at the line numbers cited.

- Baseline: `node --run test` → **143 passed**, `npm run build` → **exit 0**.
- 17 instrumented Playwright sessions: first paint, 16-width responsive sweep, grid geometry, keyed journeys, export capture, share-link diagnostics, autosave/reload, keyboard-model enumeration, axe-core 4.14.0 in both colour schemes.
- Viewports tested: **390, 768, 820, 900, 1024, 1056, 1057, 1100, 1180, 1280, 1312, 1330, 1360, 1440** px.

Two things to note about scope:

1. There is an **existing UX review committed to the repo** under `reiview notes/` (note the misspelling). I re-tested its claims. Some are still true, but **several are now false against `main`** — reporting them again would waste your time. Those corrections are collected in [§8](#8-corrections-to-the-existing-committed-review) so you can reconcile the two documents.
2. Findings that I could only establish from source, without a reproduction, are marked **[source-only]**. Nothing here is inferred without either a measurement or a cited line.

---

## 0. Summary table

| # | Severity | Finding | Evidence |
|---|---|---|---|
| 1 | **P0 — feature is 100% broken** | Share links never generate and never decode; a *success* toast is shown for a placeholder string | CompressionStream deadlock reproduced; input stuck >10 s |
| 2 | **P0 — layout collapses** | CSS specificity bug collapses the canvas to **232 px** on every viewport ≤ 1056 px — and **≤ 1312 px in Data View** | Computed `grid-template-columns: 232px 0px 344px` |
| 3 | **P0 — mobile unusable** | At 390 px, canvas is 232 px wide, a 264 px drawer covers it, there is no scrim, and the inspector's close affordance hides under the palette | `elementFromPoint(center)` is not the canvas |
| 4 | P1 | Header is **216 px tall** at 390 px (26 % of an 844 px screen), 14 of 30 buttons under the 44 px touch target | measured at 390×844 |
| 5 | P1 | `#btn-restore-session` is `hidden` but renders 225×34 px and does nothing when clicked | `savedSessionExists: false`, `interactions.ts:1531` |
| 6 | P1 | `[hidden]` is defeated by component `display` rules on 3 controls | `#btn-clear-search` 14×18, `#btn-prop-group` 88×30 |
| 7 | P1 | PNG export is **5.13 MB** for a 14-node diagram; SVG is **153 kB** with 105 kB of inlined CSS in one `foreignObject` | captured downloads, byte counts |
| 8 | P2 | 7 hard-coded `⌘` glyphs render on Linux/Windows | 6 labels + 1 placeholder |
| 9 | P2 | Tab order has **269 stops (175 visible)**, 101 of them inside the canvas | DOM enumeration |
| 10 | P2 | axe-core: 1 critical, 3 serious, 7 minor violations | axe 4.14.0, both schemes |
| 11 | P2 | Toast, coach card and search box occupy the same 30 px band at 1440×900 | rect intersection |
| 12 | P2 | Mermaid/blueprint validation only runs on **Apply**, never as you type | no `input` listener on `codeSyncTextarea` |
| 13 | P3 | Two different "Pause" controls 390 px apart, only one is a real toggle | `index.html:152` vs `:545` |
| 14 | P3 | "New Blueprint…" wipes the canvas with no confirm — but Undo restores it fully | 14 → 0 → 14 nodes |

**Things that are *not* problems** (don't spend time here): runtime performance, undo memory, canvas keyboard reachability, console errors on load, and the empty-state first paint. See [§7](#7-what-is-not-a-problem).

---

## 1. 🔴 P0 — Share links are completely broken, and the app reports success

**Files:** `src/studio/shareLink.ts:38-70` (encode), `:89-110` (decode), `src/studio/palette.ts:~718`

### What happens

Open **Export → Share Link** with any diagram loaded. The link field sits on `"Generating shareable link…"` indefinitely (measured: still there at **t + 10 s**). Press **Copy Link** and you get a toast saying **"Copied shareable diagram link to clipboard"** — while the clipboard actually contains the literal string `Generating shareable link…`.

Every inbound link is broken too, because the decode path uses the same broken pattern, so `#share=…` URLs silently fall through to an empty canvas.

### Root cause

`compressStringToBase64Url()` writes to the `CompressionStream` writable **and closes it**, and only *then* starts reading:

```ts
// src/studio/shareLink.ts:40-51
const cs = new CompressionStream('deflate');
const writer = cs.writable.getWriter();
await writer.write(bytes);
await writer.close();          // ← backpressure has nowhere to drain

const reader = cs.readable.getReader();   // ← too late: the queue already filled
while (true) { const { done, value } = await reader.read(); /* never resolves */ }
```

`CompressionStream` is a transform stream with a bounded internal queue. Writing the whole payload before anyone reads from `readable` blocks the writer permanently. I reproduced exactly this in the page: the snippet above **times out at 3 s**, whereas the one-line equivalent

```js
new Response(new Blob([bytes]).stream().pipeThrough(cs)).arrayBuffer()
```

compresses **5,000 B → 28 B** instantly. `decompressBase64UrlToString()` repeats the identical mistake at line 89.

### Why it matters

This is a *headline* feature — the dialog promises: *"Compresses this architecture into the browser address bar. Anyone with the link opens this diagram directly."* A broken share link is worse than no share link, because the success toast actively misleads. There is no timeout, no error path, and no way for the user to tell something failed.

### Fix

Replace the manual pump with the streaming helper (both directions):

```ts
export async function compressStringToBase64Url(input: string): Promise<string> {
  const bytes = new TextEncoder().encode(input);
  const stream = new Blob([bytes]).stream().pipeThrough(new CompressionStream('deflate'));
  const buf = new Uint8Array(await new Response(stream).arrayBuffer());
  let bin = '';
  for (let i = 0; i < buf.length; i++) bin += String.fromCharCode(buf[i]);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export async function decompressBase64UrlToString(base64url: string): Promise<string> {
  let b64 = base64url.replace(/-/g, '+').replace(/_/g, '/');
  while (b64.length % 4) b64 += '=';
  const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate'));
  return new Response(stream).text();
}
```

Then fix the three follow-on defects:

1. **Guard the copy button** — disable `#btn-copy-share-link` until the value actually looks like a URL (`startsWith(location.origin)`), and never toast success for a placeholder.
2. **Add a timeout** — `Promise.race` the encode with a 5 s reject so the UI can never hang again, and surface an error state in `#share-link-input`.
3. **Add a regression test** — `tests/` has 143 tests and none of them round-trips a real payload through the *browser* stream implementation. A single `compress → decompress → deepEqual` test would have caught this on day one. (Node's `CompressionStream` behaves differently enough that a Node-only test may pass while the browser path fails — assert it in a real browser, or at minimum add the round-trip so a future rewrite is covered.)

> Note: `createShareUrl()` already computes `isLarge` against `LARGE_URL_WARNING_THRESHOLD` (8 KB) and `#share-link-size` exists in the markup — the "your link is very long" warning UI is already wired. It has simply never been reachable.

---

## 2. 🔴 P0 — A CSS specificity bug collapses the canvas to 232 px

**File:** `src/styles/studio.css`

This is the single highest-leverage layout bug in the app, and it has two separate manifestations.

### The mechanism

Two rules sit in the same `@layer layout` block:

```css
/* :440 — specificity 0,3,0 */
@media (max-width: 82rem) {                     /* 1312px */
  .workspace:not([data-palette-collapsed="true"]):not([data-inspector-collapsed="true"]) {
    grid-template-columns: 14.5rem minmax(0, 1fr) 21.5rem;
  }
}

/* :459 — specificity 0,1,0 */
@media (max-width: 66rem) {                     /* 1056px */
  .workspace { grid-template-columns: minmax(0, 1fr); }
}
```

Both conditions are true at 390 px. The **0,3,0** rule wins, so the grid stays *three-column* even though the 66 rem block intends a single column. But the 66 rem block's other declarations **do** still apply — it converts `.palette-sidebar` and `.inspector` to `position: absolute` drawers. Those two are then removed from grid flow, leaving `.canvas-shell` as the only in-flow child, and it is placed in **track 1**.

Result: **track 1 is 232 px, track 2 (the flexible one) is empty, track 3 is 344 px.** Measured computed value:

```
390 px  → grid-template-columns: 232px 0px 344px   canvas 232 px
900 px  → grid-template-columns: 232px 324px 344px canvas 232 px
1024 px → grid-template-columns: 232px 448px 344px canvas 232 px
1056 px → grid-template-columns: 232px 480px 344px canvas 232 px
```

### Manifestation A — Design View, every width ≤ 1056 px

232 px of usable board, with a **324–480 px empty gap** in the middle that nothing can occupy, plus two opaque drawers floating over the top. At 900 px the user loses **68 %** of the horizontal space to a bug.

### Manifestation B — Data View, every width ≤ 1312 px

Worse, and easier to miss. `.workspace[data-mode="data"]` (`:311`) sets a **two**-column template, but the `82rem` rule above still overrides it to three. Measured at 1024 px in Data View:

| track | computed | actual content |
|---|---|---|
| 1 | 232 px | `.canvas-shell` — the board, squeezed |
| 2 | **448 px** | *(empty — palette is `display:none` in data mode)* |
| 3 | 344 px | `.inspector`, but absolutely positioned at x = 680 |

So in Data View the board is 232 px wide with **448–736 px of dead space** between it and the inspector. This is not a phone problem: it reproduces on a 1280×800 laptop.

### Fix

Match or exceed the specificity in the breakpoint you intend to win, and — more robustly — stop relying on specificity races for layout. Two options, in order of preference:

**Option A (correct, minimal):** make the small-screen block use the same selector and `!important`-free specificity:

```css
@media (max-width: 66rem) {
  .workspace:not([data-palette-collapsed="true"]):not([data-inspector-collapsed="true"]),
  .workspace[data-mode="data"] {
    grid-template-columns: minmax(0, 1fr);
  }
}
```

**Option B (better long-term):** replace the `:not()` chains with explicit state attributes on `.workspace` (`.is-palette-collapsed`, `.is-inspector-collapsed`, `[data-mode]`) and set the template from a single `grid-template-columns` declaration per mode. Specificity becomes 0,1,0 everywhere and the cascade stops being load-bearing.

**Regardless of which:** add a Playwright assertion to CI that at 390, 768, 1024, 1312 and 1440 px the computed `.canvas-shell` width is ≥ 92 % of the workspace width when no drawer is open. A one-line test would have prevented this from shipping, and it will prevent the next regression.

---

## 3. 🔴 P0 — The mobile experience is not usable

Measured at **390 × 844** (iPhone 12/13/14 logical size), with the showcase diagram loaded.

### What the user sees

| Element | Position |
|---|---|
| `.palette-sidebar` | x = 0, **width 264 px** — open by default, opaque |
| `.canvas-shell` | x = 0, width **232 px** — *underneath the palette* |
| `.inspector` | x = 47, width **343 px** — open by default, opaque |

- **`elementFromPoint(195, 500)` — the centre of the screen — returns the inspector, not the canvas.** The board is fully covered before the user touches anything.
- **There is no scrim element in the DOM at all.** Tapping outside a drawer does not close it, so the two drawers can be open simultaneously with no way to dismiss either except hunting for a small chevron.
- **The inspector's own collapse button is underneath the palette.** It sits at the top-left of the inspector, which is at x = 47 — inside the palette's 0–264 band. It is unclickable while the palette is open. This is a genuine dead end.
- Dragging a stencil onto the board **does not close the palette** — it adds the node behind a 264 px curtain, and the user sees nothing happen.
- The **header is 216 px tall** (25.6 % of the screen). Of 30 header buttons, **14 render below the 44×44 px minimum touch target**.

### Fix

1. **Fix §2 first** — at ≤ 66 rem the grid must actually be `minmax(0, 1fr)`; that alone gives the board the full 390 px when drawers are shut.
2. **Make drawers mutually exclusive and dismissible.** Opening the palette closes the inspector; add a real `<div class="drawer-scrim">` with `position: fixed; inset: 0; z-index: 39` that closes whichever drawer is open on tap. This is ~15 lines and it is the difference between "awkward" and "broken".
3. **Auto-close after a stencil drop below 66 rem.** On `dragend`/`pointerup` after a successful add, set `data-palette-collapsed="true"` so the user immediately sees the node they just created.
4. **Never stack the inspector's close button under another drawer** — move it to the inspector's top-*right* on narrow layouts.
5. **Collapse the header on narrow screens.** 216 px of chrome on a 844 px screen is 26 % of the canvas gone. Collapse the mode switcher + toolbar into a single overflow menu below ~52 rem; keep only File / Export / Present visible.
6. **Enforce 44 × 44 px minimums** under `@media (pointer: coarse)`. The file already contains a `@media (pointer: coarse)` block (line 1844), so the hook exists — 14 header buttons simply aren't covered by it.

---

## 4. 🟠 P1 — Phantom and dead controls

**Files:** `index.html:356`, `index.html:440`, `interactions.ts:1531`

### 4a. `#btn-restore-session` renders on a pristine profile and does nothing

The markup is `<button … id="btn-restore-session" hidden>` (`index.html:356`). On a **fresh browser profile with no autosave**, it computes `display: flex` at **225 × 34 px** and is visible in the header. Clicking it produces:

- no toast
- no change to the canvas
- no HUD status change

Because `interactions.ts:1531` reads `if (!saved) return;` — the code correctly decides there is nothing to restore, and returns silently. `savedSessionExists` was `false` for the whole session.

### 4b. `[hidden]` is systematically defeated

`hidden` sets `display: none` at UA specificity (0,0,1). Any component rule with `display: flex/grid/inline-flex` beats it. Confirmed live:

| element | state | computed box |
|---|---|---|
| `#btn-restore-session` | `hidden` | **225 × 34** (visible) |
| `#btn-clear-search` | `hidden` | **14 × 18** (visible × glyph) |
| `#btn-prop-group` | `hidden` | **88 × 30** (visible) |

`.btn { display: inline-flex }` (`studio.css:834`) and `.hud-search-clear { display: flex }` (`:4325`) are the culprits.

### Fix

One rule at the top of the stylesheet fixes the whole class of bug:

```css
[hidden] { display: none !important; }
```

Then, separately, **stop rendering the restore button when there is nothing to restore** — set `savedSessionExists` at boot and toggle the button in the same place you populate it. A button that is present, styled, focusable, and inert is worse than no button: it costs a tab stop and teaches the user the app is unreliable.

Note this also means the *empty* state currently advertises "↺ Restore Previous Session" to every first-time visitor. That is a bad first impression — the first thing a new user is offered is a recovery action for data they never had.

---

## 5. 🟠 P1 — Exports are an order of magnitude larger than they need to be

This is the single largest *functional* quality gap after share links: the app has a clean, portable SVG renderer and doesn't use it.

### Measured, 14-node showcase diagram

| Format | Size | Note |
|---|---|---|
| **SVG** | **153,590 B** | one `<foreignObject>` containing **105,244 B of CSS — 748 rules** |
| **PNG** | **5,134,519 B** | 5.1 MB for 14 boxes |
| HTML (standalone) | 112,988 B | |
| blueprint.json | 23,210 B | |
| MMD | 1,260 B | compact and correct |

### Why the SVG is 153 kB

`btnExportSvg` (`interactions.ts:1764`) calls **`renderStagePictureSvg()`** — a *screenshot of the live DOM*, so it carries the entire studio stylesheet inline inside `<foreignObject>`. The result:

- fails in Figma, Illustrator, Inkscape, Keynote and most office suites (they do not render `foreignObject`);
- fails in `<img src="…svg">` and as an email attachment;
- is 153 kB for 14 nodes.

`src/exporter/diagramSvg.ts` is a **clean, 123-line, portable SVG renderer** that emits real `<rect>/<text>/<path>` with no `foreignObject`. Its only consumer today is `templatesGallery.ts:175` (thumbnail generation) and the tests.

### Fix

1. **Point `btnExportSvg` at `renderDiagramSvg(app.doc)`.** Keep `renderStagePictureSvg` as an explicitly-labelled *"SVG (pixel-perfect)"* option for people who want the exact studio look — but the default should be the portable one.
2. **PNG:** the current code is already adaptive (`Math.min(2, 4096 / max(w,h))`, `interactions.ts:1770`), so the 5.1 MB comes from the payload, not the scale — every export embeds the full 105 kB stylesheet into the raster pipeline. Fixing the SVG renderer fixes the PNG size as a side effect. Also offer a scale selector (1× / 2× / 4×) in the export dialog; 5 MB is not shareable in Slack.
3. **Surface the size before download** — show `~153 kB` next to each export button. Users make better format choices when they can see the cost.

---

## 6. 🟠 P1–P2 — Interaction and accessibility defects

### 6a. Mac-only glyphs on every platform — **P2**

`navigator.platform` reports `Linux x86_64`, yet **7 visible `⌘` glyphs** render: Undo (`⌘Z`), Redo (`⌘⇧Z`), Commands (`⌘K`), `⌘L`, `⌘G`, `⌘D`, plus the file menu's `Open File… ⌘O`, `Save ⌘S`, `Save As… ⌘⇧S` and the search placeholder `Find node… (⌘F)`.

`isMac()` already exists (`commands.ts:9`) and `modKeyLabel()` (`:15`) already returns `⌘` or `Ctrl`. It is used correctly in `palette.ts` and `nodeSearch.ts` — **the static markup simply doesn't use it.** Mac users see the right thing; every Windows and Linux user is told to press a key they don't have.

**Fix:** give each glyph a `data-mod` attribute (`data-mod="Z"`, `data-mod="⇧Z"`) and post-process at boot:

```js
document.querySelectorAll('[data-mod]').forEach(el => {
  el.textContent = (isMac() ? '⌘' : 'Ctrl+') + el.dataset.mod;
});
```

Then add a test that renders with `navigator.platform` stubbed to `Win32` and asserts `⌘` appears zero times.

### 6b. 269 tab stops, 101 of them inside the canvas — **P2**

With the showcase loaded: **269 focusable elements in the DOM, 175 visible**. 101 of those are inside the canvas — 14 nodes × (1 drag handle + 4 ports) = 70, plus 16 focusable wires, plus controls.

To be fair: **the canvas *is* keyboard-reachable**, and the model is thoughtful — wires are focusable with `aria-label="Stream wire from X to Y"`, each node exposes `.node-drag-handle` (`"Move X with arrow keys"`) and 4 `.node-port` buttons. But 101 stops in a document tab order is not navigable.

**Fix:** adopt roving tabindex. Give the canvas *one* tab stop (the currently-selected node). Arrow keys move between nodes (already implemented), `Enter` enters the port list, `Escape` returns. `Tab` inside the canvas should cycle `drag-handle → port 1..4 → next node` only while the canvas has a selected node. This is the standard pattern (ARIA grid) and it takes the canvas from 101 stops to 1.

### 6c. axe-core violations — **P2**

Identical results in light and dark (axe 4.14.0):

| Rule | Impact | Count | Target |
|---|---|---|---|
| `label` | **critical** | 1 | `#file-upload` — a `visually-hidden` file input with no accessible name |
| `label-content-name-mismatch` | **serious** | 3 | `#btn-focus-doc-title`, `#btn-open-palette`, `#btn-enter-presentation` |
| `aria-allowed-role` | minor | 7 | `.stencil-card` |

- **`#file-upload`** (`index.html:156`) has no `<label>` and no `aria-label`. Screen-reader users cannot identify the import control. One attribute fixes it: `aria-label="Import blueprint file"`.
- **`label-content-name-mismatch`** means the visible text isn't contained in the accessible name — e.g. the button reads *"Search"* but is labelled *"Command palette (Cmd/Ctrl+K)"*. Voice-control users saying "click Search" get nothing. Make the accessible name *start* with the visible text: `aria-label="Search — command palette (Ctrl+K)"`.
- **`.stencil-card`** is a `<button>` given `role="listitem"` (`interactions.ts:231`) inside `#stencil-grid role="list"` (`index.html:287`). A button with `role="listitem"` loses its button semantics — it stops announcing as pressable. Either drop the `role="listitem"` (a `<ul>`/`<li>` wrapper is the correct fix) or drop `role="list"` from the container and let the buttons be buttons.

There is a `live announcer` and an a11y pass in recent history (`c416c48`) — the base is good; these are the leftovers.

### 6d. Toasts, coach card and search box collide — **P2**

At 1440 × 900:

| element | top | bottom | left |
|---|---|---|---|
| toast container | 787 | 824 | 535 |
| coach card | 794 | 826 | 498 → 805 |
| search card | 798 | 826 | — |

Three UI layers share one **30 px band** at the bottom of the viewport. On a 900 px-tall screen this is the most valuable area (just above the fold line) and it is unreadable when a toast fires while the coach mark is showing — which is *exactly* when a new user triggers a toast (first node dropped).

**Fix:** reserve a bottom "HUD rail" with `display: flex; flex-direction: column-reverse; gap: 8px` and let all three participate in flow instead of being independently `position: fixed` at hard-coded `bottom` values. `d5d4e60` already fixed *tooltip* stacking — the same treatment is needed one layer up.

### 6e. Mermaid/blueprint validation only runs on Apply — **P2**

`src/core/parser.ts` produces good diagnostics — `Line N: message` (lines 417, 1299, and issues raised at 401/417/455/481/587/634). But there is **no `input` listener on `codeSyncTextarea`**. The user pastes 40 lines of Mermaid, sees nothing, presses **Apply**, and only *then* gets a wall of errors with no chance to correct them as they type.

**Fix:** debounce a parse at 250 ms on `input` and render diagnostics into the existing warning region live. The parser is already pure and fast (14-node doc parses in well under a frame). Turn the "Apply" button into "Apply (3 warnings)" so the button itself is a status indicator.

---

## 7. 🟡 P3 — Smaller polish items

**7a. Two "Pause" controls.** `index.html:152` `#btn-toggle-motion` is a proper toggle (`aria-pressed="false"`, flips to "Resume", verified: clicking it pauses all animations). `index.html:545` `#btn-sim-play` has `aria-label="Play or pause simulation"` and `title="Play/Pause"` but **no `aria-pressed`** and is hidden outside Data View. Two controls called "Pause", 390 px apart, with different semantics and different accessibility. Rename the header one to **"Pause motion"** and give `#btn-sim-play` a proper `aria-pressed` that tracks sim state.

**7b. Template pick wipes unsaved work with no confirmation — but Undo saves you.** "New Blueprint…" opens the gallery with no confirm and leaves the existing 14 nodes intact; picking a template sets the canvas to 0 nodes. **However, `Ctrl+Z` fully restores all 14 nodes** (verified: 14 → 0 → 14, because the wipe is a single history entry). So this is a discoverability problem, not a data-loss problem: the destructive action has no warning *and* no visible "Undo" affordance in the toast. Add an Undo action to the "Created blank canvas" toast — the `notify()` helper already supports `{ action: { label, onClick } }`, it's used for the restore toast at `interactions.ts:1541`.

**7c. Presentation mode has no discoverable exit.** Entering presentation works (bar shows "Overview (14 nodes) · Exit", `P` toggles, `Esc` exits). But `escHintShown` was **false** — there is no on-entry hint telling the user that `Esc` is how you get out. Show the bar's "Exit" hint for 3 s on entry.

**7d. `beforeunload` prompt — [source-only, unconfirmed].** `interactions.ts:1545-1550`:

```ts
window.addEventListener('beforeunload', (e) => {
  if (app.hasPendingAutosave) { flushAutosave(); e.preventDefault(); }
});
```

`flushAutosave()` writes to `localStorage` **synchronously immediately before** `preventDefault()`. So by the time the browser would ask "Leave site?", the work is already saved — the prompt has nothing to protect. It fires inside the 320 ms autosave window (`state.ts:108`) after every edit. I could **not** reproduce the native dialog under headless Chromium in two attempts (including a real user-activated drag + close at 120 ms), so treat this as low-confidence: on paper it's a spurious prompt; in practice headless may not surface it. **Recommended change regardless:** delete `e.preventDefault()`. The flush is what matters and it has already happened.

**7e. Share-link size warning is wired but unreachable.** `LARGE_URL_WARNING_THRESHOLD = 8192` and `#share-link-size` exist. Once §1 is fixed, make sure the "this link is very long" state actually renders — an 8 KB URL is rejected by some clients and silently truncated by others, and the user needs to know *before* they paste it into Slack.

---

## 8. Corrections to the existing committed review

`reiview notes/ConduitCraft-UX-Review.md` (313 lines) and `reiview notes/UX_IMPROVEMENTS.md` (268 lines) were committed in `7029c9f`. I re-tested each testable claim against `main`. **Do not re-report these as open issues:**

| Claim in the committed review | Verdict | Measurement on `e22cdc6` |
|---|---|---|
| "PNG is fixed at 4096 px and always huge" | ❌ **Stale / wrong** | Code is adaptive: `Math.min(2, 4096 / max(w,h))` (`interactions.ts:1770`). Still 5.1 MB *in practice*, but for a different reason (§5) |
| "Canvas is unreachable by keyboard; nodes have no tab stop or role" | ❌ **False** | 101 focusable elements inside the canvas; nodes have drag handles + 4 port buttons; wires are focusable with descriptive labels (§6b) |
| "Canvas collapses between 1056 and 1008 px" | ❌ **Number is wrong** | It collapses at **every width ≤ 1056 px** (§2), and ≤ 1312 px in Data View |
| "60 history clones is a memory problem" | ⚠️ **Overstated** | Doc serialises to 14,373 B; × 60 ≈ 842 KB serialised, ~2.1 MB heap. Not a problem at this scale |
| Undo/redo, palette, tooltips, inspector truncation, node height, scenario wrap | ✅ Largely **fixed already** | `d5d4e60`, `6ddb7bb`, `6d3090a`, `d53bb3d`, `4e233f2` landed after that review |

Also worth noting for your own triage: **`IMPROVEMENTS.md` is a feature-wishlist, not a defect list** — and most of it has since shipped (command palette, node search, presentation mode, simulation playback, z-order/lock/group, template gallery, PWA, snapshots). It should probably be archived or retitled "shipped" so it stops reading as a backlog.

---

## 9. What is *not* a problem

Reporting these explicitly so you don't spend engineering time on non-issues raised elsewhere:

- **Performance is fine.** 14 wheel-zoom steps + 10 drags produced **1 long task totalling 56 ms**. No jank, no dropped frames. The level-of-detail rendering added in `c416c48` is working.
- **Console errors on load: none.** Clean boot, both colour schemes.
- **Undo history is cheap** (see table above) — the "60 clones = memory problem" concern is not borne out at this document size.
- **Reload does *not* auto-restore.** It lands on the empty state with a restore affordance — correct, explicit behaviour. (Though see §4a: the affordance is also shown when there's nothing to restore.)
- **Dark-mode contrast passes.** Every measured pair clears AA: coach hint 8.46, stencil card 16.18, zoom readout 12.58, section heading 8.46. The `prefers-color-scheme` + `color-scheme` boot (`colorSchemeBoot.js`) is a clean implementation with no flash of wrong theme.
- **First paint is well-composed.** 134 interactive elements in the DOM, 59 visible; canvas takes 816 px = 57 % of a 1440 px viewport.
- **The parser is good.** `Line N: message` diagnostics are specific and correct — the problem is purely *when* they are shown (§6e).

---

## 10. Suggested sequencing

**Ship this week (hours, not days):**

1. §1 share link — two-function rewrite, plus a copy-button guard and a round-trip test. *Ten lines of production code.*
2. §2 CSS specificity — one selector. **Do this before anything else visual**, because it changes what every other responsive number measures.
3. §4a/§4b `[hidden] { display: none !important }` + gate the restore button on `savedSessionExists`. *Two lines and one condition.*
4. §6a `data-mod` platform glyphs. *Static markup + one boot pass.*
5. §6c three `aria-label`s and the `role="listitem"` removal.

**Next sprint:**

6. §3 mobile: scrim, mutual exclusion, auto-close on drop, 44 px targets, collapsed header.
7. §5 point the SVG button at `renderDiagramSvg`, offer PNG scale choices.
8. §6d HUD rail; §6e live parse-on-type; §7b Undo action on destructive toasts.

**Then:**

9. §6b roving tabindex for the canvas (the one item here that needs real design work).
10. Add the responsive + a11y assertions to CI so §2 and §6c cannot regress.

---

## Appendix — environment

| | |
|---|---|
| Build | `npm run build`, Vite, 53 modules, 1.56 s, exit 0 |
| Tests | 143 passing / 33 suites / 12.9 s (Node 22.14.0 — Node 20 fails on `--experimental-strip-types`) |
| Browser | Chromium 156.0.8078.4 headless (`PLAYWRIGHT_BROWSERS_PATH`) |
| a11y engine | axe-core 4.14.0, run light + dark (`colorScheme: 'dark'`) |
| Served | `python3 -m http.server 4180` over `dist/` |
| Captured artefacts | `/home/user/audit/dl/` (5 real exports), `/home/user/audit/shots/` (5 screenshots) |

**Reproduction scripts** are in `/home/user/audit/` — `02-responsive.mjs` (width sweep), `04-grid.mjs` + `15-sweep.mjs` (the grid measurement in §2), `07-share-exports.mjs` + `08b-share-diag.mjs` (share-link deadlock), `13-metrics.mjs` (mobile measurement in §3), `11-final.mjs` (keyboard/journey checks).
