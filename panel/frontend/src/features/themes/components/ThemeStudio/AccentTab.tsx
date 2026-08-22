import React from 'react';
import GlassCard from '@/shared/components/ui/Card';
import { ColorField } from '@/theme/studioControls';

interface AccentTabProps {
  draft: any;
  patch: (section: 'accent', p: Record<string, any>) => void;
}

export const AccentTab: React.FC<AccentTabProps> = ({ draft, patch }) => {
  return (
    <GlassCard className="space-y-4">
      <ColorField label="Primary" value={draft.accent.primary} onChange={(v) => patch('accent', { primary: v })} />
      <ColorField label="Danger" value={draft.accent.danger} onChange={(v) => patch('accent', { danger: v })} />
      <ColorField label="Success" value={draft.accent.success} onChange={(v) => patch('accent', { success: v })} />
      <ColorField label="Warning" value={draft.accent.warning} onChange={(v) => patch('accent', { warning: v })} />
    </GlassCard>
  );
};