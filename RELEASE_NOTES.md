# Release notes

## Unreleased

- **Layered layout (ELK).** **Auto-Layout: Layered (ELK)** in the command palette arranges the diagram in layers with fewer crossings, keeps fixed wire ends on their side and zones in order, leaves locked components alone, glides the components into place and is one undo step. The ELK library loads only when you use it; the built-in layout is still the default.
- **Drift check.** **Check for Drift** (command palette) compares a diagram with a newer Docker Compose, Kubernetes, OpenAPI or AsyncAPI file and lists what was added, dropped or changed, with Accept and Ignore for each (one undo step). `pnpm conduitcraft drift` does the same on the command line, and the GitHub Action's new `drift` input fails a job when a source file has moved on.
- **Command line and GitHub Action.** `pnpm conduitcraft render`, `check` and `diff` work on Blueprint files, JSON and Mermaid, with no browser; the Action checks and renders every diagram in a repository and comments on pull requests with what changed.
- **Live code pane.** `Cmd/Ctrl+/` shows the Blueprint file beside the canvas. Type and the canvas follows after a short pause, one undo step per pause; text with problems keeps the last good canvas and marks the lines; selecting on the canvas highlights its lines, and the cursor in a block selects it. Group, container and swimlane shapes in a draw.io file now import as frames.
- **Frames, part 2.** Group into Frame, duplicate and lock a frame, move one with `Alt+Arrow`, notes and text labels move with the frame around them, frames show in the outline, the description and the minimap, and Mermaid subgraphs can import as frames.
- **Pages.** One file can hold several diagrams, shown as tabs along the bottom of the canvas. Add, rename, reorder, duplicate and delete pages from the tab strip, its menu or the command palette; `Alt+PageDown` and `Alt+PageUp` change page. Existing files open as one page. The file format moves to version 11; files saved with pages need this version or later. The outline, Review, Find and replace, the exports and Home all know about pages, and a draw.io file with several pages opens as page tabs ("Pages as levels" is gone).
- **The Classic layout is removed.** `?ui=1` and the "Classic layout" setting are gone, and so is the old header's overflow menu. A saved Classic preference is dropped once, with a notice. Nothing in your diagrams changes.

## 2.0.0

The redesign: a quieter app that shows what happens when something fails.

### Two things to know first

- **Classic layout goes away in the next release.** The `?ui=1` layout and the "Classic layout" setting still work in 2.0.0. The next release removes them. Move to the default layout now; every action in Classic is in the new top bar, the tool rail, the context menu or the command palette (`⌘K`).
- **Mermaid is now import only.** ConduitCraft still reads Mermaid flowcharts (paste, open or drop). It no longer writes them: there is no `.mmd` export and no Mermaid view in the code dialog. The Blueprint file (YAML or JSON) is the one text format ConduitCraft writes.

### New

- **First run.** A new visitor sees a packet travel in about 3 seconds and a failure ripple out within 10, with three actions: pick a template, start blank, paste Mermaid.
- **Lenses.** Design, Traffic and Review (keys `1`, `2`, `3`), each with its own tools.
- **Fail a component.** Press `X` in the Traffic lens (or use the menu). See what is cut off, with resilience settings (replicas, fallback, circuit breaker), a summary panel, a blast-radius preview with `Alt`, and saved scenarios. Failures cross levels in one direction: a failed component fails everything in its child level.
- **Review lens.** Eight architecture rules, canvas badges and an issues panel, with per-rule muting.
- **Levels.** Drill into a component with `⌘↵`, go back with `⌘↑` or `Esc`. One undo stack covers all levels. Mermaid `subgraph` blocks can import as levels.
- **Wire protocol and latency.** Each wire has a protocol and a sync or async call style; latency sets the pace of the packets.
- **Legend, tags, owners and links.**
- **Text outline and diagram description.** A keyboard-friendly outline panel, and a plain-language description of the diagram used as alt text in the PNG dialog, the SVG `<desc>` and the standalone HTML export.
- **Contextual help.** Short popovers and help topics, and a fuller guide.
- **Quieter chrome.** A top bar with at most 8 controls, a tool rail, a contextual toolbar, a run bar, an inspector that appears with a selection, and plain-language wording throughout.

### Changed

- The file schema is version 7. Older files migrate on open.
- Starter templates load on demand, and every lazy chunk has a size budget.
- The README and its pictures show the new layout.
