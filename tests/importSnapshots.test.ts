import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { importMermaidOrBlueprint } from '../src/core/parser.ts';
import { parseBlueprintJson } from '../src/exporter/blueprintJson.ts';

// D8: Mermaid is import only. Removing the Mermaid writers must not change what
// any bundled example imports as. Each hash is the imported document and its
// issues, recorded before the writers were removed. The six reference templates were
// rewritten afterwards (cache, stream, bucket, scheduler and external kinds), so their
// hashes were recorded again then. The flash-sale showcase was added later still. The JSON templates' hashes
// were recorded again after the template tidy-up (swimlane headers, lane widths, wire labels and routes).
const EXPECTED: Record<string, string> = {
  'auth-oauth-oidc.blueprint.json': 'c90610eb114726dd',
  'cicd-pipeline.blueprint.json': '6f390600df15924a',
  'cloud-data-pipeline.blueprint.json': '24b553d084b0c0ab',
  'event-driven-microservices.blueprint.json': '8b75840316f82a87',
  'flash-sale-ticketing.blueprint.json': 'b1240f27e9794ccd',
  'kubernetes-ingress.blueprint.json': '6b3f16ef0edd1df1',
  'lumen-relay.blueprint.json': '552e9bc1cadad255',
  'plain-mermaid-demo.mmd': '5137fcbc31c71e36',
  'plain-mermaid-demo.mmd (levels)': 'f4450146a54c8695',
  'sample-blueprint.md': 'e583e0c1754ef27e',
  'sample-blueprint.md (levels)': '8409b7d4ac0ae029',
  'three-tier-web.blueprint.json': '82a322248f998ea6',
};

const examplesDir = new URL('../src/examples/', import.meta.url);
const digest = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex').slice(0, 16);

function importAll(): Record<string, string> {
  const out: Record<string, string> = {};
  for (const name of readdirSync(examplesDir).sort()) {
    const text = readFileSync(new URL(name, examplesDir), 'utf8');
    if (name.endsWith('.json')) {
      const parsed = parseBlueprintJson(text);
      assert.ok(parsed.ok, `${name} parses`);
      out[name] = digest(parsed.doc);
      continue;
    }
    for (const subgraphs of ['swimlanes', 'levels'] as const) {
      const { doc, issues } = importMermaidOrBlueprint(text, { subgraphs });
      out[subgraphs === 'levels' ? `${name} (levels)` : name] = digest({ doc, issues });
    }
  }
  return out;
}

describe('bundled examples import exactly as before (D8 snapshot)', () => {
  it('matches the recorded import of every example', () => {
    assert.deepStrictEqual(importAll(), EXPECTED);
  });
});
