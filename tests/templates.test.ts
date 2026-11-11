import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  STARTER_TEMPLATES,
  TEMPLATE_CATEGORIES,
  getStarterTemplates,
  getStarterTemplateById,
  loadTemplateRaw,
  renderTemplatePreviewSvg,
  renderTemplateCardHtml,
  renderBlankCanvasCardHtml,
} from '../src/studio/templatesGallery.ts';
import { parseBlueprintJson } from '../src/exporter/blueprintJson.ts';

describe('starter architecture templates gallery', () => {
  it('contains 8 starter blueprints, the showcase first', () => {
    assert.strictEqual(STARTER_TEMPLATES.length, 8);
    const ids = STARTER_TEMPLATES.map((t) => t.id);
    assert.deepStrictEqual(ids, [
      'flash-sale-ticketing',
      'three-tier-web',
      'event-driven-microservices',
      'cloud-data-pipeline',
      'auth-oauth-oidc',
      'kubernetes-ingress',
      'cicd-pipeline',
      'lumen-relay',
    ]);
  });

  it('provides complete metadata for every starter blueprint', async () => {
    for (const template of STARTER_TEMPLATES) {
      assert.ok(template.title.length > 5, `${template.id} has title`);
      assert.ok(template.description.length > 20, `${template.id} has description`);
      assert.ok(template.tag.length > 3, `${template.id} has tag`);
      assert.ok(template.nodesCount > 0, `${template.id} has positive nodes count`);
      assert.ok(template.edgesCount > 0, `${template.id} has positive edges count`);
      assert.ok(template.simulationsCount > 0, `${template.id} has at least 1 simulation scenario`);
      const raw = await loadTemplateRaw(template);
      assert.ok(typeof raw === 'string' && raw.length > 100);
    }
  });

  it('filters starter templates by category', () => {
    const all = getStarterTemplates('all');
    assert.strictEqual(all.length, 8);

    const showcase = getStarterTemplates('showcase');
    assert.deepStrictEqual(showcase.map((t) => t.id), ['flash-sale-ticketing', 'lumen-relay']);

    const cloud = getStarterTemplates('cloud');
    assert.strictEqual(cloud.length, 2);
    assert.ok(cloud.some((t) => t.id === 'three-tier-web'));
    assert.ok(cloud.some((t) => t.id === 'kubernetes-ingress'));

    const security = getStarterTemplates('security');
    assert.strictEqual(security.length, 1);
    assert.strictEqual(security[0].id, 'auth-oauth-oidc');

    const devops = getStarterTemplates('devops');
    assert.strictEqual(devops.length, 1);
    assert.strictEqual(devops[0].id, 'cicd-pipeline');
  });

  it('looks up templates by unique id', () => {
    const found = getStarterTemplateById('event-driven-microservices');
    assert.ok(found);
    assert.strictEqual(found.title, 'Event-Driven Microservices');

    const missing = getStarterTemplateById('nonexistent-template');
    assert.strictEqual(missing, undefined);
  });

  it('validates that every template parses cleanly with matching counts and simulations', async () => {
    for (const template of STARTER_TEMPLATES) {
      const parsed = parseBlueprintJson(await loadTemplateRaw(template));
      assert.strictEqual(parsed.ok, true, `Template ${template.id} parses cleanly`);
      if (parsed.ok) {
        assert.strictEqual(parsed.doc.nodes.length, template.nodesCount, `${template.id} node count matches`);
        assert.strictEqual(parsed.doc.edges.length, template.edgesCount, `${template.id} edge count matches`);
        assert.ok(parsed.doc.simulations.length >= template.simulationsCount, `${template.id} has simulation scenarios`);
        assert.ok(parsed.doc.zones.length > 0, `${template.id} has zones/swimlanes`);
        assert.ok(parsed.doc.stageWidth >= 1600, `${template.id} has wide stage canvas`);
      }
    }
  });

  it('renders vector SVG previews with responsive viewBox and scaling attributes', async () => {
    for (const template of STARTER_TEMPLATES) {
      const svg = renderTemplatePreviewSvg(await loadTemplateRaw(template));
      assert.ok(svg.startsWith('<svg'), `${template.id} preview starts with <svg`);
      assert.ok(svg.endsWith('</svg>'), `${template.id} preview ends with </svg>`);
      assert.ok(svg.includes('viewBox='), `${template.id} preview has viewBox`);
      assert.ok(svg.includes('preserveAspectRatio="xMidYMid meet"'), `${template.id} preview preserves aspect ratio`);
    }
  });

  it('draws thumbnails in the scheme it is given', async () => {
    const raw = await loadTemplateRaw(getStarterTemplateById('three-tier-web')!);
    assert.notEqual(renderTemplatePreviewSvg(raw, 'dark'), renderTemplatePreviewSvg(raw, 'light'));
  });

  it('marks one-way wires so a hovered card can draw them (S9)', async () => {
    const svg = renderTemplatePreviewSvg(await loadTemplateRaw(getStarterTemplateById('three-tier-web')!));
    assert.match(svg, /<path class="tpl-wire" pathLength="100" [^>]*marker-end=/);
  });

  it('generates structured HTML markup for cards, blank canvas, and empty stage shelf', () => {
    const cardHtml = renderTemplateCardHtml(getStarterTemplateById('three-tier-web')!);
    assert.ok(cardHtml.includes('class="template-card"'));
    assert.ok(cardHtml.includes('data-template-id="three-tier-web"'));
    assert.ok(cardHtml.includes('Three-Tier Web Application'));
    assert.ok(cardHtml.includes('btn-use-template'));
    assert.ok(cardHtml.includes('template-preview-frame'), 'preview frame is there to be filled once the JSON loads');

    const blankHtml = renderBlankCanvasCardHtml();
    assert.ok(blankHtml.includes('template-card-blank'));
    assert.ok(blankHtml.includes('data-template-id="blank"'));
    assert.ok(blankHtml.includes('Blank Canvas'));
  });
});
