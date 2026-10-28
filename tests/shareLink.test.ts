import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  compressStringToBase64Url,
  decompressBase64UrlToString,
  stripDocImages,
  createShareUrl,
  decodeSharedDiagramFromHash,
  SHARE_HASH_PREFIX,
  ALT_HASH_PREFIX,
} from '../src/studio/shareLink.ts';
import { parseBlueprintJson } from '../src/exporter/blueprintJson.ts';
import { createBlankDocument } from '../src/templates/presets.ts';
import type { DiagramDocument } from '../src/types.ts';

describe('shareable link (diagram in URL hash)', () => {
  it('compresses and decompresses text using native Deflate and Base64URL', async () => {
    const original = JSON.stringify({
      title: 'Distributed System Topology',
      nodes: [{ id: 'alpha', title: 'Service Alpha' }],
      zones: [{ id: 'z1', title: 'Edge Zone' }],
    });

    const compressed = await compressStringToBase64Url(original);
    assert.ok(typeof compressed === 'string', 'compressed result is string');
    assert.ok(compressed.length > 0, 'compressed string is not empty');
    assert.ok(!compressed.includes('+'), 'no plus signs in base64url');
    assert.ok(!compressed.includes('/'), 'no slashes in base64url');
    assert.ok(!compressed.includes('='), 'no padding equals in base64url');

    const decompressed = await decompressBase64UrlToString(compressed);
    assert.strictEqual(decompressed, original, 'decompressed text matches original exactly');
  });

  it('strips custom image data URLs from brand and nodes when requested', () => {
    const doc: DiagramDocument = {
      ...createBlankDocument(),
      title: 'App With Images',
      brand: {
        name: 'Brand',
        accent: '#2563eb',
        logo: 'data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=',
      },
      nodes: [
        {
          id: 'n1',
          kind: 'service',
          accent: 'blue',
          title: 'Node 1',
          subtitle: '',
          eyebrow: '',
          footerLeft: '',
          chip: '',
          zoneLabel: '',
          interfaceLabel: '',
          summary: '',
          metrics: [],
          code: '',
          x: 10,
          y: 20,
          width: 200,
          height: 100,
          iconImage: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
        },
      ],
    };

    const stripped = stripDocImages(doc);
    assert.strictEqual(stripped.brand.logo, '', 'brand logo was stripped');
    assert.strictEqual(stripped.nodes[0].iconImage, undefined, 'node iconImage was stripped');
    assert.strictEqual(stripped.nodes[0].title, 'Node 1', 'node title remains intact');
  });

  it('generates a complete shareable link with size metrics', async () => {
    const doc: DiagramDocument = {
      ...createBlankDocument(),
      title: 'Payment Gateway Mesh',
      nodes: [
        {
          id: 'pay-1',
          kind: 'service',
          accent: 'emerald',
          title: 'Payment Orchestrator',
          subtitle: 'Go gRPC',
          eyebrow: 'PCI TIER',
          footerLeft: '',
          chip: 'Active',
          zoneLabel: 'Processing',
          interfaceLabel: '',
          summary: 'Handles credit card charge authorization and capture.',
          metrics: [{ label: 'QPS', value: '1.2k' }],
          code: '',
          x: 100,
          y: 200,
          width: 220,
          height: 110,
        },
      ],
      edges: [],
    };

    const result = await createShareUrl(doc, { baseUrl: 'https://conduitcraft.app/editor' });
    assert.ok(result.url.startsWith('https://conduitcraft.app/editor#share='), 'URL starts with baseUrl and #share=');
    assert.ok(result.hash.startsWith(SHARE_HASH_PREFIX), 'hash starts with #share=');
    assert.ok(result.rawBytes > result.compressedBytes, 'compression achieved smaller byte count');
    assert.strictEqual(result.isLarge, false, 'simple diagram is under 8KB limit');
  });

  it('decodes shared diagram from URL hash back to DiagramDocument', async () => {
    const doc: DiagramDocument = {
      ...createBlankDocument(),
      title: 'Decoded Architecture',
      nodes: [
        {
          id: 'auth-svc',
          kind: 'gate',
          accent: 'violet',
          title: 'OAuth IdP',
          subtitle: 'OIDC Server',
          eyebrow: 'SECURITY',
          footerLeft: '',
          chip: 'Zero Trust',
          zoneLabel: 'Identity',
          interfaceLabel: '',
          summary: 'Issues RS256 signed access tokens.',
          metrics: [],
          code: '',
          x: 300,
          y: 150,
          width: 240,
          height: 110,
        },
      ],
      edges: [],
    };

    const { hash } = await createShareUrl(doc);
    const decoded = await decodeSharedDiagramFromHash(hash);
    assert.ok(decoded !== null, 'decoded document is non-null');
    assert.strictEqual(decoded.title, 'Decoded Architecture');
    assert.strictEqual(decoded.nodes.length, 1);
    assert.strictEqual(decoded.nodes[0].id, 'auth-svc');
    assert.strictEqual(decoded.nodes[0].title, 'OAuth IdP');
  });

  it('supports alternative prefix and rejects invalid or malformed hashes gracefully', async () => {
    const doc = createBlankDocument();
    doc.title = 'Alt Prefix Test';
    const { hash } = await createShareUrl(doc);
    const altHash = hash.replace(SHARE_HASH_PREFIX, ALT_HASH_PREFIX);

    const decoded = await decodeSharedDiagramFromHash(altHash);
    assert.ok(decoded !== null, 'alt prefix #blueprint= decoded successfully');
    assert.strictEqual(decoded.title, 'Alt Prefix Test');

    const empty = await decodeSharedDiagramFromHash('');
    assert.strictEqual(empty, null);

    const unrelated = await decodeSharedDiagramFromHash('#section-heading');
    assert.strictEqual(unrelated, null);

    const malformed = await decodeSharedDiagramFromHash('#share=!!!not-base64url!!!');
    assert.strictEqual(malformed, null);
  });

  it('performs full compress -> decompress round-trip on multi-node diagram with unicode without deadlock', async () => {
    const doc: DiagramDocument = {
      ...createBlankDocument(),
      title: 'Global Payment & Telemetry ⚡️',
      systemTag: 'PAY-PROD-V2',
      statusLabel: 'HEALTHY · 99.99%',
      nodes: [
        {
          id: 'edge-gateway',
          kind: 'gate',
          accent: 'blue',
          title: 'Edge Proxy 🌐',
          subtitle: 'Envoy / TLS 1.3',
          eyebrow: 'PERIMETER',
          footerLeft: 'eu-west-1',
          chip: 'Active',
          zoneLabel: 'DMZ',
          interfaceLabel: ':443',
          summary: 'Terminates client mTLS connections and handles rate-limiting.',
          metrics: [{ label: 'p99', value: '4.2ms' }],
          code: 'fn route() {}',
          x: 120,
          y: 100,
          width: 240,
          height: 120,
        },
        {
          id: 'auth-vault',
          kind: 'store',
          accent: 'violet',
          title: 'HSM Vault 🔐',
          subtitle: 'Key Management',
          eyebrow: 'SECURITY',
          footerLeft: 'FIPS 140-3',
          chip: 'Zero Trust',
          zoneLabel: 'Core Vault',
          interfaceLabel: ':8200',
          summary: 'Stores master decryption keys.',
          metrics: [{ label: 'Keys', value: '1,024' }],
          code: '',
          x: 480,
          y: 100,
          width: 240,
          height: 120,
        },
      ],
      edges: [
        {
          id: 'gw-vault-wire',
          from: 'edge-gateway',
          to: 'auth-vault',
          sourcePort: 'right',
          targetPort: 'left',
          tone: 'violet',
          route: 'bezier',
          label: 'gRPC mTLS / RS256',
          animated: true,
        },
      ],
      zones: [
        {
          id: 'zone-dmz',
          title: 'Public Perimeter Zone',
          x: 80,
          y: 60,
          width: 320,
          height: 200,
          tone: 'blue',
        },
      ],
      notesCards: [
        {
          id: 'note-compliance',
          title: 'PCI-DSS 4.0 Audit',
          content: 'Audit passed without non-conformities.',
          x: 80,
          y: 300,
        },
      ],
    };

    const shareResult = await createShareUrl(doc);
    assert.ok(shareResult.url.includes(SHARE_HASH_PREFIX), 'URL contains share prefix');
    assert.ok(shareResult.compressedBytes > 0, 'URL contains compressed bytes');

    // Decode back from hash
    const decoded = await decodeSharedDiagramFromHash(shareResult.hash);
    assert.ok(decoded !== null, 'Decoded document must not be null');
    assert.strictEqual(decoded.title, doc.title);
    assert.strictEqual(decoded.systemTag, doc.systemTag);
    assert.strictEqual(decoded.statusLabel, doc.statusLabel);
    assert.strictEqual(decoded.nodes.length, 2);
    assert.strictEqual(decoded.nodes[0].title, 'Edge Proxy 🌐');
    assert.strictEqual(decoded.nodes[1].title, 'HSM Vault 🔐');
    assert.strictEqual(decoded.edges.length, 1);
    assert.strictEqual(decoded.edges[0].label, 'gRPC mTLS / RS256');
    assert.strictEqual(decoded.zones.length, 1);
    assert.strictEqual(decoded.zones[0].title, 'Public Perimeter Zone');
    assert.strictEqual(decoded.notesCards.length, 1);
    assert.strictEqual(decoded.notesCards[0].title, 'PCI-DSS 4.0 Audit');
  });
});
