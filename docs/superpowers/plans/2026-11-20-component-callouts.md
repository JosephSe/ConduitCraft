# Component Callouts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** a speech-bubble note attached to one component. It has a tail pointing at the component, follows it, and shows in Design and in every picture and HTML export.

**Architecture:** a callout is a `DiagramNotesCard` with `variant: 'callout'`, an `anchorId`, and an offset (`dx`, `dy`) from its component's top-left corner. It also keeps `x` and `y`, so the existing code that uses note positions keeps working: bounds, the minimap, exports and stacking. One pure function, `syncCallouts(doc)`, reconciles the two:

- A callout whose `x`/`y` changed since the last sync was moved by the user, so its offset is recomputed from its new position.
- Otherwise its `x`/`y` is recomputed from the component's position and the offset.
- A callout whose component no longer exists is removed.

Rendering calls `syncCallouts` before painting the notes, so every move, delete, layout change and undo is handled in one place.

**Tech Stack:** TypeScript, Vite, `node:test` unit tests (`pnpm test`), Playwright e2e.

**Spec:** `docs/superpowers/specs/2026-11-20-component-callouts-design.md`

## Global Constraints

- Callouts attach only to components (`doc.nodes`), never to wires, zones or notes.
- Tones: `'info' | 'warning' | 'time'`. Absent means `'info'`. Colours: info `--cc-blue`, warning `--cc-amber`, time `--cc-violet`. Icons: info `ⓘ`, warning `⚠`, time `⏱`.
- The default placement is above the component, horizontally centred, with a 12 px gap between the bubble and the component. Each extra callout on the same component goes 12 px above the one before.
- The tail is a 10 px triangle on the bubble side nearest the component.
- `CURRENT_SCHEMA_VERSION` goes from 14 to 15. Migration 14 → 15 is the identity.
- Entry JS budget in `tools/checkBundleSize.mjs`: raise from `575 * 1024` to `580 * 1024`. Entry CSS stays at 135 kB and the HTML chunk at 100 kB.
- Callouts are not drawn by the plain vector `.svg` export (`diagramSvg.ts`). It must skip them, not draw them as plain notes.
- Commits contain no attribution lines. Stage files by name.

## Review Focus

1. **A component and its callout dragged together** (in a multi-selection) must keep the same offset. The callout must not lag or jump. The test goes in Task 1.
2. **Undo after deleting a component** must bring back the component and its callouts, in place. The test goes in Task 1, at the model level: sync after restoring the doc.
3. **Pasting a component copied with its callout** must attach the pasted callout to the new component, not the original. Pasting a callout copied alone must attach it to the same component. The tests go in Task 3.
4. **A file whose callout names a missing component** (hand-edited or from an import) must load without error, with the callout dropped. The test goes in Task 2.
5. **Auto-layout or align moving components** must take their callouts along. `syncCallouts` covers this through `renderAll`. The test goes in Task 1 (component moved, callout untouched, sync applied).

---

### Task 1: Callout model and sync

**Files:**
- Modify: `src/types.ts`, `DiagramNotesCard` (around line 161)
- Create: `src/core/callouts.ts`
- Modify: `src/templates/presets.ts` (add `createCalloutCard`)
- Test: `tests/callouts.test.ts`

**Interfaces:**
- Produces:
  - `DiagramNotesCard.variant?: 'text' | 'callout'`
  - `anchorId?: string`, `dx?: number`, `dy?: number`
  - `tone?: CalloutTone`
  - `export type CalloutTone = 'info' | 'warning' | 'time'` (in `types.ts`)
  - `export function createCalloutCard(doc: DiagramDocument, node: DiagramNode, text?: string): DiagramNotesCard` (in `presets.ts`). It returns a card with `variant: 'callout'`, `items: []`, `code: ''`, the default placement, and x/y already set. It does not push the card.
  - `export function syncCallouts(doc: DiagramDocument): void` (in `callouts.ts`)
  - `export function calloutTailSide(card: DiagramNotesCard, node: DiagramNode, cardW: number, cardH: number): 'top' | 'bottom' | 'left' | 'right'`. This is the bubble side the tail sits on: the side facing the component's centre, chosen by the larger of the horizontal and vertical gaps.
  - `export const CALLOUT_GAP = 12`
  - `export const CALLOUT_DEFAULT_WIDTH = 220`
  - `export const CALLOUT_EST_HEIGHT = 44` (the estimated height used for default placement)

- [ ] **Step 1: Write the failing tests** in `tests/callouts.test.ts`, using `describe`/`it` from `node:test` as `tests/textLabel.test.ts` does:
  - `it('places a new callout above its component, centred')`: for a node at (400, 300) with width 200, `createCalloutCard` gives `x === 400 + 100 - 110`, `y === 300 - 12 - 44`, and `dx`/`dy` equal to x − 400 and y − 300.
  - `it('stacks a second callout above the first')`: the second card's `y` equals the first card's `y − 12 − 44`.
  - `it('follows the component when the component moves')`: create and sync, then set `node.x += 80, node.y += 40` and sync. The callout's x/y each moved by the same amount, and dx/dy are unchanged.
  - `it('keeps the new offset when the callout is moved')`: sync, then set `card.x += 50` and sync. `dx` grew by 50, and `node.x` is unchanged.
  - `it('keeps its offset when moved together with its component')`: move both by (30, 30) and sync. dx/dy are unchanged.
  - `it('drops a callout whose component is gone')`: remove the node and sync. `doc.notesCards` has no callout.
  - `it('is restored with its component on undo')`: `structuredClone` the doc, delete the node and sync, then restore the clone and sync. The callout is back at the same x/y.
  - `it('picks the tail side facing the component')`: a callout above gives `'bottom'`; one dragged to the right of the node gives `'left'`.

- [ ] **Step 2: Run the tests to verify they fail**

  Run: `pnpm test -- --test-name-pattern=callout`
  Expected: FAIL, because `src/core/callouts.ts` cannot be resolved.

- [ ] **Step 3: Implement the types, `createCalloutCard`, `syncCallouts` and `calloutTailSide`**

  `syncCallouts` remembers each callout's last synced position in a module-level `WeakMap<DiagramNotesCard, { x: number; y: number }>`. The rule:
  - No entry, or an entry equal to the current x/y: set `x = node.x + dx` and `y = node.y + dy`.
  - Otherwise (the user moved it): set `dx = x − node.x` and `dy = y − node.y`.
  - Either way, record the new x/y in the map.
  - With a missing `dx`/`dy`, as in an old or hand-edited file, derive them from x/y.

  A `structuredClone` restore produces new objects with no map entry, so they take the "recompute from offset" path, which is correct for undo.

- [ ] **Step 4: Run the tests to verify they pass**

  Run: `pnpm test -- --test-name-pattern=callout`
  Expected: PASS (8 tests)

- [ ] **Step 5: Commit**

  ```bash
  git add src/types.ts src/core/callouts.ts src/templates/presets.ts tests/callouts.test.ts
  git commit -m "feat: callout model that follows its component"
  ```

### Task 2: Saving and loading (schema 15)

**Files:**
- Modify: `src/core/schema.ts` (version 15, add `MIGRATIONS[14]`)
- Modify: `src/core/parser.ts`: notes parse (around line 1611) and serialise (around line 2015)
- Modify: `src/exporter/blueprintJson.ts`: notes coercion (around line 195)
- Modify: `src/exporter/diagramSvg.ts` (around line 409): skip `variant === 'callout'`
- Test: `tests/callouts.test.ts` (add a `describe('callout files (schema v15)')`)

**Interfaces:**
- Consumes: the `DiagramNotesCard` fields from Task 1, and `syncCallouts`.
- Produces: the frontmatter or JSON shape `{ variant: 'callout', anchorId, dx, dy, tone?, width?, title, position, z? }`. There are no `items` and no `code` for callouts.

- [ ] **Step 1: Write the failing tests**
  - `it('is schema version 15 or later')`: `CURRENT_SCHEMA_VERSION >= 15`.
  - `it('round-trips through Blueprint JSON')`: a callout with `tone: 'time'`, `title: 'Maintenance 12am–2am'`, an anchor and dx/dy survives `serializeBlueprintJson` then `parseBlueprintJson`, with every field equal.
  - `it('round-trips through the markdown code view')`: the same through `serializeToBlueprintMarkdown` then `importMermaidOrBlueprint`.
  - `it('round-trips through a share link')`: through `createShareUrl` then `decodeSharedDiagramFromHash`.
  - `it('drops a callout whose component is missing on load')`: parse JSON with `anchorId: 'ghost'`, run `syncCallouts`, and check no callouts remain and nothing throws.
  - `it('is not drawn by the plain SVG export')`: `renderDiagramSvg(doc)` does not contain the callout's text.
  - `it('loads a version-14 file unchanged')`: a v14 envelope parses with the same notes.

- [ ] **Step 2: Run the tests to verify they fail**

  Run: `pnpm test -- --test-name-pattern=callout`
  Expected: the new tests FAIL. The version is 14 and the variant is dropped on parse.

- [ ] **Step 3: Implement.** In both parsers:
  - Accept `variant: 'callout'` with no items. Today a note card without items is skipped, and callouts must be exempt from that, as text labels are.
  - Keep `anchorId` (a string), `dx` and `dy` (finite numbers, rounded) and `tone` (one of the three, otherwise drop it).
  - Default the title to `''`.

  Serialise only the callout fields for callouts. Make the identity migration 14 → 15 and add a comment line like the others: "callout note cards".

- [ ] **Step 4: Run all the unit tests**

  Run: `pnpm test`
  Expected: PASS, including the existing `schema.test.ts` and `textLabel.test.ts`. If `tests/importSnapshots.test.ts` hashes change only because of the version stamp, update them and say so in the commit message.

- [ ] **Step 5: Commit**

  ```bash
  git add src/core/schema.ts src/core/parser.ts src/exporter/blueprintJson.ts src/exporter/diagramSvg.ts tests/callouts.test.ts
  git commit -m "feat: callouts are saved in files, the code view and share links (format 15)"
  ```

### Task 3: Copy, paste and duplicate

**Files:**
- Modify: `src/core/clipboardPaste.ts`, `materializeClip` (notes map, around line 131)
- Modify: `src/studio/interactions.ts`: `copySelection` (around line 1095) and duplicate (around lines 998–1066)
- Test: `tests/clipboard.test.ts`

**Interfaces:**
- Consumes: `idMap` (old node id to new node id), already built inside `materializeClip`.
- Produces: `materializeClip` remaps `anchorId` through `idMap` when the anchor was in the clip, and otherwise leaves it unchanged. A callout copied alone therefore lands on the same component, offset by the usual paste shift through its x/y; `syncCallouts` then turns that into a new offset.

- [ ] **Step 1: Write the failing tests** in `tests/clipboard.test.ts`:
  - `it('a pasted component brings its callout, attached to the copy')`: a clip with node `a` and a callout anchored to `a`. After `materializeClip`, the callout's `anchorId` equals the new node's id.
  - `it('a callout pasted alone stays on its component')`: a clip with only the callout keeps `anchorId === 'a'`.

- [ ] **Step 2: Run them to verify they fail**

  Run: `pnpm test -- --test-name-pattern="callout"`
  Expected: the first test FAILS (its anchorId is still `'a'`).

- [ ] **Step 3: Implement the remap** in `materializeClip`. In `copySelection` and in duplicate, add every callout whose `anchorId` is among the copied node ids to the copied notes.

- [ ] **Step 4: Run the tests**

  Run: `pnpm test`
  Expected: PASS

- [ ] **Step 5: Commit**

  ```bash
  git add src/core/clipboardPaste.ts src/studio/interactions.ts tests/clipboard.test.ts
  git commit -m "feat: copying or duplicating a component takes its callouts along"
  ```

### Task 4: Drawing callouts on the canvas

**Files:**
- Modify: `src/studio/keyedStage.ts`:
  - `renderNotesCards` (line 269): call `syncCallouts(app.doc)` first.
  - `paintNotesCard` (line 493): the callout class, tone, icon and tail.
  - Node drag move (around line 1218): after positions update, call `syncCallouts` and repaint the callouts.
  - The note header drag already moves x/y. Nothing more is needed there.
- Modify: `src/studio/render.ts`, `renderAll`: no change if it calls `renderNotesCards`. Confirm it does.
- Modify: `src/styles/studio/stage.css` and `src/styles/viewer.css`: `.blueprint-spec.is-callout` and the tail.
- Modify: `src/studio/stackOrder` users (`paintStackOrder`): callouts always draw above components and wires.
- Test: `e2e/callouts.spec.ts` (created here, extended in Task 5)

**Interfaces:**
- Consumes: `syncCallouts`, `calloutTailSide`, and the tone constants from Task 1.
- Produces:
  - DOM: `<aside class="blueprint-spec is-callout" data-tone="info|warning|time" data-tail="top|bottom|left|right" data-notes-id>`.
  - The header holds `<span class="callout-icon" aria-hidden="true">` plus the text.
  - The tail is drawn with `::after` from `data-tail`.
  - The tint uses `--cc-blue`, `--cc-amber` or `--cc-violet` through a `--callout-tone` custom property.

- [ ] **Step 1: Write the failing e2e test** `e2e/callouts.spec.ts`. Use the returning-visitor `storageState` from `e2e/exportVisual.spec.ts`, and load a diagram with one component and one callout by importing Blueprint JSON.
  - `test('a callout sits above its component with its tail pointing down')`: `.blueprint-spec.is-callout` is visible, its bounding box bottom is above the component's top, and `data-tail="bottom"`.
  - `test('dragging the component takes the callout along')`: drag the component 120 px right; the callout's box x moved by 120 ± 2 px.
  - `test('deleting the component removes its callout, and undo brings both back')`.

- [ ] **Step 2: Run the test to verify it fails**

  Run: `pnpm exec playwright test e2e/callouts.spec.ts --trace off`
  Expected: FAIL, because no `.is-callout` element exists.

- [ ] **Step 3: Implement the rendering and the CSS.** It must read in light and dark, in all diagram styles (studio, blueprint, print, sketch), and at Fit zoom (`data-lod="low"` must not hide it).

- [ ] **Step 4: Run the test**

  Run: `pnpm exec playwright test e2e/callouts.spec.ts --trace off`
  Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

  ```bash
  git add src/studio/keyedStage.ts src/styles/studio/stage.css src/styles/viewer.css e2e/callouts.spec.ts
  git commit -m "feat: callouts draw on the canvas with a tail and follow their component"
  ```

### Task 5: Adding and editing callouts

**Files:**
- Modify: `src/studio/palette.ts`: a new command `id: 'node-add-callout'`, titled "Add callout", in category `'Components'`.
- Modify: `src/core/actions.ts`: availability, `'node-add-callout': (c) => design(c) && c.selection === 'node'`.
- Modify: `src/core/contextMenuItems.ts`: add `'node-add-callout'` to the `'node'` list after `'edit-lock'`.
- Modify: `src/studio/inspector.ts`:
  - **Component inspector, Notes tab:** an "Add callout" button next to the comment field (around line 1564).
  - **Note inspector** (around line 2477): for a callout, show a text area for the text, a tone select (Info, Warning, Time), and a read-only "Attached to <component title>" line with a button that selects that component.
- Test: `tests/contextMenuItems.test.ts`, `e2e/callouts.spec.ts`

**Interfaces:**
- Consumes: `createCalloutCard(doc, node)`.
- Produces: the command runs `pushHistory()`, pushes the card, `setSelection({ type: 'notes', id })`, `renderAll(true)`, then starts inline text edit as the note's double-click does.

- [ ] **Step 1: Write the failing tests**
  - Unit test: `it('offers Add callout on a component')`: `contextMenuCommandIds('node', {})` includes `'node-add-callout'`.
  - E2E: `test('Add callout from the right-click menu, type text, pick a tone')`. Right-click the component, choose "Add callout", type "Maintenance 12am–2am", press Escape, and set the tone to Time in the inspector. The callout shows the text, `data-tone="time"` and the ⏱ icon.

- [ ] **Step 2: Run them to verify they fail**

  Run: `pnpm test -- --test-name-pattern="Add callout"` and `pnpm exec playwright test e2e/callouts.spec.ts --trace off`
  Expected: both FAIL.

- [ ] **Step 3: Implement the command, its availability, the menu entry and the inspector controls.**

- [ ] **Step 4: Run the tests**

  Expected: PASS

- [ ] **Step 5: Commit**

  ```bash
  git add src/studio/palette.ts src/core/actions.ts src/core/contextMenuItems.ts src/studio/inspector.ts tests/contextMenuItems.test.ts e2e/callouts.spec.ts
  git commit -m "feat: add a callout from a component's menu or inspector, with text and tone"
  ```

### Task 6: Exports, budget and release notes

**Files:**
- Modify: `src/exporter/standaloneHtml.ts` (around line 267): output a callout `<aside>` with the same classes and data attributes as the canvas, and no items list.
- Modify: `tools/checkBundleSize.mjs` line 13: `580 * 1024`.
- Modify: `RELEASE_NOTES.md`: a line under the next unreleased section, for example: "Callouts: attach a speech-bubble note to a component, such as a maintenance window or an access cut-off. It follows the component and shows in every export."
- Test: `e2e/callouts.spec.ts`

**Interfaces:**
- Consumes: the DOM and CSS contract from Task 4. The `viewer.css` rules are inlined into the HTML export through `?raw`.

- [ ] **Step 1: Write the failing e2e test**: `test('the callout shows in PNG, canvas SVG and HTML exports')`. Use the export-capture helpers from `e2e/exportVisual.spec.ts`. The `-dom.svg` contains `is-callout` and the callout text. The HTML export contains `is-callout` and `data-tone="time"`. The PNG has non-white pixels in the callout's region: crop the area above the component and assert that less than 98% of it is background.

- [ ] **Step 2: Run it to verify it fails**

  Run: `pnpm exec playwright test e2e/callouts.spec.ts -g exports --trace off`
  Expected: FAIL on the HTML assertion. The picture exports may already pass, because they clone the stage.

- [ ] **Step 3: Implement the HTML output, raise the budget, and add the release-note line.**

- [ ] **Step 4: Run the full verification**
  - `pnpm build && pnpm check:size`. Expected: entry JS under 580 kB, CSS under 135 kB, HTML chunk under 100 kB, and the sizes printed.
  - `pnpm test`. Expected: all pass.
  - `pnpm exec playwright test e2e/callouts.spec.ts e2e/exportVisual.spec.ts --trace off`. Expected: all pass.

- [ ] **Step 5: Commit**

  ```bash
  git add src/exporter/standaloneHtml.ts tools/checkBundleSize.mjs RELEASE_NOTES.md e2e/callouts.spec.ts
  git commit -m "feat: callouts in the HTML export; entry budget 580 kB"
  ```
