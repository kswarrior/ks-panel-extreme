import React from 'react';
import GlassCard from '@/shared/components/ui/Card';
import { Select, ColorSwatches, Slider, Text, MediaField } from '@/theme/studioControls';
import { BACKGROUND_COLOR_PRESETS } from '@/theme/defaults';
import type { Theme } from '@/features/themes/types/theme';

interface BackgroundTabProps {
  draft: Theme;
  patch: (section: 'background', p: Record<string, any>) => void;
}

export const BackgroundTab: React.FC<BackgroundTabProps> = ({ draft, patch }) => {
  return (
    <GlassCard className="space-y-4">
      <Select
        label="Background type"
        value={draft.background.type}
        options={[
          { label: 'Solid color', value: 'color' },
          { label: 'Image', value: 'image' },
          { label: 'Video (mp4 / gif)', value: 'video' },
          { label: 'Gradient', value: 'gradient' },
        ]}
        onChange={(v) => patch('background', { type: v as any })}
      />
      {draft.background.type === 'color' && (
        <ColorSwatches
          label="Background color"
          presets={BACKGROUND_COLOR_PRESETS}
          value={draft.background.color}
          onChange={(v) => patch('background', { color: v })}
        />
      )}
      {draft.background.type === 'image' && (
        <MediaField
          label="Image URL or file (png · jpg · gif · webp)"
          accept="image/png,image/jpeg,image/gif,image/webp"
          value={draft.background.image_url}
          onChange={(v) => patch('background', { image_url: v })}
        />
      )}
      {draft.background.type === 'video' && (
        <MediaField
          label="Video URL or file (mp4 · gif)"
          accept="video/mp4,image/gif"
          value={draft.background.video_url}
          onChange={(v) => patch('background', { video_url: v })}
        />
      )}
      {draft.background.type === 'gradient' && (
        <Text
          label="CSS gradient"
          value={draft.background.gradient}
          onChange={(v) => patch('background', { gradient: v })}
          mono
          placeholder="linear-gradient(135deg, #0f172a, #1e1b4b)"
        />
      )}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Slider label="Opacity" min={0} max={1} step={0.05} suffix="" value={draft.background.opacity} onChange={(v) => patch('background', { opacity: v })} />
        <Slider label="Blur" min={0} max={40} value={draft.background.blur} onChange={(v) => patch('background', { blur: v })} />
      </div>
      {draft.background.type === 'image' && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Select label="Attachment" value={draft.background.attachment} onChange={(v) => patch('background', { attachment: v as any })} options={[{ label: 'Fixed', value: 'fixed' }, { label: 'Scroll', value: 'scroll' }]} />
          <Select label="Repeat" value={draft.background.repeat} onChange={(v) => patch('background', { repeat: v as any })} options={[{ label: 'No repeat', value: 'no-repeat' }, { label: 'Repeat', value: 'repeat' }]} />
        </div>
      )}
    </GlassCard>
  );
};