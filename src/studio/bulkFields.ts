/**
 * Shared fields for a multi-selection (F-29): kind, shape, status and tags for the selected components, colour and
 * sync/async for the selected wires. Each change is one undo step. Loaded on demand by the inspector.
 */
import {
  addTag,
  removeTag,
  setKind,
  setQueueMaxDepth,
  setQueueOrdering,
  setShape,
  setStatus,
  setWireSync,
  setWireTone,
} from '../core/appearance';
import { NODE_SHAPE_LABELS, NODE_SHAPES } from '../core/nodeStyle';
import { STREAM_TONE_OPTIONS, kindStencils } from '../templates/presets';
import type { ComponentStatus, DiagramEdge, DiagramNode, NodeKind, NodeShape, QueueOrdering, StreamTone, WireSync } from '../types';
import { app, mutateWithHistory } from './state';
import { renderAll } from './render';

const STATUSES: Array<[ComponentStatus | '', string]> = [
  ['', 'No status'],
  ['planned', 'Planned'],
  ['live', 'Live'],
  ['at-risk', 'At risk'],
  ['deprecated', 'Deprecated'],
];

function row(label: string, control: HTMLElement): HTMLElement {
  const wrap = document.createElement('label');
  wrap.className = 'bulk-row';
  const text = document.createElement('span');
  text.className = 'field-label';
  text.textContent = label;
  wrap.append(text, control);
  return wrap;
}

/** A select that starts on "Change…" and applies the choice when it is picked, then returns to "Change…". */
function chooser(label: string, options: Array<[string, string]>, apply: (value: string) => boolean): HTMLElement {
  const select = document.createElement('select');
  select.className = 'field';
  select.setAttribute('aria-label', label);
  const first = new Option('Change…', '');
  first.disabled = true;
  select.add(first);
  for (const [value, text] of options) select.add(new Option(text, value === '' ? '__none' : value));
  select.selectedIndex = 0;
  select.addEventListener('change', () => {
    const value = select.value === '__none' ? '' : select.value;
    select.selectedIndex = 0;
    if (mutateWithHistory(() => apply(value))) renderAll(true);
  });
  return row(label, select);
}

export function mountBulkFields(host: HTMLElement, nodeIds: string[], edgeIds: string[]): void {
  const nodes = (): DiagramNode[] => app.doc.nodes.filter((n) => nodeIds.includes(n.id));
  const edges = (): DiagramEdge[] => app.doc.edges.filter((e) => edgeIds.includes(e.id));
  host.replaceChildren();

  const heading = document.createElement('span');
  heading.className = 'section-heading';
  heading.textContent = 'Edit shared fields';
  host.appendChild(heading);

  if (nodeIds.length > 0) {
    host.append(
      chooser('Kind', kindStencils().map((s) => [s.kind, s.paletteTitle]), (v) => setKind(nodes(), v as NodeKind)),
      chooser('Shape', NODE_SHAPES.map((s) => [s, NODE_SHAPE_LABELS[s]]), (v) => setShape(nodes(), v as NodeShape)),
      chooser('Status', STATUSES, (v) => setStatus(nodes(), (v || undefined) as ComponentStatus | undefined)),
    );
    // Queue settings (K1) are offered only when every selected component is a queue.
    if (nodes().length > 0 && nodes().every((n) => n.kind === 'queue')) {
      const depth = document.createElement('input');
      depth.type = 'number';
      depth.min = '1';
      depth.max = '9999';
      depth.step = '1';
      depth.className = 'field';
      depth.placeholder = 'Unbounded';
      depth.setAttribute('aria-label', 'Max depth for the selected queues');
      depth.addEventListener('change', () => {
        const n = Math.floor(Number(depth.value));
        const next = depth.value.trim() === '' || !Number.isFinite(n) ? undefined : n;
        if (mutateWithHistory(() => setQueueMaxDepth(nodes(), next))) renderAll(true);
      });
      host.append(
        chooser(
          'Ordering',
          [['standard', 'Standard'], ['fifo', 'FIFO'], ['priority', 'Priority']],
          (v) => setQueueOrdering(nodes(), v as QueueOrdering),
        ),
        row('Max depth', depth),
      );
    }
  }

  const tagInput = document.createElement('input');
  tagInput.type = 'text';
  tagInput.className = 'field';
  tagInput.placeholder = 'tag';
  tagInput.setAttribute('aria-label', 'Tag to add or remove');
  const tagButtons = document.createElement('span');
  tagButtons.className = 'bulk-tag-buttons';
  const tagItems = () => [...nodes(), ...edges()];
  for (const [text, fn] of [['Add', addTag], ['Remove', removeTag]] as const) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'btn btn-compact';
    b.textContent = text;
    b.addEventListener('click', () => {
      const tag = tagInput.value;
      if (mutateWithHistory(() => fn(tagItems(), tag))) {
        tagInput.value = '';
        renderAll(true);
      }
    });
    tagButtons.appendChild(b);
  }
  const tagWrap = document.createElement('div');
  tagWrap.className = 'bulk-tag-row';
  tagWrap.append(tagInput, tagButtons);
  host.appendChild(row('Tags', tagWrap));

  if (edgeIds.length > 0) {
    host.append(
      chooser('Wire colour', STREAM_TONE_OPTIONS.map((o) => [o.id, o.label]), (v) => setWireTone(edges(), v as StreamTone)),
      chooser('Wire timing', [['sync', 'Synchronous'], ['async', 'Asynchronous']], (v) => setWireSync(edges(), v as WireSync)),
    );
  }
}
