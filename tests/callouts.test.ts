import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createBlankDocument, createNodeFromStencil } from '../src/templates/presets.ts';
import { createCalloutCard } from '../src/core/calloutPlacement.ts';
import { moveInStack, stackOrder, stackZIndices } from '../src/core/stack.ts';
import { calloutCopiesFor, calloutIdsOn, calloutTailAt, calloutTailSide, syncCallouts } from '../src/core/callouts.ts';
import { parseBlueprintJson, serializeBlueprintJson } from '../src/exporter/blueprintJson.ts';
import { importMermaidOrBlueprint, serializeToBlueprintMarkdown } from '../src/core/parser.ts';
import { createShareUrl, decodeSharedDiagramFromHash } from '../src/studio/shareLink.ts';
import { CURRENT_SCHEMA_VERSION } from '../src/core/schema.ts';
import { renderDiagramSvg } from '../src/exporter/diagramSvg.ts';
import { generateStandaloneHtml } from '../src/exporter/standaloneHtml.ts';
import { materializeClip } from '../src/core/clipboardPaste.ts';
import { createNotesCard } from '../src/templates/presets.ts';
import type { DiagramDocument, DiagramNode, DiagramNotesCard } from '../src/types.ts';

function docWithNode(): { doc: DiagramDocument; node: DiagramNode } {
  const doc = createBlankDocument();
  const node = createNodeFromStencil('service', 400, 300, 0);
  node.x = 400;
  node.y = 300;
  node.width = 200;
  doc.nodes = [node];
  doc.edges = [];
  doc.notesCards = [];
  return { doc, node };
}

function addCallout(doc: DiagramDocument, node: DiagramNode, text = 'Maintenance 12am–2am'): DiagramNotesCard {
  const card = createCalloutCard(doc, node, text);
  doc.notesCards.push(card);
  syncCallouts(doc);
  return card;
}

const callouts = (doc: DiagramDocument) => doc.notesCards.filter((c) => c.variant === 'callout');

describe('callout model', () => {
  it('places a new callout above its component, centred', () => {
    const { doc, node } = docWithNode();
    const card = createCalloutCard(doc, node, 'Hi');
    assert.equal(card.variant, 'callout');
    assert.equal(card.anchorId, node.id);
    assert.equal(card.title, 'Hi');
    assert.deepEqual(card.items, []);
    assert.equal(card.x, 400 + 100 - 110);
    assert.equal(card.y, 300 - 12 - 44);
    assert.equal(card.dx, card.x - 400);
    assert.equal(card.dy, card.y - 300);
  });

  it('stacks a second callout above the first', () => {
    const { doc, node } = docWithNode();
    const first = addCallout(doc, node);
    const second = createCalloutCard(doc, node);
    assert.equal(second.y, first.y - 12 - 44);
  });

  it('follows the component when the component moves', () => {
    const { doc, node } = docWithNode();
    const card = addCallout(doc, node);
    const { x, y, dx, dy } = card;
    node.x += 80;
    node.y += 40;
    syncCallouts(doc);
    assert.equal(card.x, x + 80);
    assert.equal(card.y, y + 40);
    assert.equal(card.dx, dx);
    assert.equal(card.dy, dy);
  });

  it('keeps the new offset when the callout is moved', () => {
    const { doc, node } = docWithNode();
    const card = addCallout(doc, node);
    const dx = card.dx!;
    card.x += 50;
    syncCallouts(doc);
    assert.equal(card.dx, dx + 50);
    assert.equal(node.x, 400);
  });

  it('keeps its offset when moved together with its component', () => {
    const { doc, node } = docWithNode();
    const card = addCallout(doc, node);
    const { dx, dy } = card;
    node.x += 30;
    node.y += 30;
    card.x += 30;
    card.y += 30;
    syncCallouts(doc);
    assert.equal(card.dx, dx);
    assert.equal(card.dy, dy);
    assert.equal(card.x, node.x + dx!);
  });

  it('drops a callout whose component is gone', () => {
    const { doc, node } = docWithNode();
    addCallout(doc, node);
    doc.nodes = [];
    syncCallouts(doc);
    assert.equal(callouts(doc).length, 0);
  });

  it('is restored with its component on undo', () => {
    const { doc, node } = docWithNode();
    const card = addCallout(doc, node);
    const snapshot = structuredClone(doc);
    doc.nodes = [];
    syncCallouts(doc);
    assert.equal(callouts(doc).length, 0);
    const restored = structuredClone(snapshot);
    syncCallouts(restored);
    const back = callouts(restored);
    assert.equal(back.length, 1);
    assert.equal(back[0].x, card.x);
    assert.equal(back[0].y, card.y);
  });

  it('follows auto-layout moving the component', () => {
    const { doc, node } = docWithNode();
    const card = addCallout(doc, node);
    node.x = 1000;
    node.y = 800;
    syncCallouts(doc);
    assert.equal(card.x, 1000 + card.dx!);
    assert.equal(card.y, 800 + card.dy!);
  });

  it('picks the tail side facing the component', () => {
    const { doc, node } = docWithNode();
    const card = addCallout(doc, node);
    assert.equal(calloutTailSide(card, node, 220, 44), 'bottom');
    card.x = node.x + node.width + 40;
    card.y = node.y + 20;
    assert.equal(calloutTailSide(card, node, 220, 44), 'left');
  });
});

function docWithCallout(): DiagramDocument {
  const { doc, node } = docWithNode();
  const card = addCallout(doc, node, 'Maintenance 12am–2am');
  card.tone = 'time';
  card.width = 260;
  return doc;
}

const calloutShape = (d: DiagramDocument) =>
  callouts(d).map((c) => ({
    id: c.id,
    title: c.title,
    anchorId: c.anchorId,
    dx: c.dx,
    dy: c.dy,
    x: c.x,
    y: c.y,
    tone: c.tone,
    width: c.width,
    items: c.items.length,
  }));

describe('callout files (schema v15)', () => {
  it('is schema version 15 or later', () => {
    assert.ok(CURRENT_SCHEMA_VERSION >= 15);
  });

  it('round-trips through Blueprint JSON', () => {
    const doc = docWithCallout();
    const back = parseBlueprintJson(serializeBlueprintJson(doc));
    assert.ok(back.ok);
    if (back.ok) assert.deepEqual(calloutShape(back.doc), calloutShape(doc));
  });

  it('round-trips through the markdown code view', () => {
    const doc = docWithCallout();
    const back = importMermaidOrBlueprint(serializeToBlueprintMarkdown(doc)).doc;
    assert.deepEqual(calloutShape(back), calloutShape(doc));
  });

  it('round-trips through a share link', async () => {
    const doc = docWithCallout();
    const { hash } = await createShareUrl(doc, { baseUrl: 'https://example.com/app' });
    const back = await decodeSharedDiagramFromHash(hash);
    assert.ok(back);
    assert.deepEqual(calloutShape(back), calloutShape(doc));
  });

  it('drops a callout whose component is missing on load', () => {
    const doc = docWithCallout();
    callouts(doc)[0].anchorId = 'ghost';
    const back = parseBlueprintJson(serializeBlueprintJson(doc));
    assert.ok(back.ok);
    if (!back.ok) return;
    assert.doesNotThrow(() => syncCallouts(back.doc));
    assert.equal(callouts(back.doc).length, 0);
  });

  it('is not drawn by the plain SVG export', () => {
    const svg = renderDiagramSvg(docWithCallout());
    assert.doesNotMatch(svg, /Maintenance 12am/);
  });

  it('loads a file without callouts unchanged', () => {
    const doc = createBlankDocument();
    doc.notesCards = [createNotesCard(100, 100)];
    const back = parseBlueprintJson(serializeBlueprintJson(doc));
    assert.ok(back.ok);
    if (back.ok) {
      assert.equal(back.doc.notesCards.length, 1);
      assert.equal(back.doc.notesCards[0].variant, undefined);
    }
  });
});

describe('callouts on duplicated components', () => {
  it('copies a component\'s callouts onto its copy, at the same offset', () => {
    const { doc, node } = docWithNode();
    const card = addCallout(doc, node);
    const copies = calloutCopiesFor(doc, new Map([[node.id, 'copy-1']]), new Set(), (p) => `${p}-x`);
    assert.equal(copies.length, 1);
    assert.equal(copies[0].anchorId, 'copy-1');
    assert.equal(copies[0].dx, card.dx);
    assert.notEqual(copies[0].id, card.id);
  });

  it('skips callouts already being copied', () => {
    const { doc, node } = docWithNode();
    const card = addCallout(doc, node);
    assert.equal(calloutCopiesFor(doc, new Map([[node.id, 'c']]), new Set([card.id]), (p) => p).length, 0);
  });

  it('lists the callouts on given components', () => {
    const { doc, node } = docWithNode();
    const card = addCallout(doc, node);
    assert.deepEqual(calloutIdsOn(doc, new Set([node.id])), [card.id]);
    assert.deepEqual(calloutIdsOn(doc, new Set(['other'])), []);
  });
});

describe('callouts from untrusted input', () => {
  const hostile = (): DiagramDocument => {
    const doc = docWithCallout();
    const card = callouts(doc)[0] as unknown as Record<string, unknown>;
    card.tone = 'x" onmouseover="alert(1)';
    card.width = '1;}</style><script>alert(2)</script>';
    return doc;
  };

  it('the HTML export writes only a known tone and a numeric width', () => {
    const html = generateStandaloneHtml(hostile());
    assert.doesNotMatch(html, /onmouseover="alert\(1\)/);
    assert.doesNotMatch(html, /<script>alert\(2\)/);
    assert.match(html, /<aside class="blueprint-spec is-callout"[^>]*data-tone="info"[^>]*--nw: 220;/);
  });

  it('a pasted callout keeps only a known tone and a numeric width', () => {
    const doc = hostile();
    const card = callouts(doc)[0];
    const out = materializeClip({ nodes: [], edges: [], notes: [card], droppedImages: false }, [], (p) => `${p}-n`);
    assert.equal(out.notes[0].tone, undefined);
    assert.equal(out.notes[0].width, undefined);
  });
});

describe('callout placement near the top edge', () => {
  it('goes below a component with no room above it', () => {
    const { doc, node } = docWithNode();
    node.y = 52;
    const card = createCalloutCard(doc, node);
    assert.ok(card.y >= 16, `y ${card.y} is on the sheet`);
    assert.equal(card.y, node.y + node.height + 12);
  });

  it('stacks only over the callouts above it', () => {
    const { doc, node } = docWithNode();
    const below = addCallout(doc, node);
    below.y = node.y + node.height + 12;
    syncCallouts(doc);
    const next = createCalloutCard(doc, node);
    assert.equal(next.y, node.y - 12 - 44, 'the one dragged below does not push the new one onto the component');
  });
});

describe('callout tail position', () => {
  it('lines up with the component\'s centre along the bubble edge', () => {
    const { doc, node } = docWithNode();
    const card = addCallout(doc, node);
    card.x = node.x + node.width / 2 - 40;
    // The tail (10 px wide) is centred on the component's middle: 40 px into the bubble, minus half the tail.
    assert.equal(calloutTailAt(card, node, 'bottom', 220, 44), 35);
  });

  it('follows the component\'s middle on a side tail', () => {
    const { doc, node } = docWithNode();
    const card = addCallout(doc, node);
    card.x = node.x + node.width + 40;
    card.y = node.y + node.height / 2 - 30;
    assert.equal(calloutTailAt(card, node, 'left', 220, 80), 25);
  });

  it('stays inside the bubble when the component\'s middle is beyond its edge', () => {
    const { doc, node } = docWithNode();
    const card = addCallout(doc, node);
    card.x = node.x + node.width;
    assert.equal(calloutTailAt(card, node, 'bottom', 220, 44), 8);
    card.x = node.x - 400;
    assert.equal(calloutTailAt(card, node, 'bottom', 220, 44), 220 - 18);
  });
});

describe('callouts in the front-to-back order', () => {
  const ids = (doc: DiagramDocument) => stackOrder(doc).map((s) => s.item.id);

  it('starts above the components', () => {
    const { doc, node } = docWithNode();
    const card = addCallout(doc, node);
    assert.deepEqual(ids(doc), [node.id, card.id]);
    assert.ok(stackZIndices(doc).get(card.id)! > stackZIndices(doc).get(node.id)!);
  });

  it('Send to Back puts it under its component', () => {
    const { doc, node } = docWithNode();
    const card = addCallout(doc, node);
    assert.equal(moveInStack(doc, 'back', [], [card.id]), true);
    assert.deepEqual(ids(doc), [card.id, node.id]);
  });

  it('Bring to Front puts the component over it again', () => {
    const { doc, node } = docWithNode();
    const card = addCallout(doc, node);
    moveInStack(doc, 'front', [node.id], []);
    assert.deepEqual(ids(doc), [card.id, node.id]);
    moveInStack(doc, 'front', [], [card.id]);
    assert.deepEqual(ids(doc), [node.id, card.id]);
  });
});

describe('callouts in the HTML export order', () => {
  const zOf = (html: string, attr: string) => Number(html.match(new RegExp(`${attr}[^>]*?z-index: (\\d+)`))?.[1] ?? NaN);

  it('draws a callout over its component by default', () => {
    const { doc, node } = docWithNode();
    const card = addCallout(doc, node, 'Over');
    const html = generateStandaloneHtml(doc);
    assert.ok(zOf(html, `data-notes-id="${card.id}"`) > zOf(html, `data-node="${node.id}"`));
  });

  it('draws a callout sent to back under its component but over the wires', () => {
    const { doc, node } = docWithNode();
    const card = addCallout(doc, node, 'Under');
    moveInStack(doc, 'back', [], [card.id]);
    const html = generateStandaloneHtml(doc);
    const callZ = zOf(html, `data-notes-id="${card.id}"`);
    assert.ok(callZ >= 1, 'a z-index above the wires, which have none');
    assert.ok(callZ < zOf(html, `data-node="${node.id}"`));
  });
});
