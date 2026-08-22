import React from 'react';
import GlassCard from '@/shared/components/ui/Card';
import { ColorField, Label, Slider } from '@/theme/studioControls';

interface UtilitiesTabProps {
  draft: any;
  patch: (section: 'utilities', p: Record<string, any>) => void;
}

export const UtilitiesTab: React.FC<UtilitiesTabProps> = ({ draft, patch }) => {
  return (
    <GlassCard className="space-y-4">
      <div className="rounded-lg border border-white/10 bg-black/20 p-4 space-y-4">
        <Label label="Color Utilities" hint="CSS variable color scale and utility classes." />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <ColorField label="Primary" value={draft.utilities?.color_primary ?? '#ffffff'} onChange={(v) => patch('utilities', { color_primary: v })} />
          <ColorField label="Secondary" value={draft.utilities?.color_secondary ?? '#38bdf8'} onChange={(v) => patch('utilities', { color_secondary: v })} />
          <ColorField label="Success" value={draft.utilities?.color_success ?? '#22c55e'} onChange={(v) => patch('utilities', { color_success: v })} />
          <ColorField label="Warning" value={draft.utilities?.color_warning ?? '#fbbf24'} onChange={(v) => patch('utilities', { color_warning: v })} />
          <ColorField label="Danger" value={draft.utilities?.color_danger ?? '#ef4444'} onChange={(v) => patch('utilities', { color_danger: v })} />
          <ColorField label="Muted" value={draft.utilities?.color_muted ?? '#6b7280'} onChange={(v) => patch('utilities', { color_muted: v })} />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Slider label="Primary shade steps" min={5} max={20} value={draft.utilities?.primary_steps ?? 10} onChange={(v) => patch('utilities', { primary_steps: v })} />
          <Slider label="Shade step size" min={5} max={15} value={draft.utilities?.shade_step_size ?? 10} onChange={(v) => patch('utilities', { shade_step_size: v })} />
        </div>
      </div>

      <div className="rounded-lg border border-white/10 bg-black/20 p-4 space-y-4">
        <Label label="Spacing Scale" hint="Consistent spacing tokens." />
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
          <Slider label="Base unit (px)" min={2} max={16} value={draft.utilities?.spacing_base ?? 4} onChange={(v) => patch('utilities', { spacing_base: v })} />
          <Slider label="Max multiplier" min={4} max={24} value={draft.utilities?.spacing_max_multiplier ?? 8} onChange={(v) => patch('utilities', { spacing_max_multiplier: v })} />
        </div>
      </div>

      <div className="rounded-lg border border-white/10 bg-black/20 p-4 space-y-4">
        <Label label="Border Radius Scale" hint="Consistent radius tokens." />
        <div className="grid grid-cols-1 sm:grid-cols-5 gap-4">
          <Slider label="None" min={0} max={4} value={draft.utilities?.radius_none ?? 0} onChange={(v) => patch('utilities', { radius_none: v })} />
          <Slider label="Small" min={0} max={12} value={draft.utilities?.radius_sm ?? 4} onChange={(v) => patch('utilities', { radius_sm: v })} />
          <Slider label="Medium" min={0} max={16} value={draft.utilities?.radius_md ?? 8} onChange={(v) => patch('utilities', { radius_md: v })} />
          <Slider label="Large" min={0} max={24} value={draft.utilities?.radius_lg ?? 12} onChange={(v) => patch('utilities', { radius_lg: v })} />
          <Slider label="Full" min={0} max={9999} value={draft.utilities?.radius_full ?? 9999} onChange={(v) => patch('utilities', { radius_full: v })} />
        </div>
      </div>

      <div className="rounded-lg border border-white/10 bg-black/20 p-4 space-y-4">
        <Label label="Shadow Scale" hint="Consistent elevation shadows." />
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
          <Slider label="Level 1" min={0} max={24} value={draft.utilities?.shadow_1 ?? 4} onChange={(v) => patch('utilities', { shadow_1: v })} />
          <Slider label="Level 2" min={0} max={32} value={draft.utilities?.shadow_2 ?? 8} onChange={(v) => patch('utilities', { shadow_2: v })} />
          <Slider label="Level 3" min={0} max={48} value={draft.utilities?.shadow_3 ?? 16} onChange={(v) => patch('utilities', { shadow_3: v })} />
          <Slider label="Level 4" min={0} max={64} value={draft.utilities?.shadow_4 ?? 24} onChange={(v) => patch('utilities', { shadow_4: v })} />
        </div>
      </div>

      <div className="rounded-lg border border-white/10 bg-black/20 p-4 space-y-4">
        <Label label="Transitions" hint="Global transition timing." />
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
          <Slider label="Fast (ms)" min={50} max={300} value={draft.utilities?.transition_fast ?? 150} onChange={(v) => patch('utilities', { transition_fast: v })} />
          <Slider label="Normal (ms)" min={100} max={500} value={draft.utilities?.transition_normal ?? 200} onChange={(v) => patch('utilities', { transition_normal: v })} />
          <Slider label="Slow (ms)" min={200} max={800} value={draft.utilities?.transition_slow ?? 300} onChange={(v) => patch('utilities', { transition_slow: v })} />
          <Slider label="Very slow (ms)" min={400} max={1200} value={draft.utilities?.transition_very_slow ?? 500} onChange={(v) => patch('utilities', { transition_very_slow: v })} />
        </div>
      </div>

      <div className="rounded-lg border border-white/10 bg-black/20 p-4 space-y-4">
        <Label label="Z-Index Scale" hint="Layer stacking order." />
        <div className="grid grid-cols-1 sm:grid-cols-5 gap-4">
          <Slider label="Dropdown" min={10} max={100} value={draft.utilities?.z_dropdown ?? 50} onChange={(v) => patch('utilities', { z_dropdown: v })} />
          <Slider label="Modal" min={10} max={100} value={draft.utilities?.z_modal ?? 60} onChange={(v) => patch('utilities', { z_modal: v })} />
          <Slider label="Tooltip" min={10} max={100} value={draft.utilities?.z_tooltip ?? 70} onChange={(v) => patch('utilities', { z_tooltip: v })} />
          <Slider label="Toast" min={10} max={100} value={draft.utilities?.z_toast ?? 80} onChange={(v) => patch('utilities', { z_toast: v })} />
          <Slider label="Overlay" min={10} max={100} value={draft.utilities?.z_overlay ?? 40} onChange={(v) => patch('utilities', { z_overlay: v })} />
        </div>
      </div>

      <div className="rounded-lg border border-white/10 bg-black/20 p-4 space-y-4">
        <Label label="Breakpoints" hint="Responsive breakpoints." />
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
          <Slider label="SM (px)" min={480} max={768} value={draft.utilities?.bp_sm ?? 640} onChange={(v) => patch('utilities', { bp_sm: v })} />
          <Slider label="MD (px)" min={640} max={1024} value={draft.utilities?.bp_md ?? 768} onChange={(v) => patch('utilities', { bp_md: v })} />
          <Slider label="LG (px)" min={1024} max={1440} value={draft.utilities?.bp_lg ?? 1024} onChange={(v) => patch('utilities', { bp_lg: v })} />
          <Slider label="XL (px)" min={1280} max={1920} value={draft.utilities?.bp_xl ?? 1280} onChange={(v) => patch('utilities', { bp_xl: v })} />
        </div>
      </div>

      <div className="rounded-lg border border-white/10 bg-black/20 p-4 space-y-3">
        <Label label="Preview" hint="Sample utility classes." />
        <div className="flex flex-wrap items-center gap-2">
          <div className="ks-input w-40" placeholder="Input" />
          <div className="ks-btn ks-btn-primary">Primary</div>
          <div className="ks-btn ks-btn-ghost">Ghost</div>
          <div className="ks-btn ks-btn-danger">Danger</div>
          <div className="ks-card p-4 min-w-[150px]">Card</div>
        </div>
      </div>
    </GlassCard>
  );
};