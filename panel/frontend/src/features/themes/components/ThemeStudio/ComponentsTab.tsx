import React from 'react';
import { ColorField, Label, Slider } from '@/theme/studioControls';
import { DEFAULT_THEME } from '@/theme/defaults';

// Sections this tab writes to. The Card / Dropdown / Tab groups patch the
// DEDICATED sections (single source of truth — the same values the Card,
// Dropdowns and Tabs tabs edit); only the modal + strong-glass + chrome
// controls live in `components`.
type ComponentsSection = 'components' | 'card' | 'dropdowns' | 'tabs';

interface ComponentsTabProps {
  draft: any;
  patch: (section: ComponentsSection, p: Record<string, any>) => void;
}

// inh displays an "inherit" placeholder when a strong/modal token still
// holds its default (which resolves to the live Card-tab value at runtime).
// Clearing the field stores '' which the applier treats the same way.
const D = DEFAULT_THEME;
const inh = (v: string | undefined, d: string): string => (v == null || v === d ? '' : v);

export const ComponentsTab: React.FC<ComponentsTabProps> = ({ draft, patch }) => {
  return (
    <GlassCard className="space-y-4">
      <div className="ks-form-card rounded-lg space-y-4">
        <Label label="Card / Panel" hint="Edits the same values as the Card tab." />
        <ColorField label="Background" value={draft.card?.background ?? 'rgba(255,255,255,0.04)'} onChange={(v) => patch('card', { background: v })} />
        <ColorField label="Border color" value={draft.card?.border_color ?? 'rgba(255,255,255,0.1)'} onChange={(v) => patch('card', { border_color: v })} />
        <ColorField label="Hover border color" value={draft.card?.hover_border ?? 'rgba(255,255,255,0.2)'} onChange={(v) => patch('card', { hover_border: v })} />
        <ColorField label="Shadow" value={draft.card?.shadow ?? '0 8px 32px rgba(0,0,0,0.45)'} onChange={(v) => patch('card', { shadow: v })} />
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
          <Slider label="Border radius" max={24} value={draft.card?.border_radius ?? 12} onChange={(v) => patch('card', { border_radius: v })} />
          <Slider label="Backdrop blur" max={48} value={draft.card?.backdrop_blur ?? 24} onChange={(v) => patch('card', { backdrop_blur: v })} />
          <Slider label="Border width" max={4} value={draft.card?.border_width ?? 1} onChange={(v) => patch('card', { border_width: v })} />
          <Slider label="Padding" max={32} value={draft.card?.padding ?? 16} onChange={(v) => patch('card', { padding: v })} />
        </div>
      </div>

      <div className="ks-form-card rounded-lg space-y-4">
        <Label label="Card Strong" hint="Strong glass surface for modals / dropdowns. Defaults follow the Card tab until changed here." />
        <ColorField label="Background" value={inh(draft.components?.glass_strong_background, D.components.glass_strong_background)} onChange={(v) => patch('components', { glass_strong_background: v })} placeholder="Follow Card tab" />
        <ColorField label="Border color" value={inh(draft.components?.glass_strong_border_color, D.components.glass_strong_border_color)} onChange={(v) => patch('components', { glass_strong_border_color: v })} placeholder="Follow Card tab" />
        <ColorField label="Shadow" value={inh(draft.components?.glass_strong_shadow, D.components.glass_strong_shadow)} onChange={(v) => patch('components', { glass_strong_shadow: v })} placeholder="Follow Card tab" />
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
          <Slider label="Border radius" max={24} value={draft.components?.glass_strong_border_radius ?? 12} onChange={(v) => patch('components', { glass_strong_border_radius: v })} />
          <Slider label="Backdrop blur" max={48} value={draft.components?.glass_strong_backdrop_blur ?? 40} onChange={(v) => patch('components', { glass_strong_backdrop_blur: v })} />
        </div>
      </div>

      <div className="ks-form-card rounded-lg space-y-4">
        <Label label="Dropdown / Menu" hint="Edits the same values as the Dropdowns tab." />
        <ColorField label="Background" value={draft.dropdowns?.background ?? 'rgba(12,14,18,0.22)'} onChange={(v) => patch('dropdowns', { background: v })} />
        <ColorField label="Border color" value={draft.dropdowns?.border_color ?? 'rgba(255,255,255,0.18)'} onChange={(v) => patch('dropdowns', { border_color: v })} />
        <ColorField label="Shadow" value={draft.dropdowns?.shadow ?? '0 12px 40px rgba(0,0,0,0.55)'} onChange={(v) => patch('dropdowns', { shadow: v })} />
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
          <Slider label="Backdrop blur" max={48} value={draft.dropdowns?.backdrop_blur ?? 40} onChange={(v) => patch('dropdowns', { backdrop_blur: v })} />
          <Slider label="Border radius" max={24} value={draft.dropdowns?.border_radius ?? 10} onChange={(v) => patch('dropdowns', { border_radius: v })} />
          <Slider label="Padding" max={24} value={draft.dropdowns?.padding ?? 8} onChange={(v) => patch('dropdowns', { padding: v })} />
        </div>
      </div>

      <div className="ks-form-card rounded-lg space-y-4">
        <Label label="Modal / Dialog" hint="Overlay modals and dialogs (Modal.tsx surfaces)." />
        <ColorField label="Background" value={inh(draft.components?.modal_background, D.components.modal_background)} onChange={(v) => patch('components', { modal_background: v })} placeholder="Follow Card tab" />
        <ColorField label="Border color" value={inh(draft.components?.modal_border_color, D.components.modal_border_color)} onChange={(v) => patch('components', { modal_border_color: v })} placeholder="Follow Card tab" />
        <ColorField label="Shadow" value={inh(draft.components?.modal_shadow, D.components.modal_shadow)} onChange={(v) => patch('components', { modal_shadow: v })} placeholder="Follow Card tab" />
        <ColorField label="Overlay color" value={draft.components?.modal_overlay_color ?? 'rgba(0,0,0,0.6)'} onChange={(v) => patch('components', { modal_overlay_color: v })} />
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
          <Slider label="Border radius" max={24} value={draft.components?.modal_border_radius ?? 12} onChange={(v) => patch('components', { modal_border_radius: v })} />
          <Slider label="Backdrop blur" max={48} value={draft.components?.modal_backdrop_blur ?? 24} onChange={(v) => patch('components', { modal_backdrop_blur: v })} />
          <Slider label="Max width" min={320} max={1200} value={draft.components?.modal_max_width ?? 512} onChange={(v) => patch('components', { modal_max_width: v })} />
        </div>
      </div>

      <div className="ks-form-card rounded-lg space-y-4">
        <Label label="Tab Pills" hint="Edits the same values as the Tabs tab." />
        <ColorField label="Active background" value={draft.tabs?.active_background ?? '#ffffff'} onChange={(v) => patch('tabs', { active_background: v })} />
        <ColorField label="Active text color" value={draft.tabs?.active_text_color ?? '#000000'} onChange={(v) => patch('tabs', { active_text_color: v })} />
        <ColorField label="Inactive background" value={draft.tabs?.inactive_background ?? 'transparent'} onChange={(v) => patch('tabs', { inactive_background: v })} />
        <ColorField label="Inactive text color" value={draft.tabs?.inactive_text_color ?? '#d1d5db'} onChange={(v) => patch('tabs', { inactive_text_color: v })} />
        <ColorField label="Hover background" value={draft.tabs?.hover_background ?? '#ffffff'} onChange={(v) => patch('tabs', { hover_background: v })} />
        <ColorField label="Hover text color" value={draft.tabs?.hover_text_color ?? '#000000'} onChange={(v) => patch('tabs', { hover_text_color: v })} />
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
          <Slider label="Border radius" max={24} value={draft.tabs?.border_radius ?? 5} onChange={(v) => patch('tabs', { border_radius: v })} />
          <Slider label="Padding X" max={24} value={draft.tabs?.padding_x ?? 8} onChange={(v) => patch('tabs', { padding_x: v })} />
          <Slider label="Padding Y" max={20} value={draft.tabs?.padding_y ?? 6} onChange={(v) => patch('tabs', { padding_y: v })} />
          <Slider label="Font size" min={10} max={20} value={draft.tabs?.font_size ?? 14} onChange={(v) => patch('tabs', { font_size: v })} />
        </div>
      </div>

      <div className="ks-form-card rounded-lg space-y-3">
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
