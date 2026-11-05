import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { adoptByGeometry, duplicateFrame, groupIntoFrame, moveFrame, notesInFrames, createFrame } from '../src/core/frameOps.ts';
import { describeDiagram } from '../src/core/describe.ts';
import { frameItems } from '../src/core/outline.ts';
import { buildActionContext, isActionAvailable } from '../src/core/actions.ts';
import { contextMenuCommandIds } from '../src/core/contextMenuItems.ts';
import { importMermaidOrBlueprint } from '../src/core/parser.ts';
import { toggleSelectionLock, isSelectionLocked } from '../src/studio/zOrderLockGroup.ts';
import { createBlankDocument, createNodeFromStencil } from '../src/templates/presets.ts';
import type { DiagramDocument } from '../src/types.ts';

function node(id: string, x: number, y: number) {
  const n = createNodeFromStencil('service', x, y, 0);
  n.id = id;
  n.title = id;
  return n;
}

/** A VPC at (100,100) 600x400 holding "api" and "db", a note and a text label inside it, and a note outside. */
function vpc(): DiagramDocument {
  const doc = createBlankDocument();
  doc.nodes = [node('api', 160, 180), node('db', 420, 180), node('cdn', 900, 180)];
  doc.edges = [
    { id: 'e1', from: 'api', to: 'db', sourcePort: 'auto', targetPort: 'auto', tone: 'blue', route: 'auto', label: 'sql', animated: true },
    { id: 'e2', from: 'cdn', to: 'api', sourcePort: 'auto', targetPort: 'auto', tone: 'blue', route: 'auto', label: 'http', animated: true },
  ];
  doc.notesCards = [
    { id: 'n-in', title: 'Inside', code: 'S1', x: 140, y: 380, items: [{ title: 'a', text: 'b' }] },
    { id: 't-in', title: 'Label', code: '', x: 500, y: 130, items: [], variant: 'text' },
    { id: 'n-out', title: 'Outside', code: 'S2', x: 900, y: 420, items: [{ title: 'a', text: 'b' }] },
  ];
  doc.frames = [createFrame('vpc', { x: 100, y: 100, width: 600, height: 400 }, 'blue', 'VPC')];
  adoptByGeometry(doc);
  return doc;
}

describe('frames, part 2 (D1b): notes and labels move with a frame', () => {
  it('finds the notes and text labels whose middle is inside', () => {
    const doc = vpc();
    assert.deepEqual(notesInFrames(doc, new Set(['vpc'])).map((c) => c.id).sort(), ['n-in', 't-in']);
  });

  it('moving a frame moves them too, and leaves the ones outside', () => {
    const doc = vpc();
    const [apiX, cdnX] = [doc.nodes[0].x, doc.nodes[2].x];
    moveFrame(doc, 'vpc', 32, 16);
    const at = (id: string) => doc.notesCards.find((c) => c.id === id)!;
    assert.deepEqual([at('n-in').x, at('n-in').y], [172, 396]);
    assert.deepEqual([at('t-in').x, at('t-in').y], [532, 146]);
    assert.deepEqual([at('n-out').x, at('n-out').y], [900, 420]);
    assert.deepEqual([doc.nodes[0].x, doc.nodes[2].x], [apiX + 32, cdnX]);
  });

  it('keeps notes on the canvas when a frame is pushed to the corner', () => {
    const doc = vpc();
    moveFrame(doc, 'vpc', -500, -500);
    assert.ok(doc.notesCards.every((c) => c.x >= 0 && c.y >= 0));
    assert.ok(doc.frames![0].x >= 16 && doc.frames![0].y >= 24);
  });
});

describe('frames, part 2 (D1b): group to frame', () => {
  it('draws a frame around the chosen components and notes, and they belong to it', () => {
    const doc = vpc();
    doc.frames = [];
    adoptByGeometry(doc);
    const frame = groupIntoFrame(doc, ['api', 'db'], ['n-in'], 'g1')!;
    assert.ok(frame);
    for (const id of ['api', 'db']) {
      const n = doc.nodes.find((x) => x.id === id)!;
      assert.ok(n.x >= frame.x && n.x + n.width <= frame.x + frame.width, `${id} inside horizontally`);
      assert.equal(n.frameId, 'g1');
    }
    assert.equal(doc.nodes.find((n) => n.id === 'cdn')!.frameId, undefined);
    const note = doc.notesCards.find((c) => c.id === 'n-in')!;
    assert.ok(note.y >= frame.y && note.y + 96 <= frame.y + frame.height, 'the note sits inside the frame');
  });

  it('does nothing for an empty choice', () => {
    const doc = vpc();
    assert.equal(groupIntoFrame(doc, ['nope'], [], 'g'), null);
    assert.equal(doc.frames!.length, 1);
  });

  it('nests inside an existing frame when it fits there', () => {
    const doc = vpc();
    const inner = groupIntoFrame(doc, ['api'], [], 'inner')!;
    assert.equal(inner.parentId, 'vpc');
    assert.equal(doc.nodes[0].frameId, 'inner');
  });
});

describe('frames, part 2 (D1b): duplicate', () => {
  let n = 0;
  const newId = (prefix: string) => `${prefix}-copy${++n}`;

  it('copies the frame with its components, the wires between them, and its notes', () => {
    const doc = vpc();
    const copy = duplicateFrame(doc, 'vpc', newId)!;
    assert.equal(copy.title, 'VPC copy');
    assert.equal(doc.frames!.length, 2);
    assert.equal(doc.nodes.length, 5, 'api and db are copied, cdn is not');
    assert.equal(doc.edges.length, 3, 'only the wire inside the frame is copied, not the one from cdn');
    assert.equal(doc.notesCards.length, 5);
    const copied = doc.nodes.filter((x) => x.frameId === copy.id);
    assert.equal(copied.length, 2);
    assert.ok(copied.every((x) => x.x >= copy.x), 'the copy sits inside its own frame');
    assert.equal(new Set(doc.nodes.map((x) => x.id)).size, doc.nodes.length, 'ids stay unique');
    const wire = doc.edges.find((e) => e.id.startsWith('edge-copy'))!;
    assert.ok(copied.some((x) => x.id === wire.from) && copied.some((x) => x.id === wire.to));
  });

  it('copies nested frames as nested frames, and a locked frame is copied unlocked', () => {
    const doc = vpc();
    doc.frames!.push(createFrame('subnet', { x: 120, y: 140, width: 320, height: 260 }, 'emerald', 'Subnet'));
    doc.frames![0].locked = true;
    adoptByGeometry(doc);
    const copy = duplicateFrame(doc, 'vpc', newId)!;
    assert.equal(copy.locked, undefined);
    const subnetCopy = doc.frames!.find((f) => f.title === 'Subnet' && f.id !== 'subnet')!;
    assert.equal(subnetCopy.parentId, copy.id);
    assert.equal(duplicateFrame(doc, 'missing', newId), null);
  });
});

describe('frames, part 2 (D1b): lock', () => {
  it('locks and unlocks a frame, and an unlocked frame stores no flag', () => {
    const doc = vpc();
    const sel = { type: 'frame', id: 'vpc' } as const;
    assert.equal(isSelectionLocked(doc, sel), false);
    assert.equal(toggleSelectionLock(doc, sel), true);
    assert.equal(doc.frames![0].locked, true);
    assert.equal(toggleSelectionLock(doc, sel), false);
    assert.equal('locked' in doc.frames![0], false);
  });
});

describe('frames, part 2 (D1b): description and outline', () => {
  it('says what each frame holds, and where a nested frame sits', () => {
    const doc = vpc();
    doc.frames!.push(createFrame('subnet', { x: 120, y: 140, width: 320, height: 260 }, 'emerald', 'Subnet'));
    adoptByGeometry(doc);
    const text = describeDiagram(doc);
    assert.match(text, /Frames\n- Frame VPC holds db and frame Subnet\./);
    assert.match(text, /- Frame Subnet, inside VPC, holds api\./);
  });

  it('an empty frame holds nothing, and a file with no frames has no Frames section', () => {
    const doc = vpc();
    doc.frames!.push(createFrame('empty', { x: 20, y: 600, width: 200, height: 120 }, 'rose', 'Spare'));
    assert.match(describeDiagram(doc), /Frame Spare holds nothing\./);
    assert.doesNotMatch(describeDiagram(createBlankDocument()), /Frames/);
  });

  it('the outline has a row per frame, with nested frames under their parent', () => {
    const doc = vpc();
    doc.frames!.push(createFrame('subnet', { x: 120, y: 140, width: 320, height: 260 }, 'emerald', 'Subnet'));
    adoptByGeometry(doc);
    const rows = frameItems(doc);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].label, 'Frame VPC, holds 1 component');
    assert.equal(rows[0].targetId, 'vpc');
    assert.equal(rows[0].children[0].label, 'Frame Subnet, holds 1 component');
    doc.frames![0].locked = true;
    assert.match(frameItems(doc)[0].label, /, locked$/);
    assert.deepEqual(frameItems(createBlankDocument()), []);
  });
});

describe('frames, part 2 (D1b): the registry', () => {
  const ctx = (selection: Parameters<typeof buildActionContext>[0]) => buildActionContext(selection, vpc(), 'design');

  it('Group into Frame needs components or notes selected, in Design only', () => {
    assert.equal(isActionAvailable('edit-group-frame', ctx({ type: 'none' })), false);
    assert.equal(isActionAvailable('edit-group-frame', ctx({ type: 'node', id: 'api' })), true);
    assert.equal(isActionAvailable('edit-group-frame', ctx({ type: 'multi', ids: ['api', 'db'] })), true);
    assert.equal(isActionAvailable('edit-group-frame', ctx({ type: 'edge', id: 'e1' })), false);
    assert.equal(isActionAvailable('edit-group-frame', buildActionContext({ type: 'multi', ids: ['api'] }, vpc(), 'data')), false);
  });

  it('a frame can be duplicated and locked', () => {
    assert.equal(isActionAvailable('edit-duplicate', ctx({ type: 'frame', id: 'vpc' })), true);
    assert.equal(isActionAvailable('edit-lock', ctx({ type: 'frame', id: 'vpc' })), true);
    assert.equal(isActionAvailable('edit-duplicate', ctx({ type: 'edge', id: 'e1' })), false);
  });

  it('the menus offer them', () => {
    assert.ok(contextMenuCommandIds('multi', { grouped: false }).includes('edit-group-frame'));
    const frameMenu = contextMenuCommandIds('frame', { grouped: false });
    assert.ok(frameMenu.includes('edit-duplicate') && frameMenu.includes('edit-lock'));
  });
});

describe('frames, part 2 (D1b): Mermaid subgraphs as frames', () => {
  const source = `flowchart LR
  subgraph cloud [Cloud]
    subgraph vpc [VPC]
      api[API] --> db[(DB)]
    end
    cdn[CDN]
  end
  user([User]) --> cdn
  cdn --> api
`;

  it('makes a frame per subgraph, nested like the source, and no swimlanes', () => {
    const { doc } = importMermaidOrBlueprint(source, { subgraphs: 'frames' });
    assert.equal(doc.zones.length, 0);
    const frames = doc.frames ?? [];
    assert.deepEqual(frames.map((f) => f.title).sort(), ['Cloud', 'VPC']);
    const cloud = frames.find((f) => f.title === 'Cloud')!;
    const inner = frames.find((f) => f.title === 'VPC')!;
    assert.equal(inner.parentId, cloud.id);
    assert.ok(cloud.width * cloud.height > inner.width * inner.height, 'the outer frame is larger');
  });

  it('components belong to the frame of their subgraph', () => {
    const { doc } = importMermaidOrBlueprint(source, { subgraphs: 'frames' });
    const frameOf = (id: string) => doc.frames!.find((f) => f.id === doc.nodes.find((n) => n.id === id)!.frameId)?.title;
    assert.equal(frameOf('api'), 'VPC');
    assert.equal(frameOf('db'), 'VPC');
    assert.equal(frameOf('cdn'), 'Cloud');
    assert.equal(frameOf('user'), undefined);
  });

  it('the other two modes are unchanged', () => {
    assert.equal(importMermaidOrBlueprint(source).doc.zones.length > 0, true);
    assert.equal(importMermaidOrBlueprint(source).doc.frames, undefined);
    assert.equal(importMermaidOrBlueprint(source, { subgraphs: 'levels' }).doc.frames, undefined);
  });

  it('a source with no subgraphs gets no frames', () => {
    assert.equal(importMermaidOrBlueprint('flowchart LR\n a --> b\n', { subgraphs: 'frames' }).doc.frames, undefined);
  });
});
