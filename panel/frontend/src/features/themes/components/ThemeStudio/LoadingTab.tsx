import React from 'react';
import GlassCard from '@/shared/components/ui/Card';
import { Select, ColorField, Label, Text, Slider, MediaField } from '@/theme/studioControls';

interface LoadingTabProps {
  draft: any;
  patch: (section: 'loading', p: Record<string, any>) => void;
  renderLoadingPreview: (loading: any) => React.ReactNode;
}

export const LoadingTab: React.FC<LoadingTabProps> = ({ draft, patch, renderLoadingPreview }) => {
  return (
    <GlassCard variant="form" className="space-y-4">
      <Select
        label="Loading animation type"
        value={draft.loading.type}
        options={[
          { label: 'Cycle (spinning circle)', value: 'cycle' },
          { label: 'Horizontal Bar (bouncing bars)', value: 'horizontal-bar' },
          { label: 'Vertical Bar (stacked bars)', value: 'vertical-bar' },
          { label: 'Dots (pulsing dots)', value: 'dots' },
          { label: 'Pulse (single pulsing)', value: 'pulse' },
          { label: 'Wave (ripple effect)', value: 'wave' },
          { label: 'Spiral (reverse spin)', value: 'spiral' },
          { label: 'Skeleton (placeholder cards)', value: 'skeleton' },
        ]}
        onChange={(v) => patch('loading', { type: v as any })}
      />

      {draft.loading.type === 'skeleton' && (
        <div className="ks-form-card rounded-lg space-y-4">
          <div>
            <Label label="Skeleton options" hint="Placeholder cards/rows shown while data loads." />
          </div>
          <Select
            label="Skeleton type"
            value={draft.loading.skeleton_type || 'cards'}
            options={[
              { label: 'Cards (grid of content cards)', value: 'cards' },
              { label: 'List (rows with avatars)', value: 'list' },
              { label: 'Text (paragraph lines)', value: 'text' },
              { label: 'Avatar (circular placeholders)', value: 'avatar' },
              { label: 'Mixed (alternating layouts)', value: 'mixed' },
            ]}
            onChange={(v) => patch('loading', { skeleton_type: v as any })}
          />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Slider
              label="Skeleton card count"
              min={1}
              max={12}
              value={draft.loading.skeleton_count ?? 3}
              suffix=""
              onChange={(v) => patch('loading', { skeleton_count: v })}
            />
            <Slider
              label="Lines per card"
              min={1}
              max={8}
              value={draft.loading.skeleton_lines ?? 3}
              suffix=""
              onChange={(v) => patch('loading', { skeleton_lines: v })}
            />
            <Select
              label="Animation speed"
              value={draft.loading.skeleton_speed || 'normal'}
              options={[
                { label: 'Slow', value: 'slow' },
                { label: 'Normal', value: 'normal' },
                { label: 'Fast', value: 'fast' },
              ]}
              onChange={(v) => patch('loading', { skeleton_speed: v as any })}
            />
            <Slider
              label="Minimum interval (ms)"
              min={300}
              max={3000}
              step={100}
              suffix="ms"
              value={draft.loading.skeleton_interval ?? 1200}
              onChange={(v) => patch('loading', { skeleton_interval: v })}
            />
            <Slider
              label="Corner radius"
              min={0}
              max={24}
              value={draft.loading.skeleton_radius ?? 6}
              suffix="px"
              onChange={(v) => patch('loading', { skeleton_radius: v })}
            />
          </div>
          <ColorField
            label="Skeleton base color"
            value={draft.loading.skeleton_base_color ?? 'rgba(255,255,255,0.06)'}
            onChange={(v) => patch('loading', { skeleton_base_color: v })}
          />
          <ColorField
            label="Skeleton shimmer color"
            value={draft.loading.skeleton_shimmer_color ?? 'rgba(255,255,255,0.18)'}
            onChange={(v) => patch('loading', { skeleton_shimmer_color: v })}
          />
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Select
          label="Size"
          value={draft.loading.size}
          options={[
            { label: 'Small', value: 'sm' },
            { label: 'Medium', value: 'md' },
            { label: 'Large', value: 'lg' },
          ]}
          onChange={(v) => patch('loading', { size: v as any })}
        />
        <Select
          label="Animation speed"
          value={draft.loading.animation_speed}
          options={[
            { label: 'Slow', value: 'slow' },
            { label: 'Normal', value: 'normal' },
            { label: 'Fast', value: 'fast' },
          ]}
          onChange={(v) => patch('loading', { animation_speed: v as any })}
        />
      </div>

      <ColorField label="Loading color" value={draft.loading.color} onChange={(v) => patch('loading', { color: v })} />
      <ColorField label="Text color" value={draft.loading.text_color} onChange={(v) => patch('loading', { text_color: v })} />

      <Select
        label="Loading background type"
        value={draft.loading.bg_type || 'color'}
        options={[
          { label: 'Solid color', value: 'color' },
          { label: 'Image (png · jpg · gif · webp)', value: 'image' },
          { label: 'Video (mp4 · gif)', value: 'video' },
          { label: 'CSS gradient (multi-color)', value: 'gradient' },
        ]}
        onChange={(v) => patch('loading', { bg_type: v as any })}
      />
      {draft.loading.bg_type === 'color' && (
        <ColorField
          label="Loading background color"
          value={draft.loading.background}
          onChange={(v) => patch('loading', { background: v })}
        />
      )}
      {draft.loading.bg_type === 'image' && (
        <MediaField
          label="Loading image URL or file (png · jpg · gif · webp)"
          accept="image/png,image/jpeg,image/gif,image/webp"
          value={draft.loading.bg_image || ''}
          onChange={(v) => patch('loading', { bg_image: v })}
        />
      )}
      {draft.loading.bg_type === 'video' && (
        <MediaField
          label="Loading video URL or file (mp4 · gif)"
          accept="video/mp4,image/gif"
          value={draft.loading.bg_video || ''}
          onChange={(v) => patch('loading', { bg_video: v })}
        />
      )}
      {draft.loading.bg_type === 'gradient' && (
        <Text
          label="Loading CSS gradient"
          value={draft.loading.bg_gradient || ''}
          onChange={(v) => patch('loading', { bg_gradient: v })}
          mono
          placeholder="linear-gradient(135deg, #0f172a, #1e1b4b)"
          hint="Combine two or more colours — e.g. linear-gradient(135deg, #ff7e5f, #feb47b)."
        />
      )}
      {(draft.loading.bg_type === 'image' || draft.loading.bg_type === 'gradient' || draft.loading.bg_type === 'video') && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Slider
            label="Background opacity"
            min={0}
            max={1}
            step={0.05}
            suffix=""
            value={draft.loading.bg_opacity ?? 1}
            onChange={(v) => patch('loading', { bg_opacity: v })}
          />
          <Slider
            label="Background blur"
            min={0}
            max={40}
            value={draft.loading.bg_blur ?? 0}
            onChange={(v) => patch('loading', { bg_blur: v })}
          />
        </div>
      )}
      {draft.loading.bg_type === 'image' && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <Text
            label="Size"
            value={draft.loading.bg_size || 'cover'}
            onChange={(v) => patch('loading', { bg_size: v })}
            mono
            placeholder="cover"
          />
          <Text
            label="Position"
            value={draft.loading.bg_position || 'center'}
            onChange={(v) => patch('loading', { bg_position: v })}
            mono
            placeholder="center"
          />
          <Select
            label="Repeat"
            value={draft.loading.bg_repeat || 'no-repeat'}
            onChange={(v) => patch('loading', { bg_repeat: v as any })}
            options={[
              { label: 'No repeat', value: 'no-repeat' },
              { label: 'Repeat', value: 'repeat' },
            ]}
          />
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <label className="flex items-center gap-2 text-xs text-gray-300">
          <input
            type="checkbox"
            checked={draft.loading.show_text}
            onChange={(e) => patch('loading', { show_text: e.target.checked })}
            className="ks-checkbox w-4 h-4"
          />
          Show loading text
        </label>
        <label className="flex items-center gap-2 text-xs text-gray-300">
          <input
            type="checkbox"
            checked={draft.loading.full_screen}
            onChange={(e) => patch('loading', { full_screen: e.target.checked })}
            className="ks-checkbox w-4 h-4"
          />
          Full screen overlay
        </label>
        <label className="flex items-center gap-2 text-xs text-gray-300">
          <input
            type="checkbox"
            checked={draft.loading.show_header}
            onChange={(e) => patch('loading', { show_header: e.target.checked })}
            className="ks-checkbox w-4 h-4"
          />
          Show header
        </label>
        <label className="flex items-center gap-2 text-xs text-gray-300">
          <input
            type="checkbox"
            checked={draft.loading.show_sidebar}
            onChange={(e) => patch('loading', { show_sidebar: e.target.checked })}
            className="ks-checkbox w-4 h-4"
          />
          Show sidebar
        </label>
      </div>

      {draft.loading.show_text && (
        <Text
          label="Loading text"
          value={draft.loading.text}
          onChange={(v) => patch('loading', { text: v })}
          placeholder="Loading..."
          hint="Text shown below the loading animation"
        />
      )}

      {draft.loading.type === 'skeleton' ? (
        <div className="mt-4 p-4 rounded-lg border border-white/10 bg-black/30">
          <Label label="Live preview" hint="Placeholder cards/rows/text/avatar laid out exactly like a real loading state on a page." />
          <div className="mt-3 relative overflow-hidden rounded-lg border border-white/10" style={{ minHeight: 220 }}>
            <div
              className="absolute inset-0"
              style={{
                backgroundColor: draft.loading.background || 'rgba(15,23,42,0.65)',
                backgroundImage:
                  draft.loading.bg_type === 'image' && draft.loading.bg_image ? `url('${draft.loading.bg_image.replace(/'/g, "\\'")}')` :
                  draft.loading.bg_type === 'gradient' && draft.loading.bg_gradient ? draft.loading.bg_gradient : undefined,
                backgroundSize: draft.loading.bg_size || 'cover',
                backgroundPosition: draft.loading.bg_position || 'center',
                backgroundRepeat: draft.loading.bg_repeat || 'no-repeat',
                opacity: draft.loading.bg_opacity ?? 1,
                filter: (draft.loading.bg_blur && draft.loading.bg_blur > 0) ? `blur(${draft.loading.bg_blur}px)` : undefined,
              }}
            />
            {draft.loading.bg_type === 'video' && draft.loading.bg_video && (
              <video
                autoPlay
                muted
                loop
                playsInline
                className="absolute inset-0 w-full h-full object-cover"
                style={{
                  opacity: draft.loading.bg_opacity ?? 1,
                  filter: (draft.loading.bg_blur && draft.loading.bg_blur > 0) ? `blur(${draft.loading.bg_blur}px)` : undefined,
                }}
              >
                <source src={draft.loading.bg_video} />
              </video>
            )}
            <div className="relative w-full h-full p-4">
              {renderLoadingPreview(draft.loading)}
            </div>
            {draft.loading.show_text && (
              <div
                className="absolute bottom-3 left-0 right-0 text-center text-sm"
                style={{ color: draft.loading.text_color }}
              >
                {draft.loading.text || 'Loading...'}
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="mt-4 p-4 rounded-lg border border-white/10 bg-black/30">
          <Label label="Live preview" />
          <div className="mt-2 flex items-center justify-center min-h-[120px]">
            {draft.loading.show_text ? (
              <div className="flex flex-col items-center space-y-3">
                <div style={{ color: draft.loading.color }}>
                  {renderLoadingPreview(draft.loading)}
                </div>
                <div className="text-sm" style={{ color: draft.loading.text_color }}>
                  {draft.loading.text || 'Loading...'}
                </div>
              </div>
            ) : (
              <div style={{ color: draft.loading.color }}>
                {renderLoadingPreview(draft.loading)}
              </div>
            )}
          </div>
        </div>
      )}
    </GlassCard>
  );
};