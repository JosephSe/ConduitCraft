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
  for (const child of Array.from(parent.children)) {
    const key = keyFromEl(child);
    if (key) existing.set(key, child);
  }

  const seen = new Set<string>();
  for (const item of items) {
    const key = keyOf(item);
    seen.add(key);
    const signature = signatureOf(item);
    const prev = existing.get(key);
    if (prev && prev.getAttribute('data-structure') === signature) {
      update(prev, item);
      parent.appendChild(prev);
      continue;
    }
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
