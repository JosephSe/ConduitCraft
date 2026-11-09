# ConduitCraft after 3.0: what to build next

**Status:** proposal, written 2026-11-09. Nothing here starts until 3.0.0 has shipped (item R3 in [REDESIGN_PLAN_V3.md](REDESIGN_PLAN_V3.md)).

**In one paragraph.** 3.0 changes how the app looks. This file is about what it does next. It comes from two pieces of work: a look at what the best diagramming tools do well, and a second look at how ConduitCraft itself represents a diagram. The result is four small releases. Each one adds a capability and takes something away, so the app ends up doing more with fewer things to learn.

## Contents

1. [How to use this file](#1-how-to-use-this-file)
2. [The rule: nothing gets in for free](#2-the-rule-nothing-gets-in-for-free)
3. [What the best tools do well](#3-what-the-best-tools-do-well)
4. [A second look at how a diagram is represented](#4-a-second-look-at-how-a-diagram-is-represented)
5. [The queue](#5-the-queue)
6. [Not doing, and why](#6-not-doing-and-why)
7. [The complexity ledger](#7-the-complexity-ledger)
8. [What happened to V2's unbuilt items](#8-what-happened-to-v2s-unbuilt-items)
9. [Definition of done](#9-definition-of-done-every-pr)
10. [Open questions, with defaults](#10-open-questions-with-defaults)

---

## 1. How to use this file

The rules are the same as section 1 of the 3.0 plan: take the first unchecked item whose **Needs** are met, do the whole item in one PR, tick it in this file in the same PR, and write `Blocked: <reason>` under an item you cannot finish.

- **Sizes:** S is under a day, M is one to three days, L must be split before starting.
- **PRs target `main`.** 3.0 is out by then, so there is no long-lived branch.
- **Section 3 is the reason, not the spec.** Do not copy another product's screen. Build what sections 4 and 5 describe.
- **3.0's vocabulary stands:** component, wire, swimlane, frame, lens, dock, tray, sheet. Section 2 limits new words.
- **3.0's seven slots stand.** No item here may add an island, a panel or a toolbar. Each item says which existing slot it uses.
- **Order:** releases are listed in the order to build them. Inside a release, follow **Needs**.

---

## 2. The rule: nothing gets in for free

ConduitCraft is one idea: **a diagram you can run.** Draw it, run it, ship it. Other tools draw (Excalidraw, draw.io, Lucidchart), or model (Structurizr, IcePanel, Ilograph), or simulate (Breakscale, PaperDraw). None does all three in one file that works offline with no account. That is the ground to hold, and every feature below is judged against it.

A feature gets in only if it passes all five tests:

1. **It serves draw, run or ship.** It makes one of the three faster, or more truthful.
2. **It adds no always-visible control.** It lives in the dock face for its lens, the inspector, a menu or the command palette. The control-count test from V2 (A14) must not go up.
3. **It adds one new word at most.** A newcomer can ignore it and never be blocked by it.
4. **It works in a static page.** No account, no server, no key. The app is served from GitHub Pages and must keep working offline.
5. **It pays for itself.** Each release removes or merges at least as many ideas as it adds. Section 7 keeps the count.

Standing limits that no item may raise: **12 kinds of component, 7 colours, 4 lenses, 7 slots, 20 Review rules.**

---

## 3. What the best tools do well

| Tool | What it does better than anyone | What we take | What we leave |
|---|---|---|---|
| **Excalidraw, tldraw** | Nothing between you and the first shape. The hand-drawn look says "this is a draft". Both now have text-to-diagram and a tool interface for AI agents. | The Sketch style is already in 3.0 (Y2). A tool interface for agents (3.4-a). | The free-form whiteboard: pens, stickies, any shape anywhere. |
| **Whimsical, FigJam** | Building with the keyboard: add the next connected box without touching the mouse. | Keys that build (3.2-f). | Mind maps, voting, sticky notes. |
| **Miro, Lucidchart** | Breadth: every diagram type, thousands of templates, live multi-user editing. | Nothing. Breadth is their product, and reviewers name its cost: complexity. | All of it. |
| **draw.io** | Free, offline, and the file is yours. | We already share this, and already import its files. | Shape libraries in the thousands. |
| **Mermaid, D2** | A diagram is text in a repository. D2 can hold several states of one diagram (scenarios) and an ordered series (steps) in one file. | Scenarios shown as numbered steps on the diagram itself (3.1-a). | A second text language. The Blueprint file is ours. |
| **Structurizr, LikeC4** | One model, several pictures of it. The advice that goes with it: keep the model true and adjust the views. Dynamic views number the interactions. | A sequence view made from a scenario, never drawn by hand (3.1-d). Technology on every component (3.2-a). | A modelling language, and fixed C4 levels. |
| **IcePanel** | Flows that play step by step over the diagram. Tags that switch on a layer (cost, risk, owner) without a second diagram. Drafts that hold a proposed future next to the present. | Scenario-led presenting (3.1-c). Colour by anything (3.2-d). Compare (3.4-b). | A hosted model database, accuracy scores, a repository-linking service. |
| **Ilograph** | Walkthroughs: Next and Back with a sentence per step. Click a thing and everything unrelated steps back. | A sentence per step when presenting (3.1-c). Focus dimming already exists in Traffic. | A source language, hosted sharing. |
| **Eraser** | AI output is diagram code you can still edit. Diagrams sync with GitHub. | Agents write Blueprint files through a checked tool (3.4-a). The GitHub Action already exists. | Hosted AI with usage billing. |
| **Cloudcraft, Hava** | Diagrams drawn from a live cloud account, with cost estimates. | Nothing new. Compose, Kubernetes and trace import plus the drift check cover the part that needs no credentials. | Cloud credentials, price lists. |
| **Breakscale, PaperDraw, Backpressure** (2026) | Give each part a limit, raise the load, watch what breaks first. Their own authors call the numbers a learning aid and not capacity planning. | A load control that answers one question (release 3.3). | A discrete-event engine, latency percentiles, any claim of accuracy. |

**Three patterns show up in every strong tool:**

1. **One model, several pictures.** Nobody good redraws the same system for a different audience.
2. **The diagram tells a story in steps.** Flows, walkthroughs, dynamic views, steps: the same idea under four names.
3. **Agents draw diagrams now.** The tools that do it well give the agent structured input and do the layout themselves. The ones that ask a model for coordinates get nonsense.

ConduitCraft already has the raw material for all three: scenarios, a headless core with a command-line tool, and one document that four lenses read. The work below is mostly connecting what exists.

**Sources.** Read on 2026-11-09. Most are the vendors' own pages, so features are as the vendor states them; none of these tools was used hands-on for this review.
[IcePanel: getting started](https://docs.icepanel.io/getting-started),
[IcePanel: drafts](https://icepanel.io/blog/2025-11-04-new-drafts-design-future-states-of-software-architecture),
[IcePanel: versioning](https://docs.icepanel.io/future-state-design/versioning),
[IcePanel: top 8 tools](https://icepanel.io/blog/2025-09-03-top-8-diagramming-tools-for-software-architecture),
[Ilograph: walkthroughs](https://www.ilograph.com/docs/editing/walkthroughs/),
[Ilograph: perspectives](https://www.ilograph.com/docs/editing/perspectives),
[Eraser: AI](https://www.eraser.io/ai-new),
[Eraser: GitHub](https://eraser.io/github),
[Eraserbot](https://docs.eraser.io/eraserbot),
[D2: sketch](https://d2lang.com/tour/sketch/),
[Structurizr: as code](https://docs.structurizr.com/as-code),
[Simon Brown: diagrams as code 2.0](https://dev.to/simonbrown/diagrams-as-code-2-0-82k),
[Excalidraw Plus roadmap](https://plus.excalidraw.com/roadmap),
[tldraw SDK 4.4](https://tldraw.dev/blog/tldraw-sdk-4.4),
[Breakscale](https://github.com/xevrion/breakscale/wiki),
[PaperDraw on Hacker News](https://hnshowcase.com/post/47218878/paperdraw-dev-a-system-design-simulator),
[Backpressure](https://www.everydev.ai/tools/backpressure),
[Hava: cost estimation](https://docs.hava.io/diagnose/cost-estimation),
[excalidraw-architect-mcp](https://pypi.org/project/excalidraw-architect-mcp/),
[Dupple: best diagram tools 2026](https://dupple.com/learn/best-diagram-tools).
The reading checks in 4.7 follow the diagram review checklist published with the C4 model at c4model.com, which was not re-read for this file.

---

## 4. A second look at how a diagram is represented

Each part says what the app does today, what is wrong with it, and a verdict: **merge**, **change**, **extend** or **keep**.

### 4.1 Walking through a diagram: three ways become one

- **Today.** A *scenario* is a list of hops through components, played in the Traffic lens. The *Present* lens runs a separate tour: the overview, then every component in the order it sits in the file (`buildTourSteps` in `src/studio/presentation.ts`). V2 planned a third thing, *storyboards*.
- **Problem.** Three timelines for one job. File order is not a story. A scenario's labels live in a side panel, so the diagram itself never shows the order things happen in.
- **Verdict: merge.** The scenario is the only timeline. It plays in Traffic, shows as numbers on its wires in Design, is what Present walks through, and can be read as a sequence view. No new word and no new file format: a step stays a list of component ids, with one optional wire id for the rare case of two wires between the same pair.

### 4.2 The words on a component: eight fields become three

- **Today.** A component has `title`, `subtitle`, `eyebrow`, `footerLeft`, `chip`, `zoneLabel`, `interfaceLabel` and `summary`.
- **Problem.** Nobody can say which words go where. 3.0 already draws only four of them. The one thing every reader asks of a box, "what is it built on?", has no field of its own.
- **Verdict: change.** Three fields: **Name**, **Technology** and **Description**. Technology ("Postgres", "Go on Kubernetes") is what the C4 model asks for on every box, and it is what the 3.0 tray's search already understands. The readout at the bottom right (the old `chip`) is written by the app from the component's settings ("3 copies", "hits 80%") unless the user types their own.

### 4.3 Colour: one hand-set meaning becomes "Colour by"

- **Today.** Each component and wire has a colour picked by hand. "Colour by" already offers colour, status and tag.
- **Problem.** With seven colours there is more room to say something, but hand-set colour means whatever the author remembered that day, and the legend has to be kept in step by hand.
- **Verdict: extend.** Add **Owner** and **Swimlane** to "Colour by". Build the legend from what is on the sheet: only the colours in use, each with its name and a count. This is IcePanel's layer idea with no new concept, since the picker is already there.

### 4.4 Wire routes: nine choices become four

- **Today.** A wire has nine routes: Smart Auto, Direct Line, Smooth S-Curve, Curved Arc, Vertical Fan-out, Rounded Elbow, Sharp Step, Under U-Loop and Over U-Loop.
- **Problem.** Nine answers to a question most people never want to be asked. Auto and a dragged waypoint cover nearly every case.
- **Verdict: change the picker, not the file.** Show four: **Auto**, **Straight**, **Elbow**, **Curve**. The other five still open, draw and export exactly as before. A wire that uses one shows it as a fifth entry, so nothing changes silently.

### 4.5 Putting things together: five containers, each with one job

- **Today.** Swimlanes, frames, groups, levels and pages.
- **Problem.** Five is a lot, and frames and levels overlap: both say "these belong together".
- **Verdict: keep all five, and say what each is for** in one line where the user picks it: a swimlane is a stage in order, a frame is a boundary, a group moves together, a level is the inside of a component, a page is another sheet. Turning a frame into a level and back was considered and parked (section 6).

### 4.6 Numbers: many readouts become one question

- **Today.** Copies, wire latency, a latency budget, cache hit rate, rate-limit ratio and queue backlog. Each is real.
- **Problem.** They never add up to an answer. The question an architect brings is "if traffic triples, what gives out first?"
- **Verdict: extend, by one field and one control.** A component gets an optional **capacity** (requests a second that one copy can take). The Traffic dock gets a **Load** control. The run then says which component gives out first. It is arithmetic, it is labelled as a sketch, and it stops there (release 3.3).

### 4.7 Review: "is the system sound?" gains "can a stranger read this?"

- **Today.** Sixteen rules. Fifteen are about the system (single points of failure, cycles, queues with no reader). One is about the drawing (a wire with no label).
- **Problem.** Most bad diagrams are bad drawings of sound systems: no title, boxes with no explanation, arrows that could mean anything.
- **Verdict: extend, by three rules** in a group called **Reading**: a component with no description, a two-way wire with no label, and a sheet too crowded to read. With the one rule that 3.3 adds, that makes twenty, which is the ceiling.

### 4.8 Change over time: three lists become one picture

- **Today.** The snapshot dialog lists differences as rows. The drift dialog outlines them while it is open. The command-line tool prints them. All three use `computeDocumentDiff`.
- **Problem.** A list of changed ids is not a picture of a change. V2 recorded that the overlay on the sheet was never built.
- **Verdict: merge into Review.** 3.0 gives Review a red pen. "Compare with" uses it: what is new, what is gone and what changed, marked and numbered on the sheet, stepped through with the Review dock.

### 4.9 Looked at and kept

- **Kinds and shapes.** In 3.0 a component's cut-out is its shape, so the kind already decides the shape for nearly everyone. Twelve kinds is enough.
- **Lenses.** Four is right. Present gets a better script (4.1), not a redesign.
- **Tags, pages, levels.** No change.

---

## 5. The queue

### Release 3.1: Scenarios everywhere

One timeline (4.1). Adds the sequence view. Removes Present's separate tour as a thing to learn.

#### [ ] 3.1-a. Numbered scenarios on the sheet · M
- **Read:** `SimulationScenario` and `SimulationStep` in `src/types.ts`; `src/studio/simulationPlayback.ts`; `src/studio/runBar.ts`; the wire code in `keyedStage.ts`; `diagramSvg.ts`.
- **Do:** when a scenario is selected in the Design lens, draw a small numbered marker at the middle of each wire it travels, in step order, in the scenario's colour. Wires not in the scenario drop to 35% opacity. A step finds its wire from each consecutive pair of component ids; add an optional `wires?: string[]` to a step for when two wires join the same pair. The scenario picker is the one 3.0 already puts in the Traffic dock; in Design it lives in the view popover (the SE slot).
- **Exports:** an SVG or PNG exported with a scenario selected carries the numbers, and the title block names the scenario.
- **Done:** on the showcase, selecting its first scenario in Design shows 1 to N in order; a unit test covers wire lookup, including the two-wire case. **Needs:** 3.0 shipped.

#### [ ] 3.1-b. Record a scenario by clicking · M
- **Read:** the scenario editor in `src/studio/inspector.ts` (search for "Add hop").
- **Do:** a "Record" button in the scenario editor. While recording, each click on a component adds it to the current step, the wire just travelled lights up with its number, and the dock's hint line says what to click next. Enter ends the step; Escape ends the recording. Clicking a component that no wire reaches from the last one is refused with a one-line reason. The form with "Add hop" stays for fine edits.
- **Done:** a Playwright spec records a three-step scenario with clicks only and plays it. One undo step per recording. **Needs:** 3.1-a.

#### [ ] 3.1-c. Present walks a scenario · M
- **Read:** `src/studio/presentation.ts` (`buildTourSteps`), `presentationTrigger.ts`.
- **Do:** Present opens on the overview, then walks the selected scenario: each step frames the components it touches, lights its wires, and shows the step's label as one sentence at the bottom. Right and Left move, as now. With more than one scenario, the overview lists them. A step may hold an optional camera (centre and zoom) for when the automatic framing is wrong. A diagram with no scenarios keeps today's tour of every component (Q2).
- **Done:** the showcase presents as a story in the order of its first scenario; the exported HTML page does the same. **Needs:** 3.1-a.

#### [ ] 3.1-d. Sequence view · M
- **Do:** a pure function `scenarioToSequence(doc, scenarioId)` in `src/core/` returns lifelines (the components the scenario touches, in order of first appearance) and messages (one per hop, with the wire's label and protocol, dashed for async, marked when the target is failed). A second function draws it as SVG in the diagram's style. "Show as sequence" in the scenario menu opens it as a read-only overlay closed with Escape, like Present. Export offers it as SVG and PNG.
- **Do not:** make it editable, and do not write Mermaid text (V2's D8: Mermaid is import only).
- **Done:** unit tests for the function on the showcase scenarios; the overlay is in the visual check. **Needs:** 3.1-a.

### Release 3.2: Fewer, clearer

Pays down the model (4.2 to 4.5, 4.7). Removes five text fields and five route choices from view.

#### [ ] 3.2-a. Name, technology, description · M
- **Read:** every use of `eyebrow`, `footerLeft`, `chip`, `zoneLabel`, `interfaceLabel` and `summary` (7 to 24 source files each); `src/core/schema.ts`.
- **Do first:** a throwaway script that counts, across every template and the showcase, how often each of the six fields holds something other than its default. Put the table in the PR. The migration below is the default; change it if the table says a field carries meaning this plan missed.
- **Do:** add `technology?: string`. Bump the schema with a migration: `title` and `subtitle` stay; `eyebrow` moves to `technology` when it is not just the kind's name; `footerLeft`, `zoneLabel` and `interfaceLabel` are appended to `summary` on their own lines when set; `chip` stays as a manual readout. The inspector's Look tab shows Name, Technology and Description. The readout is derived from settings (copies, hit rate, schedule, limit) when `chip` is empty. Importers write the image or engine name into `technology`. `docs/guide.md` and `docs/llm-rules.md` describe three fields.
- **Done:** every template and the showcase round-trip with no visible change at 100%; migration tests cover each moved field. **Needs:** 3.0 shipped (Y1 has already bumped the schema once).

#### [ ] 3.2-b. Technology marks · S, then S for each further set
- **Do:** when `technology` names something well known (Postgres, Redis, Kafka, S3, nginx and about 35 more), draw its mark in the component's tile in place of the kind icon, in the component's colour, never in brand colours. The marks are SVG paths in a lazily loaded module of 30 kB at most, with the tray's search words as the lookup. The kind icon returns when the name is not recognised.
- **Done:** typing "kafka" in the tray and dropping the result gives a Stream with Kafka's mark; exports draw the same mark. **Needs:** 3.2-a, and Q4 answered.

#### [ ] 3.2-c. Four routes in the picker · S
- **Do:** 4.4. The picker shows Auto, Straight, Elbow and Curve, mapped to `auto`, `straight`, `orthogonal` and `bezier`. A wire using any other route shows that route as a fifth, selected entry. No file or parser change.
- **Done:** the route tests still pass unchanged; a spec asserts four entries on a new wire and five on a wire with `over`. **Needs:** 3.0 shipped.

#### [ ] 3.2-d. Colour by owner and swimlane, and a legend that writes itself · S
- **Read:** `ColourBy` and `effectiveTone` in `src/core/meta.ts`.
- **Do:** 4.3. Add `owner` and `lane` to `ColourBy`, assigning the seven colours in order of first appearance and reusing the seventh for "others". The legend lists only what is on the sheet, with a count, and is drawn into exports. Custom names set on a diagram still win.
- **Done:** unit tests for the assignment being stable when a component is added. **Needs:** 3.0's T5 (seven colours).

#### [ ] 3.2-e. Reading checks in Review · S
- **Read:** `INSIGHT_RULES` in `src/core/insights.ts`.
- **Do:** 4.7. Three rules at the lowest severity, in a group named "Reading": `no-description` (a component with neither a description nor notes), `two-way-unlabeled`, and `too-dense` (more than 25 components on one sheet; the fix offered is a new page or a level). Each can be muted like any other rule.
- **Done:** rule tests; the showcase gains no new finding it does not keep on purpose. **Needs:** 3.2-a.

#### [ ] 3.2-f. Keys that build · S
- **Read:** `src/core/keymap.ts`, `src/studio/rovingFocus.ts`, the create-by-wiring code from 3.0's S7.
- **Do:** with one component selected, Alt and an arrow key adds a connected component of the same kind in that direction, one grid step away, clear of anything in the way, with its name ready to type. Enter confirms; a second Alt and arrow carries on from the new one. Tab is not used: it belongs to focus.
- **Done:** a spec builds a five-component chain without the pointer; the shortcut is in the keymap and the help list. **Needs:** 3.0 shipped.

### Release 3.3: Load

One field and one control (4.6). Adds the word "capacity".

#### [ ] 3.3-a. The load model · M
- **Read:** `src/core/reachability.ts`, `failures.ts`, `queues.ts`, `balancers.ts`.
- **Do:** a pure function `computeLoad(doc, requestsPerSecond, failed)` in `src/core/load.ts`. Rules:
  - Load enters at every component with no incoming wire, split evenly unless one is selected.
  - A component passes its full incoming rate down every outgoing wire, with these exceptions. A **load balancer** splits across its live targets by its strategy. A **cache** passes on only its misses. A **rate limiter** passes on at most its ratio. A **queue** passes on what its readers can take; the rest is backlog growing per second. A **stream** passes the full rate to every reader.
  - A component's limit is `capacity` times its copies. At 80% or more it is "near its limit". At 100% or more it is "saturated", and it passes on only what it can take.
  - A component with no capacity is "not rated" and never saturates. A loop is followed once.
  - A failed component passes nothing; its fallback, if set, takes its incoming rate.
- **Add:** `capacity?: number` on a component, in the inspector's Behaviour tab next to Copies.
- **Done:** unit tests for each rule and for the showcase at 1x, 3x and 10x. No random numbers anywhere: the same input always gives the same output. **Needs:** 3.0 shipped.

#### [ ] 3.3-b. Load in the Traffic dock · M
- **Do:** the Traffic face of the dock gets one control, "Load", a stepper with 1x, 2x, 5x, 10x and a typed value in requests a second. Components show "Near limit" and "Saturated" as states in 3.0's state language (a word and the status light, never colour alone). Wires carry more capsules as load rises, capped so the frame rate holds. The control is hidden when no component has a capacity, with one line in the hint that says how to add one.
- **Done:** the control-count test does not go up in Design; view 4 of the visual check gains a saturated variant. **Needs:** 3.3-a.

#### [ ] 3.3-c. "First to give out" · S
- **Do:** the run summary gains one sentence: which component saturates first and at what load, or that nothing does up to 10x, and how many components are not rated. The words "a sketch, not a load test" sit beside it. One new Review rule, `no-headroom`: a rated component that saturates below 2x. It is the twentieth rule and the last (section 2).
- **Done:** the sentence is in the exported HTML page and in `describeDiagram`. **Needs:** 3.3-b.

### Release 3.4: Agents and change

Lets coding agents draw and check diagrams, and turns three difference lists into one picture (4.8).

#### [ ] 3.4-a. A tool interface for agents · M
- **Read:** `tools/conduitcraft.ts` and `tools/cliCore.ts` (commands `render`, `check`, `diff`, `drift`); `src/core/elkLayout.ts`; `src/core/describe.ts`; the current Model Context Protocol specification. Read the specification before writing any of this; do not work from memory.
- **Do:** a new command, `conduitcraft mcp`, that serves the protocol over standard input and output, written by hand with no new dependency. Tools:
  - `read`: a Blueprint file as the text outline from `describeDiagram`.
  - `write`: components, wires, swimlanes and scenarios **without coordinates**, laid out by ELK and saved as a Blueprint file. Unknown ids and kinds come back as line-numbered errors, as in import.
  - `check`: the Review findings.
  - `fail`: a component id, returning what becomes unreachable and what reroutes.
  - `render`: SVG or PNG.
  - `load`: the 3.3 summary at a given rate, once 3.3 has shipped.
- **Done:** a test drives each tool through a pipe; `docs/guide.md` has a setup section; an agent can go from "draw this repository's services" to a file that passes `check` without ever sending a coordinate. **Needs:** 3.0 shipped. Publishing the tool to npm is the owner's call (Q5).

#### [ ] 3.4-b. Compare, in the Review lens · M
- **Read:** `src/core/diff.ts` (`computeDocumentDiff`), `src/studio/snapshotsDialog.ts`, `src/core/drift.ts`, the redline marks from 3.0's C5.
- **Do:** "Compare with" in the Review dock's menu takes a snapshot, a file, or the source a diagram was imported from. On the sheet: new things keep their colour while the rest is grey; removed things are drawn as a struck-through outline in red pen; changed things are circled and numbered. The dock steps through them and names what changed. The snapshot and drift dialogs open this view where they used to draw their own lists.
- **Done:** one code path for snapshot, file and drift comparisons; an export of the compare view is a "before and after" picture. **Needs:** 3.0 shipped.

#### [ ] 3.4-c. "What changed" in the GitHub Action · S
- **Read:** `tools/action.sh`.
- **Do:** when a pull request changes a Blueprint file, the Action renders the compare picture and attaches it. Posting it as a comment is opt-in.
- **Needs:** 3.4-b.

#### [ ] 3.4-d. Two small carry-overs · S each
- **View-only link** (V2's F3): a share link that opens the diagram with editing off, using the exported page's viewer.
- **PDF and print** (V2's F7): print the sheet with the Print style from 3.0's Y1 and the title block.

---

## 6. Not doing, and why

| Idea | Why not |
|---|---|
| Live multi-user editing | Needs a server and accounts (test 4). A Blueprint file in git, the Action, and a share link cover working together. |
| An AI panel inside the app | Needs a key or a server (test 4). Agents come in through 3.4-a, and the LLM rules already work with any chat. |
| A free-form whiteboard | Pens and stickies are Excalidraw's product. Ours is a diagram that runs. |
| Cloud account sync and cost | Credentials and price lists. Imports and the drift check cover what needs neither. |
| A second text language | The Blueprint file is the text format. |
| Thousands of icons, isometric view | The cut-outs are the identity. 3.2-b adds about 40 marks and stops. |
| A real simulation engine | Percentiles and random arrivals look like truth and are not. 3.3 is arithmetic and says so. |
| Comment threads | One person, one browser. The `comment` field stays. |
| Video export | The GIF and the interactive page already ship. |
| Coach marks | 3.0's dock hint and tray demos teach in place. |
| Turning a frame into a level and back | Appealing (it is the C4 zoom idea), but every wire that crosses the frame's edge has to be re-attached both ways. Parked until someone asks twice. |
| Terraform import, translations, live data sources | Parked, not rejected. Each is large and none is asked for yet. |

---

## 7. The complexity ledger

Counted as things a user has to learn. Update this table in the PR that ships the last item of a release.

| Release | Adds | Removes or merges | Net |
|---|---|---|---|
| 3.1 | Sequence view | Present's separate tour; the planned storyboards | −1 |
| 3.2 | Technology field | Five text fields; five route choices; the hand-kept legend | −10 |
| 3.3 | Capacity; the Load control | (nothing) | +2 |
| 3.4 | Compare | The snapshot difference list; the drift difference list | −1 |
| **Total** | **5** | **15** | **−10** |

The agent tool (3.4-a) and the keyboard shortcut (3.2-f) are not counted: nobody using the app has to know they exist.

If a release would end with a positive net and no later release pays it back, stop and cut scope before shipping. 3.3 is the one release that adds; 3.2 is ordered before it on purpose.

---

## 8. What happened to V2's unbuilt items

| V2 item | Now |
|---|---|
| E4 Live data sources | Parked |
| F1 Storyboards | Merged into 3.1-c |
| F2 Video export | Not doing |
| F3 Read-only viewer and embeds | 3.4-d |
| F4 Diagram styles | In 3.0 (Y1, Y2) |
| F5 Comments | Not doing |
| F6 Coach marks | Not doing |
| F7 PDF and print | 3.4-d |
| G1 Icon packs | 3.2-b, as technology marks |
| G2 Internationalisation | Parked |
| G3 Terraform import | Parked |
| G4 Collaboration | Not doing |
| G5 AI assist | 3.4-a |

---

## 9. Definition of done (every PR)

Everything in section 12 of the 3.0 plan, and:

- The PR description answers the five tests in section 2, one line each.
- The same change is in the SVG and HTML exports where it is visible.
- `docs/guide.md` describes it, and `docs/llm-rules.md` too if the file format changed.
- No new always-visible control; the control-count test passes unchanged.
- The bundle budgets hold. Anything over 10 kB that is not needed at first paint loads lazily.
- A newcomer following the first-run path never meets the feature unless they go looking.

---

## 10. Open questions, with defaults

| # | Question | Blocks | Default |
|---|---|---|---|
| Q1 | Keep the word "scenario", or rename it "story"? | 3.1-a | Keep "scenario". No new word. |
| Q2 | With no scenarios, does Present keep today's tour of every component? | 3.1-c | Yes |
| Q3 | Four routes in the picker, or three (dropping Curve)? | 3.2-c | Four |
| Q4 | Are technology marks acceptable? The paths can come from Simple Icons (CC0), but the marks are other companies' trademarks. | 3.2-b | Yes, about 40, in the component's colour only, never as branding. If no, skip 3.2-b. |
| Q5 | Publish the command-line tool to npm so agents can run it with one command? | 3.4-a | Not yet. Run it from a checkout, and decide after it has been used. |
| Q6 | Should unrated components get a guessed capacity? | 3.3-a | No. "Not rated" is honest; a guess is not. |
| Q7 | If only one release gets built, which? | everything | 3.1. It is the most visible and touches no file format. |
