import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useConfirm } from '@/shared/stores/confirmStore';
import { downloadFile, readFileText, statPath, writeFile } from '../api/instanceFiles';

function toast(msg: string, type: 'success' | 'error' | 'info' = 'info') {
  window.dispatchEvent(new CustomEvent('ks-toast', { detail: { message: msg, type } }));
}

// MAX_EDIT_BYTES keeps huge binaries out of the textarea (2 MiB of text is
// already unwieldy); larger files get download-only treatment.
const MAX_EDIT_BYTES = 2 * 1024 * 1024;

// MAX_HIGHLIGHT_CHARS bounds the syntax highlighter: past this the editor
// renders plain text so giant files stay editable without jank.
const MAX_HIGHLIGHT_CHARS = 150000;

const CODE_FONT = "'JetBrains Mono',ui-monospace,SFMono-Regular,Menlo,monospace";
const CODE_SIZE = 13;
const CODE_LINE_HEIGHT = 1.6;

function escHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

type Scope =
  | 'kw'
  | 'str'
  | 'num'
  | 'com'
  | 'key'
  | 'tag'
  | 'bool'
  | 'head'
  | 'b'
  | 'err'
  | 'warn'
  | 'info'
  | 'dim'
  | 'var';

const SCOPE_STYLE: Record<Scope, string> = {
  kw: 'color:var(--ks-pink);',
  str: 'color:var(--ks-ok);',
  num: 'color:var(--ks-warn);',
  com: 'color:var(--ks-muted);font-style:italic;',
  key: 'color:var(--ks-info);',
  tag: 'color:var(--ks-info);',
  bool: 'color:var(--ks-pink);',
  head: 'color:var(--ks-heading);font-weight:700;',
  b: 'color:var(--ks-heading);font-weight:700;',
  err: 'color:var(--ks-bad);font-weight:600;',
  warn: 'color:var(--ks-warn);',
  info: 'color:var(--ks-info);',
  dim: 'color:var(--ks-muted);',
  var: 'color:var(--ks-info);',
};

type Lang =
  | 'code'
  | 'python'
  | 'shell'
  | 'lua'
  | 'sql'
  | 'json'
  | 'html'
  | 'css'
  | 'ini'
  | 'yaml'
  | 'md'
  | 'log'
  | 'plain';

function langOf(filePath: string): Lang {
  const m = String(filePath).toLowerCase().match(/\.([a-z0-9]+)$/);
  const ext = m ? m[1] : '';
  if (['js', 'jsx', 'ts', 'tsx', 'mjs', 'cjs', 'c', 'h', 'cpp', 'hpp', 'cc', 'cxx', 'cs', 'java', 'kt', 'kts', 'go', 'rs', 'php', 'swift', 'vue', 'svelte', 'dart'].includes(ext)) return 'code';
  if (['py', 'pyw', 'rb', 'pl'].includes(ext)) return 'python';
  if (['sh', 'bash', 'zsh', 'fish', 'ksh'].includes(ext)) return 'shell';
  if (ext === 'lua') return 'lua';
  if (ext === 'sql') return 'sql';
  if (['json', 'jsonc'].includes(ext)) return 'json';
  if (['html', 'htm', 'xml', 'svg', 'xhtml'].includes(ext)) return 'html';
  if (['css', 'scss', 'less'].includes(ext)) return 'css';
  if (['ini', 'cfg', 'conf', 'properties', 'toml', 'env'].includes(ext)) return 'ini';
  if (['yml', 'yaml'].includes(ext)) return 'yaml';
  if (['md', 'markdown'].includes(ext)) return 'md';
  if (ext === 'log') return 'log';
  return 'plain';
}

const CODE_KEYWORDS = new Set(
  ('const let var function return if else for while do switch case break continue new delete typeof instanceof in of ' +
    'import export from default class extends super this try catch finally throw async await yield static get set ' +
    'true false null undefined void debugger enum implements interface package private protected public type ' +
    'namespace declare abstract readonly constructor struct fn mut ref match loop use mod pub crate impl trait ' +
    'where func package import').split(' '),
);

const PYTHON_KEYWORDS = new Set(
  ('False None True and as assert async await break class continue def del elif else except finally for from ' +
    'global if import in is lambda nonlocal not or pass raise return try while with yield').split(' '),
);

const SHELL_KEYWORDS = new Set(
  'if then else elif fi for while do done case esac function in select until return exit export local readonly set unset shift trap true false'.split(' '),
);

const LUA_KEYWORDS = new Set(
  'and break do else elseif end false for function goto if in local nil not or repeat return then true until while'.split(' '),
);

const SQL_KEYWORDS = new Set(
  ('select from where insert into values update set delete create table alter drop index view join left right inner ' +
    'outer on group by order having limit offset distinct as and or not null primary key foreign references ' +
    'default unique check constraint begin commit rollback transaction grant revoke union all exists between like ' +
    'in is true false').split(' '),
);

const YAML_BOOLS = new Set('true false null yes no on off'.split(' '));

interface Rule {
  re: RegExp;
  scope: Scope | null;
  keywords?: Set<string>;
  scopeIf?: (after: string) => Scope | null;
}

const WS: Rule = { re: /\s+/y, scope: null };
const NUM: Rule = { re: /\b\d[\w]*(?:\.\d+)?\b/y, scope: 'num' };
const DQ: Rule = { re: /"(?:[^"\\\n]|\\.)*"?/y, scope: 'str' };
const SQ: Rule = { re: /'(?:[^'\\\n]|\\.)*'?/y, scope: 'str' };

function wordRule(keywords: Set<string>): Rule {
  return { re: /[A-Za-z_$][\w$]*/y, scope: null, keywords };
}

const RULES: Record<Exclude<Lang, 'plain'>, Rule[]> = {
  code: [
    { re: /\/\*[\s\S]*/y, scope: 'com' },
    { re: /\/\/[^\n]*/y, scope: 'com' },
    DQ,
    SQ,
    { re: /`(?:[^`\\]|\\.)*`?/y, scope: 'str' },
    NUM,
    WS,
    wordRule(CODE_KEYWORDS),
  ],
  python: [
    { re: /"""[\s\S]*?(""")?/y, scope: 'str' },
    { re: /'''[\s\S]*?(''')?/y, scope: 'str' },
    { re: /#[^\n]*/y, scope: 'com' },
    DQ,
    SQ,
    NUM,
    WS,
    wordRule(PYTHON_KEYWORDS),
  ],
  shell: [
    { re: /#[^\n]*/y, scope: 'com' },
    DQ,
    SQ,
    { re: /\$(?:\{[^}\n]*\}?|[A-Za-z_][\w]*|\d|[@*#?$!-])/y, scope: 'var' },
    NUM,
    WS,
    wordRule(SHELL_KEYWORDS),
  ],
  lua: [
    { re: /--\[\[[\s\S]*?(\]\])?/y, scope: 'com' },
    { re: /--[^\n]*/y, scope: 'com' },
    DQ,
    SQ,
    NUM,
    WS,
    wordRule(LUA_KEYWORDS),
  ],
  sql: [
    { re: /--[^\n]*/y, scope: 'com' },
    { re: /\/\*[\s\S]*/y, scope: 'com' },
    DQ,
    SQ,
    NUM,
    WS,
    wordRule(SQL_KEYWORDS),
  ],
  json: [
    { re: /\/\/[^\n]*/y, scope: 'com' },
    {
      re: /"(?:[^"\\]|\\.)*"?/y,
      scope: 'str',
      scopeIf: (after) => (/^\s*:/.test(after) ? 'key' : null),
    },
    { re: /-?\b\d+(?:\.\d+)?(?:[eE][+-]?\d+)?\b/y, scope: 'num' },
    WS,
    { re: /[A-Za-z]+/y, scope: null, keywords: new Set(['true', 'false', 'null']) },
  ],
  html: [
    { re: /<!--[\s\S]*/y, scope: 'com' },
    { re: /<![A-Za-z][^<>]*>?/y, scope: 'tag' },
    { re: /<\/?[A-Za-z][^<>\n]*>?/y, scope: 'tag' },
  ],
  css: [
    { re: /\/\*[\s\S]*/y, scope: 'com' },
    DQ,
    SQ,
    { re: /@[A-Za-z-]+/y, scope: 'kw' },
    { re: /\b\d+(?:\.\d+)?[a-zA-Z%]*/y, scope: 'num' },
    WS,
  ],
  ini: [
    { re: /[;#][^\n]*/y, scope: 'com' },
    { re: /\[\[[^\]\n]*\]?\]?/y, scope: 'key' },
    { re: /\[[^\]\n]*\]?/y, scope: 'key' },
    DQ,
    SQ,
    NUM,
    { re: /^[A-Za-z0-9_.\-]+(?=\s*[:=])/my, scope: 'key' },
    WS,
  ],
  yaml: [
    { re: /#[^\n]*/y, scope: 'com' },
    DQ,
    SQ,
    { re: /^[ ]*[A-Za-z0-9_.\-]+(?=\s*:)/my, scope: 'key' },
    NUM,
    WS,
    wordRule(YAML_BOOLS),
  ],
  md: [
    { re: /^#{1,6}[^\n]*/my, scope: 'head' },
    { re: /`[^`\n]+`/y, scope: 'str' },
    { re: /\*\*[^*\n]+\*\*/y, scope: 'b' },
  ],
  log: [
    { re: /\b\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}(?:[.,]\d+)?(?:Z|[+-]\d{2}:?\d{2})?/y, scope: 'dim' },
    { re: /\b(ERROR|FAILED|FAIL|FATAL|EXCEPTION|Error)\b/y, scope: 'err' },
    { re: /\b(WARN|WARNING|Warning)\b/y, scope: 'warn' },
    { re: /\b(INFO|NOTICE|Info)\b/y, scope: 'info' },
    { re: /\b(DEBUG|TRACE|Debug)\b/y, scope: 'dim' },
    NUM,
  ],
};

// highlight tokenizes code with sticky rules (first match at each position
// wins) and returns escaped HTML. Keywords resolve through the rule's set.
function highlight(code: string, lang: Lang): string {
  if (lang === 'plain' || code.length > MAX_HIGHLIGHT_CHARS) return escHtml(code);
  const rules = RULES[lang];
  let out = '';
  let i = 0;
  const n = code.length;
  while (i < n) {
    let matched: RegExpExecArray | null = null;
    let rule: Rule | undefined;
    for (const r of rules) {
      r.re.lastIndex = i;
      const mm = r.re.exec(code);
      if (mm && mm.index === i && mm[0].length > 0) {
        matched = mm;
        rule = r;
        break;
      }
    }
    if (!matched || !rule) {
      out += escHtml(code[i]);
      i++;
      continue;
    }
    let scope = rule.scope;
    if (rule.keywords && scope === null) {
      scope = rule.keywords.has(matched[0]) ? 'kw' : null;
    } else if (rule.scopeIf) {
      scope = rule.scopeIf(code.slice(i + matched[0].length, i + matched[0].length + 8)) ?? rule.scope;
    }
    const e = escHtml(matched[0]);
    out += scope ? `<span style="${SCOPE_STYLE[scope]}">${e}</span>` : e;
    i += matched[0].length;
  }
  return out;
}

const codeTextStyle: React.CSSProperties = {
  fontFamily: CODE_FONT,
  fontSize: CODE_SIZE,
  lineHeight: CODE_LINE_HEIGHT,
  whiteSpace: 'pre',
  overflowWrap: 'normal',
  wordBreak: 'normal',
  margin: 0,
  border: 0,
};

const InstanceFileEditor: React.FC<{ instanceId: number; filesSlug: string }> = ({ instanceId, filesSlug }) => {
  const navigate = useNavigate();
  const confirm = useConfirm();
  const [searchParams] = useSearchParams();
  const targetPath = searchParams.get('path') || '';

  const [text, setText] = useState('');
  const [savedText, setSavedText] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [tooLarge, setTooLarge] = useState(false);
  const taRef = useRef<HTMLTextAreaElement>(null);
  const preRef = useRef<HTMLPreElement>(null);
  const gutterRef = useRef<HTMLDivElement>(null);

  // The textarea is the scroll container (native caret tracking, IME and
  // touch scrolling for free); the highlighted layer and the gutter follow
  // it via transform/scrollTop so all three stay pixel-aligned.
  const onCodeScroll = useCallback(() => {
    const ta = taRef.current;
    if (!ta) return;
    if (preRef.current) {
      preRef.current.style.transform = `translate(${-ta.scrollLeft}px,${-ta.scrollTop}px)`;
    }
    if (gutterRef.current) gutterRef.current.scrollTop = ta.scrollTop;
  }, []);

  const dirty = text !== savedText;
  const backTo = `/instances/${instanceId}/${filesSlug}`;
  const lang = useMemo(() => langOf(targetPath), [targetPath]);
  const codeHtml = useMemo(() => {
    const h = highlight(text, lang);
    // Preserve the final empty line's height so the overlay textarea and
    // the highlighted layer stay aligned at the very bottom.
    return text.endsWith('\n') ? `${h} ` : h;
  }, [text, lang]);
  const lineCount = useMemo(() => text.split('\n').length, [text]);
  const lineNumbers = useMemo(
    () => Array.from({ length: lineCount }, (_, i) => i + 1),
    [lineCount],
  );

  const load = useCallback(async () => {
    if (!targetPath) {
      setError('No file path given — open a file from the Files page.');
      setLoading(false);
      return;
    }
    setLoading(true);
    setError('');
    setTooLarge(false);
    try {
      // Size gate before pulling bytes so multi-hundred-MB binaries never
      // land in the textarea (stat failures fall through to a direct read).
      try {
        const st = await statPath(instanceId, targetPath);
        if (!st.is_dir && st.size > MAX_EDIT_BYTES) {
          setTooLarge(true);
          setLoading(false);
          return;
        }
      } catch {
        /* stat is best-effort; the read below reports real failures */
      }
      const body = await readFileText(instanceId, targetPath);
      setText(body);
      setSavedText(body);
    } catch (e: any) {
      setError(e?.message || 'Read failed');
    } finally {
      setLoading(false);
    }
  }, [instanceId, targetPath]);

  useEffect(() => {
    void load();
  }, [load]);

  const save = useCallback(async () => {
    if (!targetPath || saving) return;
    setSaving(true);
    try {
      await writeFile(instanceId, targetPath, text);
      setSavedText(text);
      toast(`Saved ${targetPath}`, 'success');
    } catch (e: any) {
      toast(e?.message || 'Write failed', 'error');
    } finally {
      setSaving(false);
    }
  }, [instanceId, targetPath, text, saving]);

  const goBack = useCallback(async () => {
    if (dirty) {
      const ok = await confirm({
        title: 'Discard changes',
        message: `Discard unsaved changes to "${targetPath}"?`,
        tone: 'danger',
        confirmLabel: 'Discard',
      });
      if (!ok) return;
    }
    navigate(backTo);
  }, [dirty, confirm, targetPath, navigate, backTo]);

  const reload = useCallback(async () => {
    if (dirty) {
      const ok = await confirm({
        title: 'Reload from disk',
        message: 'Reload from disk and discard your unsaved changes?',
        tone: 'danger',
        confirmLabel: 'Reload',
      });
      if (!ok) return;
    }
    void load();
  }, [dirty, confirm, load]);

  const onTextareaKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {    if ((e.ctrlKey || e.metaKey) && e.key === 's') {
      e.preventDefault();
      void save();
      return;
    }
    // Tab inserts two spaces instead of leaving the editor.
    if (e.key === 'Tab' && !e.ctrlKey && !e.metaKey && !e.altKey) {
      e.preventDefault();
      const el = e.currentTarget;
      const s = el.selectionStart ?? text.length;
      const en = el.selectionEnd ?? s;
      const next = `${text.slice(0, s)}  ${text.slice(en)}`;
      setText(next);
      requestAnimationFrame(() => {
        try {
          el.selectionStart = el.selectionEnd = s + 2;
        } catch {
          /* ignore */
        }
      });
    }
  };

  return (
    <div className="flex flex-col gap-3 animate-fade-in" style={{ minHeight: 420 }}>
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="min-w-0 flex-1">
          <h2 className="text-xl font-semibold text-white m-0">Editor</h2>
          <p className="ks-mono text-[11px] text-gray-500 mt-0.5 break-all" title={targetPath}>
            {targetPath || '(no ?path= given)'}
          </p>
        </div>
        <div className="flex items-center gap-1.5 flex-wrap">
          <button type="button" onClick={() => void goBack()} title="Back to the Files page" className="ks-btn">
            <span className="inline-flex items-center gap-1.5">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-3.5 h-3.5" aria-hidden="true"><path d="M19 12H5" /><path d="M12 19l-7-7 7-7" /></svg>
              Files
            </span>
          </button>
          <button
            type="button"
            onClick={() => void reload()}
            disabled={loading || saving}
            title="Re-read the file from disk"
            aria-label="Reload"
            className="ks-btn-header ks-icon-btn disabled:opacity-40"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4" aria-hidden="true"><polyline points="1 4 1 10 7 10" /><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" /></svg>
          </button>
          <button
            type="button"
            onClick={() => void save()}
            disabled={loading || saving || !dirty || !targetPath}
            title="Write the file (Ctrl+S)"
            className="ks-btn-primary ks-btn disabled:opacity-40"
          >
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>

      {loading ? (
        <div className="glass-card rounded-xl p-6 animate-pulse">
          <div className="h-4 w-2/3 bg-neutral-800 rounded mb-2" />
          <div className="h-4 w-1/2 bg-neutral-800 rounded" />
        </div>
      ) : error ? (
        <div className="ks-card text-sm" style={{ borderColor: 'var(--ks-bad-line)', color: 'var(--ks-bad)' }}>
          {error}
        </div>
      ) : tooLarge ? (
        <div className="ks-card text-center space-y-2">
          <p className="text-sm text-gray-200">This file is too large to edit in the browser.</p>
          <button
            type="button"
            onClick={() => {
              downloadFile(instanceId, targetPath)
                .then(() => toast('Downloading', 'success'))
                .catch((e: any) => toast(e?.message || 'Download failed', 'error'));
            }}
            className="ks-btn"
          >
            Download instead
          </button>
        </div>
      ) : (
        // Single card: gutter + code share one fixed-height row; the
        // textarea itself scrolls (native caret tracking) while the
        // highlighted layer and gutter follow it. The transparent textarea
        // overlays the highlight so editing, caret, IME and mobile
        // keyboards stay fully native.
        <div className="ks-card !p-0 overflow-hidden">
          <div className="flex items-stretch" style={{ height: 'clamp(320px, 62vh, 900px)' }}>
            <div
              ref={gutterRef}
              aria-hidden="true"
              onWheel={(e) => {
                const ta = taRef.current;
                if (ta) ta.scrollTop += e.deltaY;
              }}
              className="shrink-0 select-none text-right overflow-hidden"
              style={{
                ...codeTextStyle,
                padding: '12px 8px 12px 12px',
                color: 'var(--ks-muted)',
                background: 'rgba(0,0,0,0.25)',
              }}
            >
              {lineNumbers.map((n) => (
                <div key={n}>{n}</div>
              ))}
            </div>
            <div className="relative flex-1 min-w-0 h-full">
              <pre
                ref={preRef}
                aria-hidden="true"
                style={{
                  ...codeTextStyle,
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  minWidth: '100%',
                  width: 'max-content',
                  minHeight: '100%',
                  padding: '12px 12px 12px 4px',
                  color: 'var(--ks-body)',
                  pointerEvents: 'none',
                }}
                dangerouslySetInnerHTML={{ __html: codeHtml }}
              />
              <textarea
                ref={taRef}
                value={text}
                spellCheck={false}
                autoCapitalize="off"
                autoCorrect="off"
                wrap="off"
                onChange={(e) => setText(e.target.value)}
                onKeyDown={onTextareaKeyDown}
                onScroll={onCodeScroll}
                aria-label="File contents"
                className="absolute inset-0 w-full h-full overflow-auto"
                style={{
                  ...codeTextStyle,
                  padding: '12px 12px 12px 4px',
                  background: 'transparent',
                  color: 'transparent',
                  caretColor: 'var(--ks-heading)',
                  outline: 'none',
                  border: 0,
                  resize: 'none',
                }}
              />
            </div>
          </div>
        </div>
      )}

      <p className="text-[11px] text-gray-500 m-0">
        {dirty
          ? `Unsaved changes · ${lineCount} line${lineCount === 1 ? '' : 's'}`
          : error || tooLarge
            ? ''
            : `Ready · ${lineCount} line${lineCount === 1 ? '' : 's'} · ${text.length} bytes`}
      </p>
    </div>
  );
};

export default InstanceFileEditor;
