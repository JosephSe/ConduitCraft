import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { convertCompose } from '../src/importers/compose.ts';
import { convertOpenApi } from '../src/importers/openapi.ts';
import { looksLikeCompose, looksLikeOpenApi } from '../src/importers/sniff.ts';
import { parseBlueprintJson, serializeBlueprintJson } from '../src/exporter/blueprintJson.ts';
import { importMermaidOrBlueprint, serializeToBlueprintMarkdown } from '../src/core/parser.ts';
import { createShareUrl, decodeSharedDiagramFromHash } from '../src/studio/shareLink.ts';
import { normalizeSource } from '../src/core/meta.ts';
import type { DiagramDocument } from '../src/types.ts';

const read = (path: string) => readFileSync(new URL(`./fixtures/${path}`, import.meta.url), 'utf8');
const codes = (issues: Array<{ code: string }>) => issues.map((i) => i.code);

describe('Docker Compose import', () => {
  const { doc, issues } = convertCompose(read('compose/docker-compose.yml'), 'Shop');
  const node = (title: string) => doc.nodes.find((n) => n.title === title);
  const wire = (from: string, to: string) =>
    doc.edges.find((e) => e.from === node(from)?.id && e.to === node(to)?.id);

  it('makes a component per service and a store per named volume', () => {
    assert.deepEqual(
      doc.nodes.map((n) => n.title).sort(),
      ['api', 'cache', 'db', 'pgdata', 'queue', 'uploads', 'web', 'worker'],
    );
    assert.equal(node('db')?.kind, 'store');
    assert.equal(node('cache')?.kind, 'store');
    assert.equal(node('queue')?.kind, 'queue');
    assert.equal(node('web')?.kind, 'gate');
    assert.equal(node('api')?.kind, 'service');
    assert.equal(node('pgdata')?.kind, 'store');
    assert.equal(node('worker')?.resilience?.replicas, 3);
  });

  it('draws depends_on and links as wires from the dependent, and volumes as wires to stores', () => {
    assert.ok(wire('web', 'api'));
    assert.ok(wire('api', 'db'));
    assert.ok(wire('api', 'cache'));
    assert.ok(wire('api', 'queue'));
    assert.ok(wire('worker', 'queue'));
    assert.ok(wire('worker', 'db'));
    assert.equal(doc.edges.filter((e) => e.from === node('api')?.id && e.to === node('cache')?.id).length, 1, 'link and depends_on make one wire');
    assert.ok(wire('db', 'pgdata'));
    assert.equal(doc.edges.filter((e) => e.to === node('uploads')?.id).length, 2, 'two services share one volume store');
  });

  it('wires a small shared network and only tags a large one', () => {
    const front = doc.edges.find((e) => e.label === 'front');
    assert.equal(front, undefined, 'web and api are already wired by depends_on');
    assert.ok(node('db')?.tags?.includes('net:back'));
    assert.ok(codes(issues).includes('compose-network-tagged'));
  });

  it('records where every component came from', () => {
    for (const n of doc.nodes) assert.equal(n.source?.kind, 'docker-compose');
    assert.deepEqual(node('api')?.source, { kind: 'docker-compose', ref: 'api' });
    assert.deepEqual(node('pgdata')?.source, { kind: 'docker-compose', ref: 'volume:pgdata' });
  });

  it('never copies environment values or secrets', () => {
    const everything = serializeBlueprintJson(doc);
    assert.equal(everything.includes('hunter2'), false);
    assert.equal(everything.includes('sk-live'), false);
    assert.ok(codes(issues).includes('compose-environment'));
  });

  it('reports what it left out', () => {
    assert.ok(codes(issues).includes('compose-unknown-dependency'));
    assert.ok(codes(issues).includes('compose-bind-mount'));
  });

  it('lays components out without overlap', () => {
    for (let a = 0; a < doc.nodes.length; a++) {
      for (let b = a + 1; b < doc.nodes.length; b++) {
        const p = doc.nodes[a];
        const q = doc.nodes[b];
        const overlap = p.x < q.x + q.width && q.x < p.x + p.width && p.y < q.y + q.height && q.y < p.y + p.height;
        assert.equal(overlap, false, `${p.title} overlaps ${q.title}`);
      }
    }
  });

  it('wires services on a small network', () => {
    const small = convertCompose(
      'services:\n  a:\n    image: x\n    networks: [n]\n  b:\n    image: y\n    networks: [n]\n',
      'Small',
    );
    assert.equal(small.doc.edges.length, 1);
    assert.equal(small.doc.edges[0].label, 'n');
  });

  it('refuses text that is not a Compose file', () => {
    assert.throws(() => convertCompose('a: [', 'x'), /not valid YAML/);
    assert.throws(() => convertCompose('hello: world', 'x'), /no "services" section/);
    assert.throws(() => convertCompose('services: {}', 'x'), /no services/);
  });
});

describe('OpenAPI import', () => {
  const { doc, issues } = convertOpenApi(read('openapi/petstore.yaml'), 'fallback');
  const node = (title: string) => doc.nodes.find((n) => n.title === title);

  it('makes a component per tag, listing operations as metrics', () => {
    assert.equal(doc.title, 'Pet Store');
    const pets = node('pets');
    assert.ok(pets);
    assert.equal(pets.subtitle, '4 operations');
    assert.equal(pets.summary, 'Everything about pets');
    assert.deepEqual(pets.metrics[0], { label: 'GET /pets', value: 'List pets' });
    assert.ok(pets.metrics.some((m) => m.label === 'GET /pets/{id}' && m.value === 'getPet'));
    assert.ok(pets.metrics.some((m) => m.label === 'DELETE /pets/{id}' && m.value.startsWith('Deprecated.')));
    assert.equal(node('store')?.metrics.length, 1);
    assert.equal(node('Untagged')?.metrics[0].label, 'GET /health');
  });

  it('makes a gate per server, wired to every component', () => {
    const gates = doc.nodes.filter((n) => n.kind === 'gate');
    assert.deepEqual(gates.map((g) => g.title).sort(), ['Production', 'staging.petstore.example']);
    assert.equal(doc.edges.length, 6);
    assert.ok(doc.edges.every((e) => e.protocol === 'http'));
  });

  it('records where every component came from', () => {
    assert.deepEqual(node('pets')?.source, { kind: 'openapi', ref: 'tag:pets' });
    assert.deepEqual(node('Production')?.source, { kind: 'openapi', ref: 'server:https://api.petstore.example/v1' });
  });

  it('reports what it left out', () => {
    assert.ok(codes(issues).includes('openapi-deprecated'));
    assert.ok(codes(issues).includes('openapi-callbacks'));
    assert.ok(codes(issues).includes('openapi-schemas'));
  });

  it('makes one component for an API with no tags', () => {
    const one = convertOpenApi('openapi: 3.1.0\ninfo: {title: Tiny, description: Small API}\npaths:\n  /a: {get: {}}\n  /b: {post: {}}\n', 'x');
    assert.equal(one.doc.nodes.length, 1);
    assert.equal(one.doc.nodes[0].title, 'Tiny');
    assert.equal(one.doc.nodes[0].metrics.length, 2);
    assert.deepEqual(one.doc.nodes[0].source, { kind: 'openapi', ref: 'api:Tiny' });
  });

  it('reads JSON too, and explains what it cannot read', () => {
    const json = JSON.stringify({ openapi: '3.0.0', info: { title: 'J' }, paths: { '/x': { get: { summary: 'X' } } } });
    assert.equal(convertOpenApi(json, 'x').doc.nodes.length, 1);
    assert.throws(() => convertOpenApi('swagger: "2.0"\npaths: {}', 'x'), /Swagger 2/);
    assert.throws(() => convertOpenApi('foo: bar', 'x'), /not an OpenAPI 3/);
    assert.throws(() => convertOpenApi('openapi: 3.0.0\npaths: {}', 'x'), /no operations/);
  });
});

describe('file sniffing', () => {
  it('recognises Compose and OpenAPI files', () => {
    assert.equal(looksLikeCompose('docker-compose.yml', ''), true);
    assert.equal(looksLikeCompose('compose.yaml', ''), true);
    assert.equal(looksLikeCompose('stack.yml', 'version: "3"\nservices:\n  a: {}\n'), true);
    assert.equal(looksLikeCompose('api.yaml', 'openapi: 3.0.0\nservices:\n'), false);
    assert.equal(looksLikeCompose('notes.md', '# services:\n'), false);
    assert.equal(looksLikeOpenApi('api.yaml', 'openapi: "3.0.1"\ninfo: {}'), true);
    assert.equal(looksLikeOpenApi('api.json', '{"openapi": "3.1.0", "info": {}}'), true);
    assert.equal(looksLikeOpenApi('x.json', '{"title": "Blueprint"}'), false);
  });
});

describe('source (schema v8) round trip', () => {
  const doc = convertCompose(read('compose/docker-compose.yml'), 'Shop').doc;
  const sources = (d: DiagramDocument) => d.nodes.map((n) => `${n.title}=${n.source?.kind}/${n.source?.ref}`).sort();

  it('survives Blueprint JSON', () => {
    const back = parseBlueprintJson(serializeBlueprintJson(doc));
    assert.ok(back.ok);
    if (back.ok) assert.deepEqual(sources(back.doc), sources(doc));
  });

  it('survives the share link', async () => {
    const { hash } = await createShareUrl(doc, { baseUrl: 'https://example.com/app' });
    const back = await decodeSharedDiagramFromHash(hash);
    assert.ok(back);
    assert.deepEqual(sources(back), sources(doc));
  });

  it('survives the Blueprint file', () => {
    const text = serializeToBlueprintMarkdown(doc);
    const back = importMermaidOrBlueprint(text).doc;
    const titleSources = (d: DiagramDocument) => d.nodes.map((n) => `${n.title}=${n.source?.ref}`).sort();
    assert.deepEqual(titleSources(back), titleSources(doc));
  });

  it('drops a source that is not a short kind and reference', () => {
    assert.deepEqual(normalizeSource({ kind: 'OpenAPI', ref: ' tag:pets ' }), { kind: 'openapi', ref: 'tag:pets' });
    assert.equal(normalizeSource({ kind: 'bad kind', ref: 'x' }), undefined);
    assert.equal(normalizeSource({ kind: 'ok', ref: '' }), undefined);
    assert.equal(normalizeSource({ kind: 'ok', ref: 'x'.repeat(201) }), undefined);
    assert.equal(normalizeSource('docker-compose'), undefined);
    assert.equal(normalizeSource(null), undefined);
  });
});
