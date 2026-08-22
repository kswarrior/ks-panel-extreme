import React from 'react';
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
            <button type="button" onClick={onPortAdd} className={addBtn}>+ Port</button>
          </div>
          {nonDocker && (
            <p className="text-xs text-amber-500 mb-2">⚠ Non-Docker drivers: ports may require an SSH tunnel on the edge host.</p>
          )}
          <div className="space-y-2">
            {ports.map((p, i) => (
              <div key={i} className="flex gap-2">
                <input value={p.host} onChange={(e) => onPortUpdate(i, { host: e.target.value })} placeholder="host" className={glassFieldClass} />
                <span className="self-center text-gray-500">:</span>
                <input value={p.guest} onChange={(e) => onPortUpdate(i, { guest: e.target.value })} placeholder="guest" className={glassFieldClass} />
                <select value={p.protocol} onChange={(e) => onPortUpdate(i, { protocol: e.target.value as 'tcp' | 'udp' })} className={glassFieldClass + ' w-20'}>
                  <option value="tcp">tcp</option>
                  <option value="udp">udp</option>
                </select>
                <button type="button" onClick={() => onPortDelete(i)} className="text-gray-400 hover:text-red-400 px-2">✕</button>
              </div>
            ))}
          </div>
        </div>

        <div>
          <div className="flex items-center justify-between mb-1">
            <label className={labelCls}>Mounts (Source → Target, Mode)</label>
            <button type="button" onClick={onMountAdd} className={addBtn}>+ Mount</button>
          </div>
          <div className="space-y-2">
            {mounts.map((m, i) => (
              <div key={i} className="flex gap-2">
                <input value={m.source} onChange={(e) => onMountUpdate(i, { source: e.target.value })} placeholder="source path" className={glassFieldClass} />
                <span className="self-center text-gray-500">→</span>
                <input value={m.target} onChange={(e) => onMountUpdate(i, { target: e.target.value })} placeholder="target path" className={glassFieldClass} />
                <select value={m.mode} onChange={(e) => onMountUpdate(i, { mode: e.target.value as 'rw' | 'ro' })} className={glassFieldClass + ' w-20'}>
                  <option value="rw">rw</option>
                  <option value="ro">ro</option>
                </select>
                <button type="button" onClick={() => onMountDelete(i)} className="text-gray-400 hover:text-red-400 px-2">✕</button>
              </div>
            ))}
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
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            <input value={caps.databases} onChange={(e) => onCapsUpdate({ databases: e.target.value })} placeholder="Databases" className={glassFieldClass} />
            <input value={caps.backups} onChange={(e) => onCapsUpdate({ backups: e.target.value })} placeholder="Backups" className={glassFieldClass} />
            <input value={caps.networks} onChange={(e) => onCapsUpdate({ networks: e.target.value })} placeholder="Network mappings" className={glassFieldClass} />
          </div>
        </div>
      </div>
    </>
  );
};