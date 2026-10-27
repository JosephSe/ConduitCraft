/** Lightweight toast notifications and undo-aware user feedback. */

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

function getToastContainer(): HTMLElement | null {
  if (typeof document === 'undefined') return null;
  let container = document.getElementById('toast-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toast-container';
    container.className = 'toast-container';
    container.setAttribute('aria-live', 'polite');
    container.setAttribute('aria-atomic', 'true');
    document.body.appendChild(container);
  }
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

  // Cap maximum visible toasts to 4
  if (activeToasts.size >= 4) {
    const oldestKey = activeToasts.keys().next().value;
    if (oldestKey !== undefined) {
      dismissToast(oldestKey);
    }
  }

  const toast = document.createElement('div');
  toast.className = `toast-item toast-${options.tone ?? 'normal'}`;
  toast.setAttribute('role', 'status');

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
