import React from 'react';
import GlassCard from '@/shared/components/ui/Card';
import { ColorField } from '@/theme/studioControls';

interface AccentTabProps {
  draft: any;
  patch: (section: 'accent', p: Record<string, any>) => void;
}

export const AccentTab: React.FC<AccentTabProps> = ({ draft, patch }) => {
  return (
    <GlassCard variant="form" className="space-y-4">
      <ColorField label="Primary" value={draft.accent.primary} onChange={(v) => patch('accent', { primary: v })} />
      <ColorField label="Danger" value={draft.accent.danger} onChange={(v) => patch('accent', { danger: v })} />
      <ColorField label="Success" value={draft.accent.success} onChange={(v) => patch('accent', { success: v })} />
      <ColorField label="Warning" value={draft.accent.warning} onChange={(v) => patch('accent', { warning: v })} />
      <ColorField
        label="Info"
        hint="Sky/blue family — info chips, links, charts and the terminal's blue."
        value={draft.accent?.info ?? '#38bdf8'}
        onChange={(v) => patch('accent', { info: v })}
      />
    </GlassCard>
  );
};