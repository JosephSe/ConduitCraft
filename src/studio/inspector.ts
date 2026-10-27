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
  panelSimulations,
  propFormContainer,
  simEditorHint,
  simEditorList,
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
  runSimulation,
} from './interactions';
import type {
  DiagramNode,
  EdgeRouteMode,
  NodeIconName,
  NodeKind,
  NodeShape,
  PortSide,
  SimulationScenario,
  SimulationStep,
  StreamTone,
} from '../types';
import {
  STENCIL_CATALOG,
  STREAM_TONE_OPTIONS,
  nextUid,
} from '../templates/presets';
import {
  autoLayoutDocument,
  expandStageToFit,
  getAdjacencyLists,
  getEffectiveSimulations,
  getNodeDimensions,
} from '../core/layout';
import { normalizeBrandAccent } from '../core/brand';
import { NODE_SHAPE_LABELS, NODE_SHAPES, nodeShapeFrame, sanitizeIconImage } from '../core/nodeStyle';

import { ICON_LIST, createNodeIconSvg, createUiIconSvg } from '../ui/icons';

// Element-scoped View Transitions (`scoped-component-transitions`)
export const supportsScopedVT =
  typeof Element !== 'undefined' && 'startViewTransition' in Element.prototype;
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
    lbl.className = 'swatch-option swatch-dot-only';
    const capName = opt.id.charAt(0).toUpperCase() + opt.id.slice(1);
    lbl.setAttribute('data-tip', capName);
    lbl.setAttribute('aria-label', capName);

    const radio = document.createElement('input');
    radio.type = 'radio';
    radio.name = groupName;
    radio.value = opt.id;
    radio.checked = opt.id === current;
    radio.className = 'visually-hidden';

    const dot = document.createElement('span');
    dot.className = 'pill-swatch';
    dot.style.background = opt.cssVar;

    radio.addEventListener('change', () => {
      if (radio.checked) {
        pushHistory();
        onChange(opt.id);
      }
    });

    lbl.append(radio, dot);
    fs.appendChild(lbl);
  }
  return fs;
}

function closeIconMenus(): void {
  for (const menu of document.querySelectorAll<HTMLElement>('body > .icon-picker-menu')) {
    menu.remove();
  }
}

let iconMenuDismissBound = false;
function bindIconMenuDismiss(): void {
  if (iconMenuDismissBound) return;
  iconMenuDismissBound = true;
  document.addEventListener('pointerdown', (event) => {
    const target = event.target;
    if (!(target instanceof Node)) return;
    for (const menu of document.querySelectorAll<HTMLElement>('body > .icon-picker-menu')) {
      const triggerId = menu.dataset.triggerId || '';
      const trigger = triggerId ? document.getElementById(triggerId) : null;
      if (menu.contains(target) || trigger?.contains(target)) continue;
      menu.remove();
      trigger?.setAttribute('aria-expanded', 'false');
    }
  });
}

function makeIconPicker(selected: NodeIconName, onChange: (next: NodeIconName) => void): HTMLElement {
  bindIconMenuDismiss();
  const root = document.createElement('div');
  root.className = 'icon-picker';

  const trigger = document.createElement('button');
  trigger.type = 'button';
  trigger.className = 'prop-select icon-picker-trigger';
  trigger.setAttribute('aria-haspopup', 'listbox');
  trigger.setAttribute('aria-expanded', 'false');

  const menu = document.createElement('div');
  menu.className = 'icon-picker-menu';
  menu.setAttribute('role', 'listbox');
  menu.dataset.triggerId = 'prop-node-icon';

  const paintTrigger = (id: NodeIconName) => {
    const item = ICON_LIST.find((icon) => icon.id === id) || ICON_LIST[0];
    trigger.replaceChildren(createNodeIconSvg(item.id, 16));
    trigger.append(item.label);
  };
  paintTrigger(selected);

  const options: HTMLButtonElement[] = [];
  for (const icon of ICON_LIST) {
    const option = document.createElement('button');
    option.type = 'button';
    option.className = 'icon-picker-option';
    option.setAttribute('role', 'option');
    option.dataset.icon = icon.id;
    option.setAttribute('aria-selected', String(icon.id === selected));
    option.append(createNodeIconSvg(icon.id, 16), icon.label);
    option.addEventListener('click', () => {
      for (const other of options) other.setAttribute('aria-selected', String(other === option));
      paintTrigger(icon.id);
      menu.remove();
      trigger.setAttribute('aria-expanded', 'false');
      onChange(icon.id);
    });
    options.push(option);
    menu.appendChild(option);
  }

  const placeMenu = () => {
    const rect = trigger.getBoundingClientRect();
    const roomBelow = window.innerHeight - rect.bottom - 12;
    const roomAbove = rect.top - 12;
    const openUp = roomBelow < 180 && roomAbove > roomBelow;
    menu.style.left = `${rect.left}px`;
    menu.style.width = `${rect.width}px`;
    menu.style.maxHeight = `${Math.max(120, openUp ? roomAbove : roomBelow)}px`;
    if (openUp) {
      menu.style.top = 'auto';
      menu.style.bottom = `${window.innerHeight - rect.top + 4}px`;
    } else {
      menu.style.bottom = 'auto';
      menu.style.top = `${rect.bottom + 4}px`;
    }
  };

  const openMenu = () => {
    closeIconMenus();
    placeMenu();
    document.body.appendChild(menu);
    trigger.setAttribute('aria-expanded', 'true');
    menu.querySelector<HTMLElement>('[aria-selected="true"]')?.focus();
  };

  const menuIsOpen = () => menu.parentElement === document.body;

  trigger.addEventListener('click', () => {
    if (menuIsOpen()) {
      menu.remove();
      trigger.setAttribute('aria-expanded', 'false');
      return;
    }
    openMenu();
  });

  root.addEventListener('keydown', (event) => {
    const open = menuIsOpen();
    if (event.key === 'Escape' && open) {
      event.preventDefault();
      event.stopPropagation();
      menu.remove();
      trigger.setAttribute('aria-expanded', 'false');
      trigger.focus();
      return;
    }
    if ((event.key === 'ArrowDown' || event.key === 'ArrowUp') && event.target === trigger && !open) {
      event.preventDefault();
      openMenu();
      return;
    }
    if (!open || (event.key !== 'ArrowDown' && event.key !== 'ArrowUp')) return;
    event.preventDefault();
    const current = options.findIndex((option) => option === document.activeElement);
    const delta = event.key === 'ArrowDown' ? 1 : -1;
    const next = options[(current + delta + options.length) % options.length];
    next?.focus();
  });

  root.append(trigger, menu);
  return root;
}

export function makeCollapsibleSection(
  id: string,
  title: string,
  defaultOpen: boolean,
  children: HTMLElement[],
): HTMLDetailsElement {
  const details = document.createElement('details');
  details.className = 'prop-section-details';
  details.id = `prop-section-${id}`;

  try {
    const saved = localStorage.getItem(`conduitcraft-section-${id}`);
    details.open = saved !== null ? saved === 'open' : defaultOpen;
  } catch {
    details.open = defaultOpen;
  }

  details.addEventListener('toggle', () => {
    try {
      localStorage.setItem(`conduitcraft-section-${id}`, details.open ? 'open' : 'closed');
    } catch {
      // Ignore storage errors
    }
  });

  const summary = document.createElement('summary');
  summary.className = 'prop-section-summary';
  summary.textContent = title;

  const content = document.createElement('div');
  content.className = 'prop-section-content';
  content.append(...children);

  details.append(summary, content);
  return details;
}

export function renderPropertyEditor(): void {
  closeIconMenus();
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

    // --- 1. Basics Section ---
    const basicsElements: HTMLElement[] = [];
    basicsElements.push(
      makeField(
        'prop-node-title',
        'Title',
        makeTextInput(node.title, (v) => {
          node.title = v;
          renderAll(false);
        }),
      ),
    );

    basicsElements.push(
      makeField(
        'prop-node-subtitle',
        'Subtitle / Role',
        makeTextInput(node.subtitle, (v) => {
          node.subtitle = v;
          renderAll(false);
        }),
      ),
    );

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
    basicsElements.push(toneWrap);

    // --- 2. Appearance Section ---
    const appearanceElements: HTMLElement[] = [];

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
      const frame = nodeShapeFrame(getNodeDimensions(node.kind), node.shape);
      node.width = frame.width;
      node.height = frame.height;
      renderAll(true);
    });

    if (node.kind !== 'actor') {
      const iconPicker = makeIconPicker(node.icon, (icon) => {
        pushHistory();
        node.icon = icon;
        renderAll(false);
      });
      const row = document.createElement('div');
      row.className = 'prop-row-2';
      row.append(
        makeField('prop-node-kind', 'Shape Kind', kindSelect),
        makeField('prop-node-icon', 'Icon', iconPicker),
      );
      const trigger = iconPicker.querySelector('button');
      if (trigger) trigger.id = 'prop-node-icon';
      iconPicker.removeAttribute('id');
      appearanceElements.push(row);
    } else {
      appearanceElements.push(makeField('prop-node-kind', 'Shape Kind', kindSelect));
    }

    const shapeSelect = document.createElement('select');
    shapeSelect.className = 'prop-select';
    for (const shape of NODE_SHAPES) {
      const opt = document.createElement('option');
      opt.value = shape;
      opt.textContent = NODE_SHAPE_LABELS[shape];
      opt.selected = (node.shape || 'card') === shape;
      shapeSelect.appendChild(opt);
    }
    shapeSelect.addEventListener('change', () => {
      pushHistory();
      const next = shapeSelect.value as NodeShape;
      if (next === 'card') delete node.shape;
      else node.shape = next;
      const frame = nodeShapeFrame(getNodeDimensions(node.kind), node.shape);
      node.width = frame.width;
      node.height = frame.height;
      renderAll(false);
    });
    appearanceElements.push(makeField('prop-node-shape', 'Node Shape', shapeSelect));

    // Custom Icon Upload Zone
    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.className = 'visually-hidden';
    fileInput.accept = 'image/png,image/jpeg,image/gif,image/webp,image/svg+xml';

    const iconHint = document.createElement('p');
    iconHint.className = 'prop-hint';
    iconHint.hidden = true;

    const uploadZone = document.createElement('div');
    uploadZone.className = 'custom-icon-upload-zone';
    uploadZone.setAttribute('role', 'button');
    uploadZone.setAttribute('tabindex', '0');
    uploadZone.setAttribute('aria-label', 'Upload custom icon image');

    const handleIconFile = (picked: File) => {
      if (!picked.type.startsWith('image/') || picked.size > 280_000) {
        iconHint.hidden = false;
        iconHint.textContent = 'Use a PNG, JPEG, GIF, WebP, or SVG image under 280 KB.';
        return;
      }
      const reader = new FileReader();
      reader.addEventListener('load', () => {
        const url = sanitizeIconImage(String(reader.result || ''));
        const live = app.doc.nodes.find((candidate) => candidate.id === node.id);
        if (!url || !live) {
          iconHint.hidden = false;
          iconHint.textContent = 'That image could not be used. Choose a smaller PNG, JPEG, GIF, WebP, or SVG.';
          return;
        }
        pushHistory();
        live.iconImage = url;
        iconHint.hidden = true;
        renderPropertyEditor();
        renderAll(true);
      });
      reader.readAsDataURL(picked);
    };

    fileInput.addEventListener('change', () => {
      const picked = fileInput.files?.[0];
      fileInput.value = '';
      if (picked) handleIconFile(picked);
    });

    if (node.iconImage) {
      const img = document.createElement('img');
      img.src = node.iconImage;
      img.className = 'custom-icon-thumb';
      img.alt = 'Icon preview';

      const promptWrap = document.createElement('div');
      promptWrap.className = 'custom-icon-upload-prompt';
      const promptTitle = document.createElement('span');
      promptTitle.className = 'custom-icon-upload-title';
      promptTitle.textContent = 'Custom Icon Active';
      const promptSub = document.createElement('span');
      promptSub.className = 'custom-icon-upload-sub';
      promptSub.textContent = 'Drop file or click to replace';
      promptWrap.append(promptTitle, promptSub);

      const removeBtn = document.createElement('button');
      removeBtn.type = 'button';
      removeBtn.className = 'btn btn-compact btn-reject';
      removeBtn.textContent = 'Remove';
      removeBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        const live = app.doc.nodes.find((candidate) => candidate.id === node.id);
        if (!live?.iconImage) return;
        pushHistory();
        delete live.iconImage;
        renderPropertyEditor();
        renderAll(true);
      });

      uploadZone.append(img, promptWrap, removeBtn);
    } else {
      const uploadIcon = createUiIconSvg('upload', 20);
      const promptWrap = document.createElement('div');
      promptWrap.className = 'custom-icon-upload-prompt';
      const promptTitle = document.createElement('span');
      promptTitle.className = 'custom-icon-upload-title';
      promptTitle.textContent = 'Custom Icon (Optional)';
      const promptSub = document.createElement('span');
      promptSub.className = 'custom-icon-upload-sub';
      promptSub.textContent = 'Drop PNG/SVG or click to browse (max 280KB)';
      promptWrap.append(promptTitle, promptSub);
      uploadZone.append(uploadIcon, promptWrap);
    }

    uploadZone.addEventListener('click', (e) => {
      if ((e.target as HTMLElement).tagName !== 'BUTTON') {
        fileInput.click();
      }
    });

    uploadZone.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        fileInput.click();
      }
    });

    uploadZone.addEventListener('dragover', (e) => {
      e.preventDefault();
      uploadZone.classList.add('is-dragover');
    });
    uploadZone.addEventListener('dragleave', () => {
      uploadZone.classList.remove('is-dragover');
    });
    uploadZone.addEventListener('drop', (e) => {
      e.preventDefault();
      uploadZone.classList.remove('is-dragover');
      const file = e.dataTransfer?.files?.[0];
      if (file) handleIconFile(file);
    });

    const iconField = makeField('prop-node-icon-file', 'Custom Icon', uploadZone);
    iconField.append(fileInput, iconHint);
    appearanceElements.push(iconField);

    // --- 3. Metadata & Matrix Section ---
    const metadataElements: HTMLElement[] = [];

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
      metadataElements.push(rowBadges);

      if (node.kind !== 'client') {
        metadataElements.push(
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

    metadataElements.push(
      makeField(
        'prop-node-interface',
        'Protocol / Interface (Matrix)',
        makeTextInput(node.interfaceLabel, (v) => {
          node.interfaceLabel = v;
          renderMatrixTable();
        }),
      ),
    );

    metadataElements.push(
      makeField(
        'prop-node-summary',
        'Inspector Description',
        makeTextarea(node.summary, (v) => {
          node.summary = v;
        }),
      ),
    );

    // --- 4. Telemetry & Contract Section ---
    const telemetryElements: HTMLElement[] = [];

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
    telemetryElements.push(metricsDiv);

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
    telemetryElements.push(payloadDiv);

    // Assemble Form Sections
    form.append(
      makeCollapsibleSection('basics', 'Basics', true, basicsElements),
      makeCollapsibleSection('appearance', 'Appearance', false, appearanceElements),
      makeCollapsibleSection('metadata', 'Metadata & Matrix', false, metadataElements),
      makeCollapsibleSection('telemetry', 'Telemetry & Contract', false, telemetryElements),
    );
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
    const zoneCount = sel.zoneIds?.length ?? 0;
    const notesCount = sel.notesIds?.length ?? 0;
    if (selectedNodes.length <= 1 && zoneCount === 0 && notesCount === 0) {
      setSelection(selectedNodes.length === 1 ? { type: 'node', id: selectedNodes[0].id } : { type: 'none' });
      return;
    }

    const counts = [
      selectedNodes.length > 0 ? `${selectedNodes.length} ${selectedNodes.length === 1 ? 'NODE' : 'NODES'}` : '',
      zoneCount > 0 ? `${zoneCount} ${zoneCount === 1 ? 'SWIMLANE' : 'SWIMLANES'}` : '',
      notesCount > 0 ? `${notesCount} ${notesCount === 1 ? 'NOTE' : 'NOTES'}` : '',
    ].filter(Boolean);
    propPanelHeading.textContent = `MULTI-SELECT (${counts.join(', ')})`;
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

    if (selectedNodes.length > 1) {
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
    }
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
    if (!app.doc.brand) app.doc.brand = { name: '', accent: '', logo: '' };

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

    const brandHeading = document.createElement('h3');
    brandHeading.className = 'section-heading';
    brandHeading.textContent = 'EXPORTED PAGE';
    form.appendChild(brandHeading);
    form.appendChild(
      makeField(
        'prop-brand-name',
        'Brand name',
        makeTextInput(app.doc.brand?.name || '', (value) => {
          app.doc.brand.name = value.slice(0, 80);
          renderAll(false);
        }),
      ),
    );

    const accentInput = document.createElement('input');
    accentInput.type = 'color';
    accentInput.className = 'prop-color';
    accentInput.value = normalizeBrandAccent(app.doc.brand?.accent) || '#1d4ed8';
    accentInput.addEventListener('focus', () => beginHistoryGesture());
    accentInput.addEventListener('blur', () => endHistoryGesture());
    accentInput.addEventListener('input', () => {
      pushHistory();
      app.doc.brand.accent = normalizeBrandAccent(accentInput.value);
      renderAll(false);
    });
    const accentField = makeField('prop-brand-accent', 'Brand color', accentInput);
    if (app.doc.brand?.accent) {
      const clearAccent = document.createElement('button');
      clearAccent.type = 'button';
      clearAccent.className = 'btn btn-compact';
      clearAccent.textContent = 'Use default color';
      clearAccent.addEventListener('click', () => {
        pushHistory();
        app.doc.brand.accent = '';
        renderAll(true);
      });
      accentField.appendChild(clearAccent);
    }
    form.appendChild(accentField);

    const logoInput = document.createElement('input');
    logoInput.type = 'file';
    logoInput.className = 'prop-file';
    logoInput.accept = 'image/png,image/jpeg,image/gif,image/webp,image/svg+xml';
    const logoHint = document.createElement('p');
    logoHint.className = 'prop-hint';
    logoHint.hidden = true;
    logoInput.addEventListener('change', () => {
      const picked = logoInput.files?.[0];
      logoInput.value = '';
      if (!picked) return;
      if (!picked.type.startsWith('image/') || picked.size > 280_000) {
        logoHint.hidden = false;
        logoHint.textContent = 'Use a PNG, JPEG, GIF, WebP, or SVG image under 280 KB.';
        return;
      }
      const reader = new FileReader();
      reader.addEventListener('load', () => {
        const url = sanitizeIconImage(String(reader.result || ''));
        if (!url) {
          logoHint.hidden = false;
          logoHint.textContent = 'That image could not be used. Choose a smaller PNG, JPEG, GIF, WebP, or SVG.';
          return;
        }
        pushHistory();
        app.doc.brand.logo = url;
        logoHint.hidden = true;
        renderAll(true);
      });
      reader.readAsDataURL(picked);
    });
    const logoField = makeField('prop-brand-logo', 'Logo', logoInput);
    logoField.appendChild(logoHint);
    if (app.doc.brand?.logo) {
      const clearLogo = document.createElement('button');
      clearLogo.type = 'button';
      clearLogo.className = 'btn btn-compact';
      clearLogo.textContent = 'Remove logo';
      clearLogo.addEventListener('click', () => {
        pushHistory();
        app.doc.brand.logo = '';
        renderAll(true);
      });
      logoField.appendChild(clearLogo);
    }
    form.appendChild(logoField);
    const brandNote = document.createElement('p');
    brandNote.className = 'prop-hint';
    brandNote.textContent = 'The name, color, and logo appear on the exported page header. The canvas preview uses them too.';
    form.appendChild(brandNote);

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

function lineageOutsideSelection(selected: DiagramNode[]): {
  upstream: DiagramNode[];
  downstream: DiagramNode[];
} {
  const selectedIds = new Set(selected.map((node) => node.id));
  const upstream = new Map<string, DiagramNode>();
  const downstream = new Map<string, DiagramNode>();
  for (const node of selected) {
    const adj = getAdjacencyLists(app.doc, node.id);
    for (const source of adj.upstream) {
      if (!selectedIds.has(source.id)) upstream.set(source.id, source);
    }
    for (const consumer of adj.downstream) {
      if (!selectedIds.has(consumer.id)) downstream.set(consumer.id, consumer);
    }
  }
  return { upstream: [...upstream.values()], downstream: [...downstream.values()] };
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
      renderSimulationEditor();
      return;
    }
  }

  if (sel.type === 'multi') {
    const selected = sel.ids
      .map((id) => app.doc.nodes.find((node) => node.id === id))
      .filter((node): node is DiagramNode => node !== undefined);
    if (selected.length > 0) {
      const lineage = lineageOutsideSelection(selected);
      withInspectorTransition(() => {
        inspBadge.textContent = 'MULTI-SELECT';
        inspId.textContent = `${selected.length} SELECTED`;
        inspTitle.textContent = `${selected.length} components`;
        inspSummary.textContent = selected.map((node) => node.title).join(', ');
        renderMetricsBoxes([
          { label: 'Selected', value: `${selected.length}` },
          { label: 'Upstream', value: `${lineage.upstream.length}` },
          { label: 'Downstream', value: `${lineage.downstream.length}` },
        ]);
        renderLineageRows(lineage.upstream, lineage.downstream);
        inspCode.textContent = JSON.stringify(
          {
            selected: selected.map((node) => node.id),
            upstream: lineage.upstream.map((node) => node.id),
            downstream: lineage.downstream.map((node) => node.id),
          },
          null,
          2,
        );
      });
      renderSimulationEditor();
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
  renderSimulationEditor();
}

/** Copy generated flows onto the document the first time they are edited. */
function authoredSimulations(): SimulationScenario[] {
  if (app.doc.simulations.length === 0) {
    app.doc.simulations = structuredClone(getEffectiveSimulations(app.doc));
  }
  return app.doc.simulations;
}

function liveScenario(id: string): SimulationScenario | undefined {
  return authoredSimulations().find((scenario) => scenario.id === id);
}

function liveStep(simId: string, stepId: string): SimulationStep | undefined {
  return liveScenario(simId)?.steps.find((step) => step.id === stepId);
}

export function addSimulationScenario(): void {
  pushHistory();
  const list = authoredSimulations();
  const first = app.doc.nodes[0];
  list.push({
    id: nextUid('sim'),
    name: 'Custom Scenario',
    tone: 'blue',
    steps: first
      ? [
          {
            id: nextUid('step'),
            nodes: [first.id],
            tone: 'blue',
            label: first.title.toUpperCase(),
            trace: `${first.title} processed a packet.`,
          },
        ]
      : [],
  });
  renderSimButtons();
  renderSimulationEditor(true);
}

export function renderSimulationEditor(force = false): void {
  const active = document.activeElement;
  if (
    !force &&
    active instanceof HTMLElement &&
    panelSimulations.contains(active) &&
    active.matches('input, textarea')
  ) {
    return;
  }

  const authored = app.doc.simulations.length > 0;
  const scenarios = authored ? app.doc.simulations : getEffectiveSimulations(app.doc);
  if (!authored && scenarios.length > 0) {
    simEditorHint.textContent =
      'Generated from the wires. The first edit saves a copy on this blueprint.';
  } else if (authored) {
    simEditorHint.textContent =
      'Saved on this blueprint. Remove every scenario to restore the generated flows.';
  } else {
    simEditorHint.textContent =
      'No flows yet. Add a scenario, then choose the components each hop visits.';
  }

  simEditorList.replaceChildren();
  scenarios.forEach((scenario, scenarioIndex) => {
    const card = document.createElement('section');
    card.className = 'sim-editor-card';
    card.dataset.simId = scenario.id;

    const form = document.createElement('div');
    form.className = 'prop-form';
    form.append(
      makeField(
        `sim-name-${scenarioIndex}`,
        'Scenario name',
        makeTextInput(scenario.name, (value) => {
          const live = liveScenario(scenario.id);
          if (live) live.name = value;
          renderSimButtons();
        }),
      ),
      makeField(
        `sim-tone-${scenarioIndex}`,
        'Button tone',
        makeTonePicker(`sim-tone-${scenario.id}`, scenario.tone, (tone) => {
          const live = liveScenario(scenario.id);
          if (!live) return;
          live.tone = tone;
          renderSimButtons();
        }),
      ),
    );

    const actions = document.createElement('div');
    actions.className = 'sim-card-actions';
    const play = document.createElement('button');
    play.type = 'button';
    play.className = 'btn btn-compact';
    play.textContent = 'Play';
    play.addEventListener('click', () => runSimulation(scenario.id));
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'btn btn-compact btn-reject';
    remove.textContent = 'Remove';
    remove.addEventListener('click', () => {
      const saved = app.doc.simulations.length > 0;
      if (!saved && getEffectiveSimulations(app.doc).length <= 1) return;
      pushHistory();
      const list = authoredSimulations();
      const index = list.findIndex((item) => item.id === scenario.id);
      if (index >= 0) list.splice(index, 1);
      renderSimButtons();
      renderSimulationEditor(true);
    });
    actions.append(play, remove);

    const stepsHeading = document.createElement('h3');
    stepsHeading.className = 'section-heading';
    stepsHeading.textContent = 'HOPS';

    const steps = document.createElement('div');
    scenario.steps.forEach((step, stepIndex) => {
      const box = document.createElement('div');
      box.className = 'sim-step';

      const label = makeTextInput(step.label, (value) => {
        const live = liveStep(scenario.id, step.id);
        if (live) live.label = value;
      });
      label.setAttribute('aria-label', `Hop ${stepIndex + 1} label`);
      const trace = makeTextarea(step.trace, (value) => {
        const live = liveStep(scenario.id, step.id);
        if (live) live.trace = value;
      });
      trace.rows = 2;
      trace.setAttribute('aria-label', `Hop ${stepIndex + 1} trace`);

      const tone = makeTonePicker(`step-tone-${scenario.id}-${step.id}`, step.tone, (next) => {
        const live = liveStep(scenario.id, step.id);
        if (live) live.tone = next;
      });

      const chips = document.createElement('div');
      chips.className = 'lineage-chips';
      if (app.doc.nodes.length === 0) {
        const empty = document.createElement('span');
        empty.className = 'prop-hint';
        empty.textContent = 'Add a component before assigning hops.';
        chips.appendChild(empty);
      }
      for (const node of app.doc.nodes) {
        const chip = document.createElement('button');
        chip.type = 'button';
        chip.className = 'lineage-chip sim-node-chip';
        chip.textContent = node.title;
        chip.setAttribute('aria-pressed', String(step.nodes.includes(node.id)));
        chip.addEventListener('click', () => {
          pushHistory();
          const live = liveStep(scenario.id, step.id);
          if (!live) return;
          if (live.nodes.includes(node.id)) live.nodes = live.nodes.filter((id) => id !== node.id);
          else live.nodes.push(node.id);
          renderSimulationEditor(true);
        });
        chips.appendChild(chip);
      }

      const stepActions = document.createElement('div');
      stepActions.className = 'sim-step-actions';
      const up = document.createElement('button');
      up.type = 'button';
      up.className = 'btn btn-compact';
      up.textContent = 'Up';
      up.disabled = stepIndex === 0;
      up.addEventListener('click', () => moveSimulationStep(scenario.id, step.id, -1));
      const down = document.createElement('button');
      down.type = 'button';
      down.className = 'btn btn-compact';
      down.textContent = 'Down';
      down.disabled = stepIndex === scenario.steps.length - 1;
      down.addEventListener('click', () => moveSimulationStep(scenario.id, step.id, 1));
      const drop = document.createElement('button');
      drop.type = 'button';
      drop.className = 'btn btn-compact btn-reject';
      drop.textContent = 'Delete hop';
      drop.addEventListener('click', () => {
        pushHistory();
        const live = liveScenario(scenario.id);
        if (!live) return;
        live.steps = live.steps.filter((item) => item.id !== step.id);
        renderSimButtons();
        renderSimulationEditor(true);
      });
      stepActions.append(up, down, drop);

      box.append(
        makeField(`sim-step-label-${scenarioIndex}-${stepIndex}`, `Hop ${stepIndex + 1}`, label),
        makeField(`sim-step-tone-${scenarioIndex}-${stepIndex}`, 'Hop tone', tone),
        makeField(`sim-step-trace-${scenarioIndex}-${stepIndex}`, 'Trace', trace),
        chips,
        stepActions,
      );
      steps.appendChild(box);
    });

    const addStep = document.createElement('button');
    addStep.type = 'button';
    addStep.className = 'btn btn-compact';
    addStep.textContent = 'Add hop';
    addStep.addEventListener('click', () => {
      pushHistory();
      const live = liveScenario(scenario.id);
      if (!live) return;
      const node =
        app.doc.nodes.find((item) => !live.steps.some((st) => st.nodes.includes(item.id))) ||
        app.doc.nodes[0];
      live.steps.push({
        id: nextUid('step'),
        nodes: node ? [node.id] : [],
        tone: live.tone,
        label: node ? node.title.toUpperCase() : `STEP ${live.steps.length + 1}`,
        trace: node ? `${node.title} processed a packet.` : 'Processed telemetry step.',
      });
      renderSimButtons();
      renderSimulationEditor(true);
    });

    card.append(form, actions, stepsHeading, steps, addStep);
    simEditorList.appendChild(card);
  });
}

function moveSimulationStep(simId: string, stepId: string, direction: -1 | 1): void {
  const current = app.doc.simulations.find((scenario) => scenario.id === simId);
  const fromGenerated = !current;
  const preview = current || getEffectiveSimulations(app.doc).find((scenario) => scenario.id === simId);
  if (!preview) return;
  const index = preview.steps.findIndex((step) => step.id === stepId);
  const next = index + direction;
  if (index < 0 || next < 0 || next >= preview.steps.length) return;
  pushHistory();
  const live = fromGenerated ? liveScenario(simId) : current;
  if (!live) return;
  const [step] = live.steps.splice(index, 1);
  if (!step) return;
  live.steps.splice(next, 0, step);
  renderSimButtons();
  renderSimulationEditor(true);
}
