import React from 'react';
import { Select, ColorField, Label, Text, Slider, MediaField } from '@/theme/studioControls';

interface DropdownsTabProps {
  draft: any;
  patch: (section: 'dropdowns', p: Record<string, any>) => void;
}

export const DropdownsTab: React.FC<DropdownsTabProps> = ({ draft, patch }) => {
  return (
    <div className="space-y-4">
      <div className="ks-form-card rounded-lg space-y-4">
        <Label label="Backdrop" hint="Frosted panel that pops open from the card 3-dot menu, the header account menu, the Themes 'Apply to…' picker, and every inline filter dropdown in admin pages." />
        <Select
          label="Backdrop type"
          value={draft.dropdowns.bg_type || 'color'}
          options={[
            { label: 'Solid color', value: 'color' },
            { label: 'Image (png · jpg · gif · webp)', value: 'image' },
            { label: 'Video (mp4 · gif)', value: 'video' },
            { label: 'CSS gradient (multi-color)', value: 'gradient' },
          ]}
          onChange={(v) => patch('dropdowns', { bg_type: v as any })}
        />
        {draft.dropdowns.bg_type === 'color' && (
          <ColorField
            label="Backdrop color"
            value={draft.dropdowns.background}
            onChange={(v) => patch('dropdowns', { background: v })}
          />
        )}
        {draft.dropdowns.bg_type === 'image' && (
          <MediaField
            label="Backdrop image URL or file (png · jpg · gif · webp)"
            accept="image/png,image/jpeg,image/gif,image/webp"
            value={draft.dropdowns.bg_image || ''}
            onChange={(v) => patch('dropdowns', { bg_image: v })}
          />
        )}
        {draft.dropdowns.bg_type === 'video' && (
          <MediaField
            label="Backdrop video URL or file (mp4 · gif)"
            accept="video/mp4,image/gif"
            value={draft.dropdowns.bg_video || ''}
            onChange={(v) => patch('dropdowns', { bg_video: v })}
          />
        )}
        {draft.dropdowns.bg_type === 'gradient' && (
          <Text
            label="Backdrop CSS gradient"
            value={draft.dropdowns.bg_gradient || ''}
            onChange={(v) => patch('dropdowns', { bg_gradient: v })}
            mono
            placeholder="linear-gradient(135deg, #0f172a, #1e1b4b)"
          />
        )}
        {(draft.dropdowns.bg_type === 'image' || draft.dropdowns.bg_type === 'gradient' || draft.dropdowns.bg_type === 'video') && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Slider
              label="Backdrop opacity"
              min={0}
              max={1}
              step={0.05}
              suffix=""
              value={draft.dropdowns.bg_opacity ?? 1}
              onChange={(v) => patch('dropdowns', { bg_opacity: v })}
            />
            <Slider
              label="Backdrop blur"
              min={0}
              max={40}
              value={draft.dropdowns.bg_blur ?? 0}
              onChange={(v) => patch('dropdowns', { bg_blur: v })}
            />
          </div>
        )}
      </div>

      <div className="ks-form-card rounded-lg space-y-4">
        <Label label="Chrome" hint="Border / radius / shadow / padding / minimum width / backdrop blur." />
        <ColorField
          label="Border color"
          value={draft.dropdowns.border_color}
          onChange={(v) => patch('dropdowns', { border_color: v })}
        />
        <Text
          label="Box shadow (CSS)"
          value={draft.dropdowns.shadow}
          onChange={(v) => patch('dropdowns', { shadow: v })}
          mono
          placeholder="0 12px 40px rgba(0,0,0,0.55)"
        />
        <ColorField
          label="Header separator (identity block divider)"
          value={draft.dropdowns.header_separator}
          onChange={(v) => patch('dropdowns', { header_separator: v })}
        />
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Slider
            label="Border width"
            min={0}
            max={4}
            value={draft.dropdowns.border_width}
            onChange={(v) => patch('dropdowns', { border_width: v })}
          />
          <Slider
            label="Border radius"
            max={24}
            value={draft.dropdowns.border_radius}
            onChange={(v) => patch('dropdowns', { border_radius: v })}
          />
          <Slider
            label="Backdrop blur"
            min={0}
            max={60}
            value={draft.dropdowns.backdrop_blur}
            onChange={(v) => patch('dropdowns', { backdrop_blur: v })}
          />
          <Slider
            label="Outer padding"
            max={16}
            value={draft.dropdowns.padding}
            onChange={(v) => patch('dropdowns', { padding: v })}
          />
          <Slider
            label="Min width"
            max={400}
            step={8}
            value={draft.dropdowns.min_width}
            onChange={(v) => patch('dropdowns', { min_width: v })}
          />
          <Slider
            label="Font size"
            min={11}
            max={16}
            value={draft.dropdowns.font_size}
            onChange={(v) => patch('dropdowns', { font_size: v })}
          />
        </div>
      </div>

      <div className="ks-form-card rounded-lg space-y-4">
        <Label label="Item rows" hint="Default row fill / text + padding / gap between icon and label." />
        <ColorField
          label="Item text color"
          value={draft.dropdowns.item_text_color}
          onChange={(v) => patch('dropdowns', { item_text_color: v })}
        />
        <ColorField
          label="Item hover background"
          value={draft.dropdowns.item_hover_background}
          onChange={(v) => patch('dropdowns', { item_hover_background: v })}
        />
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Slider
            label="Item padding X"
            max={24}
            value={draft.dropdowns.item_padding_x}
            onChange={(v) => patch('dropdowns', { item_padding_x: v })}
          />
          <Slider
            label="Item padding Y"
            max={16}
            value={draft.dropdowns.item_padding_y}
            onChange={(v) => patch('dropdowns', { item_padding_y: v })}
          />
          <Slider
            label="Icon ↔ label gap"
            max={16}
            value={draft.dropdowns.item_gap}
            onChange={(v) => patch('dropdowns', { item_gap: v })}
          />
        </div>
      </div>

      <div className="ks-form-card rounded-lg space-y-4">
        <Label label="Danger rows" hint="Destructive items (Delete / Remove) get their own colour pair." />
        <ColorField
          label="Danger text color"
          value={draft.dropdowns.danger_text_color}
          onChange={(v) => patch('dropdowns', { danger_text_color: v })}
        />
        <ColorField
          label="Danger hover background"
          value={draft.dropdowns.danger_hover_background}
          onChange={(v) => patch('dropdowns', { danger_hover_background: v })}
        />
      </div>

      <div className="ks-form-card rounded-lg space-y-3">
        <Label label="Preview" hint="Live sample of a dropdown panel (account menu style)." />
        <div className="flex flex-wrap items-start gap-4">
          <button type="button" className="ks-icon-btn ks-dropdown-trigger" title="Account menu">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="8" r="4" />
              <path d="M4 21a8 8 0 0 1 16 0" />
            </svg>
          </button>
          <div className="glass-dropdown min-w-[240px]">
            <div className="ks-dropdown-header px-3 py-2.5">
              <p className="text-sm font-semibold text-white">Signed in as admin</p>
              <p className="text-[11px] text-gray-400">admin@example.com</p>
            </div>
            <div className="py-1">
              <button type="button" className="ks-dropdown-item w-full flex items-center text-left">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="w-3.5 h-3.5"><circle cx="12" cy="8" r="4" /><path d="M4 21a8 8 0 0 1 16 0" /> </svg>
                <span className="flex-1">Profile</span>
              </button>
              <button type="button" className="ks-dropdown-item w-full flex items-center text-left">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="w-3.5 h-3.5"><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" /> </svg>
                <span className="flex-1">Preferences</span>
              </button>
              <div className="rich-separator my-1" style={{ height: 1, background: 'var(--ks-dropdown-header-sep)' }} />
              <button type="button" className="ks-dropdown-item is-danger w-full flex items-center text-left">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="w-3.5 h-3.5"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><polyline points="16 17 21 12 16 7" /><line x1="21" y1="12" x2="9" y2="12" /> </svg>
                <span className="flex-1">Sign out</span>
              </button>
            </div>
          </div>

          <div className="glass-dropdown min-w-[220px]">
            <div className="p-3 space-y-3">
              <div>
                <p className="text-xs text-gray-400 uppercase tracking-wide mb-1.5">Driver</p>
                <select className="w-full bg-black/30 border border-white/10 rounded-md text-sm text-gray-200 px-2 py-1.5">
                  <option>All drivers</option>
                  <option>Docker</option>
                  <option>LXD</option>
                </select>
              </div>
              <div>
                <p className="text-xs text-gray-400 uppercase tracking-wide mb-1.5">Sort by</p>
                <select className="w-full bg-black/30 border border-white/10 rounded-md text-sm text-gray-200 px-2 py-1.5">
                  <option>Recently updated</option>
                  <option>Newest first</option>
                </select>
              </div>
            </div>
          </div>

          <div className="glass-dropdown min-w-[176px]">
            <div className="py-1">
              <button type="button" className="ks-dropdown-item w-full flex items-center text-left">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="w-3.5 h-3.5"><path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z" /> </svg>
                <span className="flex-1">Edit</span>
              </button>
              <button type="button" className="ks-dropdown-item w-full flex items-center text-left">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="w-3.5 h-3.5"><rect x="9" y="9" width="13" height="13" rx="2" /><path d="M5 15V5a2 2 0 0 1 2-2h10" /> </svg>
                <span className="flex-1">Duplicate</span>
              </button>
              <button type="button" className="ks-dropdown-item is-danger w-full flex items-center text-left">
                <svg xmlns="http://www.w3.org/2000.svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="w-3.5 h-3.5"><polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" /> </svg>
                <span className="flex-1">Delete</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};