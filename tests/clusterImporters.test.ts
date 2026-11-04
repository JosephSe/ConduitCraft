import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { convertKubernetes } from '../src/importers/kubernetes.ts';
import { convertAsyncApi } from '../src/importers/asyncapi.ts';
import { looksLikeAsyncApi, looksLikeCompose, looksLikeKubernetes, looksLikeOpenApi } from '../src/importers/sniff.ts';
import { parseBlueprintJson, serializeBlueprintJson } from '../src/exporter/blueprintJson.ts';

const read = (path: string) => readFileSync(new URL(`./fixtures/${path}`, import.meta.url), 'utf8');
const codes = (issues: Array<{ code: string }>) => issues.map((i) => i.code);

describe('Kubernetes import', () => {
  const { doc, issues } = convertKubernetes(read('kubernetes/shop.yaml'), 'Shop');
  const node = (title: string) => doc.nodes.find((n) => n.title === title);
  const wire = (from: string, to: string) => doc.edges.find((e) => e.from === node(from)?.id && e.to === node(to)?.id);

  it('makes workloads, an Ingress gate and a store for each claimed volume', () => {
    assert.deepEqual(
      doc.nodes.map((n) => n.title).sort(),
      ['api', 'data', 'db', 'grafana', 'payments', 'web', 'web-ingress'],
    );
    assert.equal(node('web-ingress')?.kind, 'gate');
    assert.equal(node('db')?.kind, 'store');
    assert.equal(node('data')?.kind, 'store');
    assert.equal(node('web')?.resilience?.replicas, 3);
    assert.equal(node('payments')?.resilience, undefined);
    assert.ok(node('web')?.metrics.some((m) => m.label === 'Ports' && m.value === '8080'));
  });

  it('follows Ingress → Service → workload, and Service names in environment variables', () => {
    assert.equal(wire('web-ingress', 'web')?.label, 'shop.example.com/');
    assert.equal(wire('web-ingress', 'api')?.label, 'shop.example.com/api');
    assert.ok(wire('api', 'payments'), 'a service URL in an environment variable');
    assert.ok(wire('api', 'db'), 'a host name in a connection string');
    assert.ok(wire('db', 'data'));
    assert.equal(doc.edges.length, 5);
  });

  it('makes a swimlane per namespace that spans only its own components', () => {
    assert.deepEqual(doc.zones.map((z) => z.title).sort(), ['MONITORING', 'SHOP']);
    const shop = doc.zones.find((z) => z.title === 'SHOP')!;
    const monitoring = doc.zones.find((z) => z.title === 'MONITORING')!;
    for (const title of ['web', 'api', 'payments', 'db', 'data', 'web-ingress']) {
      const n = node(title)!;
      assert.ok(n.x >= shop.x && n.x + n.width <= shop.x + shop.width, `${title} sits in SHOP`);
    }
    const g = node('grafana')!;
    assert.ok(g.x >= monitoring.x && g.x + g.width <= monitoring.x + monitoring.width);
    assert.ok(monitoring.x >= shop.x + shop.width, 'the swimlanes do not overlap');
  });

  it('records where every component came from', () => {
    assert.deepEqual(node('api')?.source, { kind: 'kubernetes', ref: 'Deployment/shop/api' });
    assert.deepEqual(node('web-ingress')?.source, { kind: 'kubernetes', ref: 'Ingress/shop/web-ingress' });
    assert.deepEqual(node('data')?.source, { kind: 'kubernetes', ref: 'PersistentVolumeClaim/shop/data' });
  });

  it('never copies secrets or connection strings', () => {
    const text = serializeBlueprintJson(doc);
    assert.equal(text.includes('topsecret-password'), false);
    assert.equal(text.includes('super-secret-token-value'), false);
  });

  it('reports what it left out', () => {
    assert.ok(codes(issues).includes('kubernetes-backend-unresolved'));
    assert.ok(codes(issues).includes('kubernetes-service-unmatched'));
    const other = issues.find((i) => i.code === 'kubernetes-other-kinds');
    assert.ok(other);
    for (const kind of ['Namespace', 'ConfigMap', 'Secret', 'HorizontalPodAutoscaler']) assert.ok(other.message.includes(kind), kind);
  });

  it('survives the Blueprint file round trip', () => {
    const back = parseBlueprintJson(serializeBlueprintJson(doc));
    assert.ok(back.ok);
    if (!back.ok) return;
    assert.equal(back.doc.nodes.length, doc.nodes.length);
    assert.equal(back.doc.edges.length, doc.edges.length);
    assert.equal(back.doc.zones.length, doc.zones.length);
  });

  it('draws no swimlane for a single namespace, and refuses what is not Kubernetes', () => {
    const one = convertKubernetes(
      'apiVersion: apps/v1\nkind: Deployment\nmetadata: {name: a}\nspec:\n  template:\n    spec:\n      containers: [{name: a, image: x}]\n',
      'One',
    );
    assert.equal(one.doc.nodes.length, 1);
    assert.equal(one.doc.zones.length, 0);
    assert.throws(() => convertKubernetes('hello: world', 'x'), /No Kubernetes objects/);
    assert.throws(() => convertKubernetes('a: [', 'x'), /not valid YAML/);
    assert.throws(() => convertKubernetes('apiVersion: v1\nkind: ConfigMap\nmetadata: {name: c}\n', 'x'), /no workloads/);
  });
});

describe('AsyncAPI import', () => {
  it('draws channels as buses and the application sends and receives as async wires (v2)', () => {
    const { doc, issues } = convertAsyncApi(read('asyncapi/orders-v2.yaml'), 'x');
    assert.equal(doc.title, 'Order Service');
    assert.deepEqual(doc.nodes.map((n) => n.title).sort(), ['Order Service', 'audit.log', 'orders.created', 'payments.settled']);
    const app = doc.nodes.find((n) => n.title === 'Order Service')!;
    const created = doc.nodes.find((n) => n.title === 'orders.created')!;
    const settled = doc.nodes.find((n) => n.title === 'payments.settled')!;
    assert.equal(created.kind, 'bus');
    const sends = doc.edges.find((e) => e.from === app.id && e.to === created.id);
    assert.equal(sends?.label, 'OrderCreated');
    assert.equal(sends?.sync, 'async');
    assert.equal(sends?.protocol, 'kafka');
    const receives = doc.edges.find((e) => e.from === settled.id && e.to === app.id);
    assert.equal(receives?.label, 'PaymentSettled, PaymentRefunded');
    assert.equal(doc.edges.length, 2);
    assert.deepEqual(doc.nodes.find((n) => n.title === 'audit.log')?.source, { kind: 'asyncapi', ref: 'channel:audit.log' });
    assert.ok(codes(issues).includes('asyncapi-channel-idle'));
  });

  it('reads operations and addresses (v3)', () => {
    const { doc } = convertAsyncApi(read('asyncapi/orders-v3.yaml'), 'x');
    const app = doc.nodes.find((n) => n.title === 'Shipping Service')!;
    const paid = doc.nodes.find((n) => n.title === 'orders.paid')!;
    const shipped = doc.nodes.find((n) => n.title === 'parcels.shipped')!;
    assert.ok(doc.edges.find((e) => e.from === paid.id && e.to === app.id), 'receive: channel → app');
    assert.ok(doc.edges.find((e) => e.from === app.id && e.to === shipped.id), 'send: app → channel');
    assert.ok(doc.edges.every((e) => e.protocol === 'amqp' && e.sync === 'async'));
    assert.deepEqual(paid.metrics, [{ label: 'Message', value: 'OrderPaid' }]);
    assert.deepEqual(paid.source, { kind: 'asyncapi', ref: 'channel:orderPaid' });
  });

  it('refuses what it cannot read', () => {
    assert.throws(() => convertAsyncApi('foo: bar', 'x'), /not an AsyncAPI/);
    assert.throws(() => convertAsyncApi('asyncapi: 1.2.0\nchannels: {a: {}}', 'x'), /not supported/);
    assert.throws(() => convertAsyncApi('asyncapi: 2.0.0\nchannels: {}', 'x'), /no channels/);
  });
});

describe('file sniffing (all importers)', () => {
  it('tells the formats apart', () => {
    const k8s = read('kubernetes/shop.yaml');
    const compose = read('compose/docker-compose.yml');
    const openapi = read('openapi/petstore.yaml');
    const asyncapi = read('asyncapi/orders-v2.yaml');
    assert.equal(looksLikeKubernetes('shop.yaml', k8s), true);
    assert.equal(looksLikeKubernetes('shop.yaml', compose), false);
    assert.equal(looksLikeKubernetes('shop.yaml', openapi), false);
    assert.equal(looksLikeKubernetes('notes.md', k8s), false);
    assert.equal(looksLikeAsyncApi('x.yaml', asyncapi), true);
    assert.equal(looksLikeAsyncApi('x.json', '{"asyncapi": "3.0.0"}'), true);
    assert.equal(looksLikeAsyncApi('x.yaml', openapi), false);
    assert.equal(looksLikeOpenApi('x.yaml', asyncapi), false);
    assert.equal(looksLikeCompose('x.yaml', k8s), false);
  });
});
