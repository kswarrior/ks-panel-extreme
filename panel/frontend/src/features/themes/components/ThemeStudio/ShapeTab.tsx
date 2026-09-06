import React from 'react';
import GlassCard from '@/shared/components/ui/Card';
import { Slider } from '@/theme/studioControls';

interface ShapeTabProps {
  draft: any;
  patch: (section: 'shape', p: Record<string, any>) => void;
}

export const ShapeTab: React.FC<ShapeTabProps> = ({ draft, patch }) => {
  return (
    <GlassCard variant="form" className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Slider label="Radius small" max={12} value={draft.shape.border_radius_sm} onChange={(v) => patch('shape', { border_radius_sm: v })} />
        <Slider label="Radius medium" max={20} value={draft.shape.border_radius_md} onChange={(v) => patch('shape', { border_radius_md: v })} />
        <Slider label="Radius large" max={32} value={draft.shape.border_radius_lg} onChange={(v) => patch('shape', { border_radius_lg: v })} />
      </div>
    </GlassCard>
  );
};