/**
 * Which interface generation to show: 1 (classic) or 2 (the redesign). `?ui=2` or `?ui=1` in the URL chooses and is
 * remembered; with no parameter the remembered choice (or the default) applies. Pure so it is unit tested.
 */
export type UiVersion = 1 | 2;

export const UI_VERSION_STORAGE_KEY = 'conduitcraft-ui';
/** The redesign is the default. `?ui=1`, or "Classic layout" in settings, brings the classic chrome back. */
export const DEFAULT_UI_VERSION: UiVersion = 2;

export interface UiStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

function parse(value: string | null): UiVersion | null {
  return value === '1' ? 1 : value === '2' ? 2 : null;
}

export function resolveUiVersion(search: string, storage: UiStorage | null): UiVersion {
  const fromUrl = parse(new URLSearchParams(search).get('ui'));
  if (fromUrl) {
    try {
      storage?.setItem(UI_VERSION_STORAGE_KEY, String(fromUrl));
    } catch {
      // Private mode or full storage: the choice just lasts for this page view.
    }
    return fromUrl;
  }
  try {
    return parse(storage?.getItem(UI_VERSION_STORAGE_KEY) ?? null) ?? DEFAULT_UI_VERSION;
  } catch {
    return DEFAULT_UI_VERSION;
  }
}
