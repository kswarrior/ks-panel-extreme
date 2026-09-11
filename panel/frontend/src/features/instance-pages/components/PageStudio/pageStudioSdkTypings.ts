// pageStudioSdkTypings — Monaco extra-lib text for the Studio React editor.
//
// SINGLE SOURCE OF TRUTH: the `sdk` shape is NOT re-declared here. The raw
// text of the real `customPageSdk.ts` module is bundled via Vite `?raw` and
// the interface/type blocks are sliced out of it at runtime, so adding a
// method to `CustomPageAPI` updates Studio hover types with no second list
// to keep in sync. Only the tiny `react` module shim + `JSX` namespace below
// are hand-written (the panel never ships `react` types to Monaco — the full
// `@types/react` bundle would cost ~100KiB for hooks pages never use).
import sdkSource from '@/shared/lib/customPageSdk.ts?raw';

// Every named type the `CustomPageAPI` interface references. If a new method
// adds a parameter type, add its name here (compile error nowhere — the
// extractor just skips unknown names and hover degrades to `any`, never a
// build break; the fallback below keeps the editor usable).
const WANTED_TYPES = [
  'InstanceContext',
  'ActionType',
  'PageAction',
  'ActionResult',
  'PageActionDef',
  'FileEntry',
  'ChartSeriesPoint',
  'ChartSeries',
  'ChartOptions',
  'PageWSEndpoint',
  'PageWSOptions',
  'CustomPageAPI',
];

// Extract one `export interface NAME ... }` or `export type NAME = ... ;`
// block from src. Brace matching runs on a length-preserving masked copy
// (comments/strings blanked) so `{`/`}` inside JSDoc `@example` snippets or
// string-literal unions (`'shell' | 'read_file'`) can't unbalance the scan;
// the slice itself comes from the ORIGINAL text (docs preserved for hover).
function extractTypeBlock(src: string, name: string): string | null {
  const head = new RegExp(`export\\s+(interface\\s+${name}\\b|type\\s+${name}\\b)`).exec(src);
  if (!head || head.index === undefined) return null;
  const masked = maskCommentsAndStrings(src);
  const isInterface = head[1].startsWith('interface');
  if (isInterface) {
    const open = masked.indexOf('{', head.index);
    if (open < 0) return null;
    let depth = 0;
    for (let i = open; i < masked.length; i++) {
      if (masked[i] === '{') depth++;
      else if (masked[i] === '}') {
        depth--;
        if (depth === 0) return stripExport(src.slice(head.index, i + 1));
      }
    }
    return null;
  }
  // `export type X = ...;` — terminate at the first depth-0 semicolon.
  const eq = masked.indexOf('=', head.index);
  if (eq < 0) return null;
  let depth = 0;
  for (let i = eq + 1; i < masked.length; i++) {
    const c = masked[i];
    if (c === '{' || c === '(' || c === '[') depth++;
    else if (c === '}' || c === ')' || c === ']') depth--;
    else if (c === ';' && depth === 0) return stripExport(src.slice(head.index, i + 1));
  }
  return null;
}

// Blank comments + string/template literals with spaces (same length) so
// brace/semicolon scans can't see inside them. Handles `'...'`, `"..."`,
// `` `...${...}...` `` nesting and escapes.
function maskCommentsAndStrings(src: string): string {
  const out = src.split('');
  const blank = (a: number, b: number): void => {
    for (let i = a; i < b; i++) if (out[i] !== '\n') out[i] = ' ';
  };
  let i = 0;
  const n = src.length;
  while (i < n) {
    const c = src[i];
    const d = src[i + 1];
    if (c === '/' && d === '/') {
      let j = i;
      while (j < n && src[j] !== '\n') j++;
      blank(i, j);
      i = j;
    } else if (c === '/' && d === '*') {
      const j = src.indexOf('*/', i + 2);
      const end = j < 0 ? n : j + 2;
      blank(i, end);
      i = end;
    } else if (c === "'" || c === '"' || c === '`') {
      const quote = c;
      let j = i + 1;
      let depth = 0;
      // Template `${}` holes contain code — scan them for real; everything
      // else inside the literal is blanked.
      const holes: Array<[number, number]> = [];
      while (j < n) {
        if (src[j] === '\\') { j += 2; continue; }
        if (quote === '`' && src[j] === '$' && src[j + 1] === '{') {
          let k = j + 2;
          let bd = 1;
          while (k < n && bd > 0) {
            if (src[k] === '{') bd++;
            else if (src[k] === '}') bd--;
            k++;
          }
          holes.push([j, k]);
          j = k;
          continue;
        }
        if (src[j] === quote) break;
        // Untagged newline ends a single-quoted literal in TS; template
        // literals span lines.
        if (quote !== '`' && src[j] === '\n') break;
        j++;
      }
      const end = Math.min(j + 1, n);
      blank(i, end);
      // Un-blank the `${}` holes (real code, braces count).
      for (const [a, b] of holes) {
        for (let k = a; k < Math.min(b, n); k++) out[k] = src[k];
        void depth;
      }
      i = end;
    } else {
      i++;
    }
  }
  return out.join('');
}

// Extra libs are scripts (no imports/exports at top level), so a kept
// `export` keyword would turn the lib into a module and `declare const sdk`
// below could no longer see the types. Strip one leading `export`.
function stripExport(block: string): string {
  return block.replace(/^export\s+/, '');
}

// Minimal `react` shim: pages only ever `import { useState } from 'react'`
// (or use the global `React` the renderer closes over). The full
// `@types/react` is deliberately NOT bundled (~100KiB of defs for an
// editor hint).
const REACT_STUB = `
declare namespace React {
  function useState<T>(initial: T | (() => T)): [T, (update: T | ((prev: T) => T)) => void];
  function useEffect(effect: () => void | (() => void), deps?: ReadonlyArray<unknown>): void;
  function useCallback<T extends (...args: never[]) => unknown>(fn: T, deps: ReadonlyArray<unknown>): T;
  function useMemo<T>(fn: () => T, deps: ReadonlyArray<unknown>): T;
  interface RefObject<T> { current: T; }
  function useRef<T>(initial: T): RefObject<T>;
  function createElement(type: unknown, props?: unknown, ...children: unknown[]): unknown;
  type ReactNode = unknown;
}
declare const React: typeof React;
declare namespace JSX {
  interface IntrinsicElements { [element: string]: unknown; }
}
declare module 'react' {
  export function useState<T>(initial: T | (() => T)): [T, (update: T | ((prev: T) => T)) => void];
  export function useEffect(effect: () => void | (() => void), deps?: ReadonlyArray<unknown>): void;
  export function useCallback<T extends (...args: never[]) => unknown>(fn: T, deps: ReadonlyArray<unknown>): T;
  export function useMemo<T>(fn: () => T, deps: ReadonlyArray<unknown>): T;
  export interface RefObject<T> { current: T; }
  export function useRef<T>(initial: T): RefObject<T>;
  export function createElement(type: unknown, props?: unknown, ...children: unknown[]): unknown;
  export type ReactNode = unknown;
  const _default: unknown;
  export default _default;
}
declare const sdk: CustomPageAPI;
`;

let cached: string | null = null;

// buildSdkTypingsText returns the Monaco extra-lib source. Never throws:
// on any extraction failure the editor still gets `sdk: any` (highlighting
// keeps working, hover degrades) — the Studio must never break because a
// doc comment grew an odd brace.
export function buildSdkTypingsText(): string {
  if (cached !== null) return cached;
  try {
    const blocks: string[] = [];
    for (const name of WANTED_TYPES) {
      const b = extractTypeBlock(String(sdkSource ?? ''), name);
      if (b) blocks.push(b);
    }
    // CustomPageAPI is the contract — without it, fall back loudly (any)
    // rather than shipping a lib where `sdk` is an unresolved name.
    if (!blocks.some((b) => /(^|\n)interface\s+CustomPageAPI\b/.test(b))) {
      throw new Error('CustomPageAPI block not found in customPageSdk.ts');
    }
    cached = `${blocks.join('\n\n')}\n${REACT_STUB}`;
  } catch {
    cached = `declare const sdk: any;\n${REACT_STUB}`;
  }
  return cached;
}
