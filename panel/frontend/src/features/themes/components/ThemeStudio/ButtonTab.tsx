import React from 'react';
import { ColorField, Label, Text, Slider } from '@/theme/studioControls';

interface ButtonTabProps {
  draft: any;
  patch: (section: 'button', p: Record<string, any>) => void;
}

export const ButtonTab: React.FC<ButtonTabProps> = ({ draft, patch }) => {
  return (
    <div className="space-y-4">
        <div className="ks-form-card rounded-lg space-y-4">
          <Label label="Primary button (Create / Save / Activate)" hint="High-emphasis solid fill." />
          <ColorField label="Background" value={draft.button.background} onChange={(v) => patch('button', { background: v })} />
          <ColorField label="Text color" value={draft.button.text_color} onChange={(v) => patch('button', { text_color: v })} />
          <ColorField label="Hover background" value={draft.button.hover_background} onChange={(v) => patch('button', { hover_background: v })} />
          <Text label="Border (CSS, or 'none')" value={draft.button.border} onChange={(v) => patch('button', { border: v })} mono placeholder="none" />
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
            <Slider label="Border radius" max={24} value={draft.button.border_radius} onChange={(v) => patch('button', { border_radius: v })} />
            <Slider label="Padding X" max={24} value={draft.button.padding_x} onChange={(v) => patch('button', { padding_x: v })} />
            <Slider label="Padding Y" max={20} value={draft.button.padding_y} onChange={(v) => patch('button', { padding_y: v })} />
            <Slider label="Font size" min={10} max={20} value={draft.button.font_size} onChange={(v) => patch('button', { font_size: v })} />
          </div>
        </div>

        <div className="ks-form-card rounded-lg space-y-4">
          <Label label="Ghost button (Cancel / secondary)" hint="Transparent with a faint border + hover wash." />
          <ColorField label="Background" value={draft.button.ghost_background} onChange={(v) => patch('button', { ghost_background: v })} />
          <ColorField label="Text color" value={draft.button.ghost_text_color} onChange={(v) => patch('button', { ghost_text_color: v })} />
          <ColorField label="Hover background" value={draft.button.ghost_hover_background} onChange={(v) => patch('button', { ghost_hover_background: v })} />
          <Text label="Border (CSS)" value={draft.button.ghost_border} onChange={(v) => patch('button', { ghost_border: v })} mono placeholder="1px solid rgba(255,255,255,0.1)" />
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
            <Slider label="Border radius" max={24} value={draft.button.ghost_border_radius} onChange={(v) => patch('button', { ghost_border_radius: v })} />
            <Slider label="Padding X" max={24} value={draft.button.ghost_padding_x} onChange={(v) => patch('button', { ghost_padding_x: v })} />
            <Slider label="Padding Y" max={20} value={draft.button.ghost_padding_y} onChange={(v) => patch('button', { ghost_padding_y: v })} />
            <Slider label="Font size" min={10} max={20} value={draft.button.ghost_font_size} onChange={(v) => patch('button', { ghost_font_size: v })} />
          </div>
        </div>

        <div className="ks-form-card rounded-lg space-y-4">
          <Label label="Icon button (Filter / New / Upload)" hint="Square translucent pills used in page headers." />
          <ColorField label="Background" value={draft.button.icon_background} onChange={(v) => patch('button', { icon_background: v })} />
          <ColorField label="Icon color" value={draft.button.icon_text_color} onChange={(v) => patch('button', { icon_text_color: v })} />
          <ColorField label="Hover background" value={draft.button.icon_hover_background} onChange={(v) => patch('button', { icon_hover_background: v })} />
          <Text label="Border (CSS)" value={draft.button.icon_border} onChange={(v) => patch('button', { icon_border: v })} mono placeholder="none" />
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Slider label="Border radius" max={24} value={draft.button.icon_border_radius} onChange={(v) => patch('button', { icon_border_radius: v })} />
            <Slider label="Padding" max={24} value={draft.button.icon_padding} onChange={(v) => patch('button', { icon_padding: v })} />
            <Slider label="Icon size" min={12} max={32} value={draft.button.icon_size} onChange={(v) => patch('button', { icon_size: v })} />
          </div>
        </div>

        <div className="ks-form-card rounded-lg space-y-3">
          <Label label="Preview" hint="Live sample of every button variant." />
          <div className="flex flex-wrap items-center gap-3">
            <button type="button" className="ks-primary-btn">Save</button>
            <button type="button" className="ks-ghost-btn">Cancel</button>
            <button type="button" className="ks-icon-btn" title="Filter">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
              </svg>
            </button>
            <button type="button" className="ks-icon-btn" title="New">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="12" y1="5" x2="12" y2="19" />
                <line x1="5" y1="12" x2="19" y2="12" />
              </svg>
            </button>
          </div>
        </div>
    </div>
  );
};