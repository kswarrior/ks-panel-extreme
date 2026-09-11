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
//     destructuring), `interface`/`type` declarations (dropped),
//     `enum` (numeric/string, emitted as statements), one-level `namespace`
//     (emitted as an IIFE object of its `export`ed members), `: Type`
//     annotations on params/lets/returns, `as Type` casts, `<T>` call
//     generics, postfix `!` non-null assertions. A leading `export` on a
//     plain/enum/namespace/interface/type declaration is dropped (pages are
//     module-private scripts ending with `return Page;`).
//   • Anything else (other imports, `export default`/`export {}`/`export *`,
//     npm packages) still throws with a clear message — pages must use
//     sdk.* + React in scope.
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
  // Remaining module syntax: only `export` on a plain/enum/namespace/
  // interface/type/value declaration passes (the keyword is dropped later —
  // pages are module-private scripts ending with `return Page;`). Anything
  // else (`export default`, `export {}`, `export *`, non-react imports) is
  // rejected: the renderer executes the body inside
  // (function(sdk,React){...}), which cannot parse module syntax. Scan
  // ignoring strings/comments.
  const stripped = blankStringsAndComments(out.join('\n'));
  const modRe = /(^|[^A-Za-z0-9_$])((import|export)\b[^\n]{0,60})/g;
  let badMod: RegExpExecArray | null;
  while ((badMod = modRe.exec(stripped)) !== null) {
    const stmt = badMod[2].trim();
    const okExport = /^export\s+(const|let|var|async|function|class|enum|namespace|interface|type|declare)\b/.test(stmt);
    if (!okExport) {
      throw new Error(
        `import/export is not supported here (${stmt.slice(0, 60)}) — pages are private scripts (end with \`return Page;\`), React and sdk are already in scope; use sdk.* helpers instead`,
      );
    }
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

  // 0) `enum` (emitted as statements) + `namespace` (emitted as an IIFE
  // object of its `export`ed members), recursively for nesting. Runs first
  // so member initializers still get the passes below (`as`, annotations).
  s = transformEnumsAndNamespaces(s, () => {
    hadTS = true;
  }).code;

  // 0b) Leftover `export ` on plain declarations is dropped (pages are
  // module-private); ambient `declare ...` statements are erased.
  s = stripExportDeclare(s, () => {
    hadTS = true;
  });

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

// ---- enum / namespace (runtime TS) ----

// findKeyword finds `word` as a standalone keyword in code (strings and
// comments skipped), at or after `from`. A preceding `.` disqualifies
// (`foo.enum` is a property, not a declaration).
function findKeyword(src: string, word: string, from: number): number {
  let i = from;
  const n = src.length;
  let state: 'code' | 'sq' | 'dq' | 'tpl' | 'line' | 'block' = 'code';
  while (i < n) {
    const c = src[i];
    if (state === 'code') {
      if (c === '/' && src[i + 1] === '/') {
        state = 'line';
        i += 2;
        continue;
      }
      if (c === '/' && src[i + 1] === '*') {
        state = 'block';
        i += 2;
        continue;
      }
      if (c === "'") {
        state = 'sq';
        i++;
        continue;
      }
      if (c === '"') {
        state = 'dq';
        i++;
        continue;
      }
      if (c === '`') {
        state = 'tpl';
        i++;
        continue;
      }
      if (
        src.startsWith(word, i) &&
        !isIdPart(src[i - 1] ?? '') &&
        src[i - 1] !== '.' &&
        !isIdPart(src[i + word.length] ?? '')
      ) {
        return i;
      }
      i++;
      continue;
    }
    if (state === 'line') {
      if (c === '\n') state = 'code';
      i++;
      continue;
    }
    if (state === 'block') {
      if (c === '*' && src[i + 1] === '/') {
        state = 'code';
        i += 2;
        continue;
      }
      i++;
      continue;
    }
    if (c === '\\') {
      i += 2;
      continue;
    }
    if ((state === 'sq' && c === "'") || (state === 'dq' && c === '"') || (state === 'tpl' && c === '`')) {
      state = 'code';
    }
    i++;
  }
  return -1;
}

// matchBrace returns the index PAST the `}` matching src[openIdx] === '{`
// (string/comment aware), or -1 when unbalanced.
function matchBrace(src: string, openIdx: number): number {
  let depth = 0;
  let i = openIdx;
  const n = src.length;
  let st: 'code' | 'sq' | 'dq' | 'tpl' | 'line' | 'block' = 'code';
  while (i < n) {
    const c = src[i];
    if (st === 'code') {
      if (c === '/' && src[i + 1] === '/') {
        st = 'line';
        i += 2;
        continue;
      }
      if (c === '/' && src[i + 1] === '*') {
        st = 'block';
        i += 2;
        continue;
      }
      if (c === "'") {
        st = 'sq';
        i++;
        continue;
      }
      if (c === '"') {
        st = 'dq';
        i++;
        continue;
      }
      if (c === '`') {
        st = 'tpl';
        i++;
        continue;
      }
      if (c === '{') depth++;
      if (c === '}') {
        depth--;
        if (depth === 0) return i + 1;
      }
      i++;
      continue;
    }
    if (st === 'line') {
      if (c === '\n') st = 'code';
      i++;
      continue;
    }
    if (st === 'block') {
      if (c === '*' && src[i + 1] === '/') {
        st = 'code';
        i += 2;
        continue;
      }
      i++;
      continue;
    }
    if (c === '\\') {
      i += 2;
      continue;
    }
    if ((st === 'sq' && c === "'") || (st === 'dq' && c === '"') || (st === 'tpl' && c === '`')) st = 'code';
    i++;
  }
  return -1;
}

const NUMERIC_LITERAL_RE = /^[+-]?(?:0[xX][\da-fA-F]+|0[oO][0-7]+|0[bB][01]+|(?:\d+(?:\.\d+)?|\.\d+)(?:[eE][+-]?\d+)?)$/;

// stripCommentsKeepStrings removes // and /* */ comments but keeps strings
// (and newlines) verbatim — for parsing declarations whose values may be
// string literals (`enum E { A = 'x' }`).
function stripCommentsKeepStrings(s: string): string {
  let out = '';
  let i = 0;
  const n = s.length;
  let st: 'code' | 'sq' | 'dq' | 'tpl' | 'line' | 'block' = 'code';
  while (i < n) {
    const c = s[i];
    if (st === 'code') {
      if (c === '/' && s[i + 1] === '/') {
        st = 'line';
        i += 2;
        continue;
      }
      if (c === '/' && s[i + 1] === '*') {
        st = 'block';
        i += 2;
        continue;
      }
      if (c === "'") {
        st = 'sq';
        out += c;
        i++;
        continue;
      }
      if (c === '"') {
        st = 'dq';
        out += c;
        i++;
        continue;
      }
      if (c === '`') {
        st = 'tpl';
        out += c;
        i++;
        continue;
      }
      out += c;
      i++;
      continue;
    }
    if (st === 'line') {
      if (c === '\n') {
        st = 'code';
        out += '\n';
      }
      i++;
      continue;
    }
    if (st === 'block') {
      if (c === '*' && s[i + 1] === '/') {
        st = 'code';
        i += 2;
        continue;
      }
      if (c === '\n') out += '\n';
      i++;
      continue;
    }
    out += c;
    if (c === '\\') {
      out += s[i + 1] ?? '';
      i += 2;
      continue;
    }
    if ((st === 'sq' && c === "'") || (st === 'dq' && c === '"') || (st === 'tpl' && c === '`')) st = 'code';
    i++;
  }
  return out;
}

// takeDeclPrefix walks back from a keyword position over same-line/gap
// whitespace and collects `export`/`const`/`declare` prefix words (for
// `export const enum E`, `declare namespace N`). Stops at anything else.
function takeDeclPrefix(src: string, kwPos: number): { start: number; words: string[] } {
  let i = kwPos;
  const words: string[] = [];
  for (;;) {
    let j = i;
    while (j > 0 && (src[j - 1] === ' ' || src[j - 1] === '\t' || src[j - 1] === '\n' || src[j - 1] === '\r')) j--;
    let k = j;
    while (k > 0 && isIdPart(src[k - 1])) k--;
    const w = src.slice(k, j);
    if (w !== 'export' && w !== 'const' && w !== 'declare') return { start: i, words };
    words.unshift(w);
    i = k;
  }
}

// emitEnum compiles `enum Name { ... }` members to tsc-style assignment
// statements. Numeric members get reverse mappings; a missing initializer
// after a non-numeric member throws (same rule as TypeScript).
function emitEnum(name: string, inner: string, mark: () => void): string {
  const blanked = blankStringsAndComments(inner);
  const ranges: Array<{ from: number; to: number }> = [];
  {
    // Boundaries from the blanked text (comments/strings neutralized);
    // ORIGINAL slices below stay verbatim. Length-preserving blanking keeps
    // indices aligned.
    let depth = 0;
    let angle = 0;
    let start = 0;
    for (let i = 0; i <= blanked.length; i++) {
      const c = blanked[i] ?? '';
      if (c === '(' || c === '[' || c === '{') depth++;
      else if (c === ')' || c === ']' || c === '}') depth = Math.max(0, depth - 1);
      else if (c === '<' && /[A-Za-z0-9_$\]>)\]?]/.test(blanked[i - 1] ?? '')) angle++;
      else if (c === '>' && angle > 0) angle--;
      if ((c === ',' || i === blanked.length) && depth === 0 && angle === 0) {
        ranges.push({ from: start, to: i });
        start = i + 1;
      }
    }
  }
  const lines = [`const ${name} = {};`];
  let counter = 0;
  let autoOk = true;
  for (const { from, to } of ranges) {
    const raw = inner.slice(from, to);
    // Parse on the comment-stripped copy (strings intact — initializers may
    // be string literals); the ORIGINAL slice below supplies the verbatim
    // initializer.
    const clean = stripCommentsKeepStrings(raw).trim();
    if (clean === '') continue;
    const mm = /^([A-Za-z_$][A-Za-z0-9_$]*)\s*(?:=\s*([\s\S]+))?$/.exec(clean);
    if (!mm) throw new Error(`invalid enum member: ${clean.slice(0, 40)} — expected Name or Name = value`);
    const key = mm[1];
    // Verbatim initializer: everything after the first `=` in the original
    // slice, comments removed (a trailing `// note` must not eat the line).
    let init = '';
    if (mm[2] !== undefined) {
      const eqAt = raw.search(/=/);
      const cand = stripCommentsKeepStrings(raw.slice(eqAt + 1)).trim();
      if (cand !== '') init = cand;
    }
    if (init === '') {
      if (!autoOk) {
        throw new Error(
          `enum member ${key} needs an initializer because the previous member is not a number — same rule as TypeScript`,
        );
      }
      lines.push(`${name}[${JSON.stringify(key)}] = ${counter}; ${name}[${counter}] = ${JSON.stringify(key)};`);
      counter++;
    } else if (NUMERIC_LITERAL_RE.test(init)) {
      const v = Number(init);
      lines.push(`${name}[${JSON.stringify(key)}] = (${init}); ${name}[${v}] = ${JSON.stringify(key)};`);
      counter = v + 1;
      autoOk = true;
    } else {
      lines.push(`${name}[${JSON.stringify(key)}] = (${init});`);
      autoOk = false;
    }
  }
  mark();
  return lines.join('\n');
}

// collectNamespaceExports finds top-level `export <decl> <name>` members in
// a (recursively transformed) namespace body, drops the `export` keyword and
// returns the member names for the IIFE return object. `export default`,
// `export {}`, `export *` and `export =` throw — they have no namespace
// meaning in a private page script.
function collectNamespaceExports(body: string, nsName: string): { body: string; names: string[] } {
  let out = '';
  let i = 0;
  const n = body.length;
  const names: string[] = [];
  let depth = 0;
  let state: 'code' | 'sq' | 'dq' | 'tpl' | 'line' | 'block' = 'code';
  const flushWord = (): boolean => {
    if (!body.startsWith('export', i) || isIdPart(body[i - 1] ?? '') || !/\s/.test(body[i + 6] ?? '')) return false;
    if (depth !== 0) return false;
    const rest = body.slice(i + 6);
    const m = /^\s+(default\b|[{*=]|\bfrom\b|declare\b|const\b|let\b|var\b|async\s+function\b|function\b|class\b|enum\b|namespace\b|interface\b|type\b)/.exec(rest);
    if (!m) return false;
    const kind = m[1].replace(/\s+/g, ' ');
    if (kind === 'default' || kind === '{' || kind === '*' || kind === '=' || kind === 'from' || kind === 'declare') {
      throw new Error(
        `export ${kind} is not supported inside namespace ${nsName} — export plain declarations (const, function, class, enum, namespace) instead`,
      );
    }
    if (kind === 'interface' || kind === 'type') {
      // Types vanish in later passes; just drop the `export` keyword here.
      i += 6;
      return true;
    }
    // Value declaration: parse its bound name, drop `export `.
    let j = i + 6 + m[0].length - kind.length;
    // j now at the start of the kind keyword; advance past it.
    const kindWord = kind === 'async function' ? 'async function' : kind;
    j += kindWord.length;
    while (j < n && (body[j] === ' ' || body[j] === '\t' || body[j] === '\n' || body[j] === '\r')) j++;
    const nm = /^[A-Za-z_$][A-Za-z0-9_$]*/.exec(body.slice(j, j + 64));
    if (!nm) {
      throw new Error(`exported member in namespace ${nsName} needs a name — anonymous defaults are not supported`);
    }
    names.push(nm[0]);
    i += 6; // skip `export`, keep the following whitespace + declaration.
    return true;
  };
  while (i < n) {
    const c = body[i];
    if (state === 'code') {
      if (c === '/' && body[i + 1] === '/') {
        state = 'line';
        out += '//';
        i += 2;
        continue;
      }
      if (c === '/' && body[i + 1] === '*') {
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
      if (c === '(' || c === '[' || c === '{') depth++;
      if (c === ')' || c === ']' || c === '}') depth = Math.max(0, depth - 1);
      if (c === 'e' && flushWord()) continue;
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
      if (c === '*' && body[i + 1] === '/') {
        out += '/';
        i += 2;
        state = 'code';
        continue;
      }
      i++;
      continue;
    }
    out += c;
    if (c === '\\') {
      out += body[i + 1] ?? '';
      i += 2;
      continue;
    }
    if ((state === 'sq' && c === "'") || (state === 'dq' && c === '"') || (state === 'tpl' && c === '`')) state = 'code';
    i++;
  }
  return { body: out, names };
}

// transformEnumsAndNamespaces compiles `enum` (statement assignments with
// reverse mappings) and `namespace` (IIFE object of exported members),
// recursively for nesting. A leading `export` is preserved on the emitted
// `const` for the outer collector (or the top-level export-drop pass);
// `declare` erases the declaration (ambient, no runtime here).
function transformEnumsAndNamespaces(src: string, mark: () => void): { code: string } {
  let out = src;
  for (;;) {
    const eIdx = findKeyword(out, 'enum', 0);
    const nIdx = findKeyword(out, 'namespace', 0);
    if (eIdx === -1 && nIdx === -1) break;
    const isEnum = eIdx !== -1 && (nIdx === -1 || eIdx < nIdx);
    const kwPos = isEnum ? eIdx : nIdx;
    const kwLen = isEnum ? 4 : 9;
    const { start, words } = takeDeclPrefix(out, kwPos);
    const hasExport = words.includes('export');
    const hasConst = words.includes('const');
    const hasDeclare = words.includes('declare');
    const badCombo =
      words.some((w) => w !== 'export' && w !== 'const' && w !== 'declare') ||
      (!isEnum && hasConst) ||
      (hasConst && hasDeclare) ||
      (hasExport && hasDeclare);
    if (badCombo) {
      throw new Error(
        `invalid ${isEnum ? 'enum' : 'namespace'} declaration (${words.join(' ')}) — use [export] [const] enum / [export] namespace`,
      );
    }
    // Name follows the keyword (whitespace/comments allowed).
    let p = kwPos + kwLen;
    while (p < out.length && (out[p] === ' ' || out[p] === '\t' || out[p] === '\n' || out[p] === '\r')) p++;
    if (out.startsWith('//', p)) {
      const nl = out.indexOf('\n', p);
      p = nl === -1 ? out.length : nl + 1;
      while (p < out.length && (out[p] === ' ' || out[p] === '\t' || out[p] === '\n' || out[p] === '\r')) p++;
    }
    const nm = /^[A-Za-z_$][A-Za-z0-9_$]*/.exec(out.slice(p, p + 64));
    if (!nm) throw new Error(`invalid ${isEnum ? 'enum' : 'namespace'} declaration — a name must follow the keyword`);
    let q = p + nm[0].length;
    while (q < out.length && (out[q] === ' ' || out[q] === '\t' || out[q] === '\n' || out[q] === '\r')) q++;
    if (out[q] !== '{') {
      throw new Error(
        `invalid ${isEnum ? 'enum' : 'namespace'} ${nm[0]} — expected { but found ${JSON.stringify(out[q] ?? 'end of input')}`,
      );
    }
    const end = matchBrace(out, q);
    if (end === -1) throw new Error(`unbalanced { in ${isEnum ? 'enum' : 'namespace'} ${nm[0]} — a closing } is missing`);
    if (hasDeclare) {
      mark();
      out = `${out.slice(0, start)}\n${out.slice(end)}`;
      continue;
    }
    const inner = out.slice(q + 1, end - 1);
    let replacement: string;
    if (isEnum) {
      const stmts = emitEnum(nm[0], inner, mark);
      replacement = `${hasExport ? 'export ' : ''}${stmts}`;
    } else {
      const rec = transformEnumsAndNamespaces(inner, mark);
      const collected = collectNamespaceExports(rec.code, nm[0]);
      mark();
      replacement =
        `${hasExport ? 'export ' : ''}const ${nm[0]} = (() => {\n${collected.body}\nreturn { ${collected.names.join(', ')} };\n})();`;
    }
    out = `${out.slice(0, start)}${replacement}${out.slice(end)}`;
  }
  return { code: out };
}

// stripExportDeclare drops a leftover leading `export` on plain declarations
// (pages are module-private) and erases ambient `declare ...` statements.
// Code-aware and line-anchored so strings/templates are never touched.
function stripExportDeclare(src: string, mark: () => void): string {
  let out = '';
  let i = 0;
  const n = src.length;
  let state: 'code' | 'sq' | 'dq' | 'tpl' | 'line' | 'block' = 'code';
  let atLineStart = true;
  while (i < n) {
    const c = src[i];
    if (state === 'code') {
      if (c === '/' && src[i + 1] === '/') {
        state = 'line';
        out += '//';
        atLineStart = false;
        i += 2;
        continue;
      }
      if (c === '/' && src[i + 1] === '*') {
        state = 'block';
        out += '/*';
        atLineStart = false;
        i += 2;
        continue;
      }
      if (c === "'") {
        state = 'sq';
        out += c;
        atLineStart = false;
        i++;
        continue;
      }
      if (c === '"') {
        state = 'dq';
        out += c;
        atLineStart = false;
        i++;
        continue;
      }
      if (c === '`') {
        state = 'tpl';
        out += c;
        atLineStart = false;
        i++;
        continue;
      }
      if ((c === ' ' || c === '\t') && atLineStart) {
        out += c;
        i++;
        continue;
      }
      if (atLineStart) {
        const rest = src.slice(i, i + 80);
        const expM = /^export\s+(const|let|var|async\s+function|function|class|enum|namespace|interface|type)\b/.exec(rest);
        if (expM) {
          mark();
          i += 6; // skip `export`, keep following whitespace + declaration.
          atLineStart = false;
          continue;
        }
        const decM = /^(?:export\s+)?declare\b/.exec(rest);
        if (decM) {
          // Erase the ambient statement: through the matching `}` when a
          // brace opens first, else through `;` (or end of line for ASI).
          mark();
          let k = i + decM[0].length;
          let st2: 'code' | 'sq' | 'dq' | 'tpl' | 'line' | 'block' = 'code';
          let erased = false;
          while (k < n) {
            const t = src[k];
            if (st2 === 'code') {
              if (t === '/' && src[k + 1] === '/') {
                st2 = 'line';
                k += 2;
                continue;
              }
              if (t === '/' && src[k + 1] === '*') {
                st2 = 'block';
                k += 2;
                continue;
              }
              if (t === "'") {
                st2 = 'sq';
                k++;
                continue;
              }
              if (t === '"') {
                st2 = 'dq';
                k++;
                continue;
              }
              if (t === '`') {
                st2 = 'tpl';
                k++;
                continue;
              }
              if (t === '{') {
                const end = matchBrace(src, k);
                k = end === -1 ? n : end;
                erased = true;
                break;
              }
              if (t === ';' || t === '\n') {
                k = t === ';' ? k + 1 : k;
                erased = true;
                break;
              }
              k++;
              continue;
            }
            if (st2 === 'line') {
              if (t === '\n') {
                k++;
                erased = true;
                break;
              }
              k++;
              continue;
            }
            if (st2 === 'block') {
              if (t === '*' && src[k + 1] === '/') {
                st2 = 'code';
                k += 2;
                continue;
              }
              k++;
              continue;
            }
            if (t === '\\') {
              k += 2;
              continue;
            }
            if ((st2 === 'sq' && t === "'") || (st2 === 'dq' && t === '"') || (st2 === 'tpl' && t === '`')) st2 = 'code';
            k++;
          }
          void erased;
          out += '\n';
          i = k;
          atLineStart = true;
          continue;
        }
      }
      if (c === '\n') atLineStart = true;
      else if (c !== ' ' && c !== '\t' && c !== '\r') atLineStart = false;
      out += c;
      i++;
      continue;
    }
    if (state === 'line') {
      out += c;
      if (c === '\n') {
        state = 'code';
        atLineStart = true;
      }
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
    out += c;
    if (c === '\\') {
      out += src[i + 1] ?? '';
      i += 2;
      continue;
    }
    if ((state === 'sq' && c === "'") || (state === 'dq' && c === '"') || (state === 'tpl' && c === '`')) state = 'code';
    i++;
  }
  return out;
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
          // Skip the type until a code boundary. Openers nest and their
          // closers are part of the type (`as { a?: string }`); a closer
          // with nothing open ends it (`(a as T)` stops before `)`).
          // String-aware so quoted literals inside the type don't desync.
          let k = j;
          let depth = 0;
          let st: 'code' | 'sq' | 'dq' | 'tpl' = 'code';
          let end = -1;
          while (k < n) {
            const t = src[k];
            if (st !== 'code') {
              if (t === '\\') {
                k += 2;
                continue;
              }
              if ((st === 'sq' && t === "'") || (st === 'dq' && t === '"') || (st === 'tpl' && t === '`')) st = 'code';
              k++;
              continue;
            }
            if (t === "'" || t === '"' || t === '`') {
              st = t === "'" ? 'sq' : t === '"' ? 'dq' : 'tpl';
              k++;
              continue;
            }
            if (t === '<' || t === '(' || t === '[' || t === '{') {
              depth++;
              k++;
              continue;
            }
            if (t === '>' || t === ')' || t === ']' || t === '}') {
              if (depth === 0) {
                end = k;
                break;
              }
              depth--;
              k++;
              continue;
            }
            // Stop before `;` `,` `=` and operators at depth 0 — but keep
            // scanning through qualified names like `Record<string, any>`.
            if (depth === 0 && /[,;=[&|?:+\-*/!%\n]/.test(t)) {
              end = k;
              break;
            }
            k++;
          }
          if (end === -1) end = k;
          if (end > j) {
            mark();
            i = end;
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
  // Bracket stack for the *emitted* code: decides whether `:` sits in a
  // params/args list (`(` on top), a block, or an object literal. Stripped
  // annotations remove their brackets too, so the stack always reflects the
  // code as the renderer will execute it.
  const stack: string[] = [];
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
  // scanBlockStart scans backward over the emitted code to classify the
  // `{` enclosing the current position: object literal vs code block.
  // Returns 'object' | 'block' | 'top' (no enclosing brace / statement
  // start). String-aware (approximately — ambiguous input defaults to
  // 'object', i.e. never strip, the fail-safe direction).
  const scanEnclosing = (): { kind: 'object' | 'block' | 'top'; stmt: string } => {
    let dRound = 0;
    let dSquare = 0;
    let dCurly = 0;
    let inStr: string | null = null;
    let k = out.length - 1;
    while (k >= 0) {
      const c = out[k];
      if (inStr) {
        if (c === inStr) {
          let bs = 0;
          let m = k - 1;
          while (m >= 0 && out[m] === '\\') {
            bs++;
            m--;
          }
          if (bs % 2 === 0) inStr = null;
        }
        k--;
        continue;
      }
      if (c === '"' || c === "'" || c === '`') {
        inStr = c;
        k--;
        continue;
      }
      if (c === ')' || c === ']' || c === '}') {
        if (c === ')') dRound++;
        else if (c === ']') dSquare++;
        else dCurly++;
        k--;
        continue;
      }
      if (c === '(' || c === '[' || c === '{') {
        if (c === '(') {
          if (dRound === 0) return { kind: 'top', stmt: out.slice(k + 1) };
          dRound--;
          k--;
          continue;
        }
        if (c === '[') {
          if (dSquare === 0) return { kind: 'top', stmt: out.slice(k + 1) };
          dSquare--;
          k--;
          continue;
        }
        // c === '{'
        if (dCurly > 0) {
          dCurly--;
          k--;
          continue;
        }
        // Enclosing `{` found — object literal or code block?
        let p = k - 1;
        while (p >= 0 && (out[p] === ' ' || out[p] === '\t' || out[p] === '\n' || out[p] === '\r')) p--;
        const pc = p >= 0 ? out[p] : '';
        const before = out.slice(Math.max(0, p - 7), p + 1);
        const isObject =
          pc === '(' ||
          pc === ',' ||
          pc === '=' ||
          pc === ':' ||
          pc === '[' ||
          pc === '?' ||
          pc === '.' ||
          /return\b/.test(before) ||
          /=>$/.test(out.slice(Math.max(0, p - 1), p + 1));
        // `=> {` is a function BODY (block), not an object — arrow object
        // literals need parens in valid JS, so `=>` never opens an object.
        if (/=>$/.test(out.slice(Math.max(0, p - 1), p + 1))) {
          return { kind: 'block', stmt: out.slice(k + 1) };
        }
        return isObject ? { kind: 'object', stmt: '' } : { kind: 'block', stmt: out.slice(k + 1) };
      }
      if (c === ';' && dRound === 0 && dSquare === 0 && dCurly === 0) {
        return { kind: 'block', stmt: out.slice(k + 1) };
      }
      k--;
    }
    return { kind: 'top', stmt: out };
  };
  const stmtIsDeclaration = (stmt: string): boolean =>
    /^\s*(export\s+default\s+|export\s+)?(async\s+function\*?\s|function\*?\s|const\s|let\s|var\s|class\s)/.test(stmt);
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
      if (c === '(' || c === '[' || c === '{') {
        stack.push(c);
        out += c;
        i++;
        continue;
      }
      if (c === ')' || c === ']' || c === '}') {
        // Pop the matching opener when present; tolerate stray closers.
        const want = c === ')' ? '(' : c === ']' ? '[' : '{';
        if (stack.length && stack[stack.length - 1] === want) stack.pop();
        out += c;
        i++;
        continue;
      }
      if (c === ':' && src[i + 1] !== ':') {
        const top = stack.length ? stack[stack.length - 1] : '';
        const prev = prevNonSpace();
        const isBindingEnd =
          /[A-Za-z0-9_$\])}]/.test(prev) || prev === '?' || prev === '"' || prev === "'";
        if (!isBindingEnd) {
          out += c;
          i++;
          continue;
        }
        // Position rule: directly inside parens (params/args) or right after
        // `)` (return position) is always a candidate; elsewhere only
        // declaration statements (`const x: T`, block-level) qualify — an
        // enclosing OBJECT brace (`{"a": 1}`, emitted prop objects,
        // destructuring patterns) means preserve.
        const inParens = top === '(';
        let allowByPos = inParens || prev === ')';
        if (!allowByPos) {
          const enc = scanEnclosing();
          allowByPos = enc.kind !== 'object' && stmtIsDeclaration(enc.stmt);
        }
        if (!allowByPos) {
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
        let seen = false; // any non-space type char consumed yet?
        let sawParen = false; // a `(` was consumed (function type?)
        let st: 'code' | 'sq' | 'dq' | 'tpl' = 'code';
        let end = -1;
        while (k < n) {
          const t = src[k];
          if (st === 'code') {
            if (t === "'" || t === '"' || t === '`') {
              st = t === "'" ? 'sq' : t === '"' ? 'dq' : 'tpl';
              seen = true;
              k++;
              continue;
            }
            if (t === '<' && /[A-Za-z0-9_$\]>)\]?]/.test(src[k - 1] ?? '')) {
              a++;
              seen = true;
              k++;
              continue;
            }
            if (t === '>' && a > 0 && src[k + 1] !== '=') {
              a--;
              k++;
              continue;
            }
            if (t === '=' && src[k + 1] === '>') {
              // A bare `=>` at depth 0 is the arrow of an arrow function
              // (`(x): T => ...`) — unless parens were consumed, in which
              // case it belongs to a function TYPE (`: (a) => void`).
              // Function types always carry parens in valid TS, and any
              // `=>` nested deeper is consumed by the depth branches above.
              if (r === 0 && s === 0 && cu === 0 && a === 0 && !sawParen) {
                end = k; // keep the arrow.
                break;
              }
              seen = true;
              k += 2;
              continue;
            }
            if (t === '(' || t === '[') {
              if (t === '(') {
                r++;
                sawParen = true;
              } else s++;
              seen = true;
              k++;
              continue;
            }
            if (t === '{') {
              // `{` after a complete simple type opens the function body
              // (`: unknown {`); at the start of a type it opens an object
              // type (`props: { x: number }`).
              if (r === 0 && s === 0 && cu === 0 && a === 0 && seen) {
                end = k;
                break;
              }
              cu++;
              seen = true;
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
            if (t !== ' ' && t !== '\t' && t !== '\n' && t !== '\r') seen = true;
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
// `? :` on the same nesting level (scans back to a statement boundary).
// Newlines are NOT boundaries — real ternaries (especially JSX ones) span
// lines; only `;` and block/param edges stop the scan.
function looksLikeTernary(src: string, pos: number): boolean {
  let round = 0;
  let square = 0;
  let curly = 0;
  for (let k = pos - 1; k >= 0; k--) {
    const c = src[k];
    if (c === ';') return false;
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
      if (src[k + 1] === '.') continue;
      // `??` nullish coalescing is not a ternary.
      if (k > 0 && /[A-Za-z0-9_$]/.test(src[k - 1]) && src[k + 1] === '?') continue;
      // `?` directly before `:`, `,` or `)` is an OPTIONAL marker
      // (`(b?: string)`, `a?: B`), not a ternary — keep scanning back for
      // the real statement start instead of claiming a ternary here.
      let m = k + 1;
      while (m < src.length && (src[m] === ' ' || src[m] === '\t' || src[m] === '\n' || src[m] === '\r')) m++;
      if (m < src.length && (src[m] === ':' || src[m] === ',' || src[m] === ')')) continue;
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

// transpileExprInner rewrites JSX nested inside a `{...}` expression
// (`.map((t) => (<li/>)`, ternaries `{ok ? <A/> : <B/>}`, fragments).
// Linear scan with string/comment awareness; `<` that doesn't open a valid
// element (comparisons like `a < b`) is left alone via tryParseElement's
// null fallback. Recursion terminates: each nested parse consumes a
// strictly smaller slice.
function transpileExprInner(expr: string): string {
  let out = '';
  let i = 0;
  const n = expr.length;
  let state: 'code' | 'sq' | 'dq' | 'tpl' | 'line' | 'block' = 'code';
  let tplDepth = 0;
  while (i < n) {
    const c = expr[i];
    if (state === 'code') {
      if (c === '/' && expr[i + 1] === '/') {
        state = 'line';
        out += '//';
        i += 2;
        continue;
      }
      if (c === '/' && expr[i + 1] === '*') {
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
        const nx = expr[i + 1] ?? '';
        if (/[A-Za-z_>/]/.test(nx) || (nx === '/' && /[A-Za-z_>]/.test(expr[i + 2] ?? ''))) {
          const parsed = tryParseElement(expr, i);
          if (parsed) {
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
      if (c === '*' && expr[i + 1] === '/') {
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
        out += expr[i + 1] ?? '';
        i += 2;
        continue;
      }
      if (c === q) state = 'code';
      i++;
      continue;
    }
    // tpl: `${...}` holes are code again (JSX may hide there).
    out += c;
    if (c === '\\') {
      out += expr[i + 1] ?? '';
      i += 2;
      continue;
    }
    if (c === '$' && expr[i + 1] === '{') {
      tplDepth++;
      out += '{';
      i += 2;
      continue;
    }
    if (c === '{' && tplDepth > 0) {
      tplDepth++;
      i++;
      continue;
    }
    if (c === '}' && tplDepth > 0) {
      tplDepth--;
      i++;
      continue;
    }
    if (c === '`' && tplDepth === 0) state = 'code';
    i++;
  }
  return out;
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
      // Nested JSX inside the expression (callbacks, ternaries) transpiles
      // recursively; plain expressions pass through unchanged.
      propsParts.push(`${JSON.stringify(pname)}: (${transpileExprInner(expr) || 'undefined'})`);
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
        node.children.push(`(${transpileExprInner(expr.trim()) || 'undefined'})`);
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

// ---- virtual modules (multi-file pages) ----

// MAX_REACT_PAGE_MODULES caps the Files list per page. The components column
// budget (512KiB total) is the real backstop — this cap just keeps the graph
// small enough to sort inline. No storage change: modules ride as components
// rows with type 'module' ({name, content}).
export const MAX_REACT_PAGE_MODULES = 20;
// MAX_MODULE_GRAPH_DEPTH bounds DFS so a 500-deep chain fails closed with a
// clear message instead of a stack overflow.
const MAX_MODULE_GRAPH_DEPTH = 100;
const MODULE_EXT_RE = /\.(js|jsx|ts|tsx|mjs|cjs)$/;
const MODULE_NAME_RE = /^[A-Za-z0-9_][A-Za-z0-9_-]*$/;
const MODULE_SEGMENT_RE = /^[A-Za-z0-9_][A-Za-z0-9_.-]*$/;

// stripModuleExt drops a trailing code extension so './util.js' and './util'
// resolve to the same Files entry ('util').
function stripModuleExt(p: string): string {
  return p.replace(MODULE_EXT_RE, '');
}

function dirOfModuleKey(key: string): string {
  const i = key.lastIndexOf('/');
  return i === -1 ? '' : key.slice(0, i);
}

function sanitizeModuleKey(key: string): string {
  const s = key.replace(/[^A-Za-z0-9_$]/g, '_');
  return /^[0-9]/.test(s) ? `_${s}` : s;
}

// normalizeModuleSpecifier resolves a relative import against the importer's
// directory and jails it to the page root. Throws a page-author-actionable
// error for non-relative/absolute specifiers, escapes, and bad characters.
// Mirrors the Go jail in validateReactSource exactly (same order, same
// verdicts): './' or '../' prefix required, '\'/'%'/'?'/'#' rejected, '..'
// past root rejected.
export function normalizeModuleSpecifier(spec: string, importerDir: string): string {
  if (spec === 'react') return 'react';
  if (spec.includes('\\')) {
    throw new Error(`import '${spec.slice(0, 80)}' must use '/' separators (found '\\') — use './name' instead`);
  }
  if (spec.includes('%')) {
    throw new Error(`import '${spec.slice(0, 80)}' must not contain URL-encoded characters ('%') — use './name' instead`);
  }
  if (spec.includes('?') || spec.includes('#')) {
    throw new Error(`import '${spec.slice(0, 80)}' must not contain '?' or '#' — use './name' instead`);
  }
  if (!spec.startsWith('./') && !spec.startsWith('../')) {
    throw new Error(
      `import '${spec.slice(0, 80)}' is not allowed — only relative './...'/'../...' staying inside the page root and 'react' are allowed; React and sdk are already in scope`,
    );
  }
  if (spec.includes('//')) {
    throw new Error(`import '${spec.slice(0, 80)}' contains an empty path segment ('//') — use './name' instead`);
  }
  const stack: string[] = importerDir ? importerDir.split('/') : [];
  for (const seg of spec.split('/')) {
    if (seg === '' || seg === '.') {
      if (seg === '') {
        throw new Error(`import '${spec.slice(0, 80)}' contains an empty path segment — use './name' instead`);
      }
      continue;
    }
    if (seg === '..') {
      if (stack.length === 0) {
        throw new Error(`import '${spec.slice(0, 80)}' escapes the page root (.. beyond root) — keep files at the page root and import with './name'`);
      }
      stack.pop();
      continue;
    }
    if (!MODULE_SEGMENT_RE.test(seg)) {
      throw new Error(`import '${spec.slice(0, 80)}' has an unsupported path segment '${seg.slice(0, 40)}' — use letters, numbers, '_', '-' or '.'`);
    }
  }
  if (stack.length === 0) {
    throw new Error(`import '${spec.slice(0, 80)}' points at the page root — import a file (e.g. './util') instead`);
  }
  return stack.join('/');
}

function validateModuleName(name: string): void {
  if (name.length === 0 || name.length > 64 || !MODULE_NAME_RE.test(name)) {
    throw new Error(
      `module name '${name.slice(0, 64)}' is not allowed — keep files at the page root (start with a letter, number or underscore; letters, numbers, '_' or '-' only; max 64 chars)`,
    );
  }
}

interface ParsedImport {
  spec: string;
  kind: 'side' | 'default' | 'named' | 'mixed' | 'namespace' | 'odd';
  defaultName?: string;
  namespace?: string;
  named?: Array<{ imported: string; local: string }>;
}

// collectFileImports finds single-line import statements in real code
// (strings/comments skipped via blankStringsAndComments, same gate the
// react-import pass uses). Multiline imports are left for the later pass,
// which rejects them fail-closed — same as single-file pages.
function collectFileImports(src: string): ParsedImport[] {
  const out: ParsedImport[] = [];
  for (const line of src.split('\n')) {
    if (!/^\s*import\b/.test(blankStringsAndComments(line))) continue;
    let m = line.match(/^\s*import\s+['"]([^'"]+)['"]\s*;?\s*$/);
    if (m) {
      out.push({ spec: m[1], kind: 'side' });
      continue;
    }
    m = line.match(/^\s*import\s+(.+?)\s+from\s+['"]([^'"]+)['"]\s*;?\s*$/);
    if (!m) continue; // odd/multiline shape — later pass rejects it.
    out.push({ ...parseImportClause(m[1]), spec: m[2] });
  }
  return out;
}

function parseImportClause(clause: string): Omit<ParsedImport, 'spec'> {
  const c = clause.trim();
  const ns = c.match(/^\*\s+as\s+([A-Za-z_$][A-Za-z0-9_$]*)$/);
  if (ns) return { kind: 'namespace', namespace: ns[1] };
  const ident = /^[A-Za-z_$][A-Za-z0-9_$]*$/;
  if (c.startsWith('{')) {
    const named = parseNamedList(c);
    return named ? { kind: 'named', named } : { kind: 'odd' };
  }
  const braceAt = c.indexOf('{');
  if (braceAt !== -1) {
    const defPart = c.slice(0, braceAt).trim().replace(/,$/, '').trim();
    const named = parseNamedList(c.slice(braceAt));
    if (named && ident.test(defPart)) return { kind: 'mixed', defaultName: defPart, named };
    return { kind: 'odd' };
  }
  if (ident.test(c)) return { kind: 'default', defaultName: c };
  return { kind: 'odd' };
}

function parseNamedList(brace: string): Array<{ imported: string; local: string }> | null {
  const m = brace.trim().match(/^\{([^}]*)\}$/);
  if (!m) return null;
  const out: Array<{ imported: string; local: string }> = [];
  for (const part of m[1].split(',')) {
    const s = part.trim();
    if (!s) continue;
    const am = s.match(/^([A-Za-z_$][A-Za-z0-9_$]*)\s+as\s+([A-Za-z_$][A-Za-z0-9_$]*)$/);
    if (am) {
      out.push({ imported: am[1], local: am[2] });
      continue;
    }
    if (/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(s)) {
      out.push({ imported: s, local: s });
      continue;
    }
    return null;
  }
  return out;
}

// collectModuleExports scans a module for its exported value names (for
// `import * as ns` + unknown-export checks) and type-only names (which
// cannot be imported as values — they vanish in the TS strip). Line-based
// like the import pass; strings/comments skipped via blankStringsAndComments.
function collectModuleExports(src: string): { values: string[]; types: string[]; hasDefault: boolean } {
  const values: string[] = [];
  const types: string[] = [];
  let hasDefault = false;
  for (const line of src.split('\n')) {
    const blanked = blankStringsAndComments(line);
    const t = blanked.trim();
    if (/^export\s+default\b/.test(t)) {
      hasDefault = true;
      continue;
    }
    let m = t.match(/^export\s+(?:async\s+function\s+|function\s+|class\s+|enum\s+|namespace\s+)([A-Za-z_$][A-Za-z0-9_$]*)/);
    if (m) {
      values.push(m[1]);
      continue;
    }
    m = t.match(/^export\s+(?:const|let|var)\s+([A-Za-z_$][A-Za-z0-9_$]*)/);
    if (m) {
      values.push(m[1]);
      continue;
    }
    m = t.match(/^export\s+(interface|type)\s+([A-Za-z_$][A-Za-z0-9_$]*)/);
    if (m) {
      types.push(m[2]);
      continue;
    }
    m = t.match(/^export\s*\{([^}]*)\}\s*;?\s*$/);
    if (m && !/\bfrom\b/.test(t)) {
      for (const part of m[1].split(',')) {
        const s = part.trim();
        if (!s) continue;
        const am = s.match(/^([A-Za-z_$][A-Za-z0-9_$]*)\s+as\s+([A-Za-z_$][A-Za-z0-9_$]*)$/);
        if (am) values.push(am[2]);
        else if (/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(s)) values.push(s);
      }
    }
  }
  return { values, types, hasDefault };
}

// bundleVirtualModules inlines reachable relative modules in dependency order
// before the entry body and rewrites the satisfied import lines to const
// bindings. React imports are merged into one header (deduped — two modules
// importing {useState} must not emit duplicate consts). Throws
// page-author-actionable errors for escapes, bare/absolute specifiers,
// missing modules (listing available names), cycles (naming the cycle),
// unknown exports, oversize bundles and over-deep graphs.
function bundleVirtualModules(entrySrc: string, modules: Record<string, string>): string {
  const keys = Object.keys(modules);
  if (keys.length > MAX_REACT_PAGE_MODULES) {
    throw new Error(`too many modules (${keys.length}, max ${MAX_REACT_PAGE_MODULES}) — merge small helpers into fewer files`);
  }
  // Normalized lookup: Files live at the page root ('util'), imports may
  // carry an extension ('./util.js'). Both sides strip it for the match.
  const byKey = new Map<string, { name: string; content: string }>();
  for (const k of keys) {
    validateModuleName(k);
    const norm = stripModuleExt(k);
    const prev = byKey.get(norm);
    if (prev) {
      throw new Error(`duplicate module '${norm}' ('${prev.name}' vs '${k}') — Files names must be unique ignoring extensions`);
    }
    byKey.set(norm, { name: k, content: modules[k] ?? '' });
  }
  const available = [...byKey.keys()].sort();
  const bodies = new Map<string, string>();
  bodies.set('index', entrySrc);
  for (const [, v] of byKey) bodies.set(v.name, v.content);

  // Dependency graph over normalized keys ('index' == entry at root).
  const deps = new Map<string, string[]>();
  const resolveOne = (spec: string, importer: string, importerDir: string): string | null => {
    if (spec === 'react') return null;
    const norm = stripModuleExt(normalizeModuleSpecifier(spec, importerDir));
    if (!byKey.has(norm)) {
      const who = importer === 'index' ? 'index' : `'${importer}'`;
      const avail = available.length ? available.join(', ') : '(no modules)';
      throw new Error(`unknown module '${spec.slice(0, 80)}' (imported by ${who}) — available modules: ${avail} — add a Files entry or fix the path`);
    }
    return norm;
  };
  const allFiles: Array<{ key: string; dir: string; src: string }> = [
    { key: 'index', dir: '', src: entrySrc },
    ...[...byKey].map(([norm, v]) => ({ key: norm, dir: dirOfModuleKey(norm), src: v.content })),
  ];
  for (const f of allFiles) {
    const list: string[] = [];
    for (const imp of collectFileImports(f.src)) {
      if (imp.kind === 'odd') continue; // later pass rejects the shape.
      // Bare/absolute/escaping specifiers throw here (fail-closed, parity
      // with the Go validator).
      const dep = resolveOne(imp.spec, f.key === 'index' ? 'index' : (byKey.get(f.key)?.name ?? f.key), f.dir);
      if (dep !== null && !list.includes(dep)) list.push(dep);
    }
    deps.set(f.key, list);
  }

  // Reachable from the entry only — unused Files never ship, so old pages
  // with stray modules stay byte-identical.
  const reachable = new Set<string>(['index']);
  const stack = ['index'];
  let guard = 0;
  while (stack.length) {
    if (++guard > MAX_MODULE_GRAPH_DEPTH * 20) {
      throw new Error(`module graph too large — check for runaway imports (max ${MAX_REACT_PAGE_MODULES} modules)`);
    }
    const cur = stack.pop()!;
    for (const d of deps.get(cur) ?? []) {
      if (!reachable.has(d)) {
        reachable.add(d);
        stack.push(d);
      }
    }
  }

  // Depth guard: a 500-deep chain fails closed instead of overflowing.
  {
    const depthOf = (start: string): number => {
      let depth = 0;
      let cur = start;
      const seen = new Set<string>();
      while (cur !== 'index') {
        if (seen.has(cur)) break;
        seen.add(cur);
        // Walk one parent chain (first importer found).
        let parent: string | null = null;
        for (const [k, ds] of deps) {
          if (reachable.has(k) && ds.includes(cur)) {
            parent = k;
            break;
          }
        }
        if (!parent) break;
        cur = parent;
        if (++depth > MAX_MODULE_GRAPH_DEPTH) break;
      }
      return depth;
    };
    for (const k of reachable) {
      if (k !== 'index' && depthOf(k) > MAX_MODULE_GRAPH_DEPTH) {
        throw new Error(`module graph too deep (>${MAX_MODULE_GRAPH_DEPTH}) — flatten the import chain`);
      }
    }
  }

  // Topological order (dependencies first) with cycle detection naming the
  // cycle. Iterative DFS so deep (but legal) chains don't recurse.
  const order: string[] = [];
  const state = new Map<string, number>(); // 0 unvisited, 1 in-stack, 2 done
  const path: string[] = [];
  const visit = (start: string) => {
    const work: Array<{ key: string; i: number }> = [{ key: start, i: 0 }];
    while (work.length) {
      const top = work[work.length - 1];
      const st = state.get(top.key) ?? 0;
      if (st === 0) {
        state.set(top.key, 1);
        path.push(top.key);
      }
      const ds = (deps.get(top.key) ?? []).filter((d) => reachable.has(d));
      if (top.i < ds.length) {
        const next = ds[top.i++];
        const ns = state.get(next) ?? 0;
        if (ns === 1) {
          const cyc = [...path.slice(path.indexOf(next)), next].map((k) =>
            k === 'index' ? 'index' : `'${byKey.get(k)?.name ?? k}'`,
          );
          throw new Error(`circular import detected: ${cyc.join(' -> ')} — break the cycle by moving shared code into a leaf module`);
        }
        if (ns === 0) work.push({ key: next, i: 0 });
        continue;
      }
      state.set(top.key, 2);
      path.pop();
      if (top.key !== 'index') order.push(top.key);
      work.pop();
    }
  };
  visit('index');

  // Per-module export tables for `import * as ns` + unknown-export checks.
  const exportOf = new Map<string, { values: string[]; types: string[]; hasDefault: boolean }>();
  for (const k of order) {
    exportOf.set(k, collectModuleExports(byKey.get(k)!.content));
  }

  // Merged react header (deduped across entry + modules).
  const reactNamed = new Map<string, string>(); // local -> imported
  const reactNs = new Map<string, boolean>();
  let reactSide = false;
  const scanReact = (src: string) => {
    for (const line of src.split('\n')) {
      if (!/^\s*import\b/.test(blankStringsAndComments(line))) continue;
      if (/^\s*import\s+['"]react['"]\s*;?\s*$/.test(line)) {
        reactSide = true;
        continue;
      }
      const m = line.match(/^\s*import\s+(.+?)\s+from\s+['"]react['"]\s*;?\s*$/);
      if (!m) continue;
      const clause = m[1].trim();
      const ns = clause.match(/^\*\s+as\s+([A-Za-z_$][A-Za-z0-9_$]*)$/);
      if (ns) {
        reactNs.set(ns[1], true);
        continue;
      }
      const parts = clause.match(/^([A-Za-z_$][A-Za-z0-9_$]*)?\s*,?\s*(\{[^}]*\})?$/);
      if (!parts) continue;
      if (parts[2]) {
        for (const p of parts[2].slice(1, -1).split(',')) {
          const s = p.trim();
          if (!s) continue;
          const am = s.match(/^([A-Za-z_$][A-Za-z0-9_$]*)\s+as\s+([A-Za-z_$][A-Za-z0-9_$]*)$/);
          if (am) {
            if (!reactNamed.has(am[2])) reactNamed.set(am[2], am[1]);
          } else if (/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(s)) {
            if (!reactNamed.has(s)) reactNamed.set(s, s);
          }
        }
      }
    }
  };
  scanReact(entrySrc);
  for (const k of order) scanReact(byKey.get(k)!.content);

  // Rewrite one file: relative imports -> const bindings/comments, react
  // imports -> dropped (merged header covers them), export default ->
  // per-module default binding, local export lists -> dropped.
  const rewriteFile = (src: string, selfKey: string, selfDir: string): string => {
    const defBinding = `__ks_default_${sanitizeModuleKey(selfKey === 'index' ? 'index' : (byKey.get(selfKey)?.name ?? selfKey))}`;
    const lines = src.split('\n');
    const out: string[] = [];
    for (const line of lines) {
      const blanked = blankStringsAndComments(line);
      // Module default export -> default binding (entry keeps fail-closed:
      // `export default` there is still rejected by the later pass).
      if (selfKey !== 'index' && /^\s*export\s+default\b/.test(blanked)) {
        out.push(line.replace(/export\s+default/, `const ${defBinding} =`));
        continue;
      }
      // Local export list in a module -> dropped (names are top-level after
      // concatenation). Re-exports stay for the later pass to reject.
      if (selfKey !== 'index' && /^\s*export\s*\{[^}]*\}\s*;?\s*$/.test(blanked) && !/\bfrom\b/.test(blanked)) {
        out.push('// (bundled export list: names are top-level after inlining)');
        continue;
      }
      if (!/^\s*import\b/.test(blanked)) {
        out.push(line);
        continue;
      }
      // React imports -> dropped here, merged header covers them.
      if (/^\s*import\s+['"]react['"]\s*;?\s*$/.test(line)) continue;
      {
        const m = line.match(/^\s*import\s+(.+?)\s+from\s+['"]react['"]\s*;?\s*$/);
        if (m) continue;
      }
      const mSide = line.match(/^\s*import\s+['"]([^'"]+)['"]\s*;?\s*$/);
      if (mSide) {
        const spec = mSide[1];
        if (spec === 'react') continue;
        // Relative side-effect import: module already inlined above.
        // resolveOne throws for bare/absolute/escape/missing (parity).
        resolveOne(spec, selfKey === 'index' ? 'index' : (byKey.get(selfKey)?.name ?? selfKey), selfDir);
        out.push(`// (bundled import '${spec.slice(0, 60)}')`);
        continue;
      }
      const mFrom = line.match(/^\s*import\s+(.+?)\s+from\s+['"]([^'"]+)['"]\s*;?\s*$/);
      if (!mFrom) {
        out.push(line); // odd shape — later pass rejects it.
        continue;
      }
      const clause = parseImportClause(mFrom[1]);
      const spec = mFrom[2];
      if (spec === 'react' || clause.kind === 'odd') {
        out.push(line);
        continue;
      }
      const dep = resolveOne(spec, selfKey === 'index' ? 'index' : (byKey.get(selfKey)?.name ?? selfKey), selfDir)!;
      const exp = exportOf.get(dep) ?? { values: [], types: [], hasDefault: false };
      const depLabel = `'${byKey.get(dep)?.name ?? dep}'`;
      const bindings: string[] = [];
      const checkNamed = (items: Array<{ imported: string; local: string }>) => {
        for (const { imported, local } of items) {
          if (exp.types.includes(imported) && !exp.values.includes(imported)) {
            throw new Error(`module ${depLabel} export '${imported}' is a type (interface/type) and cannot be imported as a value — import a function, const or component instead`);
          }
          if (!exp.values.includes(imported) && imported !== 'default') {
            const avail = exp.values.length ? exp.values.slice().sort().join(', ') : '(no value exports)';
            throw new Error(`module ${depLabel} has no export '${imported}' — available: ${avail}`);
          }
          if (local !== imported) bindings.push(`const ${local} = ${imported};`);
        }
      };
      if (clause.kind === 'namespace') {
        const parts = exp.values.map((v) => `${v}: ${v}`);
        if (exp.hasDefault) parts.push(`default: ${`__ks_default_${sanitizeModuleKey(byKey.get(dep)!.name)}`}`);
        bindings.push(`const ${clause.namespace} = { ${parts.join(', ')} };`);
      } else if (clause.kind === 'default') {
        if (!exp.hasDefault) {
          const avail = exp.values.length ? exp.values.slice().sort().join(', ') : '(no value exports)';
          throw new Error(`module ${depLabel} has no default export (imported by ${selfKey === 'index' ? 'index' : `'${byKey.get(selfKey)?.name ?? selfKey}'`}) — available: ${avail} — add 'export default ...' or use a named import`);
        }
        bindings.push(`const ${clause.defaultName} = __ks_default_${sanitizeModuleKey(byKey.get(dep)!.name)};`);
      } else if (clause.kind === 'named' && clause.named) {
        checkNamed(clause.named);
      } else if (clause.kind === 'mixed' && clause.named && clause.defaultName) {
        if (!exp.hasDefault) {
          const avail = exp.values.length ? exp.values.slice().sort().join(', ') : '(no value exports)';
          throw new Error(`module ${depLabel} has no default export — available: ${avail} — add 'export default ...' or use a named import`);
        }
        bindings.push(`const ${clause.defaultName} = __ks_default_${sanitizeModuleKey(byKey.get(dep)!.name)};`);
        checkNamed(clause.named);
      } else {
        out.push(line);
        continue;
      }
      out.push(`// (bundled import from '${spec.slice(0, 60)}')`);
      for (const b of bindings) out.push(b);
    }
    return out.join('\n');
  };

  const chunks: string[] = [];
  if (reactSide || reactNamed.size > 0 || reactNs.size > 0) {
    chunks.push('// (bundled react imports: runtime already in scope)');
    if (reactSide) chunks.push('// (dropped side-effect import of react: runtime already in scope)');
    for (const alias of [...reactNs.keys()].sort()) chunks.push(`const ${alias} = React;`);
    if (reactNamed.size > 0) {
      const inner = [...reactNamed.entries()]
        .sort((a, b) => (a[0] < b[0] ? -1 : 1))
        .map(([local, imported]) => (local === imported ? local : `${imported}: ${local}`))
        .join(', ');
      chunks.push(`const {${inner}} = React;`);
    }
  }
  for (const k of order) {
    const v = byKey.get(k)!;
    chunks.push(`// ---- module: ${v.name} (bundled) ----`);
    chunks.push(rewriteFile(v.content, k, dirOfModuleKey(k)));
  }
  chunks.push('// ---- entry (index) ----');
  chunks.push(rewriteFile(entrySrc, 'index', ''));

  const combined = chunks.join('\n');
  if (combined.length > 512 * 1024) {
    throw new Error(
      `combined page source too large (${combined.length} bytes including ${order.length} module(s), max 524288) — split the page or shrink modules (components budget is 512KiB total)`,
    );
  }
  return combined;
}

// transpileReactPageSource is the single entry point for the renderer (and
// Studio live-check): react imports → JSX → light TS strip → executable JS.
//
// ORDER MATTERS: JSX runs BEFORE TS-stripping so element text lands inside
// quoted strings first — otherwise a text colon like `page: {x}` looks like
// a TS annotation and the stripper eats the markup. TS affordances survive
// JSX parsing untouched (they sit in plain code or `{expr}` holes, which the
// JSX pass carries through verbatim), and quoted text is string-skipped by
// every TS pass.
export function transpileReactPageSource(
  src: string,
  modules?: Record<string, string>,
): { code: string; hadJSX: boolean; hadTS: boolean; hadImport: boolean } {
  // Optional second arg (default {}): old single-file call sites keep
  // working and stay byte-identical (fast path below skips bundling when no
  // reachable relative import exists).
  const table = modules ?? {};
  const needsBundle = collectFileImports(src).some((i) => i.spec !== 'react');
  const entry = needsBundle ? bundleVirtualModules(src, table) : src;
  const rw = rewriteReactImports(entry);
  const jsx = transpileJSX(rw.code);
  const ts = stripLightTS(jsx.code);
  return { code: ts.code, hadJSX: jsx.hadJSX, hadTS: ts.hadTS, hadImport: rw.hadImport };
}

export default transpileReactPageSource;
