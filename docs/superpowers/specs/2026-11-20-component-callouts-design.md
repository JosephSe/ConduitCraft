# Component callouts

## Intent

HLD diagrams sometimes need a short fact on one component that a reader must not miss. For example, "Resident loses access at midnight" or "Sorter in maintenance 12am–2am". A callout is a small speech-bubble card tied to one component. Its tail points at the component, and it moves with it. Readers see it in Design and in every picture export (PNG, GIF, canvas SVG, HTML).

It is a static annotation for people reading the design. Traffic, Review and scenarios do not use it.

## Goals

- Attach one or more callouts to a component, each with free text (one or more lines).
- The callout sits beside its component, with a tail pointing at it. It moves when the component moves, and can be dragged to any side.
- A tone sets the colour and icon: **info**, **warning** or **time**.
- It looks the same on the canvas and in PNG, GIF, canvas SVG and the HTML export, in light and dark and in every diagram style.
- It is saved in the document and in the code view, and survives copy, paste, undo and import/export.

## Non-goals

- No time parsing, scheduling, or effect on Traffic, scenarios or failure runs. "12am–2am" is just text.
- No callouts on wires, zones or notes. They attach to components only.
- No automatic collision avoidance with wires or other components in this version.
- The plain vector `.svg` export does not draw note cards today, and will not draw callouts either. That is the known existing gap.

## Anti-goals

- A callout that becomes detached and floats away from its component after a move, paste or layout change.
- A callout that shows in Design but is missing or restyled in an export.
- Replacing the existing component **comment**. That stays a reviewer's note behind a badge.

## Approaches considered

- **A. Attached callout bubble (chosen).** A note-like card linked to a component, with a tail. It reads at a glance, and the note card's rendering and export path already exist. Trade-off: a crowded diagram can run out of room.
- **B. Flag inside the component card.** Never collides with anything, but fits only a short line and makes cards taller, which shifts layout.
- **C. Numbered pin and legend.** Keeps the canvas clean with many notes, but readers must look things up, which is weak for a one-glance HLD.

## Design

### Data

A third variant of `DiagramNotesCard`: `variant: 'callout'`, alongside the plain note and `'text'`. New fields, used only for callouts:

- `anchorId: string`: the component it belongs to.
- `dx`, `dy`: the bubble's offset from the component's top-left, in stage px. The absolute `x` and `y` are derived from the component's position plus this offset, so the callout follows the component by construction. *(My call: storing an offset, not absolute x/y, is what makes "never detached" hold through moves, auto-layout and paste.)*
- `tone?: 'info' | 'warning' | 'time'`: absent means info.
- The text is `title`. `width` works as it does for notes. `items` are unused.

The format version goes up by one (14 → 15). Older documents load unchanged.

### Look

- A rounded card in the note style, tinted by tone: info uses the blue family, warning amber and time violet. Each tone has a small leading icon: ⓘ, ⚠ or ⏱. *(My call; easy to change.)*
- A tail (a small triangle) runs from the bubble's edge nearest the component, pointing at the component's nearest edge. The side is worked out from the offset, so dragging the bubble below the component moves the tail to its top.
- The default placement is above the component, centred, with a small gap. A second callout on the same component stacks above the first.

### Behaviour

- **Adding one:** from the component's right-click menu, choose "Add callout", or use the inspector's Notes tab. This creates an info callout with its text selected for editing.
- **Editing:** double-click to edit the text inline, as notes work now. The inspector shows the text, the tone, and the component it belongs to.
- **Moving:** dragging the bubble changes `dx` and `dy`. Dragging the component moves its callouts with it.
- **Deleting the component** deletes its callouts. Undo restores both.
- **Copy and paste, or duplicating a component,** copies its callouts and re-links them to the new component. Copying a callout alone pastes it onto the same component.
- **Code view** gets a line form for callouts that links them by component id, following the existing note syntax.
- **Z-order:** callouts draw above components and wires so the tail is never hidden.
- **At Fit zoom** (low detail), the callout stays readable. It is not hidden.

### Exports

Picture exports clone the live stage, so callouts render as on canvas. The HTML export draws note cards through `standaloneHtml.ts`, which needs the callout variant and tail added. The `blueprintJson` export carries the new fields.

## Constraints

- The entry JS budget goes from 575 kB to 580 kB (owner's decision), because it is currently at about 574.8 kB. The callout code loads with the rest of the entry, not on demand. It should stay as small as is reasonable.
- The entry CSS budget is 135 kB, and current use is 134.6 kB.
- The HTML export chunk budget is 100 kB, and current use is 98.5 kB.

## Left to the builder

- The exact tail geometry and gap sizes.
- How the line in the code view is spelled, following the existing note syntax.
- The test split. Expected: unit tests for the offset maths, parse and serialise round-trip, and delete, paste and undo; an e2e check that a callout appears in the PNG and HTML exports.
