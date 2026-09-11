// PageStudioReactSection — "React" editor + Build button
//
// React pages are stateful (hooks, no full refresh) unlike sandboxed HTML:
// the author writes JSX/TS (or plain React.createElement) and clicks Build
// to validate it into the executable bundle (POST /:id/build).
// The live renderer transpiles JSX/light-TS in-memory and executes it with
// the panel React runtime and the real KSPageSDK; static preview needs a
// bound instance.

import React, { useEffect, useMemo, useState } from 'react';
import { glassFieldClass } from '@/shared/components/ui/Field';
import { diagnoseReactPageSource } from '@/shared/lib/reactPageTranspile';

export interface ReactModuleFile {
  name: string;
  content: string;
}

export interface PageStudioReactSectionProps {
  source: string;
  onSourceChange: (v: string) => void;
  css: string;
  onCssChange: (v: string) => void;
  buildStatus: string;
  buildLog: string;
  onBuild: () => void;
  building: boolean;
  canBuild: boolean;
  onContentTypeChange: (t: 'html' | 'markdown' | 'blocks' | 'react') => void;
  sectionCls: string;
  /** Virtual files (components type 'module') inlined by `import './name'`. */
  modules: ReactModuleFile[];
  onModulesChange: (m: ReactModuleFile[]) => void;
}

const STARTER = `import { useState } from 'react';

type Props = { title?: string };

function Stat(props: { label: string; value: string }) {
  return (
    <div className="ks-card" style={{ padding: 12 }}>
      <div className="ks-muted" style={{ fontSize: 11 }}>{props.label}</div>
      <div style={{ fontSize: 20, fontWeight: 700 }}>{props.value}</div>
    </div>
  );
}

function Page() {
  const [count, setCount] = useState<number>(0);
  const run = async () => {
    const r = await sdk.runAction('ping');
    if (r && (r as { ok?: boolean }).ok === false) sdk.toast((r as { error?: string }).error || 'failed', 'error');
    else setCount((c: number) => c + 1);
  };
  return (
    <div className="ks-page">
      <div className="ks-card">
        <h2>{sdk.instance.name}</h2>
        <div className="ks-row">
          <span className="ks-badge">{sdk.instance.status}</span>
          <span className="ks-badge">runs: {count}</span>
        </div>
        <button className="ks-btn ks-btn-blue" onClick={run}>Ping</button>
      </div>
      <Stat label="Instance" value={sdk.instance.kind} />
    </div>
  );
}
return Page;`;

export const PageStudioReactSection: React.FC<PageStudioReactSectionProps> = ({
  source,
  onSourceChange,
  css,
  onCssChange,
  buildStatus,
  buildLog,
  onBuild,
  building,
  canBuild,
  onContentTypeChange,
  sectionCls,
  modules,
  onModulesChange,
}) => {
  const statusTone =
    buildStatus === 'ok' ? 'text-emerald-300'
    : buildStatus === 'error' ? 'text-red-300'
    : 'text-gray-400';
  // Files list (virtual modules): the editor swaps buffers between the entry
  // (index) and one module. Stored as components type 'module' ({name,
  // content}) — zero migration, same 512KiB budget; preview/link carry them
  // via the payload's components.
  const [activeFile, setActiveFile] = useState<string>('index');
  const [newName, setNewName] = useState('');
  const [fileError, setFileError] = useState('');
  const activeModule = modules.find((m) => m.name === activeFile) ?? null;
  // Renamed/deleted out from under us — render the entry without a state
  // update in the render path.
  const effectiveActive = activeFile !== 'index' && !activeModule ? 'index' : activeFile;
  const effectiveModule = effectiveActive === 'index' ? null : activeModule;
  const editorValue = effectiveModule ? effectiveModule.content : source;
  const handleEditorChange = (v: string) => {
    if (effectiveModule) {
      onModulesChange(modules.map((m) => (m.name === effectiveModule.name ? { ...m, content: v } : m)));
    } else {
      onSourceChange(v);
    }
  };
  // Lite diagnostics (plan item 4): pre-Build warnings only — never blocks
  // save or Build. Debounced so typing stays smooth, memoized on the
  // debounced buffer so idle renders are free, hidden when empty.
  const [diagInput, setDiagInput] = useState(editorValue);
  useEffect(() => {
    const t = setTimeout(() => setDiagInput(editorValue), 300);
    return () => clearTimeout(t);
  }, [editorValue]);
  const diags = useMemo(() => diagnoseReactPageSource(diagInput), [diagInput]);
  const validFileName = (n: string): string => {
    if (!/^[A-Za-z0-9_][A-Za-z0-9_-]*$/.test(n)) return `File name "${n}" must start with a letter, number or underscore and contain only letters, numbers, underscores or dashes.`;
    if (modules.some((m) => m.name === n)) return `File "${n}" already exists.`;
    if (modules.length >= 20) return 'Too many files (max 20) — merge small helpers into fewer files.';
    return '';
  };
  const handleAdd = () => {
    const n = newName.trim();
    const err = validFileName(n);
    if (err) { setFileError(err); return; }
    setFileError('');
    setNewName('');
    onModulesChange([...modules, { name: n, content: '' }]);
    setActiveFile(n);
  };
  const handleRename = (oldName: string, next: string) => {
    const n = next.trim();
    if (n === oldName) return;
    if (n === '') { setFileError('File name cannot be empty.'); return; }
    // Allow keeping the row while typing an invalid name elsewhere — only
    // commit valid renames; invalid input surfaces as an inline message.
    const others = modules.filter((m) => m.name !== oldName);
    if (!/^[A-Za-z0-9_][A-Za-z0-9_-]*$/.test(n)) { setFileError(`File name "${n}" must start with a letter, number or underscore and contain only letters, numbers, underscores or dashes.`); return; }
    if (others.some((m) => m.name === n)) { setFileError(`File "${n}" already exists.`); return; }
    setFileError('');
    onModulesChange(modules.map((m) => (m.name === oldName ? { ...m, name: n } : m)));
    if (activeFile === oldName) setActiveFile(n);
  };
  const handleDelete = (name: string) => {
    setFileError('');
    onModulesChange(modules.filter((m) => m.name !== name));
    if (effectiveActive === name) setActiveFile('index');
  };
  return (
    <div className={sectionCls}>
      <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
        <h4 className="text-sm font-semibold uppercase tracking-wide text-gray-400">Section B · React</h4>
        <div className="flex items-center gap-2 flex-wrap">
          <label className="text-xs text-gray-400">Content Type</label>
          <select
            value="react"
            onChange={(e) => onContentTypeChange(e.target.value as any)}
            className="bg-black/40 border border-white/10 rounded px-2 py-1 text-sm text-white"
          >
            <option value="html">HTML</option>
            <option value="markdown">Markdown</option>
            <option value="blocks">Visual Blocks</option>
            <option value="react">React (stateful)</option>
          </select>
          <span className={`text-xs ${statusTone}`} title={buildLog || 'Not built yet'}>
            {buildStatus === 'ok' ? 'Built ✓' : buildStatus === 'error' ? 'Build failed' : buildStatus === 'building' ? 'Building…' : 'Not built'}
          </span>
          <button
            type="button"
            onClick={onBuild}
            disabled={building || !canBuild}
            title={canBuild ? 'Validate source into the executable bundle' : 'Save the page first to build it'}
            className="px-3 py-1.5 text-sm rounded border border-white/10 text-gray-200 hover:bg-white/10 disabled:opacity-50"
          >
            {building ? 'Building…' : 'Build'}
          </button>
        </div>
      </div>
      <p className="text-xs text-gray-500">
        Near-real React (hooks via <code>React.useState/useEffect</code>, state survives re-renders). Write{' '}
        <code>JSX</code> + light <code>TS</code> (<code>type/interface/enum/namespace</code>, <code>: Type</code>, <code>as Type</code>,{' '}
        <code>{'<T>'}</code>) or plain <code>React.createElement</code> — all transpile in the renderer. Define{' '}
        <code>function Page()</code> (closes over <code>sdk</code> + <code>React</code>) and end with{' '}
        <code>return Page;</code>. <code>{`import { useState } from 'react'`}</code> is allowed; other packages are not — use{' '}
        <code>sdk.runAction/fetchPanel/storage/downloadText/copyText/formatBytes/timeAgo</code> — never <code>fetch()</code>,{' '}
        <code>sdk.runAction/fetchPanel/storage/downloadText/copyText/formatBytes/timeAgo</code> — never <code>fetch()</code>,{' '}
        <code>eval</code> or browser storage directly. Tailwind + <code>ks-*</code> theme classes work (host origin).
        Split code with <code>Files</code> below: <code>{`import { helper } from './util'`}</code> inlines <code>util</code> at
        transpile time (relative paths only, <code>..</code> past the root rejected, cycles fail the build).
      </p>
      <div className="mt-3 rounded-lg border border-white/10 bg-black/20 p-3">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <h5 className="text-xs font-semibold uppercase tracking-wide text-gray-400">Files ({modules.length}/20)</h5>
          <div className="flex items-center gap-2">
            <input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleAdd(); } }}
              className="bg-black/40 border border-white/10 rounded px-2 py-1 text-xs text-white font-mono w-36"
              placeholder="util"
              aria-label="New file name"
              spellCheck={false}
            />
            <button
              type="button"
              onClick={handleAdd}
              className="px-2 py-1 text-xs rounded border border-white/10 text-gray-200 hover:bg-white/10"
              title="Add a virtual file (stored as a components entry with type 'module')"
            >
              Add file
            </button>
          </div>
        </div>
        {fileError && <p className="text-xs text-red-300 mt-2">{fileError}</p>}
        <div className="flex items-center gap-1.5 mt-2 flex-wrap">
          <button
            type="button"
            onClick={() => setActiveFile('index')}
            title="Entry file (the page source below when selected)"
            className={`px-2 py-1 text-xs rounded border font-mono ${effectiveActive === 'index' ? 'bg-white text-black border-white' : 'border-white/10 text-gray-300 hover:bg-white/10'}`}
          >
            index
          </button>
          {modules.map((m) => (
            <span
              key={m.name}
              className={`inline-flex items-center gap-1 pl-2 pr-1 py-0.5 text-xs rounded border font-mono ${effectiveActive === m.name ? 'bg-white text-black border-white' : 'border-white/10 text-gray-300'}`}
            >
              <button type="button" onClick={() => setActiveFile(m.name)} title={`Edit ${m.name}`}>
                {m.name}
              </button>
              <button
                type="button"
                onClick={() => handleDelete(m.name)}
                aria-label={`Delete ${m.name}`}
                title={`Delete ${m.name}`}
                className="px-1 rounded hover:bg-red-500/30"
              >
                ×
              </button>
            </span>
          ))}
        </div>
        {effectiveModule && (
          <label className="block text-xs text-gray-400 mt-2">
            File name
            <input
              value={effectiveModule.name}
              onChange={(e) => handleRename(effectiveModule.name, e.target.value)}
              className="mt-1 bg-black/40 border border-white/10 rounded px-2 py-1 text-xs text-white font-mono w-48 block"
              spellCheck={false}
            />
          </label>
        )}
        <p className="text-[11px] text-gray-500 mt-2">
          Files live at the page root — <code>import … from './{effectiveModule ? effectiveModule.name : 'util'}'</code> (extension
          optional). Modules share one scope after inlining: keep top-level names unique. Unused files never ship. Budget: same 512KiB
          components total, ≤20 files.
        </p>
      </div>
      <label className="block text-xs text-gray-400 mt-3 mb-2">
        {effectiveModule ? <span>File <code className="font-mono">{effectiveModule.name}</code> (JS)</span> : 'Page source (JS · index)'}
        <span className="float-right">
          <button
            type="button"
            onClick={() => { setActiveFile('index'); onSourceChange(STARTER); }}
            className="text-xs text-gray-400 hover:text-white underline"
            title="Replace the entry file with a minimal working page"
          >
            Starter
          </button>
        </span>
      </label>
      <textarea
        value={editorValue}
        onChange={(e) => handleEditorChange(e.target.value)}
        className={`${glassFieldClass} font-mono text-sm`}
        style={{ minHeight: '420px', width: '100%' }}
        spellCheck={false}
        placeholder={effectiveModule ? `// ${effectiveModule.name} — export helpers/components, e.g.\nexport function helper() { return 42; }` : STARTER}
      />
      {diags.length > 0 && (
        <div className="mt-2 rounded-lg border border-amber-700/50 bg-amber-900/30 p-3" role="status" aria-label="React warnings">
          <p className="text-xs font-semibold uppercase tracking-wide text-amber-200">
            Warnings ({diags.length}) — non-blocking, Build stays the gate
          </p>
          <ul className="mt-1 space-y-0.5">
            {diags.map((d, i) => (
              <li key={i} className="text-xs text-amber-300 font-mono">
                Line {d.line}: {d.message}
              </li>
            ))}
          </ul>
        </div>
      )}
      <label className="block text-xs text-gray-400 mt-3 mb-2">Page CSS (optional, scoped under .ks-react-page)</label>
      <textarea
        value={css}
        onChange={(e) => onCssChange(e.target.value)}
        className={`${glassFieldClass} font-mono text-sm`}
        style={{ minHeight: '120px', width: '100%' }}
        spellCheck={false}
        placeholder=".ks-react-page .ks-card { margin-bottom: 12px; }"
      />
      {buildLog && (
        <p className={`text-xs mt-2 font-mono whitespace-pre-wrap ${statusTone}`}>{buildLog}</p>
      )}
    </div>
  );
};
