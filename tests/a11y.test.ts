import { describe, it } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
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

  it('describes boundary zone and notes card selections', () => {
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
    assert.strictEqual(zoneDesc, 'Selected boundary zone Private VPC Subnet');

    const noteDesc = describeSelection({ type: 'notes', id: 'sla-note' }, doc);
    assert.strictEqual(noteDesc, 'Selected notes card Production SLA Target');
  });

  it('verifies high-contrast ink tokens in shared.css', () => {
    const sharedCss = fs.readFileSync(path.resolve('src/styles/shared.css'), 'utf8');
    assert.ok(sharedCss.includes('--wl-ink-muted-dark: #9bb0d0;'), 'ink-muted-dark must use high-contrast #9bb0d0');
    assert.ok(sharedCss.includes('--wl-ink-muted-light: #485973;'), 'ink-muted-light must use high-contrast #485973');
    assert.ok(sharedCss.includes('--wl-ink-secondary-dark: #cbd5e1;'), 'ink-secondary-dark must use high-contrast #cbd5e1');
    assert.ok(sharedCss.includes('--wl-ink-secondary-light: #334155;'), 'ink-secondary-light must use high-contrast #334155');
  });

  it('verifies Level-of-Detail (LoD) CSS rules for low zoom', () => {
    const studioCss = fs.readFileSync(path.resolve('src/styles/studio.css'), 'utf8');
    assert.ok(studioCss.includes('#stage-world[data-lod="low"] .node-footer'), 'must hide node footer at low zoom');
    assert.ok(studioCss.includes('#stage-world[data-lod="low"] .node-eyebrow'), 'must hide node eyebrow at low zoom');
    assert.ok(studioCss.includes('#stage-world[data-lod="low"] .node-title'), 'must keep node title prominent at low zoom');
  });

  it('verifies consistent focus-visible outline in studio.css', () => {
    const studioCss = fs.readFileSync(path.resolve('src/styles/studio.css'), 'utf8');
    assert.ok(studioCss.includes(':focus-visible {'), 'must declare universal focus-visible outline');
    assert.ok(studioCss.includes('.stencil-card:focus-visible'), 'must declare stencil-card focus ring');
  });

  it('verifies global [hidden] rule inside earliest @layer reset in shared.css and studio.css', () => {
    const sharedCss = fs.readFileSync(path.resolve('src/styles/shared.css'), 'utf8');
    const studioCss = fs.readFileSync(path.resolve('src/styles/studio.css'), 'utf8');

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

  it('verifies #hud-status-tip is decoupled from dismissible #hud-coach-card in index.html', () => {
    const indexHtml = fs.readFileSync(path.resolve('index.html'), 'utf8');
    // Ensure #hud-coach-card does not contain #hud-status-tip
    const coachCardMatch = indexHtml.match(/<div[^>]*id="hud-coach-card"[^>]*>([\s\S]*?)<\/div>/);
    assert.ok(coachCardMatch, 'hud-coach-card exists in index.html');
    assert.ok(
      !coachCardMatch[1].includes('id="hud-status-tip"'),
      '#hud-status-tip must not live inside #hud-coach-card so dismissal does not silence status messages',
    );
    assert.ok(
      indexHtml.includes('id="hud-status-tip"'),
      '#hud-status-tip exists in index.html',
    );
  });

  it('verifies #btn-restore-session is gated with hidden attribute and disabled copy link initial state', () => {
    const indexHtml = fs.readFileSync(path.resolve('index.html'), 'utf8');
    assert.match(
      indexHtml,
      /<button[^>]*id="btn-restore-session"[^>]*hidden/,
      '#btn-restore-session must start with hidden attribute in index.html',
    );
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
