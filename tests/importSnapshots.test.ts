import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { importMermaidOrBlueprint } from '../src/core/parser.ts';
import { parseBlueprintJson } from '../src/exporter/blueprintJson.ts';

// D8: Mermaid is import only. Removing the Mermaid writers must not change what
// any bundled example imports as. Each hash is the imported document and its
// issues, recorded before the writers were removed.
const EXPECTED: Record<string, string> = {
  'auth-oauth-oidc.blueprint.json': '77b50b9d7815a4ed',
  'cicd-pipeline.blueprint.json': '088056898627ab6b',
  'cloud-data-pipeline.blueprint.json': '80d98e60704d9fd5',
  'event-driven-microservices.blueprint.json': '668a81c34648980b',
  'kubernetes-ingress.blueprint.json': '8da25fcc0249ac32',
  'lumen-relay.blueprint.json': 'a953451e446175d6',
  'plain-mermaid-demo.mmd': 'aa6c2ec40bc0e667',
  'plain-mermaid-demo.mmd (levels)': '7cebac775efd99d5',
  'sample-blueprint.md': '59facbb3cb5ebc92',
  'sample-blueprint.md (levels)': '12ec449fbb94cfe1',
  'three-tier-web.blueprint.json': '0356d972ba8d20b6',
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
