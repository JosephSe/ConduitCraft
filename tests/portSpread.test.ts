import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { routeDiagramEdges } from '../src/core/layout.ts';
import { computePortOffsets } from '../src/core/portSpread.ts';
import { parseBlueprintJson, serializeBlueprintJson } from '../src/exporter/blueprintJson.ts';
import { createBlankDocument, createNodeFromStencil } from '../src/templates/presets.ts';

describe('shared-track port spreading (V4 MP3)', () => {
  it('keeps a level wire straight and steps two angled wires 14 px apart on either side', () => {
    const doc = createBlankDocument();
    const hub = createNodeFromStencil('service', 100, 300, 0);
    const up = createNodeFromStencil('service', 520, 120, 1);
    const level = createNodeFromStencil('service', 520, 300, 2);
    const down = createNodeFromStencil('service', 520, 480, 3);
    doc.nodes = [hub, up, level, down];
    doc.edges = [
      { id: 'e-up', from: hub.id, to: up.id, sourcePort: 'auto', targetPort: 'auto', tone: 'blue', route: 'auto', label: '', animated: true },
      { id: 'e-lvl', from: hub.id, to: level.id, sourcePort: 'auto', targetPort: 'auto', tone: 'emerald', route: 'auto', label: '', animated: true },
      { id: 'e-dn', from: hub.id, to: down.id, sourcePort: 'auto', targetPort: 'auto', tone: 'rose', route: 'auto', label: '', animated: true },
    ];

    const routed = new Map(routeDiagramEdges(doc).map((e) => [e.id, e]));
    const hubMidY = Math.round(hub.y + hub.height / 2);
    const rUp = routed.get('e-up')!;
    const rLvl = routed.get('e-lvl')!;
    const rDn = routed.get('e-dn')!;

    assert.equal(rLvl.startPoint[1], hubMidY, 'level wire keeps the centerline');
    assert.equal(rLvl.endPoint[1], hubMidY, 'level wire stays completely straight');
    assert.equal(rLvl.startPoint[1] - rUp.startPoint[1], 14, 'upper wire steps 14 px above center');
    assert.equal(rDn.startPoint[1] - rLvl.startPoint[1], 14, 'lower wire steps 14 px below center');
  });

  it('keeps a level wire on center when sharing a side with one angled wire', () => {
    const offsets = computePortOffsets([
      { key: 'a|src', nodeId: 'a', side: 'right', span: 142, delta: 0 },
      { key: 'b|src', nodeId: 'a', side: 'right', span: 142, delta: 160 },
    ]);
    assert.equal(offsets.get('a|src'), 0);
    assert.equal(Math.round(offsets.get('b|src')! * 142), 14);
  });

  it('leaves a lone wire centered with zero offset', () => {
    const offsets = computePortOffsets([
      { key: 'only|src', nodeId: 'a', side: 'right', span: 142, delta: 120 },
    ]);
    assert.equal(offsets.size, 0);
  });

  it('never mutates saved ports so open and save is byte-identical', () => {
    const doc = createBlankDocument();
    const hub = createNodeFromStencil('service', 100, 300, 0);
    const up = createNodeFromStencil('service', 520, 120, 1);
    const level = createNodeFromStencil('service', 520, 300, 2);
    const down = createNodeFromStencil('service', 520, 480, 3);
    doc.nodes = [hub, up, level, down];
    doc.edges = [
      { id: 'e-up', from: hub.id, to: up.id, sourcePort: 'auto', targetPort: 'auto', tone: 'blue', route: 'auto', label: '', animated: true },
      { id: 'e-lvl', from: hub.id, to: level.id, sourcePort: 'auto', targetPort: 'auto', tone: 'emerald', route: 'auto', label: '', animated: true },
      { id: 'e-dn', from: hub.id, to: down.id, sourcePort: 'auto', targetPort: 'auto', tone: 'rose', route: 'auto', label: '', animated: true },
    ];

    const before = serializeBlueprintJson(doc);
    const parsed = parseBlueprintJson(before);
    assert.ok(parsed.ok);
    if (!parsed.ok) return;
    const beforeRoute = serializeBlueprintJson(parsed.doc);
    routeDiagramEdges(parsed.doc);
    const afterRoute = serializeBlueprintJson(parsed.doc);
    assert.equal(afterRoute, beforeRoute);
  });
});
