import React from 'react';
import { ColorField, Label, Slider, Text } from '@/theme/studioControls';
import { DEFAULT_THEME } from '@/theme/defaults';

interface CountTabProps {
  draft: any;
  patch: (section: 'count', p: Record<string, any>) => void;
}

const D: any = (DEFAULT_THEME as any).count ?? {};

export const CountTab: React.FC<CountTabProps> = ({ draft, patch }) => {
  const c = draft.count ?? D;
  const showIcon = c.show_icon ?? true;

  return (
    <div className="space-y-4">
      <div className="ks-form-card rounded-lg space-y-4">
        <Label
          label="Surface"
          hint="Glass pill behind every list counter (Templates, Stacks, Tickets, Users, Roles …). One surface paints them all."
        />
        <ColorField label="Background" value={c.background ?? D.background} onChange={(v) => patch('count', { background: v })} />
        <ColorField label="Border color" value={c.border_color ?? D.border_color} onChange={(v) => patch('count', { border_color: v })} />
        <Text label="Shadow (CSS)" value={c.shadow ?? D.shadow} onChange={(v) => patch('count', { shadow: v })} mono placeholder="0 4px 16px rgba(0,0,0,0.35)" />
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
          <Slider label="Border width" max={4} value={c.border_width ?? D.border_width} onChange={(v) => patch('count', { border_width: v })} />
          <Slider label="Border radius" max={32} value={Math.min(c.border_radius ?? D.border_radius, 32)} onChange={(v) => patch('count', { border_radius: v })} />
          <Slider label="Padding X" max={24} value={c.padding_x ?? D.padding_x} onChange={(v) => patch('count', { padding_x: v })} />
          <Slider label="Padding Y" max={16} value={c.padding_y ?? D.padding_y} onChange={(v) => patch('count', { padding_y: v })} />
        </div>
        <Slider label="Backdrop blur" max={40} value={c.blur ?? D.blur} onChange={(v) => patch('count', { blur: v })} />
      </div>

      <div className="ks-form-card rounded-lg space-y-4">
        <Label label="Typography" hint="Numerals stay bright while the label sits muted — tabular numbers keep the width stable while filtering." />
        <ColorField label="Label color" value={c.text_color ?? D.text_color} onChange={(v) => patch('count', { text_color: v })} hint="The “of / templates shown” text." />
        <ColorField label="Number color" value={c.number_color ?? D.number_color} onChange={(v) => patch('count', { number_color: v })} hint="The N / M numerals." />
        <ColorField label="Divider dot" value={c.muted_color ?? D.muted_color} onChange={(v) => patch('count', { muted_color: v })} hint="The small dot between numbers and label." />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Slider label="Font size" min={10} max={18} value={c.font_size ?? D.font_size} onChange={(v) => patch('count', { font_size: v })} />
          <Slider label="Gap" max={20} value={c.gap ?? D.gap} onChange={(v) => patch('count', { gap: v })} />
        </div>
      </div>

      <div className="ks-form-card rounded-lg space-y-4">
        <Label label="Accent & icon" hint="Icon tint, divider glow and the automatic “filtered” chip shown when N ≠ M." />
        <ColorField label="Accent" value={c.accent_color ?? D.accent_color} onChange={(v) => patch('count', { accent_color: v })} hint="Icon + filtered dot." />
        <ColorField label="Filtered chip fill" value={c.accent_background ?? D.accent_background} onChange={(v) => patch('count', { accent_background: v })} />
        <ColorField label="Filtered chip text" value={c.accent_text_color ?? D.accent_text_color} onChange={(v) => patch('count', { accent_text_color: v })} />
        <label className="flex items-center gap-2 text-xs text-gray-300">
          <input
            type="checkbox"
            checked={showIcon}
            onChange={(e) => patch('count', { show_icon: e.target.checked })}
            className="ks-checkbox w-4 h-4"
          />
          Show leading icon
        </label>
        {showIcon && (
          <Slider label="Icon size" min={10} max={24} value={c.icon_size ?? D.icon_size} onChange={(v) => patch('count', { icon_size: v })} />
        )}
      </div>

      <div className="ks-form-card rounded-lg space-y-3">
        <Label label="Preview" hint="Live samples painted from this tab — full list, filtered list and a list with extra stats." />
        <div className="flex flex-wrap items-center gap-3">
          <div className="ks-count-badge">
            <span className="ks-count-icon" aria-hidden="true">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2 2 7l10 5 10-5-10-5z" /><path d="M2 12l10 5 10-5" /><path d="M2 17l10 5 10-5" /></svg>
            </span>
            <span className="ks-count-numbers">
              <strong className="ks-count-strong tabular-nums">8</strong>
              <span className="ks-count-of">of</span>
              <strong className="ks-count-strong tabular-nums">8</strong>
            </span>
            <span className="ks-count-dot" aria-hidden="true" />
            <span className="ks-count-label">templates shown</span>
          </div>
          <div className="ks-count-badge">
            <span className="ks-count-icon" aria-hidden="true">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2 2 7l10 5 10-5-10-5z" /><path d="M2 12l10 5 10-5" /><path d="M2 17l10 5 10-5" /></svg>
            </span>
            <span className="ks-count-numbers">
              <strong className="ks-count-strong tabular-nums">3</strong>
              <span className="ks-count-of">of</span>
              <strong className="ks-count-strong tabular-nums">8</strong>
            </span>
            <span className="ks-count-dot" aria-hidden="true" />
            <span className="ks-count-label">templates shown</span>
            <span className="ks-count-filter">
              <span className="ks-count-filter-dot" aria-hidden="true" />
              filtered
            </span>
          </div>
          <div className="ks-count-badge">
            <span className="ks-count-icon" aria-hidden="true">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2 2 7l10 5 10-5-10-5z" /><path d="M2 12l10 5 10-5" /><path d="M2 17l10 5 10-5" /></svg>
            </span>
            <span className="ks-count-numbers">
              <strong className="ks-count-strong tabular-nums">5</strong>
              <span className="ks-count-of">of</span>
              <strong className="ks-count-strong tabular-nums">5</strong>
            </span>
            <span className="ks-count-dot" aria-hidden="true" />
            <span className="ks-count-label">stacks shown</span>
            <span className="ks-count-dot" aria-hidden="true" />
            <span className="ks-count-extra">4 active · 1 pending</span>
          </div>
        </div>
      </div>
    </div>
  );
};
