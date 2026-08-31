// Small colour-parsing helpers shared by the theme applier and themed
// components (Terminal, charts). Kept dependency-free and tiny.

export interface Rgb {
  r: number;
  g: number;
  b: number;
}

const HEX_RE = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;
const RGB_RE = /^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*(?:,\s*([\d.]+)\s*)?\)$/i;

// isHexColor reports whether v is a plain #rgb/#rrggbb/#rrggbbaa literal —
// the only safe input for contexts that require a concrete hex (SVG data
// URIs, xterm palette entries).
export function isHexColor(v: unknown): v is string {
  return typeof v === 'string' && HEX_RE.test(v.trim());
}

// parseColor resolves a theme colour token (hex or rgb/rgba) to channels so
// callers can re-emit it at a chosen alpha. Returns null for anything it
// cannot confidently parse ('transparent', gradients, var() references…);
// callers must fall back instead of guessing.
export function parseColor(v: unknown): (Rgb & { a: number }) | null {
  const s = String(v ?? '').trim();
  const m = s.match(RGB_RE);
  if (m) {
    const clamp = (x: string) => Math.max(0, Math.min(255, Math.round(Number(x))));
    return { r: clamp(m[1]), g: clamp(m[2]), b: clamp(m[3]), a: m[4] != null ? parseFloat(m[4]) : 1 };
  }
  if (!HEX_RE.test(s)) return null;
  let h = s.slice(1);
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  const a = h.length === 8 ? parseInt(h.slice(6, 8), 16) / 255 : 1;
  return { r, g, b, a };
}

// rgbaAt re-emits a parsed colour at a specific alpha (used for hairline
// borders / tinted fills derived from a solid accent token). Falls back to
// `fallback` when the input cannot be parsed.
export function rgbaAt(v: unknown, alpha: number, fallback: string): string {
  const c = parseColor(v);
  if (!c) return fallback;
  const a = Math.max(0, Math.min(1, alpha));
  return `rgba(${c.r}, ${c.g}, ${c.b}, ${a})`;
}
