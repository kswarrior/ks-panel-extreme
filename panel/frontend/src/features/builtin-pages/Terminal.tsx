// Terminal instance sub-page — built-in page implementation (self-contained).
//
// Mounts the imperative VS Code-style terminal (components/Terminal) against
// the instance's edge websocket, with the reconnect/resize controls. Moved
// verbatim out of pages/panel/InstanceDetail.tsx; cross-page UI vocabulary
// (useInstanceFromParams, LoadingOrError, …) is imported from ./_shared.
//
// Default export is the BuiltinPageManifestEntry consumed by
// lib/builtin/index.ts; pages/panel/InstanceDetail.tsx re-exports
// InstanceTerminal + its boundary-wrapped <InstanceConsolePage/>.

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useInstance, parseConfig, extractConfig } from '@/shared/hooks/useInstance';
import type { Instance, DriverKind } from '@/shared/types/instance';
import { listTemplates } from '@/shared/api/admin';
import { isPageAllowed } from '@/shared/utils/instancePages';
import Terminal from '@/shared/components/ui/Terminal';
import type { TerminalHandle } from '@/shared/components/ui/Terminal';
import type { Terminal as XTerm } from '@xterm/xterm';
import {
  parseBytes, joinPath, timeAgo,
  KIND_BADGE, kindBadgeClass, STATUS_META, statusMeta, KindIcon,
  cleanExternalId, INSTANCE_NAV,
  Section, EmptyRow, InfoRow, inputCls, Btn, Field,
  useInstanceFromParams, PageErrorBoundary, withBoundary,
  LoadingOrError, TableSkeleton, CardGridSkeleton, TilesSkeleton,
  asArray, errText,
} from './_shared';
import type { LoadingKind } from './_shared';
import type { BuiltinPageManifestEntry } from './types';

// ----- Terminal (VS Code-style) ----------------------------------------------

export const InstanceTerminal: React.FC = () => {
  const { instance, loading, error } = useInstanceFromParams();
  const termRef = useRef<XTerm | null>(null);
  const [templates, setTemplates] = useState<Awaited<ReturnType<typeof listTemplates>>>([]);
  const [tplLoading, setTplLoading] = useState(true);
  useEffect(() => {
    let cancelled = false;
    listTemplates().then((ts) => { if (!cancelled) setTemplates(ts); }).finally(() => { if (!cancelled) setTplLoading(false); });
    return () => { cancelled = true; };
  }, []);
  // ref into the imperative Terminal actions exposed via forwardRef —
  // lets the Reconnect toolbar button cancel the exponential backoff
  // and dial the bridge immediately, instead of trapping the operator
  // in a "reconnecting in Ns" wait they cannot escape short of reloading
  // the page.
  const terminalApiRef = useRef<TerminalHandle | null>(null);
  const [conn, setConn] = useState<'connecting' | 'connected' | 'reconnecting' | 'closed' | 'error'>('connecting');

  if (loading || error || !instance) return <LoadingOrError loading={loading} error={error} kind="terminal" />;
  if (tplLoading) return <LoadingOrError loading={true} error="" kind="terminal" />;
  const spec = parseConfig(instance?.config);
  if (!isPageAllowed('terminal', spec)) {
    return <div className="glass-card rounded-xl text-center text-gray-400"><p className="text-sm">This page is not part of this instance's template.</p></div>;
  }

  const cfg = extractConfig(parseConfig(instance?.config));
  const ext = instance?.name || 'session';
  const host = instance ? (instance.node_name || `node-${instance.node_id}`) : '';
  const user = instance?.kind === 'docker' ? 'root' : 'ubuntu';

  // We intentionally do NOT render the template's entrypoint/`command` field
  // here. Operators were surprised to see the template's default install/run
  // commands echoed into "their" terminal — the terminal now boots to a
  // bare shell prompt (whatever the container's primary process printed at
  // startup is upstream of us and not under our control).

  const handleClear = () => {
    const t = termRef.current;
    if (!t) return;
    // xterm's clear() preserves the current prompt line of the underlying
    // process; reset() wipes the entire scrollback AND the user's in-flight
    // prompt, which is closer to the "Clear" button behaviour operators
    // expect from a shell panel.
    t.reset();
  };

  const handleReconnect = () => {
    terminalApiRef.current?.reconnect();
  };

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold text-white">Terminal</h2>
        </div>
        <div className="flex items-center gap-2">
          {/* Shown whenever the bridge isn't in the `connected` state. The
              button fires the exposed `reconnect()` on the Terminal handle
              (see web/src/components/Terminal.tsx), which cancels any pending
              exponential-backoff timer and re-dials the bridge immediately. */}
          {conn !== 'connected' && (
            <button
              type="button"
              onClick={handleReconnect}
              className="inline-flex items-center gap-1.5 border border-sky-500/40 text-sky-200 px-3 py-1.5 rounded hover:bg-sky-500/15 text-xs transition-colors"
              title="Reconnect the live shell now"
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-3.5 h-3.5"><path d="M21 12a9 9 0 1 1-2.64-6.36" /><polyline points="21 4 21 10 15 10" /> </svg>
              Reconnect
            </button>
          )}
          <button
            type="button"
            onClick={handleClear}
            className="inline-flex items-center gap-1.5 border border-white/10 text-gray-200 px-3 py-1.5 rounded hover:bg-white/10 text-xs transition-colors"
            title="Clear the terminal scrollback"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-3.5 h-3.5"><path d="M3 6h18" /><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" /><path d="M10 11v6M14 11v6" /> </svg>
            Clear
          </button>
        </div>
      </div>

      {/* VS Code–style panel: title-bar with traffic lights, tab strip,
          xterm body, and a status bar. The terminal engine lives inside. */}
      <div className="rounded-lg overflow-hidden border border-white/10 shadow-[0_8px_32px_rgba(0,0,0,0.5)] bg-[#1e1e1e]">
        {/* Title bar */}
        <div className="flex items-center gap-2 px-3 py-2 bg-[#323233] border-b border-black/40">
          <span className="w-3 h-3 rounded-full bg-[#ff5f56]" />
          <span className="w-3 h-3 rounded-full bg-[#ffbd2e]" />
          <span className="w-3 h-3 rounded-full bg-[#27c93f]" />
          <span className="ml-2 text-xs text-gray-300 font-mono truncate">{user}@{host}: ~ — terminal</span>
        </div>

        {/* Tab strip */}
        <div className="flex items-center bg-[#252526] border-b border-black/30">
          <span className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs text-white bg-[#1e1e1e] border-r border-black/30">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-3 h-3 text-sky-400"><path d="m4 17 6-6-6-6" /><path d="M12 19h8" /> </svg>
            sh — {ext.slice(0, 16) || 'session'}
          </span>
        </div>

        {/* Live terminal */}
        <div className="bg-[#1e1e1e] px-2 pt-2 pb-1">
          <Terminal
            ref={terminalApiRef}
            instanceId={instance.id}
            onStateChange={(s) => setConn(s)}
            onTermRef={(t) => { termRef.current = t; }}
          />
        </div>

        {/* Status bar — VS Code blue strip */}
        <div className="flex items-center justify-between px-3 py-1 bg-[#007acc] text-white text-[11px]">
          <span className="font-mono">
            {conn === 'connected' ? '● attached' : conn === 'connecting' ? '● connecting…' : conn === 'reconnecting' ? '● reconnecting' : conn === 'error' ? '● error' : `● ${instance.status}`}
          </span>
          <span className="font-mono truncate">{ext.slice(0, 16) || '—'} · {cfg.image || 'image'}</span>
        </div>
      </div>
    </div>
  );
};

// NOTE: the manifest const is named `TerminalPage` (not `Terminal`) so it
// doesn't shadow the imported `components/Terminal` default the body renders
// as <Terminal/>. index.ts imports this manifest as a default export and only
// cares about the entry value, not the const name.
const TerminalPage: BuiltinPageManifestEntry = {
  slug: 'terminal',
  name: 'Terminal',
  iconName: 'Terminal',
  iconSvg: '<path d="m4 17 6-6-6-6" /><path d="M12 19h8" />',
  component: InstanceTerminal,
};

export default TerminalPage;
