import React from 'react';
import { ColorField, Label, Slider, Select, Text, MediaField } from '@/theme/studioControls';
import { DEFAULT_THEME } from '@/theme/defaults';

// Variant groups (list / stat / form) own the `cards` section; the
// base-glass group edits the DEDICATED `card` section (same values as the
// Card tab); strong-glass and chrome edit their canonical homes in
// `components`.
type CardsSection = 'cards' | 'card' | 'components';

interface CardsTabProps {
  draft: any;
  patch: (section: CardsSection, p: Record<string, any>) => void;
}

const D = DEFAULT_THEME;
// inh shows an "inherit" placeholder while a token still holds its default
// (= follows the live Card tab at runtime); clearing the field does the same.
const inh = (v: string | undefined, d: string): string => (v == null || v === d ? '' : v);

export const CardsTab: React.FC<CardsTabProps> = ({ draft, patch }) => {
  return (
    <GlassCard className="space-y-4">
      <div className="ks-form-card rounded-lg space-y-4">
        <Label label="List Card (ks-list-card)" hint="Cards in grids/lists. Defaults follow the Card tab until changed." />
        <ColorField label="Background" value={inh(draft.cards?.list_background, D.cards.list_background)} onChange={(v) => patch('cards', { list_background: v })} placeholder="Follow Card tab" />
        <ColorField label="Border color" value={inh(draft.cards?.list_border_color, D.cards.list_border_color)} onChange={(v) => patch('cards', { list_border_color: v })} placeholder="Follow Card tab" />
        <ColorField label="Hover border color" value={inh(draft.cards?.list_hover_border_color, D.cards.list_hover_border_color)} onChange={(v) => patch('cards', { list_hover_border_color: v })} placeholder="Follow Card tab" />
        <ColorField label="Shadow" value={inh(draft.cards?.list_shadow, D.cards.list_shadow)} onChange={(v) => patch('cards', { list_shadow: v })} placeholder="Follow Card tab" />
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
          <Slider label="Border radius" max={24} value={draft.cards?.list_border_radius ?? D.cards.list_border_radius} onChange={(v) => patch('cards', { list_border_radius: v })} />
          <Slider label="Backdrop blur" max={48} value={draft.cards?.list_backdrop_blur ?? D.cards.list_backdrop_blur} onChange={(v) => patch('cards', { list_backdrop_blur: v })} />
          <Slider label="Padding" max={32} value={draft.cards?.list_padding ?? D.cards.list_padding} onChange={(v) => patch('cards', { list_padding: v })} />
        </div>
      </div>

      <div className="ks-form-card rounded-lg space-y-4">
        <Label label="Stat Card (ks-stat-card)" hint="Statistic cards in header strips." />
        <ColorField label="Background" value={inh(draft.cards?.stat_background, D.cards.stat_background)} onChange={(v) => patch('cards', { stat_background: v })} placeholder="Follow Card tab" />
        <ColorField label="Border color" value={inh(draft.cards?.stat_border_color, D.cards.stat_border_color)} onChange={(v) => patch('cards', { stat_border_color: v })} placeholder="Follow Card tab" />
        <ColorField label="Icon color" value={draft.cards?.stat_icon_color ?? D.cards.stat_icon_color} onChange={(v) => patch('cards', { stat_icon_color: v })} />
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
          <Slider label="Border radius" max={24} value={draft.cards?.stat_border_radius ?? D.cards.stat_border_radius} onChange={(v) => patch('cards', { stat_border_radius: v })} />
          <Slider label="Padding X" max={24} value={draft.cards?.stat_padding_x ?? D.cards.stat_padding_x} onChange={(v) => patch('cards', { stat_padding_x: v })} />
          <Slider label="Padding Y" max={20} value={draft.cards?.stat_padding_y ?? D.cards.stat_padding_y} onChange={(v) => patch('cards', { stat_padding_y: v })} />
        </div>
      </div>

      <div className="ks-form-card rounded-lg space-y-4">
        <Label label="Form Card (ks-form-card)" hint="Form sections, settings panels." />
        <ColorField label="Background" value={inh(draft.cards?.form_background, D.cards.form_background)} onChange={(v) => patch('cards', { form_background: v })} placeholder="Follow Card tab" />
        <ColorField label="Border color" value={inh(draft.cards?.form_border_color, D.cards.form_border_color)} onChange={(v) => patch('cards', { form_border_color: v })} placeholder="Follow Card tab" />
        <ColorField label="Shadow" value={inh(draft.cards?.form_shadow, D.cards.form_shadow)} onChange={(v) => patch('cards', { form_shadow: v })} placeholder="Follow Card tab" />
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
          <Slider label="Border radius" max={24} value={draft.cards?.form_border_radius ?? D.cards.form_border_radius} onChange={(v) => patch('cards', { form_border_radius: v })} />
          <Slider label="Padding" max={32} value={draft.cards?.form_padding ?? D.cards.form_padding} onChange={(v) => patch('cards', { form_padding: v })} />
        </div>
      </div>

      <div className="ks-form-card rounded-lg space-y-4">
        <Label label="Glass Card (base .glass-card)" hint="Edits the same values as every card — single source of truth for the whole panel." />
        <Select
          label="Card background type"
          value={draft.card?.bg_type ?? 'color'}
          options={[
            { label: 'Solid color', value: 'color' },
            { label: 'Image (png · jpg · gif · webp)', value: 'image' },
            { label: 'Video (mp4 · gif)', value: 'video' },
            { label: 'CSS gradient (multi-color)', value: 'gradient' },
          ]}
          onChange={(v) => patch('card', { bg_type: v as any })}
        />
        {((draft.card?.bg_type ?? 'color') === 'color') && (
          <ColorField label="Background" value={draft.card?.background ?? 'rgba(255,255,255,0.04)'} onChange={(v) => patch('card', { background: v })} />
        )}
        {(draft.card?.bg_type === 'image') && (
          <MediaField
            label="Card image URL or file (png · jpg · gif · webp)"
            accept="image/png,image/jpeg,image/gif,image/webp"
            value={draft.card?.bg_image ?? ''}
            onChange={(v) => patch('card', { bg_image: v })}
          />
        )}
        {(draft.card?.bg_type === 'video') && (
          <MediaField
            label="Card video URL or file (mp4 · gif)"
            accept="video/mp4,image/gif"
            value={draft.card?.bg_video ?? ''}
            onChange={(v) => patch('card', { bg_video: v })}
          />
        )}
        {(draft.card?.bg_type === 'gradient') && (
          <Text
            label="CSS gradient"
            value={draft.card?.bg_gradient ?? ''}
            onChange={(v) => patch('card', { bg_gradient: v })}
            mono
            placeholder="linear-gradient(135deg, #1e1b4b, #0f172a)"
            hint="Combine two or more colours — e.g. linear-gradient(135deg, #ff7e5f, #feb47b)."
          />
        )}
        {(draft.card?.bg_type === 'image' || draft.card?.bg_type === 'gradient' || draft.card?.bg_type === 'video') && (
          <Slider label="Background opacity" min={0} max={1} step={0.05} suffix="" value={draft.card?.bg_opacity ?? 1} onChange={(v) => patch('card', { bg_opacity: v })} />
        )}
        {(draft.card?.bg_type === 'image') && (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <Text label="Size" value={draft.card?.bg_size ?? 'cover'} onChange={(v) => patch('card', { bg_size: v })} mono placeholder="cover" />
            <Text label="Position" value={draft.card?.bg_position ?? 'center'} onChange={(v) => patch('card', { bg_position: v })} mono placeholder="center" />
            <Select label="Repeat" value={draft.card?.bg_repeat ?? 'no-repeat'} onChange={(v) => patch('card', { bg_repeat: v as any })} options={[{ label: 'No repeat', value: 'no-repeat' }, { label: 'Repeat', value: 'repeat' }]} />
          </div>
        )}
        {(draft.card?.bg_type ?? 'color') === 'color' && (
          <>
            <ColorField label="Border color" value={draft.card?.border_color ?? 'rgba(255,255,255,0.1)'} onChange={(v) => patch('card', { border_color: v })} />
            <ColorField label="Hover border color" value={draft.card?.hover_border ?? 'rgba(255,255,255,0.2)'} onChange={(v) => patch('card', { hover_border: v })} />
            <ColorField label="Text color" value={draft.card?.text_color ?? '#ffffff'} onChange={(v) => patch('card', { text_color: v })} />
          </>
        )}
        <Select
          label="Glass style (applies to every card)"
          value={draft.card?.glass_style || 'frosted'}
          options={[
            { label: 'Frosted (translucent + blur, default)', value: 'frosted' },
            { label: 'Strong (heavier blur + saturated)', value: 'strong' },
            { label: 'Solid (opaque, no blur)', value: 'solid' },
          ]}
          onChange={(v) => patch('card', { glass_style: v as any })}
        />
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
          <Slider label="Border radius" max={24} value={draft.card?.border_radius ?? 5} onChange={(v) => patch('card', { border_radius: v })} />
          <Slider label="Backdrop blur" max={48} value={draft.card?.backdrop_blur ?? 1} onChange={(v) => patch('card', { backdrop_blur: v })} />
          <Slider label="Border width" max={4} value={draft.card?.border_width ?? 1} onChange={(v) => patch('card', { border_width: v })} />
          <Slider label="Padding" max={48} value={draft.card?.padding ?? 15} onChange={(v) => patch('card', { padding: v })} />
          <Slider label="Margin" max={32} value={draft.card?.margin ?? 0} onChange={(v) => patch('card', { margin: v })} />
          <Slider label="Gap between cards (H)" max={48} value={draft.card?.gap_h ?? 16} onChange={(v) => patch('card', { gap_h: v })} />
          <Slider label="Gap between cards (V)" max={48} value={draft.card?.gap_v ?? 16} onChange={(v) => patch('card', { gap_v: v })} />
        </div>
        <Text label="Box shadow (CSS)" value={draft.card?.shadow ?? D.card.shadow} onChange={(v) => patch('card', { shadow: v })} mono placeholder="0 8px 32px rgba(0,0,0,0.45)" />
      </div>

      <div className="ks-form-card rounded-lg space-y-4">
        <Label label="Glass Strong (.glass-strong)" hint="Stronger variant for modals/dropdowns. Defaults follow the Card tab until changed here." />
        <ColorField label="Background" value={inh(draft.components?.glass_strong_background, D.components.glass_strong_background)} onChange={(v) => patch('components', { glass_strong_background: v })} placeholder="Follow Card tab" />
        <ColorField label="Border color" value={inh(draft.components?.glass_strong_border_color, D.components.glass_strong_border_color)} onChange={(v) => patch('components', { glass_strong_border_color: v })} placeholder="Follow Card tab" />
        <ColorField label="Shadow" value={inh(draft.components?.glass_strong_shadow, D.components.glass_strong_shadow)} onChange={(v) => patch('components', { glass_strong_shadow: v })} placeholder="Follow Card tab" />
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
          <Slider label="Border radius" max={24} value={draft.components?.glass_strong_border_radius ?? D.components.glass_strong_border_radius} onChange={(v) => patch('components', { glass_strong_border_radius: v })} />
          <Slider label="Backdrop blur" max={48} value={draft.components?.glass_strong_backdrop_blur ?? D.components.glass_strong_backdrop_blur} onChange={(v) => patch('components', { glass_strong_backdrop_blur: v })} />
        </div>
      </div>

      <div className="ks-form-card rounded-lg space-y-4">
        <Label label="Glass Chrome (.glass-chrome)" hint="Standalone chrome surfaces (sidebar/header keep their own tabs)." />
        <ColorField label="Background" value={draft.components?.glass_chrome_background ?? D.components.glass_chrome_background} onChange={(v) => patch('components', { glass_chrome_background: v })} />
        <Slider label="Backdrop blur" max={48} value={draft.components?.glass_chrome_backdrop_blur ?? D.components.glass_chrome_backdrop_blur} onChange={(v) => patch('components', { glass_chrome_backdrop_blur: v })} />
        <ColorField label="Border color" value={draft.components?.glass_chrome_border_color ?? D.components.glass_chrome_border_color} onChange={(v) => patch('components', { glass_chrome_border_color: v })} />
      </div>

      <div className="ks-form-card rounded-lg space-y-3">
        <Label label="Preview" hint="Live sample of card variants." />
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
        </div>
        <div className="flex flex-wrap items-start gap-3">
          <div className="glass-card p-4 min-w-[180px]">
            <div className="text-sm font-semibold">Glass Card</div>
            <div className="text-xs text-gray-400 mt-1">Base glassmorphism</div>
          </div>
          <div className="glass-strong p-4 min-w-[180px] border border-white/15">
            <div className="text-sm font-semibold">Glass Strong</div>
          </div>
          <div className="glass-chrome p-4 min-w-[180px]">
            <div className="text-sm font-semibold">Glass Chrome</div>
          </div>
        </div>
      </div>
    </GlassCard>
  );
};
