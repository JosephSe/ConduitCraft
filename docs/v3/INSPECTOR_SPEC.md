# The properties card: implementation spec

**Written:** 2026-11-11, against `v3` at `be066f0` (release 3.0.0).
**Replaces:** section 6.5 of [`REDESIGN_PLAN_V3.md`](../../REDESIGN_PLAN_V3.md). Everything else in that plan still holds (decisions D1 to D15, the tokens, the word list).
**The visual target is a working mockup:** [`inspector-concept.html`](inspector-concept.html). Open it before reading further. Where this file and the mockup disagree on a look, the mockup wins. Where they disagree on behaviour, ids or wording, this file wins.

This file is written so that an agent with no memory of the project can do the work by following it top to bottom. Do the steps in section 12 in order. Do not skip ahead, and do not improve on it.

---

## Contents

1. [What is being built](#1-what-is-being-built)
2. [Rules you must not break](#2-rules-you-must-not-break)
3. [Before you start](#3-before-you-start)
4. [Files you will touch](#4-files-you-will-touch)
5. [The card (container)](#5-the-card-container)
6. [The header](#6-the-header)
7. [Rows and controls](#7-rows-and-controls)
8. [What goes in the card, per selection](#8-what-goes-in-the-card-per-selection)
9. [Wording changes](#9-wording-changes)
10. [Narrow screens and touch](#10-narrow-screens-and-touch)
11. [Tests](#11-tests)
12. [Work order](#12-work-order)
13. [Acceptance checklist](#13-acceptance-checklist)
14. [Out of scope](#14-out-of-scope)

---

## 1. What is being built

Today the properties inspector is a full-height panel docked to the right edge. It has a title bar, a row of Lock / Duplicate / Delete buttons, and a long form of stacked label-over-field inputs. When it is closed it leaves a strip down the right edge with the word "Properties" written vertically.

It becomes **one floating card**:

```
                                           ┌ NE island ────────────┐
                                           │  Search  Share  Run   │
                                           └───────────────────────┘
                                           ┌ the card, 304 px ─────┐
                                           │ ⬡  Edge CDN + WAF  ⋯ ✕│  header: cut-out, name, kind
                                           │    Control gate ⌄     │
                                           │ [ Look |Behaviour|Notes]  tabs (components only)
                                           │ Colour     ● ● ● ◉ ● ●│
                                           │ Shape          Hexagon│  rows: label left,
                                           │ [▭ ▢ ⬭ ◯ ◇ ⬡ ▷ ⏢]    │  control right
                                           │ Icon    [🛡 Shield ⌄] │
                                           │ Subtitle [40 PoPs…   ]│
                                           └───────────────────────┘
                                             (as tall as its content)

                                           ┌ SE island ────────────┐
                                           │  −  100%  +  Fit      │
                                           └───────────────────────┘
```

Five things change. Nothing else does.

1. **Container.** A floating island over the sheet, 304 px wide, as tall as its content, never taller than the space between the NE and SE islands. The sheet no longer loses a column to it. Closed means gone: no strip, no vertical word.
2. **Header.** The selection's cut-out, its name as an editable field, and its kind. Two icon buttons: More (⋯) and Close (✕). Lock, Group, Duplicate, Delete and "Keep open" move into the More popover.
3. **Rows.** One property per row: label on the left (84 px), control on the right. Long text, lists and pickers use a full-width "block" row.
4. **Controls.** Ruled fields, a styled select, a stepper for counts, a switch for yes/no, colour dots, and a row of shape cut-outs in place of the Shape dropdown.
5. **Words.** Short sentence-case labels (section 9).

**The data does not change.** Every property that can be edited today can still be edited. No property is added. The document schema is untouched.

---

## 2. Rules you must not break

| # | Rule |
|---|---|
| R1 | **Do not change what a control does.** Every existing event handler body (the code that writes to `node`, `edge`, `app.doc`, calls `pushHistory()`, `renderAll()`, `commit()`) stays exactly as it is. You move controls and restyle them. You do not rewrite their logic. |
| R2 | **Keep every element `id` listed in section 8.** Tests find controls by these ids. An id stays on the same kind of element (`<input>`, `<select>`, `<textarea>`) unless section 8 says otherwise. |
| R3 | **Keep native form elements.** A select stays a real `<select>`. A switch is a real `<input type="checkbox">`. A stepper wraps a real `<input type="number">`. Do not build custom listboxes. |
| R4 | **No new dependency, no framework, no schema change** (plan decisions D2 and D7). |
| R5 | **Colours come from tokens only.** Use `var(--cc-…)`. Never write a hex or `rgb()` value in the new CSS. |
| R6 | **Redesign by replacement** (D13). When you add the new CSS for a thing, delete the old CSS for that thing in the same commit. Do not add overrides to `unlayered.css`. New rules go in `src/styles/studio/inspector.css` inside `@layer inspector { … }`. |
| R7 | **Do not touch** `src/studio/interactions.ts.bak`, `e2e/zz_debug.spec.ts`, `tools/_auditTemplates.ts`, `tools/_narrow.mjs` or anything under `.claude/`. They are the owner's. |
| R8 | **Do not restyle the Traffic pane's contents** (`#data-inspector-pane` and the scenario editor). It only gets the new container (section 5). Its insides are a later item (section 14). |
| R9 | **Branch and PR.** Work on a branch from `v3`; PRs target `v3`. Stage files by name (`git add path/to/file`), never `git add -A` or `git add .`. Do not put a `claude.ai` session link in a commit, PR or comment. |
| R10 | **If something in this file does not match the code**, stop and write `Blocked: <what you found>` under the step in section 12. Do not guess. |

---

## 3. Before you start

1. See the target. Run `python3 -m http.server 5199 --directory docs/v3` and open `http://localhost:5199/inspector-concept.html`.
   - Click each of the four components and each of the three wires.
   - On a component, open all three tabs. Change the colour, the shape and the kind (click the kind name under the title).
   - Click ⋯. Choose "Keep open", then click the empty sheet: the card shows the document.
   - Press the moon button for the dark theme. Narrow the window below 760 px to see the bottom sheet.
   - URL switches: `?theme=dark`, `?tab=behaviour`, `?sel=q` (ids: `gw`, `svc`, `cache`, `q`, `w1`, `w2`, `w3`, `none`).
2. Read the mockup's `<style>` block. Sections 5 to 7 give the same CSS with the app's token names.
3. Record the baseline. Run these and save the pass/fail counts in the PR description:
   ```
   pnpm build
   pnpm test
   pnpm test:e2e
   pnpm check:size
   ```
4. The mockup is a picture, not source. Do not copy its script or markup into the app. Build in the app's own modules.

**Token names.** The mockup uses short names. In the app, use these:

| Mockup | App |
|---|---|
| `--sheet` `--island` `--canvas` | `--cc-sheet` `--cc-island` `--cc-canvas` |
| `--ink` `--ink-2` `--ink-3` `--on-ink` | `--cc-ink` `--cc-ink-2` `--cc-ink-3` `--cc-on-ink` |
| `--hair` `--hair-2` `--field-edge` | `--cc-hair` `--cc-hair-2` `--cc-field-edge` |
| `--redline` | `--cc-redline` |
| `--spring` | `--cc-spring` |
| `--sans` `--mono` | `--cc-font-sans` `--cc-font-mono` |
| `--blue` … `--fuchsia` | `--cc-blue` … `--cc-fuchsia` |
| `--well`, `--well-2`, `--lift`, `--contact` | Search `src/styles/shared.css` and `src/styles/studio/tokens.css` for an existing `--cc-well`, `--cc-lift`, `--cc-contact`. Use them if they exist. If one does not exist, add it to the same blocks that define `--cc-sheet` (light and dark), with the values in the table below. |

| Token to add only if missing | Light | Dark |
|---|---|---|
| `--cc-well` | `rgba(21, 24, 28, 0.055)` | `rgba(255, 255, 255, 0.07)` |
| `--cc-well-2` | `rgba(21, 24, 28, 0.1)` | `rgba(255, 255, 255, 0.13)` |
| `--cc-lift` | `0 1px 1px rgba(21,24,28,.05), 0 10px 30px -10px rgba(21,24,28,.22)` | `0 0 0 .5px rgba(0,0,0,.5), 0 14px 34px -12px rgba(0,0,0,.6)` |
| `--cc-contact` | `0 1px 2px rgba(21,24,28,.07)` | `0 1px 2px rgba(0,0,0,.3)` |

These four are the only places a literal colour may be written, and only in the token files.

---

## 4. Files you will touch

| File | What changes |
|---|---|
| `index.html` (lines 367 to 400) | The `<aside id="inspector-panel">` markup: remove the rail and the heading row, add the More popover. Section 5.2. |
| `src/styles/studio/inspector.css` | Container, header, rows, controls. Old rules for the same things are deleted. |
| `src/styles/studio/layout.css` (lines 225 to 360) | The workspace grid loses the inspector column. Rail rules are deleted. |
| `src/styles/studio/unlayered.css` | Only deletions: old `.prop-section-*` and `.prop-selection-*` rules that the new CSS replaces. |
| `src/studio/inspector.ts` | `makeField`, new control helpers, header, field order, labels. `renderPropertyEditor` starts at line 922. |
| `src/studio/frameStage.ts` | The frame's fields (it builds `#prop-frame-title`). Same row rules. |
| `src/studio/responsiveToolbar.ts` | Remove the rail handlers (lines 58 to 61 and 77 to 84). |
| `src/studio/inspectorAutoShow.ts` | One line removed: the `pin.setAttribute('aria-label', pinned ? 'Unpin inspector' : 'Keep inspector open')` call (line 44). The button's name is now its visible text, "Keep open", and `aria-pressed` says whether it is on. A changing `aria-label` that does not contain the visible text fails the axe check. Nothing else in the file changes. |
| `src/studio/dom.ts` (lines 106 to 109) | The four `btn-prop-*` lookups stay; the elements move into the popover. |
| `src/studio/tooltips.ts` (line 87) | Remove the `.inspector-rail-content` case. |
| `src/studio/state.ts` (`fitToViewport`, line 721, and `fitSelection`, line 735) | Fit leaves room for the card. Section 5.5. |
| `tests/…`, `e2e/…` | Section 11. |

Line numbers are for `be066f0`. If they have moved, find the code by the names given.

---

## 5. The card (container)

### 5.1 Behaviour, in plain words

- The card shows when `#workspace` does **not** have `data-inspector-collapsed="true"`. That attribute and the code that sets it (`responsiveToolbar.toggleInspector`, `inspectorAutoShow.ts`) do not change. Selecting something opens the card; clearing the selection closes it, unless "Keep open" is on.
- When closed, `.inspector` is `display: none`. There is no strip.
- The `]` key still toggles it (existing shortcut).
- The card sits above the sheet. Opening or closing it **does not resize or move the diagram**.
- The card is as tall as its content. If the content is taller than the space available, the body scrolls inside the card; the header and tabs stay put.

### 5.2 Markup (`index.html`)

Replace everything from `<aside class="inspector" id="inspector-panel" …>` down to the closing `</div>` of `#design-inspector-pane` with this. Leave `#data-inspector-pane` and everything after it exactly as it is.

```html
<aside class="inspector" id="inspector-panel" aria-label="Properties inspector" data-island>
  <!-- DESIGN MODE: the properties card -->
  <div class="inspector-mode-pane" id="design-inspector-pane">
    <h2 class="visually-hidden" id="prop-panel-heading">Document properties</h2>
    <div class="inspector-scroll" id="prop-form-container"></div>

    <!-- More actions. A plain group of buttons in a popover, not an ARIA menu. -->
    <div class="prop-more" id="prop-more-popover" popover role="group" aria-label="More actions">
      <button type="button" class="prop-more-item" id="btn-pin-inspector" aria-pressed="false">
        <!-- pin icon: copy the <svg> from the old #btn-pin-inspector, width and height 16 -->
        <span>Keep open</span>
      </button>
      <div class="prop-more-actions" id="prop-selection-actions" hidden>
        <hr>
        <button type="button" class="prop-more-item" id="btn-prop-lock" data-tip="Lock selection (⌘L)" aria-label="Lock selection">Lock</button>
        <button type="button" class="prop-more-item" id="btn-prop-group" data-tip="Group / Ungroup (⌘G)" aria-label="Group or ungroup">Group</button>
        <button type="button" class="prop-more-item" id="btn-prop-duplicate" data-tip="Duplicate selection (⌘D)">Duplicate</button>
        <button type="button" class="prop-more-item prop-more-danger" id="btn-prop-delete" data-tip="Delete selection (Del)">Delete</button>
      </div>
    </div>
  </div>
```

What was removed, on purpose:

- `#inspector-rail-content`, `#btn-rail-expand-inspector`, `.rail-vertical-label` (the strip).
- `.inspector-tabs`, `.inspector-tabs-heading` (the "Component properties" title bar).
- `#btn-collapse-inspector` from the static markup. The Close button is now built in the header by `inspector.ts` (section 6) and **keeps the id `btn-collapse-inspector`**.

What was kept, on purpose: the ids `inspector-panel`, `design-inspector-pane`, `prop-panel-heading`, `prop-form-container`, `btn-pin-inspector`, `prop-selection-actions`, `btn-prop-lock`, `btn-prop-group`, `btn-prop-duplicate`, `btn-prop-delete`. The existing code that shows, hides and relabels these buttons (`updateSelectionActionButtons`, `inspector.ts` line 807) keeps working without change.

Because `#btn-collapse-inspector` is now created on every render, change `responsiveToolbar.ts` so it does not look the button up once at start. Replace the block at lines 52 to 56 with one delegated listener:

```ts
document.getElementById('inspector-panel')?.addEventListener('click', (e) => {
  if ((e.target as HTMLElement | null)?.closest('#btn-collapse-inspector')) this.toggleInspector(true);
});
```

Delete the `btnRailExpandInspector` block (lines 58 to 61) and the `inspectorRail` block (lines 77 to 84).

### 5.3 CSS: the container

In `layout.css`:

1. Find every rule that gives `.workspace` two grid columns for the inspector (`grid-template-columns: minmax(0, 1fr) 3.25rem`, `… 23.5rem`, and the design-mode equivalent above line 225). Replace all of them with a single rule: `.workspace { grid-template-columns: minmax(0, 1fr); }`.
2. Delete the rules for `.inspector-rail-content`, `.rail-vertical-label` and `.workspace[data-inspector-collapsed="true"] .inspector-mode-pane`.
3. Delete the `@media (max-width: 66rem) { .inspector { position: absolute; … } }` block's `.inspector` rule (the card is always absolutely placed now). Keep the `@media (max-width: 56rem)` bottom-sheet rule; section 10 replaces its values.

In `inspector.css`, replace the `.inspector`, `.inspector-mode-pane`, `.inspector-tabs`, `.inspector-tabs-heading` and `.prop-header-actions` rules with:

```css
.inspector {
  position: absolute;
  inset-block-start: 0;         /* .workspace already starts below the top bar, 8px under the NE island */
  inset-inline-end: 14px;       /* the slot inset used by every island */
  inline-size: 304px;
  max-block-size: calc(100% - 113px);  /* the SE island is 85px tall: 85 + its 14px inset + a 14px gap */
  display: flex;
  flex-direction: column;
  border-radius: 16px;
  background: var(--cc-island);
  border: 1px solid var(--cc-hair);
  box-shadow: var(--cc-lift);
  backdrop-filter: blur(18px) saturate(1.4);
  z-index: 12;
  animation: prop-card-in 300ms var(--cc-spring);
}
.workspace[data-mode="data"] .inspector { inline-size: 360px; }
.workspace[data-inspector-collapsed="true"] .inspector { display: none; }
@keyframes prop-card-in { from { opacity: 0; transform: translateX(14px); } }

.inspector-mode-pane { display: flex; flex-direction: column; min-block-size: 0; }
.inspector-mode-pane[hidden] { display: none; }
.inspector-scroll { display: flex; flex-direction: column; min-block-size: 0; overflow: hidden; }

@media (prefers-reduced-motion: reduce) { .inspector { animation: none; } }
@media (prefers-reduced-transparency: reduce) { .inspector { background: var(--cc-sheet); backdrop-filter: none; } }
@supports not (backdrop-filter: blur(1px)) { .inspector { background: var(--cc-sheet); } }
```

Check the real inset values before you commit: open the app, inspect the NE island (`.slot-ne`) and the SE island, and read their distance from the window edge and their heights. If the top bar's bottom edge is not at about 62 px, set `inset-block-start` to (NE island bottom + 8 px). If the SE island's top is not about 72 px above the bottom edge, set the `86px` to (SE island height + its bottom inset + 14 px). The card must never overlap either island.

`.inspector` must be positioned relative to `.workspace`. Confirm `.workspace` has `position: relative`; add it if not.

The animation runs each time `.inspector` goes from `display: none` to shown, which is what we want. It must not replay when the selection changes from one thing to another (the element stays displayed, so it will not).

### 5.4 CSS: the More popover

```css
.prop-more {
  position: fixed; inset: auto; margin: 0;
  min-inline-size: 190px; padding: 4px;
  border: 1px solid var(--cc-hair); border-radius: 12px;
  background: var(--cc-sheet); color: var(--cc-ink); box-shadow: var(--cc-lift);
}
.prop-more:popover-open { display: grid; }
.prop-more-actions { display: grid; }
.prop-more-actions[hidden] { display: none; }
.prop-more-item {
  display: flex; align-items: center; gap: 10px;
  block-size: 32px; padding-inline: 10px;
  border: 0; border-radius: 8px; background: none;
  font: var(--cc-font-control); color: var(--cc-ink); text-align: start; cursor: pointer;
}
.prop-more-item:hover, .prop-more-item:focus-visible { background: var(--cc-well); outline: none; }
.prop-more-item[aria-pressed="true"] { font-weight: 600; }
.prop-more-item[hidden] { display: none; }
.prop-more-danger { color: var(--cc-redline); }
.prop-more hr { border: 0; border-block-start: 1px solid var(--cc-hair); margin: 4px 6px; }
```

Positioning (add to `inspector.ts`, run once at module start):

```ts
const morePopover = document.getElementById('prop-more-popover') as HTMLElement;
morePopover.addEventListener('toggle', () => {
  const trigger = document.getElementById('btn-prop-more');
  const open = morePopover.matches(':popover-open');
  trigger?.setAttribute('aria-expanded', String(open));
  if (!open || !trigger) return;
  const r = trigger.getBoundingClientRect();
  morePopover.style.top = `${r.bottom + 4}px`;
  morePopover.style.left = `${Math.max(8, r.right - morePopover.offsetWidth)}px`;
});
morePopover.addEventListener('click', (e) => {
  if ((e.target as HTMLElement).closest('button')) morePopover.hidePopover();
});
```

The trigger button (section 6) carries `popovertarget="prop-more-popover"`, so the browser opens it, closes it on Esc and on an outside click, and returns focus. Do not write that logic yourself.

`#prop-selection-actions` is hidden by existing code when nothing is selected, which leaves only "Keep open" in the popover. That is correct.

### 5.5 Fit leaves room for the card

The card now covers the right 318 px of the sheet. Fit must not put the diagram under it.

In `src/studio/state.ts`, add this helper above `fitToViewport`:

```ts
/** Width the open properties card covers on the right, so Fit can keep the diagram clear of it. */
function inspectorInset(): number {
  const card = document.getElementById('inspector-panel');
  if (!card || card.offsetParent === null) return 0;                 // closed
  if (window.matchMedia('(max-width: 56rem)').matches) return 0;      // bottom sheet, section 10
  const view = viewport.getBoundingClientRect();
  return Math.max(0, view.right - card.getBoundingClientRect().left + 14);
}
```

In `fitToViewport`, change `frameDocumentInViewport(rect.width, rect.height, app.doc)` to `frameDocumentInViewport(rect.width - inspectorInset(), rect.height, app.doc)`. In `fitSelection`, change `frameRectInViewport(rect.width, rect.height, bounds)` to `frameRectInViewport(rect.width - inspectorInset(), rect.height, bounds)`. Nothing else in those functions changes: the returned pan already centres the diagram in the width you pass, which is now the part of the sheet left of the card.

Do not refit when the card opens or closes. Only the Fit button and its shortcuts call these.

---

## 6. The header

Every selection type gets the same header. It is built by one new function in `inspector.ts` that replaces `makeSelectionHeader` (line 845).

```
┌──────────────────────────────────────────┐
│ ┌────┐  Name field (16/600)        ⋯  ✕ │
│ │ art│  Kind (12, ink-3)                 │
│ └────┘                                   │
└──────────────────────────────────────────┘
```

### 6.1 Function

```ts
interface CardHeader {
  /** SVG markup for the 44×36 tile. */
  art: string;
  /** CSS colour for the tile, e.g. TONE_CSS[tone][0]. Omit for a neutral tile. */
  tone?: string;
  /** The name control: an <input> that already has its handlers, or a text node for multi-select. */
  name: HTMLElement;
  /** The line under the name: a <select> (component kind) or plain text. */
  under: HTMLSelectElement | string;
}

function makeCardHeader(h: CardHeader): HTMLElement
```

It returns:

```html
<div class="prop-head" style="--t: {tone}">            <!-- no style attribute when tone is omitted -->
  <span class="prop-head-art" aria-hidden="true">{art}</span>
  <div class="prop-head-text">
    {name}                                              <!-- gets class "prop-head-name" added -->
    <!-- when under is a string: -->
    <span class="prop-head-kind">{under}</span>
    <!-- when under is a select: -->
    <span class="prop-head-kind prop-head-kind--pick">
      <span class="prop-head-kind-text">{text of the selected option}</span>
      {the select}                                      <!-- invisible, stretched over the span -->
    </span>
  </div>
  <div class="prop-head-buttons">
    <button type="button" class="prop-icon-btn" id="btn-prop-more" popovertarget="prop-more-popover"
            aria-label="More actions" aria-expanded="false" data-tip="More">{⋯ icon}</button>
    <button type="button" class="prop-icon-btn" id="btn-collapse-inspector"
            aria-label="Close properties (])" data-tip="Close (])">{✕ icon}</button>
  </div>
</div>
```

- Icons come from `createUiIconSvg` in `src/ui/icons.ts`. If there is no "more" (three dots) or "close" (cross) icon in that file, add them there in the file's own format (24 px box, 1.6 px stroke, round caps, no fill): three `<circle r="1.2">` at x = 5, 12, 19, y = 12; and `<path d="M6 6l12 12M18 6 6 18"/>`.
- When `under` is a select, add a `change` listener that copies the selected option's text into `.prop-head-kind-text`. (The select's own handler re-renders the card anyway; this keeps it right if a future handler does not.)
- Give the name input `aria-label` equal to its old label ("Name", "Wire label", and so on), because it no longer has a visible `<label>`.

### 6.2 CSS

```css
.prop-head { display: grid; grid-template-columns: 44px minmax(0, 1fr) auto; gap: 10px; align-items: center; padding: 12px 8px 10px 14px; flex: none; }
.prop-head-art { inline-size: 44px; block-size: 36px; border-radius: 10px; display: grid; place-items: center;
  background: var(--cc-well); border: 1px solid var(--cc-hair); }
.prop-head[style*="--t"] .prop-head-art {
  background: color-mix(in oklab, var(--t) 13%, var(--cc-sheet));
  border-color: color-mix(in oklab, var(--t) 36%, var(--cc-sheet)); }
.prop-head-art svg { inline-size: 30px; block-size: 24px; overflow: visible; stroke: var(--cc-ink-2); }
.prop-head[style*="--t"] .prop-head-art svg { stroke: var(--t); }
.prop-head-text { min-inline-size: 0; display: grid; }
.prop-head-name { inline-size: 100%; min-inline-size: 0; border: 0; background: none; padding: 1px 4px; margin-inline-start: -4px;
  border-radius: 6px; font: var(--cc-font-panel); color: var(--cc-ink); text-overflow: ellipsis; box-shadow: none; block-size: auto; }
input.prop-head-name:hover { background: var(--cc-well); }
input.prop-head-name:focus { background: var(--cc-well); outline: none; box-shadow: inset 0 0 0 1.5px var(--cc-ink); }
.prop-head-kind { justify-self: start; max-inline-size: 100%; font: var(--cc-font-small); color: var(--cc-ink-3);
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.prop-head-kind--pick { position: relative; display: inline-flex; align-items: center; gap: 7px; padding-inline: 4px 6px; margin-inline-start: -4px; border-radius: 5px; overflow: visible; }
.prop-head-kind--pick::after { content: ""; inline-size: 5px; block-size: 5px; margin-block-start: -3px; flex: none;
  border: solid var(--cc-ink-3); border-width: 0 1.5px 1.5px 0; transform: rotate(45deg); }
.prop-head-kind--pick:hover { background: var(--cc-well); color: var(--cc-ink); }
.prop-head-kind--pick:focus-within { outline: 2px solid var(--cc-ink); outline-offset: 1px; }
.prop-head-kind--pick select { position: absolute; inset: 0; inline-size: 100%; block-size: 100%; opacity: 0; cursor: pointer; }
.prop-head-kind-text { overflow: hidden; text-overflow: ellipsis; }
.prop-head-buttons { display: flex; align-self: start; }
.prop-icon-btn { inline-size: 28px; block-size: 28px; border: 0; border-radius: 8px; background: none; color: var(--cc-ink-2); display: grid; place-items: center; cursor: pointer; }
.prop-icon-btn:hover, .prop-icon-btn[aria-expanded="true"] { background: var(--cc-well); color: var(--cc-ink); }
@media (pointer: coarse) { .prop-icon-btn { inline-size: 44px; block-size: 44px; } }
```

Delete the old `.prop-selection-head`, `.prop-selection-art`, `.prop-selection-text`, `.prop-selection-name`, `.prop-selection-kind` rules (in `unlayered.css` near line 1898). The class names `prop-selection-head` and `prop-selection-name` appear in tests; section 11 says how to update them.

### 6.3 What each selection puts in the header

| Selection (`sel.type`) | `art` | `tone` | `name` | `under` |
|---|---|---|---|---|
| `node` | `renderCutoutMarkup({ kind: node.kind, icon: node.icon ?? stencil?.icon, shape: node.shape, queue: node.queue })` | `TONE_CSS[node.accent ?? stencil?.accent ?? 'slate']?.[0]` (as today) | the existing `#prop-node-title` input | the existing `#prop-node-kind` select |
| `edge` | `<svg viewBox="0 0 38 30" fill="none" stroke-width="1.75" stroke-linecap="round"><path d="M3 15H35"/></svg>`; add `stroke-dasharray="6 5"` to the path when the wire's call style is async | the wire's tone, same lookup | the existing `#prop-edge-label` input, with `placeholder="Unlabelled wire"` | `"Wire"` |
| `zone` | `<svg viewBox="0 0 38 30" fill="none" stroke-width="1.4"><path d="M8 3v24M30 3v24"/><path d="M12 8h10" /></svg>` | none | the existing `#prop-zone-title` input | `"Swimlane"` |
| `frame` | `<svg viewBox="0 0 38 30" fill="none" stroke-width="1.4" stroke-dasharray="4 3"><rect x="4" y="5" width="30" height="20" rx="4"/></svg>` | none | the existing `#prop-frame-title` input | `"Frame"` |
| `notes` | `<svg viewBox="0 0 38 30" fill="none" stroke-width="1.4" stroke-linejoin="round"><path d="M8 3h16l6 6v18H8z"/><path d="M24 3v6h6"/></svg>` | none | the existing `#prop-notes-title` input | `"Note"` |
| `multi` | `<svg viewBox="0 0 38 30" fill="none" stroke-width="1.4"><rect x="5" y="4" width="20" height="14" rx="3"/><rect x="13" y="12" width="20" height="14" rx="3"/></svg>` | none | a `<span>` with the counts, for example "3 components, 2 wires" (reuse the `counts.join(', ')` already computed for the old heading) | `"Selection"` |
| `none` (document) | `<svg viewBox="0 0 38 30" fill="none" stroke-width="1.4"><rect x="5" y="3" width="28" height="24" rx="3"/><path d="M5 21h28M23 21v6"/></svg>` | none | the existing `#prop-doc-title` input | `"Document"` |

In each case "the existing input" means: build it exactly as the code does now (same `makeTextInput(...)` call, same callback), but **do not wrap it in `makeField`**. Set its `id` yourself, set its `aria-label`, and pass it to `makeCardHeader`. Remove the old field for it from the form so it is not rendered twice.

`#prop-panel-heading` keeps receiving the same text as today (it is now visually hidden and names the card for screen readers). Change only the multi-select text from `` `MULTI-SELECT (${…})` `` to `` `Selection (${…})` ``.

### 6.4 Assembly

For every selection type, `#prop-form-container` ends up with these children, in this order:

1. the header (`.prop-head`);
2. for a component only: the tab strip (`.prop-tablist`), as built by `makeInspectorTabs`;
3. the body: one element with class `prop-body` that scrolls.

For a component, each tab panel (`.prop-tabpanel`) gets the class `prop-body` too. For other selection types, wrap the form's fields in one `<div class="prop-body">`.

```css
.prop-form { display: flex; flex-direction: column; min-block-size: 0; }
.prop-tabs { display: flex; flex-direction: column; min-block-size: 0; }
.prop-tablist { display: flex; gap: 2px; margin-inline: 12px; padding: 3px; border-radius: 10px; background: var(--cc-well); flex: none; }
.prop-tab { flex: 1; block-size: 26px; border: 0; border-radius: 7px; background: none; font: 500 12.5px/1 var(--cc-font-sans); color: var(--cc-ink-2); cursor: pointer; }
.prop-tab[aria-selected="true"] { background: var(--cc-sheet); color: var(--cc-ink); box-shadow: var(--cc-contact); }
.prop-body { display: flex; flex-direction: column; gap: 6px; padding: 12px 14px 14px; min-block-size: 0; overflow-y: auto; overscroll-behavior: contain; scrollbar-width: thin; }
.prop-head + .prop-body { padding-block-start: 2px; }   /* no tabs: sit closer to the header */
.prop-tabpanel[hidden] { display: none; }
```

`makeInspectorTabs` keeps its ids (`prop-tab-look`, `prop-panel-look`, and so on), roles and arrow-key handling. Only its CSS changes.

**Keep focus and scroll across re-renders.** `renderPropertyEditor` rebuilds the card. At its very top, before `propFormContainer.replaceChildren()`, record `const keepFocusId = document.activeElement?.id` and `const keepScroll = propFormContainer.querySelector('.prop-body:not([hidden])')?.scrollTop ?? 0`. At its very end, if the selection is the same one as on the previous render (compare `sel.type` and `sel.id` with values saved in module variables), restore both: `document.getElementById(keepFocusId)?.focus({ preventScroll: true })` and set `scrollTop`. Without this, clicking a colour dot or a shape scrolls the card back to the top.

---

## 7. Rows and controls

### 7.1 One function decides the row: `makeField`

Replace the body of `makeField` (line 148) with the following. Its signature gains one optional parameter; every existing call keeps working.

```ts
export type FieldLayout = 'row' | 'block' | 'switch';

export function makeField(
  id: string,
  labelText: string,
  control: HTMLElement,
  layout?: FieldLayout,
): HTMLElement {
  const isCheckbox = control instanceof HTMLInputElement && control.type === 'checkbox';
  const kind: FieldLayout =
    layout ?? (control instanceof HTMLTextAreaElement ? 'block' : isCheckbox ? 'switch' : 'row');

  const wrap = document.createElement('div');
  wrap.className = `prop-field prop-field--${kind}`;
  const lbl = document.createElement('label');
  lbl.htmlFor = id;
  lbl.textContent = labelText;
  control.id = id;

  let shown: HTMLElement = control;
  if (control instanceof HTMLSelectElement) {
    shown = document.createElement('span');
    shown.className = 'select-wrap';
    shown.appendChild(control);
  } else if (isCheckbox) {
    control.classList.add('switch');
    control.setAttribute('role', 'switch');
  } else if (control instanceof HTMLInputElement && control.type === 'number' && control.dataset.stepper === 'true') {
    shown = makeStepper(control);
  }
  wrap.append(lbl, shown);
  return wrap;
}
```

The three layouts:

| Layout | Looks like | Used for |
|---|---|---|
| `row` (default) | label left in an 84 px column, control right | text inputs, selects, steppers, colour dots, pickers |
| `block` | label on its own line, control full width under it | textareas (automatic), the shape picker, links, any control wider than 190 px |
| `switch` | label left taking all the space, switch at the right edge | checkboxes (automatic) |

```css
.prop-field { display: grid; align-items: center; gap: 6px 10px; min-inline-size: 0; }
.prop-field--row { grid-template-columns: 84px minmax(0, 1fr); min-block-size: 30px; }
.prop-field--block { grid-template-columns: minmax(0, 1fr); }
.prop-field--switch { grid-template-columns: minmax(0, 1fr) auto; min-block-size: 30px; }
.prop-field > label, .prop-field > .field-label { font: 400 12.5px/16px var(--cc-font-sans); color: var(--cc-ink-2); }
```

Fields that are built by hand today with `document.createElement('div')` + `className = 'prop-field'` + a `<span class="field-label">` (the colour pickers, the links block) get the class `prop-field--row` or `prop-field--block` added as section 8 says.

Delete the old `.prop-field`, `.prop-field label`, `.prop-field-check`, `.prop-row-2` and `.checkbox-inline` rules. Remove the lines that add `prop-field-check` in `inspector.ts` (three places: breaker, external, limiter fail-open). Where the code builds a `.prop-row-2` wrapper to put two fields side by side (icon; eyebrow and chip), remove the wrapper and append the fields directly, one per row.

### 7.2 Ruled field (text, number, textarea, select)

The class `field` already marks every text input, textarea and select. Replace its rule (in `components.css`, the block starting `.field {`) **only as it applies inside the card**, by adding these in `inspector.css`:

```css
.inspector .field {
  inline-size: 100%; min-inline-size: 0; block-size: 30px;
  border: 0; border-radius: 8px; padding-inline: 10px;
  background: var(--cc-well);
  box-shadow: inset 0 -1px 0 var(--cc-field-edge);   /* the ruled line: 3:1 against the card */
  font: var(--cc-font-control); color: var(--cc-ink);
}
.inspector .field::placeholder { color: var(--cc-ink-3); font-weight: 400; }
.inspector .field:hover { background: var(--cc-well-2); }
.inspector .field:focus { outline: none; background: var(--cc-sheet); box-shadow: inset 0 0 0 1.5px var(--cc-ink); }
.inspector textarea.field { block-size: auto; min-block-size: 66px; padding-block: 6px; resize: vertical; line-height: 18px; font-weight: 400; display: block; }
.inspector textarea.field-code { font: 400 11.5px/17px var(--cc-font-mono); min-block-size: 84px; }
```

`.field` is also used in dialogs outside the card. Do not change those; that is why the selectors start with `.inspector`.

The sample-payload textarea (`.field-code`) is no longer a black box. It is a well like every other field.

### 7.3 Select

```css
.select-wrap { position: relative; display: block; min-inline-size: 0; }
.select-wrap > select.field { appearance: none; padding-inline-end: 26px; cursor: pointer; text-overflow: ellipsis; }
.select-wrap::after { content: ""; position: absolute; inset-inline-end: 11px; inset-block-start: 11px; inline-size: 6px; block-size: 6px;
  border: solid var(--cc-ink-3); border-width: 0 1.5px 1.5px 0; transform: rotate(45deg); pointer-events: none; }

/* Browsers that can style the open list (Chromium 135+) get a list that matches the card. Others keep the system list. */
@supports (appearance: base-select) {
  .select-wrap > select.field, .select-wrap > select.field::picker(select) { appearance: base-select; }
  .select-wrap > select.field { display: flex; align-items: center; }
  .select-wrap > select.field::picker-icon { display: none; }
  .select-wrap > select.field::picker(select) { margin-block-start: 4px; padding: 4px; border: 1px solid var(--cc-hair); border-radius: 12px;
    background: var(--cc-sheet); color: var(--cc-ink); box-shadow: var(--cc-lift); font: var(--cc-font-body); }
  .select-wrap > select.field option { min-block-size: 30px; padding-inline: 10px; border-radius: 8px; display: flex; align-items: center; gap: 10px; }
  .select-wrap > select.field option:hover, .select-wrap > select.field option:focus-visible { background: var(--cc-well); outline: none; }
  .select-wrap > select.field option:checked { font-weight: 600; background: none; }
  .select-wrap > select.field option::checkmark { order: 1; margin-inline-start: auto; color: var(--cc-ink-2); }
}
```

Selects that are created outside `makeField` (for example the link-kind select and the note item icon select) must be wrapped by hand: `const w = document.createElement('span'); w.className = 'select-wrap'; w.appendChild(select);` and append `w` where the select was appended.

**Status dot.** The Status select shows a 7 px dot in the status colour. After building the field: `wrap.querySelector('.select-wrap')!.classList.add('select-wrap--dot')` and set `style.setProperty('--dot', colour)` where colour is: `live` → `var(--cc-emerald)`, `planned` → `var(--cc-blue)`, `at-risk` → `var(--cc-amber)`, `deprecated` → `var(--cc-rose)`, none → `var(--cc-hair-2)`. Update it in the select's `change` listener too.

```css
.select-wrap--dot > select.field { padding-inline-start: 26px; }
.select-wrap--dot::before { content: ""; position: absolute; inset-inline-start: 11px; inset-block-start: 11.5px; inline-size: 7px; block-size: 7px; border-radius: 50%; background: var(--dot); z-index: 1; pointer-events: none; }
```

### 7.4 Stepper

For whole-number counts. It wraps the existing `<input type="number">`; the input keeps its id, its `min`/`max` and its `change` handler.

```ts
function makeStepper(input: HTMLInputElement): HTMLElement {
  const wrap = document.createElement('div');
  wrap.className = 'stepper';
  input.classList.remove('field');
  const button = (label: string, icon: 'minus' | 'plus', delta: 1 | -1) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.setAttribute('aria-label', label);
    b.appendChild(createUiIconSvg(icon));        // add 'minus' (M5 12h14) and 'plus' (M12 5v14M5 12h14) to icons.ts if missing
    b.addEventListener('click', () => {
      if (input.value.trim() === '') input.value = input.placeholder || input.min || '0';
      if (delta === 1) input.stepUp(); else input.stepDown();
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
    });
    return b;
  };
  wrap.append(button('One fewer', 'minus', -1), input, button('One more', 'plus', 1));
  return wrap;
}
```

Check how `createUiIconSvg` is called elsewhere in `inspector.ts` and match its real signature and return type (element or string).

To make a number input a stepper, set `input.dataset.stepper = 'true'` **before** passing it to `makeField`. Do this for exactly these: `#prop-node-replicas`, `#prop-node-queue-partitions`, `#prop-node-cache-hitrate`, `#prop-node-limiter-admit`, `#prop-node-limiter-per`. Do **not** do it for `#prop-node-queue-depth` (it is usually empty, meaning unbounded) or `#prop-edge-latency`.

```css
.stepper { display: grid; grid-template-columns: 30px minmax(0, 1fr) 30px; block-size: 30px; border-radius: 8px; background: var(--cc-well); box-shadow: inset 0 -1px 0 var(--cc-field-edge); }
.stepper button { border: 0; background: none; color: var(--cc-ink-2); border-radius: 8px; display: grid; place-items: center; cursor: pointer; }
.stepper button:hover { background: var(--cc-well-2); color: var(--cc-ink); }
.stepper input { border: 0; background: none; min-inline-size: 0; text-align: center; font: var(--cc-font-control); font-variant-numeric: tabular-nums; color: var(--cc-ink); appearance: textfield; }
.stepper input::-webkit-inner-spin-button { -webkit-appearance: none; }
.stepper input:focus { outline: none; background: var(--cc-sheet); border-radius: 6px; box-shadow: inset 0 0 0 1.5px var(--cc-ink); }
```

A unit after a control ("%", "ms"): wrap the control and a `<span class="prop-unit">` in `<div class="with-unit">` and pass the wrapper to `makeField` with the input's id set by hand first. Used for hit rate (`%`) and latency (`ms`); drop the unit from the label text.

```css
.with-unit { display: grid; grid-template-columns: minmax(0, 1fr) auto; align-items: center; gap: 8px; }
.prop-unit { font: var(--cc-font-small); color: var(--cc-ink-3); }
```

Because `makeField` sets `control.id = id` on whatever it is given, for a `.with-unit` wrapper call it like this: build the field with the bare input first (`const f = makeField(id, label, input)`), then move the shown control into a `.with-unit` wrapper: `const shown = f.lastElementChild!; const u = document.createElement('div'); u.className = 'with-unit'; shown.replaceWith(u); u.append(shown, unitSpan);`.

### 7.5 Switch

`makeField` adds the class and the role. CSS:

```css
.switch { appearance: none; inline-size: 34px; block-size: 20px; margin: 0; border-radius: 10px; background: var(--cc-field-edge); position: relative; cursor: pointer; transition: background var(--cc-dur-fast); }
.switch::after { content: ""; position: absolute; inset-inline-start: 2px; inset-block-start: 2px; inline-size: 16px; block-size: 16px; border-radius: 50%; background: var(--cc-sheet); box-shadow: var(--cc-contact); transition: translate var(--cc-dur-base) var(--cc-spring); }
.switch:checked { background: var(--cc-ink); }
.switch:checked::after { translate: 14px 0; background: var(--cc-on-ink); }
.switch:focus-visible { outline: 2px solid var(--cc-ink); outline-offset: 2px; }
@media (pointer: coarse) { .switch { inline-size: 44px; block-size: 26px; border-radius: 13px; } .switch::after { inline-size: 22px; block-size: 22px; } .switch:checked::after { translate: 18px 0; } }
```

### 7.6 Colour dots

`makeTonePicker` (line 594) already builds a `<fieldset class="swatch-picker">` of radio inputs. Keep the function. Change only:

- the legend text from `'Accent Colour'` to `'Colour'`;
- the CSS:

```css
.swatch-picker { display: flex; flex-wrap: wrap; gap: 7px; min-block-size: 30px; align-items: center; border: 0; padding: 0; margin: 0; min-inline-size: 0; }
.swatch-option { display: grid; place-items: center; cursor: pointer; }
.swatch-option .pill-swatch { inline-size: 18px; block-size: 18px; border-radius: 50%; display: block; }
.swatch-option:has(input:checked) .pill-swatch { box-shadow: 0 0 0 2px var(--cc-sheet), 0 0 0 3.5px var(--cc-ink); }
.swatch-option:has(input:focus-visible) .pill-swatch { outline: 2px solid var(--cc-ink); outline-offset: 4px; }
@media (pointer: coarse) { .swatch-picker { gap: 4px; } .swatch-option { inline-size: 32px; block-size: 32px; } }
```

If the picker has more dots than fit on one line at 190 px, it wraps to a second line. That is fine.

### 7.7 Shape picker (new)

Replaces the Shape `<select>` for components. A row of the kind's real outlines; the chosen one is filled in the component's colour.

Replace the `shapeSelect` block (the code between `const shapeSelect = document.createElement('select')` and `appearanceElements.push(makeField('prop-node-shape', 'Shape', shapeSelect))`) with:

```ts
const shapeOptions = NODE_SHAPES.filter(
  (shape) => !(shape === 'trapezoid' && node.kind === 'balancer') && !(shape === 'bucket' && node.kind !== 'store'),
);
const shapeLabel = (shape: NodeShape): string =>
  shape === 'card' && node.kind === 'store' ? 'Cylinder'
  : shape === 'card' && node.kind === 'queue' ? 'Pipe'
  : shape === 'card' && node.kind === 'balancer' ? 'Trapezoid'
  : shape === 'asymmetric' ? 'Flag'
  : NODE_SHAPE_LABELS[shape];
const currentShape: NodeShape = node.kind === 'balancer' && node.shape === 'trapezoid' ? 'card' : node.shape || 'card';

const shapeField = document.createElement('div');
shapeField.className = 'prop-field prop-field--block';
const shapeHead = document.createElement('div');
shapeHead.className = 'prop-field-head';
const shapeTitle = document.createElement('span');
shapeTitle.className = 'field-label';
shapeTitle.id = 'prop-node-shape-label';
shapeTitle.textContent = 'Shape';
const shapeNow = document.createElement('span');
shapeNow.className = 'prop-field-value';
shapeNow.textContent = shapeLabel(currentShape);
shapeHead.append(shapeTitle, shapeNow);

const shapeGroup = document.createElement('div');
shapeGroup.className = 'shape-picker';
shapeGroup.id = 'prop-node-shape';
shapeGroup.setAttribute('role', 'radiogroup');
shapeGroup.setAttribute('aria-labelledby', 'prop-node-shape-label');
shapeGroup.style.gridTemplateColumns = `repeat(${shapeOptions.length}, minmax(0, 1fr))`;
for (const shape of shapeOptions) {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'shape-option';
  b.dataset.shape = shape;
  b.setAttribute('role', 'radio');
  b.setAttribute('aria-checked', String(shape === currentShape));
  b.setAttribute('aria-label', shapeLabel(shape));
  b.setAttribute('data-tip', shapeLabel(shape));
  b.tabIndex = shape === currentShape ? 0 : -1;
  b.innerHTML = renderCutoutMarkup({ kind: node.kind, shape: shape === 'card' ? undefined : shape, queue: node.queue });
  b.addEventListener('click', () => {
    // The body of the old select's change handler, with `shape` in place of `shapeSelect.value`:
    pushHistory();
    if (shape === 'card') delete node.shape;
    else node.shape = shape;
    const frame = nodeShapeFrame(getNodeDimensions(node.kind), node.shape);
    node.width = frame.width;
    node.height = frame.height;
    renderAll(false);
  });
  shapeGroup.appendChild(b);
}
shapeGroup.addEventListener('keydown', (e) => {
  const step = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0;
  if (!step) return;
  e.preventDefault();
  const all = [...shapeGroup.querySelectorAll<HTMLButtonElement>('.shape-option')];
  const next = all[(all.indexOf(document.activeElement as HTMLButtonElement) + step + all.length) % all.length];
  next.focus();
  next.click();
});
shapeField.append(shapeHead, shapeGroup);
appearanceElements.push(shapeField);
```

After `renderAll(false)` the card re-renders, so the checked state and the header art update by themselves. Because of the focus rule in 6.4, give each shape button an id (`b.id = \`prop-node-shape-${shape}\``) so focus returns to it.

`NODE_SHAPE_LABELS.asymmetric` in `src/core/nodeStyle.ts` stays "Asymmetric (Banner)" (exports and other code may read it); the card says "Flag".

```css
.prop-field-head { display: flex; justify-content: space-between; align-items: center; min-block-size: 24px; }
.prop-field-value { font: var(--cc-font-small); color: var(--cc-ink-3); }
.shape-picker { display: grid; gap: 2px; padding: 3px; border-radius: 10px; background: var(--cc-well); }
.shape-option { block-size: 30px; border: 0; border-radius: 7px; background: none; display: grid; place-items: center; cursor: pointer; }
.shape-option svg { inline-size: 24px; block-size: 19px; }
.shape-option .cutout-icon { display: none; }                      /* outline only, no kind mark at this size */
.shape-option:hover svg { stroke: var(--cc-ink); }
.shape-option[aria-checked="true"] { background: var(--cc-sheet); box-shadow: var(--cc-contact); }
.shape-option[aria-checked="true"] svg { stroke: var(--t); fill: color-mix(in oklab, var(--t) 13%, var(--cc-sheet)); }
@media (pointer: coarse) { .shape-option { block-size: 44px; } }
```

`--t` must be set on the tab panel or `.prop-body` for a component: `body.style.setProperty('--t', tone)` using the same tone value the header uses.

### 7.8 Icon picker and custom image

`makeIconPicker` (line 664) keeps its behaviour. Restyle its trigger (`.icon-picker-trigger`) as a ruled field with the icon, the icon's name and a chevron, 30 px tall; restyle its menu (`.icon-picker-menu`) as a popover surface: `background: var(--cc-sheet); border: 1px solid var(--cc-hair); border-radius: 12px; box-shadow: var(--cc-lift); padding: 4px;` with 34 px square options, the chosen one ink-filled (`background: var(--cc-ink); color: var(--cc-on-ink)`).

The custom-icon **drop zone is removed** as a big dashed box. In its place, on the same row as the icon picker:

- No custom image set: a quiet button "Upload" (`.prop-quiet-btn`, upload icon + text) that clicks the existing hidden `fileInput`.
- Custom image set: a 22 px thumbnail of the image, then a quiet button "Remove" that runs the existing remove handler.

The row is: `makeField('prop-node-icon', 'Icon', iconRow)` where `iconRow` is `<div class="icon-row">` holding the icon picker and the button. (Keep the existing lines that move the id onto the picker's trigger button.) The hidden `fileInput`, its `change` handler, the size check and the hint paragraph (`iconHint`, shown only when a file is rejected) stay exactly as they are; append `fileInput` and `iconHint` after the row. Keep drag-and-drop: move the existing `dragover`/`drop` listeners from the old `uploadZone` element onto `iconRow`.

```css
.icon-row { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 6px; align-items: center; }
.icon-row img { inline-size: 22px; block-size: 22px; border-radius: 5px; object-fit: contain; }
.prop-quiet-btn { block-size: 30px; padding-inline: 10px; border: 0; border-radius: 8px; background: none; display: inline-flex; align-items: center; gap: 6px; font: var(--cc-font-control); color: var(--cc-ink-2); cursor: pointer; }
.prop-quiet-btn:hover { background: var(--cc-well); color: var(--cc-ink); }
```

`.prop-quiet-btn` is the only button style inside the card body. Every `btn btn-compact` created inside `renderPropertyEditor` (Add, Remove, Add link, Add item, Reverse, Use default colour, Remove logo, and the multi-select buttons) changes its class to `prop-quiet-btn`. No bordered buttons in the card.

### 7.9 Group heading and dividers

`fieldGroup(title)` (line 390) keeps its signature. Make it return `<div class="prop-group">Title</div>`:

```css
.prop-group { margin-block-start: 8px; padding-block-start: 10px; border-block-start: 1px solid var(--cc-hair); font: 600 12.5px/16px var(--cc-font-sans); color: var(--cc-ink); }
.prop-divider { margin-block-start: 8px; padding-block-start: 8px; border-block-start: 1px solid var(--cc-hair); display: grid; gap: 6px; }
.prop-list-header { display: flex; justify-content: space-between; align-items: center; min-block-size: 24px; }
.prop-list-header .section-heading { font: 600 12.5px/16px var(--cc-font-sans); color: var(--cc-ink); text-transform: none; letter-spacing: 0; }
.prop-hint { font: var(--cc-font-small); color: var(--cc-ink-3); margin: 0; }
```

Every other in-form heading that is created by hand with a `section-heading` or `field-label` class and then used as a section title (`'Wire fields'`, `'Selection members'`, `'Align & distribute'`, `'Colour legend'`, `'Exported page'`, `'Items'`, `'Metrics'`) uses `fieldGroup(...)` or `.prop-list-header` so they all look the same. Delete the heading `'Wire fields'` entirely; the header already says "Wire".

### 7.10 Metrics rows

The metrics editor keeps its DOM (`.kv-row` with a name input, a value input, a delete button). Changes:

- Header: "Metrics" on the left, a quiet button on the right with a plus icon and the text "Add" (was `+ Add`).
- The delete button becomes a `.prop-icon-btn` 26 px square with the close icon and `aria-label="Remove metric"` (was the character `×`).
- Give both inputs `placeholder` ("Name", "Value") and `aria-label` ("Metric name", "Metric value").

```css
.kv-row { display: grid; grid-template-columns: minmax(0, 1fr) 76px 26px; gap: 6px; align-items: center; }
.kv-row .field:nth-child(2) { font-family: var(--cc-font-mono); font-size: 12px; text-align: end; }
.kv-row .prop-icon-btn { inline-size: 26px; block-size: 26px; }
```

Apply the same three changes to the note's item rows (`.notes-item-editor`): quiet "Add" button, icon delete button with `aria-label="Remove item"`.

### 7.11 Sample payload

Wrap the payload textarea in a disclosure, closed when empty:

```ts
telemetryElements.push(
  makeCollapsibleSection('payload', 'Sample payload', Boolean(node.code), [ /* the #prop-node-code textarea, without makeField */ ]),
);
```

Give the textarea `id = 'prop-node-code'` and `aria-label = 'Sample payload'` by hand. `makeCollapsibleSection` (line 770) remembers open/closed in `localStorage`; keep that.

```css
.prop-section-details { margin-block-start: 8px; padding-block-start: 6px; border-block-start: 1px solid var(--cc-hair); }
.prop-section-summary { list-style: none; cursor: pointer; display: flex; align-items: center; gap: 8px; block-size: 28px; border-radius: 6px; font: 600 12.5px/16px var(--cc-font-sans); color: var(--cc-ink); }
.prop-section-summary::-webkit-details-marker { display: none; }
.prop-section-summary::before { content: ""; inline-size: 5px; block-size: 5px; margin-inline-start: 2px; border: solid var(--cc-ink-3); border-width: 0 1.5px 1.5px 0; transform: rotate(-45deg); transition: transform var(--cc-dur-fast); }
.prop-section-details[open] > .prop-section-summary::before { transform: rotate(45deg); }
.prop-section-content { display: grid; gap: 6px; padding-block-start: 4px; }
```

Delete the old `.prop-section-*` rules in `unlayered.css` (lines 189 to 240).

### 7.12 Links

`makeLinksEditor` (line 497) keeps its logic and its DOM pieces: `.prop-link-openers` (the clickable `a.prop-link-open` list), `.prop-link-rows` (one `.prop-link-row` per link with a kind select, a label input, a URL input, a remove button), the hint, and `#prop-node-link-add`.

Layout changes only:

- The block header is "Links" on the left and the `#prop-node-link-add` button on the right, restyled as a quiet button with a plus icon and the text "Add link".
- Each `.prop-link-row` is a two-line group on a well:
  ```
  ┌──────────────────────────────────────┐
  │ [Runbook ⌄]  [Edge runbook        ]  │   line 1: kind select (96 px) + label input
  │ [https://…                      ] ✕  │   line 2: URL input + remove icon button
  └──────────────────────────────────────┘
  ```
- The remove button becomes a `.prop-icon-btn` with the close icon and `aria-label="Remove link"`.
- `.prop-link-openers` shows each link as one line: the label as a link, underlined in `--cc-hair-2`. Hide it when it is empty.

```css
.prop-links { display: grid; gap: 6px; }
.prop-link-openers { display: flex; flex-wrap: wrap; gap: 4px 12px; }
.prop-link-openers:empty { display: none; }
.prop-link-open { font: var(--cc-font-control); color: var(--cc-ink); text-decoration: underline; text-decoration-color: var(--cc-hair-2); text-underline-offset: 3px; }
.prop-link-rows { display: grid; gap: 6px; }
.prop-link-row { display: grid; grid-template-columns: 96px minmax(0, 1fr) 26px; gap: 6px; padding: 6px; border-radius: 10px; background: var(--cc-well); align-items: center; }
.prop-link-row > :nth-child(2) { grid-column: 2 / -1; }      /* label input spans to the edge on line 1 */
.prop-link-row > :nth-child(3) { grid-column: 1 / 3; }       /* URL input on line 2 */
.prop-link-row .field { background: var(--cc-sheet); }
```

The `:nth-child` numbers assume the row's children are, in order: kind select (wrapped in `.select-wrap`), label input, URL input, remove button. Check the order in the code and adjust the numbers if it differs.

### 7.13 Segmented radios (wire route and flow)

The wire's "Routing Style" and "Flow Direction" controls are fieldsets of radio inputs (`.route-style-fieldset`, `.route-style-grid`, `.route-style-option`). Keep the inputs and their handlers. Restyle each as a 2 × 2 grid of compact options on a well; the chosen option is a `--cc-sheet` chip with the contact shadow:

```css
.route-style-fieldset { border: 0; padding: 0; margin: 0; min-inline-size: 0; display: grid; gap: 6px; }
.route-style-fieldset > legend { padding: 0; font: 400 12.5px/16px var(--cc-font-sans); color: var(--cc-ink-2); }
.route-style-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 2px; padding: 3px; border-radius: 10px; background: var(--cc-well); }
.route-style-option { display: flex; align-items: center; gap: 6px; block-size: 28px; padding-inline: 8px; border-radius: 7px; font: 500 12.5px/1 var(--cc-font-sans); color: var(--cc-ink-2); cursor: pointer; }
.route-style-option:has(input:checked) { background: var(--cc-sheet); color: var(--cc-ink); box-shadow: var(--cc-contact); }
.route-style-option:has(input:focus-visible) { outline: 2px solid var(--cc-ink); outline-offset: 1px; }
.route-style-icon { inline-size: 14px; block-size: 14px; flex: none; }
```

---

## 8. What goes in the card, per selection

Tables give the final order, top to bottom. "Id" is the element id that must exist. "Was" is the old label; "Label" is the new one. A blank "Was" means the label does not change.

If you find a control in the code that is not in these tables: **keep it**, put it at the end of the body it was in, give it the row layout that fits its control type (7.1), and sentence-case its label. Then list it in the PR description.

### 8.1 Component (`sel.type === 'node'`)

Header: section 6.3. `#prop-node-title` (was "Name") and `#prop-node-kind` (was "Kind") are in the header and are **removed from the Look tab**.

**Look tab** (`prop-panel-look`)

| # | Id | Label | Was | Control | Layout | Shown when |
|---|---|---|---|---|---|---|
| 1 | radios named `node-accent-tone` | Colour | Accent Colour | colour dots (7.6) | row | always |
| 2 | `prop-node-shape` | Shape | | shape picker (7.7) | block | always |
| 3 | `prop-node-icon` | Icon | | icon picker + Upload / Remove (7.8) | row | kind is not `actor` |
| 3a | hidden file input (no id today; keep its `aria-label`) | | Custom Icon | | | kind is `actor`: see note |
| 4 | `prop-node-subtitle` | Subtitle | Subtitle (shown under the name) | text | row | always |
| 5 | `prop-node-eyebrow` | Label above | Label above title | text | row | kind is not `actor` |
| 6 | `prop-node-chip` | Badge | | text | row | kind is not `actor` |
| 7 | `prop-node-footer` | Footer | Card Footer Label | text; `placeholder` = the kind's name | row | kind is not `actor` and not `client` |

Note for row 3a: today an actor has no icon picker but does have the custom-icon upload. Keep that: for an actor, row 3 is labelled "Image" and holds only the Upload / thumbnail + Remove button (no icon picker). Its field id is `prop-node-icon-file` as today.

The Look tab's help button (`helpButton('components')`) stays as the last element of the panel.

**Behaviour tab** (`prop-panel-behaviour`)

| # | Id | Label | Was | Control | Layout | Shown when |
|---|---|---|---|---|---|---|
| 1 | `prop-node-status` | Status | Architecture Status | select with dot (7.3) | row | always |
| 2 | `prop-node-replicas` | Replicas | | stepper | row | always |
| 3 | `prop-node-fallback` | Fallback | | select | row | always |
| 4 | `prop-node-breaker` | Circuit breaker | | switch | switch | always |
| 5 | `prop-node-external` | Run by someone else | | switch | switch | always |
| 6 | `prop-node-interface` | Interface | Interface (shown in the matrix) | text | row | always |
| 7 | | Queue | | group heading | | kind is `queue` |
| 8 | `prop-node-queue-ordering` | Ordering | | select | row | kind is `queue` |
| 9 | `prop-node-queue-delivery` | Delivery | | select | row | kind is `queue` |
| 10 | `prop-node-queue-partitions` | Partitions | Partitions (drawn) | stepper | row | kind is `queue` and delivery is `fanout` |
| 11 | `prop-node-queue-depth` | Max depth | | number, placeholder "Unbounded" | row | kind is `queue` |
| 12 | `prop-node-queue-dlq` | Dead letters | Dead-letter queue | select | row | kind is `queue` |
| 13 | `prop-node-queue-retention` | Retention | | text, placeholder "4 days" | row | kind is `queue` |
| 14 | | Load balancer | | group heading | | kind is `balancer` |
| 15 | `prop-node-balancer-strategy` | Strategy | | select | row | kind is `balancer` |
| 16 | | Cache | | group heading | | kind is `cache` |
| 17 | `prop-node-cache-hitrate` | Hit rate | Hit rate (%) | stepper + unit "%" | row | kind is `cache` |
| 18 | `prop-node-cache-backing` | Backing store | | select | row | kind is `cache` |
| 19 | | Rate limiter | | group heading | | kind is `limiter` |
| 20 | `prop-node-limiter-admit` | Admit | | stepper | row | kind is `limiter` |
| 21 | `prop-node-limiter-per` | Of every | | stepper | row | kind is `limiter` |
| 22 | `prop-node-limiter-failopen` | Fails open | | switch | switch | kind is `limiter` |
| 23 | | Scheduler | | group heading | | kind is `scheduler` |
| 24 | `prop-node-schedule-every` | Runs | | text, placeholder "5m or 0 3 * * *" | row | kind is `scheduler` |
| 25 | | Metrics | | list (7.10) | block | always |
| 26 | `prop-node-code` | Sample payload | Sample Payload / Contract (JSON or Text) | disclosure with mono textarea (7.11) | block | always |

The status options' text changes (values do not):

| value | Was | Now |
|---|---|---|
| `''` | None / Unspecified | Not set |
| `live` | Live (Production Active) | Live |
| `planned` | Planned (Upcoming) | Planned |
| `at-risk` | At Risk (Incident / Deprecating) | At risk |
| `deprecated` | Deprecated (Legacy) | Deprecated |

This is a reorder from today: Status, Replicas, Fallback, breaker, external and Interface come first, then the kind's own group, then Metrics, then payload. To get it, build `behaviourElements` as: `[status field, ...makeResilienceFields(node), makeExternalField(node), interface field, ...kind-specific fields, metricsDiv, payload section]`. Check that nothing else was in `reviewElements` or `telemetryElements` that this list drops. If something was, keep it at the end of the tab.

**Notes tab** (`prop-panel-notes`)

| # | Id | Label | Was | Control | Layout |
|---|---|---|---|---|---|
| 1 | `prop-node-summary` | Description | | textarea | block |
| 2 | `prop-node-comment` | Review comment | Review Comment / Note | textarea | block |
| 3 | `prop-node-owner` | Owner | | text, placeholder "A team or a person" | row |
| 4 | `prop-node-tags` | Tags | | text (comma-separated, as today) | row |
| 5 | `prop-node-link-add` and the link rows | Links | | links editor (7.12) | block |

### 8.2 Wire (`sel.type === 'edge'`)

Header: section 6.3 (`#prop-edge-label` is in the header). No tabs. Body order:

| # | Id | Label | Was | Control | Layout |
|---|---|---|---|---|---|
| 1 | `prop-edge-from` | From | Source component | select | row |
| 2 | `prop-edge-to` | To | Target component | select | row |
| 3 | `prop-edge-protocol` | Protocol | | select | row |
| 4 | `prop-edge-sync` | Call style | | select | row |
| 5 | `prop-edge-latency` | Latency | Typical latency (ms) | number + unit "ms", placeholder "Typical" | row |
| 6 | radios named `edge-stream-tone` | Colour | Wire colour | colour dots | row |
| 7 | route radios | Route | Routing Style | 2 × 2 segmented (7.13) | block |
| 8 | flow radios | Direction | Flow Direction | segmented (7.13) | block |
| 9 | reverse button | Reverse direction | ⇄ Reverse Flow Direction | quiet button with a swap icon (`M7 7h13l-3-3M17 17H4l3 3`) | block |
| 10 | `prop-edge-src-port` | From port | Source Port | select | row |
| 11 | `prop-edge-dst-port` | To port | Target Port | select | row |
| 12 | `prop-edge-comment` | Review comment | Review Comment (optional) | textarea | block |

Route option labels: "Smart Auto (Context-Aware)" → "Smart", "Direct Line" → "Straight", "Smooth S-Curve" → "S-curve", "Curved Arc" → "Arc".

The edge branch (starting near line 1410) has more code than this table lists (between the route fieldset and the flow fieldset). Read all of it. Any other control follows the catch-all rule at the top of section 8.

### 8.3 Several things (`sel.type === 'multi'`)

Header: section 6.3. No tabs. Body: keep every block in its current order (members and their chips, the connector buttons, "Align & distribute", the batch colour picker). Apply only: `fieldGroup`-style headings, `.prop-quiet-btn` for buttons, "Batch Accent Colour" → "Colour" as a `row` field, "Unselect All Connectors" → "Unselect all wires", "Restore Connectors" → "Restore wires". The help line "Click any item chip or Shift+click on canvas to unselect individually." becomes "Click a chip to drop it from the selection." in `.prop-hint`.

### 8.4 Swimlane (`sel.type === 'zone'`)

Header: `#prop-zone-title` (was "Stage Title") in the header. Body:

| # | Id | Label | Was | Control | Layout |
|---|---|---|---|---|---|
| 1 | `prop-zone-sub` | Subtitle | Stage Subtitle | text | row |
| 2 | `prop-zone-num` | Number | Stage Number | text | row |
| 3 | `prop-zone-width` | Width | Width (px) | text + unit "px" | row |

### 8.5 Frame (`sel.type === 'frame'`)

Built in `src/studio/frameStage.ts`. `#prop-frame-title` goes in the header. Every other field it builds follows the catch-all rule. If the function there returns one element holding all fields, change it to return `{ title: HTMLInputElement; fields: HTMLElement[] }` and update its one caller in `inspector.ts`.

### 8.6 Note (`sel.type === 'notes'`)

Header: `#prop-notes-title` (was "Header Title"). Body: `#prop-notes-code` labelled "Tag" (was "Spec Tag"), row; then "Items" list with "Add" (was "+ Add Item"), per 7.10.

### 8.7 Document (`sel.type === 'none'`)

Header: `#prop-doc-title` (was "Architecture Title"). Body:

| # | Id | Label | Was | Control | Layout |
|---|---|---|---|---|---|
| 1 | `prop-doc-systag` | System tag | System Tag | text | row |
| 2 | `prop-doc-status` | Status badge | Status Badge | text | row |
| 3 | `prop-doc-summary` | Summary | Overview Summary | textarea | block |
| 4 | `prop-doc-dir` | Layout flows | Auto-Layout Flow Direction | select | row |
| 5 | (the field built at about line 2445, after `prop-doc-dir`) | sentence-case its label | | as it is | row |
| 6 | | Colour legend | | group heading | |
| 7 | `prop-legend-blue` … `prop-legend-fuchsia` | the tone's short label, e.g. "Blue" | "Blue means" | text | row |
| 8 | | hint | | `.prop-hint`, text unchanged | |
| 9 | | Exported page | | group heading | |
| 10 | `prop-brand-name` | Brand name | | text | row |
| 11 | `prop-brand-accent` | Brand colour | | colour input + "Use default colour" quiet button | row |
| 12 | `prop-brand-logo` | Logo | | "Upload" quiet button that clicks the existing file input; thumbnail + "Remove" when set | row |
| 13 | | hint | | `.prop-hint`, text unchanged | |

For row 7, put the tone's colour dot before the input: wrap the input and a `<span class="pill-swatch">` (18 px, `background: var(--cc-<tone>)`) in a `<div class="with-swatch">` (`display: grid; grid-template-columns: 18px minmax(0,1fr); gap: 8px; align-items: center`).

---

## 9. Wording changes

Section 8 lists every label change. Rules behind them, for anything not listed:

- Sentence case. "Review comment", not "Review Comment".
- No parentheses that explain. Drop "(optional)", "(px)", "(ms)", "(shown under the name)". A unit becomes a `.prop-unit` after the control.
- No slash pairs. "Review comment", not "Review Comment / Note".
- A button says what it does: "Add link", "Remove", "Reverse direction". No symbol characters (`+`, `×`, `✕`, `⇄`) as button text; use an icon from `src/ui/icons.ts` and an `aria-label`.
- Before changing a label, run `grep -rn "<old text>" tests e2e src docs README.md`. Update every test and every doc line that quotes it, in the same commit. `tests/plainLanguage.test.ts` and `e2e/plainLanguage.spec.ts` check wording; read them first and keep them passing.

---

## 10. Narrow screens and touch

- **At 56rem (896 px) and below** the card is a bottom sheet, as today. Replace the values in the existing `@media (max-width: 56rem) { .workspace .inspector { … } }` rule with:
  ```css
  inset-block: auto 8px; inset-inline: 8px; inline-size: auto;
  max-block-size: 60%; border-radius: 20px;
  animation-name: prop-card-up;
  ```
  and add `@keyframes prop-card-up { from { opacity: 0; transform: translateY(14px); } }`.
- The scrim (`#drawer-scrim`), the edge tab (`#btn-drawer-inspector`) and the rule that the card does not open by itself on a narrow screen (`inspectorAutoShow.ts`) are unchanged.
- **Between 56rem and 66rem** the card floats exactly as on a wide screen. Remove any rule that turned it into a full-height overlay in that range.
- **Coarse pointers:** the media queries in section 7 raise icon buttons, switches, shape options and colour dots to a 44 px (or 32 px for dots) target. Ruled fields and selects become 40 px tall: `@media (pointer: coarse) { .inspector .field, .stepper { block-size: 40px; } .prop-field--row, .prop-field--switch { min-block-size: 40px; } }`.

---

## 11. Tests

After every step in section 12, run `pnpm test`, then the quick browser tier and the specs that touch the card:

```
pnpm test:e2e:quick
pnpm exec playwright test --project=chromium e2e/a11y.spec.ts e2e/appearancePickers.spec.ts e2e/balancer.spec.ts e2e/cache-limiter-scheduler.spec.ts e2e/camera.spec.ts e2e/chaos.spec.ts e2e/findReplace.spec.ts e2e/fitWithInspector.spec.ts e2e/frames.spec.ts e2e/help.spec.ts e2e/inspectorAutoShow.spec.ts e2e/interactions.spec.ts e2e/plainLanguage.spec.ts e2e/queue.spec.ts e2e/reducedMotion.spec.ts e2e/stream-external-bucket.spec.ts e2e/tagsLinks.spec.ts e2e/tooltips.spec.ts e2e/topbar.spec.ts e2e/wireProtocol.spec.ts
```

Add `e2e/propertiesCard.spec.ts` to that list once it exists. Run the full suite (`pnpm test:e2e`, about four minutes) once before each pull request, not after every step. Keep the default worker count: more workers made the run slower and flaky on the owner's machine. A step is not done while a test fails. Never delete or skip a test to make a step pass; change the test to match the new card as described here.

### 11.1 Existing tests that must change

| File | What to change |
|---|---|
| `e2e/tooltips.spec.ts` (lines 26, 34, 39, 69), `e2e/a11y.spec.ts` (line 46) | They hover `#btn-prop-delete`, which is now inside the More popover. Before each hover, add `await page.locator('#btn-prop-more').click();`. |
| `e2e/inspectorAutoShow.spec.ts` (line 31) | Before `page.locator('#btn-pin-inspector').click()`, add `await page.locator('#btn-prop-more').click();`. The `aria-pressed` assertions stay as they are (`toHaveAttribute` works on a hidden element). |
| `e2e/tagsLinks.spec.ts` (line 37) | It uses `#btn-rail-expand-inspector`, which no longer exists. Replace the expand step with `await page.keyboard.press(']');` when `#workspace` has `data-inspector-collapsed="true"`. |
| `tests/tooltips.test.ts` (line 74) | Remove the `.inspector-rail-content` case (and the matching line 87 in `src/studio/tooltips.ts`). |
| `tests/topbarMarkup.test.ts`, `tests/responsiveToolbar.test.ts`, `tests/inspector.test.ts`, `tests/primitives.test.ts` | They read `index.html` or the CSS as text. Run them, read each failure, and update the expected markup, class names (`prop-selection-head` → `prop-head`, `prop-selection-name` → `prop-head-name`, `prop-row-2` removed) or selectors to the new ones in this file. |
| `e2e/plainLanguage.spec.ts`, `tests/plainLanguage.test.ts` | Update any quoted label that section 8 renames. |
| `e2e/fitWithInspector.spec.ts` | Keep it. Add one assertion after the existing two: the right-most diagram element's `right` is less than or equal to `#inspector-panel`'s `getBoundingClientRect().left`. |
| Any spec that calls `selectOption`, `fill`, `check` on a `#prop-…` id | Should pass unchanged, because the native elements and ids are kept (R2, R3). If one fails, you broke R2 or R3: fix the code, not the test. |

### 11.2 New tests (add to `e2e/propertiesCard.spec.ts`)

Use the helpers in `e2e/helpers.ts` (`openLumenRelay`, `runPaletteCommand`) the way `e2e/inspectorAutoShow.spec.ts` does.

1. **The card floats.** With a component selected at 1440 × 900: `#canvas-viewport`'s width equals `#workspace`'s width (no column is taken), and `#inspector-panel`'s box does not intersect `.slot-ne`'s box or the SE island's box.
2. **Closed means gone.** After clearing the selection, `#inspector-panel` is not visible and there is no element with class `rail-vertical-label` in the page.
3. **The card hugs its content.** Select a wire: `#inspector-panel`'s height is less than 70% of the viewport height.
4. **The header edits the name.** Fill `#prop-node-title` with "Renamed"; the selected `.arch-node` contains the text "Renamed".
5. **The shape picker works.** Click `#prop-node-shape [data-shape="hexagon"]`; it has `aria-checked="true"`, and the selected component's shape on the canvas is the hexagon (assert the same attribute or class the existing shape tests assert; find one with `grep -rn "hexagon" e2e`).
6. **Stepper.** Click the "One more" button next to `#prop-node-replicas`; the input's value goes up by one.
7. **More popover.** Click `#btn-prop-more`; `#btn-prop-delete` is visible. Press Escape; it is hidden and focus is on `#btn-prop-more`.
8. **Focus survives a re-render.** Focus a colour radio in the Look tab, press ArrowRight; `document.activeElement` is still inside `#inspector-panel`.
9. **Axe.** `new AxeBuilder({ page }).include('#inspector-panel').analyze()` has no violations, in light and dark, on each of the three tabs.

### 11.3 Contrast

Add to `tests/contrast.test.ts`, following the pattern of the existing pairs in that file, for both themes:

- `--cc-ink-2` text on the card's solid colour (`--cc-sheet`): at least 4.5:1.
- `--cc-ink-3` text on `--cc-sheet`: at least 4.5:1.
- `--cc-field-edge` on `--cc-sheet`: at least 3:1 (the ruled line and the off switch).
- `--cc-ink` on `--cc-sheet`: at least 3:1 (the on switch and the focus ring).

If a pair is already tested, do not add it twice.

---

## 12. Work order

Five steps. One commit per step at least; steps 1 and 2 may share a PR, as may 3 and 4. After each step: `pnpm build && pnpm test && pnpm check:size`, the two browser-test commands at the top of section 11, then look at the app at 1440 × 900 and 390 × 844 in both themes.

#### [x] Step 1. Tokens, container, popover (sections 3, 5)
**Notes from the build, 2026-11-11 (all accepted):** the offsets in 5.3 are now the measured ones. `.inspector-tabs` and `.inspector-scroll` rules stay, because the Traffic pane uses them; `overflow: hidden` on `.inspector-scroll` waits for Step 2, when `.prop-body` exists. The popover wiring in 5.4 uses optional chaining (`morePopover?.addEventListener`), because unit tests import `inspector.ts` against a stub document. The pin button has no `aria-label` (see the `inspectorAutoShow.ts` row in section 4).
Add missing tokens. Replace the `<aside>` markup. Float the card. Remove the rail. Move Lock / Group / Duplicate / Delete / pin into the popover. Add a **temporary** More and Close button at the top of `#prop-form-container` (the real header comes in step 2). Fit inset.
**Done when:** the card floats and closes to nothing; the diagram does not move when it opens; `]` toggles it; the popover opens, closes on Esc, and its buttons work; Fit keeps the diagram left of the card; tests in 11.1 for the popover and rail are updated and pass.

#### [ ] Step 2. Header and assembly (section 6)
`makeCardHeader` for all seven selection types. Name and kind move into it. Tabs restyled. Focus and scroll kept across re-renders. Remove the temporary buttons from step 1.
**Done when:** every selection type shows the header in 6.3; renaming from the header works for each; changing the kind from the header works; new tests 1 to 4 and 7 pass.

#### [ ] Step 3. Rows and basic controls (sections 7.1 to 7.6, 7.9, 9)
New `makeField`. Ruled fields, select wrapper, stepper, switch, colour dots, group headings, quiet buttons. All label changes in section 8.
**Done when:** no stacked label-over-field remains except `block` rows; no bordered button remains in the card body; every label matches section 8; new tests 6, 8 and 9 pass; contrast pairs added.

#### [ ] Step 4. Rich controls (sections 7.7, 7.8, 7.10 to 7.13)
Shape picker. Icon row with Upload. Metrics rows. Payload disclosure. Links layout. Wire route and direction segments. Behaviour tab order (8.1).
**Done when:** the Shape `<select>` is gone; the dashed upload box is gone; the payload box is not black in the light theme; new test 5 passes.

#### [ ] Step 5. Narrow, touch, cleanup (sections 10, 13)
Bottom sheet values. Coarse-pointer sizes. Delete every CSS rule that no longer matches an element (search `inspector.css`, `layout.css` and `unlayered.css` for each class you removed from the markup and TypeScript). Update `docs/guide.md` and `README.md` where they describe or picture the inspector; retake the affected pictures with `node tools/captureV3Views.mjs` (run `pnpm build` first).
**Done when:** every box in section 13 is ticked.

---

## 13. Acceptance checklist

Look and layout
- [ ] At 1440 × 900 with a component selected, the card is 304 px wide, 14 px from the right edge, below the NE island, and does not touch the SE island.
- [ ] With a wire selected the card is short (it ends under its last row); there is no empty panel below it.
- [ ] With nothing selected and "Keep open" off, nothing of the inspector is on screen.
- [ ] Opening and closing the card does not move, resize or re-zoom the diagram.
- [ ] No bordered button, no dashed drop box, no black textarea, no vertical text, no uppercase label anywhere in the card.
- [ ] Squint test (plan section 2): with the card open, the only coloured things on screen are the diagram, the header tile, the colour dots, the chosen shape and the status dot.
- [ ] Light and dark both look like the mockup. Check `?theme=dark` side by side.

Behaviour
- [ ] Every property editable in 3.0.0 is still editable, and each edit is one undo step as before (Cmd/Ctrl+Z after each kind of edit).
- [ ] Lock, Group / Ungroup, Duplicate, Delete and Keep open work from the More popover; their shortcuts still work.
- [ ] `]` toggles the card. Esc inside the popover closes only the popover.
- [ ] Clicking a colour dot or a shape does not scroll the card or lose keyboard focus.
- [ ] Fit with the card open leaves the whole diagram visible to the left of the card.
- [ ] Traffic lens: the Traffic pane shows inside the same floating card and still works.

Quality bars
- [ ] `pnpm build`, `pnpm test` and the full `pnpm test:e2e` pass. Counts are in the PR description next to the baseline from section 3.
- [ ] `pnpm check:size` passes. Entry CSS is not larger than before this work (old rules were deleted, per R6).
- [ ] Axe: no violations in the card, both themes, all three tabs.
- [ ] Keyboard only: Tab reaches every control in visual order; arrow keys move within the tabs, the colour dots and the shapes; focus is always visible.
- [ ] `prefers-reduced-motion`: the card appears without sliding; the switch thumb does not animate.
- [ ] `prefers-reduced-transparency`: the card is solid `--cc-sheet`.
- [ ] 390 × 844: the card is a bottom sheet no taller than 60% of the screen; every target is at least 44 px.
- [ ] `grep -rn "rail-vertical-label\|inspector-rail\|prop-row-2\|prop-field-check\|prop-selection-" src index.html` prints nothing.

---

## 14. Out of scope

Do not do these as part of this work. Each is a separate item.

- The **Traffic pane's contents** and the **scenario editor** (`#data-inspector-pane`, `renderSimulationEditor`). They keep their current insides in the new container.
- **Editing the name or subtitle directly on the component** on the sheet (`inlineEdit.ts` already handles F2 rename; nothing changes there).
- A **kind picker made of cut-outs**. The kind stays a native select behind the kind name.
- Turning **tags** into chips. It stays a comma-separated text field.
- The **view popover**, the **Review issues card**, the **dock's bordered buttons** and the **diagram's legibility at Fit**. They are the other findings of the 2026-11-11 review and need their own specs.
