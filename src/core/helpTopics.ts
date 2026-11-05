/**
 * Contextual help (R-10). Every `?` button, and every "Help: ..." palette command, reads from this one list.
 * Pure and DOM-free. Each `guideAnchor` is a heading slug in `docs/guide.md`; `tests/helpTopics.test.ts` checks
 * that the heading exists, so a renamed section cannot leave a dead link behind.
 * Words follow Appendix A of the plan: component, wire, swimlane, Traffic, Blueprint file.
 */
export interface HelpTopic {
  id: string;
  title: string;
  /** Two or three sentences, plain text. */
  body: string;
  /** Heading slug in `docs/guide.md`, without the `#`. */
  guideAnchor: string;
  /** Extra words the palette matches on. */
  keywords?: string[];
}

export const HELP_TOPICS: readonly HelpTopic[] = [
  {
    id: 'lenses',
    title: 'Lenses',
    body: 'A lens changes what the canvas emphasises, not what you can do. Design is for building, Traffic for running scenarios, Review for insights, and Present for showing the diagram. Keys 1 to 4 switch between them.',
    guideAnchor: 'lenses',
    keywords: ['design', 'traffic', 'review', 'present', 'mode', 'view'],
  },
  {
    id: 'components',
    title: 'Component fields',
    body: 'A component has a title, a kind, an icon and a colour. The extra fields (label above title, badge, footer, interface) only add text to the card, so fill in what helps and leave the rest empty.',
    guideAnchor: 'component-fields',
    keywords: ['inspector', 'properties', 'basics', 'appearance', 'node', 'kind', 'icon', 'badge'],
  },
  {
    id: 'traffic',
    title: 'Traffic and scenarios',
    body: 'A scenario is an ordered list of steps, each sending a packet along one wire. Pick one in the run bar and press Play to watch it travel, drag the scrubber to move through it, and set a latency budget to have Review flag a slow path.',
    guideAnchor: 'traffic-and-scenarios',
    keywords: ['run', 'play', 'packet', 'simulation', 'latency', 'budget', 'metrics', 'contract'],
  },
  {
    id: 'failing',
    title: 'Failing components',
    body: 'Fail a component to see what stops working: everything that can no longer be reached from an entry point fades out. Replicas and a fallback component soften the failure, and Restore all brings everything back.',
    guideAnchor: 'failing-components',
    keywords: ['chaos', 'failure', 'outage', 'resilience', 'replicas', 'fallback', 'ripple'],
  },
  {
    id: 'queues',
    title: 'Queues',
    body: 'A Message Queue holds work while the components that read from it are down, so the components that write to it carry on. Fail a reader, play a looping scenario and watch the pipe fill; restore the reader and it drains. Set a maximum depth and a dead-letter queue for what does not fit.',
    guideAnchor: 'queues',
    keywords: ['queue', 'backlog', 'buffer', 'dead letter', 'dlq', 'sqs', 'rabbitmq'],
  },
  {
    id: 'load-balancers',
    title: 'Load balancers',
    body: 'A Load Balancer spreads traffic over the components it points to. Fail one of them and the others take the load: the balancer is not at risk while at least one target is up, and a looping scenario sends the packet to a live target instead. Only what sits behind the failed target alone is lost.',
    guideAnchor: 'load-balancers',
    keywords: ['load balancer', 'balancer', 'lb', 'haproxy', 'round robin', 'targets'],
  },
  {
    id: 'cache-limiter-scheduler',
    title: 'Caches, rate limiters and schedulers',
    body: 'A Cache answers a share of reads itself (its hit rate) and sends the rest to the store behind it; if it fails, reads go straight to that store and its callers are slowed. A Rate Limiter admits some of every few requests and turns the rest away with a 429; set it to fail open and traffic passes through when it is down. A Scheduler starts work on a timer and counts as an entry point, so failing it cuts off its jobs.',
    guideAnchor: 'caches-limiters-and-schedulers',
    keywords: ['cache', 'hit rate', 'redis', 'rate limit', 'limiter', '429', 'scheduler', 'cron', 'timer'],
  },
  {
    id: 'review',
    title: 'Review and insights',
    body: 'The Review lens runs a few rules over the diagram and lists what they find, grouped by rule. Click an issue to select the component or wire it is about, and mute a rule you do not want to see. Muting is saved with the diagram.',
    guideAnchor: 'review-and-insights',
    keywords: ['insights', 'lint', 'warnings', 'rules', 'spof', 'cycle', 'mute', 'orphan'],
  },
  {
    id: 'levels',
    title: 'Levels',
    body: 'A component can open into a diagram of its own, called a level. Use the level badge on a component to go in, and the breadcrumb or Ctrl/Cmd+Up to come back out. Failing a component fails everything inside it, but not the other way round.',
    guideAnchor: 'levels',
    keywords: ['child', 'nested', 'drill', 'breadcrumb', 'zoom in'],
  },
  {
    id: 'legend',
    title: 'Legend and tags',
    body: 'The legend gives each wire colour a meaning your team recognises, and it replaces the default names in pickers, filters and the exported page. Tags are free labels on a component or wire. Use them to filter the canvas or to colour components by tag.',
    guideAnchor: 'legend-and-tags',
    keywords: ['colour', 'color', 'tone', 'filter', 'label'],
  },
  {
    id: 'links-owner',
    title: 'Links and owner',
    body: 'Record who owns a component and where to find more about it: a repository, runbook, dashboard, docs page or on-call rota. Links open in a new tab, and only http, https and mailto links are kept.',
    guideAnchor: 'links-and-owner',
    keywords: ['owner', 'team', 'repo', 'runbook', 'dashboard', 'oncall', 'url', 'status'],
  },
  {
    id: 'wire-fields',
    title: 'Wire fields',
    body: 'A wire can carry a label, a protocol, a call style (synchronous or async) and a typical latency in milliseconds. Latency adds up along a scenario, and a synchronous cycle shows up in Review.',
    guideAnchor: 'wire-fields',
    keywords: ['edge', 'protocol', 'latency', 'sync', 'async', 'connection', 'port'],
  },
  {
    id: 'routing',
    title: 'Routing styles',
    body: 'Each wire has one routing mode, such as a smooth curve, a rounded elbow or a straight line. Smart Auto picks a sensible one for you. Drag the handle on a wire to bend it.',
    guideAnchor: 'wire-routing',
    keywords: ['route', 'elbow', 'curve', 'straight', 'waypoint', 'bend', 'orthogonal', 'bezier'],
  },
  {
    id: 'outline',
    title: 'Text outline',
    body: 'The outline lists swimlanes, components, their outgoing wires and the levels they open into, as a tree you can walk with the arrow keys. Enter selects a row and pans to it, and Enter on a level row opens that level.',
    guideAnchor: 'text-outline',
    keywords: ['accessible', 'screen reader', 'keyboard', 'tree', 'list', 'navigate'],
  },
  {
    id: 'mermaid',
    title: 'Importing Mermaid',
    body: 'ConduitCraft reads Mermaid flowcharts but never writes them. Open, drop or paste a .mmd file, and the import report lists anything that could not be kept. Saving then creates a Blueprint file, and the original .mmd is left alone.',
    guideAnchor: 'importing-mermaid',
    keywords: ['import', 'mmd', 'flowchart', 'paste', 'subgraph'],
  },
  {
    id: 'share-export',
    title: 'Share and export',
    body: 'Share copies a link that holds the whole diagram, so anyone with it can open your work (embedded logos and icons are left out). Export writes a Blueprint file, an animation, a single-page HTML file, an SVG or a PNG, and each image carries a text description for readers who cannot see it.',
    guideAnchor: 'share-and-export',
    keywords: ['share', 'link', 'export', 'png', 'svg', 'gif', 'html', 'json', 'alt text', 'save'],
  },
];

const BY_ID = new Map(HELP_TOPICS.map((topic) => [topic.id, topic]));

export function helpTopic(id: string): HelpTopic | undefined {
  return BY_ID.get(id);
}

/** The page on GitHub that the "Read more" link opens. */
export const GUIDE_URL = 'https://github.com/JosephSe/ConduitCraft/blob/main/docs/guide.md';

export function guideUrl(topic: Pick<HelpTopic, 'guideAnchor'>): string {
  return `${GUIDE_URL}#${topic.guideAnchor}`;
}

/** GitHub's heading slug: lower case, punctuation dropped, spaces to hyphens. */
export function slugify(heading: string): string {
  return heading
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, '')
    .replace(/\s/g, '-');
}
