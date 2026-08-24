import React, { useState } from 'react';
import { glassFieldClass } from '@/shared/components/ui/Field';
import type { Label, Device } from '@/features/templates/types/templateForm';

export interface LabelInput extends Label {}
export interface DeviceInput extends Device {}

export interface LabelsDevicesSectionProps {
  labels: LabelInput[];
  onLabelUpdate: (i: number, patch: Partial<LabelInput>) => void;
  onLabelAdd: () => void;
  onLabelDelete: (i: number) => void;
  devices: DeviceInput[];
  onDeviceUpdate: (i: number, patch: Partial<DeviceInput>) => void;
  onDeviceAdd: () => void;
  onDeviceDelete: (i: number) => void;
  sectionCls: string;
  labelCls: string;
  monoCls: string;
  addBtn: string;
}

export const TemplateLabelsDevicesSection: React.FC<LabelsDevicesSectionProps> = ({
  labels,
  onLabelUpdate,
  onLabelAdd,
  onLabelDelete,
  devices,
  onDeviceUpdate,
  onDeviceAdd,
  onDeviceDelete,
  sectionCls,
  labelCls,
  monoCls,
  addBtn,
}) => {
  const [editingLabelIdx, setEditingLabelIdx] = useState<number | null>(null);
  const [editingDeviceIdx, setEditingDeviceIdx] = useState<number | null>(null);
  return (
  <>
    {/* Section G: Labels & Device Mappings */}
    <div className={sectionCls}>
      <h4 className="text-sm font-semibold uppercase tracking-wide text-gray-400 mb-1">Section G · Labels & Devices</h4>
      <div>
        <div className="flex items-center justify-between mb-1">
          <label className={labelCls}>Docker labels (key=value)</label>
          <button type="button" onClick={onLabelAdd} className={addBtn} aria-label="Add label">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          </button>
        </div>
        {labels.length === 0 && <p className="text-xs text-gray-500">No labels.</p>}
        <div className="space-y-3">
          {labels.map((l, i) => {
            const isEditing = editingLabelIdx === i;
            return (
            <div key={i} className="ks-card ks-form-card rounded-md overflow-hidden">
              <div className="p-3 flex items-center gap-3 flex-wrap">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-semibold text-white truncate">{l.key || 'key'} = {l.value || ''}</span>
                  </div>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button type="button" onClick={() => onLabelDelete(i)} className="p-2 rounded hover:bg-white/5 text-red-400 hover:text-red-300" aria-label="Remove">
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4"><polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /></svg>
                  </button>
                  <button type="button" onClick={() => setEditingLabelIdx(isEditing ? null : i)} className="p-2 rounded hover:bg-white/5 text-gray-400 hover:text-white" aria-label="Options">
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4"><polyline points="6 9 12 15 18 9" /></svg>
                  </button>
                </div>
              </div>
              {isEditing && (
                <div className="px-3 pb-3 pt-1 border-t border-white/5 space-y-2 bg-black/20">
                  <div className="flex gap-2">
                    <input value={l.key} onChange={(e) => onLabelUpdate(i, { key: e.target.value })} placeholder="key (e.g. com.kspanel.audit)" className={monoCls + ' flex-1'} />
                    <input value={l.value} onChange={(e) => onLabelUpdate(i, { value: e.target.value })} placeholder="value" className={glassFieldClass + ' flex-1'} />
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
          <label className={labelCls}>Device mappings (Host → Container)</label>
          <button type="button" onClick={onDeviceAdd} className={addBtn} aria-label="Add device">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          </button>
        </div>
        {devices.length === 0 && <p className="text-xs text-gray-500">No device mappings. Useful for GPU/audio/tty access.</p>}
        <div className="space-y-3">
          {devices.map((d, i) => {
            const isEditing = editingDeviceIdx === i;
            return (
            <div key={i} className="ks-card ks-form-card rounded-md overflow-hidden">
              <div className="p-3 flex items-center gap-3 flex-wrap">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-semibold text-white truncate">{d.host || 'host'} → {d.container || 'container'}</span>
                    {d.cgroup && <span className="text-[10px] uppercase tracking-wide border px-1.5 py-0.5 rounded bg-violet-900/30 text-violet-300 border-violet-700/40">cgroup</span>}
                  </div>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button type="button" onClick={() => onDeviceDelete(i)} className="p-2 rounded hover:bg-white/5 text-red-400 hover:text-red-300" aria-label="Remove">
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4"><polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /></svg>
                  </button>
                  <button type="button" onClick={() => setEditingDeviceIdx(isEditing ? null : i)} className="p-2 rounded hover:bg-white/5 text-gray-400 hover:text-white" aria-label="Options">
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4"><polyline points="6 9 12 15 18 9" /></svg>
                  </button>
                </div>
              </div>
              {isEditing && (
                <div className="px-3 pb-3 pt-1 border-t border-white/5 space-y-2 bg-black/20">
                  <div className="flex gap-2 items-center">
                    <input value={d.host} onChange={(e) => onDeviceUpdate(i, { host: e.target.value })} placeholder="/dev/nvidia0" className={monoCls + ' flex-1'} />
                    <span className="self-center text-gray-500">→</span>
                    <input value={d.container} onChange={(e) => onDeviceUpdate(i, { container: e.target.value })} placeholder="/dev/nvidia0" className={monoCls + ' flex-1'} />
                    <label className="inline-flex items-center gap-2 cursor-pointer">
                      <button type="button" onClick={() => onDeviceUpdate(i, { cgroup: !d.cgroup })} className={`relative w-9 h-5 rounded-full transition ${d.cgroup ? 'bg-green-600' : 'bg-neutral-700'}`} aria-pressed={d.cgroup}>
                        <span className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full transition ${d.cgroup ? 'translate-x-4' : ''}`} />
                      </button>
                      <span className="text-sm text-gray-300">cgroup</span>
                    </label>
                  </div>
                </div>
              )}
            </div>
            );
          })}
        </div>
      </div>
    </div>
  </>
);
};