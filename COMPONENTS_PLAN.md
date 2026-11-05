# New Components Plan: Queue, Load Balancer, Cache, Rate Limiter, Scheduler, Stream, External, Object Storage

Status: `[ ]` todo, `[~]` in progress, `[x]` done. Item ids are `K1`–`K8` (K for "kind") so they do not collide with the existing `F-xx`, `C1` and `D10` ids.

This file is the build spec for an agent. Read it top to bottom before writing code. Each phase ends in a working, tested, releasable state; do one phase per branch and PR.

---

## 0. Why these components

ConduitCraft's difference from other diagram tools is that a diagram **runs**: scenarios play as packets (Traffic lens), components can be failed with `X` (chaos), and the Review lens reasons about the graph. A new component is only worth adding if it **behaves differently** in one of those three places. Every component below is specified by:

1. **Draw**: how it looks (shape, icon, default size, stencil).
2. **Run**: what it does in playback and in a chaos run.
3. **Review**: what new insight rules it enables.
4. **File**: how it is saved, imported and exported.

| Id | Component | Model | Run behaviour in one line |
| --- | --- | --- | --- |
| K1 | **Message Queue** (the "pipe") | new kind `queue` | Holds messages while its consumers are down; producers keep working; backlog drains on restore. |
| K2 | **Load Balancer** | new kind `balancer` | Spreads packets over its targets; one failed target is absorbed by the others. |
| K3 | **Cache** | new kind `cache` | Some packets return early (hits); if it fails, traffic falls through to the backing store (slower, not broken). |
| K4 | **Rate Limiter** | new kind `limiter` | Admits N of every M packets, rejects the rest (429); can fail open or closed. |
| K5 | **Scheduler / Cron** | new kind `scheduler` | An entry point with no human behind it; starts scenarios on a timer. |
| K6 | **Stream / Log** | `queue` with `delivery: 'fanout'` | Like a queue, but every consumer gets every message, and each consumer buffers on its own. |
| K7 | **External / third-party** | flag `external: true` on any kind | Dashed outline; Review flags sync dependencies on it that have no protection. |
| K8 | **Object Storage** | `store` with new shape `bucket` | A data store drawn as a bucket. Look only. |

### Kind or property? (decision K-D1)

- A **new `NodeKind`** is added only when the component has its own **run** semantics (K1–K5). Adding a kind touches many files (see §2.2), so this is deliberate.
- A pure **look** variant is a `NodeShape` or a stencil preset on an existing kind (K8), or a boolean flag (K7).
- K6 reuses the queue kind with a field, because its run semantics are the queue's with one rule changed.

### Schema (decision K-D2)

All new fields are optional and new kinds are additions, so each phase is a no-op migration step in [src/core/schema.ts](src/core/schema.ts), following the existing pattern:

```ts
// 11 -> 12: components may be kind `queue` and carry `queue` (K1). Optional, so nothing to rewrite.
11: (doc) => doc,
```

Bump `CURRENT_SCHEMA_VERSION` once per phase that adds fields (Phase 1 → 12, Phase 2 → 13, …). An **older** app that opens a newer file reads an unknown kind as `service` (see `KINDS` in [src/exporter/blueprintJson.ts:32](src/exporter/blueprintJson.ts:32)). That is acceptable, but say it in [RELEASE_NOTES.md](RELEASE_NOTES.md).

### New chaos statuses (decision K-D3)

The current statuses are `failed`, `degraded`, `unreachable`, `rerouted` and `at-risk` ([src/studio/chaos.ts:13](src/studio/chaos.ts:13)). These phases add:

| Status | Added in | Meaning | Who gets it |
| --- | --- | --- | --- |
| `buffering` | K1 | Up, but holding messages because its consumers are down. | A queue. |
| `delayed` | K1 | Cut off now, but its work is waiting in a live queue and resumes on restore. | Components that would be `unreachable`, downstream of a buffering queue. |
| `slowed` | K3 | Still served, but by the slower path behind a failed cache. | Callers of a failed cache that has a backing store. |
| `bypassed` | K4 | Failed, but fail-open: traffic passes through it unchecked. | A failed rate limiter with `failOpen`. |

When a node fits more than one status, `chaosStatusOf` uses this order: `failed` › `bypassed` › `degraded` › `delayed` › `unreachable` › `buffering` › `at-risk` › `slowed` › `rerouted`.

Every new status needs: a field on `ReachabilityResult` ([src/core/reachability.ts:9](src/core/reachability.ts:9)), an empty array in `insideFailedComponent` ([src/core/failures.ts:41](src/core/failures.ts:41)), a `ChaosStatus` member and a `chaosStatusOf` branch, a count in `ChaosSummary` and in `summaryText` (shown only when it is above zero, like `degraded`), a label in `LABELS` and in the status loop in [src/studio/chaosPanel.ts:8](src/studio/chaosPanel.ts:8), and CSS for `.arch-node[data-chaos="…"]` next to the existing rules in [src/styles/studio.css:5024](src/styles/studio.css:5024). The colour must pass the existing contrast test (`tests/contrast.test.ts`) in both themes. The status must not be told by colour alone: it also goes in the badge text and the node's accessible name.

---

## 1. House rules for this work

These come from how the repo is already built. Keep to them.

- **Core is pure.** Rules and maths go in `src/core/*.ts` with no DOM; `src/studio/*.ts` holds state, rendering and events. New maths goes in a new core module with unit tests (see `reachability.ts` / `chaos.ts` for the split).
- **Untrusted input.** Every new field is read through a `normalize…` function that drops bad values and leaves defaults **absent**, so a plain component stays plain in the saved file. Follow `normalizeResilience` ([src/core/reachability.ts:44](src/core/reachability.ts:44)) and `normalizeNodeMeta` ([src/core/meta.ts:128](src/core/meta.ts:128)).
- **Ids in fields** (`deadLetterId`, `backingId`) are pruned after load when they name a missing component or the component itself. Follow `pruneDanglingChaos` ([src/core/reachability.ts:149](src/core/reachability.ts:149)), and remap them on import where `resilience.fallbackId` is remapped ([src/core/parser.ts:1850](src/core/parser.ts:1850)).
- **Chaos and backlog state are never saved.** Like the failure set, backlog depth lives in a studio module, per page and per level, and is cleared when the page changes.
- **Playback stays deterministic.** No `Math.random()` in run behaviour (GIF export, tests and e2e must give the same result every time). Use counters.
- **Reduced motion.** Respect `prefers-reduced-motion` the way [src/studio/elkArrange.ts:16](src/studio/elkArrange.ts:16) does: jump to the end state, no animation.
- **Accessibility.** Every state change that matters is announced with `announce()` from `studio/a11y.ts`. New inspector fields have labels. Keep the axe e2e scans passing.
- **Writing style.** User-facing text and the guide use the repo's plain style: short sentences, no "simply", sentence case. Look at [docs/guide.md](docs/guide.md) "Failing components" for the tone.
- **Tests.** `pnpm test` (node test runner, `tests/*.test.ts`), `pnpm build` (includes `tsc --noEmit`), `pnpm test:e2e` (Playwright, `e2e/`), `pnpm check:size`. All four must pass at the end of each phase.

---

## 2. Phase 0: groundwork (one small PR, before K1)

### 2.1 Stencils that share a kind

`STENCIL_CATALOG` ([src/templates/presets.ts:26](src/templates/presets.ts:26)) is looked up by `kind`, and the rail buttons in [index.html:130](index.html:130) carry `data-stencil-kind`. K6 (Stream) and K8 (Object Storage) need two palette entries with the same kind but different presets.

- [x] Add `id: string` to `StencilDefinition` (equal to the kind for the existing seven), plus optional presets: `shape?: NodeShape`, `preset?: Partial<DiagramNode>` (applied after the defaults in `createNodeFromStencil`).
- [x] `createNodeFromStencil(kindOrStencilId, …)`: accept a stencil id, keep accepting a kind (look up `s.id === x || s.kind === x`, id first). Keep every existing call site working unchanged.
- [x] Rail buttons: add `data-stencil-id`; [src/studio/interactions.ts:366](src/studio/interactions.ts:366) and [src/studio/responsiveToolbar.ts:116](src/studio/responsiveToolbar.ts:116) read `data-stencil-id` first, then fall back to `data-stencil-kind`.
- [x] The inspector's kind picker ([src/studio/inspector.ts:669](src/studio/inspector.ts:669)) lists **kinds**, not stencils: give it one entry per kind (first stencil of each kind).

### 2.2 The "new kind" touch list

Write this list as a comment at the top of `src/templates/presets.ts` so the next person finds it. Every new kind in K1–K5 must go through every line:

1. `NodeKind` union: [src/types.ts:1](src/types.ts:1).
2. `KINDS` set: [src/exporter/blueprintJson.ts:32](src/exporter/blueprintJson.ts:32).
3. `getNodeDimensions`: [src/core/layout.ts:13](src/core/layout.ts:13).
4. `STENCIL_CATALOG` entry: [src/templates/presets.ts](src/templates/presets.ts).
5. Rail button in [index.html](index.html) (icon, `data-tip`, `aria-label`), plus the responsive toolbar overflow (`tests/responsiveToolbar.test.ts` counts buttons).
6. Command palette entry: [src/studio/palette.ts:129](src/studio/palette.ts:129) (title, subtitle, keywords).
7. Blueprint-file alias parsing: `normalizeNodeKind` ([src/core/parser.ts:189](src/core/parser.ts:189)).
8. Mermaid writer for the embedded block: the `switch (node.kind)` at [src/core/parser.ts:1717](src/core/parser.ts:1717).
9. Studio rendering: [src/studio/keyedStage.ts](src/studio/keyedStage.ts) (plate, `data-kind`, `data-shape`).
10. SVG export: [src/exporter/diagramSvg.ts](src/exporter/diagramSvg.ts) (`tinted`, title size, plate at lines ~78–81 and ~211–224).
11. HTML export: [src/exporter/standaloneHtml.ts](src/exporter/standaloneHtml.ts) (lines ~42–48 and ~101–114).
12. Text description: [src/core/describe.ts](src/core/describe.ts) ("a queue", "a load balancer").
13. Container-image guess: `kindForImage` ([src/importers/common.ts:163](src/importers/common.ts:163)).
14. Guide: the kind table in [docs/guide.md](docs/guide.md) "Nodes" section, and a help topic in [src/core/helpTopics.ts](src/core/helpTopics.ts).
15. Tests: `tests/showcase.test.ts`, `tests/portableExport.test.ts`, `tests/nodeStyle.test.ts`, `tests/schema.test.ts`, `tests/palette.test.ts` and a round-trip (Blueprint file, Blueprint JSON, share link) for the new kind and every new field.

### 2.3 Acceptance

- [x] No behaviour change. All existing tests pass. A new test proves two stencils with the same kind create different nodes.

---

## 3. Phase 1 — K1 Message Queue (the pipe)

The headline feature. Spend the most care here: K2–K6 reuse its patterns.

### 3.1 Model

```ts
// src/types.ts
export type NodeKind = 'actor' | 'core' | 'service' | 'bus' | 'gate' | 'store' | 'client' | 'queue';

export type QueueOrdering = 'standard' | 'fifo' | 'priority';
export type QueueDelivery = 'competing' | 'fanout'; // 'fanout' is K6, Phase 4

/** How a queue holds and hands out messages (K1). Absent fields use the defaults in `core/queues.ts`. */
export interface NodeQueue {
  /** Default 'standard'. Recorded for the reader and shown on the card. */
  ordering?: QueueOrdering;
  /** Default 'competing': each message goes to one consumer. */
  delivery?: QueueDelivery;
  /** Most messages held before overflow. Absent means unbounded. 1–9999. */
  maxDepth?: number;
  /** Where overflow and poison messages go. Another component on the same level, usually a queue. */
  deadLetterId?: string;
  /** Free text, such as "4 days". Shown on the card, not used in the run. Max 40 chars. */
  retention?: string;
}

export interface DiagramNode {
  // …
  /** Queue settings (K1). Only read when `kind` is 'queue'. */
  queue?: NodeQueue;
}
```

- [x] `normalizeQueue(raw): NodeQueue | undefined` in a new `src/core/queues.ts`: unknown enum values are dropped; `maxDepth` is a whole number from 1 to 9999; `retention` is trimmed and cut to 40 chars; defaults (`standard`, `competing`) are left absent. Call it from `normalizeNodeMeta` ([src/core/meta.ts:128](src/core/meta.ts:128)) so every reader picks it up.
- [x] A `queue` field on a non-queue component is **kept** (so switching kind back and forth does not lose settings) but ignored.
- [x] `deadLetterId`: pruned like `fallbackId` (missing id, or the queue itself); remapped on import like `fallbackId` ([src/core/parser.ts:1850](src/core/parser.ts:1850)).
- [x] Schema step `11 -> 12` with the comment from §0.

### 3.2 Draw

**Shape: a horizontal pipe.** It works like the store's drum: the store kind draws a cylinder by default without storing a `shape` ([src/core/nodeStyle.ts:118](src/core/nodeStyle.ts:118)). Do the same:

- [x] `queueDrawsPipe(kind, shape)`: true when `kind === 'queue'` and `shape` is absent or `'card'`. An explicit other shape still wins.
- [x] `pipePlate(width, height)` in [src/core/nodeStyle.ts](src/core/nodeStyle.ts), next to `cylinderPlate`, a horizontal cylinder:
  - `inset = 1.5`; `ry = h/2 - inset`; cap half-width `rx = clamp(6, w * 0.07, 16)`.
  - Body path: start at `(inset + rx, inset)`, line to `(w - inset - rx, inset)`, arc (`rx ry`, sweep 1) to `(w - inset - rx, h - inset)`, line to `(inset + rx, h - inset)`, arc (sweep 1) back to the start, `Z`. That gives a rounded left end.
  - Outlet cap: a full ellipse at `cx = w - inset - rx`, `cy = h/2`. This is the visible "open end" on the right, the side messages leave from. Same classes as the drum: `node-shape-geom pipe-body` and `node-shape-geom pipe-cap`.
  - Round every number to a tenth with `roundTenth`, as the drum does.
- [x] `renderPipePlate(width, height)`: SVG string with `data-plate="pipe"`, same structure as `renderCylinderPlate`.
- [x] `nodeShapeContentPadding`: for the pipe, `top/bottom = round(h * 0.14)`, `left = round(rx + 12)`, `right = round(2 * rx + 12)`.
- [x] Ports stay on the rectangle (same as the drum), so wires do not move.
- [x] Inspector shape picker: show "Pipe" for `card` when the kind is `queue`, as it shows "Cylinder" for stores ([src/studio/inspector.ts:703](src/studio/inspector.ts:703)).
- [x] Use it in all three renderers: `keyedStage.ts` (studio, `wrapper.dataset.shape = 'pipe'`), `diagramSvg.ts` and `standaloneHtml.ts`.

**Stencil:**

```ts
{
  id: 'queue', kind: 'queue',
  paletteTitle: 'Message Queue', paletteSub: 'Buffers work between services',
  defaultTitle: 'Queue', defaultSubtitle: 'Work Queue',
  eyebrow: 'QUEUE', footerLeft: 'Point to point', chip: 'ASYNC',
  icon: 'queue', accent: 'amber', interfaceLabel: 'AMQP / SQS',
}
```

- [x] Default size: `{ width: 240, height: 112 }` in `getNodeDimensions`.
- [x] New icon `queue` in `NodeIconName` ([src/types.ts:20](src/types.ts:20)) and [src/ui/icons.ts](src/ui/icons.ts): three stacked rectangles with a right arrow, drawn in the same stroke style and viewBox as the other icons. Add it to the icon list in the guide and to `tests/icons.test.ts`.
- [x] Change the Event Broker's `paletteSub` from "Queue or message bus" to "Pub/sub event bus", and drop `'queue'` from its palette keywords ([src/studio/palette.ts:131](src/studio/palette.ts:131)), so the two are not confused.
- [x] Card text: the chip shows the ordering when it is set (`FIFO`, `PRIORITY`); the footer shows `maxDepth` and `retention` when set ("max 500 · 4 days").

**Backlog inside the pipe (Traffic lens only):**

- [x] The wrapper gets `data-backlog="<depth>"` when the depth is above zero.
- [x] Inside the pipe, draw up to 8 message blocks (`<span class="queue-msg">`) lined up from the outlet (right) end towards the left, so the pipe visibly fills. Above 8, the 8th block shows `+N`.
- [x] A count chip, "12 waiting", sits on the pipe's top edge. When `maxDepth` is set: "12 / 50", and at 80 % or more of `maxDepth` the chip turns amber; when full it turns rose.
- [x] The node's accessible name adds ", 12 messages waiting".
- [~] Draining animates the blocks sliding out of the outlet; with reduced motion they just disappear. (Built: the blocks leave one drain tick at a time and the count falls; there is no slide animation yet. With reduced motion the backlog empties at once.)

### 3.3 Run: chaos (pure, in `core/reachability.ts`)

Today, with `Producer → Consumer`, failing the consumer marks the producer `at-risk` (it calls a failed component directly). With `Producer → Queue → Consumer`, the point of the queue is that **the producer is fine and the work waits**. Implement it like this, inside `reachableFrom`, after `after`, `unreachable` and `atRisk` are computed:

1. `consumers(q)` = the targets of wires **leaving** `q` (`e.from === q`). Wires with `flow: 'both'` count once, as leaving the queue. The `deadLetterId` target is **not** a consumer.
2. A consumer is **down** when it is in `blocked` with no `detour` (a failed consumer that has a live fallback is not down).
3. For each queue `q` in `after` (reachable) that is not in `failedSet`:
   - `competing` (default): `q` is **buffering** when **every** consumer is down and it has at least one consumer. If only some are down, the live consumers go into `rerouted` (they take the extra load), and the queue itself is not `at-risk` (built so; messages still flow).
   - `fanout` (K6, Phase 4): `q` is buffering when **any** consumer is down.
4. Buffering queues are **removed from `atRisk`**: they are `buffering` instead.
5. **Delayed:** walk the **pre-failure** graph from each buffering queue (`walk(next, [q], new Set(), new Map())`). Every component in `unreachable` that this walk reaches moves from `unreachable` to `delayed`. Its work is waiting in the queue. Failed components stay `failed`.
6. A **failed** queue (single instance) behaves like any failed component: its producers are `at-risk`, everything behind it is `unreachable`. A failed queue with replicas is `degraded`, as today.
7. Add `buffering: string[]` and `delayed: string[]` to `ReachabilityResult`, sorted like the others.

Worked examples. Each becomes a test in `tests/reachability.test.ts`:

| Graph (entry `U`) | Fail | Expected |
| --- | --- | --- |
| `U → P → Q → C → D` | `C` | failed `[C]`, buffering `[Q]`, delayed `[D]`, at-risk `[]`, unreachable `[]` |
| `U → P → C → D` (no queue) | `C` | failed `[C]`, at-risk `[P]`, unreachable `[D]` (current behaviour, unchanged) |
| `U → P → Q → {C1, C2}` | `C1` | failed `[C1]`, rerouted `[C2]`, buffering `[]` |
| `U → P → Q → {C1, C2}` | `C1, C2` | buffering `[Q]` |
| `U → P → Q → C`, `C.resilience.fallbackId = C2`, `Q → C2` absent | `C` | not buffering (traffic detours to `C2`), `C2` rerouted |
| `U → P → Q → C` | `Q` | failed `[Q]`, at-risk `[P]`, unreachable `[C]` |
| `U → P → Q → C`, `Q.replicas = 3` | `Q` | degraded `[Q]`, nothing else changes |
| `U → P → Q → C → D`, also `U → D` | `C` | `D` stays reachable (not delayed, not unreachable), `D` rerouted |

### 3.4 Run: playback backlog

Playback today stops at the first step that contains a failed or cut-off component ([src/studio/simulationPlayback.ts:242](src/studio/simulationPlayback.ts:242)). With a queue in front of that component, the packet should **park in the queue** instead.

**Pure part: `src/core/queues.ts`:**

```ts
export interface BacklogState { depth: number; deadLettered: number; dropped: number }
export type EnqueueOutcome = 'held' | 'dead-lettered' | 'dropped';

/** One message arrives at a buffering queue. */
export function enqueue(state: BacklogState, cfg: NodeQueue | undefined, deadLetterUp: boolean): { state: BacklogState; outcome: EnqueueOutcome };

/** One drain tick: how many messages leave. At least 1, one per live consumer for 'competing', 1 for 'fanout'. */
export function drainCount(liveConsumers: number, cfg: NodeQueue | undefined): number;

/** The buffering queue that holds a packet moving from step `current` to step `next`, or null. */
export function holdingQueue(
  doc: Pick<DiagramDocument, 'nodes' | 'edges'>,
  current: readonly string[],
  next: readonly string[],
  buffering: ReadonlySet<string>,
  down: ReadonlySet<string>,
): string | null;
```

- `enqueue`: below `maxDepth` (or no `maxDepth`) → `held`, depth + 1. At `maxDepth` → `dead-lettered` if a `deadLetterId` is set and that component is up, else `dropped`. Depth never exceeds `maxDepth`.
- `holdingQueue`: a queue `q` holds the packet when `q` is buffering, `q` is in `current` **or** in `next`, and `next` contains a consumer of `q` that is in `down`. Check `current` first, then `next` (some scenarios put the queue and its consumer in the same step).

**Studio part: a new `src/studio/queueBacklog.ts`:**

- State: `Map<key, BacklogState>`, with keys from `failureKey(levelPath, id)` so levels do not collide, kept per page the way `chaos.ts` keeps failures (`onPageOpened`). Never saved.
- `scheduleNextStep` change, in the branch that calls `blockedNodeIn`: before stopping, ask `holdingQueue(...)`. If a queue holds the packet:
  1. `enqueue` and repaint that queue (`data-backlog`).
  2. Move the sim packet to the queue's centre with label `HELD`. For `dead-lettered`, flash the DLQ component with the rose sim accent and label `DLQ`. For `dropped`, label `DROPPED` in rose.
  3. Announce: "Message held in Orders Queue. 3 waiting." / "Orders Queue is full. Message sent to Orders DLQ." / "Orders Queue is full. Message dropped."
  4. When looping, go to step 0 and carry on, so the backlog keeps growing on each loop. When not looping, pause.
- **Drain:** listen with `onChaosChange`. For each queue with `depth > 0` that is no longer buffering, take `drainCount(...)` messages off every `300 / speed` ms until it is empty, then announce once: "Orders Queue drained 7 messages." With reduced motion, set the depth to 0 at once and still announce.
- **Reset:** clear all backlogs on `clearFailures`, when the page changes, when the level changes and when the user leaves the Traffic lens. A restore that drains is not a reset: the user should see it drain.
- The run bar ([src/studio/runBar.ts](src/studio/runBar.ts)) shows the total held across queues when it is above zero: "· 12 held".

### 3.5 Review rules (in `core/insights.ts`)

Add to `InsightCode` and `INSIGHT_RULES`. Each one is mutable like the others:

- [x] `queue-no-consumer` (warning): a queue with incoming wires and no outgoing wires. "Nothing reads from Orders Queue; messages pile up forever."
- [x] `queue-no-dlq` (info): a queue with `maxDepth` set and no `deadLetterId`. "Orders Queue drops messages when full; it has no dead-letter queue."
- [x] `sync-into-queue` (info): a wire **into** a queue that is not `sync: 'async'`. "The wire into Orders Queue is synchronous; queues are usually written asynchronously." Do not change the wire automatically on load; see §3.6 for the default on new wires.
- [x] `dangling-store` must not fire for queues (it checks `kind === 'store'`, so it already does not; add a test).
- [x] `spof`: a queue counts like any other component. No change, but add a test that a single queue between producer and consumer is reported.

### 3.6 Editing

- [x] Inspector, **Review & Status** section, a **Queue** group shown only for `kind === 'queue'`: Ordering (select), Max depth (number, empty = unbounded), Dead-letter queue (select of other components on the level, "None" first; list queues first), Retention (text). Build it next to the resilience group ([src/studio/inspector.ts:210](src/studio/inspector.ts:210)) and use the same `commit` + normalize pattern. One undo step per change.
- [x] A new wire **into or out of** a queue defaults to `sync: 'async'` and tone `amber` (when the user has not picked a tone). Only for wires made in the editor, never on import or load.
- [x] The DLQ link is drawn as a thin dashed rose line from the queue to its DLQ **only while the queue is selected**, and in the Traffic lens when a message is dead-lettered. It is not a wire: it is not saved in `edges`, not routed, and not counted by insights.
- [x] Context menu ([src/core/contextMenuItems.ts](src/core/contextMenuItems.ts)) on a queue: "Add dead-letter queue". It creates a queue to the right, named "<title> DLQ", and sets `deadLetterId`. One undo step.
- [x] Bulk fields ([src/studio/bulkFields.ts](src/studio/bulkFields.ts)): when every selected component is a queue, Ordering and Max depth are editable together.

### 3.7 File formats

- [x] **Blueprint file** (`.blueprint.md` YAML): `kind: queue`, and a `queue:` map with `ordering`, `delivery`, `maxDepth`, `deadLetterId`, `retention`. Written only when it has a value. Check that the writer and reader use the same path as `resilience`.
- [x] **Aliases** in `normalizeNodeKind`: `queue`, `sqs`, `fifo`, `mq`, `work-queue` → `queue`. **This changes `queue`**, which today maps to `bus`. That only affects hand-written files (the editor always writes `bus`); note it in the release notes. `stream`, `broker` and `bus` still map to `bus`.
- [x] **Embedded Mermaid block** (for GitHub preview): write a queue as `id[("Title")]` (the cylinder bracket), so GitHub draws a drum. On re-import the YAML `kind: queue` must win over the bracket. Add a test that a Blueprint file with a queue round-trips as a queue.
- [x] **Mermaid import** stays bracket-based. Stretch item, not required: read Mermaid v11's `id@{ shape: h-cyl, label: "…" }` as a queue.
- [x] **Blueprint JSON**: `KINDS` gains `queue`; `queue` is read through `normalizeNodeMeta`.
- [x] **Share link** ([src/studio/shareLink.ts](src/studio/shareLink.ts)): round-trip test.
- [x] **Diff** ([src/core/diff.ts](src/core/diff.ts)): a change to `queue` fields is listed as a change to the component ("Orders Queue: max depth 100 → 500").

### 3.8 Importers

- [x] `kindForImage` ([src/importers/common.ts:163](src/importers/common.ts:163)): add `QUEUE_IMAGES = ['rabbitmq', 'activemq', 'artemis', 'elasticmq', 'beanstalkd']`, checked **before** `BUS_IMAGES`, and remove `rabbitmq` and `activemq` from `BUS_IMAGES`. Kafka, Redpanda, Pulsar and NATS stay `bus` until K6.
- [x] AsyncAPI ([src/importers/asyncapi.ts:141](src/importers/asyncapi.ts:141)): a channel whose bindings say queue (`bindings.amqp.is === 'queue'`, or an `sqs` binding) becomes a `queue`; others stay `bus`. Update the `asyncapi-schemas` info message, since some bindings are now read. Add fixtures to `tests/fixtures/asyncapi/`.
- [x] Drift ([src/core/drift.ts](src/core/drift.ts)) matches on `source`, not kind, so an old diagram whose channel is a `bus` still matches. Add a test that a re-import does **not** report drift just because the kind guess changed.

### 3.9 Exports

- [x] SVG and PNG: pipe plate, no backlog (exports show the design, not a run).
- [x] Standalone HTML: pipe plate. The exported page plays scenarios but has no chaos today, so no backlog is needed. If the HTML export gains chaos later, it must reuse `core/queues.ts`.
- [x] GIF ([src/exporter/gif.ts](src/exporter/gif.ts)): when a chaos run with a backlog is recorded, the backlog blocks must show in the frames. Check that the frame capture includes `.queue-msg`.
- [x] Text description: "Orders Queue is a FIFO queue between Checkout and Fulfilment. It holds up to 500 messages and sends overflow to Orders DLQ."

### 3.10 Example and docs

- [x] Update [src/examples/event-driven-microservices.blueprint.json](src/examples/event-driven-microservices.blueprint.json): put a real queue (with a DLQ) between the order service and fulfilment, and add a saved chaos scenario "Fulfilment down" (`failures: [<fulfilment id>]`) that shows buffering and drain.
- [x] [docs/guide.md](docs/guide.md): the kind table row; a "Queues" subsection under "Failing components" that explains buffering, delayed, the DLQ and draining in four or five short sentences; new Review rules under "Review and insights".
- [x] Help topic in [src/core/helpTopics.ts](src/core/helpTopics.ts) with keywords `queue, backlog, buffer, dead letter, dlq, sqs, rabbitmq`.
- [x] README highlights: "8 architectural stencils" and the queue in the list.
- [x] RELEASE_NOTES entry, including the `queue` alias change and the old-app fallback.

### 3.11 Tests (Phase 1)

Unit (`pnpm test`):

- [x] `nodeStyle.test.ts`: `queueDrawsPipe` truth table; `pipePlate` numbers for 240×112 and for a tiny 10×10 box (no negative radii); content padding.
- [x] `reachability.test.ts`: every row of the table in §3.3.
- [x] New `queues.test.ts`: `normalizeQueue` (bad enums, `maxDepth` 0 / -1 / 1.7 / 10000 / "50", long retention), `enqueue` at and over `maxDepth` with DLQ up, DLQ down and no DLQ, `drainCount`, `holdingQueue` with the queue in `current`, in `next`, and not buffering.
- [x] `insights.test.ts`: the three new rules, including muting.
- [x] Round-trips: Blueprint file, Blueprint JSON, share link, with every `queue` field set and with none.
- [x] `schema.test.ts`: a version-11 file loads unchanged and stamps 12.
- [x] `importers.test.ts` / `clusterImporters.test.ts`: RabbitMQ image → queue; AsyncAPI amqp-queue binding → queue.
- [x] `playback.test.ts` (built as `queuePlayback.test.ts`): a scenario `P → Q → C` with `C` failed and looping. After 3 loops `Q` has depth 3 and playback did not stop. Without looping it pauses after one hold. Use fake timers as the existing playback tests do.
- [x] `describe.test.ts`, `palette.test.ts`, `responsiveToolbar.test.ts`, `showcase.test.ts`, `portableExport.test.ts`: updated counts and snapshots.

End-to-end (`pnpm test:e2e`), new `e2e/queue.spec.ts`:

- [x] Drag a Message Queue from the rail; it draws as a pipe (`[data-shape="pipe"]`).
- [x] Wire `Service → Queue → Service`; the new wires are async (dashed).
- [x] Traffic lens: fail the consumer with `X`. The summary includes "1 buffering"; the producer has no `at-risk` badge.
- [x] Play a looping scenario: `data-backlog` rises; the count chip reads "2 waiting" after two loops. (The example's queue has a limit, so its chip reads "2 / 50"; a queue with no limit reads "2 waiting".)
- [x] Press `X` again: the backlog drains to 0 and the live region announces "drained".
- [x] axe scan of the inspector with the Queue group open.

### 3.12 Acceptance (Phase 1)

- [x] A user can draw `API → Queue → Worker → DB`, fail the Worker, play the scenario, and see the API stay green, the queue fill, the DB marked "delayed", and the queue drain when the Worker is restored.
- [x] No existing diagram changes how it looks or how its chaos run comes out (snapshot tests stay unchanged except for the deliberate changes listed above).
- [x] `pnpm test`, `pnpm build`, `pnpm test:e2e` and `pnpm check:size` pass. The bundle grows by under 6 KB gzip. (Built: about 6.1 KB gzip, 18 KB raw; the entry budget in `tools/checkBundleSize.mjs` went from 480 KB to 520 KB.)

---

## 4. Phase 2 — K2 Load Balancer

### 4.1 Model and draw

- [x] Kind `balancer`; field `balancer?: { strategy?: 'round-robin' | 'least-connections' | 'weighted' | 'hash' }` (default round-robin, left absent), normalized like `queue`.
- [x] Default outline: a **trapezoid**, wide side facing the targets (right in LR, bottom in TD; read `doc.direction`). Same pattern as the drum: `balancerDrawsTrapezoid(kind, shape)` plus a `ShapePlatePolygon`. Also add `trapezoid` as a general `NodeShape` so any component can use it (shape picker, Blueprint `shape: trapezoid`, Mermaid `[/Title\]`, the trapezoid bracket, on import).
  - Watch out: `[/Title/]` and `[\Title\]` currently map to `client` ([src/core/parser.ts:376](src/core/parser.ts:376)). `[/Title\]` (a trapezoid) is a different bracket. Add its pattern **before** the client patterns and test that the client brackets still parse as clients.
- [x] Icon `balancer` (one line splitting into three). Size 200×120. Stencil: title "Load Balancer", eyebrow `BALANCER`, chip from the strategy (`RR`, `LEAST`, `WEIGHTED`, `HASH`), accent violet.
- [x] Images: `haproxy` → balancer (remove it from `GATE_IMAGES`); `nginx`, `traefik` and `envoy` stay gates (they are more often gateways).
- [x] Kubernetes importer (n/a: Services are not drawn as components, so there is nothing to turn into a balancer): a `Service` of `type: LoadBalancer` becomes a balancer in front of its workload, if the importer already draws Services. Check [src/importers/kubernetes.ts](src/importers/kubernetes.ts) first; skip this if Services are not drawn.

### 4.2 Run

Chaos (pure):

- `targets(b)` = the targets of wires leaving `b`.
- A balancer is **never `at-risk`** while at least one target is up. Remove it from `atRisk` in that case.
- Live targets of a balancer that has at least one down target go into `rerouted` (they take the load).
- When **all** targets are down, the balancer is `at-risk`, as today.
- What is behind a failed target (and only behind it) is still `unreachable`. A balancer does not save what only that one instance served.

| Graph (entry `U`) | Fail | Expected |
| --- | --- | --- |
| `U → LB → {A, B} → DB` | `A` | failed `[A]`, rerouted includes `[B]` (DB is also rerouted, because it lost the wire from A), LB not at-risk, DB reachable |
| `U → LB → {A, B}` | `A, B` | LB at-risk |
| `U → LB → {A, B}`, `A → X` only | `A` | `X` unreachable |

Playback:

- [x] When a step contains a balancer and the next step contains a down target, **substitute** a live target of the same balancer for that step's render only (round-robin over live targets, using a counter kept per balancer so it is deterministic). Show the label `→ B` on the packet and announce once per run: "Load Balancer sent traffic to B instead of A."
- [x] With no failures, round-robin playback over targets is **not** done: the scenario's own steps decide the path (otherwise saved scenarios would play differently).

### 4.3 Review

- [x] `balancer-single-target` (info): a balancer with fewer than two targets. "Load Balancer has one target, so it does not spread load."
- [x] `spof`: a balancer with two or more live targets is not reported as a SPOF **for its targets**, but the balancer itself can be (unless it has `replicas > 1`).

### 4.4 Tests and acceptance

Built in `tests/balancers.test.ts`, `tests/balancerPlayback.test.ts` and `e2e/balancer.spec.ts`. Same structure as §3.11, for the balancer: the shape, the trapezoid bracket regression, the chaos table, playback substitution with fake timers, the rule, round-trips, the e2e "fail one of two targets, traffic continues".

**Built, with these differences from the text above (K2):**

- The first row of the chaos table: DB is also `rerouted`, by the existing rule that a component which lost an incoming wire counts as rerouted. The test checks that `B` is included.
- The substitution also applies when one step holds both the balancer and its down target (for example `client, alb, app-02`), and the first step of a scenario. The stand-in follows the packet for the rest of that pass through the scenario, so it does not stop at the failed target one step later.
- The label is the step's own label plus `→ B` (for example `Route → App B`), not `→ B` alone.
- A balancer with no targets gets the same rule, worded "has no targets".
- The Mermaid trapezoid `[/Title\]` imports as a `balancer`; a `trapezoid` shape on any other component is stored in the file and drawn, and the Mermaid block writes that component by its kind.
- The strategy is recorded and shown in the chip; playback does not use it, and there is no bulk field for it.
- The Three-Tier example's "Application Load Balancer" changed from a diamond gate to a balancer.

---
## 5. Phase 3 — K3 Cache, K4 Rate Limiter, K5 Scheduler

Three smaller kinds that share one PR's worth of groundwork (§2.2 touch list ×3). Split into three PRs if review gets heavy.

### 5.1 K3 Cache

- [x] Kind `cache`; field `cache?: { hitRate?: number /* 0–100, default 80 */; backingId?: string }`.
- [x] Draw: card with a new `bolt` icon, accent emerald, size 200×112, eyebrow `CACHE`, chip `HIT 80%`.
- [x] `backingId`: if absent, use the cache's only outgoing wire to a `store`, when there is exactly one. Show the inferred value greyed out in the inspector. Prune and remap the field like `fallbackId`.
- [x] Chaos: a failed cache with a backing store **detours** to it, reusing the `detour` map in `reachableFrom` exactly like `fallbackId`. The cache's callers get `slowed`, not `at-risk`. Without a backing store, the cache behaves like any failed component.
- [x] Playback, deterministic hits: keep a counter per cache. Packet `n` is a **hit** when `floor((n + 1) * hitRate / 100) > floor(n * hitRate / 100)`, which spreads hits evenly. On a hit, when the next step contains the backing store, the packet shows `HIT`, skips the steps up to and including the backing store's step, and goes back to the caller. On a miss it shows `MISS` and plays on. This needs a small "skip to step" in the controller. Keep it inside `scheduleNextStep`, and put the pure step-picking part in `core/`.
- [x] Review: `cache-no-backing` (info): a cache with no backing store. "Session Cache has no data store behind it; a failure loses every read."
- [x] Images: `memcached` and `varnish` → cache (take `memcached` out of `STORE_IMAGES`). `redis` and `valkey` stay `store`: they are as often a database.

### 5.2 K4 Rate Limiter

- [x] Kind `limiter`; field `limiter?: { admit?: number; per?: number; failOpen?: boolean }`: "admit `admit` of every `per` packets", defaults 4 of 5, fail-closed.
- [x] Draw: the `gate` look with a small meter glyph (new icon `gauge`), accent violet, chip `4/5`.
- [x] Playback: a counter per limiter. Packet `n` is rejected when `n % per >= admit`. A rejected packet turns rose, shows `429`, stops at the limiter, and the loop restarts at step 0 (or pauses when not looping). Announce "Rate Limiter rejected a request (429)." **at most once every 5 seconds**, so the live region is not flooded.
- [x] Chaos: a failed limiter with `failOpen: true` and exactly one outgoing wire detours to that target and gets status `bypassed` instead of `failed`. Fail-closed is the current behaviour.
- [x] Review: `limiter-fail-open` (info): "Rate Limiter fails open: when it is down, traffic reaches Orders API unchecked."

### 5.3 K5 Scheduler / Cron

- [x] Kind `scheduler`; field `schedule?: { every?: string /* free text, "5m", "0 3 * * *" */ }`, max 40 chars.
- [x] Draw: a compact card like the client (192×112), new icon `clock`, accent blue, eyebrow `SCHEDULE`, chip from `every`.
- [x] **Entry point:** add `scheduler` to `entryPointIds` ([src/core/reachability.ts:25](src/core/reachability.ts:25)) next to `actor` and `client`. This changes SPOF and reachability for diagrams that contain one, which is intended. Test that a diagram whose only entry is a scheduler gets correct reachability, and that failing the scheduler makes its jobs unreachable.
- [x] Playback: a scenario whose first step is a scheduler shows its packet label as `⏱ <every>`. When looping, it waits 2 × the base step between loops (a visible "tick").
- [x] Review: `scheduler-no-queue` (info): a scheduler whose job writes straight to a store with no queue or retry between them. "Nightly Export runs straight into Ledger DB; a failed run is not retried." Keep the rule simple: it fires when the scheduler's direct target is a `store`.
- [x] Layout: [src/core/layout.ts:966](src/core/layout.ts:966) and [src/core/layout.ts:1158](src/core/layout.ts:1158) treat actors as the start of the flow. Treat schedulers the same for auto-layout and the ELK chunk ([src/core/elkLayout.ts](src/core/elkLayout.ts)).

**Built, with these differences from the text above (K3 to K5):**

- The Rate Limiter uses the gate's size (242×172) and no new shape: "the gate look" is the card with violet accent and the `gauge` icon.
- Cache and Scheduler cards are 112 high, so they hide the subtitle and show the footer chip (the studio, the SVG and the HTML export agree).
- A failed fail-open limiter with more than one outgoing wire fails closed, and `limiter-fail-open` says so instead of naming a target.
- Two chaos states were added for K3 and K4: `slowed` (callers of a cache that is down and has a store behind it) and `bypassed` (a fail-open limiter that is down). Neither is blocking: playback goes through both.
- Cache lookup in playback happens when a packet arrives at a step that holds the cache while the next step holds its backing store. A hit goes to the step after the store's; a miss goes on. A failed cache or backing store is not looked up, and the scenario plays its own steps.
- A limiter counts a packet when it first appears in a step (not when the previous step already held it). A hit rate of 80 and a limit of 4 of 5 are stored as absent.
- The scheduler's doubled wait applies only to a looping run.
- Open question 4 was answered with the spec's default: a scheduler is an entry point.

### 5.4 Tests and acceptance (Phase 3)

For each kind: the §2.2 touch list, round-trips, chaos tables like §3.3, deterministic playback tests with fake timers, rule tests, and one e2e flow each.

---

## 6. Phase 4: K6 Stream, K7 External, K8 Object Storage

### 6.1 K6 Stream / Log

- [x] A second stencil on the `queue` kind (needs Phase 0): id `stream`, title "Stream / Log", preset `queue: { delivery: 'fanout' }`, icon `stream`, chip `STREAM`, eyebrow `LOG`.
- [x] Draw: the pipe with 3 horizontal lanes (partitions) drawn as thin lines inside the body. Add `partitions?: number` (1–12, default 3, only drawn, never simulated) to `NodeQueue`.
- [x] Run: the `fanout` rules already specified in §3.3 (step 3) and `drainCount` (§3.4). Backlog is kept **per consumer** for fanout: change `BacklogState` to hold a map from consumer id to depth for fanout queues. Each lane shows its own blocks, and the chip shows the largest lag: "lag 12".
- [x] Images: `kafka`, `redpanda` and `pulsar` → stream (a queue with fanout). `nats` stays `bus`. AsyncAPI: a `kafka` binding → stream.
- [x] Guide: a short paragraph on queue vs stream vs event bus: one consumer per message / every consumer gets every message and can replay / fire and forget.

### 6.2 K7 External / third-party

- [x] Field `external?: boolean` on **any** component (written only when true). Inspector checkbox under Review & Status: "Run by someone else".
- [x] Draw: dashed outline (`stroke-dasharray` on the plate, or a dashed border for the card), plus a small `EXTERNAL` ribbon. Works with every shape and every kind, including the pipe and the drum.
- [x] Review: `external-unprotected` (warning): a **sync** wire into an external component, on a scenario path, where the caller has no `circuitBreaker` and the external component has no `fallbackId`. "Checkout calls Stripe synchronously with no circuit breaker or fallback."
- [x] Importers: OpenAPI `servers` on another domain, and Compose services with no `build` and an image from a third-party registry, are **not** marked external automatically (too many false positives). Record this as a decision in the guide.
- [x] Mermaid writer: add `:::external` with a `classDef external stroke-dasharray: 5 5` in the embedded block, so GitHub also draws it dashed.

### 6.3 K8 Object Storage

- [x] New `NodeShape` `bucket`: a trapezoid wider at the top with a lid ellipse (the classic bucket). Plate geometry in `nodeStyle.ts` like the drum.
- [x] Second stencil on the `store` kind: id `object-store`, title "Object Storage", preset `shape: 'bucket'`, icon `bucket`, subtitle "Blobs and files", interface "S3 API".
- [x] Images: `minio` and `localstack` → store with shape bucket. `kindForImage` returns only a kind, so add a `presetForImage` next to it.
- [x] `dangling-store` should not fire for buckets that are only written to by a scheduler or an external component (backups and exports are often write-only). Add that exception and a test.

---

**Built, with these differences from the text above (K6 to K8):**

- Stream: the `stream` stencil is `queue` plus `queue: { delivery: 'fanout' }`. The inspector also has a **Delivery** select so any queue can become a stream. Per-consumer lag is kept in `BacklogState.lags` for fanout queues; `depth` holds the largest lag. A stream's live readers keep reading while another reader is down; the stream still shows as buffering until all are up. The lanes are drawn but the blocks inside the pipe show the largest lag, not one row per lane.
- Stream images: `kindForImage` returns `queue` for `kafka`, `redpanda` and `pulsar`, and `stencilForImage` and `presetForImage` carry the fanout setting. The earlier K1 test that kept them as buses is updated.
- External: "on a scenario path" counts the scenarios a diagram would play when it has none saved (the generated ones), so the warning also fires without a saved scenario. A rule fires per wire.
- Object Storage: the `bucket` outline is drawn only on stores (it reuses the drum with leaning walls; `data-shape` stays `cylinder` and the wrapper gets `data-bucket`). The shape picker lists it only for stores.
- The entry JavaScript budget was raised from 520 kB to 540 kB (the entry is 524.7 kB).

## 7. Out of scope (do not build)

- Real throughput or latency maths (messages per second, queue time). The run is a teaching animation, not a load test. `latencyMs` on wires already sets the pace.
- Random behaviour of any kind (see §1).
- Saving backlog or counters in the file.
- Chaos in the standalone HTML export (it has none today; adding it is its own feature).
- New Mermaid syntax beyond the stretch items called out above.

## 8. Open questions (ask the user before starting the phase that needs the answer)

1. **K1:** Should a queue with `delivery: 'competing'` and **some** consumers down also hold a share of the messages (partial buffering), or is "live consumers take everything" right? This spec assumes the latter.
2. **K1:** Should the run bar's "· 12 held" also appear in the GIF export's caption?
3. **K2:** Should round-robin playback (spreading packets over targets with no failure) become an opt-in per scenario later?
4. **K5:** Is "scheduler is an entry point" the right default, given it changes SPOF results for existing diagrams that are later edited to include one? (Existing diagrams do not contain schedulers, so nothing changes on load.)
5. **K7:** Should `external` also come from a tag (for example `tags: [external]`) for files written by hand?

## 9. Order of work and size

| Phase | Items | Rough size | Depends on |
| --- | --- | --- | --- |
| 0 | Stencil ids, touch list | S | none |
| 1 | K1 Queue | L | 0 |
| 2 | K2 Load Balancer | M | 0 (uses patterns from 1) |
| 3 | K3 Cache, K4 Rate Limiter, K5 Scheduler | M each | 0 |
| 4 | K6 Stream, K7 External, K8 Object Storage | M / S / S | 1 (K6), 0 (K8) |

At the end of each phase: update this file's checkboxes, add a RELEASE_NOTES entry, add the item to [ROADMAP.md](ROADMAP.md), and run all four checks in §1.
