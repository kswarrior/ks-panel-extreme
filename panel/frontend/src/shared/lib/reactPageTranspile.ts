// reactPageTranspile — dependency-free JSX + light-TS affordances for
// instance React pages (near-real, Plan A).
//
// v1 contract was plain JS with React.createElement (no JSX). This module
// runs BOTH in the renderer (CustomPageView ReactModuleView, before script
// injection) and — via the same rules — is mirrored by the Go validator
// (validateReactSource), so Studio Build and live render agree.
//
// Supported (additive — old createElement pages transpile to themselves):
//   • JSX: <div className="x">, <MyComp prop={v}>, fragments <>, self-close
//     <br/>, spread {...props}, expression children, text children.
//   • TS affordances: `import ... from 'react'` (rewritten to React
//     destructuring), `interface`/`type` declarations (dropped), `: Type`
//     annotations on params/lets/returns, `as Type` casts, `<T>` call
//     generics, postfix `!` non-null assertions.
//   • Anything else (other imports/exports, npm packages) still throws with
//     a clear message — pages must use sdk.* + React in scope.
//
// Deliberately NOT a full compiler: complex TS falls back to writing plain
// JS for that line. Fail-closed: unbalanced JSX/braces throw.

function isIdStart(ch: string): boolean {
  return /[A-Za-z_$]/.test(ch);
}

function isIdPart(ch: string): boolean {
  return /[A-Za-z0-9_$]/.test(ch);
}

// rewriteReactImports drops allow-listed `import ... from 'react'` lines by
// converting them to destructuring off the injected React runtime. Any other
// import/export statement throws (renderer injects sdk + React already).
export function rewriteReactImports(src: string): { code: string; hadImport: boolean } {
  const lines = src.split('\n');
  const out: string[] = [];
  let hadImport = false;
  const reactFrom = /^\s*import\s+(.+?)\s+from\s+['"]react['"]\s*;?\s*$/;
  const sideEffectReact = /^\s*import\s+['"]react['"]\s*;?\s*$/;
  for (const line of lines) {
    const t = line.trim();
    if (sideEffectReact.test(t)) {
      hadImport = true;
      out.push('// (dropped side-effect import of react: runtime already in scope)');
      continue;
    }
    const m = t.match(reactFrom);
    if (m) {
      hadImport = true;
      const clause = m[1].trim();
      // import * as R from 'react'  →  const R = React;
      const ns = clause.match(/^\*\s+as\s+([A-Za-z_$][A-Za-z0-9_$]*)$/);
      if (ns) {
        out.push(`const ${ns[1]} = React;`);
        continue;
      }
      // import React, { a, b as c } from 'react'
      // import React from 'react'
      // import { a } from 'react'
      const parts = clause.match(/^([A-Za-z_$][A-Za-z0-9_$]*)?\s*,?\s*(\{[^}]*\})?$/);
      if (parts) {
        const named = parts[2];
        if (named) {
          const inner = named
            .slice(1, -1)
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean)
            .map((s) => {
              const am = s.match(/^([A-Za-z_$][A-Za-z0-9_$]*)\s+as\s+([A-Za-z_$][A-Za-z0-9_$]*)$/);
              return am ? `${am[1]}: ${am[2]}` : s;
            })
            .join(', ');
          out.push(inner ? `const {${inner}} = React;` : '// (react import: nothing to bind)');
        } else {
          out.push('// (dropped default react import: React already in scope)');
        }
        continue;
      }
      throw new Error(`unsupported react import shape: ${t.slice(0, 80)} — use \`import { useState } from 'react'\` or plain script`);
    }
    out.push(line);
  }
  // Any remaining module syntax (other packages, exports) is still banned:
  // the renderer executes the body inside (function(sdk,React){...}), which
  // cannot parse module syntax. Scan ignoring strings/comments.
  const stripped = blankStringsAndComments(out.join('\n'));
  if (/(^|[^A-Za-z0-9_$])(import|export)\b/.test(stripped)) {
    const mm = stripped.match(/(^|[^A-Za-z0-9_$])((import|export)\b.{0,40})/);
    throw new Error(
      `import/export from other packages is not supported (React and sdk are already in scope)${mm ? `: ${mm[2].trim().slice(0, 60)}` : ''} — use sdk.* helpers instead`,
    );
  }
  return { code: out.join('\n'), hadImport };
}

// blankStringsAndComments replaces string/comment contents with spaces
// (length-preserving) so keyword scans don't false-positive on JSX text like
// "a < b" inside strings or `// import x`.
export function blankStringsAndComments(src: string): string {
  let out = '';
  let i = 0;
  const n = src.length;
  let state: 'code' | 'sq' | 'dq' | 'tpl' | 'line' | 'block' = 'code';
  let tplExprDepth = 0;
  while (i < n) {
    const c = src[i];
    const nx = i + 1 < n ? src[i + 1] : '';
    if (state === 'code') {
      if (c === '/' && nx === '/') {
        state = 'line';
        out += '  ';
        i += 2;
        continue;
      }
      if (c === '/' && nx === '*') {
        state = 'block';
        out += '  ';
        i += 2;
        continue;
      }
      if (c === "'") {
        state = 'sq';
        out += ' ';
        i++;
        continue;
      }
      if (c === '"') {
        state = 'dq';
        out += ' ';
        i++;
        continue;
      }
      if (c === '`') {
        state = 'tpl';
        out += ' ';
        i++;
        continue;
      }
      out += c;
      i++;
      continue;
    }
    if (state === 'line') {
      if (c === '\n') {
        state = 'code';
        out += '\n';
      } else {
        out += ' ';
      }
      i++;
      continue;
    }
    if (state === 'block') {
      if (c === '*' && nx === '/') {
        state = 'code';
        out += '  ';
        i += 2;
      } else {
        out += c === '\n' ? '\n' : ' ';
        i++;
      }
      continue;
    }
    if (state === 'sq') {
      if (c === '\\') {
        out += '  ';
        i += 2;
        continue;
      }
      if (c === "'") {
        state = 'code';
        out += ' ';
        i++;
        continue;
      }
      out += c === '\n' ? '\n' : ' ';
      i++;
      continue;
    }
    if (state === 'dq') {
      if (c === '\\') {
        out += '  ';
        i += 2;
        continue;
      }
      if (c === '"') {
        state = 'code';
        out += ' ';
        i++;
        continue;
      }
      out += c === '\n' ? '\n' : ' ';
      i++;
      continue;
    }
    // tpl — blank until closing backtick, but ${...} is code again.
    if (c === '\\') {
      out += '  ';
      i += 2;
      continue;
    }
    if (c === '`' && tplExprDepth === 0) {
      state = 'code';
      out += ' ';
      i++;
      continue;
    }
    if (c === '$' && nx === '{') {
      tplExprDepth++;
      out += '  ';
      i += 2;
      // copy the ${...} expression through the main loop recursively by
      // treating braces inline: simplest is to emit and keep blanking until
      // matching close — handled below via depth counting on { / }.
      continue;
    }
    if ((c === '{' && tplExprDepth > 0) || (c === '}' && tplExprDepth > 0)) {
      if (c === '{') tplExprDepth++;
      else tplExprDepth--;
      out += ' ';
      i++;
      continue;
    }
    out += c === '\n' ? '\n' : ' ';
    i++;
  }
  return out;
}

// stripLightTS removes the common TS affordances listed in the header.
// Best-effort and conservative: unknown shapes are left untouched so plain
// JS authors never see their code mangled.
export function stripLightTS(src: string): { code: string; hadTS: boolean } {
  let hadTS = false;
  let s = src;

  // 1) `interface Name ... { ... }` blocks (brace-matched).
  s = stripInterfaces(s, () => {
    hadTS = true;
  });

  // 2) `type Name ... = ...;` aliases (top-level-ish, semicolon terminated).
  const beforeType = s;
  s = s.replace(/^[ \t]*type\s+[A-Za-z_$][A-Za-z0-9_$.]*[\s\S]*?;[ \t]*(?:\n|$)/gm, (m) => {
    // Only treat as a type alias when it looks like one (has = before ;).
    if (m.includes('=')) {
      hadTS = true;
      return '\n';
    }
    return m;
  });
  void beforeType;

  // 3) `as Type` casts + postfix `!` assertions + `<T>` call generics.
  // Walk skipping strings/comments so `"a as b"` text survives.
  s = stripAsCastsAndGenerics(s, () => {
    hadTS = true;
  });

  // 4) `: Type` annotations on params / lets / returns.
  s = stripAnnotations(s, () => {
    hadTS = true;
  });

  return { code: s, hadTS };
}

function stripInterfaces(src: string, mark: () => void): string {
  let out = '';
  let i = 0;
  const n = src.length;
  while (i < n) {
    // Genuine `interface` keyword at this position (not part of a larger
    // identifier, e.g. `myinterface`)?
    if (
      src.startsWith('interface', i) &&
      !isIdPart(src[i - 1] ?? '') &&
      !isIdPart(src[i + 9] ?? '')
    ) {
        // Find opening brace, then brace-match.
        let j = i + 9;
        while (j < n && src[j] !== '{' && src[j] !== '\n') j++;
        // Interfaces may have `extends X` before `{`; scan to first `{`.
        while (j < n && src[j] !== '{') j++;
        if (j < n && src[j] === '{') {
          let depth = 0;
          let k = j;
          let inS: string | null = null;
          while (k < n) {
            const c = src[k];
            if (inS) {
              if (c === '\\') {
                k += 2;
                continue;
              }
              if (c === inS) inS = null;
              k++;
              continue;
            }
            if (c === "'" || c === '"' || c === '`') {
              inS = c;
              k++;
              continue;
            }
            if (c === '{') depth++;
            if (c === '}') {
              depth--;
              if (depth === 0) {
                k++;
                break;
              }
            }
            k++;
          }
          mark();
          out += '\n';
          i = k;
          continue;
        }
        // No opening brace (shouldn't happen for real interfaces) — fall
        // through and copy verbatim rather than dropping code.
      }
      out += src[i];
      i++;
      continue;
  }
  return out;
}

function stripAsCastsAndGenerics(src: string, mark: () => void): string {
  let out = '';
  let i = 0;
  const n = src.length;
  let state: 'code' | 'sq' | 'dq' | 'tpl' | 'line' | 'block' = 'code';
  while (i < n) {
    const c = src[i];
    if (state === 'code') {
      if (c === '/' && src[i + 1] === '/') {
        state = 'line';
        out += c + src[i + 1];
        i += 2;
        continue;
      }
      if (c === '/' && src[i + 1] === '*') {
        state = 'block';
        out += c + src[i + 1];
        i += 2;
        continue;
      }
      if (c === "'") {
        state = 'sq';
        out += c;
        i++;
        continue;
      }
      if (c === '"') {
        state = 'dq';
        out += c;
        i++;
        continue;
      }
      if (c === '`') {
        state = 'tpl';
        out += c;
        i++;
        continue;
      }
      // `expr as Type` — `as` as a standalone word followed by a type-ish
      // identifier. Keep `async`/`hasOwn` etc. intact via boundaries.
      if (
        (c === 'a' && src.startsWith('as', i) && !isIdPart(src[i - 1] ?? '') && !isIdPart(src[i + 2] ?? '')) ||
        false
      ) {
        let j = i + 2;
        while (j < n && /[ \t]/.test(src[j])) j++;
        if (j < n && (isIdStart(src[j]) || src[j] === '{' || src[j] === '"' || src[j] === "'")) {
          // Skip the type until a code boundary (, ) ; } ] = \n or operator).
          let k = j;
          let depth = 0;
          while (k < n) {
            const t = src[k];
            if (t === '<' || t === '(' || t === '[' || t === '{') depth++;
            if (t === '>' || t === ')' || t === ']' || t === '}') {
              if (depth === 0) break;
              depth--;
            }
            if (depth === 0 && /[,);}\]=&|?:+\-*/!%\n]/.test(t)) break;
            // Stop before `;` `,` `)` at depth 0 — but keep scanning through
            // qualified names like `Record<string, any>`.
            k++;
          }
          if (k > j) {
            mark();
            i = k;
            continue;
          }
        }
      }
      // Postfix `!`: `foo!.bar` → `foo.bar` (skip `!=` / `!==`).
      if (c === '!' && src[i + 1] !== '=' && src[i + 1] !== '!') {
        const prev = out.length ? out[out.length - 1] : '';
        if (/[A-Za-z0-9_$\]\)'"]/.test(prev)) {
          mark();
          i++;
          continue;
        }
      }
      out += c;
      i++;
      continue;
    }
    if (state === 'line') {
      out += c;
      if (c === '\n') state = 'code';
      i++;
      continue;
    }
    if (state === 'block') {
      out += c;
      if (c === '*' && src[i + 1] === '/') {
        out += '/';
        i += 2;
        state = 'code';
        continue;
      }
      i++;
      continue;
    }
    if (state === 'sq') {
      out += c;
      if (c === '\\') {
        out += src[i + 1] ?? '';
        i += 2;
        continue;
      }
      if (c === "'") state = 'code';
      i++;
      continue;
    }
    if (state === 'dq') {
      out += c;
      if (c === '\\') {
        out += src[i + 1] ?? '';
        i += 2;
        continue;
      }
      if (c === '"') state = 'code';
      i++;
      continue;
    }
    // tpl
    out += c;
    if (c === '\\') {
      out += src[i + 1] ?? '';
      i += 2;
      continue;
    }
    if (c === '`') state = 'code';
    i++;
  }
  // `<T>` call generics: `useState<string>(` → `useState(`. Conservative:
  // identifier immediately followed by <...> then `(`.
  return out.replace(/([A-Za-z_$][A-Za-z0-9_$.]*)\s*<[A-Za-z_$][A-Za-z0-9_$.<>\[\],\s|&?]*>\s*\(/g, (m, fn) => {
    mark();
    const tail = m.slice(m.lastIndexOf('('));
    return `${fn as string}${tail}`;
  });
}

function stripAnnotations(src: string, mark: () => void): string {
  // Scanner-based (regex can't balance `{...}` object types like
  // `props: { points: LoadPoint[] }`). Strips `: Type` in param / let /
  // return positions only; ternaries, object literals, labels and `case:`
  // are guarded so plain JS is never mangled.
  let out = '';
  let i = 0;
  const n = src.length;
  let state: 'code' | 'sq' | 'dq' | 'tpl' | 'line' | 'block' = 'code';
  let round = 0;
  let square = 0;
  let curly = 0;
  const prevNonSpace = (): string => {
    for (let k = out.length - 1; k >= 0; k--) {
      const c = out[k];
      if (c === ' ' || c === '\t' || c === '\n' || c === '\r') continue;
      return c;
    }
    return '';
  };
  const lineStart = (): string => {
    const k = out.lastIndexOf('\n');
    return out.slice(k + 1).trimStart();
  };
  while (i < n) {
    const c = src[i];
    if (state === 'code') {
      if (c === '/' && src[i + 1] === '/') {
        state = 'line';
        out += '//';
        i += 2;
        continue;
      }
      if (c === '/' && src[i + 1] === '*') {
        state = 'block';
        out += '/*';
        i += 2;
        continue;
      }
      if (c === "'") {
        state = 'sq';
        out += c;
        i++;
        continue;
      }
      if (c === '"') {
        state = 'dq';
        out += c;
        i++;
        continue;
      }
      if (c === '`') {
        state = 'tpl';
        out += c;
        i++;
        continue;
      }
      if (c === '(') {
        round++;
        out += c;
        i++;
        continue;
      }
      if (c === ')') {
        round = Math.max(0, round - 1);
        out += c;
        i++;
        continue;
      }
      if (c === '[') {
        square++;
        out += c;
        i++;
        continue;
      }
      if (c === ']') {
        square = Math.max(0, square - 1);
        out += c;
        i++;
        continue;
      }
      if (c === '{') {
        curly++;
        out += c;
        i++;
        continue;
      }
      if (c === '}') {
        curly = Math.max(0, curly - 1);
        out += c;
        i++;
        continue;
      }
      if (c === ':' && curly === 0 && square === 0 && src[i + 1] !== ':') {
        const prev = prevNonSpace();
        const isBindingEnd =
          /[A-Za-z0-9_$\])]/.test(prev) || prev === '?' || prev === '"' || prev === "'";
        if (!isBindingEnd) {
          out += c;
          i++;
          continue;
        }
        // Guards: ternary (`a ? b : c`), case/default labels, loop labels.
        const ls = lineStart();
        if (/^(case|default)\b/.test(ls)) {
          out += c;
          i++;
          continue;
        }
        let j = i + 1;
        while (j < n && (src[j] === ' ' || src[j] === '\t' || src[j] === '\n' || src[j] === '\r')) j++;
        const restWord = /^[A-Za-z_]+/.exec(src.slice(j, j + 16));
        if (/^[A-Za-z_$][A-Za-z0-9_$]*\s*:$/.test(ls + ' ') && restWord && /^(for|while|switch|do)$/.test(restWord[0])) {
          out += c; // `label: for...`
          i++;
          continue;
        }
        // Same-line `?` before this colon at equal nesting → ternary.
        if (looksLikeTernary(src, i)) {
          out += c;
          i++;
          continue;
        }
        if (j >= n || !/[A-Za-z_{(['"<|!?]/.test(src[j])) {
          out += c;
          i++;
          continue;
        }
        // Consume the type with balanced ()[]{}<> + strings.
        let k = j;
        let r = 0;
        let s = 0;
        let cu = 0;
        let a = 0;
        let st: 'code' | 'sq' | 'dq' | 'tpl' = 'code';
        let end = -1;
        while (k < n) {
          const t = src[k];
          if (st === 'code') {
            if (t === "'" || t === '"' || t === '`') {
              st = t === "'" ? 'sq' : t === '"' ? 'dq' : 'tpl';
              k++;
              continue;
            }
            if (t === '<' && /[A-Za-z0-9_$\]>)\]?]/.test(src[k - 1] ?? '')) {
              a++;
              k++;
              continue;
            }
            if (t === '>' && a > 0 && src[k + 1] !== '=') {
              a--;
              k++;
              continue;
            }
            if (t === '=' && src[k + 1] === '>') {
              if (r === 0 && s === 0 && cu === 0 && a === 0) {
                end = k; // `=>` — return-type position, keep the arrow.
                break;
              }
              k += 2;
              continue;
            }
            if (t === '(' || t === '[' || t === '{') {
              if (t === '(') r++;
              else if (t === '[') s++;
              else cu++;
              k++;
              continue;
            }
            if (t === ')' || t === ']' || t === '}') {
              if (r === 0 && s === 0 && cu === 0) {
                end = k; // terminator at depth 0.
                break;
              }
              if (t === ')') r--;
              else if (t === ']') s--;
              else cu--;
              k++;
              continue;
            }
            if ((t === ',' || t === ';' || t === '=') && r === 0 && s === 0 && cu === 0 && a === 0) {
              end = k;
              break;
            }
            // A `{` opening a function body ends a return type.
            if (t === '{' && r === 0 && s === 0 && cu === 0 && a === 0) {
              end = k;
              break;
            }
            k++;
            continue;
          }
          if (t === '\\') {
            k += 2;
            continue;
          }
          if ((st === 'sq' && t === "'") || (st === 'dq' && t === '"') || (st === 'tpl' && t === '`')) st = 'code';
          k++;
        }
        if (end === -1 || end <= j) {
          out += c;
          i++;
          continue;
        }
        // Drop a `?` optional marker left dangling (`(x?: T)` → `(x)`).
        if (prev === '?') out = out.slice(0, -1);
        mark();
        i = end;
        continue;
      }
      out += c;
      i++;
      continue;
    }
    if (state === 'line') {
      out += c;
      if (c === '\n') state = 'code';
      i++;
      continue;
    }
    if (state === 'block') {
      out += c;
      if (c === '*' && src[i + 1] === '/') {
        out += '/';
        i += 2;
        state = 'code';
        continue;
      }
      i++;
      continue;
    }
    if (state === 'sq' || state === 'dq') {
      const q = state === 'sq' ? "'" : '"';
      out += c;
      if (c === '\\') {
        out += src[i + 1] ?? '';
        i += 2;
        continue;
      }
      if (c === q) state = 'code';
      i++;
      continue;
    }
    out += c;
    if (c === '\\') {
      out += src[i + 1] ?? '';
      i += 2;
      continue;
    }
    if (c === '`') state = 'code';
    i++;
  }
  return out;
}

// looksLikeTernary reports whether the `:` at pos is the else-branch of a
// `? :` on the same nesting level (scans back to a line/statement boundary).
function looksLikeTernary(src: string, pos: number): boolean {
  let round = 0;
  let square = 0;
  let curly = 0;
  for (let k = pos - 1; k >= 0; k--) {
    const c = src[k];
    if (c === '\n' || c === ';') return false;
    if (c === ')' || c === ']' || c === '}') {
      if (c === ')') round++;
      else if (c === ']') square++;
      else curly++;
      continue;
    }
    if (c === '(' || c === '[' || c === '{') {
      if (c === '(') {
        if (round === 0) return false; // start of a call/params — no ternary.
        round--;
      } else if (c === '[') {
        if (square === 0) return false;
        square--;
      } else {
        if (curly === 0) return false;
        curly--;
      }
      continue;
    }
    if (c === '?' && round === 0 && square === 0 && curly === 0) {
      // `?.` optional chaining is not a ternary.
      if (src[k + 1] === '.' || (k > 0 && /[A-Za-z0-9_$]/.test(src[k - 1]) && src[k + 1] === '?')) continue;
      return true;
    }
    if (c === ':' && round === 0 && square === 0 && curly === 0) return false;
  }
  return false;
}

// ---- JSX ----

interface JSXNode {
  tag: string; // '' == fragment
  props: string; // emitted JS object source (`null` when empty)
  children: string[]; // emitted JS expression sources
}

// transpileJSX rewrites JSX elements to React.createElement calls.
// Non-JSX `<` (comparisons, generics leftovers, arrows `=>`) is left alone:
// parseElement returns null and the scanner copies one char.
function transpileJSX(src: string): { code: string; hadJSX: boolean } {
  let hadJSX = false;
  let out = '';
  let i = 0;
  const n = src.length;
  let state: 'code' | 'sq' | 'dq' | 'tpl' | 'line' | 'block' = 'code';
  while (i < n) {
    const c = src[i];
    if (state === 'code') {
      if (c === '/' && src[i + 1] === '/') {
        state = 'line';
        out += '//';
        i += 2;
        continue;
      }
      if (c === '/' && src[i + 1] === '*') {
        state = 'block';
        out += '/*';
        i += 2;
        continue;
      }
      if (c === "'") {
        state = 'sq';
        out += c;
        i++;
        continue;
      }
      if (c === '"') {
        state = 'dq';
        out += c;
        i++;
        continue;
      }
      if (c === '`') {
        state = 'tpl';
        out += c;
        i++;
        continue;
      }
      if (c === '<') {
        const nx = src[i + 1] ?? '';
        if (/[A-Za-z_>/]/.test(nx) || (nx === '/' && /[A-Za-z_>]/.test(src[i + 2] ?? ''))) {
          const parsed = tryParseElement(src, i);
          if (parsed) {
            hadJSX = true;
            out += emitNode(parsed.node);
            i = parsed.end;
            continue;
          }
        }
        out += c;
        i++;
        continue;
      }
      out += c;
      i++;
      continue;
    }
    if (state === 'line') {
      out += c;
      if (c === '\n') state = 'code';
      i++;
      continue;
    }
    if (state === 'block') {
      out += c;
      if (c === '*' && src[i + 1] === '/') {
        out += '/';
        i += 2;
        state = 'code';
        continue;
      }
      i++;
      continue;
    }
    if (state === 'sq' || state === 'dq') {
      const q = state === 'sq' ? "'" : '"';
      out += c;
      if (c === '\\') {
        out += src[i + 1] ?? '';
        i += 2;
        continue;
      }
      if (c === q) state = 'code';
      i++;
      continue;
    }
    out += c;
    if (c === '\\') {
      out += src[i + 1] ?? '';
      i += 2;
      continue;
    }
    if (c === '`') state = 'code';
    i++;
  }
  return { code: out, hadJSX };
}

function skipWS(src: string, i: number): number {
  while (i < src.length && /\s/.test(src[i])) i++;
  return i;
}

function parseTagName(src: string, i: number): { name: string; end: number } | null {
  if (src[i] === '>') return { name: '', end: i }; // fragment open <>
  const m = /^[A-Za-z_][A-Za-z0-9_.-]*/.exec(src.slice(i, i + 64));
  if (!m) return null;
  return { name: m[0], end: i + m[0].length };
}

function parseJSString(src: string, i: number): { end: number } | null {
  const q = src[i];
  if (q !== '"' && q !== "'") return null;
  let k = i + 1;
  while (k < src.length) {
    if (src[k] === '\\') {
      k += 2;
      continue;
    }
    if (src[k] === q) return { end: k + 1 };
    if (src[k] === '\n') return null;
    k++;
  }
  return null;
}

function parseBalanced(src: string, i: number, open: string, close: string): { end: number } | null {
  // i points at `open`; strings/comments inside are skipped.
  let depth = 0;
  let k = i;
  let st: 'code' | 'sq' | 'dq' | 'tpl' | 'line' | 'block' = 'code';
  while (k < src.length) {
    const c = src[k];
    const nx = src[k + 1] ?? '';
    if (st === 'code') {
      if (c === '/' && nx === '/') {
        st = 'line';
        k += 2;
        continue;
      }
      if (c === '/' && nx === '*') {
        st = 'block';
        k += 2;
        continue;
      }
      if (c === "'") {
        st = 'sq';
        k++;
        continue;
      }
      if (c === '"') {
        st = 'dq';
        k++;
        continue;
      }
      if (c === '`') {
        st = 'tpl';
        k++;
        continue;
      }
      if (c === open) depth++;
      if (c === close) {
        depth--;
        if (depth === 0) return { end: k + 1 };
      }
      k++;
      continue;
    }
    if (st === 'line') {
      if (c === '\n') st = 'code';
      k++;
      continue;
    }
    if (st === 'block') {
      if (c === '*' && nx === '/') {
        st = 'code';
        k += 2;
        continue;
      }
      k++;
      continue;
    }
    if (st === 'sq' || st === 'dq') {
      const q = st === 'sq' ? "'" : '"';
      if (c === '\\') {
        k += 2;
        continue;
      }
      if (c === q) st = 'code';
      k++;
      continue;
    }
    if (c === '\\') {
      k += 2;
      continue;
    }
    if (c === '`') st = 'code';
    k++;
  }
  return null;
}

function tryParseElement(src: string, start: number): { node: JSXNode; end: number } | null {
  // start at '<'
  let i = start + 1;
  let closing = false;
  if (src[i] === '/') {
    closing = true;
    i++;
  }
  const tn = parseTagName(src, i);
  if (!tn) return null;
  i = skipWS(src, tn.end);
  if (closing) {
    // A closing tag never starts an element.
    return null;
  }
  // props
  const propsParts: string[] = [];
  let selfClose = false;
  while (i < src.length) {
    i = skipWS(src, i);
    if (src[i] === '/' && src[i + 1] === '>') {
      selfClose = true;
      i += 2;
      break;
    }
    if (src[i] === '>') {
      i++;
      break;
    }
    if (src[i] === '{') {
      // spread {...props}
      const b = parseBalanced(src, i, '{', '}');
      if (!b) return null;
      const inner = src.slice(i + 1, b.end - 1).trim();
      if (!inner.startsWith('...')) return null;
      propsParts.push(`...(${inner.slice(3).trim() || '{}'})`);
      i = b.end;
      continue;
    }
    const pm = /^[A-Za-z_][A-Za-z0-9_.:-]*/.exec(src.slice(i, i + 64));
    if (!pm) return null;
    const pname = pm[0];
    i += pname.length;
    i = skipWS(src, i);
    if (src[i] !== '=') {
      propsParts.push(`${JSON.stringify(pname)}: true`);
      continue;
    }
    i++; // =
    i = skipWS(src, i);
    if (src[i] === '"' || src[i] === "'") {
      const st = parseJSString(src, i);
      if (!st) return null;
      propsParts.push(`${JSON.stringify(pname)}: ${src.slice(i, st.end)}`);
      i = st.end;
      continue;
    }
    if (src[i] === '{') {
      const b = parseBalanced(src, i, '{', '}');
      if (!b) return null;
      const expr = src.slice(i + 1, b.end - 1).trim();
      propsParts.push(`${JSON.stringify(pname)}: (${expr || 'undefined'})`);
      i = b.end;
      continue;
    }
    return null; // bare unquoted values are not JSX
  }

  const node: JSXNode = {
    tag: tn.name,
    props: propsParts.length ? `{${propsParts.join(', ')}}` : 'null',
    children: [],
  };
  if (selfClose) return { node, end: i };

  // children until matching close tag
  while (i < src.length) {
    if (src[i] === '<' && src[i + 1] === '/') {
      let j = i + 2;
      j = skipWS(src, j);
      if (tn.name === '') {
        j = skipWS(src, j);
        if (src[j] !== '>') return null;
        return { node, end: j + 1 };
      }
      const cn = parseTagName(src, j);
      if (!cn || cn.name !== tn.name) return null;
      let k = skipWS(src, cn.end);
      if (src[k] !== '>') return null;
      return { node, end: k + 1 };
    }
    if (src[i] === '<') {
      const nx = src[i + 1] ?? '';
      if (/[A-Za-z_>/]/.test(nx) || (nx === '/' && /[A-Za-z_>]/.test(src[i + 2] ?? ''))) {
        const child = tryParseElement(src, i);
        if (!child) return null;
        node.children.push(emitNode(child.node));
        i = child.end;
        continue;
      }
      // Lone `<` inside text (e.g. "a < b"): keep as text.
      node.children.push(JSON.stringify('<'));
      i++;
      continue;
    }
    if (src[i] === '{') {
      const b = parseBalanced(src, i, '{', '}');
      if (!b) return null;
      const expr = src.slice(i + 1, b.end - 1);
      if (expr.trim() === '' || /^\/\*[\s\S]*\*\/$/.test(expr.trim())) {
        // `{/* comment */}` → no child.
      } else {
        node.children.push(`(${expr.trim() || 'undefined'})`);
      }
      i = b.end;
      continue;
    }
    // text run
    let j = i;
    while (j < src.length && src[j] !== '<' && src[j] !== '{') j++;
    const text = src.slice(i, j);
    const collapsed = text.replace(/\s+/g, ' ');
    if (collapsed.trim() !== '') {
      // Preserve a single leading/trailing space when glued to expressions.
      const keepLeft = /^\s/.test(text) ? ' ' : '';
      const keepRight = /\s$/.test(text) ? ' ' : '';
      node.children.push(JSON.stringify(`${keepLeft}${collapsed.trim()}${keepRight}`));
    }
    i = j;
  }
  return null; // EOF without close tag
}

function emitNode(node: JSXNode): string {
  const tag =
    node.tag === ''
      ? 'React.Fragment'
      : /^[A-Z]/.test(node.tag) || node.tag.includes('.')
        ? node.tag
        : JSON.stringify(node.tag);
  const kids = node.children.length ? `, ${node.children.join(', ')}` : '';
  return `React.createElement(${tag}, ${node.props}${kids})`;
}

// transpileReactPageSource is the single entry point for the renderer (and
// Studio live-check): react imports → light TS strip → JSX → executable JS.
export function transpileReactPageSource(src: string): { code: string; hadJSX: boolean; hadTS: boolean; hadImport: boolean } {
  const rw = rewriteReactImports(src);
  const ts = stripLightTS(rw.code);
  const jsx = transpileJSX(ts.code);
  return { code: jsx.code, hadJSX: jsx.hadJSX, hadTS: ts.hadTS, hadImport: rw.hadImport };
}

export default transpileReactPageSource;
