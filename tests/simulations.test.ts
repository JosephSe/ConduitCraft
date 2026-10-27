import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { getEffectiveSimulations } from '../src/core/layout.ts';
import { createBlankDocument, createNodeFromStencil } from '../src/templates/presets.ts';

describe('simulation scenarios', () => {
  it('uses authored scenarios until the list is cleared', () => {
    const doc = createBlankDocument();
    const actor = createNodeFromStencil('actor', 40, 40, 0);
    const service = createNodeFromStencil('service', 360, 40, 1);
    doc.nodes.push(actor, service);
    doc.edges.push({
      id: 'wire-1',
      from: actor.id,
      to: service.id,
      sourcePort: 'right',
      targetPort: 'left',
      tone: 'emerald',
      route: 'straight',
      label: 'Events',
      animated: true,
    });

    const generated = getEffectiveSimulations(doc);
    assert.equal(doc.simulations.length, 0);
    assert.equal(generated[0]?.id, 'auto-primary');
    assert.ok(generated[0]?.steps.some((step) => step.nodes.includes(service.id)));

    doc.simulations = structuredClone(generated);
    doc.simulations[0].name = 'Checkout';
    doc.simulations[0].steps[0].label = 'START';
    const saved = getEffectiveSimulations(doc);
    assert.equal(saved, doc.simulations);
    assert.equal(saved[0].name, 'Checkout');
    assert.equal(saved[0].steps[0].label, 'START');

    doc.simulations = [];
    assert.equal(getEffectiveSimulations(doc)[0]?.id, 'auto-primary');
    assert.equal(getEffectiveSimulations(doc)[0]?.name, 'Simulate Primary Flow');
  });
});
