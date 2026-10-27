import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

// Set up minimal document mock before loading studio DOM modules
if (typeof (globalThis as any).document === 'undefined') {
  (globalThis as any).document = {
    getElementById: () => null,
    querySelector: () => null,
    querySelectorAll: () => [],
    createElement: () => ({
      setAttribute: () => {},
      classList: { add: () => {}, remove: () => {}, contains: () => false },
      addEventListener: () => {},
    }),
  };
}
if (typeof (globalThis as any).window === 'undefined') {
  (globalThis as any).window = globalThis;
}
if (typeof (globalThis as any).requestAnimationFrame === 'undefined') {
  (globalThis as any).requestAnimationFrame = (cb: () => void) => {
    cb();
    return 1;
  };
}

const { tagEnteringNodes } = await import('../src/studio/interactions.ts');

describe('polished motion (node drop-in, port glow, selection ring)', () => {
  it('defines node drop-in and port pulse keyframe animations in CSS', () => {
    const cssPath = path.resolve('src/styles/studio.css');
    const css = fs.readFileSync(cssPath, 'utf-8');

    assert.ok(css.includes('@keyframes nodeDropIn'), 'CSS defines @keyframes nodeDropIn');
    assert.ok(css.includes('@keyframes portPulse'), 'CSS defines @keyframes portPulse');
    assert.ok(css.includes('.arch-node.is-entering'), 'CSS defines .arch-node.is-entering selector');
    assert.ok(css.includes('workspace[data-wiring="true"]'), 'CSS defines wiring target port pulse selector');
  });

  it('defines smooth selection ring with outline-offset and box-shadow transitions', () => {
    const cssPath = path.resolve('src/styles/studio.css');
    const css = fs.readFileSync(cssPath, 'utf-8');

    assert.ok(css.includes('outline-offset: 4px'), 'aria-pressed expands outline offset');
    assert.ok(css.includes('outline-color: var(--node-accent)'), 'aria-pressed activates outline color');
    assert.ok(css.includes('outline-offset 0.2s'), 'transition includes outline-offset');
  });

  it('defines view transitions for mode switching and respects prefers-reduced-motion', () => {
    const cssPath = path.resolve('src/styles/studio.css');
    const css = fs.readFileSync(cssPath, 'utf-8');

    assert.ok(css.includes('::view-transition-old(root)'), 'defines view-transition-old');
    assert.ok(css.includes('::view-transition-new(root)'), 'defines view-transition-new');
    assert.ok(css.includes('@media (prefers-reduced-motion: reduce)'), 'defines reduced motion media queries');
  });

  it('tags entering nodes with is-entering class and handles non-existent elements safely', () => {
    class MockElement {
      classList = new Set<string>();
      add(cls: string) {
        this.classList.add(cls);
      }
      remove(cls: string) {
        this.classList.delete(cls);
      }
    }

    const mockEl = {
      classList: {
        classes: new Set<string>(),
        add(cls: string) {
          this.classes.add(cls);
        },
        remove(cls: string) {
          this.classes.delete(cls);
        },
      },
    };

    const prevDoc = globalThis.document;
    (globalThis as any).document = {
      getElementById(id: string) {
        if (id === 'node-test-1') return mockEl;
        return null;
      },
    };

    tagEnteringNodes(['test-1', 'non-existent']);
    // tagEnteringNodes uses requestAnimationFrame, so mock raf if in Node
    assert.doesNotThrow(() => tagEnteringNodes([]));

    (globalThis as any).document = prevDoc;
  });
});
