/** Reuse child elements by key. Callers update survivors instead of rebuilding them. */
export function reconcileKeyed<T>(
  parent: Element,
  items: T[],
  keyOf: (item: T) => string,
  keyFromEl: (el: Element) => string | undefined,
  signatureOf: (item: T) => string,
  create: (item: T) => Element,
  update: (el: Element, item: T) => void,
): void {
  const existing = new Map<string, Element>();
  // Keyed children in their current DOM order, used to avoid needless re-insertion below.
  const domOrder: Element[] = [];
  for (const child of Array.from(parent.children)) {
    const key = keyFromEl(child);
    if (key) {
      existing.set(key, child);
      domOrder.push(child);
    }
  }
  // While true, everything processed so far already sits in its final position.
  let inPlace = true;
  let cursor = 0;

  const seen = new Set<string>();
  for (const item of items) {
    const key = keyOf(item);
    seen.add(key);
    const signature = signatureOf(item);
    const prev = existing.get(key);
    if (prev && prev.getAttribute('data-structure') === signature) {
      update(prev, item);
      // Re-appending an element that is already in order still detaches and reinserts it,
      // invalidating style/layout. Only move it once the DOM order has diverged.
      if (inPlace && domOrder[cursor] === prev) {
        cursor += 1;
      } else {
        inPlace = false;
        parent.appendChild(prev);
      }
      continue;
    }
    inPlace = false;
    prev?.remove();
    const created = create(item);
    created.setAttribute('data-structure', signature);
    update(created, item);
    parent.appendChild(created);
  }

  for (const [key, el] of existing) {
    if (!seen.has(key)) el.remove();
  }
}
