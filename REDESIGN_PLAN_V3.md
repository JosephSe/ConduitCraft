# ConduitCraft 3.0: Redesign Plan

**Written:** 2026-11-09, second draft, against `main` at `2d9115c` (release 2.2.1, schema v12).
**What changed from the first draft:** the first draft restyled the existing layout. The owner asked for a fresh look that is not bound by earlier redesigns, so this draft redesigns the layout, the way components are added, and the diagram's look. The first draft is in git history if needed; nothing in it is binding.
**The visual target is a working mockup:** [`docs/v3/concept.html`](docs/v3/concept.html). Where this file and the mockup disagree on a look, the mockup wins; where they disagree on behaviour, this file wins.
**Relation to older plans:** [`REDESIGN_PLAN.md`](REDESIGN_PLAN.md) (V1) still rules behaviour, the quality bars (section 10), the non-goals (section 11) and the word list (Appendix A). [`REDESIGN_PLAN_V2.md`](REDESIGN_PLAN_V2.md) still owns the feature queue (E4, F1 to F7, G1 to G5), except F4 Diagram styles, which moves here. V1's layout (section 5) and visual language (section 6) are replaced by this file.

---

**What comes after 3.0** is in [FEATURES_AFTER_V3.md](FEATURES_AFTER_V3.md): features, a simpler model, and what was left out. Nothing in it starts before R3.

## Contents

1. [How to use this file](#1-how-to-use-this-file)
2. [The concept](#2-the-concept)
3. [What the review found](#3-what-the-review-found)
4. [Decisions](#4-decisions)
5. [Design language](#5-design-language)
6. [The shell](#6-the-shell)
7. [Adding components](#7-adding-components)
8. [The diagram](#8-the-diagram)
9. [Motion](#9-motion)
10. [Engineering approach](#10-engineering-approach)
11. [The queue](#11-the-queue)
12. [Definition of done](#12-definition-of-done-every-pr)
13. [Open questions, with defaults](#13-open-questions-with-defaults)

---

## 1. How to use this file

For whoever picks up the next piece of work, person or agent.

1. **Open the mockup first.** Run `python3 -m http.server 5199 --directory docs/v3` and open `http://localhost:5199/concept.html`. Press `C` for the component tray, `1` `2` `3` for the lenses, click a component for the inspector, and use the moon button for the dark theme. `?theme=graphite&lens=traffic&tray` in the URL sets a state directly. Read its CSS: the tokens and recipes in section 5 are taken from it.
2. **Next item:** the first `[ ]` item in [section 11](#11-the-queue) whose **Needs** are all `[x]`. Do not pick by interest.
3. **Blocked?** Write `Blocked: <reason>` under the item, leave it `[ ]`, take the next unblocked item in the same milestone. If the whole milestone is blocked, stop and ask.
4. **PRs:** S and M items in one milestone may share a PR; L items are split first. Every PR targets the `v3` branch (D1), never `main`, until R3.
5. **Update this file in the same PR:** tick the box, add the PR number, turn anything unfinished into a new queue item with its own ID.
6. **The mockup is a picture, not source.** It is one static file with made-up data. Do not copy its markup or script into the app; build each surface in the app's own modules and match the look.
7. **Do not touch** the untracked files `src/studio/interactions.ts.bak`, `e2e/zz_debug.spec.ts` and `tools/_auditTemplates.ts`. They are the owner's.

Sizes: S is up to 2 days, M is 3 to 5 days, L must be split before starting.

---

## 2. The concept

**A drawing, and the template you draw it with.**

An architect's desk has two things on it: the drawing, and a plastic stencil template lying on top of it. ConduitCraft already calls its components "stencils". 3.0 takes that literally.

- **The sheet is the whole window.** No docked bars or side panels. The diagram runs edge to edge.
- **The chrome is a few small templates lying on the sheet.** Seven translucent islands in fixed positions. They are monochrome: ink, white and hairlines. All colour belongs to the diagram.
- **Components are cut-outs.** In the dock and the tray a component is an outline of its real shape, the way a hole in a stencil is. Reach for it and it fills with colour and lifts out.
- **One instrument, three faces.** The dock at the bottom centre is the one place you act. In Design it holds tools and components. In Traffic it becomes the transport. In Review it becomes the issue navigator.
- **Each lens changes the light.** Design is a drafting table. Traffic turns the lights down, and wires become tubes with capsules moving through them. Review drains the colour and marks problems the way a reviewer would, in red pen.

What makes it sleek is how little is on screen. What makes it fun is that the components behave: the tray shows each one doing its job before you place it, and the diagram comes alive when you switch to Traffic.

Three tests for any choice in this plan:

- **Squint test.** Blur the screen. The diagram is the only coloured region.
- **Zoom-out test.** At Fit on the showcase (about 35 to 45%), every component's name can be read.
- **Screenshot test.** A crop of the canvas, pasted into a slide deck, looks finished.

---

## 3. What the review found

Checked on 2026-11-09 by reading the source and running the app at 1440 × 900 and 800 × 600, light and dark, on the Marquee showcase. Tests were not run; Z1 records the baseline.

### 3.1 Facts the plan depends on

| Fact | Value | Where |
|---|---|---|
| Stack | Vanilla TypeScript, Vite 6, no UI framework, one runtime dependency (`js-yaml`) | `package.json` |
| Renderer | Keyed DOM for components, SVG for wires | `src/studio/keyedStage.ts` |
| Styles | `studio.css` is 5,686 lines in nine `@layer`s; `shared.css` and `viewer.css` also feed the HTML export | `src/styles/` |
| Tokens | 142 `--wl-*` tokens with a thin `--cc-*` layer on top | `src/styles/shared.css` |
| Entry CSS / JS | 110.0 of 115 kB / 530.7 of 540 kB | `tools/checkBundleSize.mjs` |
| Font | The stack names `Inter` but no font ships, so the app differs by machine | `--wl-font-sans` |
| Component boxes | Fixed per kind and **saved in every file** | `getNodeDimensions`, `src/core/layout.ts:13` |
| Shape outlines | Already computed as geometry | `nodeShapePlate`, `src/core/nodeStyle.ts` |
| Level of detail | `data-lod` is `low` below 55% zoom, `medium` below 80%, else `high` | `src/studio/state.ts:705` |
| Wires | `.conduit-rail` under a `.conduit-stream` of marching dashes | `studio.css:1324` to `1382` |
| Component panel | Markup in `index.html` (`#stencil-grid`, `.rail-stencil-btn`, `.palette-section`), wired in `interactions.ts`, `responsiveToolbar.ts`, `dom.ts` | |
| Insert shortcut | `C` runs the `open-insert` action | `src/core/keymap.ts:42` |
| Wire dropped on empty canvas | Already creates a connected component there | `src/studio/interactions.ts:521` |
| Image-to-kind lists | `redis`, `kafka`, `nginx` and so on already map to kinds | `src/importers/common.ts:158` |
| "Library" | Already means the user's saved diagrams | `src/studio/library.ts`, `libraryUi.ts` |
| SVG export | Draws components with its own code | `src/exporter/diagramSvg.ts` |
| Deploy | Every push to `main` publishes to GitHub Pages | `.github/workflows/deploy.yml` |

### 3.2 Problems

| # | Problem | Evidence |
|---|---|---|
| P1 | **Ten floating cards collide.** Legend, minimap, zoom, find, two tips, run bar, first-run card, contextual toolbar and toasts each position themselves. | At 1440 px with both panels open the legend covers the contextual toolbar. At 800 px the first-run card covers the zoom controls. |
| P2 | **The component panel is a form, not a tool.** Two columns of boxed cards, each an icon, a name and a sentence. Every component looks the same until you read it. Folded, it is 16 unlabelled icons. | The expanded left panel |
| P3 | **Docked panels frame the canvas like a 2019 editor.** Top bar, left rail, left panel, right panel, bottom strip: the diagram is the smallest thing on screen when both panels are open. | 1440 px with both panels open |
| P4 | **Uppercase mono everywhere.** Tips, eyebrows, chips, wire labels, headings. Nothing is emphasised because everything is. | `--wl-font-mono` across the styles |
| P5 | **Selection looks like data.** The selection ring is the same blue as "Primary" wires. | `--cc-accent: var(--wl-blue)` |
| P6 | **Navy, glass and glow.** The dark theme tints everything blue and the canvas glows green; both distort the diagram's colours. | `stage` layer backgrounds |
| P7 | **The inspector is a long form** with native selects and three sections of equal weight. | `src/studio/inspector.ts` |
| G1 | **Unreadable at Fit.** Titles render at about 6 px on the showcase. | `data-lod="low"` hides detail but enlarges nothing |
| G2 | **Sync and async wires look alike** because the marching dashes sit on both. | `studio.css:1324` to `1382` |
| G3 | **Wire labels are noise.** Every wire carries a pill at all times. | Centre of the showcase |
| G4 | **Crossings are ambiguous.** | No casing under the rail |
| G5 | **Badges pile up.** Status, lock, comment, level, chaos and insight badges each take a different corner. | `keyedStage.ts:1381` to `1521` |
| G6 | **Nothing rests.** Every wire animates in every lens. | `data-animated` default |
| G7 | **Review looks like Design with a list.** The lens that finds problems does not look different enough to say so. | Review lens on the showcase |

---

## 4. Decisions

All are the plan author's calls unless marked. Change one by editing this table in its own PR.

| # | Decision | Reason |
|---|---|---|
| D1 | **Build on a `v3` branch.** PRs target `v3`; merge `main` into it at least weekly; it merges to `main` once, at R3. | `main` deploys on every push and a half-redesigned app is worse than either end. |
| D2 | **No framework, no canvas renderer, no new runtime dependency.** | V1 section 11 still holds. |
| D3 | **Ship two typefaces, self-hosted:** Instrument Sans (variable, weight 400 to 700, width 75 to 100) and Geist Mono. Both are under the SIL Open Font License. The chrome uses normal width; the diagram uses 88% width so names fit their fixed boxes. Exports embed a subset. | Type is the largest single lever on "designed". One family at two widths gives the chrome and the diagram different voices without a second face. Reverses the first draft's "no web font". See Q1. |
| D4 | **The chrome is monochrome.** Selection and focus are ink. Primary buttons are ink-filled. No brand colour, no gradient. | Fixes P5 and passes the squint test. |
| D5 | **The five wire colours keep their names and values, and 3.0 adds two: `cyan` and `fuchsia`** (5.1, T5). Asked for by the owner on 2026-11-09. | The five are in the file format, legends, exports and `tests/contrast.test.ts`. Seven is the ceiling: an eighth hue cannot be told from its neighbours. |
| D6 | **Component box sizes do not change.** | They are saved in files and used by layout and imports. |
| D7 | **No schema change** until Y1 (diagram style, v13). Dock favourites are a browser preference, not part of a document. | 2.x and 3.0 files stay interchangeable. |
| D8 | **Design is still; Traffic moves.** Confirmed by the owner on 2026-11-09. An "Animate wires while designing" preference, off by default, restores the old behaviour. | Fixes G6 and makes switching lens feel like switching the system on. |
| D9 | **Seven slots, nothing else.** Everything over the sheet sits in a named slot (6.1) except the contextual toolbar, which follows the selection. | Fixes P1 by construction. |
| D10 | **Motion is an answer.** Every animation is the result of something the user did or a run did, plays once, and has a still end state that means the same thing. | Keeps V1 principle 4. |
| D11 | **Shortcuts do not change.** `C` opens the tray, `V W H T F` pick tools, `1 2 3 4` pick lenses, `X` fails a component. | Muscle memory, and the keymap tests. |
| D12 | **Test hooks survive where the element survives.** Ids, `data-*`, roles and accessible names stay on anything that still exists. Surfaces that are replaced (component panel, tool rail, tips, floating zoom and find cards) get their specs rewritten in the same PR, never skipped. | About 60 Playwright specs depend on them. |
| D13 | **Redesign by replacement.** A PR that builds a surface deletes the one it replaces. Entry CSS ends 3.0 at or below 100 kB. | 5 kB of CSS budget is left. |
| D14 | **The component tray is called "Components".** "Library" keeps meaning the user's saved diagrams. | The word is taken (3.1). |
| D15 | **Translucency is optional.** Islands are solid under `prefers-reduced-transparency` and where `backdrop-filter` is unsupported. Text contrast is measured on the solid colour. | Accessibility, and old GPUs. |

---

## 5. Design language

Everything here is in the mockup's `<style>` block. Copy values from there.

### 5.1 Colour

Two themes. **Vellum** is the light one: a cool drafting-film grey, not white and not cream. **Graphite** is the dark one: a true neutral charcoal, not navy and not black.

| Token | Vellum | Graphite | Use |
|---|---|---|---|
| `--canvas` | `#ECEFEE` | `#1D1F21` | The sheet |
| `--canvas-run` | `#E0E5E4` | `#151617` | The sheet with the lights down (Traffic) |
| `--dot` | `#8CC4D8` | `rgba(140,196,216,.3)` | Grid dots, in non-photo blue, the pencil colour draughtsmen used for guides |
| `--sheet` | `#FFFFFF` | `#2A2C2F` | Component surfaces, solid islands, popovers |
| `--island` | `rgba(255,255,255,.84)` | `rgba(46,48,51,.84)` | Translucent islands, over an 18 px blur |
| `--well` | `rgba(21,24,28,.055)` | `rgba(255,255,255,.07)` | Hover, pressed, inset fields |
| `--ink` | `#15181C` | `#F2F3F1` | Text, selection, primary fill |
| `--ink-2` | `#565C64` | `#B7BBBF` | Secondary text |
| `--ink-3` | `#6C727A` | `#92979C` | Hints, cut-out outlines at rest |
| `--on-ink` | `#FFFFFF` | `#1D1F21` | Text on an ink fill |
| `--hair` / `--hair-2` | ink at 11% / 20% | white at 10% / 20% | Island edges / component borders and dividers |
| `--redline` | `#D4291C` | `#FF6B5E` | Review marks only |

Rename to the `--cc-*` prefix when moving them into the app. T1 adds every text pair to `tests/contrast.test.ts` (4.5:1 for text, 3:1 for wires, rings and input edges) and adjusts a value if a pair fails.

**Diagram colours.** Seven tones for components and wires. The first five keep their values; `cyan` and `fuchsia` are new (D5).

| Tone | Vellum | Graphite | Default name |
|---|---|---|---|
| `blue` | `#1D4ED8` | `#60A5FA` | Primary |
| `emerald` | `#047857` | `#34D399` | Success |
| `rose` | `#BE123C` | `#FB7185` | Exception |
| `violet` | `#5B21B6` | `#A78BFA` | Control |
| `amber` | `#B45309` | `#FBBF24` | Async |
| `cyan` (new) | `#0B7C9E` | `#22D3EE` | Data |
| `fuchsia` (new) | `#B5179E` | `#F0ABFC` | Security |

The two new values were picked by measurement: each is at least 4.5:1 on `--sheet` in its theme, and no further from its nearest neighbour (emerald for cyan, rose and violet for fuchsia) than blue already is from violet. Colour is never the only cue: wires carry labels and components carry a kind. The default names are only defaults; a diagram's legend can rename them.

Each element sets `--t` once from its tone and derives the rest:

| Step | Recipe | Use |
|---|---|---|
| `--t` | the tone | Wires, icons, capsules |
| tint | `color-mix(in oklab, var(--t) 13%, var(--sheet))` | Tile fill, filled cut-out, frame wash |
| edge | `color-mix(in oklab, var(--t) 36%, var(--sheet))` | Tile and frame borders |

**Removed:** every gradient, every glow, the brand-coloured mark (it becomes ink; a document's own brand colour still recolours it), per-tone rule blocks.

### 5.2 Type

- **Sans:** `"Instrument Sans", system-ui, -apple-system, "Segoe UI", sans-serif`. Chrome at `font-stretch: 100%`; everything on the sheet at `88%`.
- **Mono:** `"Geist Mono", ui-monospace, "SF Mono", Menlo, monospace`. Only for literal things: code, ids, protocol names, readouts such as `hits 80%`, keyboard keys.
- **Scale (px / line / weight):** 11/14/400 meta · 12/16/400 small · 13/20/400 body · 13/20/500 control · 15/19/600 title · 16/20/600 panel title · 24/30/600 display.
- **No uppercase labels anywhere.** Sentence case throughout, per the word list.
- **Numbers that change** use `font-variant-numeric: tabular-nums`.
- **Loading:** `font-display: swap`, with `size-adjust` on the fallback so text does not jump. Both files are precached by the service worker (`tools/swPrecache.ts`) so offline is unchanged.

### 5.3 Shape and depth

Radius says what a thing is. Do not use one value everywhere.

| Thing | Radius |
|---|---|
| Tray | 22 |
| Dock | 18 |
| Islands, inspector | 14 to 16 |
| Dock buttons, cut-out slots | 12 |
| Buttons and fields inside islands | 8 to 9 |
| Components on the sheet | 10 |
| Chips, wire labels | 5 |

Two shadows only. **Lift** is for islands: a tight contact line plus a wide soft ambient (`0 1px 1px …, 0 10px 30px -10px …`). **Contact** is for things on the sheet: `0 1px 2px` at 7%. Components do not float; they sit on the drawing.

Hit targets: 32 px in islands, 44 px in the dock, 44 px everywhere on coarse pointers.

### 5.4 Icons

One set in `src/ui/icons.ts`: 24 px box, 1.6 px stroke, round caps and joins, no fills. **Component kinds are never shown as icons in the chrome**; they are shown as their cut-out shape (section 7). Kind icons appear only in the tile on a component card.

### 5.5 Voice

Plain, short, sentence case, one idea per line. The word list rules.

| Place | 3.0 |
|---|---|
| Hint, Design | "Drag a shape onto the sheet, or drag from a port to connect." |
| Hint, Traffic | "Select a component and press X to fail it." |
| Hint, Review, issues | "Two things to look at on this page." |
| Hint, Review, none | "Nothing to flag on this page." |
| Tray search | "Search, or type what you run: redis, kafka, nginx" |
| Tray footer | "Drag onto the sheet, or press ↵ to place" |
| Scenario finished | "Finished in 9 steps" |

A component's one-line description says what it does in a run, not what it is: "Holds work until a reader is free. If the reader stops, it buffers."

---

## 6. The shell

### 6.1 Seven slots

```
┌────────────────────────────────────────────────────────────────────────┐
│ ┌ NW ──────────────┐     ┌ N ───────────────────┐     ┌ NE ──────────┐ │
│ │ ▣ Title   Saved  │     │ Design Traffic Review│     │ ☾ ⌕ Share ▶Run│ │
│ └──────────────────┘     └──────────────────────┘     └──────────────┘ │
│                                                       ┌ E ───────────┐ │
│                                                       │ inspector,   │ │
│                 the sheet, edge to edge               │ only with a  │ │
│                                                       │ selection    │ │
│                                                       └──────────────┘ │
│                      hint line (text only)                             │
│ ┌ SW ────────────┐  ┌ S ──────────────────────────┐   ┌ SE ─────────┐  │
│ │ pages          │  │ the dock                    │   │ − 85% + Fit │  │
│ └────────────────┘  └─────────────────────────────┘   └─────────────┘  │
└────────────────────────────────────────────────────────────────────────┘
```

- One grid over the sheet, `pointer-events: none`, with seven named areas and a 14 px inset. Islands are `pointer-events: auto`.
- **S grows upward.** The tray, toasts and the first-run card all open above the dock, in that slot, stacked with a 10 px gap. Nothing else may appear in the bottom third.
- **E** holds the inspector. The legend and the minimap are popovers anchored to SE and SW (6.3), not islands of their own.
- An island is: `--island` fill, 1 px `--hair`, lift shadow, 5 px padding, `backdrop-filter: blur(18px) saturate(1.4)`.

### 6.2 The top islands

- **NW, the document.** The mark (ink square, opens the menu), the title (click to rename), and the save state as plain text in `--ink-3`: "Saved", "Saving", "Not saved". Undo and redo live in the menu and on their shortcuts; they are not buttons.
- **N, the lens.** One segmented control with a sliding ink thumb that springs between segments. Review carries the issue count in redline.
- **NE, actions.** Search (`⌘K`), Share, and **Run**, the only filled button on screen. Run switches to Traffic and plays the selected scenario.

### 6.3 The corner islands

- **SW, pages.** Page names as quiet buttons; the current one sits in a well. `+` adds a page. A small key button opens the **legend** as a popover above it.
- **SE, view.** Zoom out, zoom readout, zoom in, Fit. The readout opens a popover with the minimap, "Colour by", the tag filter, "Always show wire labels" and the diagram style.
- **The hint line** is plain text above the dock with no container. It is the `role="status"` line and replaces both tip cards. It hides while the tray is open.

### 6.4 The dock

58 px tall, 18 px radius, 44 px buttons. One island, three faces; switching lens cross-fades the face and springs the width.

| Lens | Face |
|---|---|
| **Design** | Select, Wire, Hand, Text, Frame · six component cut-outs · "All components `C`" |
| **Traffic** | Scenario name (opens the picker) · previous, play or pause, next · scrubber · "Step 4 of 9" · speed · **Fail a component** in rose |
| **Review** | Previous · the current issue ("1 of 2", then its sentence) · next · the fixes that issue offers (for example "Add a standby") · "Ignore this rule" |

- The active tool is ink-filled. Everything else is `--ink-2` on nothing, with a well on hover.
- "Fail a component" makes the signature feature visible. It arms the fail action: the next component clicked fails. `X` still works.
- The Review face drives the same list as the issues panel; stepping moves the camera to the issue (existing behaviour) and its redline mark pulses once.

### 6.5 The inspector

Slot E, 284 px, appears with a selection and leaves with it (existing auto-show rules).

- **Header:** the selection's cut-out, filled in its colour, beside its name at 16/600 and its kind in `--ink-3`.
- **Three tabs** in a well: **Look** (colour, shape, icon, labels), **Behaviour** (copies, fallback, queue, cache, limiter and schedule settings, status, external), **Notes** (description, owner, tags, links, comment). Every existing field goes in exactly one tab; none is added or removed.
- **Rows:** a 92 px label column, then the control. Controls are 30 px tall wells: swatch dots for colour, a stepper for counts, a switch for booleans, a styled native `<select>` for lists.
- Lock, Duplicate and Delete leave the inspector; they are on the contextual toolbar and the context menu.

### 6.6 Everything else

- **Contextual toolbar:** an island of icons with tooltips, following the selection, flipping below when it would leave the sheet.
- **Command palette, menus, popovers:** `--sheet`, 14 px radius, lift shadow, 32 px rows, shortcuts right-aligned in mono `--ink-3`.
- **Dialogs:** one shell. 24 px padding, 16/600 title, primary action ink-filled at the bottom right.
- **Templates and Home:** each diagram is a sheet: a thumbnail drawn by `diagramSvg.ts` in the current theme, with its title and one line under it. No boxed cards around them. On hover the thumbnail's wires run once.
- **First run:** the existing three actions, in slot S above the dock.
- **Narrow and touch:** below 900 px NE keeps only Run and a menu, SW and SE collapse to one button each, the dock scrolls sideways and keeps three favourites, and the tray becomes a bottom sheet without the demo pane. The inspector becomes a bottom sheet. The dock's bottom-centre position is already where thumbs are.

---

## 7. Adding components

This is the part of the app the owner singled out, and the memorable thing in 3.0. There are three ways to add a component, all sharing one visual idea: **a component is a cut-out of its own shape.**

### 7.1 The cut-out

- An SVG of the kind's real outline (card, cylinder, pipe, trapezoid, hexagon, bucket, figure), 38 × 30, drawn with a 1.4 px `--ink-3` stroke and no fill. Draw them from the same geometry the canvas uses (`nodeShapePlate` and the pipe, bucket and cylinder drawings) so a cut-out and its component can never drift apart.
- **Reach for it** (hover, focus or keyboard highlight): it fills with its tint, the stroke takes its colour, and it lifts 4 px and scales to 1.12 with a spring.
- **Take it** (drag): a filled copy leaves the slot and grows to full size under the pointer; the slot stays as an empty outline until the drop. Existing snapping and guides apply.
- **Click it** instead: the pointer carries a ghost of the component and the next click on the sheet places it. `Shift` keeps placing. `Esc` puts it back.

### 7.2 The dock's six

Six favourites in the Design face. Defaults: Service, Data store, Message queue, Load balancer, Gateway, Actor. Dragging a cut-out from the tray onto the dock replaces the slot it lands on. Stored per browser (D7). Each has a name tooltip above it.

### 7.3 The tray

Opens above the dock with `C` or "All components", up to 880 px wide, 22 px radius. It is not modal; the sheet stays live behind it. `Esc` or a click on the sheet closes it.

```
┌──────────────────────────────────────────────────────────────────────┐
│ ⌕  Search, or type what you run: redis, kafka, nginx                 │
├──────────────────────────────────────────────┬───────────────────────┤
│ Entry points   Traffic control   Compute     │  ○──▭▭──[ ═══ ]──▭──○ │
│ ◯ Actor        ⏢ Load balancer   ▭ Service   │                       │
│ ⬭ Client       ⬡ Gateway         ▣ Core sys. │  Message queue        │
│ ◷ Scheduler    ◠ Rate limiter    ϟ Cache     │  Holds work until a   │
│                                              │  reader is free. If   │
│ Messaging      Data              Structure   │  the reader stops, it │
│ ⊂⊃ Queue       ⌭ Data store      ▯ Swimlane  │  buffers.             │
│ ⊂≡⊃ Stream     ⏡ Object storage  ⬚ Frame     │                       │
│ ╫ Event bus                      ◰ Note      │  Drag onto the sheet, │
│                                  Aa Text     │  or press ↵ to place  │
└──────────────────────────────────────────────┴───────────────────────┘
```

- **Left: the shelf.** Six groups by role, each a quiet label and a short list of cut-out plus name. No boxes around items; the highlighted row sits in a well. Arrow keys move through it as one grid (`rovingFocus.ts`); `↵` places the highlighted component at the centre of the view and closes the tray.
- **Right: the demo.** The highlighted component at full size on a panel tinted with its colour, running a three-second loop of what it does in a run, with its name and its one-line description. The loops:

| Behaviour | Components | What the capsules do |
|---|---|---|
| Starts traffic | Actor, Client, Scheduler | Leave on a beat |
| Passes it on | Service, Core system, Gateway | Go in one side and out the other |
| Spreads it | Load balancer, Stream, Event bus | One in, fanned to three |
| Turns some away | Rate limiter | Four pass; the fifth turns rose and falls back |
| Answers some itself | Cache | One turns round at the cache; the next goes through |
| Holds it | Message queue | Arrive fast, leave slowly |
| Keeps it | Data store, Object storage | Arrive and stay |

  Structure items (swimlane, frame, note, text) show a still picture. Under reduced motion every demo is a still picture of the loop's end state. The demo is user-triggered and explains behaviour, so it meets D10.
- **Top: search.** Matches names and a word list per component, built from the image lists in `src/importers/common.ts` plus common names (`s3`, `lambda`, `cron`, `postgres`). Typing `kafka` leaves one row, "Stream", with "named Kafka" under it; placing it names the new component "Kafka". Groups with no match disappear.

### 7.4 Create by wiring

Dropping a wire on empty sheet already creates a connected component. 3.0 keeps that and adds a choice without a dialog: the new component appears with a strip of four cut-outs above it, the kinds most likely to follow the source (a small table by source kind: after a gateway, a load balancer or service; after a service, a store, queue or cache; and so on). `←` `→` or a click changes the kind in place; typing starts naming it; anything else dismisses the strip. One gesture gives a wired, typed, named component.

---

## 8. The diagram

### 8.1 The sheet

- `--canvas` with a dot grid on a 24 px pitch in `--dot`. Dots fade below 50% zoom and drop to 45% opacity in Traffic and Review.
- **Swimlanes** are columns: a 34% `--sheet` wash between two `--hair` lines. The header sits inside the top of the column: the lane's number in `--ink-3` and its title at 15/600. Lanes are stages in order, so the number stays.
- **Frames:** a 1 px edge-colour outline, a tint wash at 40%, radius 10, the title on a tab that breaks the top-left corner.
- **Notes:** `--sheet`, a folded top-right corner (the cut-out's shape), sans throughout.

### 8.2 Components

Fits the existing boxes (D6). One anatomy for every rectangular kind:

```
┌───────────────────────────────┐
│ ┌──┐                        ● │  tile 30 · status light
│ │<>│                          │
│ └──┘                          │
│ Orders API                    │  title 15/600, two lines at most
│ Takes and tracks orders       │  subtitle 12, --ink-2
│                               │
│ Service              3 copies │  kind, left · readout, right, in mono
└───────────────────────────────┘
```

- **Surface:** `--sheet`, 1 px `--hair-2`, radius 10, contact shadow. No tint on the body.
- **Tile:** 30 px, radius 8, tint fill, edge border, the kind icon in the component's colour. The one place a card shows its colour.
- **Status light:** a 7 px dot at the top right. Grey in Design. In Traffic it is emerald with a soft halo while the component is up, and takes the state's colour otherwise (8.5). When a status is set it shows the word beside the dot.
- **Bottom line:** the kind name (or `eyebrow` if set, then `footerLeft`) on the left; the `chip` on the right as a mono readout. The three document fields are unchanged; only where they are drawn changes. No separators.
- **Badges:** has-child-level, comment and lock share one row at the bottom right, 14 px, `--ink-3`.
- **Shaped kinds** use their outline as the plate and carry their colour in it: the fill is `color-mix(in oklab, var(--t) 5%, var(--sheet))` and the 1.25 px stroke is `color-mix(in oklab, var(--t) 58%, var(--sheet))`. The title and subtitle are centred and there is no tile. A card shows its colour in the tile; a shaped kind shows it in the outline. The **actor** is its figure, tinted, over its name.
- **External** components keep the dashed outline and say "External" where the kind name goes.

### 8.3 Wires

| | Design | Traffic |
|---|---|---|
| Casing | `--canvas`, 6 px, under every wire | `--canvas-run` |
| Line | 1.75 px in the wire's colour; solid for sync, `6 5` dashes for async | Thins to 1 px at 55% |
| Tube | none | A 10 px band in the wire's colour at 20%, round caps: the conduit |
| End | Filled arrow for sync, open chevron for async, none for two-way | same |
| Traffic | none (D8), except on hover, selection or the selected component's paths | Capsules (9.2) |
| Label | Sans 11 px on `--sheet`, radius 5, protocol as a mono prefix in the wire's colour | Hidden unless on the active path |

- The casing makes a crossing read as over and under (G4).
- Sync and async now differ in the line and in the arrowhead, and nothing sits on top of either (G2).
- Label visibility by zoom: `high` always; `medium` only for hovered, selected or active-path wires; `low` never. "Always show wire labels" in the SE popover overrides this, and exports always show them (G3).
- Routing, lanes, waypoints and label placement code are untouched.

### 8.4 Lens lighting

| Lens | The sheet | Components | Wires |
|---|---|---|---|
| **Design** | `--canvas`, full grid | Full colour | Lines |
| **Traffic** | Dims to `--canvas-run`, grid at 45%, over 320 ms | Status lights come on | Tubes fade in; capsules start at the entry points and spread |
| **Review** | Grid at 45% | Greyscale at 62% | Greyscale at 62%; labels hidden |

**Redline (Review).** Each issue is circled on the sheet with a slightly irregular hand-drawn ellipse in `--redline`, 2 px, with its number beside it. The ellipse draws itself once in 700 ms when the lens opens. Numbers match the issue list and the dock. Warnings and notes use the same mark with a dashed line. The path comes from a small deterministic roughener seeded by the component id (the same module Sketch needs in Y2), so the mark never changes between renders. This replaces the insight badges and the rose and amber rail restyling (G5, G7).

### 8.5 States

One system: a ring, the status light, and a word. Colour never stands alone.

| State | Ring | Light and word | Body |
|---|---|---|---|
| Hover | 1 px `--hair-2` darkened | | |
| Selected | 2 px `--ink`, 3 px gap | | |
| On the selected path | 1 px in its colour | | |
| Dimmed | | | 35% |
| Failed | 2 px rose | rose, "Failed" | 6% diagonal hatch; tile tilts 8° |
| Degraded, slowed, delayed, at risk, buffering | 2 px amber (dashed for delayed and buffering) | amber and the word | |
| Rerouted, bypassed | 2 px blue, dashed | blue and the word | |
| Unreachable | 1 px `--ink-3`, dashed | grey, "Unreachable" | greyscale, 55% |
| Locked | | | lock in the badge row |

The nine `data-chaos` values and their meanings do not change (`src/studio/chaos.ts`); this maps them onto four looks.

### 8.6 Zoomed out: the map

Set `--cam-scale` on the stage where `data-lod` is set. At `low` (below 55%) the diagram reads like a transit map:

- A component shows only its plate and its title. The title is sized `clamp(15px, calc(12px / var(--cam-scale)), 34px)`, two lines, centred. Card kinds also keep the tile, enlarged.
- Wires are `calc(1.75px / var(--cam-scale))` wide, capped at 5 px, so lines stay lines.
- Lane titles counter-scale the same way.
- Shadows and badges are dropped.

At `medium` (55 to 80%): tile, title, subtitle, status light. At `high`: everything.

### 8.7 The title block

Engineering drawings carry one, and the document already has the fields. Every picture export (SVG, PNG, the first frame of a GIF) and the Present lens get a strip along the bottom edge: the mark, `title`, `systemTag`, `statusLabel`, the page name with "2 of 3", and the date. 11 px, `--ink-2`, hairline cells. It is on by default and can be turned off in the export dialog. It is what makes a pasted export look finished.

### 8.8 Diagram styles (V2's F4)

A style is a token set, applied to the sheet and to every export, separate from the app's theme.

| Style | Look |
|---|---|
| **Studio** | Everything above |
| **Blueprint** | A cyanotype: deep Prussian blue sheet, white linework, a fine line grid, wires told apart by dash pattern and not colour, components as outlines |
| **Sketch** | Every stroke through the roughener; flat tints; no shadows |
| **Print** | White sheet, black ink, colour on wires only, labels always shown |

Stored as `style?` on the document (schema v13).

### 8.9 Exports match

`diagramSvg.ts` draws components itself, and `standaloneHtml.ts` with `viewer.css` restyles the DOM renderer. **Every item in milestone C changes all three in the same PR** and re-records the `exportVisual` baselines. Exports use the Design look for stills, the Traffic look for GIFs and the HTML page, labels on, the title block, the document's style, and no selection.

---

## 9. Motion

### 9.1 Tokens

`--dur-fast` 120 ms, `--dur-base` 200 ms, `--dur-slow` 320 ms. `--ease-out: cubic-bezier(.2,.8,.2,1)` for things that leave or fade. `--spring: linear(0, .36 9%, .89 22%, 1.08 32%, 1.02 46%, .99 60%, 1)` for things that arrive. All durations are 0 under `prefers-reduced-motion`.

### 9.2 Vocabulary

| Moment | Motion | Means |
|---|---|---|
| Capsule in a tube | A 14 × 7 rounded capsule in the wire's colour, turning with the path, paced by `latencyMs` | A request or message |
| Capsule arrives | The status light blinks; the tile scales 1 → 1.14 → 1 with the spring | Received |
| Cache hit | The capsule turns round at the cache | Answered here |
| Rate limited | The capsule turns rose, shows `429` and falls back 12 px | Turned away |
| Queue filling | Capsules stack inside the pipe; draining releases them one by one | Backlog |
| Component fails | One shake, the tile tilts, the hatch fades in, its tubes empty | Down |
| Component restored | An emerald ring runs round it once, the tile rights itself | Back |
| Blast radius | Affected components change state in order of distance, 40 ms apart | The failure spreads |
| Cut-out reached for | Fills, lifts, springs (7.1) | Ready to take |
| Component dropped | Scales from 0.94 with the spring | It landed |
| Wire connected | The target port rings once | Attached |
| Deleted | Fades and scales to 0.96 in 120 ms | Gone; Undo brings it back |
| Lens thumb | Springs to the new segment | Where you are |
| Dock changes face | Cross-fades; the width springs | Different instrument |
| Lights down | The sheet dims over 320 ms; tubes fade in | The system is on |
| Redline | Each mark draws itself once | A reviewer marked this |
| Scenario finishes | The path's tubes brighten once, start to end | That was the route |
| Review reaches zero | The marks fade and the colour returns | Nothing left to fix |
| Tray, inspector, popovers | Rise or slide 14 px with the spring; leave in 120 ms | Opened from there |

Nothing loops in Design. Nothing plays twice for one cause. Nothing delays input. Capsules are SVG so they export to GIF.

---

## 10. Engineering approach

### 10.1 New and replaced modules

| New | Replaces | Notes |
|---|---|---|
| `src/studio/slots.ts`, `styles/slots.css` | The `layout` layer's bars and panels | The seven-slot grid |
| `src/studio/dock.ts` | `toolRail.ts`, `runBar.ts` markup, the rail in `index.html` | Faces subscribe to lens state (`core/lens.ts`) |
| `src/studio/componentTray.ts` | `#stencil-grid`, `.palette-section`, the palette half of `responsiveToolbar.ts` | Lazy chunk, loaded on first open |
| `src/studio/componentDemos.ts` | none | Lazy, with the tray |
| `STENCIL_CATALOG` in `src/templates/presets.ts` (extend) | the panel's own labels and descriptions | Add to each `StencilDefinition`: group, run-time description, search words, demo type, likely next kinds |
| `src/ui/cutout.ts` | kind icons in chrome | Draws a cut-out from `nodeShapePlate` geometry; used by dock, tray, inspector, contextual toolbar |
| `src/core/roughen.ts` | none | Pure, seeded; used by redline now and Sketch later |
| `src/exporter/titleBlock.ts` | none | Pure SVG; used by every picture export |

Actions stay in the registry: `open-insert` opens the tray; tools, lenses and run controls keep their ids. The command palette, menu and shortcuts need no change.

### 10.2 CSS

1. **Split first.** Z2 cuts `studio.css` into one file per region with no change to the built output.
2. **Target files:** `tokens.css`, `base.css`, `ui.css` (button, field, switch, stepper, segmented, popover, dialog), `slots.css`, `islands.css`, `dock.css`, `tray.css`, `inspector.css`, `sheet.css` (canvas, lanes, frames, notes), `node.css`, `wire.css`, `states.css`, `lens.css` (lighting and redline), `motion.css`, plus the existing feature files. `tokens`, `node`, `wire`, `states`, `lens` and `motion` are what the HTML export shares.
3. **Tokens flip.** T1 makes `--cc-*` the source and turns surviving `--wl-*` into aliases; R1 deletes them.
4. **Budgets:** entry CSS ≤ 112 kB after T, ≤ 106 kB after S, ≤ 100 kB at R1, then lower the limit to 104 kB. Entry JS may grow by at most 8 kB over all of 3.0; the tray chunk is at most 30 kB. Fonts are at most 150 kB together and get their own line in `tools/checkBundleSize.mjs`.

### 10.3 What must not change

- `src/core/` behaviour: parsing, layout, routing, reachability, insights, schema (until Y1).
- Shortcuts (D11) and the action registry's ids.
- Component box sizes (D6) and every file format.
- The announcer, roving focus, and every accessible name on an element that survives.

### 10.4 Seeing what changed

Z3 adds `e2e/v3Visual.spec.ts`: eight views, both themes, 1440 × 900, with `reducedMotion: 'reduce'`. Each PR re-records only what it meant to change and attaches before and after.

1. Showcase, Design, Fit.
2. Showcase, Design, 100%, one component selected.
3. Showcase, Design, tray open with "Message queue" highlighted.
4. Showcase, Traffic, paused mid-scenario.
5. Showcase, Traffic, one component failed.
6. Showcase, Review.
7. Blank sheet with first run.
8. Home.

### 10.5 Accessibility

All of V1 section 10 applies. What this redesign can break: zero axe violations in every lens and theme; the dock is a `toolbar` with roving focus and each cut-out has its component's name; the tray is a labelled region whose shelf is a `grid`, with the description announced for the highlighted row; focus returns to the dock when the tray closes; the ink focus ring is visible on every island in both themes; text contrast is measured against the solid island colour (D15); the Review lens's greyscale never drops text below 4.5:1; every state has a word (8.5); counter-scaled text at `low` is never under 11 px on screen.

---

## 11. The queue

**Done** always also means section 12.

### Milestone Z: Groundwork

#### [x] Z1. Branch and baseline · S
- **Do:** create `v3`. Run `pnpm test`, `pnpm build`, `pnpm check:size`, `pnpm test:e2e`; write counts and sizes into the table at the end of this section. Save the eight views (10.4) to `docs/v3/before/` (view 3 as the current component panel, open).
- Branch `v3` cut from `v3-plan` at `5b42b5c` (`main` is `2d9115c`, release 2.2.1). Pull request #95.
- The eight views are in `docs/v3/before/`, light and dark, 1440×900, reduced motion. View 2 is at 99%, the nearest zoom step to 100%. View 3 is the current component panel with Message Queue highlighted. View 7 is the current first run (the showcase in Traffic, with the three actions); reduced motion shows the failed state at once, so it is not a blank sheet.
- The untracked owner file `e2e/zz_debug.spec.ts` was not changed. The Playwright run excluded that one test (`--grep-invert '^debug$'`).

#### [x] Z2. Split `studio.css` by region · M
- **Read:** `studio.css` top to bottom; `src/main.ts`; `src/exporter/standaloneHtml.ts`.
- **Done:** built entry CSS within 200 bytes of baseline; no visual diff. **Needs:** Z1.
- `studio.css` is the import list. Each existing `@layer` is its own file under `src/styles/studio/`: reset, tokens, layout, palette, components, stage, inspector, dialogs. The tail after `@layer dialogs` stays unlayered in `unlayered.css`, because unlayered rules beat every layer. The empty `utilities` layer stays in the order statement and has no file. `shared.css` stays an `@import`. The HTML export does not include `studio.css` (`standaloneHtml.ts` still inlines `shared.css`, `viewer.css`, and `frames.css` only).
- Built entry CSS is byte-identical to the Z1 baseline: `index-CS3wg9RI.css`, 112663 bytes (110.0 kB). Unit tests 894 passed. The later names in 10.2 (`base.css`, `ui.css`, `slots.css`, and the rest) are not this split.
- Pull request #96.

#### [x] Z3. Visual check for the eight views · S
- **Done:** passes twice in a row with no diff. **Needs:** Z1.
- `e2e/v3Visual.spec.ts` takes the eight views in 10.4, light and dark, 1440×900, reduced motion. View 2 is at 99%. View 3 is the current component panel with Message Queue highlighted. View 6 is a fresh Review load, so a failure from another view cannot leak into it. View 7 is the current first run, which shows the failed state at once under reduced motion. The Home card is dated 15 Jan 2020 so its label does not move.
- Baselines are in `e2e/__screenshots__/v3Visual.spec.ts/`. The comparison uses the same slack as the export pictures (`maxDiffPixelRatio` 0.03), because text uses the system fonts.
- The spec passed twice in a row with no diff.
- Pull request #97.

#### [ ] Z4. Fonts · S
- **Do:** add Instrument Sans and Geist Mono as self-hosted `woff2`, Latin subset, with their licence files; `@font-face` with `swap` and a size-adjusted fallback; precache them; add the font budget line. Confirm tabular figures work in Instrument Sans; if they do not, use Geist Mono for changing numbers and say so here.
- **Done:** offline test passes; fonts ≤ 150 kB; no layout jump on load in view 1. **Needs:** Z1.

### Milestone T: Foundations

#### [ ] T1. Tokens and the two themes · M
- **Read:** `shared.css`, `tests/contrast.test.ts`, `src/shared/colorSchemeBoot.js`, the mockup's `:root`.
- **Do:** 5.1. One `[data-theme]` mechanism in place of the three copied blocks. Remove glows, gradients and inset highlights.
- **Done:** every pair in 5.1 is asserted in the contrast test; the squint test passes on view 1. **Needs:** Z2, Z3.

#### [ ] T2. Type · M
- **Do:** 5.2. The scale as tokens; 88% width on the sheet; mono only for literal things; no uppercase.
- **Done:** `grep -c 'text-transform: uppercase' src/styles` is 0; `tests/plainLanguage.test.ts` passes. **Needs:** T1, Z4.

#### [ ] T3. Primitives · M
- **Do:** `ui.css` per 10.2, converting existing markup and deleting old button and field variants.
- **Done:** one dialog shell serves every dialog; entry CSS ≤ 112 kB. **Needs:** T2.

#### [ ] T4. Icons and the cut-out · M
- **Do:** 5.4 and `src/ui/cutout.ts` (7.1), with a unit test that every entry in `STENCIL_CATALOG` yields a cut-out.
- **Needs:** T1.

#### [ ] T5. Two more colours: cyan and fuchsia · M
- **Read:** `src/types.ts` (`StreamTone`), `src/shared/tones.ts`, `src/core/meta.ts`, `src/core/frames.ts`, `src/core/parser.ts` (`normalizeTone`, `COLOR_NAME_MAP`, `FRAME_TONES`), `src/importers/common.ts` (hue buckets), `src/templates/presets.ts` (the tone list), `src/exporter/blueprintJson.ts`, `diagramSvg.ts`, `standaloneHtml.ts`, `shared.css`.
- **Do:** add `cyan` and `fuchsia` to `StreamTone` and to every list above, with the values in 5.1 and the names "Data" and "Security". In the parser, the words `cyan`, `teal`, `aqua`, `data` map to `cyan`, and `fuchsia`, `magenta`, `security`, `auth` map to `fuchsia`. In colour imports, hue 170 to 205 becomes `cyan` and 285 to 330 becomes `fuchsia`. Show seven dots in the colour pickers, the legend and the Traffic colour filter. No schema bump: nothing changes shape, and 2.x reads an unknown tone as blue (assert this in a test).
- **Do not:** change any stencil's default colour (Q9), or recolour templates.
- **Done:** both tones round-trip through Blueprint YAML and JSON, appear in SVG and HTML exports, and pass `tests/contrast.test.ts` in both themes; the `TONES` lists in `tests/showcase.test.ts`, `flashSaleShowcase.test.ts` and `llmRules.test.ts` and the tone list in `docs/guide.md` and `docs/llm-rules.md` are updated. **Needs:** T1.

### Milestone S: Shell

#### [ ] S1. Seven slots · M
- **Read:** the `layout` layer; `index.html` lines 20 to 460; `responsiveToolbar.ts`.
- **Do:** 6.1. Move the existing top-bar controls into NW, N and NE as they are; move pages to SW and zoom to SE; remove the status, coach and search cards in favour of the hint line and `⌘F` opening the existing find in a popover.
- **Done:** a new Playwright test asserts no two islands' boxes intersect at 800 × 600, 1280 × 800 and 1440 × 900 in every lens, with a selection and with the tray open. **Needs:** T3.

#### [ ] S2. Top and corner islands · M
- **Do:** 6.2 and 6.3, including the legend and view popovers.
- **Done:** `e2e/topbar.spec.ts` rewritten to count controls per island (8 at most); `tagsLinks.spec.ts` passes. **Needs:** S1.

#### [ ] S3. Dock, Design face · M
- **Read:** `toolRail.ts`, `pointerTool.ts`, the stencil wiring in `interactions.ts`.
- **Do:** 6.4 and 7.1 to 7.2: tools, six cut-outs, drag out, click to arm, favourites.
- **Done:** `e2e/toolRail.spec.ts` rewritten and passing; every tool and favourite reachable by keyboard and touch. **Needs:** S1, T4.

#### [ ] S4. Component tray · L, split
- **S4a · M:** shelf, keyboard grid, place with `↵`, drag out, drag to the dock, close and focus return (7.3).
- **S4b · S:** search with the word table and "named X" (7.3).
- **S4c · M:** the demo pane and its seven loops, lazy (7.3).
- **Done:** a spec for each of: open with `C`, arrow to a component, place it; type `kafka`, place it, the component is a stream named "Kafka"; reduced motion shows stills. **Needs:** S3.

#### [ ] S5. Dock, Traffic and Review faces · M
- **Read:** `runBar.ts`, `simulationPlayback.ts`, `chaos.ts`, `studio/insights.ts`.
- **Do:** 6.4. Run-control ids are kept.
- **Done:** `e2e/runBar.spec.ts`, `chaos.spec.ts`, `insights.spec.ts` pass. **Needs:** S3.

#### [ ] S6. Inspector · L, split
- **S6a · M:** island, header with cut-out, tabs, row and control styles.
- **S6b · M:** move each field into its tab.
- **Done:** every field that existed still exists with the same accessible name. **Needs:** T3, T4.

#### [ ] S7. Create by wiring · S
- **Read:** `interactions.ts` around line 521.
- **Do:** 7.4, with the "likely next" kinds in `STENCIL_CATALOG` and a unit test in `tests/stencils.test.ts`.
- **Needs:** S3.

#### [ ] S8. Menus, command palette, contextual toolbar, dialogs, toasts · M
- **Needs:** T3, T4.

#### [ ] S9. Templates, Home, first run · M
- **Read:** `templatesGallery.ts`, `homeScreen.ts`, `firstRun.ts`.
- **Done:** every template shows its title; thumbnails follow the theme. **Needs:** T3, C6.

#### [ ] S10. Narrow and touch · M
- **Do:** 6.6.
- **Done:** views 1 to 6 checked at 375, 768 and 1024 px; `e2e/touch.spec.ts` rewritten and passing; `a11y.spec.ts` passes. **Needs:** S1 to S9.

### Milestone C: The diagram

Every item updates `diagramSvg.ts`, `standaloneHtml.ts` and the shared styles in the same PR (8.9).

#### [ ] C1. Sheet, swimlanes, frames, notes · M
- **Read:** `keyedStage.ts` lines 100 to 440, `frameStage.ts`, `frames.css`. **Do:** 8.1. **Needs:** T2.

#### [ ] C2. Components · L, split
- **Read:** `keyedStage.ts` lines 878 to 1560, `core/nodeStyle.ts`, `diagramSvg.ts`.
- **C2a · M:** card kinds (8.2). **C2b · M:** shaped kinds, actor, small boxes, external.
- **Done:** every kind and shape in the showcase fits its box with no clipped text at 100%. **Needs:** T2, T4.

#### [ ] C3. States · M
- **Do:** 8.5. **Done:** a new `e2e/states.spec.ts` asserts each state's word is visible. **Needs:** C2.

#### [ ] C4. Wires · M
- **Read:** the `conduit` code in `keyedStage.ts`; `studio.css` 1300 to 1400.
- **Do:** 8.3 for the Design look, label rules, and D8 with its preference.
- **Done:** on view 1, sync and async can be told apart in a still. **Needs:** C1.

#### [ ] C5. Lens lighting · M
- **Do:** 8.4: lights down, tubes, status lights; `core/roughen.ts` with unit tests; redline marks.
- **Done:** views 4 and 6 match the mockup's Traffic and Review. **Needs:** C3, C4.

#### [ ] C6. The map, the title block, export audit · M
- **Do:** 8.6 and 8.7; compare canvas with SVG, PNG, HTML and GIF exports in both themes and fix every difference; re-record README media.
- **Done:** a test at Fit on the showcase asserts every title renders at 11 px or more; every picture export carries the title block. **Needs:** C1 to C5.

### Milestone M: Motion

#### [ ] M1. Capsules · M
- **Read:** `simulationPlayback.ts`, `queueBacklog.ts`, `exporter/gif.ts`. **Do:** the capsule rows of 9.2. **Needs:** C5.

#### [ ] M2. Failure, recovery, finish · S
- **Needs:** C3, M1.

#### [ ] M3. Editing feedback · S
- **Do:** drop, connect, delete, and the remaining rows. **Needs:** S3, C2.

### Milestone Y: Diagram styles

#### [ ] Y1. Style plumbing, Blueprint, Print · M
- **Do:** 8.8, schema v13 with migration and round-trip tests, the picker in the view popover. **Needs:** C6.

#### [ ] Y2. Sketch · M
- **Needs:** Y1, C5 (the roughener).

### Milestone R: Release

#### [ ] R1. Remove the old skin · S
- **Done:** `grep -c -- '--wl-' src` is 0; entry CSS ≤ 100 kB; `toolRail.ts` and the old panel markup are gone.

#### [ ] R2. Final review · S
- **Do:** the three tests in section 2 and V1's award checklist; save the eight views to `docs/v3/after/`.

#### [ ] R3. Ship 3.0.0 · S
- **Do:** release notes, guide screenshots, version, merge `v3` into `main`.
- **Needs:** the owner's go-ahead. Do not merge to `main` without it.

### Baseline (filled in by Z1)

| Measure | Value |
|---|---|
| Unit tests | 894 passed, 0 failed |
| Playwright specs / tests | 58 spec files, 334 passed, 0 failed (3.8m). Excludes the untracked `e2e/zz_debug.spec.ts`. |
| Entry JS | 530.7 kB / 540 kB (`index-B45Y4etN.js`) |
| Entry CSS | 110.0 kB / 115 kB (`index-CS3wg9RI.css`) |

---

## 12. Definition of done (every PR)

```bash
pnpm test
pnpm build
pnpm check:size
pnpm test:e2e
```

Paste the summary lines into the PR. Also:

- Before and after images of every view the PR meant to change, both themes, beside the same state in the mockup.
- The same change is in the SVG and HTML exports, baselines re-recorded (milestone C).
- The surface it replaces is deleted in the same PR (D13); entry CSS is at or below its checkpoint.
- No shortcut changed. No spec skipped: a spec for a replaced surface is rewritten (D12).
- Zero axe violations; reduced motion stops everything; reduced transparency makes islands solid.
- New strings follow the word list and 5.5.
- This file is updated.

---

## 13. Open questions, with defaults

Use the default if the question is open when its item comes up, and say so in the PR.

| # | Question | Needed by | Default |
|---|---|---|---|
| Q1 | Ship Instrument Sans and Geist Mono (D3), about 150 kB of fonts? | Z4 | Yes |
| Q2 | Still Design lens | C4 | **Answered 2026-11-09 (owner): yes**, with the preference in D8 |
| Q3 | Should an exported SVG embed the font? It adds weight to files that the GitHub Action commits to repositories. | C6 | Embed in the app's exports; do not embed from the CLI and the Action, which fall back to system fonts |
| Q4 | Theme names "Vellum" and "Graphite", or plain "Light" and "Dark"? | T1 | Show "Light" and "Dark" in the UI; the names are for this plan |
| Q5 | Do dock favourites adapt to what you use most, or stay where you put them? | S3 | Stay where you put them |
| Q6 | Is greyscale in Review too strong for people who review while editing? | C5 | Keep it, with "Keep colour in Review" in the view popover |
| Q7 | Is the title block on by default in exports? | C6 | Yes |
| Q8 | One release, or shell first and diagram second? | R3 | One release from `v3` |
| Q9 | Should new data stores and object storage default to `cyan` ("Data") instead of emerald? | T5 | No. Defaults stay; the new colours are there to be chosen |
