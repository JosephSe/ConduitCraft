import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { entryPointIds, normalizeResilience, reachableFrom } from '../src/core/reachability.ts';
import { STARTER_TEMPLATES, loadTemplateRaw } from '../src/studio/templatesGallery.ts';
import { parseBlueprintJson, serializeBlueprintJson } from '../src/exporter/blueprintJson.ts';
import { importMermaidOrBlueprint, serializeToBlueprintMarkdown } from '../src/core/parser.ts';
import { createBlankDocument, createNodeFromStencil } from '../src/templates/presets.ts';
import type { DiagramDocument, DiagramEdge, NodeKind } from '../src/types.ts';

function build(kinds: Record<string, NodeKind>, wires: Array<[string, string, Partial<DiagramEdge>?]>): DiagramDocument {
  const doc = createBlankDocument();
  doc.nodes = Object.entries(kinds).map(([id, kind], i) => ({ ...createNodeFromStencil(kind, i * 100, 40, i), id }));
  doc.edges = wires.map(([from, to, extra], i) => ({
    id: `w${i}`,
    from,
    to,
    sourcePort: 'right',
    targetPort: 'left',
    tone: 'blue',
    route: 'straight',
    label: '',
    animated: false,
    ...extra,
  }));
  return doc;
}

describe('chaos reachability (F-01)', () => {
  it('treats actors and clients as entries, else components nothing points at', () => {
    const withActor = build({ a: 'actor', s: 'service' }, [['a', 's']]);
    assert.deepEqual(entryPointIds(withActor), ['a']);
    const none = build({ x: 'service', y: 'service' }, [['x', 'y']]);
    assert.deepEqual(entryPointIds(none), ['x']);
  });

  it('marks everything behind a single failure unreachable', () => {
    const doc = build({ u: 'actor', gw: 'gate', db: 'store', q: 'bus', w: 'service' }, [
      ['u', 'gw'],
      ['gw', 'db'],
      ['gw', 'q'],
      ['q', 'w'],
    ]);
    const r = reachableFrom(doc, ['u'], ['q']);
    assert.deepEqual(r.failed, ['q']);
    assert.deepEqual(r.unreachable, ['w']);
    assert.deepEqual(r.reachable, ['db', 'gw', 'u']);
    assert.deepEqual(r.rerouted, []);
  });

  it('keeps a component lit and marks it rerouted when another path survives', () => {
    const doc = build({ u: 'actor', a: 'service', b: 'service', db: 'store' }, [
      ['u', 'a'],
      ['u', 'b'],
      ['a', 'db'],
      ['b', 'db'],
    ]);
    const r = reachableFrom(doc, ['u'], ['a']);
    assert.deepEqual(r.unreachable, []);
    assert.deepEqual(r.rerouted, ['db']);
  });

  it('degrades instead of failing when there are replicas', () => {
    const doc = build({ u: 'actor', a: 'service', db: 'store' }, [
      ['u', 'a'],
      ['a', 'db'],
    ]);
    doc.nodes.find((n) => n.id === 'a')!.resilience = { replicas: 3 };
    const r = reachableFrom(doc, ['u'], ['a']);
    assert.deepEqual(r.degraded, ['a']);
    assert.deepEqual(r.failed, []);
    assert.deepEqual(r.unreachable, []);
    assert.deepEqual(r.rerouted, []);
  });

  it('hands traffic to a live fallback', () => {
    const doc = build({ u: 'actor', a: 'service', b: 'service', db: 'store' }, [
      ['u', 'a'],
      ['a', 'db'],
      ['b', 'db'],
    ]);
    doc.nodes.find((n) => n.id === 'a')!.resilience = { fallbackId: 'b' };
    const r = reachableFrom(doc, ['u'], ['a']);
    assert.deepEqual(r.unreachable, []);
    assert.deepEqual(r.reachable, ['b', 'db', 'u']);
    assert.ok(r.rerouted.includes('b'));
    assert.ok(r.rerouted.includes('db'));
    // A fallback that is itself down helps nobody.
    const both = reachableFrom(doc, ['u'], ['a', 'b']);
    assert.deepEqual(both.unreachable, ['db']);
  });

  it('follows two-way wires and survives cycles', () => {
    const doc = build({ u: 'actor', a: 'service', b: 'service' }, [
      ['u', 'a'],
      ['a', 'b', { flow: 'both' }],
      ['b', 'a'],
    ]);
    assert.deepEqual(reachableFrom(doc, ['u'], []).reachable, ['a', 'b', 'u']);
    assert.deepEqual(reachableFrom(doc, ['u'], ['a']).unreachable, ['b']);
  });

  it('does not blame a failure for components that were already cut off', () => {
    const doc = build({ u: 'actor', a: 'service', lonely: 'service' }, [['u', 'a']]);
    assert.deepEqual(reachableFrom(doc, ['u'], ['a']).unreachable, []);
  });

  it('ignores unknown ids and does not mutate the document', () => {
    const doc = build({ u: 'actor', a: 'service' }, [['u', 'a']]);
    const copy = structuredClone(doc);
    assert.deepEqual(reachableFrom(doc, ['u', 'ghost'], ['ghost']).failed, []);
    assert.deepEqual(doc, copy);
  });

  it('normalizes resilience from untrusted input', () => {
    assert.equal(normalizeResilience(null), undefined);
    assert.equal(normalizeResilience({ replicas: 1, circuitBreaker: false }), undefined);
    assert.deepEqual(normalizeResilience({ replicas: 2.9, fallbackId: ' b ', circuitBreaker: true, junk: 1 }), {
      replicas: 2,
      fallbackId: 'b',
      circuitBreaker: true,
    });
    assert.equal(normalizeResilience({ replicas: 1e9 })!.replicas, 99);
  });
});

describe('chaos reachability on the bundled templates', () => {
  for (const template of STARTER_TEMPLATES) {
    it(`${template.id}: failing each component gives a consistent result`, async () => {
      const parsed = parseBlueprintJson(await loadTemplateRaw(template));
      assert.ok(parsed.ok);
      const doc = parsed.doc;
      const entries = entryPointIds(doc);
      assert.ok(entries.length > 0, 'has an entry point');
      const baseline = reachableFrom(doc, entries, []);
      assert.deepEqual(baseline.unreachable, []);
      for (const node of doc.nodes) {
        const r = reachableFrom(doc, entries, [node.id]);
        const everyone = [...r.failed, ...r.unreachable, ...r.reachable];
        assert.equal(new Set(everyone).size, everyone.length, `${node.id}: no overlap`);
        assert.ok(!r.reachable.includes(node.id), `${node.id}: a failed component is not reachable`);
        assert.deepEqual(
          [...everyone].sort(),
          [...baseline.reachable].sort(),
          `${node.id}: every baseline component is failed, unreachable or reachable`,
        );
      }
    });
  }
});

describe('chaos fields in saved files (F-01)', () => {
  function chaosDoc(): DiagramDocument {
    const doc = build({ u: 'actor', a: 'service', b: 'service' }, [
      ['u', 'a'],
      ['a', 'b'],
    ]);
    doc.nodes.find((n) => n.id === 'a')!.resilience = { replicas: 3, fallbackId: 'b', circuitBreaker: true };
    doc.simulations = [
      { id: 's1', name: 'Broker down', tone: 'rose', failures: ['a'], steps: [{ id: 'st', nodes: ['u', 'a'], tone: 'rose', label: 'GO', trace: 't' }] },
    ];
    return doc;
  }

  it('round-trips through Blueprint JSON', () => {
    const text = serializeBlueprintJson(chaosDoc());
    const back = parseBlueprintJson(text);
    assert.ok(back.ok);
    assert.deepEqual(back.doc.nodes.find((n) => n.id === 'a')!.resilience, { replicas: 3, fallbackId: 'b', circuitBreaker: true });
    assert.deepEqual(back.doc.simulations[0].failures, ['a']);
  });

  it('round-trips through Blueprint Markdown', () => {
    const md = serializeToBlueprintMarkdown(chaosDoc());
    const back = importMermaidOrBlueprint(md);
    const a = back.doc.nodes.find((n) => n.title === chaosDoc().nodes.find((x) => x.id === 'a')!.title && n.resilience);
    assert.deepEqual(a?.resilience?.replicas, 3);
    assert.equal(a?.resilience?.circuitBreaker, true);
    assert.ok(back.doc.nodes.some((n) => n.id === a?.resilience?.fallbackId));
    assert.equal(back.doc.simulations[0].failures?.length, 1);
  });

  it('drops a fallback or failure that names a missing component', () => {
    const doc = chaosDoc();
    doc.nodes.find((n) => n.id === 'a')!.resilience = { fallbackId: 'gone' };
    doc.simulations[0].failures = ['gone'];
    const back = parseBlueprintJson(serializeBlueprintJson(doc));
    assert.ok(back.ok);
    assert.equal(back.doc.nodes.find((n) => n.id === 'a')!.resilience, undefined);
    assert.equal(back.doc.simulations[0].failures, undefined);
  });

  it('leaves plain documents without the new keys', () => {
    const text = serializeBlueprintJson(build({ u: 'actor', a: 'service' }, [['u', 'a']]));
    assert.ok(!text.includes('resilience'));
    assert.ok(!text.includes('failures'));
  });
});

describe('chaos actions (F-01)', () => {
  it('binds X to Fail this component in the Traffic lens of the new layout only', async () => {
    const { matchBinding } = await import('../src/core/keymap.ts');
    const key = { key: 'x', metaKey: false, ctrlKey: false, shiftKey: false, altKey: false };
    assert.equal(matchBinding(key, { mode: 'data', hasSelection: true, ui: 2 }), 'chaos-fail');
    assert.equal(matchBinding(key, { mode: 'design', hasSelection: true, ui: 2 }), null);
    assert.equal(matchBinding(key, { mode: 'data', hasSelection: false, ui: 2 }), null);
    assert.equal(matchBinding(key, { mode: 'data', hasSelection: true, ui: 1 }), null);
  });

  it('offers the action for one selected component in the Traffic lens only', async () => {
    const { isActionAvailable } = await import('../src/core/actions.ts');
    const ctx = { mode: 'data' as const, selection: 'node' as const, selectedCount: 1, selectedNodeCount: 1, grouped: false };
    assert.equal(isActionAvailable('chaos-fail', ctx), true);
    assert.equal(isActionAvailable('chaos-fail', { ...ctx, mode: 'design' }), false);
    assert.equal(isActionAvailable('chaos-fail', { ...ctx, selection: 'edge' }), false);
  });
});

describe('callers of a failed component (F-01)', () => {
  it('marks components that call the failed one as at risk, unless it has a live fallback', () => {
    const doc = build({ u: 'actor', a: 'service', b: 'service', db: 'store' }, [
      ['u', 'a'],
      ['u', 'b'],
      ['a', 'db'],
      ['b', 'db'],
    ]);
    const r = reachableFrom(doc, ['u'], ['db']);
    assert.deepEqual(r.atRisk, ['a', 'b']);
    doc.nodes.find((n) => n.id === 'db')!.resilience = { fallbackId: 'u' };
    assert.deepEqual(reachableFrom(doc, ['u'], ['db']).atRisk, []);
  });
});
