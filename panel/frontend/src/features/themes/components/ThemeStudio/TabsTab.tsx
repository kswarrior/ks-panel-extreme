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
      <div className="ks-form-card rounded-lg space-y-4">
        <Label label="Active tab (selected)" hint="The pill that marks the current page/section." />
        <ColorField label="Background" value={draft.tabs.active_background} onChange={(v) => patch('tabs', { active_background: v })} />
        <ColorField label="Text color" value={draft.tabs.active_text_color} onChange={(v) => patch('tabs', { active_text_color: v })} />
      </div>

      <div className="ks-form-card rounded-lg space-y-4">
        <Label label="Inactive tab" hint="Unselected tabs in the bar." />
        <ColorField label="Background" value={draft.tabs.inactive_background} onChange={(v) => patch('tabs', { inactive_background: v })} />
        <ColorField label="Text color" value={draft.tabs.inactive_text_color} onChange={(v) => patch('tabs', { inactive_text_color: v })} />
      </div>

      <div className="ks-form-card rounded-lg space-y-4">
        <Label label="Hover state" hint="Inactive tab wash on mouse-over." />
        <ColorField label="Hover background" value={draft.tabs.hover_background} onChange={(v) => patch('tabs', { hover_background: v })} />
        <ColorField label="Hover text color" value={draft.tabs.hover_text_color} onChange={(v) => patch('tabs', { hover_text_color: v })} />
      </div>

      <div className="ks-form-card rounded-lg space-y-4">
        <Label label="Shape" hint="Radius / padding / font / border for the tab pill." />
        <Text label="Border (CSS, or 'none')" value={draft.tabs.border} onChange={(v) => patch('tabs', { border: v })} mono placeholder="none" />
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
          <Slider label="Border radius" max={24} value={draft.tabs.border_radius} onChange={(v) => patch('tabs', { border_radius: v })} />
          <Slider label="Padding X" max={24} value={draft.tabs.padding_x} onChange={(v) => patch('tabs', { padding_x: v })} />
          <Slider label="Padding Y" max={20} value={draft.tabs.padding_y} onChange={(v) => patch('tabs', { padding_y: v })} />
          <Slider label="Font size" min={10} max={20} value={draft.tabs.font_size} onChange={(v) => patch('tabs', { font_size: v })} />
        </div>
      </div>

      <div className="ks-form-card rounded-lg space-y-4">
        <Label label="Active indicator" hint="Optional underline / border beneath the selected tab." />
        <ColorField label="Indicator color" value={draft.tabs.indicator_color} onChange={(v) => patch('tabs', { indicator_color: v })} />
        <Slider label="Indicator height" max={6} value={draft.tabs.indicator_height} onChange={(v) => patch('tabs', { indicator_height: v })} suffix="px" />
      </div>

      <div className="ks-form-card rounded-lg space-y-4">
        <Label label="Scope cards — System page" hint="The Host / Panel scope switcher: top sweep line + icon tile. Colors above still paint the cards; these tune the line and tile." />
        <Text label="Sweep line color (CSS, or 'currentColor')" value={draft.tabs.scope_line_color ?? 'currentColor'} onChange={(v) => patch('tabs', { scope_line_color: v })} mono placeholder="currentColor" hint="'currentColor' follows the tab text so the line stays visible on any active fill." />
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Slider label="Line height" max={6} value={draft.tabs.scope_line_height ?? 2} onChange={(v) => patch('tabs', { scope_line_height: v })} suffix="px" />
          <Slider label="Sweep speed" min={100} max={1000} step={20} value={draft.tabs.scope_line_speed ?? 380} onChange={(v) => patch('tabs', { scope_line_speed: v })} suffix="ms" />
          <Slider label="Icon tile size" min={28} max={56} value={draft.tabs.scope_icon_size ?? 40} onChange={(v) => patch('tabs', { scope_icon_size: v })} suffix="px" />
        </div>
      </div>

      <div className="ks-form-card rounded-lg space-y-4">
        <Label label="Section rail — Security & Database" hint="The shared horizontal strip on both pages: icon + label + hint with an active pill + growing bottom line." />
        <ColorField label="Indicator color" value={draft.tabs.rail_indicator_color ?? 'currentColor'} onChange={(v) => patch('tabs', { rail_indicator_color: v })} hint="'currentColor' follows the tab text so the line stays visible on any active fill." />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Slider label="Indicator height" max={6} value={draft.tabs.rail_indicator_height ?? 2} onChange={(v) => patch('tabs', { rail_indicator_height: v })} suffix="px" />
          <Slider label="Icon size" min={12} max={28} value={draft.tabs.rail_icon_size ?? 16} onChange={(v) => patch('tabs', { rail_icon_size: v })} suffix="px" />
        </div>
      </div>

      <div className="ks-form-card rounded-lg space-y-3">
        <Label label="Preview" hint="Live sample of the tab bar." />
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" className="ks-tab ks-tab-active">Overview</button>
          <button type="button" className="ks-tab">Trends</button>
          <button type="button" className="ks-tab">Sources</button>
          <button type="button" className="ks-tab">Defense</button>
        </div>
      </div>

      <div className="ks-form-card rounded-lg space-y-3">
        <Label label="Preview — section rail" hint="The shared Security / Database style, painted from the rail knobs above." />
        <div className="flex items-stretch gap-1 overflow-x-auto">
          {['Overview', 'Tables', 'Switch', 'Backup'].map((t, i) => (
            <span
              key={t}
              className={`ks-rail-tab relative flex items-center gap-2 px-3 py-2 text-sm shrink-0 ${i === 0 ? 'is-active' : ''}`}
              data-active={i === 0}
            >
              <span className="text-sm font-medium whitespace-nowrap">{t}</span>
              <span aria-hidden="true" className="ks-rail-bar" data-active={i === 0} />
            </span>
          ))}
        </div>
      </div>

      <div className="ks-form-card rounded-lg space-y-3">
        <Label label="Preview — scope cards" hint="The System page style, painted from the scope knobs above. Open the System page to feel the sweep replay on every click." />
        <div className="grid grid-cols-2 gap-2">
          {['Host', 'Panel'].map((t, i) => (
            <span
              key={t}
              className={`ks-system-tab relative flex items-center gap-2 rounded-lg border p-3 ${i === 0 ? 'is-active' : ''}`}
              data-active={i === 0}
            >
              <span aria-hidden="true" className="ks-system-tab-bar" data-active={i === 0} />
              <span className="text-sm font-semibold">{t}</span>
            </span>
          ))}
        </div>
      </div>
    </GlassCard>
  );
};