// Minimal TOML encoder for theme manifests (download path only).
//
// The server's download endpoint emits TOML; local / built-in themes live
// only in this browser's localStorage, so their download is built
// client-side here in the same format. Output must re-parse through the
// backend's decodeThemeManifest (BurntSushi/toml): top-level
// id/name/description/builtin scalars plus [spec.*] tables.

export interface ThemeManifestInput {
  id: string;
  name: string;
  description: string;
  builtin: boolean;
  spec: unknown;
}

// Escape a string as a TOML basic string (double-quoted, JSON-style
// escapes for backslash/quote/control chars so multiline CSS survives).
function tomlString(s: string): string {
  return (
    '"' +
    s
      .replace(/\\/g, '\\\\')
      .replace(/"/g, '\\"')
      .replace(/\n/g, '\\n')
      .replace(/\r/g, '\\r')
      .replace(/\t/g, '\\t')
      .replace(/[\u0000-\u0008\u000a-\u001f\u007f]/g, (c) => `\\u${c.charCodeAt(0).toString(16).padStart(4, '0')}`) +
    '"'
  );
}

function isBareKey(k: string): boolean {
  return /^[A-Za-z0-9_-]+$/.test(k);
}

function fmtKey(k: string): string {
  return isBareKey(k) ? k : tomlString(k);
}

function fmtPath(path: string[]): string {
  return path.map(fmtKey).join('.');
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function fmtScalar(v: unknown): string | null {
  if (typeof v === 'string') return tomlString(v);
  if (typeof v === 'boolean') return v ? 'true' : 'false';
  if (typeof v === 'number') {
    if (!Number.isFinite(v)) return null;
    return Number.isInteger(v) ? String(v) : String(v);
  }
  return null;
}

// Inline a primitive-only array (e.g. tags). Returns null when the array
// holds tables (caller then emits [[table]] blocks instead).
function fmtInlineArray(arr: unknown[]): string | null {
  const parts: string[] = [];
  for (const item of arr) {
    if (item === null || item === undefined) return null;
    if (Array.isArray(item) || isPlainObject(item)) return null;
    const s = fmtScalar(item);
    if (s === null) return null;
    parts.push(s);
  }
  return `[${parts.join(', ')}]`;
}

// Encode one table body: scalar keys first, then sub-tables / arrays of
// tables. null/undefined values are skipped (TOML has no null).
function encodeTable(path: string[], obj: Record<string, unknown>, out: string[]): void {
  for (const [k, v] of Object.entries(obj)) {
    if (v === null || v === undefined) continue;
    if (isPlainObject(v) || Array.isArray(v)) continue;
    const s = fmtScalar(v);
    if (s === null) continue;
    out.push(`${fmtKey(k)} = ${s}`);
  }
  for (const [k, v] of Object.entries(obj)) {
    if (v === null || v === undefined) continue;
    if (Array.isArray(v)) {
      if (v.length === 0) continue;
      const inline = fmtInlineArray(v);
      if (inline !== null) {
        out.push(`${fmtKey(k)} = ${inline}`);
        continue;
      }
      // Array of tables.
      for (const item of v) {
        if (!isPlainObject(item)) continue;
        out.push('');
        out.push(`[[${fmtPath([...path, k])}]]`);
        encodeTable([...path, k], item, out);
      }
      continue;
    }
    if (isPlainObject(v)) {
      out.push('');
      out.push(`[${fmtPath([...path, k])}]`);
      encodeTable([...path, k], v, out);
    }
  }
}

export function themeManifestToToml(m: ThemeManifestInput): string {
  const out: string[] = [];
  out.push(`id = ${tomlString(m.id)}`);
  out.push(`name = ${tomlString(m.name)}`);
  out.push(`description = ${tomlString(m.description ?? '')}`);
  out.push(`builtin = ${m.builtin ? 'true' : 'false'}`);
  if (isPlainObject(m.spec)) {
    out.push('');
    out.push('[spec]');
    encodeTable(['spec'], m.spec as Record<string, unknown>, out);
  }
  return out.join('\n') + '\n';
}
