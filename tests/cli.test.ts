import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, readdirSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { checkDiagram, diffComment, diffSummary, formatCheck, loadDiagram, renderHtml, renderJson, renderSvgPages } from '../tools/cliCore.ts';
import { expandStageToFit } from '../src/core/layout.ts';
import { renderDiagramSvg } from '../src/exporter/diagramSvg.ts';
import { generateStandaloneHtmlWithLevels } from '../src/exporter/standaloneHtml.ts';
import { parseBlueprintJson, serializeBlueprintJson } from '../src/exporter/blueprintJson.ts';
import { createBlankDocument, createNodeFromStencil } from '../src/templates/presets.ts';
import type { DiagramDocument } from '../src/types.ts';

const root = new URL('../', import.meta.url);
const examplesDir = new URL('src/examples/', root);
const examples = readdirSync(examplesDir);

const cli = (...args: string[]) =>
  spawnSync(
    process.execPath,
    ['--experimental-strip-types', '--no-warnings', '--import', './tests/register-ts.mjs', 'tools/conduitcraft.ts', ...args],
    { cwd: new URL('.', root), encoding: 'utf8' },
  );

function node(id: string, x = 200) {
  const n = createNodeFromStencil('service', x, 200, 0);
  n.id = id;
  n.title = id;
  return n;
}

function twoNodes(): DiagramDocument {
  const doc = createBlankDocument();
  doc.title = 'Mini';
  doc.nodes = [node('a'), node('b', 520)];
  doc.edges = [{ id: 'e1', from: 'a', to: 'b', sourcePort: 'auto', targetPort: 'auto', tone: 'blue', route: 'auto', label: 'calls', animated: true }];
  return doc;
}

describe('command line (E2): the core', () => {
  it('renders every bundled example to the same SVG, HTML and JSON the browser exports', () => {
    for (const file of examples) {
      const text = readFileSync(new URL(file, examplesDir), 'utf8');
      const loaded = loadDiagram(text);
      assert.ok(loaded.ok, `${file} loads`);
      if (!loaded.ok) continue;
      // The browser fits the stage to the content, then draws the open page.
      const browserDoc = structuredClone(loaded.doc);
      expandStageToFit(browserDoc);
      const [page] = renderSvgPages(loaded.doc);
      assert.equal(page.svg, renderDiagramSvg(browserDoc, undefined, undefined, 'light'), `${file}: svg`);
      assert.match(page.svg, /^<\?xml[^>]*\?>\s*<svg /, `${file}: starts as an SVG`);
      assert.equal(renderHtml(loaded.doc), generateStandaloneHtmlWithLevels(loaded.doc), `${file}: html`);
      assert.equal(renderJson(loaded.doc), serializeBlueprintJson(loaded.doc), `${file}: json`);
      assert.ok(parseBlueprintJson(renderJson(loaded.doc)).ok, `${file}: the json reads back`);
    }
  });

  it('draws one picture per page, each with its own content and title', () => {
    const doc = twoNodes();
    doc.pageTitle = 'Overview';
    doc.pages = [{ id: 'p2', title: 'Data', nodes: [node('db')], edges: [], zones: [], notesCards: [] }];
    const pages = renderSvgPages(doc);
    assert.deepEqual(pages.map((p) => [p.number, p.title]), [[1, 'Overview'], [2, 'Data']]);
    assert.match(pages[1].svg, />db</);
    assert.doesNotMatch(pages[1].svg, />a</);
    assert.equal(renderSvgPages(doc, 'dark')[0].svg === pages[0].svg, false, 'the dark scheme draws differently');
  });

  it('reads a Blueprint file, JSON and Mermaid, and says why it cannot read the rest', () => {
    assert.ok(loadDiagram('flowchart LR\n a --> b').ok);
    assert.ok(loadDiagram(serializeBlueprintJson(twoNodes())).ok);
    const bad = loadDiagram('{ not json');
    assert.equal(bad.ok, false);
    const empty = loadDiagram('hello there');
    assert.equal(empty.ok, false);
    assert.match(empty.ok ? '' : empty.error, /no components/);
  });

  it('check counts errors and warnings, mutes what the file mutes, and covers every page', () => {
    const doc = twoNodes();
    // A synchronous loop is a warning; two components that call each other form one.
    doc.edges.push({ id: 'e2', from: 'b', to: 'a', sourcePort: 'auto', targetPort: 'auto', tone: 'blue', route: 'auto', label: 'back', animated: true });
    const result = checkDiagram(doc);
    assert.ok(result.issues.some((i) => i.code === 'cycle'));
    assert.ok(result.warnings >= 1);
    const muted = structuredClone(doc);
    muted.insights = { muted: ['cycle'] };
    assert.ok(!checkDiagram(muted).issues.some((i) => i.code === 'cycle'));
    const paged = structuredClone(doc);
    paged.pages = [{ id: 'p2', title: 'Second', nodes: [node('x'), node('y', 520)], edges: [{ id: 'f1', from: 'x', to: 'y', sourcePort: 'auto', targetPort: 'auto', tone: 'blue', route: 'auto', label: '', animated: true }, { id: 'f2', from: 'y', to: 'x', sourcePort: 'auto', targetPort: 'auto', tone: 'blue', route: 'auto', label: '', animated: true }], zones: [], notesCards: [] }];
    const all = checkDiagram(paged);
    assert.ok(all.issues.some((i) => i.where.startsWith('Second')), 'an issue on page 2 is found and named by its page');
    assert.match(formatCheck('f.md', all).at(-1)!, /^f\.md: \d+ errors?, \d+ warnings?$/);
  });

  it('summarises a change as a short sentence, per page, and says nothing when nothing changed', () => {
    const base = twoNodes();
    const head = structuredClone(base);
    assert.equal(diffSummary(base, head), 'no changes');
    head.nodes.push(node('c', 840));
    head.edges.push({ id: 'e9', from: 'b', to: 'c', sourcePort: 'auto', targetPort: 'auto', tone: 'blue', route: 'auto', label: 'x', animated: true });
    head.edges = head.edges.filter((e) => e.id !== 'e1');
    assert.equal(diffSummary(base, head), '1 component added, 1 wire added, 1 wire removed');
    head.pages = [{ id: 'p2', title: 'More', nodes: [], edges: [], zones: [], notesCards: [] }];
    assert.match(diffSummary(base, head), /1 page added$/);
    assert.match(diffSummary(null, base), /^new diagram \(2 components\)$/);
    assert.equal(diffSummary(base, null), 'diagram removed');
    assert.equal(diffComment([{ file: 'a.md', summary: 'no changes' }]), '');
    assert.match(diffComment([{ file: 'a.md', summary: '1 component added' }]), /### Diagram changes\n\n- `a\.md`: 1 component added/);
  });
});

describe('command line (E2): the program', () => {
  const dir = mkdtempSync(join(tmpdir(), 'cc-cli-'));
  const lumen = 'src/examples/lumen-relay.blueprint.json';

  it('renders a file to svg, html and json', () => {
    for (const format of ['svg', 'html', 'json']) {
      const out = join(dir, `lumen.${format}`);
      const run = cli('render', lumen, '--format', format, '--out', out);
      assert.equal(run.status, 0, run.stderr);
      assert.ok(existsSync(out));
    }
    assert.match(readFileSync(join(dir, 'lumen.svg'), 'utf8'), /<svg /);
    assert.match(readFileSync(join(dir, 'lumen.html'), 'utf8'), /<!DOCTYPE html>/i);
    assert.equal(JSON.parse(readFileSync(join(dir, 'lumen.json'), 'utf8')).kind, 'conduitcraft.blueprint');
  });

  it('writes several files into a directory, and to standard output with no --out', () => {
    const out = join(dir, 'many');
    const run = cli('render', lumen, 'src/examples/three-tier-web.blueprint.json', '--out-dir', out);
    assert.equal(run.status, 0, run.stderr);
    assert.deepEqual(readdirSync(out).sort(), ['lumen-relay.svg', 'three-tier-web.svg']);
    const stdout = cli('render', lumen, '--format', 'json');
    assert.equal(stdout.status, 0);
    assert.match(stdout.stdout, /conduitcraft\.blueprint/);
  });

  it('writes one svg per page with --page all, and one page with --page N', () => {
    const doc = twoNodes();
    doc.pages = [{ id: 'p2', title: 'Data', nodes: [node('db')], edges: [], zones: [], notesCards: [] }];
    const file = join(dir, 'paged.blueprint.json');
    writeFileSync(file, serializeBlueprintJson(doc));
    const out = join(dir, 'paged');
    assert.equal(cli('render', file, '--page', 'all', '--out-dir', out).status, 0);
    assert.deepEqual(readdirSync(out).sort(), ['paged-1.svg', 'paged-2.svg']);
    assert.match(readFileSync(join(out, 'paged-2.svg'), 'utf8'), />db</);
    const second = cli('render', file, '--page', '2');
    assert.match(second.stdout, />db</);
    assert.equal(cli('render', file, '--page', '3').status, 2);
  });

  it('check exits 0 with warnings, 1 with --strict, and 1 for a file it cannot read', () => {
    assert.equal(cli('check', lumen).status, 0);
    assert.match(cli('check', lumen).stdout, /0 errors, \d+ warnings/);
    assert.equal(cli('check', lumen, '--strict').status, 1);
    const broken = join(dir, 'broken.json');
    writeFileSync(broken, '{ nope');
    const run = cli('check', broken);
    assert.equal(run.status, 1);
    assert.match(run.stderr, /broken\.json/);
    assert.equal(cli('check', join(dir, 'missing.md')).status, 1);
  });

  it('check exits 1 when a rule reports an error', () => {
    // A wire to a component that does not exist is dropped on reading, so use a rule that is an error by level.
    const doc = twoNodes();
    doc.simulations = [{ id: 's', name: 'Slow', tone: 'blue', budgetMs: 10, steps: [{ id: '1', nodes: ['a'], tone: 'blue', label: 'a', trace: 't' }, { id: '2', nodes: ['b'], tone: 'blue', label: 'b', trace: 't' }] }];
    doc.edges[0].latencyMs = 500;
    const file = join(dir, 'slow.blueprint.json');
    writeFileSync(file, serializeBlueprintJson(doc));
    const run = cli('check', file);
    assert.equal(run.status, 1, run.stdout + run.stderr);
    assert.match(run.stdout, /error.*budget/i);
  });

  it('diff prints one line, and treats a missing base as a new diagram', () => {
    const base = join(dir, 'base.json');
    const head = join(dir, 'head.json');
    const a = twoNodes();
    writeFileSync(base, serializeBlueprintJson(a));
    a.nodes.push(node('c', 840));
    writeFileSync(head, serializeBlueprintJson(a));
    assert.equal(cli('diff', base, head, '--name', 'mini.md').stdout, 'mini.md: 1 component added\n');
    assert.match(cli('diff', join(dir, 'nothing.json'), head).stdout, /new diagram \(3 components\)/);
    assert.equal(cli('diff', base).status, 2);
  });

  it('usage mistakes exit 2', () => {
    assert.equal(cli().status, 2);
    assert.equal(cli('render').status, 2);
    assert.equal(cli('render', lumen, '--format', 'png').status, 2);
    assert.equal(cli('render', lumen, lumen, '--out', join(dir, 'x.svg')).status, 2);
    assert.equal(cli('help').status, 0);
  });
});

describe('GitHub Action (E3): the manifest and the workflow', () => {
  it('action.yml and the workflow are valid YAML with the pieces the action needs', async () => {
    const yaml = (await import('js-yaml')).default;
    const action = yaml.load(readFileSync(new URL('action.yml', root), 'utf8')) as Record<string, any>;
    assert.equal(action.runs.using, 'composite');
    assert.ok(['files', 'out-dir', 'check', 'strict', 'comment', 'upload', 'commit-to', 'github-token'].every((k) => k in action.inputs));
    assert.ok(action.runs.steps.some((s: Record<string, unknown>) => String(s.run ?? '').includes('tools/action.sh')));
    const workflow = yaml.load(readFileSync(new URL('.github/workflows/diagrams.yml', root), 'utf8')) as Record<string, any>;
    assert.equal(workflow.jobs.diagrams.steps.at(-1).uses, './');
  });
});

describe('GitHub Action (E3): the script it runs', () => {
  const script = new URL('tools/action.sh', root).pathname;
  const repo = mkdtempSync(join(tmpdir(), 'cc-action-'));
  const git = (...args: string[]) => execFileSync('git', args, { cwd: repo, encoding: 'utf8' });
  const run = (env: Record<string, string>) =>
    spawnSync('bash', [script], { cwd: repo, encoding: 'utf8', env: { ...process.env, ACTION_PATH: new URL('.', root).pathname, ...env } });

  git('init', '-q');
  git('config', 'user.email', 'a@b.c');
  git('config', 'user.name', 'a');
  writeFileSync(join(repo, 'shop.blueprint.md'), readFileSync(new URL('sample-blueprint.md', examplesDir), 'utf8'));
  writeFileSync(join(repo, 'notes.txt'), 'not a diagram');
  git('add', '.');
  git('commit', '-qm', 'init');

  it('checks and renders every matching diagram into the output folder', () => {
    const result = run({ FILES: '*.blueprint.md', OUT_DIR: 'out', COMMENT: 'false' });
    assert.equal(result.status, 0, result.stdout + result.stderr);
    assert.match(result.stdout, /1 diagram/);
    assert.match(result.stdout, /0 errors/);
    assert.deepEqual(readdirSync(join(repo, 'out')).sort(), ['shop.html', 'shop.svg']);
  });

  it('says so and succeeds when nothing matches', () => {
    const result = run({ FILES: '*.nothing', OUT_DIR: 'out2', COMMENT: 'false' });
    assert.equal(result.status, 0);
    assert.match(result.stdout, /No diagrams matched/);
  });

  it('fails the job when a diagram cannot be read, or has a rule error, and not for a warning unless strict', () => {
    writeFileSync(join(repo, 'broken.blueprint.md'), '---\ntitle: [unclosed\n---\n');
    git('add', '.');
    const broken = run({ FILES: '*.blueprint.md', OUT_DIR: 'out3', COMMENT: 'false' });
    assert.equal(broken.status, 1, broken.stdout);
    git('rm', '-qf', 'broken.blueprint.md');
    const strict = run({ FILES: '*.blueprint.md', OUT_DIR: 'out4', COMMENT: 'false', STRICT: 'true' });
    assert.equal(strict.status, 1, 'the sample has warnings');
    const lenient = run({ FILES: '*.blueprint.md', OUT_DIR: 'out5', COMMENT: 'false', CHECK: 'false' });
    assert.equal(lenient.status, 0);
  });

  it('on a pull request, comments with what changed against the base branch', () => {
    const origin = mkdtempSync(join(tmpdir(), 'cc-origin-'));
    execFileSync('git', ['init', '-q', '--bare', origin]);
    const base = twoNodes();
    writeFileSync(join(repo, 'mini.blueprint.json'), serializeBlueprintJson(base));
    git('add', '.');
    git('commit', '-qm', 'add mini');
    git('branch', '-M', 'main');
    git('remote', 'add', 'origin', origin);
    git('push', '-q', 'origin', 'main');
    git('checkout', '-qb', 'feature');
    base.nodes.push(node('c', 840));
    writeFileSync(join(repo, 'mini.blueprint.json'), serializeBlueprintJson(base));
    git('commit', '-qam', 'add c');

    // A stand-in for the GitHub CLI that records the comment it was asked to post.
    const bin = mkdtempSync(join(tmpdir(), 'cc-bin-'));
    const log = join(bin, 'gh.log');
    writeFileSync(join(bin, 'gh'), `#!/usr/bin/env bash\nprintf '%s\\n' "$*" >> "${log}"\nwhile [ $# -gt 0 ]; do if [ "$1" = "--body-file" ]; then cat "$2" >> "${log}"; fi; shift; done\n`, { mode: 0o755 });
    const result = run({
      FILES: '*.blueprint.json',
      OUT_DIR: 'out6',
      CHECK: 'false',
      COMMENT: 'true',
      BASE_REF: 'main',
      PR_NUMBER: '7',
      GH_TOKEN: 'x',
      PATH: `${bin}:${process.env.PATH}`,
    });
    assert.equal(result.status, 0, result.stdout + result.stderr);
    const posted = readFileSync(log, 'utf8');
    assert.match(posted, /pr comment 7/);
    assert.match(posted, /### Diagram changes/);
    assert.match(posted, /- `mini\.blueprint\.json`: 1 component added/);
    assert.ok(!existsSync(join(repo, 'out6', '.comment.md')), 'the comment file is not left in the renders');
  });
});

