# ConduitCraft

**ConduitCraft** is an open-source, interactive architecture diagramming studio with animated traffic and scenarios. Build system architectures from scratch on a blank drafting canvas (like draw.io), or import standard **Mermaid (`.mmd`)** flowcharts and **Blueprint Markdown (`.md`)** files to render animated telemetry conduits, contextual lineage inspectors, specification matrices, and live packet simulations.

## Interactive Export Previews

ConduitCraft exports self-contained, interactive standalone HTML architectures and animated GIF recordings with zero external runtime dependencies. Here is how exported diagrams look in action:

### 1. Whole Architecture View
Full end-to-end overview of a distributed system architecture showing animated packet conduits, stage swimlanes, and multi-tier components.

![Whole Architecture View](docs/images/lumen-relay_whole.gif)

### 2. Scenario Simulation Run View
Multi-step packet trace simulation ("Clear Night Run") dynamically animating traffic propagation across edge gateways, message brokers, and datastores with live execution highlights.

![Scenario Simulation Run View](docs/images/lumen-relay-clear-night_scenario.gif)

### 3. Zoomed-In Inspection View
Detailed close-up inspection view highlighting directional port wiring, custom status indicators, telemetry metrics, and multi-wire routing.

![Zoomed-In Inspection View](docs/images/lumen-relay-zoomed-view.gif)

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
- **Mermaid Import & Blueprint (`.md`) Files**
  - Open, drop or paste standard Mermaid flowcharts, with line-numbered validation diagnostics. Subgraphs import as swimlanes or as levels.
  - Mermaid is import only: ConduitCraft never writes a `.mmd` file, and saving a diagram opened from one offers a Blueprint file instead. The Blueprint file (YAML frontmatter plus a Mermaid block) is the text format it writes.
- **Zero-Dependency Exports**
  - Export a round-trippable **Blueprint JSON (`.blueprint.json`)** file that keeps the whole document, a short looping **GIF** of the telemetry animation, self-contained **Interactive Animated HTML (`.html`)** pages, or **SVG** and **PNG** pictures.

## Documentation

The [guide](./docs/guide.md) is the Blueprint YAML schema, the wire routing modes, and the keyboard shortcuts.

## Quick Start

Requires Node.js 22.6 or newer (the tests use Node's built-in TypeScript support) and [pnpm](https://pnpm.io). An `.nvmrc` is included, so `nvm use` picks the right version.

```bash
pnpm install
pnpm dev
```

Run the test suite and production build:

```bash
pnpm test
pnpm build
```

The browser tests (Playwright) build the app and drive it in Chromium. Install the browser once, then run them:

```bash
pnpm exec playwright install chromium
pnpm test:e2e
```

## License

Released under the [MIT License](./LICENSE).
