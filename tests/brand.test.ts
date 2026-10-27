import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { brandIsDefault, normalizeBrand, normalizeBrandAccent } from '../src/core/brand.ts';
import { importMermaidOrBlueprint, serializeToBlueprintMarkdown } from '../src/core/parser.ts';
import { parseBlueprintJson, serializeBlueprintJson } from '../src/exporter/blueprintJson.ts';
import { generateStandaloneHtml } from '../src/exporter/standaloneHtml.ts';
import { createBlankDocument } from '../src/templates/presets.ts';

const TINY_PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

describe('exported page brand', () => {
  it('keeps a hex color and an image logo, and drops anything else', () => {
    assert.equal(normalizeBrandAccent('#0F766E'), '#0f766e');
    assert.equal(normalizeBrandAccent('#abc'), '#aabbcc');
    assert.equal(normalizeBrandAccent('red'), '');
    const brand = normalizeBrand({ name: '  Northwind  ', accent: '#abc', logo: TINY_PNG });
    assert.deepEqual(brand, { name: 'Northwind', accent: '#aabbcc', logo: TINY_PNG });
    assert.equal(brandIsDefault(brand), false);
    assert.equal(normalizeBrand({ logo: 'https://example.com/logo.png' }).logo, '');
    assert.equal(brandIsDefault(undefined), true);
  });

  it('round-trips through Blueprint Markdown and JSON and paints the export header', () => {
    const doc = createBlankDocument();
    doc.brand = { name: 'Northwind', accent: '#0f766e', logo: TINY_PNG };
    const imported = importMermaidOrBlueprint(serializeToBlueprintMarkdown(doc));
    assert.deepEqual(imported.doc.brand, doc.brand);

    const parsed = parseBlueprintJson(serializeBlueprintJson(doc));
    assert.equal(parsed.ok, true);
    if (!parsed.ok) return;
    assert.deepEqual(parsed.doc.brand, doc.brand);

    const html = generateStandaloneHtml(doc);
    assert.match(html, /data-brand style="--brand-accent: #0f766e"/);
    assert.match(html, /class="brand-name">Northwind</);
    assert.match(html, /class="brand-logo"/);
    assert.match(html, /src="data:image\/png;base64,/);
    assert.equal(
      /<header class="topbar" data-brand/.test(generateStandaloneHtml(createBlankDocument())),
      false,
    );
  });
});
