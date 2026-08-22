import React from 'react';
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
}) => (
  <>
    {/* Section G: Labels & Device Mappings */}
    <div className={sectionCls}>
      <h4 className="text-sm font-semibold uppercase tracking-wide text-gray-400 mb-1">Section G · Labels & Devices</h4>
      <div>
        <div className="flex items-center justify-between mb-1">
          <label className={labelCls}>Docker labels (key=value)</label>
          <button type="button" onClick={onLabelAdd} className={addBtn}>+ Label</button>
        </div>
        {labels.length === 0 && <p className="text-xs text-gray-500">No labels.</p>}
        <div className="space-y-2">
          {labels.map((l, i) => (
            <div key={i} className="flex gap-2">
              <input value={l.key} onChange={(e) => onLabelUpdate(i, { key: e.target.value })} placeholder="key (e.g. com.kspanel.audit)" className={monoCls + ' flex-1'} />
              <input value={l.value} onChange={(e) => onLabelUpdate(i, { value: e.target.value })} placeholder="value" className={glassFieldClass + ' flex-1'} />
              <button type="button" onClick={() => onLabelDelete(i)} className="text-gray-400 hover:text-red-400 px-2">✕</button>
            </div>
          ))}
        </div>
      </div>
      <div>
        <div className="flex items-center justify-between mb-1">
          <label className={labelCls}>Device mappings (Host → Container)</label>
          <button type="button" onClick={onDeviceAdd} className={addBtn}>+ Device</button>
        </div>
        {devices.length === 0 && <p className="text-xs text-gray-500">No device mappings. Useful for GPU/audio/tty access.</p>}
        <div className="space-y-2">
          {devices.map((d, i) => (
            <div key={i} className="flex gap-2 items-center">
              <input value={d.host} onChange={(e) => onDeviceUpdate(i, { host: e.target.value })} placeholder="/dev/nvidia0" className={monoCls + ' flex-1'} />
              <span className="self-center text-gray-500">→</span>
              <input value={d.container} onChange={(e) => onDeviceUpdate(i, { container: e.target.value })} placeholder="/dev/nvidia0" className={monoCls + ' flex-1'} />
              <label className="inline-flex items-center gap-2 cursor-pointer">
                <button type="button" onClick={() => onDeviceUpdate(i, { cgroup: !d.cgroup })} className={`relative w-9 h-5 rounded-full transition ${d.cgroup ? 'bg-green-600' : 'bg-neutral-700'}`} aria-pressed={d.cgroup}>
                  <span className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full transition ${d.cgroup ? 'translate-x-4' : ''}`} />
                </button>
                <span className="text-sm text-gray-300">cgroup</span>
              </label>
              <button type="button" onClick={() => onDeviceDelete(i)} className="text-gray-400 hover:text-red-400 px-2">✕</button>
            </div>
          ))}
        </div>
      </div>
    </div>
  </>
);