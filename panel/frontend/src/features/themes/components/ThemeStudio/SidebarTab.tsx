import React from 'react';
import GlassCard from '@/shared/components/ui/Card';
import { ColorField, Slider } from '@/theme/studioControls';

interface SidebarTabProps {
  draft: any;
  patch: (section: 'sidebar', p: Record<string, any>) => void;
}

export const SidebarTab: React.FC<SidebarTabProps> = ({ draft, patch }) => {
  return (
    <GlassCard variant="form" className="space-y-4">
      <ColorField label="Sidebar background" value={draft.sidebar.background} onChange={(v) => patch('sidebar', { background: v })} />
      <ColorField label="Border color" value={draft.sidebar.border_color} onChange={(v) => patch('sidebar', { border_color: v })} />
      <ColorField label="Text color" value={draft.sidebar.text_color} onChange={(v) => patch('sidebar', { text_color: v })} />
      <ColorField label="Active background" value={draft.sidebar.active_background} onChange={(v) => patch('sidebar', { active_background: v })} />
      <ColorField label="Active text color" value={draft.sidebar.active_text_color} onChange={(v) => patch('sidebar', { active_text_color: v })} />
      <ColorField label="Hover background" value={draft.sidebar.hover_background} onChange={(v) => patch('sidebar', { hover_background: v })} />
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Slider label="Width" min={160} max={320} value={draft.sidebar.width} onChange={(v) => patch('sidebar', { width: v })} />
        <Slider label="Backdrop blur" max={48} value={draft.sidebar.backdrop_blur} onChange={(v) => patch('sidebar', { backdrop_blur: v })} />
      </div>
    </GlassCard>
  );
};