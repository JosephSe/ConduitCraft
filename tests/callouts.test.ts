import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createBlankDocument, createCalloutCard, createNodeFromStencil } from '../src/templates/presets.ts';
import { calloutTailSide, syncCallouts } from '../src/core/callouts.ts';
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
