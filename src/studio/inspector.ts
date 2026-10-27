/** Design-mode property editor and Data View telemetry inspector. */
import {
  SVG_NS,
  btnPropDuplicate,
  docStatusLabelEl,
  docSystemTagEl,
  docTitleHeadingEl,
  inspBadge,
  inspCode,
  inspId,
  inspLineage,
  inspMetrics,
  inspSummary,
  inspTitle,
  inspectorScope,
  propFormContainer,
  propPanelHeading,
  propSelectionActions,
} from './dom';
import {
  app,
  beginHistoryGesture,
  endHistoryGesture,
  fitToViewport,
  pushHistory,
  setSelection,
} from './state';
import {
  applySelection,
  renderAll,
  renderMatrixTable,
  renderNotesCards,
  renderWiresOnly,
  renderZones,
  updateVisualSelectionHighlights,
} from './render';
import {
  renderSimButtons,
} from './interactions';
import type {
  DiagramNode,
  EdgeRouteMode,
  NodeIconName,
  NodeKind,
  PortSide,
  StreamTone,
} from '../types';
import {
  STENCIL_CATALOG,
  STREAM_TONE_OPTIONS,
} from '../templates/presets';
import {
  autoLayoutDocument,
  expandStageToFit,
  getAdjacencyLists,
  getNodeDimensions,
} from '../core/layout';

import { ICON_LIST } from '../ui/icons';

// Element-scoped View Transitions (`scoped-component-transitions`)
export const supportsScopedVT = 'startViewTransition' in Element.prototype;
export function withInspectorTransition(updateFn: () => void): void {
  if (!supportsScopedVT) {
    updateFn();
    return;
  }
  const vt = (
    inspectorScope as unknown as {
      startViewTransition: (cb: () => void) => { ready: Promise<void> };
    }
  ).startViewTransition(updateFn);
  vt.ready.catch(() => {});
}

// ---------------------------------------------------------------------------
// Design Mode: Right Contextual Property Editor
// ---------------------------------------------------------------------------
export function makeField(
  id: string,
  labelText: string,
  control: HTMLElement,
): HTMLElement {
  const wrap = document.createElement('div');
  wrap.className = 'prop-field';
  const lbl = document.createElement('label');
  lbl.htmlFor = id;
  lbl.textContent = labelText;
  control.id = id;
  wrap.append(lbl, control);
  return wrap;
}

export function makeTextInput(
  value: string,
  onInput: (nextVal: string) => void,
  opts?: { identifier?: boolean },
): HTMLInputElement {
  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'prop-input';
  input.value = value;
  if (opts?.identifier) {
    input.setAttribute('autocorrect', 'off');
    input.setAttribute('autocapitalize', 'off');
    input.spellcheck = false;
  }
  input.addEventListener('focus', () => {
    beginHistoryGesture();
  });
  input.addEventListener('blur', () => {
    endHistoryGesture();
  });
  input.addEventListener('input', () => {
    pushHistory();
    onInput(input.value);
  });
  return input;
}

export function makeTextarea(
  value: string,
  onInput: (nextVal: string) => void,
  isCode = false,
): HTMLTextAreaElement {
  const ta = document.createElement('textarea');
  ta.className = isCode ? 'prop-textarea prop-textarea-code' : 'prop-textarea';
  ta.value = value;
  if (isCode) {
    ta.spellcheck = false;
    ta.setAttribute('autocorrect', 'off');
    ta.setAttribute('autocapitalize', 'off');
  }
  ta.addEventListener('focus', () => {
    beginHistoryGesture();
  });
  ta.addEventListener('blur', () => {
    endHistoryGesture();
  });
  ta.addEventListener('input', () => {
    pushHistory();
    onInput(ta.value);
  });
  return ta;
}

export function makeTonePicker(
  groupName: string,
  current: StreamTone,
  onChange: (tone: StreamTone) => void,
): HTMLFieldSetElement {
  const fs = document.createElement('fieldset');
  fs.className = 'swatch-picker';
  const legend = document.createElement('legend');
  legend.className = 'visually-hidden';
  legend.textContent = 'Accent Color';
  fs.appendChild(legend);

  for (const opt of STREAM_TONE_OPTIONS) {
    const lbl = document.createElement('label');
    lbl.className = 'swatch-option';
    const radio = document.createElement('input');
    radio.type = 'radio';
    radio.name = groupName;
    radio.value = opt.id;
    radio.checked = opt.id === current;
    radio.className = 'visually-hidden';

    const dot = document.createElement('span');
    dot.className = 'pill-swatch';
    dot.style.background = opt.cssVar;

    const text = document.createElement('span');
    text.textContent = opt.id.charAt(0).toUpperCase() + opt.id.slice(1);

    radio.addEventListener('change', () => {
      if (radio.checked) {
        pushHistory();
        onChange(opt.id);
      }
    });

    lbl.append(radio, dot, text);
    fs.appendChild(lbl);
  }
  return fs;
}

export function renderPropertyEditor(): void {
  propFormContainer.replaceChildren();
  const form = document.createElement('div');
  form.className = 'prop-form';
  const sel = app.selection;

  if (sel.type === 'node') {
    const node = app.doc.nodes.find((n) => n.id === sel.id);
    if (!node) {
      setSelection({ type: 'none' });
      return;
    }

    propPanelHeading.textContent = 'COMPONENT PROPERTIES';
    propSelectionActions.hidden = false;
    btnPropDuplicate.hidden = false;

    form.appendChild(
      makeField(
        'prop-node-title',
        'Title',
        makeTextInput(node.title, (v) => {
          node.title = v;
          renderAll(false);
        }),
      ),
    );

    form.appendChild(
      makeField(
        'prop-node-subtitle',
        'Subtitle / Role',
        makeTextInput(node.subtitle, (v) => {
          node.subtitle = v;
          renderAll(false);
        }),
      ),
    );

    // Component Kind + Icon Row
    const kindSelect = document.createElement('select');
    kindSelect.className = 'prop-select';
    for (const st of STENCIL_CATALOG) {
      const opt = document.createElement('option');
      opt.value = st.kind;
      opt.textContent = st.paletteTitle;
      opt.selected = st.kind === node.kind;
      kindSelect.appendChild(opt);
    }
    kindSelect.addEventListener('change', () => {
      pushHistory();
      node.kind = kindSelect.value as NodeKind;
      const dims = getNodeDimensions(node.kind);
      node.width = dims.width;
      node.height = dims.height;
      renderAll(true);
    });

    if (node.kind !== 'actor') {
      const iconSelect = document.createElement('select');
      iconSelect.className = 'prop-select';
      for (const ic of ICON_LIST) {
        const opt = document.createElement('option');
        opt.value = ic.id;
        opt.textContent = ic.label;
        opt.selected = ic.id === node.icon;
        iconSelect.appendChild(opt);
      }
      iconSelect.addEventListener('change', () => {
        pushHistory();
        node.icon = iconSelect.value as NodeIconName;
        renderAll(false);
      });

      const row = document.createElement('div');
      row.className = 'prop-row-2';
      row.append(
        makeField('prop-node-kind', 'Shape Kind', kindSelect),
        makeField('prop-node-icon', 'Icon', iconSelect),
      );
      form.appendChild(row);
    } else {
      form.appendChild(makeField('prop-node-kind', 'Shape Kind', kindSelect));
    }

    // Accent Swatch Picker
    const toneWrap = document.createElement('div');
    toneWrap.className = 'prop-field';
    const toneTitle = document.createElement('span');
    toneTitle.className = 'field-label';
    toneTitle.textContent = 'Accent Color';
    toneWrap.append(
      toneTitle,
      makeTonePicker('node-accent-tone', node.accent, (tone) => {
        node.accent = tone;
        renderAll(false);
      }),
    );
    form.appendChild(toneWrap);

    if (node.kind !== 'actor') {
      const rowBadges = document.createElement('div');
      rowBadges.className = 'prop-row-2';
      rowBadges.append(
        makeField(
          'prop-node-eyebrow',
          'Eyebrow Tag',
          makeTextInput(
            node.eyebrow,
            (v) => {
              node.eyebrow = v;
              renderAll(false);
            },
            { identifier: true },
          ),
        ),
        makeField(
          'prop-node-chip',
          'Badge Chip',
          makeTextInput(
            node.chip,
            (v) => {
              node.chip = v;
              renderAll(false);
            },
            { identifier: true },
          ),
        ),
      );
      form.appendChild(rowBadges);

      if (node.kind !== 'client') {
        form.appendChild(
          makeField(
            'prop-node-footer',
            'Card Footer Label',
            makeTextInput(node.footerLeft, (v) => {
              node.footerLeft = v;
              renderAll(false);
            }),
          ),
        );
      }
    }

    form.appendChild(
      makeField(
        'prop-node-interface',
        'Protocol / Interface (Matrix)',
        makeTextInput(node.interfaceLabel, (v) => {
          node.interfaceLabel = v;
          renderMatrixTable();
        }),
      ),
    );

    form.appendChild(
      makeField(
        'prop-node-summary',
        'Inspector Description',
        makeTextarea(node.summary, (v) => {
          node.summary = v;
        }),
      ),
    );

    // Telemetry Metrics Editor
    const metricsDiv = document.createElement('div');
    metricsDiv.className = 'prop-divider';
    const mHeader = document.createElement('div');
    mHeader.className = 'prop-list-header';
    const mTitle = document.createElement('span');
    mTitle.className = 'section-heading';
    mTitle.textContent = 'TELEMETRY METRICS';
    const btnAddMetric = document.createElement('button');
    btnAddMetric.type = 'button';
    btnAddMetric.className = 'btn btn-compact';
    btnAddMetric.style.flex = '0 0 auto';
    btnAddMetric.textContent = '+ Add';
    btnAddMetric.addEventListener('click', () => {
      pushHistory();
      node.metrics.push({ label: 'Metric', value: '100%' });
      renderPropertyEditor();
    });
    mHeader.append(mTitle, btnAddMetric);
    metricsDiv.appendChild(mHeader);

    node.metrics.forEach((m, idx) => {
      const row = document.createElement('div');
      row.className = 'kv-row';
      const kIn = makeTextInput(m.label, (v) => {
        m.label = v;
      });
      kIn.setAttribute('aria-label', `Metric ${idx + 1} label`);
      const vIn = makeTextInput(m.value, (v) => {
        m.value = v;
      });
      vIn.setAttribute('aria-label', `Metric ${idx + 1} value`);

      const delBtn = document.createElement('button');
      delBtn.type = 'button';
      delBtn.className = 'btn btn-compact';
      delBtn.textContent = '×';
      delBtn.setAttribute('aria-label', `Remove metric ${m.label}`);
      delBtn.addEventListener('click', () => {
        pushHistory();
        node.metrics.splice(idx, 1);
        renderPropertyEditor();
      });

      row.append(kIn, vIn, delBtn);
      metricsDiv.appendChild(row);
    });
    form.appendChild(metricsDiv);

    // Sample Payload Editor
    const payloadDiv = document.createElement('div');
    payloadDiv.className = 'prop-divider';
    payloadDiv.appendChild(
      makeField(
        'prop-node-code',
        'Sample Payload / Contract (JSON or Text)',
        makeTextarea(
          node.code,
          (v) => {
            node.code = v;
          },
          true,
        ),
      ),
    );
    form.appendChild(payloadDiv);
  } else if (sel.type === 'edge') {
    const edge = app.doc.edges.find((e) => e.id === sel.id);
    if (!edge) {
      setSelection({ type: 'none' });
      return;
    }

    propPanelHeading.textContent = 'STREAM WIRE PROPERTIES';
    propSelectionActions.hidden = false;
    btnPropDuplicate.hidden = true;

    form.appendChild(
      makeField(
        'prop-edge-label',
        'Conduit Pill Label (optional)',
        makeTextInput(edge.label, (v) => {
          edge.label = v;
          renderWiresOnly();
        }),
      ),
    );

    const toneWrap = document.createElement('div');
    toneWrap.className = 'prop-field';
    const toneTitle = document.createElement('span');
    toneTitle.className = 'field-label';
    toneTitle.textContent = 'Stream Channel Color';
    toneWrap.append(
      toneTitle,
      makeTonePicker('edge-stream-tone', edge.tone, (tone) => {
        edge.tone = tone;
        renderWiresOnly();
        renderSimButtons();
      }),
    );
    form.appendChild(toneWrap);

    // Routing Style (Visual Schematic Picker)
    const routeFieldset = document.createElement('fieldset');
    routeFieldset.className = 'route-style-fieldset';
    const routeLegend = document.createElement('legend');
    routeLegend.className = 'field-label';
    routeLegend.textContent = 'Routing Style';
    routeFieldset.appendChild(routeLegend);

    const routeGrid = document.createElement('div');
    routeGrid.className = 'route-style-grid';

    const routeOptions: Array<{
      value: EdgeRouteMode;
      label: string;
      previewPath: string;
      fullSpan?: boolean;
    }> = [
      {
        value: 'auto',
        label: 'Smart Auto (Context-Aware)',
        previewPath: 'M 2 9 L 10 9 C 15 9, 13 5, 19 5 L 25 5',
        fullSpan: true,
      },
      {
        value: 'straight',
        label: 'Direct Line',
        previewPath: 'M 2 13 L 25 4',
      },
      {
        value: 'bezier',
        label: 'Smooth S-Curve',
        previewPath: 'M 2 9 C 10 1, 18 17, 25 9',
      },
      {
        value: 'arc',
        label: 'Curved Arc',
        previewPath: 'M 2 13 Q 14 1 25 13',
      },
      {
        value: 'fanout',
        label: 'Vertical Fan-out',
        previewPath: 'M 14 2 C 14 9, 23 8, 23 15',
      },
      {
        value: 'orthogonal',
        label: 'Rounded Elbow',
        previewPath: 'M 2 13 L 10 13 Q 14 13 14 9 L 14 7 Q 14 4 18 4 L 25 4',
      },
      {
        value: 'step',
        label: 'Sharp Step',
        previewPath: 'M 2 13 L 14 13 L 14 4 L 25 4',
      },
      {
        value: 'under',
        label: 'Under U-Loop',
        previewPath: 'M 4 4 L 4 12 Q 4 15 7 15 L 21 15 Q 24 15 24 12 L 24 4',
      },
      {
        value: 'over',
        label: 'Over U-Loop',
        previewPath: 'M 4 14 L 4 6 Q 4 3 7 3 L 21 3 Q 24 3 24 6 L 24 14',
      },
    ];

    for (const ro of routeOptions) {
      const lbl = document.createElement('label');
      lbl.className = ro.fullSpan ? 'route-style-option is-full-span' : 'route-style-option';

      const radio = document.createElement('input');
      radio.type = 'radio';
      radio.name = 'edge-route-mode';
      radio.value = ro.value;
      radio.checked = ro.value === edge.route;
      radio.className = 'visually-hidden';

      const svg = document.createElementNS(SVG_NS, 'svg');
      svg.setAttribute('class', 'route-style-icon');
      svg.setAttribute('width', '28');
      svg.setAttribute('height', '18');
      svg.setAttribute('viewBox', '0 0 28 18');
      svg.setAttribute('fill', 'none');
      svg.setAttribute('aria-hidden', 'true');

      const path = document.createElementNS(SVG_NS, 'path');
      path.setAttribute('d', ro.previewPath);
      path.setAttribute('stroke', 'currentColor');
      path.setAttribute('stroke-width', '2');
      path.setAttribute('stroke-linecap', 'round');
      path.setAttribute('stroke-linejoin', 'round');
      svg.appendChild(path);

      const txt = document.createElement('span');
      txt.textContent = ro.label;

      radio.addEventListener('change', () => {
        if (!radio.checked) return;
        pushHistory();
        edge.route = ro.value;
        renderWiresOnly();
        updateVisualSelectionHighlights();
      });

      lbl.append(radio, svg, txt);
      routeGrid.appendChild(lbl);
    }

    routeFieldset.appendChild(routeGrid);
    form.appendChild(routeFieldset);

    // Source & Target Port Overrides
    const makePortSelect = (current: PortSide, onChange: (p: PortSide) => void) => {
      const sel = document.createElement('select');
      sel.className = 'prop-select';
      for (const side of ['auto', 'top', 'right', 'bottom', 'left'] as PortSide[]) {
        const opt = document.createElement('option');
        opt.value = side;
        opt.textContent = side.toUpperCase();
        opt.selected = side === current;
        sel.appendChild(opt);
      }
      sel.addEventListener('change', () => {
        pushHistory();
        onChange(sel.value as PortSide);
        renderWiresOnly();
      });
      return sel;
    };

    const portRow = document.createElement('div');
    portRow.className = 'prop-row-2';
    portRow.append(
      makeField(
        'prop-edge-src-port',
        'Source Port',
        makePortSelect(edge.sourcePort, (p) => {
          edge.sourcePort = p;
        }),
      ),
      makeField(
        'prop-edge-dst-port',
        'Target Port',
        makePortSelect(edge.targetPort, (p) => {
          edge.targetPort = p;
        }),
      ),
    );
    form.appendChild(portRow);

    // Animated Pulse Toggle
    const animLabel = document.createElement('label');
    animLabel.className = 'checkbox-inline';
    const animChk = document.createElement('input');
    animChk.type = 'checkbox';
    animChk.checked = edge.animated;
    animChk.addEventListener('change', () => {
      pushHistory();
      edge.animated = animChk.checked;
      renderWiresOnly();
    });
    animLabel.append(animChk, document.createTextNode('Animated dashed telemetry stream'));
    form.appendChild(animLabel);

    // Reverse Direction Button
    const btnReverse = document.createElement('button');
    btnReverse.type = 'button';
    btnReverse.className = 'btn';
    btnReverse.textContent = '⇄ Reverse Flow Direction';
    btnReverse.addEventListener('click', () => {
      pushHistory();
      const tmpNode = edge.from;
      edge.from = edge.to;
      edge.to = tmpNode;
      const tmpPort = edge.sourcePort;
      edge.sourcePort = edge.targetPort;
      edge.targetPort = tmpPort;
      renderAll(true);
    });
    form.appendChild(btnReverse);

    if (edge.waypoint) {
      const btnResetWp = document.createElement('button');
      btnResetWp.type = 'button';
      btnResetWp.className = 'btn';
      btnResetWp.textContent = `↺ Reset Custom Waypoint (${edge.waypoint[0]}, ${edge.waypoint[1]})`;
      btnResetWp.addEventListener('click', () => {
        pushHistory();
        delete edge.waypoint;
        renderWiresOnly();
        renderPropertyEditor();
      });
      form.appendChild(btnResetWp);
    }
  } else if (sel.type === 'multi') {
    const selectedNodes = app.doc.nodes.filter((n) => sel.ids.includes(n.id));
    if (selectedNodes.length <= 1) {
      setSelection(selectedNodes.length === 1 ? { type: 'node', id: selectedNodes[0].id } : { type: 'none' });
      return;
    }

    propPanelHeading.textContent = `MULTI-SELECT (${selectedNodes.length} NODES)`;
    propSelectionActions.hidden = false;
    btnPropDuplicate.hidden = false;

    const alignSection = document.createElement('div');
    alignSection.className = 'prop-divider';
    const alignHeading = document.createElement('span');
    alignHeading.className = 'section-heading';
    alignHeading.textContent = 'ALIGN & DISTRIBUTE';
    alignSection.appendChild(alignHeading);

    const grid = document.createElement('div');
    grid.className = 'multi-action-grid';

    const makeAlignBtn = (label: string, fn: () => void) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'btn btn-compact';
      b.textContent = label;
      b.addEventListener('click', () => {
        pushHistory();
        fn();
        expandStageToFit(app.doc);
        renderAll(false);
      });
      return b;
    };

    grid.append(
      makeAlignBtn('left Align Left', () => {
        const minX = Math.min(...selectedNodes.map((n) => n.x));
        for (const n of selectedNodes) n.x = minX;
      }),
      makeAlignBtn('center Align Center X', () => {
        const avgCx =
          selectedNodes.reduce((acc, n) => acc + n.x + n.width / 2, 0) / selectedNodes.length;
        for (const n of selectedNodes) n.x = Math.round(avgCx - n.width / 2);
      }),
      makeAlignBtn('top Align Top', () => {
        const minY = Math.min(...selectedNodes.map((n) => n.y));
        for (const n of selectedNodes) n.y = minY;
      }),
      makeAlignBtn('middle Align Middle Y', () => {
        const avgCy =
          selectedNodes.reduce((acc, n) => acc + n.y + n.height / 2, 0) / selectedNodes.length;
        for (const n of selectedNodes) n.y = Math.round(avgCy - n.height / 2);
      }),
      makeAlignBtn('↔ Distribute Horiz', () => {
        if (selectedNodes.length < 3) return;
        const sorted = [...selectedNodes].sort((a, b) => a.x - b.x);
        const first = sorted[0].x;
        const last = sorted[sorted.length - 1].x;
        const step = (last - first) / (sorted.length - 1);
        sorted.forEach((n, idx) => {
          n.x = Math.round((first + step * idx) / 16) * 16;
        });
      }),
      makeAlignBtn('↕ Distribute Vert', () => {
        if (selectedNodes.length < 3) return;
        const sorted = [...selectedNodes].sort((a, b) => a.y - b.y);
        const first = sorted[0].y;
        const last = sorted[sorted.length - 1].y;
        const step = (last - first) / (sorted.length - 1);
        sorted.forEach((n, idx) => {
          n.y = Math.round((first + step * idx) / 16) * 16;
        });
      }),
    );

    alignSection.appendChild(grid);
    form.appendChild(alignSection);

    // Batch Accent Color Picker
    const toneWrap = document.createElement('div');
    toneWrap.className = 'prop-divider';
    const toneTitle = document.createElement('span');
    toneTitle.className = 'field-label';
    toneTitle.textContent = 'Batch Accent Color';
    toneWrap.append(
      toneTitle,
      makeTonePicker('multi-node-accent', selectedNodes[0].accent, (tone) => {
        for (const n of selectedNodes) n.accent = tone;
        renderAll(false);
      }),
    );
    form.appendChild(toneWrap);
  } else if (sel.type === 'zone') {
    const zone = app.doc.zones.find((z) => z.id === sel.id);
    if (!zone) {
      setSelection({ type: 'none' });
      return;
    }

    propPanelHeading.textContent = 'SWIMLANE STAGE';
    propSelectionActions.hidden = false;
    btnPropDuplicate.hidden = false;

    const rowTop = document.createElement('div');
    rowTop.className = 'prop-row-2';
    rowTop.append(
      makeField(
        'prop-zone-num',
        'Stage Number',
        makeTextInput(
          zone.number,
          (v) => {
            zone.number = v;
            renderZones();
          },
          { identifier: true },
        ),
      ),
      makeField(
        'prop-zone-width',
        'Width (px)',
        makeTextInput(
          String(zone.width),
          (v) => {
            const parsed = Number.parseInt(v, 10);
            if (!Number.isNaN(parsed) && parsed >= 140) {
              zone.width = parsed;
              expandStageToFit(app.doc);
              renderZones();
            }
          },
          { identifier: true },
        ),
      ),
    );
    form.appendChild(rowTop);

    form.appendChild(
      makeField(
        'prop-zone-title',
        'Stage Title',
        makeTextInput(zone.title, (v) => {
          zone.title = v;
          renderZones();
        }),
      ),
    );
    form.appendChild(
      makeField(
        'prop-zone-sub',
        'Stage Subtitle',
        makeTextInput(zone.subtitle, (v) => {
          zone.subtitle = v;
          renderZones();
        }),
      ),
    );
  } else if (sel.type === 'notes') {
    const card = app.doc.notesCards.find((c) => c.id === sel.id);
    if (!card) {
      setSelection({ type: 'none' });
      return;
    }

    propPanelHeading.textContent = 'NOTES / SPEC CARD';
    propSelectionActions.hidden = false;
    btnPropDuplicate.hidden = false;

    const rowTop = document.createElement('div');
    rowTop.className = 'prop-row-2';
    rowTop.append(
      makeField(
        'prop-notes-title',
        'Header Title',
        makeTextInput(card.title, (v) => {
          card.title = v;
          renderNotesCards();
        }),
      ),
      makeField(
        'prop-notes-code',
        'Spec Tag',
        makeTextInput(
          card.code,
          (v) => {
            card.code = v;
            renderNotesCards();
          },
          { identifier: true },
        ),
      ),
    );
    form.appendChild(rowTop);

    const itemsSection = document.createElement('div');
    itemsSection.className = 'prop-divider';
    const iHeader = document.createElement('div');
    iHeader.className = 'prop-list-header';
    const iTitle = document.createElement('span');
    iTitle.className = 'section-heading';
    iTitle.textContent = 'CHECKLIST ITEMS';
    const btnAddItem = document.createElement('button');
    btnAddItem.type = 'button';
    btnAddItem.className = 'btn btn-compact';
    btnAddItem.style.flex = '0 0 auto';
    btnAddItem.textContent = '+ Add Item';
    btnAddItem.addEventListener('click', () => {
      pushHistory();
      card.items.push({ title: `Item 0${card.items.length + 1}`, text: 'Describe architectural note.' });
      renderNotesCards();
      renderPropertyEditor();
    });
    iHeader.append(iTitle, btnAddItem);
    itemsSection.appendChild(iHeader);

    card.items.forEach((item, idx) => {
      const box = document.createElement('div');
      box.className = 'notes-item-editor';
      const topBar = document.createElement('div');
      topBar.className = 'prop-list-header';
      const tIn = makeTextInput(item.title, (v) => {
        item.title = v;
        renderNotesCards();
      });
      tIn.setAttribute('aria-label', `Note ${idx + 1} title`);
      const delBtn = document.createElement('button');
      delBtn.type = 'button';
      delBtn.className = 'btn btn-compact';
      delBtn.style.flex = '0 0 auto';
      delBtn.textContent = '×';
      delBtn.addEventListener('click', () => {
        pushHistory();
        card.items.splice(idx, 1);
        renderNotesCards();
        renderPropertyEditor();
      });
      topBar.append(tIn, delBtn);

      const bodyIn = makeTextInput(item.text, (v) => {
        item.text = v;
        renderNotesCards();
      });
      bodyIn.setAttribute('aria-label', `Note ${idx + 1} description`);

      box.append(topBar, bodyIn);
      itemsSection.appendChild(box);
    });
    form.appendChild(itemsSection);
  } else {
    // Document Overview Properties
    propPanelHeading.textContent = 'DOCUMENT PROPERTIES';
    propSelectionActions.hidden = true;

    form.appendChild(
      makeField(
        'prop-doc-title',
        'Architecture Title',
        makeTextInput(app.doc.title, (v) => {
          app.doc.title = v;
          docTitleHeadingEl.textContent = v || 'Untitled Architecture';
        }),
      ),
    );

    const rowTags = document.createElement('div');
    rowTags.className = 'prop-row-2';
    rowTags.append(
      makeField(
        'prop-doc-systag',
        'System Tag',
        makeTextInput(
          app.doc.systemTag,
          (v) => {
            app.doc.systemTag = v;
            docSystemTagEl.textContent = v;
          },
          { identifier: true },
        ),
      ),
      makeField(
        'prop-doc-status',
        'Status Badge',
        makeTextInput(
          app.doc.statusLabel,
          (v) => {
            app.doc.statusLabel = v;
            docStatusLabelEl.textContent = v;
          },
          { identifier: true },
        ),
      ),
    );
    form.appendChild(rowTags);

    const dirSelect = document.createElement('select');
    dirSelect.className = 'prop-select';
    for (const d of [
      { value: 'LR', label: 'Left → Right (LR)' },
      { value: 'TD', label: 'Top → Down (TD)' },
    ]) {
      const opt = document.createElement('option');
      opt.value = d.value;
      opt.textContent = d.label;
      opt.selected = d.value === app.doc.direction;
      dirSelect.appendChild(opt);
    }
    dirSelect.addEventListener('change', () => {
      pushHistory();
      app.doc.direction = dirSelect.value as 'LR' | 'TD';
      autoLayoutDocument(app.doc);
      renderAll(true);
      fitToViewport();
    });
    form.appendChild(makeField('prop-doc-dir', 'Auto-Layout Flow Direction', dirSelect));

    form.appendChild(
      makeField(
        'prop-doc-summary',
        'Overview Summary',
        makeTextarea(app.doc.overviewSummary, (v) => {
          app.doc.overviewSummary = v;
        }),
      ),
    );

    const tipDiv = document.createElement('div');
    tipDiv.className = 'prop-divider';
    const tipText = document.createElement('p');
    tipText.style.fontSize = '0.78rem';
    tipText.style.color = 'var(--wl-ink-muted)';
    tipText.style.lineHeight = '1.5';
    tipText.textContent =
      'Tip: Select any component, wire, swimlane, or notes card on the canvas to customize its telemetry metrics, stream color, routing style, and JSON payload.';
    tipDiv.appendChild(tipText);
    form.appendChild(tipDiv);
  }

  propFormContainer.appendChild(form);
}

// ---------------------------------------------------------------------------
// Data View Mode: Telemetry Inspector & Live Simulation Runner
// ---------------------------------------------------------------------------
export function renderMetricsBoxes(items: Array<{ label: string; value: string }>): void {
  inspMetrics.replaceChildren();
  for (const m of items) {
    const box = document.createElement('div');
    box.className = 'metric-box';
    const lbl = document.createElement('span');
    lbl.className = 'metric-label';
    lbl.textContent = m.label;
    const val = document.createElement('span');
    val.className = 'metric-value';
    val.textContent = m.value;
    box.append(lbl, val);
    inspMetrics.appendChild(box);
  }
}

export function renderLineageRows(upstream: DiagramNode[], downstream: DiagramNode[]): void {
  inspLineage.replaceChildren();

  const buildGroup = (heading: string, list: DiagramNode[]) => {
    const wrap = document.createElement('div');
    const lbl = document.createElement('span');
    lbl.className = 'metric-label';
    lbl.style.marginBlockEnd = '0.25rem';
    lbl.textContent = heading;
    wrap.appendChild(lbl);

    const row = document.createElement('div');
    row.className = 'lineage-chips';
    if (list.length === 0) {
      const empty = document.createElement('span');
      empty.style.fontSize = '0.8rem';
      empty.style.color = 'var(--wl-ink-muted)';
      empty.textContent = 'None';
      row.appendChild(empty);
    } else {
      for (const item of list) {
        const chip = document.createElement('button');
        chip.type = 'button';
        chip.className = 'lineage-chip';
        chip.textContent = item.title;
        chip.addEventListener('click', () => {
          applySelection({ type: 'node', id: item.id }, { refreshIfUnchanged: true });
        });
        row.appendChild(chip);
      }
    }
    wrap.appendChild(row);
    return wrap;
  };

  inspLineage.append(
    buildGroup('Upstream Sources', upstream),
    buildGroup('Downstream Consumers', downstream),
  );
}

export function syncDataViewInspector(): void {
  const sel = app.selection;
  if (sel.type === 'node') {
    const node = app.doc.nodes.find((n) => n.id === sel.id);
    if (node) {
      const adj = getAdjacencyLists(app.doc, node.id);
      withInspectorTransition(() => {
        inspBadge.textContent = `${node.eyebrow} · ${node.zoneLabel}`;
        inspId.textContent = node.id.toUpperCase();
        inspTitle.textContent = node.subtitle ? `${node.title} — ${node.subtitle}` : node.title;
        inspSummary.textContent = node.summary;
        renderMetricsBoxes(node.metrics);
        renderLineageRows(adj.upstream, adj.downstream);
        inspCode.textContent = node.code;
      });
      return;
    }
  }

  withInspectorTransition(() => {
    inspBadge.textContent = 'SYSTEM OVERVIEW';
    inspId.textContent = 'ALL';
    inspTitle.textContent = app.doc.title;
    inspSummary.textContent = app.doc.overviewSummary;
    renderMetricsBoxes([
      { label: 'Components', value: `${app.doc.nodes.length} Active` },
      { label: 'Data Conduits', value: `${app.doc.edges.length} Streams` },
      { label: 'Swimlane Stages', value: `${app.doc.zones.length}` },
      { label: 'Flow Layout', value: app.doc.direction },
    ]);
    renderLineageRows([], app.doc.nodes);
    inspCode.textContent = JSON.stringify(
      {
        title: app.doc.title,
        direction: app.doc.direction,
        components: app.doc.nodes.length,
        streams: app.doc.edges.length,
      },
      null,
      2,
    );
  });
}
