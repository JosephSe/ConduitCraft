# ConduitCraft (Blueprint Studio): Improvement Suggestions

A review of the app as it stands today, with ideas for look and feel and for new features. Items are **ordered by best bang for the buck**, meaning impact divided by effort. Item 1 is the best return. The last item is the most expensive for the least payoff.

[ROADMAP.md](./ROADMAP.md) is fully checked off (20/20), so none of this repeats it.

## What I reviewed

- `index.html`, `src/styles/*.css`, and the studio modules in `src/studio/*` (about 13.8k lines of TS and CSS in total).
- The README, [docs/guide.md](./docs/guide.md), and the two screenshots in `docs/images`.
- The shipped Lumen Relay showcase and the existing test suite.

**What is already strong:** autosave, undo grouping, multi-select, 9 wire routing modes, the minimap, SVG/PNG/GIF/HTML/JSON export, brand theming, light and dark themes, the simulation editor, and touch gestures.

**Where the gaps are:** the app is powerful but undiscoverable. It also uses utilitarian chrome (unicode glyphs, a two-row toolbar, an always-long inspector). It gives almost no feedback for actions, and it has no fast way to find or do things.

---

## How to read the table

| Effort | Meaning |
| --- | --- |
| S | Under half a day |
| M | One to two days |
| L | Three to five days |
| XL | A week or more |

| # | Suggestion | Type | Impact | Effort | Status |
| --- | --- | --- | --- | --- | --- |
| 1 | Toast notifications and an undo-aware status bar | Look and feel | High | S | [x] Done |
| 2 | Tooltips with shortcut hints, plus a `?` shortcuts overlay | Look and feel | High | S | [x] Done |
| 3 | Replace unicode glyphs with the SVG icon set | Look and feel | High | S | [x] Done |
| 4 | Collapsible inspector sections and search-as-you-type fields | Look and feel | High | S | [x] Done |
| 5 | Command palette (`Cmd/Ctrl+K`) | Feature | Very high | M | [x] Done |
| 6 | Template gallery in the empty state and in New | Feature | High | M | [x] Done |
| 7 | Shareable link (diagram in the URL hash) | Feature | High | S | [x] Done |
| 8 | Node search and focus (`Cmd/Ctrl+F`) | Feature | High | S | [x] Done |
| 9 | Polished motion: node drop-in, port glow, smoother selection | Look and feel | Medium | S | [x] Done |
| 10 | Presentation mode for Data View | Feature | High | M | [x] Done |
| 11 | Simulation playback controls (step, scrub, speed) | Feature | High | M | [x] Done |
| 12 | Z-order, lock, and group commands | Feature | Medium | M | [x] Done |
| 13 | Responsive and compact toolbar | Look and feel | Medium | M | [x] Done |
| 14 | Mermaid import coverage (`classDef`, styles, more shapes) | Feature | Medium | M | [x] Done |
| 15 | Edge and node comments, plus status badges | Feature | Medium | M | [x] Done |
| 16 | PWA install and offline support | Feature | Medium | S | In Progress |
| 17 | Accessibility audit pass (contrast, focus rings, live regions) | Look and feel | Medium | M | Todo |
| 18 | Auto-layout options (direction, spacing, layered or tree) | Feature | Medium | L | Todo |
| 19 | Version snapshots and a diff view | Feature | Medium | L | Todo |
| 20 | Real-time collaboration | Feature | High | XL | Skipped |

---

## 1. Toast notifications and an undo-aware status bar
**Look and feel · Impact High · Effort S**

Actions like import, export, paste, auto-layout, and autosave restore give little or no visible confirmation. The only feedback is `hudStatusTip`, a small line of text at the bottom of the canvas. `grep` finds no toast or notification component.

- Add a small toast stack at the bottom center. Messages would be "Imported 12 nodes, 14 wires", "Pasted 3 components", and "Exported lumen-relay.png".
- Give destructive actions (Delete, New, Apply to Canvas) an **Undo** button in the toast. This is safer and faster than a confirm dialog.
- Use an `aria-live="polite"` region so screen-reader users get the same feedback.
- It is one component, a few CSS rules, and a `notify()` helper called from `interactions.ts`.

## 2. Tooltips with shortcut hints, plus a `?` shortcuts overlay
**Look and feel · Impact High · Effort S**

The guide lists about 15 shortcuts, but nothing in the UI reveals them. The toolbar has no tooltips. The "Fit selection" and "Auto-Layout" buttons give no hint of what they do.

- Add a lightweight tooltip, using the Popover API or a CSS `[data-tip]` pattern, with a label and a `<kbd>` hint, for example "Duplicate ⌘D".
- Press `?` to open a cheat-sheet dialog built from one shared shortcut table. The same table can generate the guide section, so the two never drift apart.
- Fix the HUD hint line ("Drag stencils onto grid · Drag from any port dot…"). It is tiny monospace text that gets lost, so show it as a dismissible first-run coach mark instead.

## 3. Replace unicode glyphs with the SVG icon set
**Look and feel · Impact High · Effort S**

The toolbar uses text glyphs: `✎ Design`, `↖ Select`, `⤭ Connect`, `↶ ↷`, `⚙`, `⇪`, and `☰` and `▭` in the palette. They render differently on each OS and font, and some look broken or tiny. The screenshots show `↶` and `↷` as barely visible marks.

- [src/ui/icons.ts](./src/ui/icons.ts) already holds an inline SVG set for nodes. Extend it with about 15 UI icons (undo, redo, pointer, connect, settings, import, export, layout, zoom, fit, trash, duplicate, play, pause, search).
- This is the cheapest way to make the app look professional. The result is crisp at any DPI, themeable through `currentColor`, and consistent.

## 4. Collapsible inspector sections and search-as-you-type fields
**Look and feel · Impact High · Effort S**

In Design mode the Component Properties panel is one long scrolling form with about 14 fields. The screenshot cuts off mid-form, and routine edits (title, color) sit next to rare ones (eyebrow, footer, protocol, custom icon).

- Group the fields into `<details>` sections: **Basics** (title, subtitle, accent), **Appearance** (shape, icon, custom icon), **Metadata** (eyebrow, chip, footer, protocol, description), and **Metrics**. Remember each section's open state in `localStorage`.
- Keep Basics open by default and collapse the rest.
- Replace the "Choose file" native input with a small drop target and thumbnail. The browser default looks out of place against the dark theme.
- Show the accent swatches as colored dots without text labels, with the name in a tooltip. They currently wrap onto two rows.

## 5. Command palette (`Cmd/Ctrl+K`)
**Feature · Impact Very high · Effort M**

The app has many commands spread over a two-row toolbar, a settings dialog, and the inspector. A palette gives one fast entry point for all of them, and it makes the app feel modern.

- Fuzzy-search these commands: add any stencil, switch mode, auto-layout, fit, export as X, toggle theme, toggle snap, run simulation X, jump to node by name, and load showcase.
- Show shortcut hints beside each command, reusing the table from item 2.
- Implement it as a `<dialog>` with a list and arrow-key navigation. It needs no dependency. Most commands already exist as functions that the buttons call, so this is mostly a registry plus a UI.

## 6. Template gallery in the empty state and in New
**Feature · Impact High · Effort M**

A new user sees a blank grid with five buttons. Only one showcase (Lumen Relay) exists, and it is hidden behind "Load showcase".

- Add 5–8 starter blueprints as `.blueprint.json` files in `public/examples/`: three-tier web app, event-driven microservices, CI/CD pipeline, data pipeline (ETL), auth flow (OAuth/OIDC), and Kubernetes ingress. Include a simulation scenario in each.
- Show them as a card grid with a small [SVG preview](./src/exporter/diagramSvg.ts). That module already renders diagrams to SVG, so thumbnails can be generated at build time or on the fly.
- The loading path already exists (`parseBlueprintJson`), so this is mostly content work.
- `New` should open the same gallery rather than clearing the canvas immediately.

## 7. Shareable link (diagram in the URL hash)
**Feature · Impact High · Effort S**

Sharing today means exporting a file and sending it. A link is far more convenient and works well for a static app.

- Compress the blueprint JSON with `CompressionStream('deflate')`, base64url-encode it, and write it to `location.hash`. Add a "Copy share link" button to the Export dialog.
- On load, if a hash is present, decode it and offer "Open shared diagram" without overwriting the autosave.
- Add a size warning above roughly 8 KB, since custom icons and logos are embedded as data URLs and can make links huge. Offer "link without images" as an option.
- There is no backend and no dependency. `blueprintJson.ts` already provides serialize and parse.

## 8. Node search and focus (`Cmd/Ctrl+F`)
**Feature · Impact High · Effort S**

On a large diagram such as the showcase (2920×1172 stage), finding a component means panning and squinting. A search box would solve that.

- Add a small search field to the HUD. Typing filters by title, subtitle, id, and eyebrow, then dims non-matches (the dim style already exists for lineage highlighting).
- Enter jumps to the next match and uses the existing fit-selection logic in `viewportFrame.ts`.
- It reuses the existing highlight and frame code, so it is very cheap.

## 9. Polished motion: node drop-in, port glow, smoother selection
**Look and feel · Impact Medium · Effort S**

The animated wires are the app's best feature, but the rest of the UI is static.

- Add a short scale and fade animation when a node is dropped or pasted.
- Give ports a soft glow and a larger hit target on hover, and a pulse on valid drop targets while wiring.
- Animate the selection ring, using an outline offset transition.
- Use a short cross-fade when switching Design and Data View. The View Transitions API fits well here.
- Respect `prefers-reduced-motion`. The CSS already has several blocks for it, so follow that pattern.

## 10. Presentation mode for Data View
**Feature · Impact High · Effort M**

The animated telemetry is the demo-worthy part. A clean mode would suit talks and screen shares.

- Press `P` to hide the toolbar, palette, and inspector, and show only the canvas with a thin control bar (play, filter by tone, exit).
- Add an optional **guided tour**: an ordered list of nodes ("Step 1: the actor files a request"), with the camera animating from node to node and showing each node's `summary` as a caption.
- The existing `overviewSummary` and node `summary` fields already hold the text. This feature mainly needs a camera tween and a stepper.
- Include the tour in the exported standalone HTML so a recipient can click through it.

## 11. Simulation playback controls (step, scrub, speed)
**Feature · Impact High · Effort M**

`runSimulation` in `interactions.ts` advances on a `setTimeout` of about 950 ms per step with no user control. Users can only start it and clear it.

- Add Play/Pause, Step forward/back, a speed selector (0.5×, 1×, 2×), and a scrubber that lines up with the trace list.
- Clicking a row in the Live Trace panel should jump the simulation to that step.
- Add a "loop" toggle, and highlight the active wire and node together with the packet.
- This makes the simulations usable for debugging a flow, not just for demos. It also feeds the GIF export.

## 12. Z-order, lock, and group commands
**Feature · Impact Medium · Effort M**

Standard editor behaviors are missing. Swimlanes and notes can overlap nodes, and a stray drag moves things you wanted fixed.

- **Bring to front / Send to back** (`]` and `[`).
- **Lock** a node, zone, or note so it cannot be dragged or deleted (small padlock badge).
- **Group** (`Cmd/Ctrl+G`) with a shared bounding box, so a set of services moves as a unit and can be collapsed to one card.
- Store these as optional fields on the document types (`locked?`, `z?`, `groupId?`), so older files still load.

## 13. Responsive and compact toolbar
**Look and feel · Impact Medium · Effort M**

The top bar takes two rows at 1440 px (the brand and mode switcher on one, document actions on another). The file actions (`New`, `Import`, `Mermaid / MD`, `Matrix`) sit in a second row below the title. The CSS has only three breakpoints (82rem, 66rem, and pointer-coarse), so narrower windows are cramped.

- Merge the file actions into a single **File** menu (New, Import, Open code, Matrix, Export), leaving one primary Export button.
- Move Undo and Redo next to the title, since they are document-level.
- Collapse the side panels to icon rails on narrow widths, and make them toggleable with `[` and `]`.
- That gains vertical room for the canvas, which is the main thing users look at.

## 14. Mermaid import coverage
**Feature · Impact Medium · Effort M**

The parser reads flowcharts, but `classDef`, `class`, `style`, `linkStyle`, `click`, and `direction` lines are skipped (`parser.ts` line 477). Real-world Mermaid files use those heavily, so colors and links are lost on import.

- Map `classDef` fill and stroke colors to the nearest accent tone, and map `linkStyle` to wire tone and style.
- Add the rest of the common shapes (`>asymmetric]`, `((circle))`, `{rhombus}`) to the existing `NodeShape` set.
- Show an import report listing what was approximated. The line-numbered diagnostics already exist.
- Longer term, consider `sequenceDiagram` and `erDiagram` imports. Those are separate and larger projects.

## 15. Edge and node comments, plus status badges
**Feature · Impact Medium · Effort M**

Architecture reviews need annotation and state. The current notes card is a freestanding box with a checklist.

- Attach a short comment to a node or wire, shown as a small bubble badge. It would appear in the inspector and in exports.
- Add a status field (Planned, Live, Deprecated, At risk) rendered as a colored dot on the node, with a legend and a filter in Data View.
- Add the metrics values (latency, RPS) as optional sparkline-style badges, which suits the "live telemetry" branding.

## 16. PWA install and offline support
**Feature · Impact Medium · Effort S**

The app is fully client-side with local-storage autosave, so it suits being installable. There is no web manifest or service worker.

- Add `manifest.webmanifest` and a small service worker through `vite-plugin-pwa`, or hand-written.
- Add the File System Access API's "Save" (overwrite the opened file) where supported, with download as the fallback. This is a large quality-of-life gain for people who edit `.blueprint.json` files.

## 17. Accessibility audit pass
**Look and feel · Impact Medium · Effort M**

Wires are already focusable, which is good. A systematic pass would finish the job.

- Check contrast of the muted ink on the dark panel (`--wl-ink-muted`) and of the 9–10 px eyebrow and footer text on nodes. Node text at 46% zoom, as in the screenshot, is illegible.
- Add a visible, consistent `:focus-visible` ring to every button and stencil.
- Announce selection and mode changes in a live region.
- Run Lighthouse and axe in CI, using the chrome-devtools a11y skill for a first pass.
- Add a minimum readable text size at low zoom, for example by hiding secondary text below a zoom threshold (level-of-detail rendering), which also helps performance.

## 18. Auto-layout options
**Feature · Impact Medium · Effort L**

`autoLayoutDocument` (in `layout.ts`, about 1141 lines) is a single strategy that depends on the document's `direction`. Users cannot tune it.

- Add direction (LR/TD), spacing (compact, comfortable, spacious), and "layout selection only".
- Add a layered (Sugiyama-style) algorithm with crossing minimization. A library such as `elkjs` is the realistic route, but it is a large dependency that conflicts with the "zero-dependency" positioning, so weigh that first.
- Animate nodes to their new positions instead of snapping.

## 19. Version snapshots and a diff view
**Feature · Impact Medium · Effort L**

Undo history is lost on reload and covers only the current session.

- Add named snapshots in IndexedDB ("Before refactor", "Approved v2"), plus a timeline.
- Add a diff overlay that colors added, removed, and changed nodes and wires between two snapshots. The `reconcile.ts` keyed diffing may already provide most of the comparison logic.
- This is especially useful for architecture reviews. It is expensive mostly because of the UI.

## 20. Real-time collaboration
**Feature · Impact High · Effort XL**

Multi-user editing with cursors and presence would be a headline feature, but it is the most expensive.

- It needs a sync layer (CRDT such as Yjs, plus a WebSocket or WebRTC provider) and a conflict-safe document model. The current history uses full-document snapshots (`undoStack: DiagramDocument[]`), which would have to be reworked into per-operation undo.
- It also adds a backend or signaling service, which contradicts the current "no server" design.
- Do this last, and only if there is real demand. A shareable link (item 7) and snapshots (item 19) cover most of the need at a fraction of the cost.

---

## Suggested sequencing

| Phase | Items | Why |
| --- | --- | --- |
| **Quick wins (about 3–4 days)** | 1, 2, 3, 4 | These are all small and change how polished the app feels the moment it opens. |
| **Power-user boosters (about 1 week)** | 5, 7, 8, 9 | Fast navigation and sharing. The command palette also becomes the home for every future feature. |
| **Showcase and onboarding (about 1 week)** | 6, 10, 11 | Better first-run experience, and a strong demo of the telemetry feature. |
| **Editor depth** | 12, 13, 14, 15, 16, 17 | Closes the gaps against general diagram tools. |
| **Big bets** | 18, 19, 20 | Do these only after the earlier items prove their value. |

> [!TIP]
> Items 1, 2, and 5 share one piece of infrastructure: a single registry of commands with labels and shortcuts. Build that registry first and the toasts, tooltips, shortcut overlay, command palette, and guide table all fall out of it.
