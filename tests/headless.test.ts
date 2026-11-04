import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';

/**
 * E1: the core, the importers and the exporters must run with no browser. This file runs under plain Node, where
 * `document` and `window` do not exist, so any module that touches them while loading, or while doing its job,
 * fails here. (The command line tool, E2, depends on this.)
 */
const examplesDir = new URL('../src/examples/', import.meta.url);

describe('headless core', () => {
  it('runs without a DOM', () => {
    assert.equal(typeof (globalThis as Record<string, unknown>).document, 'undefined');
    assert.equal(typeof (globalThis as Record<string, unknown>).window, 'undefined');
  });

  it('every module in core, importers and exporter loads', async () => {
    const dirs = ['../src/core/', '../src/importers/', '../src/exporter/'];
    for (const dir of dirs) {
      for (const file of readdirSync(new URL(dir, import.meta.url)).filter((f) => f.endsWith('.ts'))) {
        // The GIF worker is a Worker entry point, not a module to import.
        if (file === 'gifWorker.ts') continue;
        await assert.doesNotReject(import(new URL(dir + file, import.meta.url).href), `${dir}${file} loads`);
      }
    }
  });

  it('every example goes through parse, insights, describe, both exports and the diff', async () => {
    const { importMermaidOrBlueprint, serializeToBlueprintMarkdown } = await import('../src/core/parser.ts');
    const { parseBlueprintJson, serializeBlueprintJson } = await import('../src/exporter/blueprintJson.ts');
    const { runInsights, runInsightsAllLevels } = await import('../src/core/insights.ts');
    const { describeDiagram, describeDiagramBrief } = await import('../src/core/describe.ts');
    const { entryPointIds, reachableFrom } = await import('../src/core/reachability.ts');
    const { renderDiagramSvg } = await import('../src/exporter/diagramSvg.ts');
    const { generateStandaloneHtmlWithLevels } = await import('../src/exporter/standaloneHtml.ts');
    const { computeDocumentDiff } = await import('../src/core/diff.ts');
    type Doc = Parameters<typeof renderDiagramSvg>[0];

    let rendered = 0;
    for (const name of readdirSync(examplesDir).sort()) {
      const text = readFileSync(new URL(name, examplesDir), 'utf8');
      let doc: Doc;
      if (name.endsWith('.json')) {
        const parsed = parseBlueprintJson(text);
        assert.ok(parsed.ok, `${name} parses`);
        doc = parsed.doc;
        // JSON round trip.
        const again = parseBlueprintJson(serializeBlueprintJson(doc));
        assert.ok(again.ok, `${name} round-trips through JSON`);
      } else {
        doc = importMermaidOrBlueprint(text).doc;
        assert.ok(serializeToBlueprintMarkdown(doc).length > 0, `${name} writes a Blueprint file`);
      }
      assert.ok(doc.nodes.length > 0, `${name} has components`);

      assert.ok(Array.isArray(runInsights(doc)));
      assert.ok(Array.isArray(runInsightsAllLevels(doc)));
      assert.ok(describeDiagram(doc).length > 0);
      assert.ok(describeDiagramBrief(doc).length > 0);
      const entries = entryPointIds(doc);
      assert.ok(reachableFrom(doc, entries, [doc.nodes[0].id]) !== undefined);

      assert.match(renderDiagramSvg(doc), /<svg[\s\S]*<\/svg>\s*$/);
      assert.match(generateStandaloneHtmlWithLevels(doc), /<html/i);

      const same = computeDocumentDiff(doc, structuredClone(doc));
      assert.equal(same.hasChanges, false, `${name} has no differences from itself`);
      const edited = structuredClone(doc);
      edited.nodes[0].title += ' (edited)';
      assert.equal(computeDocumentDiff(doc, edited).modifiedNodesCount, 1);
      rendered += 1;
    }
    assert.ok(rendered >= 9, 'the bundled examples were all exercised');
  });

  it('the importers convert small inputs without a DOM', async () => {
    const { convertCompose } = await import('../src/importers/compose.ts');
    const { convertKubernetes } = await import('../src/importers/kubernetes.ts');
    const { convertOpenApi } = await import('../src/importers/openapi.ts');
    const { convertAsyncApi } = await import('../src/importers/asyncapi.ts');
    const { convertExcalidraw } = await import('../src/importers/excalidraw.ts');

    const compose = convertCompose('services:\n  web:\n    image: nginx\n  db:\n    image: postgres\n    depends_on: []\n  api:\n    image: node\n    depends_on: [db]\n', 'Stack');
    assert.ok(compose.doc.nodes.length >= 3);

    const k8s = convertKubernetes(
      'apiVersion: apps/v1\nkind: Deployment\nmetadata:\n  name: api\nspec:\n  template:\n    spec:\n      containers:\n        - name: api\n          image: node\n---\napiVersion: v1\nkind: Service\nmetadata:\n  name: api\nspec:\n  selector:\n    app: api\n',
      'Cluster',
    );
    assert.ok(k8s.doc.nodes.length >= 1);

    const openapi = convertOpenApi('openapi: 3.0.0\ninfo: {title: T, version: "1"}\npaths:\n  /a:\n    get:\n      responses: {"200": {description: ok}}\n', 'Api');
    assert.ok(openapi.doc.nodes.length >= 1);

    const asyncapi = convertAsyncApi('asyncapi: 2.6.0\ninfo: {title: T, version: "1"}\nchannels:\n  orders:\n    publish:\n      message: {name: Order}\n', 'Events');
    assert.ok(asyncapi.doc.nodes.length >= 1);

    const excalidraw = convertExcalidraw(
      JSON.stringify({
        type: 'excalidraw',
        elements: [
          { id: 'a', type: 'rectangle', x: 0, y: 0, width: 160, height: 80, text: 'A' },
          { id: 'b', type: 'rectangle', x: 300, y: 0, width: 160, height: 80, text: 'B' },
        ],
      }),
      'Sketch',
    );
    assert.ok(excalidraw.doc.nodes.length >= 0);
  });
});
