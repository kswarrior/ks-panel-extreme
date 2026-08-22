// InstanceForm UI components - extracted from InstanceForm.tsx

import React from 'react';
import type { KindKey } from '../types/instanceForm';
import { KIND_META, kindKey } from '../types/instanceForm';
import { specToEditor } from '../utils/instanceFormUtils';

export function KindIcon({ kind, className = '' }: { kind: KindKey; className?: string }) {
  const common = { xmlns: 'http://www.w3.org/2000/svg', viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.6, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, className };
  switch (kind) {
    case 'docker':
      return (
        <svg {...common}><path d="M3 5h7v5H3z" /><path d="M10 8h5a3 3 0 0 1 3 3v1h2a2 2 0 0 1 2 2 4 4 0 0 1-4 4h-2" /><path d="M3 8v8h7V8" /><path d="M3 12h7" /> </svg>
      );
    case 'lxd':
      return (
        <svg {...common}><path d="M4 7 12 3l8 4v10l-8 4-8-4z" /><path d="M4 7l8 4 8-4" /><path d="M12 11v10" /> </svg>
      );
    case 'kvm':
      return (
        <svg {...common}><rect x="3" y="4" width="18" height="13" rx="2" /><path d="M7 20h10" /><path d="M9 8l4 3-4 3z" /> </svg>
      );
    case 'multipass':
      return (
        <svg {...common}><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /> </svg>
      );
    default:
      return (
        <svg {...common}><circle cx="12" cy="12" r="9" /><path d="M9 9h.01M15 9h.01M9 15h6" /> </svg>
      );
  }
}

export interface ToggleProps {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
}

export const Toggle: React.FC<ToggleProps> = ({ checked, onChange, label }) => (
  <label className="inline-flex items-center gap-2 cursor-pointer">
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className={`relative w-9 h-5 rounded-full transition ${checked ? 'bg-green-600' : 'bg-neutral-700'}`}
      aria-pressed={checked}
    >
      <span className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full transition ${checked ? 'translate-x-4' : ''}`} />
    </button>
    <span className="text-sm text-gray-300">{label}</span>
  </label>
);

export interface TemplateCardProps {
  t: any;
  selected: boolean;
  onClick: () => void;
}

export const TemplateCard: React.FC<TemplateCardProps> = ({ t, selected, onClick }) => {
  const kind = kindKey(t.kind);
  const meta = KIND_META[kind];
  const ed = specToEditor(t.spec);
  const limits = [ed.limits.cpu_pct && `cpu ${ed.limits.cpu_pct}`, ed.limits.ram_mb && `mem ${ed.limits.ram_mb}M`, ed.limits.disk_mb && `disk ${ed.limits.disk_mb}M`].filter(Boolean) as string[];
  return (
    <button
      type="button"
      onClick={onClick}
      className={`text-left w-full rounded-xl border p-4 transition-all duration-150 ${
        selected
          ? 'border-emerald-500/70 bg-emerald-950/30 ring-2 ring-emerald-500/30'
          : 'border-white/10 bg-white/5 hover:border-white/25 hover:bg-white/10'
      }`}
    >
      <div className="flex items-center gap-2.5">
        <div className={`shrink-0 w-8 h-8 rounded-md flex items-center justify-center border ${meta.badge}`}>
          <KindIcon kind={kind} className="w-4 h-4" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className="text-sm font-medium text-gray-100 truncate">{t.name}</span>
            <span className={`shrink-0 text-[10px] px-1.5 py-0.5 rounded border ${meta.badge}`}>{meta.label}</span>
          </div>
          <p className="text-[11px] text-gray-500 font-mono truncate" title={t.image}>{t.image}</p>
        </div>
        {selected && (
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4 text-emerald-400 shrink-0">
            <path d="M20 6 9 17l-5-5" />
          </svg>
        )}
      </div>
      {t.description && <p className="mt-2 text-xs text-gray-400 line-clamp-2">{t.description}</p>}
      <div className="flex flex-wrap gap-1 mt-2 text-[10px] text-gray-400">
        <span className="px-1.5 py-0.5 rounded bg-black/30 border border-white/10">{ed.ports.length} ports</span>
        <span className="px-1.5 py-0.5 rounded bg-black/30 border border-white/10">{ed.env.length} env</span>
        <span className="px-1.5 py-0.5 rounded bg-black/30 border border-white/10">{ed.mounts.length} mounts</span>
        {limits.length > 0 && (
          <span className="px-1.5 py-0.5 rounded bg-black/30 border border-white/10">{limits.join(' · ')}</span>
        )}
        {ed.ports.length === 0 && ed.env.length === 0 && ed.mounts.length === 0 && limits.length === 0 && (
          <span className="px-1.5 py-0.5 rounded bg-black/30 border border-white/10">no config</span>
        )}
      </div>
    </button>
  );
}

export interface NodeCardProps {
  n: any;
  selected: boolean;
  incompatibleKind?: string;
  onClick: () => void;
}

export const NodeCard: React.FC<NodeCardProps> = ({ n, selected, incompatibleKind, onClick }) => {
  const state = n.state || (n.status === 'up' ? 'up' : 'down');
  const dot = state === 'up' ? 'bg-emerald-400' : state === 'partial' ? 'bg-amber-400' : state === 'pending' ? 'bg-gray-400' : 'bg-red-400';
  const kinds: KindKey[] = [];
  if (n.driver_docker) kinds.push('docker');
  if (n.driver_lxd) kinds.push('lxd');
  if (n.driver_kvm) kinds.push('kvm');
  if (n.driver_multipass) kinds.push('multipass');
  return (
    <button
      type="button"
      onClick={onClick}
      className={`text-left w-full rounded-xl border p-4 transition-all duration-150 ${
        selected
          ? 'border-emerald-500/70 bg-emerald-950/30 ring-2 ring-emerald-500/30'
          : 'border-white/10 bg-white/5 hover:border-white/25 hover:bg-white/10'
      }`}
    >
      <div className="flex items-center gap-2">
        <span className={`shrink-0 w-2 h-2 rounded-full ${dot}`} />
        <span className="text-sm font-medium text-gray-100 truncate">{n.name}</span>
        <span className="ml-auto text-[10px] text-gray-500 shrink-0">{state}</span>
        {selected && (
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4 text-emerald-400 shrink-0">
            <path d="M20 6 9 17l-5-5" />
          </svg>
        )}
      </div>
      <p className="mt-1 text-xs text-gray-500 font-mono truncate">{n.address}</p>
      <div className="flex flex-wrap gap-1 mt-2">
        {kinds.length === 0 && <span className="text-[10px] text-amber-400">no drivers</span>}
        {kinds.map((k) => (
          <span key={k} className={`shrink-0 text-[10px] px-1.5 py-0.5 rounded border ${KIND_META[k].badge}`}>{KIND_META[k].label}</span>
        ))}
        {incompatibleKind && (
          <span className="shrink-0 text-[10px] px-1.5 py-0.5 rounded border border-amber-700/60 bg-amber-950/40 text-amber-200">
            missing {incompatibleKind} driver
          </span>
        )}
      </div>
    </button>
  );
}