import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { applyDrift, computeDrift, driftSummary } from '../src/core/drift.ts';
import { convertForDrift } from '../src/importers/driftSource.ts';
import { convertCompose } from '../src/importers/compose.ts';
import { convertKubernetes } from '../src/importers/kubernetes.ts';
import { checkDrift } from '../tools/cliCore.ts';

const read = (path: string) => readFileSync(new URL(`./fixtures/${path}`, import.meta.url), 'utf8');
const base = read('compose/docker-compose.yml');
const KIND = 'docker-compose';

/** The Compose fixture after a few weeks: postgres 17, a fourth worker, no cache, and a new search service. */
const newer = base
  .replace('postgres:16', 'postgres:17')
  .replace('replicas: 3', 'replicas: 4')
  .replace(/  cache:\n    image: redis:7\n    networks: \[back\]\n/, '')
  .replace(/      cache:\n        condition: service_started\n/, '')
  .replace(/    links:\n      - cache:redis\n/, '')
  .replace('volumes:\n  pgdata:', '  search:\n    image: opensearch:2\n    depends_on: [api]\n    ports: ["9200:9200"]\nvolumes:\n  pgdata:');

const diagram = () => convertCompose(base, 'Shop').doc;
const file = () => convertCompose(newer, 'Shop').doc;

describe('drift check', () => {
  it('finds nothing when the file has not changed', () => {
    const report = computeDrift(diagram(), convertCompose(base, 'Shop').doc, KIND);
    assert.deepEqual(report.items, []);
    assert.equal(driftSummary(report), 'no drift');
    assert.ok(report.tracked >= 6);
  });

  it('lists added, removed and changed components, and added wires, for a changed file', () => {
    const report = computeDrift(diagram(), file(), KIND);
    const by = (type: string, subject: string) => report.items.filter((i) => i.type === type && i.subject === subject).map((i) => i.title);
    assert.deepEqual(by('added', 'component'), ['search']);
    assert.deepEqual(by('removed', 'component'), ['cache']);
    assert.deepEqual(by('changed', 'component').sort(), ['db', 'worker']);
    assert.ok(!by('added', 'wire').some((t) => t.includes('search')), 'the new service brings its own wires, so they are not listed twice');
    const db = report.items.find((i) => i.title === 'db')!;
    assert.match(db.detail, /Image changed from postgres:16 to postgres:17/);
    const worker = report.items.find((i) => i.title === 'worker')!;
    assert.match(worker.detail, /Running copies changed from 3 to 4/);
    assert.equal(driftSummary(report), '1 component in the file only, 1 component gone from the file, 2 components changed, 2 wires in the file only');
  });

  it('ignores what a person changed: titles, notes, positions, tones and their own wires', () => {
    const mine = diagram();
    const web = mine.nodes.find((n) => n.source?.ref === 'web')!;
    web.title = 'Storefront';
    web.summary = 'The public site';
    web.x += 160;
    web.tone = 'violet';
    const api = mine.nodes.find((n) => n.source?.ref === 'api')!;
    api.metrics.push({ label: 'Owner', value: 'Payments team' });
    mine.edges.push({ ...mine.edges[0], id: 'my-wire', from: web.id, to: mine.nodes.find((n) => n.source?.ref === 'queue')!.id, label: 'by hand' });
    assert.deepEqual(computeDrift(mine, convertCompose(base, 'Shop').doc, KIND).items, []);
  });

  it('reports a wire the file now has and the diagram lacks, and one the file dropped', () => {
    const mine = diagram();
    const web = mine.nodes.find((n) => n.source?.ref === 'web')!;
    const api = mine.nodes.find((n) => n.source?.ref === 'api')!;
    mine.edges = mine.edges.filter((e) => !(e.from === web.id && e.to === api.id));
    let report = computeDrift(mine, convertCompose(base, 'Shop').doc, KIND);
    assert.deepEqual(report.items.map((i) => [i.type, i.subject, i.title]), [['added', 'wire', 'web → api']]);

    const dropped = base.replace('    depends_on:\n      - api\n    networks: [front]', '    networks: []');
    report = computeDrift(diagram(), convertCompose(dropped, 'Shop').doc, KIND);
    assert.ok(report.items.some((i) => i.type === 'removed' && i.subject === 'wire' && i.title === 'web → api'), JSON.stringify(report.items));
  });

  it('accepting everything makes the diagram match the file, so a second check is clean', () => {
    const mine = diagram();
    const theirs = file();
    const report = computeDrift(mine, theirs, KIND);
    const applied = applyDrift(mine, theirs, KIND, report.items);
    assert.ok(applied >= 4);
    assert.deepEqual(computeDrift(mine, theirs, KIND).items, []);
    assert.ok(mine.nodes.some((n) => n.title === 'search'));
    assert.ok(!mine.nodes.some((n) => n.title === 'cache'));
    const ids = new Set(mine.nodes.map((n) => n.id));
    assert.ok(mine.edges.every((e) => ids.has(e.from) && ids.has(e.to)), 'no wire is left pointing at a removed component');
    const search = mine.nodes.find((n) => n.title === 'search')!;
    const api = mine.nodes.find((n) => n.title === 'api')!;
    assert.ok(mine.edges.some((e) => (e.from === search.id && e.to === api.id) || (e.from === api.id && e.to === search.id)), 'the new service is wired to api');
    const db = mine.nodes.find((n) => n.title === 'db')!;
    assert.equal(db.subtitle, 'postgres:17', 'a subtitle that was only the image follows it');
    assert.equal(mine.nodes.find((n) => n.title === 'worker')!.resilience?.replicas, 4);
    assert.equal(new Set(mine.nodes.map((n) => n.id)).size, mine.nodes.length);
  });

  it('accepting one difference changes only that one', () => {
    const mine = diagram();
    const theirs = file();
    const report = computeDrift(mine, theirs, KIND);
    const before = JSON.stringify(mine);
    applyDrift(mine, theirs, KIND, report.items.filter((i) => i.title === 'db'));
    assert.notEqual(JSON.stringify(mine), before);
    const left = computeDrift(mine, theirs, KIND).items.filter((i) => i.subject === 'component').map((i) => i.title).sort();
    assert.deepEqual(left, ['cache', 'search', 'worker']);
    assert.equal(mine.nodes.find((n) => n.title === 'db')!.metrics.find((m) => m.label === 'Image')!.value, 'postgres:17');
  });

  it('keeps a changed component where the person put it and what they named it', () => {
    const mine = diagram();
    const db = mine.nodes.find((n) => n.source?.ref === 'db')!;
    db.title = 'Orders database';
    db.x = 1234;
    const theirs = file();
    applyDrift(mine, theirs, KIND, computeDrift(mine, theirs, KIND).items.filter((i) => i.targetId === db.id));
    assert.equal(db.title, 'Orders database');
    assert.equal(db.x, 1234);
  });

  it('does not touch components that were not imported from this kind of file', () => {
    const mine = diagram();
    mine.nodes.push({ ...mine.nodes[0], id: 'hand-made', title: 'Hand made', source: undefined });
    const report = computeDrift(mine, file(), KIND);
    assert.ok(!report.items.some((i) => i.targetId === 'hand-made'));
    const k8s = computeDrift(mine, convertKubernetes(read('kubernetes/shop.yaml'), 'Shop').doc, 'kubernetes');
    assert.equal(k8s.tracked, 0);
    assert.match(driftSummary(k8s), /nothing in this diagram was imported/);
  });

  it('works for Kubernetes manifests', () => {
    const manifest = read('kubernetes/shop.yaml');
    const mine = convertKubernetes(manifest, 'Shop').doc;
    const image = /image:\s*(\S+)/.exec(manifest)![1];
    const changed = manifest.replace(`image: ${image}`, 'image: example/changed:9');
    const report = computeDrift(mine, convertKubernetes(changed, 'Shop').doc, 'kubernetes');
    assert.equal(report.items.length, 1);
    assert.equal(report.items[0].type, 'changed');
    assert.match(report.items[0].detail, /Image changed/);
  });

  it('picks the importer from what the file looks like, or from the kind named', () => {
    assert.equal(convertForDrift('docker-compose.yml', base).kind, 'docker-compose');
    assert.equal(convertForDrift('shop.yaml', read('kubernetes/shop.yaml')).kind, 'kubernetes');
    assert.equal(convertForDrift('petstore.yaml', read('openapi/petstore.yaml')).kind, 'openapi');
    assert.equal(convertForDrift('orders.yaml', read('asyncapi/orders-v2.yaml')).kind, 'asyncapi');
    assert.equal(convertForDrift('anything.yml', base, 'docker-compose').kind, 'docker-compose');
    assert.throws(() => convertForDrift('notes.txt', 'hello'), /not a Docker Compose/);
    assert.throws(() => convertForDrift('x.yml', base, 'terraform'), /no drift check/);
  });

  it('is what the command line reports, page by page', () => {
    const result = checkDrift(diagram(), 'docker-compose.yml', newer);
    assert.equal(result.drifted, true);
    assert.match(result.lines[0], /docker-compose\.yml: .*2 components changed/);
    assert.ok(result.lines.some((l) => /changed: db: Image changed from postgres:16 to postgres:17/.test(l)));
    const clean = checkDrift(diagram(), 'docker-compose.yml', base);
    assert.equal(clean.drifted, false);
    assert.deepEqual(clean.lines, ['docker-compose.yml: no drift']);
  });
});
