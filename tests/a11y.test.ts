import { describe, it } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { readStudioCss } from './studioCss.ts';
import { describeSelection } from '../src/studio/a11y';
import { createBlankDocument } from '../src/templates/presets';
import type { DiagramDocument, DiagramNode, DiagramEdge, DiagramZone, DiagramNotesCard } from '../src/types';

describe('accessibility audit and live region announcements (suggestion 17)', () => {
  it('describes empty selection as cleared', () => {
    const doc = createBlankDocument();
    const desc = describeSelection({ type: 'none' }, doc);
    assert.strictEqual(desc, 'Selection cleared');
  });

  it('describes single node selection with title, kind, status, and coordinates', () => {
    const doc = createBlankDocument();
    const node: DiagramNode = {
      id: 'auth-svc',
      kind: 'service',
      title: 'Auth Service',
      subtitle: 'OAuth2 & OIDC Provider',
      x: 160,
      y: 240,
      status: 'live',
    };
    doc.nodes.push(node);

    const desc = describeSelection({ type: 'node', id: 'auth-svc' }, doc);
    assert.ok(desc.includes('Auth Service'));
    assert.ok(desc.includes('service'));
    assert.ok(desc.includes('live'));
    assert.ok(desc.includes('160, 240'));
  });

  it('describes multi-selection with component count', () => {
    const doc = createBlankDocument();
    const descSingle = describeSelection({ type: 'multi', ids: ['a'] }, doc);
    assert.strictEqual(descSingle, 'Selected 1 component');

    const descMulti = describeSelection({ type: 'multi', ids: ['a', 'b', 'c'] }, doc);
    assert.strictEqual(descMulti, 'Selected 3 components');
  });

  it('describes wire selection with human-friendly node titles', () => {
    const doc = createBlankDocument();
    doc.nodes.push({
      id: 'gateway',
      kind: 'gate',
      title: 'API Gateway',
      subtitle: '',
      x: 0,
      y: 0,
    });
    doc.nodes.push({
      id: 'billing',
      kind: 'service',
      title: 'Billing Core',
      subtitle: '',
      x: 200,
      y: 0,
    });
    const edge: DiagramEdge = {
      id: 'gw-billing',
      from: 'gateway',
      to: 'billing',
      sourcePort: 'right',
      targetPort: 'left',
      tone: 'blue',
      route: 'bezier',
      label: 'gRPC / TLS',
      animated: true,
    };
    doc.edges.push(edge);

    const desc = describeSelection({ type: 'edge', id: 'gw-billing' }, doc);
    assert.ok(desc.includes('API Gateway'));
    assert.ok(desc.includes('Billing Core'));
    assert.ok(desc.includes('gRPC / TLS'));
  });

  it('describes swimlane and note selections', () => {
    const doc = createBlankDocument();
    const zone: DiagramZone = {
      id: 'vpc-zone',
      title: 'Private VPC Subnet',
      x: 50,
      y: 50,
      width: 400,
      height: 300,
      tone: 'emerald',
    };
    const note: DiagramNotesCard = {
      id: 'sla-note',
      title: 'Production SLA Target',
      content: '99.99% availability requirement',
      x: 100,
      y: 100,
    };
    doc.zones.push(zone);
    doc.notesCards.push(note);

    const zoneDesc = describeSelection({ type: 'zone', id: 'vpc-zone' }, doc);
    assert.strictEqual(zoneDesc, 'Selected swimlane Private VPC Subnet');

    const noteDesc = describeSelection({ type: 'notes', id: 'sla-note' }, doc);
    assert.strictEqual(noteDesc, 'Selected note Production SLA Target');
  });

  it('verifies high-contrast ink tokens in shared.css', () => {
    const sharedCss = fs.readFileSync(path.resolve('src/styles/shared.css'), 'utf8');
    assert.ok(sharedCss.includes('--cc-ink-3: #92979C;'), 'graphite hints must stay #92979C');
    assert.ok(sharedCss.includes('--cc-ink-3: #5C626A;'), 'vellum hints must stay #5C626A');
    assert.ok(sharedCss.includes('--cc-ink-2: #B7BBBF;'), 'graphite secondary text must stay #B7BBBF');
    assert.ok(sharedCss.includes('--cc-ink-2: #565C64;'), 'vellum secondary text must stay #565C64');
  });

  it('verifies Level-of-Detail (LoD) CSS rules for low zoom', () => {
    const studioCss = readStudioCss();
    assert.ok(studioCss.includes('#stage-world[data-lod="low"] .node-footer'), 'must hide node footer at low zoom');
    assert.ok(studioCss.includes('#stage-world[data-lod="low"] .node-eyebrow'), 'must hide node eyebrow at low zoom');
    assert.ok(studioCss.includes('#stage-world[data-lod="low"] .node-title'), 'must keep node title prominent at low zoom');
  });

  it('verifies consistent focus-visible outline in studio.css', () => {
    const studioCss = readStudioCss();
    assert.ok(studioCss.includes(':focus-visible {'), 'must declare universal focus-visible outline');
    assert.ok(studioCss.includes('.tray-item:focus-visible'), 'must declare tray item focus ring');
  });

  it('verifies global [hidden] rule inside earliest @layer reset in shared.css and studio.css', () => {
    const sharedCss = fs.readFileSync(path.resolve('src/styles/shared.css'), 'utf8');
    const studioCss = readStudioCss();

    // Both files must declare [hidden] { display: none !important; } in @layer reset
    assert.match(
      sharedCss,
      /@layer\s+reset\s*\{[\s\S]*?\[hidden\]\s*\{[\s\S]*?display:\s*none\s*!important/m,
      'shared.css must declare [hidden] { display: none !important; } in @layer reset',
    );
    assert.match(
      studioCss,
      /@layer\s+reset\s*\{[\s\S]*?\[hidden\]\s*\{[\s\S]*?display:\s*none\s*!important/m,
      'studio.css must declare [hidden] { display: none !important; } in @layer reset',
    );
  });

  it('keeps the status line as the one role="status" hint line, with no dismissible card around it', () => {
    const indexHtml = fs.readFileSync(path.resolve('index.html'), 'utf8');
    assert.match(indexHtml, /<p class="hint-line" id="hud-status-tip" role="status" aria-live="polite">/);
    assert.ok(!indexHtml.includes('hud-coach-card'), 'the coach card is gone');
    assert.ok(!indexHtml.includes('hud-status-card'), 'the status card is gone');
  });

  it('verifies the copy link button starts disabled and the empty-state doors are gone', () => {
    const indexHtml = fs.readFileSync(path.resolve('index.html'), 'utf8');
    assert.doesNotMatch(indexHtml, /id="btn-empty-/, 'first run replaced the empty-state doors (R-08)');
    assert.match(
      indexHtml,
      /<button[^>]*id="btn-copy-share-link"[^>]*disabled/,
      '#btn-copy-share-link must start disabled in index.html',
    );
  });

  it('verifies session recovery banner and save status pill markup structure (items 4 & 6)', () => {
    const indexHtml = fs.readFileSync(path.resolve('index.html'), 'utf8');
    // Session recovery offer banner
    assert.match(
      indexHtml,
      /<div[^>]*id="restore-session-banner"[^>]*hidden/,
      '#restore-session-banner must start with hidden attribute',
    );
    assert.ok(
      indexHtml.includes('id="btn-restore-open"'),
      '#btn-restore-open button must exist in restore banner',
    );
    assert.ok(
      indexHtml.includes('id="btn-restore-discard"'),
      '#btn-restore-discard button must exist in restore banner',
    );

    // Save status indicator beside title
    assert.ok(
      indexHtml.includes('id="save-status-pill"'),
      '#save-status-pill element must exist in title-row',
    );
  });
});
