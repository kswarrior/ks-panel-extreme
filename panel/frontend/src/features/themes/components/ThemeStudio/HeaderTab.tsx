import React from 'react';
import GlassCard from '@/shared/components/ui/Card';
import { ColorField, Slider } from '@/theme/studioControls';

interface HeaderTabProps {
  draft: any;
  patch: (section: 'header', p: Record<string, any>) => void;
}

export const HeaderTab: React.FC<HeaderTabProps> = ({ draft, patch }) => {
  return (
    <GlassCard className="space-y-4">
      <ColorField label="Header background" value={draft.header.background} onChange={(v) => patch('header', { background: v })} />
      <ColorField label="Border color" value={draft.header.border_color} onChange={(v) => patch('header', { border_color: v })} />
      <ColorField label="Text color" value={draft.header.text_color} onChange={(v) => patch('header', { text_color: v })} />
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Slider label="Height" min={40} max={96} value={draft.header.height} onChange={(v) => patch('header', { height: v })} />
        <Slider label="Backdrop blur" max={48} value={draft.header.backdrop_blur} onChange={(v) => patch('header', { backdrop_blur: v })} />
      </div>
    </GlassCard>
  );
};