import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  backingStoreOf,
  cacheChip,
  cacheHit,
  limiterChip,
  limiterRejects,
  nodeChip,
  normalizeCache,
  normalizeLimiter,
  normalizeSchedule,
  planCacheStep,
  scheduleChip,
} from '../src/core/components.ts';
import { getNodeDimensions } from '../src/core/layout.ts';
import { entryPointIds, pruneDanglingChaos, reachableFrom } from '../src/core/reachability.ts';
import { runInsights } from '../src/core/insights.ts';
import { describeDiagram } from '../src/core/describe.ts';
import { importMermaidOrBlueprint, serializeMermaidBlock, serializeToBlueprintMarkdown } from '../src/core/parser.ts';
import { parseBlueprintJson, serializeBlueprintJson } from '../src/exporter/blueprintJson.ts';
import { renderDiagramSvg } from '../src/exporter/diagramSvg.ts';
import { generateStandaloneHtml } from '../src/exporter/standaloneHtml.ts';
import { createShareUrl, decodeSharedDiagramFromHash } from '../src/studio/shareLink.ts';
import { kindForImage } from '../src/importers/common.ts';
import { createBlankDocument, createNodeFromStencil, findStencil } from '../src/templates/presets.ts';
import type { DiagramDocument, DiagramEdge, DiagramNode, NodeKind } from '../src/types.ts';

function build(
  kinds: Record<string, NodeKind>,
  wires: Array<[string, string, Partial<DiagramEdge>?]>,
  patch: Record<string, Partial<DiagramNode>> = {},
): DiagramDocument {
  const doc = createBlankDocument();
  doc.nodes = Object.entries(kinds).map(([id, kind], i) => ({
    ...createNodeFromStencil(kind, i * 100, 40, i),
    id,
    title: id,
    ...patch[id],
  }));
  doc.edges = wires.map(([from, to, extra], i) => ({
    id: `w${i}`,
    from,
    to,
    sourcePort: 'right',
    targetPort: 'left',
    tone: 'blue',
    route: 'straight',
    label: 'calls',
    animated: false,
    ...extra,
  }));
  return doc;
}

describe('K3 cache model (spec 5.1)', () => {
  it('has a stencil, a size and a chip', () => {
    const s = findStencil('cache')!;
    assert.equal(s.kind, 'cache');
    assert.equal(s.icon, 'bolt');
    assert.equal(s.accent, 'emerald');
    assert.equal(s.eyebrow, 'CACHE');
    assert.deepEqual(getNodeDimensions('cache'), { width: 200, height: 112 });
    assert.equal(cacheChip({}), 'HIT 80%');
  });

  it('reads cache settings from untrusted input and leaves defaults absent', () => {
    assert.equal(normalizeCache({ hitRate: 80 }), undefined);
    assert.deepEqual(normalizeCache({ hitRate: 55.7, backingId: ' db ' }), { hitRate: 56, backingId: 'db' });
    assert.deepEqual(normalizeCache({ hitRate: 0 }), { hitRate: 0 });
    assert.deepEqual(normalizeCache({ hitRate: 100 }), { hitRate: 100 });
    assert.equal(normalizeCache({ hitRate: 120 }), undefined);
    assert.equal(normalizeCache({ hitRate: -3, backingId: 5 }), undefined);
    assert.equal(normalizeCache('x'), undefined);
  });

  it('chip follows the hit rate', () => {
    assert.equal(cacheChip({ hitRate: 95 }), 'HIT 95%');
    assert.equal(nodeChip({ kind: 'cache', chip: 'HIT 80%', cache: { hitRate: 50 } }), 'HIT 50%');
  });

  it('infers the backing store from its only wire to a store', () => {
    const doc = build({ c: 'cache', db: 'store', s: 'service' }, [['c', 'db'], ['c', 's']]);
    assert.equal(backingStoreOf(doc, 'c'), 'db');
    const two = build({ c: 'cache', a: 'store', b: 'store' }, [['c', 'a'], ['c', 'b']]);
    assert.equal(backingStoreOf(two, 'c'), null);
    const named = build({ c: 'cache', a: 'store', b: 'store' }, [['c', 'a'], ['c', 'b']], { c: { cache: { backingId: 'b' } } });
    assert.equal(backingStoreOf(named, 'c'), 'b');
    const none = build({ c: 'cache', s: 'service' }, [['c', 's']]);
    assert.equal(backingStoreOf(none, 'c'), null);
  });

  it('a hit rate of 80 spreads hits evenly and deterministically', () => {
    const hits = Array.from({ length: 10 }, (_, n) => cacheHit(n, 80));
    assert.equal(hits.filter(Boolean).length, 8);
    assert.deepEqual(hits, Array.from({ length: 10 }, (_, n) => cacheHit(n, 80)));
    assert.equal(Array.from({ length: 10 }, (_, n) => cacheHit(n, 0)).filter(Boolean).length, 0);
    assert.equal(Array.from({ length: 10 }, (_, n) => cacheHit(n, 100)).filter(Boolean).length, 10);
    assert.equal(Array.from({ length: 10 }, (_, n) => cacheHit(n, 50)).filter(Boolean).length, 5);
  });

  it('a hit skips the steps up to and including the backing store step', () => {
    const steps = [
      { nodes: ['u', 'api'] },
      { nodes: ['api', 'c'] },
      { nodes: ['c', 'db'] },
      { nodes: ['api', 'u'] },
    ];
    assert.deepEqual(planCacheStep(steps, 1, 'c', 'db', true), { next: 3, label: 'HIT' });
    assert.deepEqual(planCacheStep(steps, 1, 'c', 'db', false), { next: 2, label: 'MISS' });
    // Nothing to do when the next steps never reach the backing store, or the cache is not in this step.
    assert.equal(planCacheStep(steps, 0, 'c', 'db', true), null);
    assert.equal(planCacheStep(steps, 3, 'c', 'db', true), null);
    // A hit on the last backing step ends the pass.
    assert.deepEqual(planCacheStep(steps.slice(0, 3), 1, 'c', 'db', true), { next: 3, label: 'HIT' });
  });
});

describe('K3 cache in chaos (spec 5.1)', () => {
  const doc = () => build({ u: 'actor', api: 'service', c: 'cache', db: 'store' }, [['u', 'api'], ['api', 'c'], ['c', 'db']]);

  it('a failed cache detours to its backing store: callers are slowed, not at risk', () => {
    const r = reachableFrom(doc(), entryPointIds(doc()), ['c']);
    assert.deepEqual(r.failed, ['c']);
    assert.ok(r.reachable.includes('db'));
    assert.deepEqual(r.slowed, ['api']);
    assert.deepEqual(r.atRisk, []);
  });

  it('without a backing store the cache behaves like any failed component', () => {
    const d = build({ u: 'actor', api: 'service', c: 'cache' }, [['u', 'api'], ['api', 'c']]);
    const r = reachableFrom(d, entryPointIds(d), ['c']);
    assert.deepEqual(r.slowed, []);
    assert.deepEqual(r.atRisk, ['api']);
  });

  it('a failed backing store is not a detour target', () => {
    const r = reachableFrom(doc(), entryPointIds(doc()), ['c', 'db']);
    assert.deepEqual(r.slowed, []);
  });

  it('prunes a backingId that names a missing component or the cache itself', () => {
    const d = build({ c: 'cache', db: 'store' }, [['c', 'db']], { c: { cache: { backingId: 'gone', hitRate: 50 } } });
    pruneDanglingChaos(d);
    assert.deepEqual(d.nodes[0].cache, { hitRate: 50 });
    const self = build({ c: 'cache' }, [], { c: { cache: { backingId: 'c' } } });
    pruneDanglingChaos(self);
    assert.equal(self.nodes[0].cache, undefined);
  });
});

describe('K3 cache review, images and files', () => {
  it('cache-no-backing fires for a cache with no data store behind it', () => {
    const d = build({ u: 'actor', c: 'cache', s: 'service' }, [['u', 'c'], ['c', 's']], { c: { title: 'Session Cache' } });
    const issue = runInsights(d).find((i) => i.code === 'cache-no-backing');
    assert.ok(issue);
    assert.equal(issue!.message, 'Session Cache has no data store behind it; a failure loses every read.');
    const ok = build({ u: 'actor', c: 'cache', db: 'store' }, [['u', 'c'], ['c', 'db']]);
    assert.equal(runInsights(ok).some((i) => i.code === 'cache-no-backing'), false);
  });

  it('memcached and varnish are caches; redis and valkey stay stores', () => {
    assert.equal(kindForImage('memcached:1.6'), 'cache');
    assert.equal(kindForImage('varnish:7'), 'cache');
    assert.equal(kindForImage('redis:7'), 'store');
    assert.equal(kindForImage('valkey/valkey'), 'store');
  });

  it('round-trips through the Blueprint file, JSON and share link', async () => {
    const d = build({ c: 'cache', db: 'store' }, [['c', 'db']], { c: { cache: { hitRate: 60, backingId: 'db' } } });
    const md = serializeToBlueprintMarkdown(d);
    const again = importMermaidOrBlueprint(md).doc;
    assert.equal(again.nodes.find((n) => n.id === 'c')!.kind, 'cache');
    assert.deepEqual(again.nodes.find((n) => n.id === 'c')!.cache, { hitRate: 60, backingId: 'db' });
    const json = parseBlueprintJson(serializeBlueprintJson(d));
    assert.ok(json.ok);
    assert.deepEqual(json.ok ? json.doc.nodes.find((n) => n.id === 'c')!.cache : null, { hitRate: 60, backingId: 'db' });
    const { hash } = await createShareUrl(d);
    const shared = (await decodeSharedDiagramFromHash(hash))!;
    assert.deepEqual(shared.nodes.find((n) => n.id === 'c')!.cache, { hitRate: 60, backingId: 'db' });
  });

  it('is described, drawn in the SVG and the HTML export, and written to Mermaid', () => {
    const d = build({ c: 'cache', db: 'store' }, [['c', 'db']], { c: { cache: { hitRate: 60 } } });
    assert.match(describeDiagram(d), /cache/i);
    assert.match(renderDiagramSvg(d), /HIT 60%/);
    assert.match(generateStandaloneHtml(d), /HIT 60%/);
    assert.match(serializeMermaidBlock(d), /c\[/);
  });

  it('remaps backingId when imported next to existing ids', () => {
    const d = build({ c: 'cache', db: 'store' }, [['c', 'db']], { c: { cache: { backingId: 'db' } } });
    const merged = importMermaidOrBlueprint(serializeToBlueprintMarkdown(d)).doc;
    assert.equal(merged.nodes.find((n) => n.kind === 'cache')!.cache?.backingId, merged.nodes.find((n) => n.kind === 'store')!.id);
  });
});

describe('K4 rate limiter model (spec 5.2)', () => {
  it('has a stencil, a size and a chip', () => {
    const s = findStencil('limiter')!;
    assert.equal(s.kind, 'limiter');
    assert.equal(s.icon, 'gauge');
    assert.equal(s.accent, 'violet');
    assert.equal(s.chip, '4/5');
    assert.equal(limiterChip({}), '4/5');
    assert.equal(limiterChip({ admit: 1, per: 10 }), '1/10');
  });

  it('reads limiter settings and leaves defaults absent', () => {
    assert.equal(normalizeLimiter({ admit: 4, per: 5 }), undefined);
    assert.deepEqual(normalizeLimiter({ admit: 2, per: 3, failOpen: true }), { admit: 2, per: 3, failOpen: true });
    assert.deepEqual(normalizeLimiter({ failOpen: true }), { failOpen: true });
    assert.equal(normalizeLimiter({ failOpen: false }), undefined);
    // admit cannot exceed per; bad numbers are dropped.
    assert.deepEqual(normalizeLimiter({ admit: 9, per: 3 }), { admit: 3, per: 3 });
    assert.equal(normalizeLimiter({ admit: -1, per: 0 }), undefined);
    assert.equal(normalizeLimiter({ admit: 'x' }), undefined);
  });

  it('rejects packet n when n % per >= admit, deterministically', () => {
    const results = Array.from({ length: 10 }, (_, n) => limiterRejects(n, 4, 5));
    assert.deepEqual(results, [false, false, false, false, true, false, false, false, false, true]);
    assert.equal(limiterRejects(0, 0, 5), true);
    assert.equal(limiterRejects(7, 5, 5), false);
  });

  it('a failed limiter fails closed by default', () => {
    const d = build({ u: 'actor', l: 'limiter', api: 'service' }, [['u', 'l'], ['l', 'api']]);
    const r = reachableFrom(d, entryPointIds(d), ['l']);
    assert.deepEqual(r.unreachable, ['api']);
    assert.deepEqual(r.bypassed, []);
  });

  it('a failed fail-open limiter with one outgoing wire is bypassed, not failed', () => {
    const d = build({ u: 'actor', l: 'limiter', api: 'service' }, [['u', 'l'], ['l', 'api']], { l: { limiter: { failOpen: true } } });
    const r = reachableFrom(d, entryPointIds(d), ['l']);
    assert.deepEqual(r.bypassed, ['l']);
    assert.deepEqual(r.failed, []);
    assert.ok(r.reachable.includes('api'));
    assert.deepEqual(r.unreachable, []);
  });

  it('fail open needs exactly one outgoing wire', () => {
    const d = build({ u: 'actor', l: 'limiter', a: 'service', b: 'service' }, [['u', 'l'], ['l', 'a'], ['l', 'b']], { l: { limiter: { failOpen: true } } });
    const r = reachableFrom(d, entryPointIds(d), ['l']);
    assert.deepEqual(r.failed, ['l']);
    assert.deepEqual(r.bypassed, []);
  });

  it('limiter-fail-open says traffic reaches the target unchecked', () => {
    const d = build({ u: 'actor', l: 'limiter', api: 'service' }, [['u', 'l'], ['l', 'api']], {
      l: { title: 'Rate Limiter', limiter: { failOpen: true } },
      api: { title: 'Orders API' },
    });
    const issue = runInsights(d).find((i) => i.code === 'limiter-fail-open');
    assert.ok(issue);
    assert.equal(issue!.message, 'Rate Limiter fails open: when it is down, traffic reaches Orders API unchecked.');
    const closed = build({ u: 'actor', l: 'limiter', api: 'service' }, [['u', 'l'], ['l', 'api']]);
    assert.equal(runInsights(closed).some((i) => i.code === 'limiter-fail-open'), false);
  });

  it('round-trips and is drawn', () => {
    const d = build({ l: 'limiter', api: 'service' }, [['l', 'api']], { l: { limiter: { admit: 2, per: 7, failOpen: true } } });
    const again = importMermaidOrBlueprint(serializeToBlueprintMarkdown(d)).doc;
    assert.equal(again.nodes.find((n) => n.id === 'l')!.kind, 'limiter');
    assert.deepEqual(again.nodes.find((n) => n.id === 'l')!.limiter, { admit: 2, per: 7, failOpen: true });
    const lj = parseBlueprintJson(serializeBlueprintJson(d));
    assert.ok(lj.ok);
    assert.deepEqual(lj.ok ? lj.doc.nodes[0].limiter : null, { admit: 2, per: 7, failOpen: true });
    assert.match(renderDiagramSvg(d), /2\/7/);
    assert.match(generateStandaloneHtml(d), /2\/7/);
    assert.match(describeDiagram(d), /rate limiter/i);
  });
});

describe('K5 scheduler model (spec 5.3)', () => {
  it('has a stencil, a size and a chip from every', () => {
    const s = findStencil('scheduler')!;
    assert.equal(s.kind, 'scheduler');
    assert.equal(s.icon, 'clock');
    assert.equal(s.accent, 'blue');
    assert.equal(s.eyebrow, 'SCHEDULE');
    assert.deepEqual(getNodeDimensions('scheduler'), { width: 192, height: 112 });
    assert.equal(scheduleChip({ every: '5m' }, 'CRON'), '5m');
    assert.equal(scheduleChip(undefined, 'CRON'), 'CRON');
  });

  it('reads and trims every to 40 characters', () => {
    assert.deepEqual(normalizeSchedule({ every: ' 0 3 * * * ' }), { every: '0 3 * * *' });
    assert.equal(normalizeSchedule({ every: '   ' }), undefined);
    assert.equal(normalizeSchedule({ every: 5 }), undefined);
    assert.equal(normalizeSchedule({ every: 'x'.repeat(80) })!.every!.length, 40);
  });

  it('is an entry point', () => {
    const d = build({ s: 'scheduler', job: 'service', db: 'store' }, [['s', 'job'], ['job', 'db']]);
    assert.deepEqual(entryPointIds(d), ['s']);
    const mixed = build({ s: 'scheduler', u: 'actor', job: 'service' }, [['s', 'job']]);
    assert.deepEqual(entryPointIds(mixed).sort(), ['s', 'u']);
  });

  it('failing the only scheduler makes its jobs unreachable', () => {
    const d = build({ s: 'scheduler', job: 'service', db: 'store' }, [['s', 'job'], ['job', 'db']]);
    const r = reachableFrom(d, entryPointIds(d), ['s']);
    assert.deepEqual(r.failed, ['s']);
    assert.deepEqual(r.unreachable, ['db', 'job']);
    const ok = reachableFrom(d, entryPointIds(d), ['job']);
    assert.deepEqual(ok.reachable.includes('s'), true);
  });

  it('scheduler-no-queue fires when the direct target is a store', () => {
    const d = build({ s: 'scheduler', db: 'store' }, [['s', 'db']], { s: { title: 'Nightly Export' }, db: { title: 'Ledger DB' } });
    const issue = runInsights(d).find((i) => i.code === 'scheduler-no-queue');
    assert.ok(issue);
    assert.equal(issue!.message, 'Nightly Export runs straight into Ledger DB; a failed run is not retried.');
    const viaQueue = build({ s: 'scheduler', q: 'queue', db: 'store' }, [['s', 'q'], ['q', 'db']]);
    assert.equal(runInsights(viaQueue).some((i) => i.code === 'scheduler-no-queue'), false);
  });

  it('round-trips and is drawn', () => {
    const d = build({ s: 'scheduler', job: 'service' }, [['s', 'job']], { s: { schedule: { every: '0 3 * * *' } } });
    const again = importMermaidOrBlueprint(serializeToBlueprintMarkdown(d)).doc;
    assert.equal(again.nodes.find((n) => n.id === 's')!.kind, 'scheduler');
    assert.deepEqual(again.nodes.find((n) => n.id === 's')!.schedule, { every: '0 3 * * *' });
    const sj = parseBlueprintJson(serializeBlueprintJson(d));
    assert.ok(sj.ok);
    assert.deepEqual(sj.ok ? sj.doc.nodes[0].schedule : null, { every: '0 3 * * *' });
    assert.match(renderDiagramSvg(d), /0 3 \* \* \*/);
    assert.match(describeDiagram(d), /scheduler|schedule/i);
  });

  it('nodeChip resolves every kind', () => {
    assert.equal(nodeChip({ kind: 'limiter', chip: '4/5', limiter: { admit: 1, per: 2 } }), '1/2');
    assert.equal(nodeChip({ kind: 'scheduler', chip: 'CRON', schedule: { every: '5m' } }), '5m');
    assert.equal(nodeChip({ kind: 'service', chip: 'API' }), 'API');
  });
});
