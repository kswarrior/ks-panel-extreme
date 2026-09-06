import React from 'react';
import GlassCard from '@/shared/components/ui/Card';
import { ColorField, Slider, Select, Label } from '@/theme/studioControls';

interface HeaderTabProps {
  draft: any;
  patch: (section: 'header', p: Record<string, any>) => void;
}

export const HeaderTab: React.FC<HeaderTabProps> = ({ draft, patch }) => {
  const lbEnabled = draft.header.loading_bar_enabled ?? true;
  const lbColor = draft.header.loading_bar_color ?? '#ffffff';
  const lbTrack = draft.header.loading_bar_background ?? 'transparent';
  const lbHeight = draft.header.loading_bar_height ?? 2;
  const lbPosition = draft.header.loading_bar_position ?? 'bottom';
  return (
    <div className="space-y-4">
    <GlassCard variant="form" className="space-y-4">
      <ColorField label="Header background" value={draft.header.background} onChange={(v) => patch('header', { background: v })} />
      <ColorField label="Border color" value={draft.header.border_color} onChange={(v) => patch('header', { border_color: v })} />
      <ColorField label="Text color" value={draft.header.text_color} onChange={(v) => patch('header', { text_color: v })} />
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Slider label="Height" min={40} max={96} value={draft.header.height} onChange={(v) => patch('header', { height: v })} />
        <Slider label="Backdrop blur" max={48} value={draft.header.backdrop_blur} onChange={(v) => patch('header', { backdrop_blur: v })} />
      </div>
    </GlassCard>

    <GlassCard variant="form" className="space-y-4">
      <div>
        <Label label="Header loading bar" hint="Google-style sweep shown along the header edge while a new page opens." />
      </div>
      <label className="flex items-center gap-2 text-xs text-gray-300">
        <input
          type="checkbox"
          checked={lbEnabled}
          onChange={(e) => patch('header', { loading_bar_enabled: e.target.checked })}
          className="ks-checkbox w-4 h-4"
        />
        Show loading bar
      </label>
      {lbEnabled && (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <ColorField label="Bar color" value={lbColor} onChange={(v) => patch('header', { loading_bar_color: v })} />
            <ColorField label="Track color" value={lbTrack} onChange={(v) => patch('header', { loading_bar_background: v })} hint="Painted behind the bar (transparent = none)." />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Slider label="Bar thickness" min={1} max={8} value={lbHeight} onChange={(v) => patch('header', { loading_bar_height: v })} />
            <Select
              label="Bar position"
              value={lbPosition}
              options={[
                { label: 'Bottom edge', value: 'bottom' },
                { label: 'Top edge', value: 'top' },
              ]}
              onChange={(v) => patch('header', { loading_bar_position: v as any })}
            />
          </div>
          {/* Live preview — mini header strip with the themed bar at 70% sweep. */}
          <div className="mt-2 p-3 rounded-lg border border-white/10 bg-black/30">
            <Label label="Live preview" hint="Bar fill / track / thickness / edge as it renders in the header." />
            <div
              className="relative mt-2 overflow-hidden rounded-md border border-white/10"
              style={{ background: draft.header.background, height: 32 }}
            >
              <div
                aria-hidden="true"
                className="absolute left-0 right-0"
                style={{
                  ...(lbPosition === 'top' ? { top: 0 } : { bottom: 0 }),
                  height: lbHeight,
                  backgroundColor: lbTrack,
                }}
              >
                <div style={{ width: '70%', height: '100%', backgroundColor: lbColor }} />
              </div>
            </div>
          </div>
        </>
      )}
    </GlassCard>
    </div>
  );
};