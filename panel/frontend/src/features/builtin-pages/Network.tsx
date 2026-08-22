// Network instance sub-page — built-in page implementation (self-contained).
//
// Renders the per-instance network summary + port allocation cards, reading
// the published ports/addresses from the instance's parsed config. Moved
// verbatim out of pages/panel/InstanceDetail.tsx; cross-page UI vocabulary
// (statusMeta, KindIcon, Section/InfoRow, useInstanceFromParams, …)
// comes from ./_shared.
//
// Default export is the BuiltinPageManifestEntry consumed by
// lib/builtin/index.ts; pages/panel/InstanceDetail.tsx re-exports
// InstanceNetwork + its boundary-wrapped <InstanceNetworkPage/> as a facade.

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useInstance, parseConfig, extractConfig } from '@/shared/hooks/useInstance';
import type { Instance, DriverKind } from '@/shared/types/instance';
import { listTemplates } from '@/shared/api/admin';
import { isPageAllowed } from '@/shared/utils/instancePages';
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

export const InstanceNetwork: React.FC = () => {
  const { instance, loading, error } = useInstanceFromParams();
  const [templates, setTemplates] = useState<Awaited<ReturnType<typeof listTemplates>>>([]);
  const [tplLoading, setTplLoading] = useState(true);
  useEffect(() => {
    let cancelled = false;
    listTemplates().then((ts) => { if (!cancelled) setTemplates(ts); }).finally(() => { if (!cancelled) setTplLoading(false); });
    return () => { cancelled = true; };
  }, []);
  if (loading || error || !instance) return <LoadingOrError loading={loading} error={error} kind="network" />;
  if (tplLoading) return <LoadingOrError loading={true} error="" kind="network" />;
  const spec = parseConfig(instance?.config);
  if (!isPageAllowed('network', spec)) {
    return <div className="glass-card rounded-xl text-center text-gray-400"><p className="text-sm">This page is not part of this instance's template.</p></div>;
  }
  const cfg = extractConfig(parseConfig(instance.config));
  const host = instance.node_name || `node-${instance.node_id}`;

  // Protocol → {badge bg/text, label, accent} so each port card visually
  // groups by transport at a glance. We fall back to TCP's look for any
  // unknown protocol since the panel doesn't constrain the values.
  const protoMeta: Record<string, { badge: string; dot: string; label: string }> = {
    tcp: { badge: 'bg-sky-900/50 text-sky-200 border-sky-700/50', dot: 'bg-sky-400', label: 'TCP' },
    udp: { badge: 'bg-amber-900/50 text-amber-200 border-amber-700/50', dot: 'bg-amber-400', label: 'UDP' },
    http: { badge: 'bg-emerald-900/50 text-emerald-200 border-emerald-700/50', dot: 'bg-emerald-400', label: 'HTTP' },
    https: { badge: 'bg-emerald-900/50 text-emerald-200 border-emerald-700/50', dot: 'bg-emerald-400', label: 'HTTPS' },
  };
  const pm = (p: string) => protoMeta[p] || { badge: 'bg-neutral-800 text-gray-300 border-neutral-700', dot: 'bg-gray-500', label: (p || 'TCP').toUpperCase() };

  return (
    <div className="space-y-4 animate-fade-in">
      <div>
        <h2 className="text-xl font-semibold text-white">Network</h2>
      </div>

      {/* Per-port cards: each port is its own card so an operator can
          visualise the host↔container binding as a flow rather than a
          sparse table row. Hover lifts the card (kept from glass-card)
          and exposes the anchor string in a copy hint. */}
      {cfg.ports.length === 0 ? (
        <Section title="Forwarded ports" description="Host → container bindings the driver opened at deploy time.">
          <EmptyRow text="No ports are forwarded to this instance." />
        </Section>
      ) : (
        <div>
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-semibold text-white uppercase tracking-wide">Forwarded ports</h3>
            <span className="text-[10px] text-gray-500">{cfg.ports.length} mapping{cfg.ports.length === 1 ? '' : 's'}</span>
          </div>
<div className="ks-card-grid grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3">
            {cfg.ports.map((p, i) => {
              const meta = pm(p.protocol);
              const reach = `${host}:${p.host}`;
              const url = `${(p.protocol || 'tcp').toLowerCase() === 'http' ? 'http' : (p.protocol || 'tcp').toLowerCase() === 'https' ? 'https' : 'tcp'}://${reach}`;
              const isWeb = p.protocol === 'http' || p.protocol === 'https';
              return (
                <div key={i} className="glass-card rounded-xl flex flex-col gap-3 animate-slide-up">
                  {/* Header row: protocol badge + host port number */}
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className={`w-2 h-2 rounded-full ${meta.dot}`} />
                      <span className={`text-[10px] px-1.5 py-0.5 rounded border ${meta.badge}`}>{meta.label}</span>
                      <span className="text-[11px] text-gray-500 uppercase tracking-wide">port</span>
                    </div>
                    <span className="font-mono text-2xl font-semibold text-white tabular-nums leading-none">{p.host || '—'}</span>
                  </div>

                  {/* Flow diagram: Host port → Container port */}
                  <div className="flex items-center gap-3 px-1">
                    <div className="flex flex-col items-center min-w-0">
                      <span className="text-[10px] text-gray-500 uppercase tracking-wide">Host</span>
                      <span className="font-mono text-sm text-gray-100 tabular-nums">{p.host || '—'}</span>
                    </div>
                    <div className="flex-1 flex items-center text-gray-500">
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5 text-sky-400 mx-auto" style={{ transform: 'rotate(0deg)' }}>
                        <path d="M5 12h14M13 6l6 6-6 6" />
                       </svg>
                    </div>
                    <div className="flex flex-col items-center min-w-0">
                      <span className="text-[10px] text-gray-500 uppercase tracking-wide">Container</span>
                      <span className="font-mono text-sm text-gray-100 tabular-nums">{p.container || '—'}</span>
                    </div>
                  </div>

                  {/* Reachability footer + copy URL */}
                  <div className="pt-2 mt-auto border-t border-white/[0.06] flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <div className="text-[10px] text-gray-500 uppercase tracking-wide">Reachable on</div>
                      <code className="text-xs text-gray-200 font-mono break-all truncate block">{reach}</code>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      {isWeb && (
                        <a
                          href={url}
                          target="_blank"
                          rel="noreferrer"
                          title="Open in a new tab"
                          className="inline-flex items-center justify-center w-7 h-7 rounded border border-white/10 text-gray-300 hover:bg-white/10 hover:text-white transition-colors"
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-3.5 h-3.5"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" /><polyline points="15 3 21 3 21 9" /><line x1="10" y1="14" x2="21" y2="3" /> </svg>
                        </a>
                      )}
                      <button
                        type="button"
                        onClick={() => { try { navigator.clipboard.writeText(reach); } catch {} }}
                        title="Copy host:port"
                        className="inline-flex items-center justify-center w-7 h-7 rounded border border-white/10 text-gray-300 hover:bg-white/10 hover:text-white transition-colors"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" className="w-3.5 h-3.5"><rect x="9" y="9" width="13" height="13" rx="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" /> </svg>
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};

const Network: BuiltinPageManifestEntry = {
  slug: 'network',
  name: 'Network',
  iconName: 'Network',
  iconSvg: '<path d="M22 12h-4l-3 9L9 3l-3 9H2" />',
  component: InstanceNetwork,
};

export default Network;
