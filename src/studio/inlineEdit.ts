/**
 * Inline rename: a small text field laid over the element being renamed.
 *
 * The editor is a real <input> in a fixed-position layer rather than the element made editable in place, because
 * the canvas re-renders (and scales) its elements; an overlay survives that and keeps a readable size when zoomed out.
 */

export type InlineEditResult = { action: 'commit'; value: string } | { action: 'cancel' };

export interface InlineEditRules {
  /** Whether clearing the text is a valid result (a wire label can be empty; a component name cannot). */
  allowEmpty?: boolean;
  maxLength?: number;
}

/**
 * Decide what finishing an edit means: line breaks become spaces, the text is trimmed and capped, and an edit
 * that changes nothing (or would empty a name that must not be empty) is a cancel, so it records no undo step.
 */
export function resolveInlineEdit(original: string, typed: string, rules: InlineEditRules = {}): InlineEditResult {
  const { allowEmpty = false, maxLength = 120 } = rules;
  const cleaned = typed.replace(/\s*[\r\n]+\s*/g, ' ').trim().slice(0, maxLength).trim();
  if (cleaned === original.trim()) return { action: 'cancel' };
  if (cleaned === '' && !allowEmpty) return { action: 'cancel' };
  return { action: 'commit', value: cleaned };
}

export interface InlineEditAnchor {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface InlineEditTextStyle {
  fontSize: number;
  fontWeight: string;
  fontFamily: string;
  letterSpacing: string;
  textTransform: string;
}

export interface InlineEditOptions extends InlineEditRules {
  /** Screen rectangle of the text being replaced. */
  anchor: InlineEditAnchor;
  value: string;
  style?: Partial<InlineEditTextStyle>;
  ariaLabel: string;
  placeholder?: string;
  onCommit: (value: string) => void;
}

const MIN_FONT_PX = 12;
const MIN_WIDTH_PX = 160;
const VIEWPORT_MARGIN_PX = 6;

/** Size and place the field: at least a readable width, centred on the text, kept inside the window. */
export function layoutInlineEdit(
  anchor: InlineEditAnchor,
  viewport: { width: number; height: number },
): { left: number; top: number; width: number; height: number } {
  const width = Math.min(Math.max(anchor.width + 24, MIN_WIDTH_PX), viewport.width - 2 * VIEWPORT_MARGIN_PX);
  const height = Math.max(anchor.height + 8, 26);
  const clamp = (v: number, min: number, max: number) => Math.min(Math.max(v, min), Math.max(min, max));
  return {
    width,
    height,
    left: clamp(anchor.left + anchor.width / 2 - width / 2, VIEWPORT_MARGIN_PX, viewport.width - width - VIEWPORT_MARGIN_PX),
    top: clamp(anchor.top + anchor.height / 2 - height / 2, VIEWPORT_MARGIN_PX, viewport.height - height - VIEWPORT_MARGIN_PX),
  };
}

interface ActiveEdit {
  finish: (commit: boolean) => void;
}

let active: ActiveEdit | null = null;

export function isInlineEditing(): boolean {
  return active !== null;
}

/** Close the editor without changing anything. */
export function cancelInlineEdit(): void {
  active?.finish(false);
}

export function beginInlineEdit(options: InlineEditOptions): void {
  if (typeof document === 'undefined') return;
  // Starting a new edit while one is open (e.g. double-clicking another item) keeps what was typed.
  active?.finish(true);

  const returnFocusTo = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'inline-edit-input';
  input.value = options.value;
  input.setAttribute('aria-label', options.ariaLabel);
  input.setAttribute('autocomplete', 'off');
  input.spellcheck = false;
  if (options.placeholder) input.placeholder = options.placeholder;
  if (options.maxLength) input.maxLength = options.maxLength;

  const box = layoutInlineEdit(options.anchor, { width: window.innerWidth, height: window.innerHeight });
  input.style.left = `${box.left}px`;
  input.style.top = `${box.top}px`;
  input.style.width = `${box.width}px`;
  input.style.height = `${box.height}px`;
  const style = options.style ?? {};
  input.style.fontSize = `${Math.max(MIN_FONT_PX, style.fontSize ?? MIN_FONT_PX)}px`;
  if (style.fontWeight) input.style.fontWeight = style.fontWeight;
  if (style.fontFamily) input.style.fontFamily = style.fontFamily;
  if (style.letterSpacing) input.style.letterSpacing = style.letterSpacing;
  if (style.textTransform) input.style.textTransform = style.textTransform;

  let finished = false;
  const finish = (commit: boolean): void => {
    if (finished) return;
    finished = true;
    active = null;
    window.removeEventListener('wheel', onViewChange, true);
    window.removeEventListener('resize', onViewChange);
    const typed = input.value;
    input.remove();
    if (returnFocusTo?.isConnected) returnFocusTo.focus({ preventScroll: true });
    if (!commit) return;
    const result = resolveInlineEdit(options.value, typed, options);
    if (result.action === 'commit') options.onCommit(result.value);
  };
  // Zooming, panning or resizing moves the element out from under the field, so settle the edit.
  const onViewChange = (): void => finish(true);

  input.addEventListener('keydown', (event) => {
    // Keep typing away from the global shortcuts (Delete, arrows, Escape-to-deselect, ...).
    event.stopPropagation();
    if (event.key === 'Enter' && !event.isComposing) {
      event.preventDefault();
      finish(true);
    } else if (event.key === 'Escape') {
      event.preventDefault();
      finish(false);
    }
  });
  input.addEventListener('blur', () => finish(true));
  for (const type of ['pointerdown', 'pointerup', 'click', 'dblclick', 'contextmenu']) {
    input.addEventListener(type, (event) => event.stopPropagation());
  }
  window.addEventListener('wheel', onViewChange, { capture: true, passive: true });
  window.addEventListener('resize', onViewChange);

  active = { finish };
  document.body.appendChild(input);
  input.focus();
  input.select();
}
