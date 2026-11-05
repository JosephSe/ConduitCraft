# ConduitCraft conversion rules for LLMs

These rules teach a language model to turn an architecture diagram into a ConduitCraft Blueprint file that opens in the studio and can be edited. The diagram can be an image, a photo of a whiteboard, a draw.io file, Mermaid, PlantUML, a C4 model or a written description.

**How to use it.** Paste this whole file into a chat with any capable LLM. Attach or paste your diagram, then ask: "Convert this diagram to a ConduitCraft Blueprint file using the rules." Save the reply as `name.blueprint.md`. Then drop it on the ConduitCraft canvas, open it with **Open**, or paste it into the code pane (`Cmd/Ctrl+/`). To check it from a terminal, run `pnpm conduitcraft check name.blueprint.md`. The studio's command palette (`Cmd/Ctrl+K`) has **Copy LLM Rules**, which copies this file.

ConduitCraft already opens `.drawio` and Excalidraw files directly with their positions, and lays out Mermaid flowcharts itself. Use these rules when the source is an image, or when you want the extras a direct import cannot guess: component kinds, protocols, async calls and runnable scenarios.

Everything below is written to the model.

---

## 1. Your task

You convert one architecture diagram into one ConduitCraft Blueprint file.

1. **Keep everything that is there.** Every box, cylinder, icon, person and labelled shape in the source becomes a component. Every arrow or line between two of them becomes a wire. Every group, container, swimlane or boundary becomes a swimlane or a frame. Keep the source's words for titles and labels.
2. **Add only what makes the file useful.** You may infer the kind of each component, its icon and colour, a one-line subtitle, a short summary, wire labels, protocols, which calls are async, and one to three scenarios that walk the main flows. Section 9 lists what you may infer and what you must not invent.
3. **Never invent components or wires** that are not in the source, and never invent numbers: no latencies, replica counts, hit rates or metrics unless the source shows them.
4. **Reply with the file only**, inside one fenced code block tagged `markdown`. Write no prose before or after it, unless section 10 asks you to list what you could not read.

## 2. The file format

A Blueprint file is YAML front matter between two `---` lines. Nothing else is needed: no Mermaid block, no prose. The first line of the file is `---` and so is the last.

```markdown
---
title: "Parcel Tracking"
systemTag: "LOGISTICS // V1"
statusLabel: "DRAFT"
direction: LR
overviewSummary: "Customers and couriers reach the tracking API through one gateway; scans become events that send SMS updates."
zones:
  - { id: zone-people, number: "01", title: "People", subtitle: "Who uses it", x: 60, width: 360 }
  - { id: zone-apps, number: "02", title: "Apps", subtitle: "Web and mobile", x: 460, width: 360 }
nodes:
  customer:
    kind: actor
    title: "Customer"
    subtitle: "Waits for a parcel"
    position: [100, 160]
  web:
    kind: client
    title: "Web tracker"
    subtitle: "React"
    position: [500, 160]
edges:
  - { id: e-browse, from: customer, to: web, label: "Track parcel" }
simulations: []
---
```

### YAML rules that prevent broken files

- **Put every free-text value in double quotes**: titles, subtitles, labels, summaries, traces, metric values. Inside double quotes, escape `"` as `\"` and `\` as `\\`.
- Write keywords, ids, numbers and booleans without quotes: `kind: service`, `from: api`, `replicas: 3`, `external: true`.
- Indent with two spaces. Never use tabs.
- Write `nodes` as a map keyed by id, not as a list.
- Write `edges`, `zones`, `frames`, `notesCards`, `simulations` and `pages` as lists.
- Use block style (one field per line) for nodes. Short one-line `{ ... }` maps are fine for edges, zones and steps.

### Ids

- An id is lowercase letters, digits and hyphens, starting with a letter: `orders-api`, `pg-primary`, `kafka`.
- Make ids short and readable, from the component's name. Every id is unique in the whole file, across pages and levels too.
- Edges, scenarios, `fallbackId`, `deadLetterId` and `backingId` refer to components by id. Each reference must match an id exactly.

## 3. Document fields

| Field | Required | What to write |
| --- | --- | --- |
| `title` | yes | The diagram's title, or a name for the system if the source has none. |
| `systemTag` | no | A short uppercase tag shown in the header, for example `"PAYMENTS // V2"`. |
| `statusLabel` | no | A short uppercase label such as `"DRAFT"`, `"PROPOSED"` or `"LIVE"`. Use `"DRAFT"` when unsure. |
| `direction` | no | `LR` (left to right, the default) or `TD` (top to bottom). Match the main flow of the source. |
| `overviewSummary` | yes | One or two sentences on what the system does and how a request flows through it. |
| `pageTitle` | no | Name of the first page, when the file has several (section 8). |
| `legend` | no | What each colour means, when the source has a key: `[{ tone: rose, label: "Payments" }]`. One entry per tone. |
| `brand` | no | `{ name: "Acme" }` when the source shows a company name. Leave out `logo`. |
| `zones`, `frames`, `nodes`, `edges`, `notesCards`, `simulations`, `pages` | `nodes` yes | Described below. |

Do not write `stageWidth` or `stageHeight`. The studio sizes the canvas to fit.

## 4. Components (`nodes`)

Each entry under `nodes:` is keyed by its id:

```yaml
nodes:
  orders-api:
    kind: service
    title: "Orders API"
    subtitle: "Node.js · REST"
    eyebrow: "SERVICE"
    chip: "API"
    footerLeft: "Kubernetes"
    interfaceLabel: "REST / JSON"
    icon: code
    accent: blue
    position: [1300, 400]
    summary: "Accepts orders from the web app, checks stock and writes the order."
    metrics:
      - { label: "Runtime", value: "Node.js 20" }
```

| Field | What to write |
| --- | --- |
| `kind` | Required. One of the twelve kinds in the table below. |
| `title` | Required. The name in the source, word for word (fix obvious typos only). |
| `subtitle` | The technology or role in a few words: `"PostgreSQL 16"`, `"Edge cache, TLS"`. Take it from a second line in the source when there is one. |
| `eyebrow` | A short uppercase word for the layer or role, shown above the title: `EDGE`, `SERVICE`, `DATA`, `PARTNER`. |
| `chip` | A short uppercase badge: `API`, `TIER 1`, `ASYNC`, `PCI`, `SaaS`. |
| `footerLeft` | A short note at the foot of the card: where it runs or how, such as `"AWS Lambda"` or `"3 AZs"`. |
| `interfaceLabel` | How others talk to it: `"REST / JSON"`, `"gRPC"`, `"SQL"`, `"Kafka topic"`. |
| `summary` | One or two plain sentences on what it does in this system. |
| `icon` | One of the twenty icons in section 4.3. Leave it out to use the kind's default. |
| `accent` | The card colour: `blue`, `emerald`, `rose`, `violet` or `amber` (section 6). Leave it out to use the kind's default. |
| `shape` | An outline from section 4.2. Leave it out for the standard card. |
| `position` | `[x, y]`, the top-left corner, from the layout grid in section 7. |
| `zoneLabel` | Optional text on the card naming its group. It does not decide which swimlane the card sits in; its position does. |
| `frame` | The id of the frame that holds it (section 7.3). |
| `metrics` | A list of `{ label, value }` pairs: facts the source shows, or plain descriptors such as `Runtime` or `Team`. Never made-up numbers. |
| `payload` | Optional example request or message, as a YAML map. It is shown as the component's contract. |
| `status` | `planned`, `live`, `deprecated` or `at-risk`, only when the source says so (section 9). |
| `comment` | A note shown as a badge. Use it for anything you were unsure about (section 10). |
| `tags` | A list of short labels, such as `["pii", "payments"]`, when the source groups things by a label. |
| `owner` | The team or person, only when the source names one. |
| `links` | `[{ label: "Runbook", url: "https://...", kind: runbook }]` for links in the source. `kind` is `repo`, `runbook`, `dashboard`, `docs` or `oncall`. Only http, https and mailto links are kept. |
| `external: true` | The component is run by someone else: a SaaS, a partner or a payment provider. |
| `resilience` | `{ replicas: 3, fallbackId: other-id, circuitBreaker: true }`, each part only when the source shows it. |
| `queue`, `cache`, `limiter`, `schedule`, `balancer` | Settings for those kinds (section 4.4). |
| `children` | A level inside this component (section 8). |

Fill in `subtitle`, `eyebrow`, `chip`, `footerLeft` and `interfaceLabel` with real words for each component. If you leave one out, the studio writes a generic default for the kind, such as "Request Processor" or "REST / gRPC".

### 4.1 Kinds

Choose the kind by what the component does, not by how it is drawn. The kind decides how failures, queues and scenarios behave.

| `kind` | Use for | Cues in a source diagram | Default icon, colour |
| --- | --- | --- | --- |
| `actor` | A person or role | stick figure, person icon, "User", "Admin", "Customer" | `actor`, blue |
| `client` | Something that starts requests: a web app, mobile app, CLI, partner system calling in, IoT device | browser or phone icon, "SPA", "iOS app", "Partner ERP" | `agency`, violet |
| `core` | The main application or a central platform | the biggest box, "Platform", "Monolith", "Core" | `monitor`, blue |
| `service` | A service, API, function, worker or job runner, and any third-party API you call | rectangles, "API", "Service", Lambda, Cloud Run, container icons | `code`, blue |
| `gate` | An API gateway, WAF, CDN edge, firewall, auth or policy check, or a decision point | diamond, shield, "Gateway", "WAF", "Ingress", "Auth" | `shield`, violet |
| `balancer` | A load balancer that spreads traffic over several targets | "ALB", "NLB", "LB", "HAProxy", "nginx (LB)" | `balancer`, violet |
| `store` | A database, data warehouse, file store or object storage | cylinder, "DB", "Postgres", "S3", "Blob", "Warehouse" | `database`, emerald |
| `cache` | A cache in front of a store | "Redis", "Memcached", "cache" | `bolt`, emerald |
| `queue` | A message queue, or a stream or log (set `queue.delivery: fanout`) | pipe, "SQS", "RabbitMQ", "Kafka topic", "Kinesis", "queue" | `queue`, amber |
| `bus` | An event broker that routes messages and forgets them | "EventBridge", "SNS", "NATS", "Event bus", "Pub/Sub" (as a router) | `bridge`, amber |
| `limiter` | A rate limiter or throttle | "Rate limit", "Throttle", "Quota" | `gauge`, violet |
| `scheduler` | Something that starts work on a timer | clock icon, "Cron", "Nightly", "Every 5 min", "Scheduler" | `clock`, blue |

Important rules:

- **Entry points are `actor`, `client` and `scheduler`.** Failure analysis asks "what can still be reached from an entry point". So a third-party API you call (Stripe, Twilio, SendGrid, OpenAI, a bank) is **not** a `client`. Make it a `service` with `external: true`. A partner system that calls *into* your system is a `client`.
- Object storage (S3, GCS, Azure Blob, MinIO) is `kind: store` with `shape: bucket` and `icon: bucket`.
- A Kafka, Kinesis, Pulsar or Redpanda topic is `kind: queue` with `queue: { delivery: fanout }` and `icon: stream`. SQS, RabbitMQ or a work queue stays a plain `queue`.
- A box labelled only "Kafka" or "Kafka cluster", with many topics, can be one `queue` with `delivery: fanout`.
- A CDN is a `gate` with `icon: globe` when it fronts the system and filters traffic.
- When unsure, use `service`.

#### Cloud and product names

| Name in the source | `kind` | Extra fields |
| --- | --- | --- |
| AWS Lambda, Cloud Functions, Azure Functions | `service` | `icon: bolt`, `footerLeft: "Serverless"` |
| ECS, EKS, GKE, Cloud Run, App Service, a container, a pod | `service` | `icon: server` or `code` |
| EC2, VM, Compute Engine | `service` | `icon: server` |
| API Gateway, Apigee, Kong, Azure APIM | `gate` | `icon: shield` |
| CloudFront, Cloudflare, Fastly, Akamai, Azure Front Door | `gate` | `icon: globe` |
| Route 53, Cloud DNS | `gate` | `icon: globe` |
| ALB, ELB, NLB, Cloud Load Balancing, Azure LB | `balancer` | |
| Cognito, Auth0, Okta, Keycloak, Entra ID | `service` | `icon: lock` (add `external: true` for a SaaS such as Auth0 or Okta) |
| RDS, Aurora, Cloud SQL, PostgreSQL, MySQL, SQL Server, Oracle | `store` | `icon: database` |
| DynamoDB, Cosmos DB, MongoDB, Cassandra, Firestore | `store` | `icon: database` |
| Snowflake, BigQuery, Redshift, Databricks | `store` | `icon: database`, `subtitle: "Warehouse"` |
| S3, GCS, Azure Blob, MinIO | `store` | `shape: bucket`, `icon: bucket` |
| ElastiCache, Redis, Memcached, Memorystore | `cache` | |
| SQS, RabbitMQ, Azure Service Bus queue, ActiveMQ | `queue` | |
| Kafka, MSK, Kinesis, Event Hubs, Pulsar, Redpanda | `queue` | `queue: { delivery: fanout }`, `icon: stream` |
| SNS, EventBridge, NATS, Google Pub/Sub, Azure Event Grid | `bus` | |
| CloudWatch Events schedule, Cloud Scheduler, a cron job, Airflow schedule | `scheduler` | `schedule: { every: "..." }` |
| Step Functions, Temporal, Airflow DAG (as a runner) | `service` | `icon: cpu` |
| Elasticsearch, OpenSearch | `store` | `icon: database`, `subtitle: "Search index"` |
| SageMaker, Vertex AI, OpenAI, Bedrock, a model | `service` | `icon: spark` (add `external: true` for a hosted API) |
| Stripe, Adyen, PayPal, Twilio, SendGrid, Mailgun, Slack | `service` | `external: true`, `icon: cloud` |
| Grafana, Datadog, Prometheus, a dashboard | `client` if people use it to look in, `service` if it collects | `icon: monitor` or `gauge` |
| Browser, SPA, React app, web app | `client` | `icon: monitor` |
| iOS, Android, mobile app | `client` | `icon: agency` |
| WAF, firewall, Shield | `gate` | `icon: shield` |
| Vault, KMS, Secrets Manager | `service` | `icon: lock` |

### 4.2 Shapes

`shape` changes only the outline. Leave it out for the standard card.

| `shape` | Use when |
| --- | --- |
| `rounded` | The source draws a rounded box and you want to keep that look. |
| `pill` | A stadium or capsule shape; good for external services and small edge pieces. |
| `circle` | A circle, such as an identity provider or a hub. |
| `diamond` | A decision or check. Usually on a `gate`. |
| `hexagon` | A hexagon, often an edge or gateway. |
| `asymmetric` | A flag or banner shape, such as Mermaid's `>text]`; good for planned or optional pieces. |
| `trapezoid` | A trapezoid. A `balancer` is drawn as one without setting it. |
| `bucket` | Object storage. Use only with `kind: store`. |

A `store` is drawn as a cylinder and a `queue` as a pipe, without setting a shape.

### 4.3 Icons

| `icon` | Meaning |
| --- | --- |
| `actor` | A person |
| `monitor` | A screen: web app, dashboard, admin UI |
| `agency` | A client, organisation, mobile app or partner |
| `code` | A service or API |
| `server` | A server, VM or container host |
| `cpu` | Compute, a worker, a workflow runner |
| `cloud` | A cloud or SaaS provider |
| `globe` | The internet, DNS, a CDN |
| `shield` | Security: gateway, WAF, firewall |
| `lock` | Authentication, identity, secrets |
| `database` | A database |
| `bucket` | Object storage |
| `bolt` | A cache, or a fast or serverless function |
| `queue` | A queue |
| `stream` | A stream or log |
| `bridge` | A broker or integration bus |
| `balancer` | A load balancer |
| `gauge` | A rate limiter, metrics or monitoring |
| `clock` | A schedule or timer |
| `spark` | AI, machine learning, analytics |

### 4.4 Settings for special kinds

Write these only when the source says so or the kind needs them to make sense.

```yaml
  orders-queue:
    kind: queue
    queue:
      ordering: fifo          # standard (default), fifo or priority
      delivery: competing     # competing (default): each message to one reader; fanout: a stream, every reader gets every message
      maxDepth: 5000          # optional, a whole number from 1 to 9999
      deadLetterId: orders-dlq  # optional, another component (usually a queue) for overflow and failed messages
      retention: "7 days"     # optional free text, up to 40 characters
      partitions: 6           # streams only, 1 to 12, default 3; only drawn
  session-cache:
    kind: cache
    cache:
      hitRate: 90             # percent, 0 to 100, default 80. Only when the source states it.
      backingId: users-db     # the store behind the cache
  api-limiter:
    kind: limiter
    limiter: { admit: 4, per: 5, failOpen: false }   # admit 4 of every 5 requests, the default
  nightly-export:
    kind: scheduler
    schedule: { every: "0 2 * * *" }   # free text: "5m", "hourly", a cron line; up to 40 characters
  web-lb:
    kind: balancer
    balancer: { strategy: least-connections }   # round-robin (default), least-connections, weighted or hash
```

The allowed values:

- queue `ordering`: `standard`, `fifo` or `priority`
- queue `delivery`: `competing` or `fanout`
- balancer `strategy`: `round-robin`, `least-connections`, `weighted` or `hash`

Leave a setting out to use its default.

- A **cache** should have a wire to the store behind it (for example labelled `"Read-through on miss"`) and `cache.backingId` set to that store.
- A **queue** needs at least one wire out of it to the component that reads it. A queue with nothing reading it is flagged.
- A **balancer** should have wires to two or more targets. If the source shows one box marked "×3" or "Auto Scaling group", give that box `resilience: { replicas: 3 }` instead.

## 5. Wires (`edges`)

```yaml
edges:
  - { id: e-checkout, from: web, to: orders-api, label: "Place order", protocol: http, tone: blue }
  - { id: e-order-event, from: orders-api, to: order-events, label: "OrderPlaced", protocol: kafka, sync: async, tone: amber }
```

| Field | What to write |
| --- | --- |
| `id` | A unique id, such as `e-checkout`. Recommended. |
| `from`, `to` | Required. Component ids. The arrow points from `from` to `to`. A wire never connects a component to itself. |
| `label` | What travels on the wire, in a few words: `"Place order"`, `"GET /track/{id}"`, `"OrderPlaced"`, `"Write order"`. Use the source's label; if there is none, write one that fits. Label every wire between two services. |
| `protocol` | `http`, `grpc`, `graphql`, `kafka`, `amqp`, `sql` or `custom`. It is shown as a prefix on the label, so do not repeat it in the label. Leave it out when unclear. |
| `sync` | `async` for fire-and-forget calls: anything into or out of a queue, stream or broker, webhooks, emails and other notifications. Leave it out for request and response calls. |
| `tone` | The wire colour (section 6). |
| `flow` | `both` for a two-way line with no arrowheads, such as replication or a sync link. Leave it out for a one-way arrow. |
| `route` | How the wire is drawn: `auto` (default), `straight`, `bezier`, `arc`, `orthogonal`, `step`, `under`, `over` or `fanout`. See below. |
| `sourcePort`, `targetPort` | `auto` (default), `top`, `right`, `bottom` or `left`. Leave them out unless a wire must leave or enter by a set side. |
| `latencyMs` | Typical latency in milliseconds, only when the source gives one. |
| `animated: false` | For a wire that is rarely used, such as a manual backfill or a redrive. |
| `comment` | A note about the wire. |
| `tags` | Short labels, as on components. |

**Direction.** Draw the arrow the way the request or data goes. When the source has an arrow for the request and another for the reply, keep one wire for the call. A reply is shown by a scenario step, not by a second wire. When the source shows two separate flows in both directions, such as a callback or webhook, keep both wires.

**Arrows to or from a group.** A wire joins two components, never a swimlane or a frame. When the source draws an arrow from or to a whole group, connect it to the component in that group where the flow enters (for an arrow into the group) or leaves (for an arrow out of it), and add a `comment` saying the source drew it from the group. Skip it if that wire already exists.

**Routes.** Leave `route` out in most cases. Use:

- `orthogonal` for neat right-angled wires in grid-like diagrams.
- `under` or `over` for a wire that runs backwards (right to left in an `LR` diagram), so it loops below or above instead of crossing the boxes between.
- `fanout` when one component sends to several targets stacked below each other.
- `arc` or `bezier` for a wire that should curve around a box in the way.

## 6. Colours (tones)

There are five tones, shared by components, wires, frames and scenario steps. Use them for meaning, not decoration.

| Tone | Default name | Use for |
| --- | --- | --- |
| `blue` | Primary | The main request path |
| `emerald` | Success | Responses, confirmations, data stores and caches |
| `rose` | Exception | Errors, retries, dead letters, fallbacks, risky or deprecated paths |
| `violet` | Control | Auth, policy, gateways, configuration, admin and control traffic |
| `amber` | Async | Events, queues, streams, background and scheduled work |

If the source has a colour key, keep its grouping and write it as a `legend`, for example `legend: [{ tone: violet, label: "Payments" }, { tone: amber, label: "Analytics" }]`. Map the source's colours to the nearest tone: greens to `emerald`, reds and pinks to `rose`, purples to `violet`, yellows and oranges to `amber`, blues, greys and black to `blue`.

## 7. Layout

Place components on a grid that keeps the source's arrangement: what is left of something in the source stays left of it, and what is above stays above.

### 7.1 The grid

1. Sort the components into **columns** by their horizontal position in the source, counting from 0 on the left. Components roughly in line vertically share a column.
2. Sort them into **rows** by vertical position, counting from 0 at the top.
3. Give each component one cell. If two would share a cell, put one in the next free row.
4. Compute the top-left corner:

```
x = 100 + 400 × column
y = 160 + 240 × row
position: [x, y]
```

| Column | 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| x | 100 | 500 | 900 | 1300 | 1700 | 2100 | 2500 | 2900 | 3300 | 3700 |

| Row | 0 | 1 | 2 | 3 | 4 | 5 | 6 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| y | 160 | 400 | 640 | 880 | 1120 | 1360 | 1600 |

For an `LR` diagram the flow runs along the columns. For a `TD` diagram the flow runs down the rows; use the same formulas.

Try to keep each wire short. Avoid putting a component in the cell a wire would pass through; move it up or down a row instead.

If the source has no layout at all (a list, a written description, Mermaid without positions) and no groups, you may leave `position` out of every component. The studio then lays the diagram out itself. Do not mix the two: either every component has a position, or none does.

### 7.2 Swimlanes (`zones`)

A swimlane is a full-height column band with a numbered title, such as "01 Edge" or "02 Services". Use swimlanes for groups that sit **side by side** across the flow: tiers, layers, VPCs or trust zones laid out left to right.

A swimlane covers whole grid columns. For a swimlane from column `A` to column `B`:

```
x = 60 + 400 × A
width = 400 × (B − A + 1) − 40
```

```yaml
zones:
  - { id: zone-edge, number: "01", title: "Edge", subtitle: "CDN, WAF and gateway", x: 60, width: 760 }    # columns 0–1
  - { id: zone-services, number: "02", title: "Services", subtitle: "Stateless APIs", x: 860, width: 360 }  # column 2
```

- A component belongs to the swimlane its centre falls inside, so put each group's components in that group's columns.
- Swimlanes must not overlap. Number them `"01"`, `"02"` and so on, as quoted strings, left to right.
- Components outside every group can sit in columns no swimlane covers.

### 7.3 Frames (`frames`)

A frame is a titled box around some components. It can sit anywhere and inside another frame. Use frames for groups that are **stacked**, nested or that cover only part of a column: a VPC inside a region, a "PCI scope" boundary, a Kubernetes namespace, a team's area.

For a frame around columns `A` to `B` and rows `R1` to `R2`:

```
x = 76 + 400 × A
y = 112 + 240 × R1
width = 400 × (B − A) + 290
height = 240 × (R2 − R1) + 240
```

```yaml
frames:
  - { id: frame-pci, title: "PCI scope", tone: rose, x: 1276, y: 352, width: 690, height: 480 }   # columns 3–4, rows 1–2
nodes:
  payments:
    kind: service
    frame: frame-pci
    position: [1300, 400]
```

- Every component inside a frame gets `frame: <frame id>`.
- A frame inside another frame gets `parentId: <outer frame id>`, and the outer frame must be larger on every side. Grow the outer one by 24 on each side and 36 at the top for each level of nesting.
- `tone` colours the frame (section 6).

You can use swimlanes and frames together: swimlanes for the left-to-right tiers, frames for boundaries inside them.

### 7.4 Notes and text

Turn sticky notes, legends, callouts and side text into notes cards. Place them below the diagram, at `x: 100` and `y = 160 + 240 × (last row + 1)`, one column apart if there are several.

```yaml
notesCards:
  - id: notes-open-questions
    title: "Open questions"
    code: "NOTES-01"
    position: [100, 1120]
    items:
      - { title: "Retention", text: "How long do we keep scan events?", icon: question }
      - { title: "SMS cost", text: "Cap texts per parcel.", icon: warning }
  - { id: text-region, variant: text, title: "eu-west-1", position: [100, 100] }
```

- An item `icon` is one of `check`, `bullet`, `cross`, `exclamation`, `warning`, `info`, `question`, `star`, `arrow`, `dash` or `none`.
- A card with `variant: text` is a plain text label with no box; its words go in `title`. Use it for a caption such as a region name.
- A card that is not `variant: text` needs at least one item.

## 8. Levels and pages

**Levels** let a component open into its own diagram. Use a level when the source shows the inside of one component separately: an inset, a zoomed detail or a second view of "inside the Orders service". Do not make a level only because a box sits in a group; use a swimlane or frame for that. A level is written under `children:` with its own `nodes`, `edges` and optional `zones`, `frames` and `notesCards`. Its positions use the same grid but are counted from its own top-left, so its first column is again `x: 100`. Wires never cross a level's boundary.

```yaml
  orders-api:
    kind: service
    title: "Orders API"
    position: [1300, 400]
    children:
      nodes:
        handler: { kind: service, title: "HTTP handler", subtitle: "Validates input", position: [100, 160] }
        domain: { kind: core, title: "Order domain", subtitle: "Pricing and stock rules", position: [500, 160] }
      edges:
        - { id: e-handler-domain, from: handler, to: domain, label: "Place order" }
```

**Pages** are separate diagrams in one file, shown as tabs. Use them when the source has several diagrams: draw.io tabs, several slides or several figures. The top-level fields are page 1. Name it with `pageTitle`. Each further page is an entry in `pages:` with `id`, `title`, and its own `nodes`, `edges`, `zones`, `frames` and `notesCards`. Wires never join components on different pages. Ids stay unique across all pages.

```yaml
pageTitle: "Overview"
pages:
  - id: page-dr
    title: "Disaster recovery"
    nodes:
      primary-db: { kind: store, title: "Primary DB", position: [100, 160] }
      replica-db: { kind: store, title: "Replica DB", position: [500, 160] }
    edges:
      - { id: e-replicate, from: primary-db, to: replica-db, label: "Streaming replication", protocol: sql, sync: async }
```

## 9. Scenarios (`simulations`)

A scenario is a story that the Traffic lens plays as a packet moving across the diagram. Write one to three scenarios for the most important flows in the source: the main user request first, then an async or background flow, then an error path if the source shows one. Write none if the diagram has no flow, for example a deployment view with no arrows.

```yaml
simulations:
  - id: sim-place-order
    name: "Place an order"
    tone: blue
    steps:
      - { id: s1, nodes: [shopper, web], tone: blue, label: "CHECKOUT", trace: "The shopper presses Pay in the web app." }
      - { id: s2, nodes: [web, orders-api], tone: blue, label: "POST /orders", trace: "The web app sends the basket to the Orders API." }
      - { id: s3, nodes: [orders-api, orders-db], tone: emerald, label: "WRITE", trace: "The order is saved." }
      - { id: s4, nodes: [orders-api, web, shopper], tone: emerald, label: "201 CREATED", trace: "The confirmation goes back to the shopper." }
```

- A **step** moves the packet along one wire, or along a chain of wires. `nodes` lists component ids in the order the packet visits them, usually two per step. **Every two neighbouring ids in `nodes` must be joined by a wire**, in either direction. A reply goes back along the same wires, so `[orders-api, web, shopper]` is fine when wires `shopper → web` and `web → orders-api` exist.
- `label` is a short uppercase caption shown on the packet: `"POST /orders"`, `"CACHE LOOKUP"`, `"ORDERPLACED"`.
- `trace` is one plain sentence on what happens in the step.
- `tone` per step follows section 6: blue for requests, emerald for replies and writes, amber for async hops, rose for errors and retries, violet for auth and policy checks.
- Keep the first scenario short, at most eight steps. It is the one people see first.
- A scenario starts at an entry point: an `actor`, `client` or `scheduler`.
- `failures: [component-id]` makes the scenario run with those components failed. Use it for a failure story the source describes, such as "if the primary database is down, reads go to the replica".
- `budgetMs: 300` sets a latency budget. Use it only when the source gives a target and the wires have `latencyMs`.

## 10. What you may infer, and what you must not

**Infer freely**, from names, icons, shapes and context:

- `kind`, `icon`, `accent`, `shape`
- `subtitle`, `eyebrow`, `chip`, `footerLeft`, `interfaceLabel`, `summary`
- wire `label`, `protocol` and `sync: async`
- scenarios that follow wires drawn in the source
- `external: true` for well-known third-party services

**Take only from the source**, and never guess:

- `status`:
  - `planned` when the source says "planned", "future", "phase 2" or "TBD", or draws the box dashed with a note saying it is new;
  - `deprecated` for "legacy", "to be retired" or a crossed-out box;
  - `at-risk` for a warning mark;
  - `live` only when the source says it.
- `resilience.replicas`: from "×3", "3 nodes", "cluster of 5", "Auto Scaling group (min 2)" or "multi-AZ" (use 2 when no number is given). `fallbackId` from "fails over to" or "fallback". `circuitBreaker: true` from "circuit breaker".
- `latencyMs`, `budgetMs`, `cache.hitRate`, `queue.maxDepth`, `limiter` numbers, `schedule.every`, and every number in `metrics`.
- `owner`, `links`, `tags`.

**Never** add a component, wire, swimlane or frame that the source does not show. Never drop one either. When the source shows only a few boxes, the file has only a few components.

**When you cannot read something** (blurred text, a crossed arrow, an unclear arrow direction): make your best reading, add `comment: "Unclear in the source: ..."` to that component or wire, and list it in one short line after the code block. That line is the only text allowed outside the block.

## 11. Reading each kind of source

**An image, screenshot or whiteboard photo.** List every shape and its text first, then every arrow with its two ends, then the groups. Read arrowheads for direction; a line with no arrowheads is `flow: both`. Dashed lines usually mean async (`sync: async`) or planned; decide from the legend or labels. Then build the grid from where the shapes sit.

**draw.io (`.drawio` or its XML).**

- Each `mxCell` with `vertex="1"` is a component; its `value` is the title (strip HTML tags, and a `<br>` starts the subtitle).
- Each `mxCell` with `edge="1"` is a wire from `source` to `target`; its `value`, or a child cell with `edge` as its parent, is the label.
- A cell whose style has `swimlane`, `group` or `container=1` is a group. Its child cells (by `parent`) are its members.
- Style hints:
  - `shape=cylinder` or `datastore` is a store.
  - `shape=umlActor` is an actor.
  - `rhombus` is a gate with `shape: diamond`.
  - `hexagon` is `shape: hexagon`.
  - `ellipse` is `shape: circle`.
  - `dashed=1` on an edge usually means async.
  - `mxgraph.aws4.<name>`, `mxgraph.azure.<name>` and `mxgraph.gcp2.<name>` name the product; use the cloud table in section 4.1.
- Take columns and rows from each cell's `mxGeometry` `x` and `y`. Each `<diagram>` element is a page.

**Mermaid.**

- Shape brackets hint at the kind:
  - `([text])` actor
  - `[(text)]` store, or a queue when the name says so
  - `[[text]]` core
  - `{{text}}` gate
  - `{text}` gate with `shape: diamond`
  - `[/text/]` client
  - `[/text\]` balancer
  - `(text)` bus or service, by name
  - `>text]` `shape: asymmetric`
- `A -->|label| B` is a wire with a label. `-.->` is often async; `==>` is a main path; `<-->` is `flow: both`.
- `subgraph` blocks are groups. They become swimlanes if they sit side by side in the flow, or frames otherwise.
- A Mermaid diagram has no positions. Build the grid from the flow: column = the number of hops from the first component, rows in the order components appear.

**PlantUML, C4 and Structurizr.**

- `Person` is an actor.
- `System_Ext`, `Container_Ext` and `*_Ext` are a `service` with `external: true`, or a `client` when it calls in.
- `ContainerDb` is a store and `ContainerQueue` is a queue.
- `System_Boundary` and `Container_Boundary` are frames.
- `Rel(a, b, "label", "tech")` is a wire with that label; the technology sets `protocol` when it matches one.

**Excalidraw, Lucidchart, PowerPoint or Visio exports, and plain text.** Treat them like an image: shapes, arrows, groups, then the grid.

## 12. Checklist before you answer

- [ ] The reply is one fenced `markdown` block. The file starts and ends with a `---` line, and has nothing outside the front matter.
- [ ] Every free-text value is in double quotes. Indentation is two spaces.
- [ ] Every box in the source is one component, and every arrow is one wire. You added none and dropped none.
- [ ] Every id is lowercase with hyphens, unique, and every reference (`from`, `to`, step `nodes`, `frame`, `fallbackId`, `deadLetterId`, `backingId`, `failures`) matches an id.
- [ ] Every `kind`, `icon`, `shape`, `tone`, `route` and `protocol` is spelled exactly as listed here.
- [ ] Third-party APIs are `service` with `external: true`, not `client`.
- [ ] Every component has a position from the grid, or none does. Swimlanes do not overlap, and each component sits in its group's columns.
- [ ] Every component inside a frame has `frame:` set, and every frame encloses its components.
- [ ] Every queue has a wire out of it, and every cache has a wire to its store.
- [ ] Every wire between two services has a label.
- [ ] In every scenario step, each two neighbouring ids are joined by a wire. The first scenario starts at an actor, client or scheduler, and has at most eight steps.
- [ ] No number appears that the source does not show.

## 13. Complete example

**Source** (a whiteboard photo, described):

> Left: a "Customer" stick figure → "Web tracker (React)". Below: a "Courier" stick figure → "Courier app (Android)".
> Both apps → "API Gateway (Kong)" → "Tracking API ×3". Tracking API → "Redis" (cache) → "Postgres", and Tracking API → Postgres ("write scan").
> Tracking API → dashed arrow → "Kafka: scan-events" → "Notifier" → "Twilio SMS" (note beside it: "circuit breaker").
> Bottom: a clock "Nightly 02:00" → "Report job" → "S3 reports"; Report job also reads Postgres.
> Boxes drawn in groups labelled People, Apps, Edge, Services, Data, Third parties, left to right.
> Sticky note: "Open question: how long do we keep scan events?"

**Output:**

```markdown
---
title: "Parcel Tracking"
systemTag: "LOGISTICS // V1"
statusLabel: "DRAFT"
direction: LR
overviewSummary: "Customers and couriers reach the tracking API through one gateway. Courier scans are written to Postgres and published as events, and a notifier texts the customer through Twilio. A nightly job writes reports to S3."
zones:
  - { id: zone-people, number: "01", title: "People", subtitle: "Who uses it", x: 60, width: 360 }
  - { id: zone-apps, number: "02", title: "Apps", subtitle: "Web and mobile", x: 460, width: 360 }
  - { id: zone-edge, number: "03", title: "Edge", subtitle: "One way in", x: 860, width: 360 }
  - { id: zone-services, number: "04", title: "Services", subtitle: "APIs, events and jobs", x: 1260, width: 1160 }
  - { id: zone-data, number: "05", title: "Data", subtitle: "Cache, database, files", x: 2460, width: 360 }
  - { id: zone-partners, number: "06", title: "Third parties", subtitle: "Run by others", x: 2860, width: 360 }
nodes:
  customer:
    kind: actor
    title: "Customer"
    subtitle: "Waits for a parcel"
    eyebrow: "PERSON"
    chip: "PUBLIC"
    footerLeft: "Any browser"
    interfaceLabel: "Web"
    summary: "Checks where a parcel is and gets a text when it moves."
    position: [100, 160]
  courier:
    kind: actor
    title: "Courier"
    subtitle: "Scans parcels on the road"
    eyebrow: "PERSON"
    chip: "STAFF"
    footerLeft: "Company phone"
    interfaceLabel: "Android app"
    summary: "Scans each parcel at pickup and delivery."
    position: [100, 640]
  web:
    kind: client
    title: "Web tracker"
    subtitle: "React"
    eyebrow: "APP"
    chip: "SPA"
    footerLeft: "Static hosting"
    interfaceLabel: "HTTPS"
    icon: monitor
    summary: "Shows a parcel's latest status and history."
    position: [500, 160]
  courier-app:
    kind: client
    title: "Courier app"
    subtitle: "Android"
    eyebrow: "APP"
    chip: "MOBILE"
    footerLeft: "Play Store"
    interfaceLabel: "HTTPS"
    icon: agency
    summary: "Sends a scan for each pickup and delivery."
    position: [500, 640]
  gateway:
    kind: gate
    title: "API Gateway"
    subtitle: "Kong"
    eyebrow: "EDGE"
    chip: "GATEWAY"
    footerLeft: "TLS, auth, routing"
    interfaceLabel: "HTTPS"
    icon: shield
    summary: "The single way in for both apps: checks tokens and routes calls to the Tracking API."
    position: [900, 400]
  tracking:
    kind: service
    title: "Tracking API"
    subtitle: "Parcel status and scans"
    eyebrow: "SERVICE"
    chip: "API"
    footerLeft: "3 instances"
    interfaceLabel: "REST / JSON"
    icon: code
    summary: "Answers status lookups and records scans, then publishes each scan as an event."
    resilience: { replicas: 3 }
    position: [1300, 400]
  scan-events:
    kind: queue
    title: "scan-events"
    subtitle: "Kafka topic"
    eyebrow: "STREAM"
    chip: "KAFKA"
    footerLeft: "Replayable"
    interfaceLabel: "Kafka topic"
    icon: stream
    accent: amber
    summary: "Every scan as an event, for any service that needs it."
    queue: { delivery: fanout }
    comment: "Open question in the source: how long are scan events kept?"
    position: [1700, 640]
  nightly:
    kind: scheduler
    title: "Nightly 02:00"
    subtitle: "Report trigger"
    eyebrow: "SCHEDULE"
    chip: "CRON"
    footerLeft: "Once a day"
    interfaceLabel: "Timer"
    summary: "Starts the report job every night at 02:00."
    schedule: { every: "0 2 * * *" }
    position: [1700, 880]
  notifier:
    kind: service
    title: "Notifier"
    subtitle: "Texts customers on each scan"
    eyebrow: "SERVICE"
    chip: "WORKER"
    footerLeft: "Kafka consumer"
    interfaceLabel: "Kafka / HTTPS"
    icon: cpu
    summary: "Reads scan events and sends the customer an SMS."
    resilience: { circuitBreaker: true }
    position: [2100, 640]
  report-job:
    kind: service
    title: "Report job"
    subtitle: "Daily delivery report"
    eyebrow: "JOB"
    chip: "BATCH"
    footerLeft: "Runs nightly"
    interfaceLabel: "SQL / S3"
    icon: cpu
    summary: "Reads the day's scans and writes a report file."
    position: [2100, 880]
  redis:
    kind: cache
    title: "Redis"
    subtitle: "Status cache"
    eyebrow: "DATA"
    chip: "CACHE"
    footerLeft: "In-memory"
    interfaceLabel: "GET / SET"
    summary: "Keeps recent parcel status so lookups skip the database."
    cache: { backingId: postgres }
    position: [2500, 160]
  postgres:
    kind: store
    title: "Postgres"
    subtitle: "Parcels and scans"
    eyebrow: "DATA"
    chip: "SQL"
    footerLeft: "System of record"
    interfaceLabel: "SQL"
    summary: "Stores every parcel and every scan."
    position: [2500, 400]
  s3-reports:
    kind: store
    shape: bucket
    icon: bucket
    title: "S3 reports"
    subtitle: "Daily report files"
    eyebrow: "DATA"
    chip: "S3"
    footerLeft: "Object storage"
    interfaceLabel: "S3 API"
    summary: "Holds one report file per day."
    position: [2500, 880]
  twilio:
    kind: service
    external: true
    shape: pill
    icon: cloud
    title: "Twilio SMS"
    subtitle: "Text messages"
    eyebrow: "PARTNER"
    chip: "SaaS"
    footerLeft: "Third party"
    interfaceLabel: "HTTPS"
    accent: violet
    summary: "Delivers the text message to the customer's phone."
    position: [2900, 640]
edges:
  - { id: e-track, from: customer, to: web, label: "Track parcel", tone: blue }
  - { id: e-scan, from: courier, to: courier-app, label: "Scan parcel", tone: blue }
  - { id: e-web-api, from: web, to: gateway, label: "GET /parcels/{id}", protocol: http, tone: blue }
  - { id: e-app-api, from: courier-app, to: gateway, label: "POST /scans", protocol: http, tone: blue }
  - { id: e-route, from: gateway, to: tracking, label: "Route call", protocol: http, tone: violet }
  - { id: e-cache, from: tracking, to: redis, label: "Read status", tone: emerald }
  - { id: e-miss, from: redis, to: postgres, label: "Read-through on miss", protocol: sql, tone: emerald }
  - { id: e-write, from: tracking, to: postgres, label: "Write scan", protocol: sql, tone: emerald }
  - { id: e-publish, from: tracking, to: scan-events, label: "ScanRecorded", protocol: kafka, sync: async, tone: amber }
  - { id: e-consume, from: scan-events, to: notifier, label: "Consume scans", protocol: kafka, sync: async, tone: amber }
  - { id: e-sms, from: notifier, to: twilio, label: "Send SMS", protocol: http, tone: violet }
  - { id: e-nightly, from: nightly, to: report-job, label: "Start report", sync: async, tone: amber }
  - { id: e-read-day, from: report-job, to: postgres, label: "Read the day's scans", protocol: sql, tone: emerald }
  - { id: e-upload, from: report-job, to: s3-reports, label: "Upload report", tone: emerald }
notesCards:
  - id: notes-questions
    title: "Open questions"
    code: "NOTES-01"
    position: [100, 1120]
    items:
      - { title: "Retention", text: "How long do we keep scan events?", icon: question }
simulations:
  - id: sim-track
    name: "Customer checks a parcel"
    tone: blue
    steps:
      - { id: t1, nodes: [customer, web], tone: blue, label: "TRACK", trace: "The customer opens the tracking page." }
      - { id: t2, nodes: [web, gateway], tone: blue, label: "GET /PARCELS/{ID}", trace: "The web tracker asks for the parcel's status." }
      - { id: t3, nodes: [gateway, tracking], tone: violet, label: "ROUTE", trace: "The gateway checks the call and routes it to the Tracking API." }
      - { id: t4, nodes: [tracking, redis], tone: emerald, label: "CACHE LOOKUP", trace: "The Tracking API reads the status from Redis." }
      - { id: t5, nodes: [redis, postgres], tone: emerald, label: "MISS → POSTGRES", trace: "On a miss Redis reads the status from Postgres and keeps it." }
      - { id: t6, nodes: [tracking, gateway, web, customer], tone: emerald, label: "200 OK", trace: "The status goes back to the customer's screen." }
  - id: sim-scan
    name: "Courier scan sends an SMS"
    tone: amber
    steps:
      - { id: s1, nodes: [courier, courier-app], tone: blue, label: "SCAN", trace: "The courier scans the parcel at the door." }
      - { id: s2, nodes: [courier-app, gateway, tracking], tone: blue, label: "POST /SCANS", trace: "The app sends the scan through the gateway." }
      - { id: s3, nodes: [tracking, postgres], tone: emerald, label: "WRITE SCAN", trace: "The scan is saved." }
      - { id: s4, nodes: [tracking, scan-events], tone: amber, label: "SCANRECORDED", trace: "The scan is published to Kafka." }
      - { id: s5, nodes: [scan-events, notifier], tone: amber, label: "CONSUME", trace: "The notifier picks up the event." }
      - { id: s6, nodes: [notifier, twilio], tone: violet, label: "SEND SMS", trace: "Twilio texts the customer that the parcel has arrived." }
---
```
