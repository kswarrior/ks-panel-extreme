import React from 'react';
import GlassCard from '@/shared/components/ui/Card';
import { ColorField, Label, Slider } from '@/theme/studioControls';

interface CardsTabProps {
  draft: any;
  patch: (section: 'cards', p: Record<string, any>) => void;
}

export const CardsTab: React.FC<CardsTabProps> = ({ draft, patch }) => {
  return (
    <GlassCard className="space-y-4">
      <div className="rounded-lg border border-white/10 bg-black/20 p-4 space-y-4">
        <Label label="List Card (ks-list-card)" hint="Cards in grids/lists (instances, nodes, templates, users, roles, etc.)." />
        <ColorField label="Background" value={draft.cards?.list_background ?? 'rgba(255,255,255,0.04)'} onChange={(v) => patch('cards', { list_background: v })} />
        <ColorField label="Border color" value={draft.cards?.list_border_color ?? 'rgba(255,255,255,0.1)'} onChange={(v) => patch('cards', { list_border_color: v })} />
        <ColorField label="Hover border color" value={draft.cards?.list_hover_border_color ?? 'rgba(255,255,255,0.2)'} onChange={(v) => patch('cards', { list_hover_border_color: v })} />
        <ColorField label="Shadow" value={draft.cards?.list_shadow ?? '0 8px 32px rgba(0,0,0,0.45)'} onChange={(v) => patch('cards', { list_shadow: v })} />
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
          <Slider label="Border radius" max={24} value={draft.cards?.list_border_radius ?? 12} onChange={(v) => patch('cards', { list_border_radius: v })} />
          <Slider label="Backdrop blur" max={48} value={draft.cards?.list_backdrop_blur ?? 24} onChange={(v) => patch('cards', { list_backdrop_blur: v })} />
          <Slider label="Padding" max={32} value={draft.cards?.list_padding ?? 16} onChange={(v) => patch('cards', { list_padding: v })} />
          <Slider label="Gap H" max={32} value={draft.cards?.list_gap_h ?? 16} onChange={(v) => patch('cards', { list_gap_h: v })} />
          <Slider label="Gap V" max={32} value={draft.cards?.list_gap_v ?? 16} onChange={(v) => patch('cards', { list_gap_v: v })} />
        </div>
      </div>

      <div className="rounded-lg border border-white/10 bg-black/20 p-4 space-y-4">
        <Label label="Stat Card (ks-stat-card)" hint="Statistic cards in header strips." />
        <ColorField label="Background" value={draft.cards?.stat_background ?? 'rgba(255,255,255,0.04)'} onChange={(v) => patch('cards', { stat_background: v })} />
        <ColorField label="Border color" value={draft.cards?.stat_border_color ?? 'rgba(255,255,255,0.1)'} onChange={(v) => patch('cards', { stat_border_color: v })} />
        <ColorField label="Icon color" value={draft.cards?.stat_icon_color ?? '#ffffff'} onChange={(v) => patch('cards', { stat_icon_color: v })} />
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
          <Slider label="Border radius" max={24} value={draft.cards?.stat_border_radius ?? 12} onChange={(v) => patch('cards', { stat_border_radius: v })} />
          <Slider label="Padding X" max={24} value={draft.cards?.stat_padding_x ?? 12} onChange={(v) => patch('cards', { stat_padding_x: v })} />
          <Slider label="Padding Y" max={20} value={draft.cards?.stat_padding_y ?? 8} onChange={(v) => patch('cards', { stat_padding_y: v })} />
        </div>
      </div>

      <div className="rounded-lg border border-white/10 bg-black/20 p-4 space-y-4">
        <Label label="Form Card (ks-form-card)" hint="Form sections, settings panels." />
        <ColorField label="Background" value={draft.cards?.form_background ?? 'rgba(255,255,255,0.04)'} onChange={(v) => patch('cards', { form_background: v })} />
        <ColorField label="Border color" value={draft.cards?.form_border_color ?? 'rgba(255,255,255,0.1)'} onChange={(v) => patch('cards', { form_border_color: v })} />
        <ColorField label="Shadow" value={draft.cards?.form_shadow ?? '0 8px 32px rgba(0,0,0,0.45)'} onChange={(v) => patch('cards', { form_shadow: v })} />
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
          <Slider label="Border radius" max={24} value={draft.cards?.form_border_radius ?? 12} onChange={(v) => patch('cards', { form_border_radius: v })} />
          <Slider label="Padding" max={32} value={draft.cards?.form_padding ?? 24} onChange={(v) => patch('cards', { form_padding: v })} />
        </div>
      </div>

      <div className="rounded-lg border border-white/10 bg-black/20 p-4 space-y-4">
        <Label label="Modal Card (ks-modal-card)" hint="Modals, dropdowns, overlays." />
        <ColorField label="Background" value={draft.cards?.modal_background ?? 'rgba(255,255,255,0.07)'} onChange={(v) => patch('cards', { modal_background: v })} />
        <ColorField label="Border color" value={draft.cards?.modal_border_color ?? 'rgba(255,255,255,0.15)'} onChange={(v) => patch('cards', { modal_border_color: v })} />
        <ColorField label="Shadow" value={draft.cards?.modal_shadow ?? '0 8px 32px rgba(0,0,0,0.6)'} onChange={(v) => patch('cards', { modal_shadow: v })} />
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
          <Slider label="Border radius" max={24} value={draft.cards?.modal_border_radius ?? 12} onChange={(v) => patch('cards', { modal_border_radius: v })} />
          <Slider label="Backdrop blur" max={48} value={draft.cards?.modal_backdrop_blur ?? 40} onChange={(v) => patch('cards', { modal_backdrop_blur: v })} />
        </div>
      </div>

      <div className="rounded-lg border border-white/10 bg-black/20 p-4 space-y-4">
        <Label label="Glass Card (base .glass-card)" hint="The base glassmorphism card used everywhere." />
        <ColorField label="Background" value={draft.cards?.glass_background ?? 'rgba(255,255,255,0.04)'} onChange={(v) => patch('cards', { glass_background: v })} />
        <ColorField label="Border color" value={draft.cards?.glass_border_color ?? 'rgba(255,255,255,0.1)'} onChange={(v) => patch('cards', { glass_border_color: v })} />
        <ColorField label="Hover border color" value={draft.cards?.glass_hover_border_color ?? 'rgba(255,255,255,0.2)'} onChange={(v) => patch('cards', { glass_hover_border_color: v })} />
        <ColorField label="Shadow" value={draft.cards?.glass_shadow ?? '0 8px 32px rgba(0,0,0,0.45)'} onChange={(v) => patch('cards', { glass_shadow: v })} />
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
          <Slider label="Border radius" max={24} value={draft.cards?.glass_border_radius ?? 12} onChange={(v) => patch('cards', { glass_border_radius: v })} />
          <Slider label="Backdrop blur" max={48} value={draft.cards?.glass_backdrop_blur ?? 24} onChange={(v) => patch('cards', { glass_backdrop_blur: v })} />
          <Slider label="Border width" max={4} value={draft.cards?.glass_border_width ?? 1} onChange={(v) => patch('cards', { glass_border_width: v })} />
          <Slider label="Transition" min={0} max={500} value={draft.cards?.glass_transition ?? 200} onChange={(v) => patch('cards', { glass_transition: v })} suffix="ms" />
        </div>
      </div>

      <div className="rounded-lg border border-white/10 bg-black/20 p-4 space-y-4">
        <Label label="Glass Strong (.glass-strong)" hint="Stronger variant for modals/dropdowns." />
        <ColorField label="Background" value={draft.cards?.glass_strong_background ?? 'rgba(255,255,255,0.07)'} onChange={(v) => patch('cards', { glass_strong_background: v })} />
        <ColorField label="Border color" value={draft.cards?.glass_strong_border_color ?? 'rgba(255,255,255,0.15)'} onChange={(v) => patch('cards', { glass_strong_border_color: v })} />
        <ColorField label="Shadow" value={draft.cards?.glass_strong_shadow ?? '0 8px 32px rgba(0,0,0,0.6)'} onChange={(v) => patch('cards', { glass_strong_shadow: v })} />
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
          <Slider label="Border radius" max={24} value={draft.cards?.glass_strong_border_radius ?? 12} onChange={(v) => patch('cards', { glass_strong_border_radius: v })} />
          <Slider label="Backdrop blur" max={48} value={draft.cards?.glass_strong_backdrop_blur ?? 40} onChange={(v) => patch('cards', { glass_strong_backdrop_blur: v })} />
        </div>
      </div>

      <div className="rounded-lg border border-white/10 bg-black/20 p-4 space-y-4">
        <Label label="Glass Chrome (.glass-chrome)" hint="Sidebar/header chrome." />
        <ColorField label="Background" value={draft.cards?.glass_chrome_background ?? 'rgba(0,0,0,0.4)'} onChange={(v) => patch('cards', { glass_chrome_background: v })} />
        <ColorField label="Backdrop blur" value={draft.cards?.glass_chrome_backdrop_blur ?? 24} onChange={(v) => patch('cards', { glass_chrome_backdrop_blur: v })} />
        <ColorField label="Border color" value={draft.cards?.glass_chrome_border_color ?? 'rgba(255,255,255,0.1)'} onChange={(v) => patch('cards', { glass_chrome_border_color: v })} />
      </div>

      <div className="rounded-lg border border-white/10 bg-black/20 p-4 space-y-3">
        <Label label="Preview" hint="Live sample of all card variants." />
        <div className="flex flex-wrap items-start gap-3">
          <div className="ks-list-card p-4 min-w-[180px]">
            <div className="text-sm font-semibold">List Card</div>
            <div className="text-xs text-gray-400 mt-1">Instance, Node, Template</div>
          </div>
          <div className="ks-stat-card p-4 min-w-[120px] flex items-center gap-2">
            <span className="w-2 h-8 rounded-full bg-emerald-400"></span>
            <div><div className="text-2xl font-semibold">42</div><div className="text-xs text-gray-400">Running</div></div>
          </div>
          <div className="ks-form-card p-4 min-w-[180px]">
            <div className="text-sm font-semibold">Form Card</div>
            <div className="text-xs text-gray-400 mt-1">Settings, Forms</div>
          </div>
          <div className="ks-modal-card p-4 min-w-[180px] border border-white/15">
            <div className="text-sm font-semibold">Modal Card</div>
          </div>
        </div>
        <div className="flex flex-wrap items-start gap-3">
          <div className="glass-card p-4 min-w-[180px]">
            <div className="text-sm font-semibold">Glass Card</div>
            <div className="text-xs text-gray-400 mt-1">Base glassmorphism</div>
          </div>
          <div className="glass-strong p-4 min-w-[180px] border border-white/15">
            <div className="text-sm font-semibold">Glass Strong</div>
          </div>
          <div className="glass-chrome p-4 min-w-[180px] border border-white/10 bg-black/40">
            <div className="text-sm font-semibold">Glass Chrome</div>
          </div>
        </div>
      </div>
    </GlassCard>
  );
};