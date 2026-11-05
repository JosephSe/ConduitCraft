import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { colourToTone, convertDrawio, labelToText, readDrawio } from '../src/importers/drawio.ts';
import { looksLikeDrawio } from '../src/importers/sniff.ts';
import { parseXml } from '../src/importers/xml.ts';
import { pageList } from '../src/core/pages.ts';
import { parseBlueprintJson, serializeBlueprintJson } from '../src/exporter/blueprintJson.ts';
import type { DiagramDocument } from '../src/types.ts';

const fixture = (name: string) => readFileSync(new URL(`./fixtures/drawio/${name}`, import.meta.url), 'utf8');
const codes = (issues: Array<{ code: string }>) => issues.map((i) => i.code);

/** Every imported document must survive the Blueprint file round trip with the same counts. */
function assertRoundTrips(doc: DiagramDocument): void {
  const parsed = parseBlueprintJson(serializeBlueprintJson(doc));
  assert.ok(parsed.ok, parsed.ok ? '' : parsed.error);
  if (!parsed.ok) return;
  assert.equal(parsed.doc.nodes.length, doc.nodes.length);
  assert.equal(parsed.doc.edges.length, doc.edges.length);
  assert.equal(parsed.doc.zones.length, doc.zones.length);
  assert.equal(parsed.doc.notesCards.length, doc.notesCards.length);
}

describe('XML reader', () => {
  it('reads attributes, entities, CDATA and self-closing tags', () => {
    const root = parseXml('<?xml version="1.0"?><!-- c --><a x="1 &amp; 2" y=\'&lt;b&gt;\'><b/><c><![CDATA[<raw>]]> t&#33;</c></a>');
    assert.equal(root.name, 'a');
    assert.equal(root.attrs.x, '1 & 2');
    assert.equal(root.attrs.y, '<b>');
    assert.equal(root.children.length, 2);
    assert.equal(root.children[1].text, '<raw> t!');
  });

  it('does not expand entities declared in a DOCTYPE', () => {
    const root = parseXml('<!DOCTYPE a [<!ENTITY boom "BOOM">]><a v="&boom;"/>');
    assert.equal(root.attrs.v, '&boom;');
  });

  it('rejects text that is not well-formed', () => {
    assert.throws(() => parseXml('<a><b></a>'), /not valid XML/);
    assert.throws(() => parseXml('<a'), /not valid XML/);
    assert.throws(() => parseXml('   '), /no XML content/);
  });
});

describe('draw.io helpers', () => {
  it('turns HTML labels into plain text', () => {
    assert.equal(labelToText('API<br>Gateway<div>Routes &amp; limits</div>'), 'API\nGateway\nRoutes & limits');
    assert.equal(labelToText('plain'), 'plain');
    assert.equal(labelToText(''), '');
  });

  it('picks the nearest wire colour, and none for greys', () => {
    assert.equal(colourToTone('#dae8fc'), 'blue');
    assert.equal(colourToTone('#d5e8d4'), 'emerald');
    assert.equal(colourToTone('#f8cecc'), 'rose');
    assert.equal(colourToTone('#fff2cc'), 'amber');
    assert.equal(colourToTone('#e1d5e7'), 'violet');
    assert.equal(colourToTone('#cccccc'), undefined);
    assert.equal(colourToTone('none'), undefined);
    assert.equal(colourToTone(undefined), undefined);
  });

  it('recognises draw.io files by extension or content', () => {
    assert.equal(looksLikeDrawio('a.drawio', ''), true);
    assert.equal(looksLikeDrawio('a.xml', '<mxfile host="x">'), true);
    assert.equal(looksLikeDrawio('a.xml', '<mxGraphModel>'), true);
    assert.equal(looksLikeDrawio('a.xml', '<svg/>'), false);
    assert.equal(looksLikeDrawio('a.md', '# hello'), false);
  });
});

describe('draw.io import', () => {
  it('maps shapes, labels, arrows and notes (plain page)', async () => {
    const file = await readDrawio(fixture('plain.drawio'));
    assert.equal(file.pages.length, 1);
    const { docs, issues } = convertDrawio(file, 'separate', 'Orders');
    assert.equal(docs.length, 1);
    const doc = docs[0];
    assert.equal(doc.nodes.length, 4);
    assert.equal(doc.edges.length, 3);
    assert.equal(doc.notesCards.length, 1);
    assert.equal(doc.zones.length, 0);

    const byTitle = (t: string) => doc.nodes.find((n) => n.title === t);
    assert.equal(byTitle('Customer')?.kind, 'actor');
    assert.equal(byTitle('Orders DB')?.kind, 'store');
    const gate = byTitle('Fraud?');
    assert.equal(gate?.kind, 'gate');
    assert.equal(gate?.shape, 'diamond');
    const api = byTitle('API');
    assert.equal(api?.subtitle, 'Gateway');
    assert.equal(api?.shape, 'rounded');
    assert.equal(api?.accent, 'emerald');
    assert.equal(byTitle('Orders DB')?.accent, 'rose');

    const https = doc.edges.find((e) => e.label === 'HTTPS');
    assert.ok(https);
    assert.equal(doc.nodes.find((n) => n.id === https.from)?.title, 'Customer');
    const sql = doc.edges.find((e) => e.label === 'SQL');
    assert.ok(sql, 'the label held in a child shape lands on its wire');
    assert.equal(sql.flow, 'both');
    assert.equal(doc.edges.filter((e) => e.sync === 'async').length, 1);

    assert.ok(codes(issues).includes('drawio-edge-unconnected'));
    assert.equal(doc.notesCards[0].items.length, 1);
    assertRoundTrips(doc);
  });

  it('reads compressed pages', async () => {
    const file = await readDrawio(fixture('compressed.drawio'));
    assert.equal(file.pages[0].name, 'Jobs');
    const { docs, issues } = convertDrawio(file, 'separate', 'Jobs');
    assert.equal(docs[0].nodes.length, 3);
    assert.deepEqual(docs[0].edges.map((e) => e.label).sort(), ['pull', 'write']);
    assert.equal(issues.filter((i) => i.level === 'error').length, 0);
    assertRoundTrips(docs[0]);
  });

  it('turns swimlanes and containers into frames, nested like the original', async () => {
    const file = await readDrawio(fixture('container.drawio'));
    const { docs, issues } = convertDrawio(file, 'separate', 'Platform');
    const doc = docs[0];
    assert.equal(doc.nodes.length, 4);
    assert.equal(doc.zones.length, 0, 'containers are frames now, not swimlanes');
    assert.equal(doc.edges.length, 3, 'the wire attached to a swimlane is skipped');
    const frames = doc.frames ?? [];
    assert.ok(frames.length >= 2, 'at least the Edge and Core containers become frames');
    const edge = frames.find((f) => f.title === 'Edge');
    assert.ok(edge);
    const edgeNodes = doc.nodes.filter((n) => ['CDN', 'Load balancer'].includes(n.title));
    for (const n of edgeNodes) {
      assert.ok(n.x >= edge.x && n.x + n.width <= edge.x + edge.width, `${n.title} sits inside the Edge frame`);
      assert.equal(n.frameId, edge.id);
    }
    // Nesting is kept: a container inside Core is a frame inside the Core frame.
    const core = frames.find((f) => f.title === 'Core');
    const inner = frames.find((f) => f.title === 'Inner');
    if (inner) {
      assert.equal(inner.parentId, core?.id);
      assert.ok(core && core.width * core.height > inner.width * inner.height);
    }
    assert.ok(codes(issues).includes('drawio-edge-to-container'));
    assert.ok(codes(issues).includes('drawio-containers'));
    assert.ok(!codes(issues).includes('drawio-nested-containers'), 'nesting is no longer lost');
    assertRoundTrips(doc);
  });

  it('gives one diagram per page, or one diagram with a tab per page', async () => {
    const file = await readDrawio(fixture('multipage.drawio'));
    assert.equal(file.pages.length, 2);

    const separate = convertDrawio(file, 'separate', 'Shop');
    assert.equal(separate.docs.length, 2);
    assert.deepEqual(separate.docs.map((d) => d.title), ['Shop – Overview', 'Shop – Billing']);
    assert.deepEqual(separate.docs.map((d) => d.nodes.length), [2, 3]);

    const tabs = convertDrawio(file, 'tabs', 'shop');
    assert.equal(tabs.docs.length, 1);
    const doc = tabs.docs[0];
    assert.equal(doc.title, 'Shop');
    assert.deepEqual(pageList(doc).map((p) => p.title), ['Overview', 'Billing']);
    assert.equal(doc.nodes.length, 2);
    assert.equal(doc.pages?.[0].nodes.length, 3);
    assert.equal(doc.pages?.[0].edges.length, 2);
    assert.equal(new Set(pageList(doc).map((p) => p.id)).size, 2);
    assertRoundTrips(doc);
    const back = parseBlueprintJson(serializeBlueprintJson(doc));
    assert.ok(back.ok);
    if (back.ok) assert.deepEqual(pageList(back.doc).map((p) => p.title), ['Overview', 'Billing']);
  });

  it('a file with one page is one diagram in either mode', async () => {
    const file = await readDrawio(fixture('compressed.drawio'));
    assert.equal(convertDrawio(file, 'tabs', 'Jobs').docs[0].pages, undefined);
  });

  it('reads a bare mxGraphModel (.xml)', async () => {
    const file = await readDrawio(
      '<mxGraphModel><root><mxCell id="0"/><mxCell id="1" parent="0"/><mxCell id="a" value="Solo" vertex="1" parent="1"><mxGeometry x="0" y="0" width="100" height="50" as="geometry"/></mxCell></root></mxGraphModel>',
    );
    const { docs } = convertDrawio(file, 'separate', 'Solo');
    assert.equal(docs[0].nodes.length, 1);
  });

  it('reports a page that cannot be read and keeps the others', async () => {
    const file = await readDrawio(
      `<mxfile><diagram name="Bad">!!!not-base64!!!</diagram><diagram name="Good"><mxGraphModel><root><mxCell id="0"/><mxCell id="1" parent="0"/><mxCell id="a" value="A" vertex="1" parent="1"><mxGeometry width="100" height="50" as="geometry"/></mxCell></root></mxGraphModel></diagram></mxfile>`,
    );
    assert.equal(file.pages.length, 1);
    assert.equal(file.pages[0].name, 'Good');
    assert.ok(codes(file.issues).includes('drawio-page-unreadable'));
  });

  it('refuses files that are not draw.io', async () => {
    await assert.rejects(readDrawio('<svg xmlns="http://www.w3.org/2000/svg"/>'), /not a draw\.io file/);
    await assert.rejects(readDrawio('not xml at all'), /no XML content|not valid XML/);
  });

  it('lays out again when shapes are too close at the default size', async () => {
    const cells = Array.from(
      { length: 6 },
      (_, i) => `<mxCell id="n${i}" value="N${i}" vertex="1" parent="1"><mxGeometry x="${i * 20}" y="0" width="100" height="50" as="geometry"/></mxCell>`,
    ).join('');
    const file = await readDrawio(`<mxGraphModel><root><mxCell id="0"/><mxCell id="1" parent="0"/>${cells}</root></mxGraphModel>`);
    const { docs, issues } = convertDrawio(file, 'separate', 'Crowded');
    const nodes = docs[0].nodes;
    for (let a = 0; a < nodes.length; a++) {
      for (let b = a + 1; b < nodes.length; b++) {
        const overlap =
          nodes[a].x < nodes[b].x + nodes[b].width &&
          nodes[b].x < nodes[a].x + nodes[a].width &&
          nodes[a].y < nodes[b].y + nodes[b].height &&
          nodes[b].y < nodes[a].y + nodes[a].height;
        assert.equal(overlap, false);
      }
    }
    assert.ok(codes(issues).includes('drawio-relayout'));
  });
});
