import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { coerceFrames } from '../src/core/frames.ts';
import {
  adoptByGeometry,
  createFrame,
  frameAround,
  frameAndDescendantIds,
  moveFrame,
  removeFrame,
} from '../src/core/frameOps.ts';
import { parseBlueprintJson, serializeBlueprintJson } from '../src/exporter/blueprintJson.ts';
import { importMermaidOrBlueprint, serializeToBlueprintMarkdown } from '../src/core/parser.ts';
import { createShareUrl, decodeSharedDiagramFromHash } from '../src/studio/shareLink.ts';
import { createBlankDocument, createNodeFromStencil } from '../src/templates/presets.ts';
import { CURRENT_SCHEMA_VERSION } from '../src/core/schema.ts';
import { renderDiagramSvg } from '../src/exporter/diagramSvg.ts';
import { viewOfLevel, writeLevelBack } from '../src/core/levels.ts';
import type { DiagramDocument } from '../src/types.ts';

/** A VPC holding a subnet holding "api", plus "db" in the VPC only and "cdn" outside everything. */
function sample(): DiagramDocument {
  const doc = createBlankDocument();
  const make = (id: string, x: number, y: number) => {
    const n = createNodeFromStencil('service', x, y, 0);
    n.id = id;
    n.title = id;
    return n;
  };
  doc.nodes = [make('api', 220, 200), make('db', 520, 420), make('cdn', 1100, 80)];
  doc.frames = [
    createFrame('vpc', { x: 100, y: 100, width: 700, height: 500 }, 'emerald', 'VPC'),
    createFrame('subnet', { x: 160, y: 160, width: 300, height: 200 }, 'violet', 'Subnet'),
  ];
  return doc;
}

const shape = (d: DiagramDocument) => ({
  frames: (d.frames ?? []).map((f) => `${f.id}|${f.title}|${f.tone}|${f.x},${f.y}|${f.width}x${f.height}|${f.parentId ?? ''}`),
  owners: d.nodes.map((n) => `${n.id}:${n.frameId ?? ''}`),
});

describe('frames (F-09)', () => {
  it('is schema version 10 or later', () => {
    assert.ok(CURRENT_SCHEMA_VERSION >= 10);
  });

  it('gives each component to the smallest frame that holds its centre, and nests frames', () => {
    const doc = sample();
    assert.equal(adoptByGeometry(doc), true);
    assert.deepEqual(
      doc.nodes.map((n) => n.frameId),
      ['subnet', 'vpc', undefined],
    );
    assert.equal(doc.frames?.find((f) => f.id === 'subnet')?.parentId, 'vpc');
    assert.equal(doc.frames?.find((f) => f.id === 'vpc')?.parentId, undefined);
    assert.equal(adoptByGeometry(doc), false, 'a second pass changes nothing');
  });

  it('moves a frame together with the frames and components it owns, and nothing else', () => {
    const doc = adopted();
    const at = (id: string) => doc.nodes.find((n) => n.id === id)!;
    const before = { api: at('api').x, db: at('db').y, cdn: at('cdn').x, subnet: doc.frames!.find((f) => f.id === 'subnet')!.x };
    moveFrame(doc, 'vpc', 50, 30);
    assert.equal(at('api').x, before.api + 50);
    assert.equal(at('db').y, before.db + 30);
    assert.equal(at('cdn').x, before.cdn);
    assert.equal(doc.frames!.find((f) => f.id === 'subnet')!.x, before.subnet + 50);
  });

  it('moving a frame by itself leaves the frame around it where it is', () => {
    const doc = adopted();
    const x = (id: string) => doc.nodes.find((n) => n.id === id)!.x;
    const [api, db] = [x('api'), x('db')];
    moveFrame(doc, 'subnet', 40, 0);
    assert.equal(doc.frames?.find((f) => f.id === 'vpc')?.x, 100);
    assert.equal(x('db'), db);
    assert.equal(x('api'), api + 40);
  });

  it('keeps everything on the canvas when a frame is pushed past the edge', () => {
    const doc = sample();
    adoptByGeometry(doc);
    moveFrame(doc, 'vpc', -5000, -5000);
    assert.ok(doc.frames!.every((f) => f.x >= 16 && f.y >= 24));
    assert.ok(doc.nodes.filter((n) => n.frameId).every((n) => n.x >= 16 && n.y >= 24));
    assert.equal(doc.frames!.find((f) => f.id === 'subnet')!.x - doc.frames!.find((f) => f.id === 'vpc')!.x, 60);
  });

  it('removing a frame hands its components and frames to the one around it', () => {
    const doc = sample();
    adoptByGeometry(doc);
    removeFrame(doc, 'subnet');
    assert.equal(doc.nodes.find((n) => n.id === 'api')?.frameId, 'vpc');
    removeFrame(doc, 'vpc');
    assert.equal(doc.nodes.find((n) => n.id === 'api')?.frameId, undefined);
    assert.equal(doc.frames?.length, 0);
  });

  it('collects a frame and everything inside it', () => {
    const ids = frameAndDescendantIds(adopted().frames!, 'vpc');
    assert.deepEqual([...ids].sort(), ['subnet', 'vpc']);
  });

  it('draws a frame around a group of components with room for the title', () => {
    const rect = frameAround([{ x: 200, y: 200, width: 100, height: 80 }, { x: 400, y: 260, width: 100, height: 80 }]);
    assert.ok(rect.x < 200 && rect.y < 200 - 28 && rect.x + rect.width > 500 && rect.y + rect.height > 340);
  });

  it('reads hostile frames safely: bad ids, repeats, cycles and tiny sizes', () => {
    const frames = coerceFrames([
      { id: 'a', x: 1, y: 2, width: 1, height: 1, parentId: 'b' },
      { id: 'b', parentId: 'a' },
      { id: 'a', title: 'twice' },
      { id: '', title: 'no id' },
      'not a frame',
      { id: 'c', parentId: 'missing', tone: 'chartreuse' },
    ]);
    assert.deepEqual(frames.map((f) => f.id), ['a', 'b', 'c']);
    assert.ok(frames.every((f) => f.width >= 96 && f.height >= 72));
    assert.ok(frames.find((f) => f.id === 'c')?.parentId === undefined);
    assert.equal(frames.find((f) => f.id === 'c')?.tone, 'blue');
    const cyclic = frames.filter((f) => f.id === 'a' || f.id === 'b').map((f) => f.parentId);
    assert.ok(cyclic.includes(undefined), 'a cycle is broken');
  });
});

function adopted(): DiagramDocument {
  const doc = sample();
  adoptByGeometry(doc);
  return doc;
}

describe('frames survive every way out and back in', () => {
  it('the SVG export draws every frame with its title, the larger one first', () => {
    const svg = renderDiagramSvg(adopted());
    assert.ok(svg.indexOf('>VPC<') > 0 && svg.indexOf('>VPC<') < svg.indexOf('>Subnet<'));
    assert.match(svg, /stroke-dasharray="6 5"/);
  });

  it('Blueprint JSON', () => {
    const doc = adopted();
    const back = parseBlueprintJson(serializeBlueprintJson(doc));
    assert.ok(back.ok);
    if (back.ok) assert.deepEqual(shape(back.doc), shape(doc));
  });

  it('the Blueprint file (YAML)', () => {
    const doc = adopted();
    const back = importMermaidOrBlueprint(serializeToBlueprintMarkdown(doc)).doc;
    assert.deepEqual(shape(back), shape(doc));
  });

  it('the share link', async () => {
    const doc = adopted();
    const { hash } = await createShareUrl(doc, { baseUrl: 'https://example.com/app' });
    const back = await decodeSharedDiagramFromHash(hash);
    assert.ok(back);
    assert.deepEqual(shape(back), shape(doc));
  });

  it('a frame inside a nested level, through JSON, the Blueprint file and level editing', () => {
    const root = createBlankDocument();
    const outer = createNodeFromStencil('service', 200, 200, 0);
    outer.id = 'outer';
    const inner = adopted();
    outer.child = { nodes: inner.nodes, edges: [], zones: [], notesCards: [], frames: inner.frames };
    root.nodes = [outer];

    const viaJson = parseBlueprintJson(serializeBlueprintJson(root));
    assert.ok(viaJson.ok);
    if (viaJson.ok) assert.deepEqual(viaJson.doc.nodes[0].child?.frames?.map((f) => f.id), ['vpc', 'subnet']);

    const viaYaml = importMermaidOrBlueprint(serializeToBlueprintMarkdown(root)).doc;
    assert.deepEqual(viaYaml.nodes[0].child?.frames?.map((f) => f.id), ['vpc', 'subnet']);
    assert.equal(viaYaml.frames, undefined, 'the root has no frames of its own');

    const view = viewOfLevel(root, ['outer']);
    assert.equal(view.frames?.length, 2);
    view.frames = [];
    writeLevelBack(root, ['outer'], view);
    assert.equal(root.nodes[0].child?.frames, undefined);
  });

  it('a component naming a frame that does not exist loses the reference', () => {
    const doc = adopted();
    doc.nodes[0].frameId = 'ghost';
    const back = parseBlueprintJson(serializeBlueprintJson(doc));
    assert.ok(back.ok);
    if (back.ok) assert.equal(back.doc.nodes[0].frameId, undefined);
  });

  it('a document saved before frames existed opens with none', () => {
    const doc = createBlankDocument();
    const back = parseBlueprintJson(
      JSON.stringify({ kind: 'conduitcraft.blueprint', version: 9, document: { ...doc, nodes: sample().nodes } }),
    );
    assert.ok(back.ok);
    if (back.ok) {
      assert.equal(back.doc.frames, undefined);
      assert.ok(back.doc.nodes.every((n) => n.frameId === undefined));
    }
  });
});
