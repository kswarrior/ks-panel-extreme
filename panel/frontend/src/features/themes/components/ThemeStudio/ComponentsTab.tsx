import React from 'react';
import GlassCard from '@/shared/components/ui/Card';
import { ColorField, Label, Slider } from '@/theme/studioControls';

interface ComponentsTabProps {
  draft: any;
  patch: (section: 'components', p: Record<string, any>) => void;
}

export const ComponentsTab: React.FC<ComponentsTabProps> = ({ draft, patch }) => {
  return (
    <GlassCard className="space-y-4">
      <div className="rounded-lg border border-white/10 bg-black/20 p-4 space-y-4">
        <Label label="Card / Panel" hint="Base card surfaces used across the panel." />
        <ColorField label="Background" value={draft.components?.card_background ?? 'rgba(255,255,255,0.04)'} onChange={(v) => patch('components', { card_background: v })} />
        <ColorField label="Border color" value={draft.components?.card_border_color ?? 'rgba(255,255,255,0.1)'} onChange={(v) => patch('components', { card_border_color: v })} />
        <ColorField label="Hover border color" value={draft.components?.card_hover_border_color ?? 'rgba(255,255,255,0.2)'} onChange={(v) => patch('components', { card_hover_border_color: v })} />
        <ColorField label="Shadow" value={draft.components?.card_shadow ?? '0 8px 32px rgba(0,0,0,0.45)'} onChange={(v) => patch('components', { card_shadow: v })} />
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
          <Slider label="Border radius" max={24} value={draft.components?.card_border_radius ?? 12} onChange={(v) => patch('components', { card_border_radius: v })} />
          <Slider label="Backdrop blur" max={48} value={draft.components?.card_backdrop_blur ?? 24} onChange={(v) => patch('components', { card_backdrop_blur: v })} />
          <Slider label="Border width" max={4} value={draft.components?.card_border_width ?? 1} onChange={(v) => patch('components', { card_border_width: v })} />
          <Slider label="Padding" max={32} value={draft.components?.card_padding ?? 16} onChange={(v) => patch('components', { card_padding: v })} />
        </div>
      </div>

      <div className="rounded-lg border border-white/10 bg-black/20 p-4 space-y-4">
        <Label label="Card Strong" hint="Stronger variant for modals, dropdowns." />
        <ColorField label="Background" value={draft.components?.card_strong_background ?? 'rgba(255,255,255,0.07)'} onChange={(v) => patch('components', { card_strong_background: v })} />
        <ColorField label="Border color" value={draft.components?.card_strong_border_color ?? 'rgba(255,255,255,0.15)'} onChange={(v) => patch('components', { card_strong_border_color: v })} />
        <ColorField label="Shadow" value={draft.components?.card_strong_shadow ?? '0 8px 32px rgba(0,0,0,0.6)'} onChange={(v) => patch('components', { card_strong_shadow: v })} />
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
          <Slider label="Border radius" max={24} value={draft.components?.card_strong_border_radius ?? 12} onChange={(v) => patch('components', { card_strong_border_radius: v })} />
          <Slider label="Backdrop blur" max={48} value={draft.components?.card_strong_backdrop_blur ?? 40} onChange={(v) => patch('components', { card_strong_backdrop_blur: v })} />
        </div>
      </div>

      <div className="rounded-lg border border-white/10 bg-black/20 p-4 space-y-4">
        <Label label="Dropdown / Menu" hint="Floating dropdown panels." />
        <ColorField label="Background" value={draft.components?.dropdown_bg ?? 'rgba(12,14,18,0.22)'} onChange={(v) => patch('components', { dropdown_bg: v })} />
        <ColorField label="Border color" value={draft.components?.dropdown_border_color ?? 'rgba(255,255,255,0.18)'} onChange={(v) => patch('components', { dropdown_border_color: v })} />
        <ColorField label="Shadow" value={draft.components?.dropdown_shadow ?? '0 12px 40px rgba(0,0,0,0.55)'} onChange={(v) => patch('components', { dropdown_shadow: v })} />
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
          <Slider label="Backdrop blur" max={48} value={draft.components?.dropdown_backdrop_blur ?? 40} onChange={(v) => patch('components', { dropdown_backdrop_blur: v })} />
          <Slider label="Border radius" max={24} value={draft.components?.dropdown_border_radius ?? 10} onChange={(v) => patch('components', { dropdown_border_radius: v })} />
          <Slider label="Padding" max={24} value={draft.components?.dropdown_padding ?? 8} onChange={(v) => patch('components', { dropdown_padding: v })} />
        </div>
      </div>

      <div className="rounded-lg border border-white/10 bg-black/20 p-4 space-y-4">
        <Label label="Modal / Dialog" hint="Overlay modals and dialogs." />
        <ColorField label="Background" value={draft.components?.modal_bg ?? 'rgba(255,255,255,0.07)'} onChange={(v) => patch('components', { modal_bg: v })} />
        <ColorField label="Border color" value={draft.components?.modal_border_color ?? 'rgba(255,255,255,0.15)'} onChange={(v) => patch('components', { modal_border_color: v })} />
        <ColorField label="Shadow" value={draft.components?.modal_shadow ?? '0 20px 60px rgba(0,0,0,0.6)'} onChange={(v) => patch('components', { modal_shadow: v })} />
        <ColorField label="Overlay color" value={draft.components?.modal_overlay_color ?? 'rgba(0,0,0,0.6)'} onChange={(v) => patch('components', { modal_overlay_color: v })} />
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
          <Slider label="Border radius" max={24} value={draft.components?.modal_border_radius ?? 12} onChange={(v) => patch('components', { modal_border_radius: v })} />
          <Slider label="Backdrop blur" max={48} value={draft.components?.modal_backdrop_blur ?? 24} onChange={(v) => patch('components', { modal_backdrop_blur: v })} />
          <Slider label="Max width" max={800} value={draft.components?.modal_max_width ?? 400} onChange={(v) => patch('components', { modal_max_width: v })} />
        </div>
      </div>

      <div className="rounded-lg border border-white/10 bg-black/20 p-4 space-y-4">
        <Label label="Tab Pills" hint="Tab navigation pills." />
        <ColorField label="Active background" value={draft.components?.tab_active_bg ?? '#ffffff'} onChange={(v) => patch('components', { tab_active_bg: v })} />
        <ColorField label="Active text color" value={draft.components?.tab_active_text_color ?? '#000000'} onChange={(v) => patch('components', { tab_active_text_color: v })} />
        <ColorField label="Inactive background" value={draft.components?.tab_inactive_bg ?? 'transparent'} onChange={(v) => patch('components', { tab_inactive_bg: v })} />
        <ColorField label="Inactive text color" value={draft.components?.tab_inactive_text_color ?? '#d1d5db'} onChange={(v) => patch('components', { tab_inactive_text_color: v })} />
        <ColorField label="Hover background" value={draft.components?.tab_hover_bg ?? '#ffffff'} onChange={(v) => patch('components', { tab_hover_bg: v })} />
        <ColorField label="Hover text color" value={draft.components?.tab_hover_text_color ?? '#000000'} onChange={(v) => patch('components', { tab_hover_text_color: v })} />
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
          <Slider label="Border radius" max={24} value={draft.components?.tab_border_radius ?? 5} onChange={(v) => patch('components', { tab_border_radius: v })} />
          <Slider label="Padding X" max={24} value={draft.components?.tab_padding_x ?? 8} onChange={(v) => patch('components', { tab_padding_x: v })} />
          <Slider label="Padding Y" max={20} value={draft.components?.tab_padding_y ?? 6} onChange={(v) => patch('components', { tab_padding_y: v })} />
          <Slider label="Font size" min={10} max={20} value={draft.components?.tab_font_size ?? 14} onChange={(v) => patch('components', { tab_font_size: v })} />
        </div>
      </div>

      <div className="rounded-lg border border-white/10 bg-black/20 p-4 space-y-3">
        <Label label="Preview" hint="Live sample of components." />
        <div className="flex flex-wrap items-center gap-3">
          <div className="ks-card rounded-xl p-4 min-w-[200px]">Card</div>
          <div className="ks-card rounded-xl p-4 min-w-[200px]" style={{ borderWidth: 2, borderColor: 'rgba(255,255,255,0.2)' }}>Card Strong</div>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <div className="ks-dropdown p-4 min-w-[200px]">Dropdown</div>
          <div className="ks-modal-card rounded-xl p-4 min-w-[200px]">Modal</div>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex gap-1">
            <button className="ks-tab ks-tab-active">Active</button>
            <button className="ks-tab">Inactive</button>
          </div>
        </div>
      </div>
    </GlassCard>
  );
};