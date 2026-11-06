# Release notes

## 2.2.1

- **Paste across tabs now works for swimlanes, frames and notes.** Copying one of these on its own did nothing, so pasting in another tab said the clipboard held no components. Cmd+C now copies whatever is selected.
- **Select All then copy takes everything.** Frames are included, and the components inside them stay in their frames when pasted.
- **Pictures survive a copy.** Component pictures are left out only when a copy passes 2 MB, up from 8 KB, so a pasted diagram keeps its icons.

## 2.2.0

- **Copy and paste stage containers.** Cmd+C and Cmd+V now take swimlanes, frames and note cards as well as components. Copying a frame brings the frames inside it, the components it owns and the notes sitting in it, and a pasted frame keeps them together. A pasted swimlane lands beside the original, and a pasted copy starts unlocked. It works across tabs and diagrams.
- **Tools always in reach.** Select, Wire, Hand, Text and Frame stay on show when the component list is open, as a row above it; before, opening the list hid them all. Stage Containers now has Frame and Text. The folded rail scrolls, so Swimlane and Note can be reached on any window height. On a tablet, picking a tool closes the drawer.
- **Top-bar menu.** A new menu button lists the actions that had no button: Home, New Diagram, Templates, Your Diagrams, Save, Open, Import, Export, Find and Replace, Auto-Layout, Text Outline, Code Pane, Specification Matrix, Snapshots, Presentation, Preferences and Keyboard Shortcuts.
- **Rules for AI chats.** [docs/llm-rules.md](docs/llm-rules.md) teaches any language model to turn an image, whiteboard photo, draw.io file, Mermaid, PlantUML or C4 model into a Blueprint file. It covers every component kind, the layout grid, swimlanes, frames, scenarios, and what the model may infer and must never invent. **Copy LLM Rules** in the command palette copies it. A Blueprint file pasted or opened with the chat reply still around it (a ```markdown fence and a sentence before it) now imports as the file inside.
- **New showcase: Marquee flash-sale ticketing.** First run and **Load Showcase** now open a made-up ticketing system selling 60,000 seats to 1.8 million fans. It uses every component kind, outline, icon, wire route and protocol, two levels, three pages, frames, a legend and six scenarios, and keeps three Review warnings on purpose. [docs/showcase.md](docs/showcase.md) walks through it. Lumen Relay stays in the gallery as the smaller classic example.
- **Reference templates rebuilt.** The six starter templates use the newer components (caches, streams, object storage, schedulers, external components), their scenarios follow real wires, and they pass Review with no issues.
- **Load balancer rule.** A load balancer with a single target that runs more than one replica is no longer reported as not spreading load.
- **Stream / Log.** A new stencil on the queue kind: a pipe with thin lanes (Partitions, 1 to 12, drawn only) where every reader gets every message. When a reader is down its lag grows on its own while the other readers carry on, and the chip shows the largest lag (`lag 12`). Pick **Delivery** in the inspector to turn any queue into a stream. `kafka`, `redpanda` and `pulsar` images and AsyncAPI channels with a `kafka` binding import as streams; `nats` stays an event broker. This replaces the old import of Kafka, Redpanda and Pulsar images as event brokers.
- **Run by someone else.** Tick it on any component to draw it dashed with an `EXTERNAL` label, on every kind and shape. A new Review warning flags a synchronous call into an external component on a scenario path when the caller has no circuit breaker and the external component has no fallback. Mermaid output writes `:::external` with a dashed class, so GitHub draws it dashed too. Imports never mark a component external on their own.
- **Object Storage.** A second stencil on the data store kind, drawn as a bucket. `minio` and `localstack` images import as object storage. A bucket that only a scheduler or an external component writes to is no longer flagged as a data store nothing reads from.
- **Bundle budget.** The entry JavaScript budget goes from 520 kB to 540 kB.
- **Cache.** A new component with a hit rate (default 80%) and a store behind it. If the cache fails and a store sits behind it, reads go straight to the store: the store shows as rerouted and the cache's callers are **slowed**, not at risk. In the Traffic lens, a packet is a hit or a miss; hits are spread evenly, so a run always looks the same. A hit reads `HIT`, skips to the caller and does not go to the store; a miss reads `MISS` and plays on. `memcached` and `varnish` images import as caches; `redis` and `valkey` stay stores. A new Review rule flags a cache with no data store behind it.
- **Rate Limiter.** A new component that admits some of every few requests (default 4 of 5). In the Traffic lens a rejected packet turns red, reads `429` and stops at the limiter; a looping run starts again. Tick **Fails open** and a limiter with one outgoing wire is **bypassed** when it fails, so traffic passes through it. A new Review rule notes a limiter that fails open.
- **Scheduler.** A new component that starts work on a timer, with the timing as free text (`5m`, `0 3 * * *`). It is an entry point, like an actor or a client, so failing it cuts off its jobs. A scenario that starts at a scheduler shows `⏱` and the timing, and a looping run waits twice as long before it starts again. Auto layout treats it as the start of the flow. A new Review rule flags a scheduler that writes straight to a data store.
- **Caches, limiters and schedulers in files.** Blueprint files carry `kind: cache`, `limiter` and `scheduler` with `cache:`, `limiter:` and `schedule:` maps, and the new icons `bolt`, `gauge` and `clock`. An older app opens them as a service.
- **Load Balancer.** A new component, drawn as a trapezoid with the wide side towards the components it spreads traffic over. Fail one of those targets and the others take the load: they show as rerouted, and the balancer is not at risk while at least one target is up. If every target is down it is at risk, and what sits behind the failed target alone is still unreachable. In the Traffic lens, a scenario that names a failed target is sent to a live one instead (the packet reads `→` and its name, and the change is announced once per run). Pick a strategy (round robin, least connections, weighted or hash) under **Review & Status**; it shows in the chip. A new Review rule flags a load balancer with fewer than two targets.
- **Trapezoid shape and `haproxy`.** Any component can now use the **Trapezoid** outline. A Mermaid `[/Title\]` imports as a load balancer, and `haproxy` images import as load balancers; `nginx`, `traefik` and `envoy` stay gates. In a hand-written Blueprint file, `balancer`, `lb` and `load-balancer` mean a load balancer. The Three-Tier Web example's load balancer now uses it.
- **Message Queue.** A new component, drawn as a pipe. Fail the components that read from a queue and it **buffers**: the components that write to it carry on, and what sits behind the failed reader is **delayed** instead of unreachable. In the Traffic lens, a looping scenario fills the pipe, a count chip shows how many messages wait (and turns amber and rose near the limit), and restoring the reader drains it. Under **Review & Status**, set ordering, a maximum depth, a **dead-letter queue** and retention; "Add dead-letter queue" in the context menu makes one in a single step. Three new Review rules: a queue nothing reads from, a queue with a limit and no dead-letter queue, and a synchronous wire into a queue. New wires into or out of a queue start out asynchronous and amber.
- **Queues in files and imports.** Blueprint files carry `kind: queue` and a `queue:` map; the file format moves to version 12, and an older app opens a queue as a service. In a hand-written Blueprint file, `queue` now means a queue (it used to mean an event broker, `bus`); `stream`, `broker` and `bus` still mean `bus`, and `sqs`, `fifo`, `mq` and `work-queue` mean a queue. RabbitMQ, ActiveMQ, Artemis, ElasticMQ and Beanstalkd images import as queues, as do AsyncAPI channels with an AMQP queue or SQS binding; Kafka, NATS and Pulsar stay event brokers.
- **Event Broker is now "Pub/sub event bus"** in the palette, so it is not confused with the queue. The Event-Driven Microservices example gains a Fulfilment Queue with a dead-letter queue and a saved "Fulfilment down" scenario.
- Palette entries can now share a kind: stencils have ids (groundwork for the next components).
- **Storage.** The old browser-storage copies that 2.1 left behind are deleted once your work is safe in the database. A browser that never ran 2.1 keeps them untouched, but they are no longer imported.

## 2.1.0

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
