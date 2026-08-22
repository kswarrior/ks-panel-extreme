import React from 'react';
import GlassCard from '@/shared/components/ui/Card';
import { Select, ColorField, Slider, Text } from '@/theme/studioControls';

interface CardTabProps {
  draft: any;
  patch: (section: 'card', p: Record<string, any>) => void;
}

export const CardTab: React.FC<CardTabProps> = ({ draft, patch }) => {
  return (
    <>
      <GlassCard className="space-y-4">
        <Select
          label="Card background type"
          value={draft.card.bg_type}
          options={[
            { label: 'Solid color', value: 'color' },
            { label: 'Image (png · jpg · gif · webp)', value: 'image' },
            { label: 'Video (mp4 · gif)', value: 'video' },
            { label: 'CSS gradient (multi-color)', value: 'gradient' },
          ]}
          onChange={(v) => patch('card', { bg_type: v as any })}
        />
        {draft.card.bg_type === 'color' && (
          <ColorField label="Card background" value={draft.card.background} onChange={(v) => patch('card', { background: v })} />
        )}
        {draft.card.bg_type === 'image' && (
          <input
            type="text"
            className="w-full bg-black/30 border border-white/10 rounded-md px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-white/60"
            label="Card image URL or file (png · jpg · gif · webp)"
            value={draft.card.bg_image}
            onChange={(e) => patch('card', { bg_image: e.target.value })}
          />
        )}
        {draft.card.bg_type === 'video' && (
          <input
            type="text"
            className="w-full bg-black/30 border border-white/10 rounded-md px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-white/60"
            label="Card video URL or file (mp4 · gif)"
            value={draft.card.bg_video}
            onChange={(e) => patch('card', { bg_video: e.target.value })}
          />
        )}
        {draft.card.bg_type === 'gradient' && (
          <Text
            label="CSS gradient"
            value={draft.card.bg_gradient}
            onChange={(v) => patch('card', { bg_gradient: v })}
            mono
            placeholder="linear-gradient(135deg, #1e1b4b, #0f172a)"
            hint="Combine two or more colours — e.g. linear-gradient(135deg, #ff7e5f, #feb47b)."
          />
        )}
        {(draft.card.bg_type === 'image' || draft.card.bg_type === 'gradient' || draft.card.bg_type === 'video') && (
          <Slider label="Background opacity" min={0} max={1} step={0.05} suffix="" value={draft.card.bg_opacity} onChange={(v) => patch('card', { bg_opacity: v })} />
        )}
        {draft.card.bg_type === 'image' && (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <Text label="Size" value={draft.card.bg_size} onChange={(v) => patch('card', { bg_size: v })} mono placeholder="cover" />
            <Text label="Position" value={draft.card.bg_position} onChange={(v) => patch('card', { bg_position: v })} mono placeholder="center" />
            <Select label="Repeat" value={draft.card.bg_repeat} onChange={(v) => patch('card', { bg_repeat: v as any })} options={[{ label: 'No repeat', value: 'no-repeat' }, { label: 'Repeat', value: 'repeat' }]} />
          </div>
        )}
        <Select
          label="Glass style (applies to every card)"
          value={draft.card.glass_style || 'frosted'}
          options={[
            { label: 'Frosted (translucent + blur, default)', value: 'frosted' },
            { label: 'Strong (heavier blur + saturated)', value: 'strong' },
            { label: 'Solid (opaque, no blur)', value: 'solid' },
          ]}
          onChange={(v) => patch('card', { glass_style: v as any })}
        />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Slider label="Border radius" max={40} value={draft.card.border_radius} onChange={(v) => patch('card', { border_radius: v })} />
          <Slider label="Padding" max={48} value={draft.card.padding} onChange={(v) => patch('card', { padding: v })} />
          <Slider label="Margin" max={32} value={draft.card.margin} onChange={(v) => patch('card', { margin: v })} />
          <Slider label="Gap between cards (H)" max={48} value={draft.card.gap_h ?? 16} onChange={(v) => patch('card', { gap_h: v })} />
          <Slider label="Gap between cards (V)" max={48} value={draft.card.gap_v ?? 16} onChange={(v) => patch('card', { gap_v: v })} />
          <Slider label="Backdrop blur" max={48} value={draft.card.backdrop_blur} onChange={(v) => patch('card', { backdrop_blur: v })} />
          <Slider label="Border width" min={0} max={6} value={draft.card.border_width} onChange={(v) => patch('card', { border_width: v })} />
        </div>
        {draft.card.bg_type === 'color' && (
          <>
            <ColorField label="Border color" value={draft.card.border_color} onChange={(v) => patch('card', { border_color: v })} />
            <ColorField label="Hover border color" value={draft.card.hover_border} onChange={(v) => patch('card', { hover_border: v })} />
            <ColorField label="Text color" value={draft.card.text_color} onChange={(v) => patch('card', { text_color: v })} />
          </>
        )}
        <Text label="Box shadow (CSS)" value={draft.card.shadow} onChange={(v) => patch('card', { shadow: v })} mono placeholder="0 8px 32px rgba(0,0,0,0.45)" />
      </GlassCard>
    </>
  );
};