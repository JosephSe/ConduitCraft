import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';

// Setup minimal document mock for Node test environment
class MockElement {
  tagName: string;
  id = '';
  className = '';
  textContent = '';
  innerHTML = '';
  attributes = new Map<string, string>();
  children: MockElement[] = [];
  parentNode: MockElement | null = null;
  listeners = new Map<string, Array<(e?: unknown) => void>>();

  constructor(tagName: string) {
    this.tagName = tagName.toUpperCase();
  }

  setAttribute(name: string, value: string) {
    this.attributes.set(name, value);
  }

  getAttribute(name: string) {
    return this.attributes.get(name) ?? null;
  }

  appendChild(child: MockElement) {
    child.parentNode = this;
    this.children.push(child);
    return child;
  }

  removeChild(child: MockElement) {
    const idx = this.children.indexOf(child);
    if (idx !== -1) {
      this.children.splice(idx, 1);
      child.parentNode = null;
    }
    return child;
  }

  remove() {
    this.parentNode?.removeChild(this);
  }

  addEventListener(event: string, listener: (e?: unknown) => void) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, []);
    }
    this.listeners.get(event)!.push(listener);
  }

  dispatchEvent(event: string) {
    for (const listener of this.listeners.get(event) ?? []) {
      listener();
    }
  }

  classList = {
    add: (cls: string) => {
      this.className += ` ${cls}`;
    },
    remove: (cls: string) => {
      this.className = this.className.replace(cls, '').trim();
    },
    contains: (cls: string) => this.className.includes(cls),
  };
}

const mockBody = new MockElement('BODY');
const mockDoc = {
  body: mockBody,
  getElementById: (id: string) => {
    const find = (el: MockElement): MockElement | null => {
      if (el.id === id) return el;
      for (const child of el.children) {
        const found = find(child);
        if (found) return found;
      }
      return null;
    };
    return find(mockBody);
  },
  createElement: (tag: string) => new MockElement(tag),
};

// @ts-expect-error Mocking global document for test
globalThis.document = mockDoc;

import { notify, dismissAllToasts } from '../src/studio/toast.ts';

describe('toast notifications and status feedback', () => {
  beforeEach(() => {
    mockBody.children = [];
    dismissAllToasts();
  });

  afterEach(() => {
    dismissAllToasts();
  });

  it('renders a toast notification with role="status" and text message', () => {
    notify('Imported 5 components');
    const container = mockDoc.getElementById('toast-container');
    assert.ok(container, 'container exists');
    assert.strictEqual(container.children.length, 1);
    const toast = container.children[0];
    assert.strictEqual(toast.getAttribute('role'), 'status');
    const msg = toast.children.find((c) => c.className === 'toast-message');
    assert.ok(msg);
    assert.strictEqual(msg.textContent, 'Imported 5 components');
  });

  it('supports action callback (e.g. Undo)', () => {
    let actionTriggered = false;
    notify('Deleted platform node', {
      action: {
        label: 'Undo',
        onClick: () => {
          actionTriggered = true;
        },
      },
    });

    const container = mockDoc.getElementById('toast-container');
    assert.ok(container);
    const toast = container.children[0];
    const actionBtn = toast.children.find((c) => c.className === 'toast-action-btn');
    assert.ok(actionBtn);
    assert.strictEqual(actionBtn.textContent, 'Undo');

    actionBtn.dispatchEvent('click');
    assert.strictEqual(actionTriggered, true, 'action callback called');
  });

  it('allows manual dismiss of a toast', () => {
    const dismiss = notify('Saving blueprint...');
    const container = mockDoc.getElementById('toast-container');
    assert.ok(container);
    assert.strictEqual(container.children.length, 1);

    dismiss();
    // In our mock, is-dismissing class is added immediately
    assert.ok(container.children[0].classList.contains('is-dismissing'));
  });

  it('caps maximum active toasts to 4', () => {
    for (let i = 1; i <= 6; i++) {
      notify(`Message ${i}`);
    }
    const container = mockDoc.getElementById('toast-container');
    assert.ok(container);
    // At most 4 non-dismissing toasts
    const active = container.children.filter((c) => !c.classList.contains('is-dismissing'));
    assert.ok(active.length <= 4);
  });
});
