// PageStudioReactSection — "React" editor + Build button
//
// React pages are stateful (hooks, no full refresh) unlike sandboxed HTML:
// the author writes JS with React.createElement (no JSX in v1) and clicks
// Build to validate it into the executable bundle (POST /:id/build).
// The live renderer executes the bundle with the panel React runtime and
// the real KSPageSDK; static preview needs a bound instance.

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
  sectionCls: string;
}

const STARTER = `function Page(sdk, React) {
  const el = React.createElement;
  const status = el('span', { className: 'ks-badge' }, sdk.instance.status);
  const run = function() { sdk.runAction('ping'); };
  return el('div', { className: 'ks-page' },
    el('div', { className: 'ks-card' },
      el('h2', null, sdk.instance.name),
      el('div', { className: 'ks-row' }, status),
      el('button', { className: 'ks-btn ks-btn-blue', onClick: run }, 'Ping')));
}`;

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
        <div className="flex items-center gap-2">
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
        Stateful React (hooks, no full refresh). Plain JS with <code>React.createElement</code> — no JSX in v1.
        Entry: <code>function Page(sdk, React)</code> returning an element. Use <code>sdk.runAction/fetchPanel</code> —
        never <code>fetch()</code>, <code>eval</code> or browser storage directly.
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
