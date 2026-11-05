import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { WIRE_PROTOCOLS } from '../src/core/wire.ts';
import { NODE_SHAPES } from '../src/core/nodeStyle.ts';
import { BALANCER_STRATEGIES } from '../src/core/balancers.ts';
import { QUEUE_DELIVERIES, QUEUE_ORDERINGS } from '../src/core/queues.ts';
import { LINK_KINDS } from '../src/core/meta.ts';
import { importMermaidOrBlueprint } from '../src/core/parser.ts';
import { ICON_LIST } from '../src/ui/icons.ts';
import { STENCIL_CATALOG } from '../src/templates/presets.ts';
import { NOTES_ITEM_ICONS } from '../src/types.ts';

// docs/llm-rules.md is handed to other language models, which can only follow what it says. These tests keep its
// lists in step with the app and make sure its own examples import cleanly.

const RULES = readFileSync(new URL('../docs/llm-rules.md', import.meta.url), 'utf8');

/** Every ```markdown block in the rules that holds a whole Blueprint file. */
const FILES = [...RULES.matchAll(/```markdown\n([\s\S]*?)\n```/g)].map((m) => m[1]).filter((t) => t.startsWith('---\n'));
const EXAMPLE = FILES[FILES.length - 1];

const KINDS = ['actor', 'core', 'service', 'bus', 'gate', 'store', 'client', 'queue', 'balancer', 'cache', 'limiter', 'scheduler'];
const TONES = ['blue', 'emerald', 'rose', 'violet', 'amber'];
const ROUTES = ['auto', 'straight', 'bezier', 'arc', 'orthogonal', 'step', 'under', 'over', 'fanout'];

/** True when the rules mention the value as code, `like-this`. */
const mentions = (value: string) => RULES.includes('`' + value + '`');

describe('LLM rules', () => {
  it('name every value the file format accepts', () => {
    assert.deepEqual([...new Set(STENCIL_CATALOG.map((s) => s.kind))].sort(), [...KINDS].sort(), 'a new kind needs a row in section 4.1');
    const lists: Record<string, readonly string[]> = {
      kind: KINDS,
      shape: NODE_SHAPES.filter((s) => s !== 'card'),
      icon: ICON_LIST.map((i) => i.id),
      tone: TONES,
      route: ROUTES,
      protocol: WIRE_PROTOCOLS,
      'balancer strategy': BALANCER_STRATEGIES,
      'queue ordering': QUEUE_ORDERINGS,
      'queue delivery': QUEUE_DELIVERIES,
      'link kind': LINK_KINDS,
      'notes icon': NOTES_ITEM_ICONS.map((i) => i.value),
      status: ['planned', 'live', 'deprecated', 'at-risk'],
    };
    for (const [what, values] of Object.entries(lists)) {
      for (const value of values) assert.ok(mentions(value), `the rules do not mention the ${what} \`${value}\``);
    }
  });

  it('has a skeleton and a complete example, and both import without a warning', () => {
    assert.ok(FILES.length >= 2);
    for (const file of FILES) {
      const { issues, doc } = importMermaidOrBlueprint(file);
      assert.deepEqual(issues.filter((i) => i.level !== 'info'), [], file.slice(0, 80));
      assert.ok(doc.nodes.length >= 2);
    }
  });

  it('places the example on the grid it teaches', () => {
    const { doc } = importMermaidOrBlueprint(EXAMPLE);
    for (const node of doc.nodes) {
      assert.equal((node.x - 100) % 400, 0, `${node.id} x is on a column`);
      assert.equal((node.y - 160) % 240, 0, `${node.id} y is on a row`);
      assert.match(node.id, /^[a-z][a-z0-9-]*$/);
      const centre = node.x + node.width / 2;
      const zones = doc.zones.filter((z) => centre >= z.x && centre <= z.x + z.width);
      assert.equal(zones.length, 1, `${node.id} sits in exactly one swimlane`);
    }
    for (const zone of doc.zones) {
      assert.equal((zone.x - 60) % 400, 0, `${zone.id} starts on a column`);
      assert.equal((zone.width + 40) % 400, 0, `${zone.id} covers whole columns`);
    }
  });

  it('follows its own checklist in the example', () => {
    const { doc } = importMermaidOrBlueprint(EXAMPLE);
    const wired = (a: string, b: string) => doc.edges.some((e) => (e.from === a && e.to === b) || (e.from === b && e.to === a));
    assert.ok(doc.simulations.length > 0);
    for (const sim of doc.simulations) {
      assert.ok(['actor', 'client', 'scheduler'].includes(doc.nodes.find((n) => n.id === sim.steps[0].nodes[0])!.kind));
      for (const step of sim.steps) {
        for (let i = 0; i + 1 < step.nodes.length; i++) assert.ok(wired(step.nodes[i], step.nodes[i + 1]), `${sim.id} ${step.id}`);
      }
    }
    assert.ok(doc.simulations[0].steps.length <= 8);
    assert.ok(doc.edges.every((e) => e.label), 'every wire is labelled');
    for (const node of doc.nodes) {
      assert.notEqual(node.subtitle, STENCIL_CATALOG.find((s) => s.kind === node.kind)?.defaultSubtitle, `${node.id} has its own subtitle`);
    }
    const external = doc.nodes.filter((n) => n.external);
    assert.ok(external.length > 0 && external.every((n) => n.kind === 'service'), 'third-party APIs are external services');
    const queue = doc.nodes.find((n) => n.kind === 'queue')!;
    assert.ok(doc.edges.some((e) => e.from === queue.id), 'the queue has a reader');
  });

  it('a chat reply with the file in a markdown fence imports like the bare file', () => {
    const bare = importMermaidOrBlueprint(EXAMPLE);
    for (const reply of [
      '```markdown\n' + EXAMPLE + '\n```',
      'Here is the file:\n\n```markdown\n' + EXAMPLE + '\n```\n\nUnclear in the source: nothing.\n',
      '````md\n' + EXAMPLE + '\n````\n',
    ]) {
      const fenced = importMermaidOrBlueprint(reply);
      assert.deepEqual(fenced.issues, bare.issues);
      assert.deepEqual(fenced.doc.nodes.map((n) => [n.id, n.x, n.y]), bare.doc.nodes.map((n) => [n.id, n.x, n.y]));
      assert.equal(fenced.doc.edges.length, bare.doc.edges.length);
      assert.equal(fenced.doc.simulations.length, bare.doc.simulations.length);
    }
  });

  it('leaves a Mermaid flowchart inside a markdown fence alone', () => {
    const { doc } = importMermaidOrBlueprint('```markdown\nflowchart LR\n  a --> b\n```');
    assert.equal(doc.nodes.length, 2);
  });
});
