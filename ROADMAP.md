# ConduitCraft (Blueprint Studio) — Improvement Roadmap

Ordered from most to least valuable. Status: `[ ]` todo, `[~]` in progress, `[x]` done.

## Must-have (data safety and trust)
- [x] 1. **Autosave and recovery**: debounced autosave, restore-session prompt, `beforeunload` warning when unsaved.
- [x] 2. **Automated tests**: unit/integration tests for parser/layout/round-trips/routing modes; `pnpm test` script.
- [x] 3. **Import validation and clear errors**: unknown IDs, duplicate IDs, bad YAML; visible line-numbered import report.

## High value (editing power)
- [x] 4. **Multi-select**: shift-click, marquee, group move, group delete, align/distribute.
- [x] 5. **Draggable wire waypoints**: drag wire midpoint handle to nudge its path, double-click or click button to reset.
- [x] 6. **Keyboard and screen-reader access for wires**: focusable wires (`tabindex="0"`), `aria-label`, `Enter`/`Space` to select, `Delete` on selected wire.
- [x] 7. **Copy / paste**: `Ctrl/Cmd + C / V` and `Ctrl/Cmd + A` for selected elements.
- [x] 8. **Routing edge cases**: obstacle-aware U-loops, parallel-wire lane offsets, badge overlap avoidance.

## Medium value (architecture and performance)
- [x] 9. Split `main.ts` into modules (state, render, inspector, interactions).
- [x] 10. Incremental rendering (keyed diffing) instead of full DOM rebuilds.
- [x] 11. Remove duplicated CSS/logic between `standaloneHtml.ts` and the studio.
- [x] 12. Single selection controller emitting change events.

## Nice-to-have (polish and features)
- [ ] 13. Minimap and fit-selection.
- [ ] 14. Undo grouping (one undo step per gesture).
- [ ] 15. More node shapes and custom icon/image upload.
- [ ] 16. SVG / PNG export and single-file `.blueprint.json`.
- [ ] 17. Simulation editor UI in Data View.
- [ ] 18. Touch and pen gestures (pinch zoom, two-finger pan, larger ports).
- [ ] 19. Theming and branding controls for exported pages.
- [ ] 20. Docs: YAML schema reference, routing modes, shortcuts, screenshots.
