# ConduitCraft

**ConduitCraft** is an open-source, interactive architecture diagramming and live telemetry studio. Build system architectures from scratch on a blank drafting canvas (like draw.io), or import/sync standard **Mermaid (`.mmd`)** and **Blueprint Markdown (`.md`)** files to render animated telemetry conduits, contextual lineage inspectors, specification matrices, and live packet simulations.

## Highlights

- **Blank-Canvas Visual Authoring (`✎ Design` Mode)**
  - Drag and drop 7 architectural stencils (**Human Actor**, **Core System**, **Service**, **Event Broker**, **Decision Gate**, **Data Store**, **Client Edge**) plus **Swimlane Stage** banners and **Notes / Spec** checklist cards.
  - Drag between directional ports (`top`, `right`, `bottom`, `left`) or use **Connect** mode to wire animated telemetry streams.
  - **9 Distinct Per-Wire Routing Styles** with a visual schematic picker: `Smart Auto`, `Direct Line`, `Smooth S-Curve`, `Curved Arc`, `Vertical Fan-out`, `Rounded Elbow`, `Sharp Step`, `Under U-Loop`, and `Over U-Loop`, plus draggable wire waypoints and automatic parallel-wire lane separation.
  - **Multi-Select & Alignment**: `Shift+click` or `Shift+drag` marquee box to select multiple components, move groups together, and align/distribute from the property inspector.
  - **Autosave & Session Recovery**: Debounced local storage autosave with 1-click session restore.
- **Animated Telemetry & Simulation (`Data View` Mode)**
  - Filter stream channels by tone (`Primary`, `Success`, `Exception`, `Control`).
  - Click any component to highlight upstream sources and downstream consumers while dimming unrelated paths, and inspect custom telemetry metrics and JSON contracts.
  - Trigger multi-step **Live Packet Simulations** with real-time execution traces.
- **Bidirectional Mermaid (`.mmd`) & Blueprint (`.md`) Compiler**
  - Edit or paste standard Mermaid flowcharts or YAML-frontmatter Blueprint documents with line-numbered validation diagnostics.
- **Zero-Dependency Exports**
  - Export self-contained **Interactive Animated HTML (`.html`)** pages, **SVG** and **PNG** pictures, round-trippable **Blueprint Markdown (`.md`)** and **Blueprint JSON (`.blueprint.json`)**, or standard **Mermaid (`.mmd`)**.

## Documentation

The [guide](./docs/guide.md) is the Blueprint YAML schema, the wire routing modes, and the keyboard shortcuts.

## Quick Start

```bash
pnpm install
pnpm dev
```

Run the test suite and production build:

```bash
pnpm test
pnpm build
```

## License

Released under the [MIT License](./LICENSE).
