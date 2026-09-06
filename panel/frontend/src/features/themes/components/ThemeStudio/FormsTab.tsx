import React from 'react';
import { ColorField, Label, Slider } from '@/theme/studioControls';

interface FormsTabProps {
  draft: any;
  patch: (section: 'forms', p: Record<string, any>) => void;
}

export const FormsTab: React.FC<FormsTabProps> = ({ draft, patch }) => {
  return (
    <GlassCard className="space-y-4">
      <div className="ks-form-card rounded-lg space-y-4">
        <Label label="Input Fields" hint="Base styling for text inputs, textareas, selects." />
        <ColorField label="Background" value={draft.forms?.input_background ?? 'rgba(0,0,0,0.3)'} onChange={(v) => patch('forms', { input_background: v })} />
        <ColorField label="Text color" value={draft.forms?.input_text_color ?? '#ffffff'} onChange={(v) => patch('forms', { input_text_color: v })} />
        <ColorField label="Placeholder color" value={draft.forms?.input_placeholder_color ?? '#888888'} onChange={(v) => patch('forms', { input_placeholder_color: v })} />
        <ColorField label="Border color" value={draft.forms?.input_border_color ?? 'rgba(255,255,255,0.1)'} onChange={(v) => patch('forms', { input_border_color: v })} />
        <ColorField label="Focus border color" value={draft.forms?.input_focus_border_color ?? 'rgba(255,255,255,0.4)'} onChange={(v) => patch('forms', { input_focus_border_color: v })} />
        <ColorField label="Focus ring color" value={draft.forms?.input_focus_ring_color ?? 'rgba(255,255,255,0.6)'} onChange={(v) => patch('forms', { input_focus_ring_color: v })} />
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
          <Slider label="Border radius" max={24} value={draft.forms?.input_border_radius ?? 6} onChange={(v) => patch('forms', { input_border_radius: v })} />
          <Slider label="Padding X" max={24} value={draft.forms?.input_padding_x ?? 12} onChange={(v) => patch('forms', { input_padding_x: v })} />
          <Slider label="Padding Y" max={20} value={draft.forms?.input_padding_y ?? 8} onChange={(v) => patch('forms', { input_padding_y: v })} />
          <Slider label="Font size" min={10} max={20} value={draft.forms?.input_font_size ?? 14} onChange={(v) => patch('forms', { input_font_size: v })} />
        </div>
      </div>

      <div className="ks-form-card rounded-lg space-y-4">
        <Label label="Select Dropdowns" hint="Native select elements." />
        <ColorField label="Background" value={draft.forms?.select_background ?? 'rgba(0,0,0,0.3)'} onChange={(v) => patch('forms', { select_background: v })} />
        <ColorField label="Text color" value={draft.forms?.select_text_color ?? '#ffffff'} onChange={(v) => patch('forms', { select_text_color: v })} />
        <ColorField label="Border color" value={draft.forms?.select_border_color ?? 'rgba(255,255,255,0.1)'} onChange={(v) => patch('forms', { select_border_color: v })} />
        <ColorField label="Arrow color" value={draft.forms?.select_arrow_color ?? '#ffffff'} onChange={(v) => patch('forms', { select_arrow_color: v })} />
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
          <Slider label="Border radius" max={24} value={draft.forms?.select_border_radius ?? 6} onChange={(v) => patch('forms', { select_border_radius: v })} />
          <Slider label="Padding X" max={24} value={draft.forms?.select_padding_x ?? 12} onChange={(v) => patch('forms', { select_padding_x: v })} />
          <Slider label="Padding Y" max={20} value={draft.forms?.select_padding_y ?? 8} onChange={(v) => patch('forms', { select_padding_y: v })} />
          <Slider label="Font size" min={10} max={20} value={draft.forms?.select_font_size ?? 14} onChange={(v) => patch('forms', { select_font_size: v })} />
        </div>
      </div>

      <div className="ks-form-card rounded-lg space-y-4">
        <Label label="Textarea" hint="Multi-line text inputs." />
        <ColorField label="Background" value={draft.forms?.textarea_background ?? 'rgba(0,0,0,0.3)'} onChange={(v) => patch('forms', { textarea_background: v })} />
        <ColorField label="Text color" value={draft.forms?.textarea_text_color ?? '#ffffff'} onChange={(v) => patch('forms', { textarea_text_color: v })} />
        <ColorField label="Border color" value={draft.forms?.textarea_border_color ?? 'rgba(255,255,255,0.1)'} onChange={(v) => patch('forms', { textarea_border_color: v })} />
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
          <Slider label="Border radius" max={24} value={draft.forms?.textarea_border_radius ?? 6} onChange={(v) => patch('forms', { textarea_border_radius: v })} />
          <Slider label="Padding X" max={24} value={draft.forms?.textarea_padding_x ?? 12} onChange={(v) => patch('forms', { textarea_padding_x: v })} />
          <Slider label="Padding Y" max={20} value={draft.forms?.textarea_padding_y ?? 8} onChange={(v) => patch('forms', { textarea_padding_y: v })} />
          <Slider label="Font size" min={10} max={20} value={draft.forms?.textarea_font_size ?? 14} onChange={(v) => patch('forms', { textarea_font_size: v })} />
        </div>
      </div>

      <div className="ks-form-card rounded-lg space-y-4">
        <Label label="Checkbox" hint="Checkbox inputs." />
        <ColorField label="Background (unchecked)" value={draft.forms?.checkbox_bg_unchecked ?? 'rgba(0,0,0,0.3)'} onChange={(v) => patch('forms', { checkbox_bg_unchecked: v })} />
        <ColorField label="Background (checked)" value={draft.forms?.checkbox_bg_checked ?? '#22c55e'} onChange={(v) => patch('forms', { checkbox_bg_checked: v })} />
        <ColorField label="Border color (unchecked)" value={draft.forms?.checkbox_border_unchecked ?? 'rgba(255,255,255,0.2)'} onChange={(v) => patch('forms', { checkbox_border_unchecked: v })} />
        <ColorField label="Border color (checked)" value={draft.forms?.checkbox_border_checked ?? '#10b981'} onChange={(v) => patch('forms', { checkbox_border_checked: v })} />
        <ColorField label="Checkmark color" value={draft.forms?.checkbox_checkmark_color ?? '#000000'} onChange={(v) => patch('forms', { checkbox_checkmark_color: v })} />
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
          <Slider label="Border radius" max={8} value={draft.forms?.checkbox_border_radius ?? 4} onChange={(v) => patch('forms', { checkbox_border_radius: v })} />
          <Slider label="Size" max={24} value={draft.forms?.checkbox_size ?? 16} onChange={(v) => patch('forms', { checkbox_size: v })} />
        </div>
      </div>

      <div className="ks-form-card rounded-lg space-y-4">
        <Label label="Radio" hint="Radio button inputs." />
        <ColorField label="Background (unchecked)" value={draft.forms?.radio_bg_unchecked ?? 'rgba(0,0,0,0.3)'} onChange={(v) => patch('forms', { radio_bg_unchecked: v })} />
        <ColorField label="Background (checked)" value={draft.forms?.radio_bg_checked ?? '#10b981'} onChange={(v) => patch('forms', { radio_bg_checked: v })} />
        <ColorField label="Border color (unchecked)" value={draft.forms?.radio_border_unchecked ?? 'rgba(255,255,255,0.2)'} onChange={(v) => patch('forms', { radio_border_unchecked: v })} />
        <ColorField label="Border color (checked)" value={draft.forms?.radio_border_checked ?? '#10b981'} onChange={(v) => patch('forms', { radio_border_checked: v })} />
        <ColorField label="Dot color" value={draft.forms?.radio_dot_color ?? '#0b0d10'} onChange={(v) => patch('forms', { radio_dot_color: v })} />
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
          <Slider label="Size" max={24} value={draft.forms?.radio_size ?? 16} onChange={(v) => patch('forms', { radio_size: v })} />
        </div>
      </div>

      <div className="ks-form-card rounded-lg space-y-4">
        <Label label="Toggle Switch" hint="Toggle/switch inputs." />
        <ColorField label="Track (off)" value={draft.forms?.toggle_track_off ?? 'rgba(255,255,255,0.16)'} onChange={(v) => patch('forms', { toggle_track_off: v })} />
        <ColorField label="Track (on)" value={draft.forms?.toggle_track_on ?? '#38bdf8'} onChange={(v) => patch('forms', { toggle_track_on: v })} />
        <ColorField label="Thumb" value={draft.forms?.toggle_thumb_color ?? '#f8fafc'} onChange={(v) => patch('forms', { toggle_thumb_color: v })} />
        <ColorField label="Thumb shadow" value={draft.forms?.toggle_thumb_shadow ?? ''} placeholder="empty = stock shadow" onChange={(v) => patch('forms', { toggle_thumb_shadow: v })} />
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
          <Slider label="Track height" max={24} value={draft.forms?.toggle_track_height ?? 18} onChange={(v) => patch('forms', { toggle_track_height: v })} />
          <Slider label="Thumb size" max={20} value={draft.forms?.toggle_thumb_size ?? 14} onChange={(v) => patch('forms', { toggle_thumb_size: v })} />
          <Slider label="Border radius" max={24} value={draft.forms?.toggle_border_radius ?? 9999} onChange={(v) => patch('forms', { toggle_border_radius: v })} />
        </div>
      </div>

      <div className="ks-form-card rounded-lg space-y-4">
        <Label label="Form Labels" hint="Labels for form fields." />
        <ColorField label="Text color" value={draft.forms?.label_text_color ?? '#e5e7eb'} onChange={(v) => patch('forms', { label_text_color: v })} />
        <ColorField label="Hint color" value={draft.forms?.label_hint_color ?? '#888888'} onChange={(v) => patch('forms', { label_hint_color: v })} />
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Slider label="Font size" min={10} max={20} value={draft.forms?.label_font_size ?? 14} onChange={(v) => patch('forms', { label_font_size: v })} />
          <Slider label="Font weight" min={100} max={700} step={100} value={draft.forms?.label_font_weight ?? 500} onChange={(v) => patch('forms', { label_font_weight: v })} />
        </div>
      </div>

      <div className="ks-form-card rounded-lg space-y-4">
        <Label label="Hint/Help Text" hint="Helper text below form fields." />
        <ColorField label="Text color" value={draft.forms?.hint_text_color ?? '#888888'} onChange={(v) => patch('forms', { hint_text_color: v })} />
        <ColorField label="Error color" value={draft.forms?.hint_error_color ?? '#ef4444'} onChange={(v) => patch('forms', { hint_error_color: v })} />
        <ColorField label="Success color" value={draft.forms?.hint_success_color ?? '#22c55e'} onChange={(v) => patch('forms', { hint_success_color: v })} />
        <Slider label="Font size" min={10} max={16} value={draft.forms?.hint_font_size ?? 12} onChange={(v) => patch('forms', { hint_font_size: v })} />
      </div>

      <div className="ks-form-card rounded-lg space-y-4">
        <Label label="Field Wrapper" hint="Wrapper around label + input + hint." />
        <ColorField label="Background" value={draft.forms?.field_bg ?? 'transparent'} onChange={(v) => patch('forms', { field_bg: v })} />
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Slider label="Gap" max={24} value={draft.forms?.field_gap ?? 8} onChange={(v) => patch('forms', { field_gap: v })} />
          <Slider label="Margin bottom" max={24} value={draft.forms?.field_margin_bottom ?? 16} onChange={(v) => patch('forms', { field_margin_bottom: v })} />
        </div>
      </div>

      <div className="ks-form-card rounded-lg space-y-4">
        <Label label="Focus Ring" hint="Ring around focused inputs." />
        <ColorField label="Color" value={draft.forms?.input_focus_ring_color ?? 'rgba(255,255,255,0.6)'} onChange={(v) => patch('forms', { input_focus_ring_color: v })} />
        <ColorField label="Offset color" value={draft.forms?.focus_ring_offset_color ?? '#0b0d10'} onChange={(v) => patch('forms', { focus_ring_offset_color: v })} />
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Slider label="Width" max={4} value={draft.forms?.focus_ring_width ?? 2} onChange={(v) => patch('forms', { focus_ring_width: v })} />
          <Slider label="Offset" max={4} value={draft.forms?.focus_ring_offset ?? 2} onChange={(v) => patch('forms', { focus_ring_offset: v })} />
        </div>
      </div>

      <div className="ks-form-card rounded-lg space-y-3">
        <Label label="Preview" hint="Live sample of form controls." />
        <div className="flex flex-wrap items-center gap-3">
          <input type="text" className="ks-input" placeholder="Text input" />
          <input type="text" className="ks-input ks-input-sm" placeholder="Small input" />
          <input type="text" className="ks-input ks-input-lg" placeholder="Large input" />
          <select className="ks-select"><option>Select option</option></select>
          <textarea className="ks-textarea" rows={2} placeholder="Textarea"></textarea>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <label className="inline-flex items-center gap-2"><input type="checkbox" className="ks-checkbox" /> Checkbox</label>
          <label className="inline-flex items-center gap-2"><input type="radio" className="ks-radio" /> Radio</label>
          <label className="inline-flex items-center gap-2"><div className="ks-toggle"><input type="checkbox" /><span className="ks-toggle__thumb"></span></div> Toggle</label>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <input type="text" className="ks-input ks-input-error" placeholder="Error state" />
          <input type="text" className="ks-input ks-input-success" placeholder="Success state" />
          <input type="text" className="ks-input ks-input-disabled" placeholder="Disabled" disabled />
        </div>
      </div>
    </GlassCard>
  );
};