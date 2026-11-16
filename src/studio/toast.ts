/** Lightweight toast notifications and undo-aware user feedback. */
import { announce } from './a11y';

export interface ToastAction {
  label: string;
  onClick: () => void;
}

export interface ToastOptions {
  duration?: number;
  action?: ToastAction;
  tone?: 'normal' | 'error' | 'success';
}

export interface ToastInstance {
  id: number;
  message: string;
  dismiss: () => void;
}

let nextToastId = 1;
const activeToasts = new Map<number, { element: HTMLElement; timer: ReturnType<typeof setTimeout> | null }>();

/** Distance from the viewport bottom used when the canvas HUD can't be measured (4.75rem). */
export const TOAST_FALLBACK_BOTTOM_PX = 76;
const TOAST_HUD_GAP_PX = 8;

/**
 * How far above the viewport bottom toasts should sit so they clear the canvas HUD.
 * The HUD wraps onto more rows as it fills up, so a fixed offset eventually collides with it.
 */
export function toastBottomOffset(viewportHeight: number, hudTop: number | null): number {
  if (hudTop === null || !Number.isFinite(hudTop) || hudTop <= 0 || hudTop > viewportHeight) {
    return TOAST_FALLBACK_BOTTOM_PX;
  }
  return Math.round(viewportHeight - hudTop + TOAST_HUD_GAP_PX);
}

let hudTracked = false;

/** Keep `--toast-bottom` in step with the top of the bottom slots (SW, S, SE) so toasts always sit just above them. */
function trackHudClearance(container: HTMLElement): void {
  if (hudTracked || typeof ResizeObserver === 'undefined') return;
  const slots = [...document.querySelectorAll<HTMLElement>('.slot-sw, .slot-s, .slot-se')];
  if (!slots.length) return;
  hudTracked = true;
  const update = () => {
    const tops = slots.filter((el) => el.getBoundingClientRect().height > 0).map((el) => el.getBoundingClientRect().top);
    const top = tops.length ? Math.min(...tops) : null;
    container.style.setProperty('--toast-bottom', `${toastBottomOffset(window.innerHeight, top)}px`);
  };
  const observer = new ResizeObserver(update);
  for (const el of slots) observer.observe(el);
  window.addEventListener('resize', update);
  update();
}

function getToastContainer(): HTMLElement | null {
  if (typeof document === 'undefined') return null;
  let container = document.getElementById('toast-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toast-container';
    container.className = 'toast-container';
    document.body.appendChild(container);
  }
  trackHudClearance(container);
  return container;
}

/** Show a toast notification. Returns a dismiss function. */
export function notify(message: string, options: ToastOptions = {}): () => void {
  const container = getToastContainer();
  const id = nextToastId++;
  const duration = options.duration ?? (options.action ? 5500 : 3500);

  if (!container) {
    return () => {};
  }

  // The single announcer speaks every toast; the toast markup itself is silent so nothing is read twice.
  announce(message, options.tone === 'error' ? 'assertive' : 'polite');

  // Cap maximum visible toasts to 4
  if (activeToasts.size >= 4) {
    const oldestKey = activeToasts.keys().next().value;
    if (oldestKey !== undefined) {
      dismissToast(oldestKey);
    }
  }

  const toast = document.createElement('div');
  toast.className = `toast-item toast-${options.tone ?? 'normal'}`;

  const textSpan = document.createElement('span');
  textSpan.className = 'toast-message';
  textSpan.textContent = message;
  toast.appendChild(textSpan);

  if (options.action) {
    const actionBtn = document.createElement('button');
    actionBtn.type = 'button';
    actionBtn.className = 'toast-action-btn';
    actionBtn.textContent = options.action.label;
    actionBtn.addEventListener('click', () => {
      options.action?.onClick();
      dismissToast(id);
    });
    toast.appendChild(actionBtn);
  }

  const dismissBtn = document.createElement('button');
  dismissBtn.type = 'button';
  dismissBtn.className = 'toast-dismiss-btn';
  dismissBtn.setAttribute('aria-label', 'Dismiss notification');
  dismissBtn.innerHTML = '&times;';
  dismissBtn.addEventListener('click', () => dismissToast(id));
  toast.appendChild(dismissBtn);

  container.appendChild(toast);

  let timer: ReturnType<typeof setTimeout> | null = null;
  if (duration > 0) {
    timer = setTimeout(() => {
      dismissToast(id);
    }, duration);
  }

  activeToasts.set(id, { element: toast, timer });

  return () => dismissToast(id);
}

export function dismissToast(id: number): void {
  const record = activeToasts.get(id);
  if (!record) return;
  activeToasts.delete(id);

  if (record.timer !== null) {
    clearTimeout(record.timer);
    record.timer = null;
  }

  const el = record.element;
  el.classList.add('is-dismissing');
  el.addEventListener(
    'animationend',
    () => {
      el.remove();
    },
    { once: true },
  );

  // Fallback in case animationend does not fire (e.g. reduced motion or hidden tab)
  setTimeout(() => {
    if (el.parentNode) {
      el.remove();
    }
  }, 250);
}

export function dismissAllToasts(): void {
  for (const id of Array.from(activeToasts.keys())) {
    dismissToast(id);
  }
}
