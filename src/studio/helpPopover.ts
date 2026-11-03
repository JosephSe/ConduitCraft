/**
 * Contextual help (R-10): one popover shared by every `?` button and every "Help: ..." palette command.
 * A `?` is any element with `data-help="<topic id>"`; clicks are handled here by delegation, so buttons that
 * the inspector rebuilds on each selection need no wiring. The text comes from `core/helpTopics.ts`.
 * Esc closes the popover and returns focus to the button that opened it.
 */
import { guideUrl, helpTopic, type HelpTopic } from '../core/helpTopics';
import { placeTooltip } from './tooltips';

const POPOVER_ID = 'help-popover';
let opener: HTMLElement | null = null;

/** A `?` button for `topicId`. Used by the inspector, which builds its sections in code. */
export function helpButton(topicId: string): HTMLButtonElement {
  const topic = helpTopic(topicId);
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'help-btn';
  button.dataset.help = topicId;
  button.textContent = '?';
  button.setAttribute('aria-label', `Help: ${topic?.title ?? topicId}`);
  button.setAttribute('aria-haspopup', 'dialog');
  button.setAttribute('aria-expanded', 'false');
  return button;
}

function popover(): HTMLElement {
  let el = document.getElementById(POPOVER_ID);
  if (el) return el;
  el = document.createElement('div');
  el.id = POPOVER_ID;
  el.className = 'help-popover';
  el.setAttribute('role', 'dialog');
  el.setAttribute('aria-labelledby', `${POPOVER_ID}-title`);
  el.setAttribute('aria-describedby', `${POPOVER_ID}-body`);
  el.tabIndex = -1;
  el.hidden = true;
  document.body.appendChild(el);
  return el;
}

export function isHelpOpen(): boolean {
  const el = document.getElementById(POPOVER_ID);
  return Boolean(el && !el.hidden);
}

export function closeHelp(restoreFocus = true): void {
  const el = document.getElementById(POPOVER_ID);
  if (!el || el.hidden) return;
  el.hidden = true;
  opener?.setAttribute('aria-expanded', 'false');
  if (restoreFocus && opener?.isConnected) opener.focus();
  opener = null;
}

function fill(el: HTMLElement, topic: HelpTopic): void {
  const title = document.createElement('h2');
  title.id = `${POPOVER_ID}-title`;
  title.className = 'help-popover-title';
  title.textContent = topic.title;
  const body = document.createElement('p');
  body.id = `${POPOVER_ID}-body`;
  body.className = 'help-popover-body';
  body.textContent = topic.body;
  const link = document.createElement('a');
  link.className = 'help-popover-link';
  link.href = guideUrl(topic);
  link.target = '_blank';
  link.rel = 'noopener noreferrer';
  link.textContent = 'Read more in the guide';
  el.replaceChildren(title, body, link);
}

/** Open the popover for a topic, beside `anchor` when there is one and at the top of the canvas when there is not. */
export function openHelp(topicId: string, anchor?: HTMLElement | null): void {
  const topic = helpTopic(topicId);
  if (!topic) return;
  closeHelp(false);
  const el = popover();
  fill(el, topic);
  el.hidden = false;
  opener = anchor ?? null;
  anchor?.setAttribute('aria-expanded', 'true');

  const viewport = { width: window.innerWidth, height: window.innerHeight };
  const size = { width: el.offsetWidth, height: el.offsetHeight };
  const box = anchor?.getBoundingClientRect() ?? new DOMRect(viewport.width / 2, 72, 0, 0);
  const spot = placeTooltip({ x: box.x, y: box.y, width: box.width, height: box.height }, size, viewport, 'top');
  el.style.insetInlineStart = `${spot.x}px`;
  el.style.insetBlockStart = `${spot.y}px`;
  el.focus({ preventScroll: true });
}

export function initHelp(): void {
  document.addEventListener('click', (e) => {
    const target = e.target as HTMLElement;
    const button = target.closest<HTMLElement>('[data-help]');
    if (button) {
      // A `?` inside a <summary> must not also open or close its section.
      e.preventDefault();
      e.stopPropagation();
      if (isHelpOpen() && opener === button) closeHelp();
      else openHelp(button.dataset.help ?? '', button);
      return;
    }
    if (isHelpOpen() && !target.closest(`#${POPOVER_ID}`)) closeHelp(false);
  }, true);

  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape' || !isHelpOpen()) return;
    e.preventDefault();
    e.stopPropagation();
    closeHelp();
  }, true);
}
