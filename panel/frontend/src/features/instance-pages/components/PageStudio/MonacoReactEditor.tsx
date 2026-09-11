// MonacoReactEditor — offline Monaco wrapper for the Studio React section.
//
// OFFLINE / NO-CDN DESIGN (plan item 5 requirement):
// - `monaco-editor` is an npm dep; both web workers are bundled by Vite via
//   `?worker` imports into same-origin `assets/*.js` files. There is NO CDN
//   URL anywhere in this path and NO `vite-plugin-monaco-editor` (unneeded:
//   Vite 5 bundles `?worker` natively; the plugin only adds copy-step build
//   complexity for zero offline benefit).
// - `MonacoEnvironment.getWorker` is configured with those bundled
//   workers (the non-deprecated equivalent of `getWorkerUrl`: returning a
//   constructed `?worker` instead of a URL string keeps the same same-origin,
//   offline-safe loading without a URL round-trip). Tradeoff, stated explicitly: full TS language service (hover,
//   diagnostics, completion) costs the ~monaco chunk in `ui/dist` (see
//   bundle-size note in the item-5 report). The alternative — disabling
//   workers (`getWorker: () => null`) — would keep the bundle small but kill
//   exactly the hover/completion value item 5 exists for, so it was rejected.
//   Blob-URL workers were rejected too: they would need a CSP widening
//   (`script-src blob:`), while same-origin worker files pass the current
//   `script-src 'self'` untouched (see CSP verdict in the report).
// - Contract matches the `<textarea>` it replaces: `value` in, `onChange`
//   out, nothing else (save/Build/preview untouched).
import React, { useEffect, useRef } from 'react';
import * as monaco from 'monaco-editor/esm/vs/editor/editor.api';
import 'monaco-editor/esm/vs/language/typescript/monaco.contribution';
// Basic-languages TS contribution: REGISTERS the 'typescript' language id +
// monarch tokenizer. Without it the bundle only knows 'plaintext': the
// `onLanguage('typescript')` hook above never fires, `setupTypeScript` never
// runs, and hover/completions/diagnostics stay dead (proven by the item-5
// offline test: `getLanguages()` was `["plaintext"]` until this import).
// Still fully offline (bundled chunk, same-origin, no CSP impact).
import 'monaco-editor/esm/vs/basic-languages/typescript/typescript.contribution';
import editorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker';
import tsWorker from 'monaco-editor/esm/vs/language/typescript/ts.worker?worker';
import { buildSdkTypingsText } from './pageStudioSdkTypings';

// Installed once (module scope): same-origin bundled workers, never CDN.
// Guarded so HMR / test double-imports don't reassign mid-session.
let workersInstalled = false;
function installWorkersOnce(): void {
  if (workersInstalled) return;
  workersInstalled = true;
  (self as unknown as { MonacoEnvironment: { getWorker: (_: unknown, label: string) => Worker } }).MonacoEnvironment = {
    getWorker(_: unknown, label: string) {
      if (label === 'typescript' || label === 'javascript') return new tsWorker();
      return new editorWorker();
    },
  };
}

// `sdk` + `react` typings registered once per page load (extra lib keyed by
// path — re-adding the same path disposes the previous copy, so no leak).
let typingsInstalled = false;
function installTypingsOnce(): void {
  if (typingsInstalled) return;
  typingsInstalled = true;
  monaco.languages.typescript.typescriptDefaults.setCompilerOptions({
    target: monaco.languages.typescript.ScriptTarget.ES2020,
    allowNonTsExtensions: true,
    moduleResolution: monaco.languages.typescript.ModuleResolutionKind.NodeJs,
    jsx: monaco.languages.typescript.JsxEmit.React,
    allowJs: true,
    checkJs: false,
    strict: false,
    noEmit: true,
  });
  monaco.languages.typescript.typescriptDefaults.setDiagnosticsOptions({
    noSemanticValidation: false,
    noSyntaxValidation: false,
  });
  monaco.languages.typescript.typescriptDefaults.addExtraLib(buildSdkTypingsText(), 'file:///ks-studio/sdk.d.ts');
}

// Panel dark theme: `vs-dark` base with the Studio's near-black glass
// background so the editor reads as part of the panel, not a white box.
let themeInstalled = false;
function installThemeOnce(): void {
  if (themeInstalled) return;
  themeInstalled = true;
  monaco.editor.defineTheme('ks-dark', {
    base: 'vs-dark',
    inherit: true,
    rules: [],
    colors: {
      'editor.background': '#0a0a0f',
      'editor.lineHighlightBackground': '#ffffff0d',
    },
  });
}

export interface MonacoReactEditorProps {
  value: string;
  onChange: (v: string) => void;
  /** File identity: entry vs virtual module (drives the model URI). */
  fileKey: string;
  ariaLabel: string;
}

const MonacoReactEditor: React.FC<MonacoReactEditorProps> = ({ value, onChange, fileKey, ariaLabel }) => {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const editorRef = useRef<monaco.editor.IStandaloneCodeEditor | null>(null);
  const modelRef = useRef<monaco.editor.ITextModel | null>(null);
  // True while WE push an external value into the model (file switch,
  // Starter button): the content-change echo is skipped so onChange only
  // ever fires for real keystrokes, exactly like the old textarea.
  const applyingExternal = useRef(false);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  // Create once per file (parent remounts via key on file switch).
  useEffect(() => {
    installWorkersOnce();
    installTypingsOnce();
    installThemeOnce();
    const host = hostRef.current;
    if (!host) return;
    const uri = monaco.Uri.parse(`file:///ks-studio/${fileKey === 'index' ? 'index' : fileKey}.tsx`);
    const existing = monaco.editor.getModel(uri);
    const model = existing ?? monaco.editor.createModel(value, 'typescript', uri);
    if (existing && existing.getValue() !== value) {
      applyingExternal.current = true;
      try {
        existing.setValue(value);
      } finally {
        applyingExternal.current = false;
      }
    }
    modelRef.current = model;
    const editor = monaco.editor.create(host, {
      model,
      language: 'typescript',
      theme: 'ks-dark',
      automaticLayout: true,
      fontSize: 13,
      fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
      minimap: { enabled: false },
      scrollBeyondLastLine: false,
      padding: { top: 8 },
      lineNumbers: 'on',
      renderLineHighlight: 'all',
      tabSize: 2,
      insertSpaces: true,
      wordWrap: 'on',
      stickyScroll: { enabled: false },
      fixedOverflowWidgets: true,
      ariaLabel,
    });
    editorRef.current = editor;
    const sub = model.onDidChangeContent(() => {
      if (applyingExternal.current) return;
      onChangeRef.current(model.getValue());
    });
    return () => {
      sub.dispose();
      editor.dispose();
      // Dispose OUR model; a shared URI model owned by another mount stays.
      try {
        model.dispose();
      } catch { /* already disposed */ }
      editorRef.current = null;
      modelRef.current = null;
    };
    // Intentionally mount-only: external value sync lives below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // External value sync (Starter button replaces entry; modules remap on
  // rename). Guard keeps parent echoes from resetting the cursor.
  const valueRef = useRef(value);
  useEffect(() => {
    valueRef.current = value;
    const model = modelRef.current;
    if (!model || model.getValue() === value) return;
    applyingExternal.current = true;
    try {
      model.setValue(value);
    } finally {
      applyingExternal.current = false;
    }
  }, [value]);

  return <div ref={hostRef} style={{ height: '420px', width: '100%' }} className="rounded-md overflow-hidden border border-white/10" />;
};

export default MonacoReactEditor;
