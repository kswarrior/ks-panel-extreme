import React from 'react';
import GlassCard from '@/shared/components/ui/Card';
import { ColorField, Text, Slider } from '@/theme/studioControls';

interface TypographyTabProps {
  draft: any;
  patch: (section: 'typography', p: Record<string, any>) => void;
}

export const TypographyTab: React.FC<TypographyTabProps> = ({ draft, patch }) => {
  return (
    <GlassCard variant="form" className="space-y-4">
      <Text label="Font family" value={draft.typography.font_family} onChange={(v) => patch('typography', { font_family: v })} mono />
      <ColorField label="Heading color" value={draft.typography.heading_color} onChange={(v) => patch('typography', { heading_color: v })} />
      <ColorField label="Body color" value={draft.typography.body_color} onChange={(v) => patch('typography', { body_color: v })} />
      <ColorField label="Link color" value={draft.typography.link_color} onChange={(v) => patch('typography', { link_color: v })} />
      {/* Root rem scale — Tailwind text-* utilities are rem-based, so this
          rescales every label/heading panel-wide (10–22 keeps layouts sane). */}
      <Slider
        label="Base size"
        min={10}
        max={22}
        suffix="px"
        value={draft.typography.base_size ?? 14}
        onChange={(v) => patch('typography', { base_size: v })}
      />
    </GlassCard>
  );
};