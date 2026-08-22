import React from 'react';
import GlassCard from '@/shared/components/ui/Card';
import { ColorField, Label, Text, Slider } from '@/theme/studioControls';

interface TabsTabProps {
  draft: any;
  patch: (section: 'tabs', p: Record<string, any>) => void;
}

export const TabsTab: React.FC<TabsTabProps> = ({ draft, patch }) => {
  return (
    <GlassCard className="space-y-4">
      <div className="rounded-lg border border-white/10 bg-black/20 p-4 space-y-4">
        <Label label="Active tab (selected)" hint="The pill that marks the current page/section." />
        <ColorField label="Background" value={draft.tabs.active_background} onChange={(v) => patch('tabs', { active_background: v })} />
        <ColorField label="Text color" value={draft.tabs.active_text_color} onChange={(v) => patch('tabs', { active_text_color: v })} />
      </div>

      <div className="rounded-lg border border-white/10 bg-black/20 p-4 space-y-4">
        <Label label="Inactive tab" hint="Unselected tabs in the bar." />
        <ColorField label="Background" value={draft.tabs.inactive_background} onChange={(v) => patch('tabs', { inactive_background: v })} />
        <ColorField label="Text color" value={draft.tabs.inactive_text_color} onChange={(v) => patch('tabs', { inactive_text_color: v })} />
      </div>

      <div className="rounded-lg border border-white/10 bg-black/20 p-4 space-y-4">
        <Label label="Hover state" hint="Inactive tab wash on mouse-over." />
        <ColorField label="Hover background" value={draft.tabs.hover_background} onChange={(v) => patch('tabs', { hover_background: v })} />
        <ColorField label="Hover text color" value={draft.tabs.hover_text_color} onChange={(v) => patch('tabs', { hover_text_color: v })} />
      </div>

      <div className="rounded-lg border border-white/10 bg-black/20 p-4 space-y-4">
        <Label label="Shape" hint="Radius / padding / font / border for the tab pill." />
        <Text label="Border (CSS, or 'none')" value={draft.tabs.border} onChange={(v) => patch('tabs', { border: v })} mono placeholder="none" />
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
          <Slider label="Border radius" max={24} value={draft.tabs.border_radius} onChange={(v) => patch('tabs', { border_radius: v })} />
          <Slider label="Padding X" max={24} value={draft.tabs.padding_x} onChange={(v) => patch('tabs', { padding_x: v })} />
          <Slider label="Padding Y" max={20} value={draft.tabs.padding_y} onChange={(v) => patch('tabs', { padding_y: v })} />
          <Slider label="Font size" min={10} max={20} value={draft.tabs.font_size} onChange={(v) => patch('tabs', { font_size: v })} />
        </div>
      </div>

      <div className="rounded-lg border border-white/10 bg-black/20 p-4 space-y-4">
        <Label label="Active indicator" hint="Optional underline / border beneath the selected tab." />
        <ColorField label="Indicator color" value={draft.tabs.indicator_color} onChange={(v) => patch('tabs', { indicator_color: v })} />
        <Slider label="Indicator height" max={6} value={draft.tabs.indicator_height} onChange={(v) => patch('tabs', { indicator_height: v })} suffix="px" />
      </div>

      <div className="rounded-lg border border-white/10 bg-black/20 p-4 space-y-3">
        <Label label="Preview" hint="Live sample of the tab bar." />
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" className="ks-tab ks-tab-active">Overview</button>
          <button type="button" className="ks-tab">Trends</button>
          <button type="button" className="ks-tab">Sources</button>
          <button type="button" className="ks-tab">Defense</button>
        </div>
      </div>
    </GlassCard>
  );
};