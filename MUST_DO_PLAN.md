# ConduitCraft — Must-Do Plan (ordered for implementation)

**Inputs reviewed:** the three files in `reiview notes/`:

| File | Basis |
|---|---|
| `UX_IMPROVEMENTS.md` (oldest) | Source-driven review at `4e233f2` |
| `ConduitCraft-UX-Review.md` | Playwright and axe-core review of a mid-point build |
| `ConduitCraft-UX-Improvements.md` (newest) | Playwright review at `e22cdc6` (current `main`), with a section correcting the other two |

**Method:** I did not take any claim on trust. The three documents disagree in places, so I checked the load-bearing claims against the current source before ranking. Section 1 lists the results. The ranking is mine and is based on one rule: **fix what loses or misleads users' data first, then what unblocks other fixes, then what improves the product.**

---

## 1. Claim verification (what I confirmed in the code)

| Claim | Verdict | Evidence |
|---|---|---|
| Share link deadlocks (write and close before reading) | ✅ Confirmed | `shareLink.ts` `compressStringToBase64Url` and `decompressBase64UrlToString` both `await writer.close()` before creating the reader |
| Node search matches nothing | ✅ Confirmed | `keyedStage.ts:613` sets `dataset.node`. `nodeSearch.ts:79` reads `dataset.nodeId` or `el.id` (never set). |
| Node entry animation and wiring highlight silently dead | ✅ Confirmed | `interactions.ts:334` and `:373` use `getElementById('node-…')`, and no such ids exist |
| `[hidden]` defeated by `.btn { display:inline-flex }` | ✅ Confirmed | `studio.css:834`. There is no global `[hidden]` rule, only per-component ones. |
| Coach card can never be dismissed | ✅ Confirmed | `interactions.ts:1927` sets `.hidden`, and `.hud-card` display wins |
| `#hud-status-tip` lives inside the dismissible coach card | ✅ Confirmed | `index.html:420-421`. **Fixing `[hidden]` alone would then silence all status messages.** |
| `Cmd/Ctrl+S` always writes JSON, even to an opened `.mmd` or `.md` | ✅ Confirmed | `handleSaveDiagram` (`interactions.ts:1560`) always calls `serializeBlueprintJson` |
| Stale file handle survives template or restore loads | ✅ Confirmed | `resetActiveFile()` is called only at `interactions.ts:1555` |
| Autosave swallows quota errors and can overwrite a larger saved session | ✅ Confirmed | `state.ts` `flushAutosave`: bare `catch {}`, and it writes any non-empty doc |
| Ports `pointer-events:none` at low zoom (`< 55%`) | ✅ Confirmed | `studio.css:2191-2194` |
| CSS specificity bug collapses canvas at ≤ 66rem | ✅ Confirmed by reading | `.workspace:not(…):not(…)` (0,3,0) in the 82rem block beats `.workspace` (0,1,0) in the 66rem block |
| SVG export is `foreignObject` and the portable renderer is unused | ✅ Confirmed | `interactions.ts:1766` calls `renderStagePictureSvg()` |
| "Canvas is unreachable by keyboard" (oldest review) | ❌ **Stale** | Wires have `tabindex=0` and nodes have drag handles with arrow-key labels. The real issue is too many tab stops, not zero. |
| "Data View inspector shows hardcoded 'Untitled Architecture'" (middle review) | ⚠️ **Mostly stale** | `inspector.ts:1637/1657/1683` do set `inspTitle`. The HTML default is only a pre-render placeholder. Re-test before spending time on it. |
| "60-snapshot undo history is a memory problem" | ⚠️ Overstated | About 2 MB at 14 nodes. Only matters with large embedded icons. |

---

## 2. The must-do list, in implementation order

Each item lists **why it is at this position**. Items 1–3 are small and should land together in the first PR.

### Phase A: Stop misleading and breaking things (about 1 day)

#### 1. Global `[hidden]` rule and decouple the HUD status tip *(do these together)*
- Add `[hidden] { display: none !important; }` at the top of the stylesheet, inside the earliest layer.
- **In the same change**, move `#hud-status-tip` out of `#hud-coach-card` (`index.html:420`). Once dismissal works, a user who dismisses the first-run hint would otherwise lose every Connect-mode, Data View and export-progress message.
- Gate `#btn-restore-session` on an actual saved session. It is currently visible to first-time users and does nothing.
- **Why first:** it is the cheapest change with the widest effect. It fixes the undismissable hint, phantom Restore/Clear/Install buttons, and an empty-state first impression that offers recovery of data that doesn't exist. It also makes later layout measurements trustworthy.
- **Done when:** a test asserts that every `[hidden]` element computes to `display:none`.

#### 2. Fix the share link (compress and decompress)
- Replace both manual stream pumps with `new Response(new Blob([bytes]).stream().pipeThrough(...))`.
- Disable **Copy Link** until the value starts with `location.origin`. Never toast success for the placeholder.
- Add a 5 s timeout with a visible error state.
- Add a compress → decompress round-trip test.
- **Why now:** it is a headline feature that fails 100% of the time and reports success. Inbound `#share=` links are also dead. The fix is roughly ten lines.
- Also call `updateShareLinkPreview()` from the `⌘K` export path, which currently skips it.

#### 3. Restore the node DOM identity contract
- In `createNodeElement`, set both `wrapper.id = 'node-' + id` and `dataset.nodeId`.
- Make `nodeSearch.ts:79` read `dataset.node` too.
- Do not zoom-frame on every search keystroke. Pan if needed while typing and frame on `Enter`.
- Add a test that renders through the real `renderNodes()` rather than a hand-built fixture, so this selector drift fails CI next time.
- **Why now:** `⌘F` currently dims every node, including matches. The entry animations and wiring-source highlight are silently dead. It is an XS fix for a visible, critical regression.

### Phase B: Never lose a user's work (about 2 days)

#### 4. Protect the saved session from being overwritten
- Don't let `flushAutosave` replace a larger saved session with a smaller one before the user has accepted or discarded the restore offer. Write to a separate recovery slot instead.
- Make the restore offer a proper banner (**Open / Discard**) rather than one of six buttons.
- Keep the stale-count bug in mind: the button's node count must update.
- **Why here:** this is the only confirmed path where a normal first action (clicking a stencil after reload) destroys a previous diagram.

#### 5. Make file save format-aware and reset the file handle
- `handleSaveDiagram` must choose the serializer from the active file extension: `.mmd` → Mermaid, `.md` → blueprint markdown, `.json` → JSON.
- Call `resetActiveFile()` from every path that replaces the document: template load, showcase, restore, snapshot restore, uploaded file, share-link load.
- **Why here:** `⌘S` can currently overwrite a user's own `.mmd` or `.md` file with JSON, or overwrite their real file with a template. This is silent corruption of files outside the app.

#### 6. Visible save state and honest autosave failure
- Show `Saving… → Saved → Not saved (storage full)` beside the title. Prefix `document.title` with `•` when unsaved.
- Replace the bare `catch {}` in `flushAutosave` with an error toast that has a **Save to file** action.
- Make `beforeunload` warn on real unsaved *disk* changes. The current `preventDefault()` runs after `flushAutosave()` has already written the data, so it protects nothing.
- Add an **Undo** action to the "blank canvas / template applied" toast. Undo already restores the wipe, so this is discoverability only.
- **Defer** moving autosave and snapshots to IndexedDB until item 14. It matters, but it is not needed for correctness yet.

### Phase C: Make the layout work (about 2 days)

#### 7. Fix the grid specificity bug
- At `≤ 66rem`, the `.workspace` template must really be a single column. Also cover `.workspace[data-mode="data"]`, which breaks up to 82rem.
- Prefer explicit state attributes over the `:not()` chains so the cascade stops being load-bearing.
- Add an automated check that the canvas takes at least 92% of the workspace width at 390, 768, 1024, 1312 and 1440 px when no drawer is open.
- **Why before the other mobile work:** it changes every responsive measurement. Fixing the drawers first would mean tuning against a broken baseline.

#### 8. Make narrow-screen drawers usable
- Below 66rem, boot with both panels collapsed.
- Opening one drawer closes the other.
- Add a tap-to-dismiss scrim.
- Auto-close the palette after a stencil is added on touch.
- Keep the inspector's close button out from under the palette.
- Enforce 44 px targets inside the existing `@media (pointer: coarse)` block, and collapse the header into an overflow menu at narrow widths.
- **Note:** one review reports a 216 px header at 390 px. Treat the collapse as a design task, and don't just shrink the buttons.

#### 9. Keep ports usable at low zoom, and fix the collapsed palette rail
- Remove `.node-port` from the `pointer-events:none` low-zoom rule (`studio.css:2191`). Reveal ports on hover, focus-within and while wiring. Scale their hit area against zoom.
- Frame small diagrams at a readable zoom instead of shrinking two nodes into a 1680×920 world.
- Build the collapsed rail from `STENCIL_CATALOG`. Three of its current kinds (`database`, `queue`, `cloud`) are not real `NodeKind`s, and the click handlers bind to the wrong event, so those buttons do nothing.
- **Why here:** a first-time user's very first wiring attempt fails at the default laptop `Fit` zoom, and the compact rail does nothing at all.

### Phase D: Export quality (about 1.5 days)

#### 10. Make SVG and PNG export portable and small
- Point `btnExportSvg` at `renderDiagramSvg(app.doc)` (already tested and `foreignObject`-free). Keep the DOM-clone export as an explicitly labelled "pixel-perfect" option.
- Strip `.is-selected`, `.is-dimmed`, drag handles, ports and waypoint handles from cloned stage exports.
- Add a PNG scale choice (1×/2×/4×) and show the estimated size before download.
- Test that the default SVG contains no `foreignObject` and no `var(--wl-`.
- **Why here:** exports are how the product spreads. They are currently 153 kB for SVG and 5 MB for PNG, and SVG fails in `<img>`, Figma and Illustrator. It is also independent of A–C, so it can be built in parallel.

### Phase E: Accessibility and correctness polish (about 2 days)

#### 11. Close the axe violations and the platform-glyph bug *(all cheap)*
- Add `aria-label` to `#file-upload` (critical).
- Make accessible names start with the visible text on `#btn-focus-doc-title`, `#btn-open-palette` and `#btn-enter-presentation` (serious).
- Remove `role="listitem"` from stencil buttons, or wrap them in real list items.
- Fix contrast on `.toast-action-btn` (reported 2.54:1) and `#doc-brand-name` (reported 3.41:1). This conflicts with a newer review's "dark mode passes". Re-measure before changing colours.
- Render `⌘` versus `Ctrl` from `isMac()` and `modKeyLabel()` at boot, and test it with the platform stubbed to Windows.

#### 12. Interaction bugs from the source review
- `Escape` in Connect mode should abort an active wire drag and return `pointerTool` to select.
- Stop `pushHistory()` running before checking whether z-order actually changed.
- Reconcile the `[` / `]` collision between sidebar toggles and z-order.
- Add `snapshotsDialog` to `allDialogs`.
- Fix the malformed align labels (`"left Align Left"`).
- **Verify first:** `standaloneHtml.ts` `n.tone` versus `n.accent` (the first grep shows `e.tone` on edges, so the claim may refer to a different line), and the Data View inspector title.

#### 13. Toast, HUD and tooltip layering
- Put toasts, the coach card and node search into one ordered bottom rail instead of three independently fixed elements sharing a 30 px band.
- Replace per-element `[data-tip]::after` tooltips with a viewport-clamped layer. This also fixes SVG badge tooltips and right-edge clipping. Treat this as polish and do it after the correctness work above.

### Phase F: Product depth and long-term health

#### 14. Test and CI safety net *(start at item 2, finish here)*
- Add a thin browser-test layer for: `[hidden]` computed display, share-link round-trip, canvas-width at five viewports, node search highlighting, save-format by extension, restore not being overwritten, and no `foreignObject` in SVG.
- Add `engines: { node: ">=22.6" }` and `.nvmrc`. CI already uses Node 22 (`e22cdc6`), but local contributors are not told.
- Move autosave and snapshots to IndexedDB scoped per document, and resolve wire endpoints to titles in the diff view.
- **Why this late:** each earlier fix should land with its own test, so this item is mostly consolidation.

#### 15. Canvas ergonomics (biggest product win after the fixes above)
In this order:
1. Double-click inline rename for nodes, then wires, then zones and notes.
2. Drop a dragged wire on empty canvas to create a node, then draggable wire endpoints.
3. Camera stability: don't reset zoom on resize or mode switch. Use proportional trackpad zoom and `Space+drag` pan.
4. Roving tabindex for canvas keyboard navigation, to cut roughly 100 tab stops to one. This is the one item needing real design work.
5. Visible group bounds and a right-click context menu.

#### 16. Differentiator work *(only after everything above)*
- A live split-pane code editor with a line-number gutter. A cheap first step is debounced validation on `input`, which is a small change.
- The same step can warn "Apply (N warnings)" and stop discarding unapplied edits when toggling Mermaid ↔ Blueprint format.
- A floating simulation control, packets that travel along wire paths, `Async` and Status filters, and an on-canvas snapshot diff.
- An onboarding tour. A tour that walks users into a bug is worse than none, so leave it for last.

---

## 3. What I would deliberately **not** do

| Suggestion | Reason |
|---|---|
| Rewrite the canvas keyboard model from scratch | It exists and works. Only the tab-stop count needs improving (item 15.4). |
| Patch-based undo history | About 2 MB at realistic sizes. Revisit only if large embedded icons become common. |
| Multi-document tabs | A big feature, and item 4 plus the Undo toast already remove the data-loss risk. |
| Splitting `state.ts` into a store | A refactor with no user-visible payoff, and not needed for any item above. |
| Performance work | Both measured reviews found no long tasks or jank. |
| Treating `IMPROVEMENTS.md` as a backlog | It is a shipped wishlist. Archive or retitle it so it isn't mistaken for open work. |

---

## 4. Suggested PR sequence

1. **PR 1:** items 1, 2 and 3, each with its test.
2. **PR 2:** items 4, 5 and 6 (data safety).
3. **PR 3:** items 7, 8 and 9 (layout and mobile).
4. **PR 4:** item 10 (export). This can run in parallel with PR 3.
5. **PR 5:** items 11, 12 and 13.
6. **Then:** items 14, 15 and 16 as roadmap work.

Re-test the whole sweep at 390, 768, 1024, 1312 and 1440 px after PR 3, and again in light and dark themes.
