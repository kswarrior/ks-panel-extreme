// PageStudioReactSection — "React" editor + Build button
//
// React pages are stateful (hooks, no full refresh) unlike sandboxed HTML:
// the author writes JSX/TS (or plain React.createElement) and clicks Build
// to validate it into the executable bundle (POST /:id/build).
// The live renderer transpiles JSX/light-TS in-memory and executes it with
// the panel React runtime and the real KSPageSDK; static preview needs a
// bound instance.

import React from 'react';
import { glassFieldClass } from '@/shared/components/ui/Field';

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
}) => {
  const statusTone =
    buildStatus === 'ok' ? 'text-emerald-300'
    : buildStatus === 'error' ? 'text-red-300'
    : 'text-gray-400';
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
        <code>JSX</code> + light <code>TS</code> (<code>type/interface</code>, <code>: Type</code>, <code>as Type</code>,{' '}
        <code>{'<T>'}</code>) or plain <code>React.createElement</code> — all transpile in the renderer. Define{' '}
        <code>function Page()</code> (closes over <code>sdk</code> + <code>React</code>) and end with{' '}
        <code>return Page;</code>. <code>{`import { useState } from 'react'`}</code> is allowed; other packages are not — use{' '}
        <code>sdk.runAction/fetchPanel/storage/downloadText/copyText/formatBytes/timeAgo</code> — never <code>fetch()</code>,{' '}
        <code>eval</code> or browser storage directly. Tailwind + <code>ks-*</code> theme classes work (host origin).
      </p>
      <label className="block text-xs text-gray-400 mt-3 mb-2">
        Page source (JS)
        <span className="float-right">
          <button
            type="button"
            onClick={() => onSourceChange(STARTER)}
            className="text-xs text-gray-400 hover:text-white underline"
            title="Replace editor with a minimal working page"
          >
            Starter
          </button>
        </span>
      </label>
      <textarea
        value={source}
        onChange={(e) => onSourceChange(e.target.value)}
        className={`${glassFieldClass} font-mono text-sm`}
        style={{ minHeight: '420px', width: '100%' }}
        spellCheck={false}
        placeholder={STARTER}
      />
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
