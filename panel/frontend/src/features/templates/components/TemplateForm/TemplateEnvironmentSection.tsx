import React, { useState } from 'react';
import { glassFieldClass } from '@/shared/components/ui/Field';
import type { PortMapping, Mount, ResourceLimits, FeatureCaps, DriverKind } from '@/features/templates/types/templateForm';

export interface PortMappingInput {
  host: string;
  guest: string;
  protocol: 'tcp' | 'udp';
}
export interface MountInput {
  source: string;
  target: string;
  mode: 'rw' | 'ro';
}

export interface EnvironmentSectionProps {
  // Image (read-only in InstanceForm, editable in TemplateForm)
  image: string;
  kind: DriverKind;
  onImageChange?: (value: string) => void;
  // Ports
  ports: PortMappingInput[];
  onPortUpdate: (i: number, patch: Partial<PortMappingInput>) => void;
  onPortAdd: () => void;
  onPortDelete: (i: number) => void;
  // Mounts
  mounts: MountInput[];
  onMountUpdate: (i: number, patch: Partial<MountInput>) => void;
  onMountAdd: () => void;
  onMountDelete: (i: number) => void;
  // Limits
  limits: ResourceLimits;
  onLimitsUpdate: (patch: Partial<ResourceLimits>) => void;
  // Caps
  caps: FeatureCaps;
  onCapsUpdate: (patch: Partial<FeatureCaps>) => void;
  // Styling
  sectionCls: string;
  labelCls: string;
  monoCls: string;
  addBtn: string;
}

export const TemplateEnvironmentSection: React.FC<EnvironmentSectionProps> = ({
  image,
  kind,
  onImageChange,
  ports,
  onPortUpdate,
  onPortAdd,
  onPortDelete,
  mounts,
  onMountUpdate,
  onMountAdd,
  onMountDelete,
  limits,
  onLimitsUpdate,
  caps,
  onCapsUpdate,
  sectionCls,
  labelCls,
  monoCls,
  addBtn,
}) => {
  const [editingIdx, setEditingIdx] = useState<number | null>(null);
  const [editingMountIdx, setEditingMountIdx] = useState<number | null>(null);
  const nonDocker = kind !== 'docker';
  const runtimeLabel = kind === 'docker' ? 'Docker image (registry)' 
    : kind === 'multipass' ? 'Multipass image (e.g. ubuntu-lts)'
    : kind === 'kvm' ? 'KVM ISO path'
    : 'LXD image (e.g. images:ubuntu/22.04)';

  return (
    <>
      {/* Section B: Infra & Environment */}
      <div className={sectionCls}>
        <h4 className="text-sm font-semibold uppercase tracking-wide text-gray-400 mb-1">Section B · Infra & Environment</h4>
        <div>
          <label className={labelCls}>{runtimeLabel}</label>
          <input 
            value={image} 
            onChange={(e) => onImageChange?.(e.target.value)} 
            placeholder={kind === 'docker' ? 'registry.example.com/app:latest' : '/path/to/ubuntu.iso'} 
            className={monoCls} 
            readOnly={!onImageChange}
          />
        </div>

        <div>
          <div className="flex items-center justify-between mb-1">
            <label className={labelCls}>Ports (Host:Guest / Protocol)</label>
            <button type="button" onClick={onPortAdd} className={addBtn} aria-label="Add port">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            </button>
          </div>
          {nonDocker && (
            <p className="text-xs text-amber-500 mb-2">⚠ Non-Docker drivers: ports may require an SSH tunnel on the edge host.</p>
          )}
          <div className="space-y-3">
            {ports.map((p, i) => {
              const isEditing = editingIdx === i;
              return (
              <div key={i} className="ks-card ks-form-card rounded-md overflow-hidden">
                <div className="p-3 flex items-center gap-3 flex-wrap">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-semibold text-white truncate">{p.host}:{p.guest || '?'}</span>
                      <span className="text-[10px] uppercase tracking-wide border px-1.5 py-0.5 rounded bg-sky-900/30 text-sky-300 border-sky-700/40">{p.protocol}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button type="button" onClick={() => onPortDelete(i)} className="p-2 rounded hover:bg-white/5 text-red-400 hover:text-red-300" aria-label="Remove">
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4"><polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /></svg>
                    </button>
                    <button type="button" onClick={() => setEditingIdx(isEditing ? null : i)} className="p-2 rounded hover:bg-white/5 text-gray-400 hover:text-white" aria-label="Options">
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4"><polyline points="6 9 12 15 18 9" /></svg>
                    </button>
                  </div>
                </div>
                {isEditing && (
                  <div className="px-3 pb-3 pt-1 border-t border-white/5 space-y-2 bg-black/20">
                    <div className="flex gap-2">
                      <input value={p.host} onChange={(e) => onPortUpdate(i, { host: e.target.value })} placeholder="host" className={glassFieldClass} />
                      <span className="self-center text-gray-500">:</span>
                      <input value={p.guest} onChange={(e) => onPortUpdate(i, { guest: e.target.value })} placeholder="guest" className={glassFieldClass} />
                      <select value={p.protocol} onChange={(e) => onPortUpdate(i, { protocol: e.target.value as 'tcp' | 'udp' })} className={glassFieldClass + ' w-20'}>
                        <option value="tcp">tcp</option>
                        <option value="udp">udp</option>
                      </select>
                    </div>
                  </div>
                )}
              </div>
              );
            })}
          </div>
        </div>

        <div>
          <div className="flex items-center justify-between mb-1">
            <label className={labelCls}>Mounts (Source → Target, Mode)</label>
            <button type="button" onClick={onMountAdd} className={addBtn} aria-label="Add mount">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            </button>
          </div>
          <div className="space-y-3">
            {mounts.map((m, i) => {
              const isEditing = editingMountIdx === i;
              return (
              <div key={i} className="ks-card ks-form-card rounded-md overflow-hidden">
                <div className="p-3 flex items-center gap-3 flex-wrap">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-semibold text-white truncate">{m.source || 'source'} → {m.target || 'target'}</span>
                      <span className="text-[10px] uppercase tracking-wide border px-1.5 py-0.5 rounded bg-emerald-900/30 text-emerald-300 border-emerald-700/40">{m.mode}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button type="button" onClick={() => onMountDelete(i)} className="p-2 rounded hover:bg-white/5 text-red-400 hover:text-red-300" aria-label="Remove">
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4"><polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /></svg>
                    </button>
                    <button type="button" onClick={() => setEditingMountIdx(isEditing ? null : i)} className="p-2 rounded hover:bg-white/5 text-gray-400 hover:text-white" aria-label="Options">
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4"><polyline points="6 9 12 15 18 9" /></svg>
                    </button>
                  </div>
                </div>
                {isEditing && (
                  <div className="px-3 pb-3 pt-1 border-t border-white/5 space-y-2 bg-black/20">
                    <div className="flex gap-2">
                      <input value={m.source} onChange={(e) => onMountUpdate(i, { source: e.target.value })} placeholder="source path" className={glassFieldClass} />
                      <span className="self-center text-gray-500">→</span>
                      <input value={m.target} onChange={(e) => onMountUpdate(i, { target: e.target.value })} placeholder="target path" className={glassFieldClass} />
                      <select value={m.mode} onChange={(e) => onMountUpdate(i, { mode: e.target.value as 'rw' | 'ro' })} className={glassFieldClass + ' w-20'}>
                        <option value="rw">rw</option>
                        <option value="ro">ro</option>
                      </select>
                    </div>
                  </div>
                )}
              </div>
              );
            })}
          </div>
        </div>

        <div>
          <label className={labelCls}>Resource Limits</label>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            <input value={limits.ram_mb} onChange={(e) => onLimitsUpdate({ ram_mb: e.target.value })} placeholder="RAM MB" className={glassFieldClass} />
            <input value={limits.cpu_pct} onChange={(e) => onLimitsUpdate({ cpu_pct: e.target.value })} placeholder="CPU %" className={glassFieldClass} />
            <input value={limits.disk_mb} onChange={(e) => onLimitsUpdate({ disk_mb: e.target.value })} placeholder="Disk MB" className={glassFieldClass} />
            <input value={limits.swap_mb} onChange={(e) => onLimitsUpdate({ swap_mb: e.target.value })} placeholder="Swap MB" className={glassFieldClass} />
          </div>
        </div>

        <div>
          <label className={labelCls}>Feature Caps (max counts)</label>
          <div className="grid grid-cols-3 gap-2">
            <input value={caps.databases} onChange={(e) => onCapsUpdate({ databases: e.target.value })} placeholder="Databases" className={glassFieldClass} />
            <input value={caps.backups} onChange={(e) => onCapsUpdate({ backups: e.target.value })} placeholder="Backups" className={glassFieldClass} />
            <input value={caps.networks} onChange={(e) => onCapsUpdate({ networks: e.target.value })} placeholder="Network mappings" className={glassFieldClass} />
          </div>
        </div>
      </div>
    </>
  );
};