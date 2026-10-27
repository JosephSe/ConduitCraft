/** Brand lockup shared by the document inspector, parser, and exported page. */
import type { DiagramBrand } from '../types';
import { sanitizeIconImage } from './nodeStyle';

export const EMPTY_BRAND: DiagramBrand = { name: '', accent: '', logo: '' };

export function normalizeBrandAccent(raw: unknown): string {
  if (typeof raw !== 'string') return '';
  const match = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(raw.trim());
  if (!match) return '';
  const hex = match[1].toLowerCase();
  if (hex.length === 3) return `#${hex[0]}${hex[0]}${hex[1]}${hex[1]}${hex[2]}${hex[2]}`;
  return `#${hex}`;
}

export function normalizeBrand(raw: unknown): DiagramBrand {
  if (!raw || typeof raw !== 'object') return { ...EMPTY_BRAND };
  const source = raw as { name?: unknown; accent?: unknown; logo?: unknown };
  const name = typeof source.name === 'string' ? source.name.trim().slice(0, 80) : '';
  const accent = normalizeBrandAccent(source.accent);
  const logo = sanitizeIconImage(source.logo) || '';
  return { name, accent, logo };
}

export function brandIsDefault(brand: DiagramBrand | undefined): boolean {
  const next = normalizeBrand(brand);
  return !next.name && !next.accent && !next.logo;
}
