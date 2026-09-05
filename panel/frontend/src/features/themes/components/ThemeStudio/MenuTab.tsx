import React, { useState } from 'react';
import GlassCard from '@/shared/components/ui/Card';
import { ColorField, Label, Slider, Text } from '@/theme/studioControls';

interface MenuTabProps {
  draft: any;
  patch: (section: 'menu', p: Record<string, any>) => void;
}

export const MenuTab: React.FC<MenuTabProps> = ({ draft, patch }) => {
  const m = draft.menu;
  const [previewOpen, setPreviewOpen] = useState(true);

  return (
    <GlassCard className="space-y-4">
      <div className="ks-form-card rounded-lg space-y-4">
        <Label label="Toggle" hint="The floating square on instance detail pages — surface, icon tint and resting shadow." />
        <ColorField label="Background" value={m.toggle_background} onChange={(v) => patch('menu', { toggle_background: v })} />
        <ColorField label="Border color" value={m.toggle_border_color} onChange={(v) => patch('menu', { toggle_border_color: v })} />
        <ColorField label="Icon color" value={m.toggle_icon_color} onChange={(v) => patch('menu', { toggle_icon_color: v })} hint="Wheel glyph + nudge chevron tint." />
        <Text label="Shadow (CSS)" value={m.toggle_shadow} onChange={(v) => patch('menu', { toggle_shadow: v })} mono placeholder="0 8px 32px rgba(0,0,0,0.45)" />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Slider label="Corner radius" max={23} value={m.toggle_radius} onChange={(v) => patch('menu', { toggle_radius: v })} />
        </div>
      </div>

      <div className="ks-form-card rounded-lg space-y-4">
        <Label label="Accent" hint="Open-state glow ring + active wheel tint on the toggle." />
        <ColorField label="Accent color" value={m.accent_color} onChange={(v) => patch('menu', { accent_color: v })} />
      </div>

      <div className="ks-form-card rounded-lg space-y-4">
        <Label label="Popover" hint="The menu panel — status row, power controls and template actions live here." />
        <ColorField label="Background" value={m.popover_background} onChange={(v) => patch('menu', { popover_background: v })} />
        <ColorField label="Border color" value={m.popover_border_color} onChange={(v) => patch('menu', { popover_border_color: v })} />
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Slider label="Panel width" min={200} max={560} step={10} suffix="px" value={m.popover_width} onChange={(v) => patch('menu', { popover_width: v })} />
          <Slider label="Corner radius" max={24} value={m.popover_radius} onChange={(v) => patch('menu', { popover_radius: v })} />
          <Slider label="Backdrop blur" max={60} value={m.popover_blur} onChange={(v) => patch('menu', { popover_blur: v })} />
        </div>
      </div>

      <div className="ks-form-card rounded-lg space-y-3">
        <Label label="Preview" hint="Live sample painted straight from this tab — click the square to open / close the popover." />
        <div className="flex items-start gap-4">
          <button
            type="button"
            onClick={() => setPreviewOpen((v) => !v)}
            aria-label="Toggle menu preview"
            title="Toggle menu preview"
            className="shrink-0 flex items-center justify-center select-none transition-transform duration-150 hover:scale-105 active:scale-95"
            style={{
              width: 46,
              height: 46,
              borderRadius: m.toggle_radius,
              backgroundColor: m.toggle_background,
              border: `1px solid ${m.toggle_border_color}`,
              boxShadow: previewOpen ? `0 0 0 4px ${m.accent_color}24, ${m.toggle_shadow}` : m.toggle_shadow,
              color: previewOpen ? m.accent_color : m.toggle_icon_color,
            }}
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="w-6 h-6 pointer-events-none"
              style={{ transform: previewOpen ? 'rotate(135deg) scale(1.06)' : undefined, transition: 'transform 280ms' }}
              aria-hidden="true"
            >
              <circle cx="12" cy="12" r="8" />
              <circle cx="12" cy="12" r="2.5" />
              <path d="M12 4v5.5" />
              <path d="M12 14.5V20" />
              <path d="M4 12h5.5" />
              <path d="M14.5 12H20" />
            </svg>
          </button>
          <div
            className="text-sm flex flex-col overflow-hidden transition-all duration-200 origin-top-left"
            style={{
              width: Math.min(m.popover_width, 320),
              maxWidth: '100%',
              borderRadius: m.popover_radius,
              backgroundColor: m.popover_background,
              border: `1px solid ${m.popover_border_color}`,
              boxShadow: '0 12px 40px rgba(0, 0, 0, 0.55)',
              backdropFilter: `blur(${m.popover_blur}px) saturate(180%)`,
              opacity: previewOpen ? 1 : 0,
              transform: previewOpen ? 'scale(1)' : 'scale(0.92)',
              pointerEvents: previewOpen ? 'auto' : 'none',
            }}
            aria-hidden={!previewOpen}
          >
            <div className="flex items-center gap-2 px-3 pt-2.5 pb-2 border-b border-white/10">
              <span className="w-2 h-2 rounded-full bg-emerald-400 shrink-0" />
              <span className="text-[11px] font-semibold uppercase tracking-wider text-gray-300 flex-1 truncate">
                Instance controls
              </span>
              <span className="inline-flex items-center gap-0.5 text-[11px] font-medium text-gray-400">
                More
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" width={12} height={12} aria-hidden="true"><path d="M9 18l6-6-6-6" /></svg>
              </span>
            </div>
            <div className="px-3 py-2 flex items-center gap-1">
              <span className="flex-1 text-center text-[13px] font-medium text-emerald-300 rounded-md px-2 py-2">Start</span>
              <span className="flex-1 text-center text-[13px] font-medium text-sky-300 rounded-md px-2 py-2">Restart</span>
              <span className="flex-1 text-center text-[13px] font-medium text-red-400 rounded-md px-2 py-2">Kill</span>
            </div>
            <div className="mx-3 border-t border-white/10" />
            <div className="px-3 py-2">
              <p className="px-1 pb-1 text-[10px] font-medium uppercase tracking-wider text-gray-500">Actions</p>
              <div className="rounded-md border border-white/10 flex items-stretch">
                <span className="flex-1 px-2.5 py-2 text-[13px] text-emerald-300">backup-world</span>
                <span className="w-px bg-white/10" />
                <span className="w-10 flex items-center justify-center text-gray-400">
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" width={14} height={14} aria-hidden="true" style={{ transform: 'rotate(-90deg)' }}><path d="M6 9l6 6 6-6" /></svg>
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </GlassCard>
  );
};
