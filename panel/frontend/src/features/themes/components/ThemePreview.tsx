import React from 'react';
import type { Theme } from '../types/theme';

// ThemePreview renders a tiny scale-diagram of a theme — a mini sidebar,
// header and stacked glass cards — using the theme's raw values as inline
// styles. It is intentionally NOT driven by the live CSS custom
// properties (those reflect the *active* theme); building the preview
// straight from the passed theme object keeps every list card honest
// about what it would look like if it were applied, including drafts.
const ThemePreview: React.FC<{ theme: Theme; className?: string }> = ({ theme, className = '' }) => {
  const halfHex = (h: string) => h.length === 7 ? h + '80' : h;
  // Scale the mini sidebar width from the themed sidebar.width (160–320)
  // so the width slider is visibly reflected in the preview. Default 225
  // maps to the original 28px; extremes map to ~20px / ~40px keeping the
  // diagram readable while still showing the delta.
  const rawW = (theme.sidebar as any)?.width;
  const clampedW = Math.max(160, Math.min(320, typeof rawW === 'number' && Number.isFinite(rawW) ? rawW : 225));
  const sidebarW = Math.round(28 * clampedW / 225);

  return (
    <div
      className={`relative overflow-hidden rounded-lg border border-white/10 ${className}`}
      style={{
        height: 128,
        backgroundColor: theme.background.color,
        backgroundImage:
          theme.background.type === 'image' && theme.background.image_url
            ? `url(${theme.background.image_url})`
            : theme.background.type === 'gradient'
              ? (theme.background.gradient || undefined)
              : undefined,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
      }}
      aria-hidden="true"
    >
      {/* mini sidebar — width scales with theme.sidebar.width */}
      <div
        style={{
          position: 'absolute', top: 0, left: 0, bottom: 0,
          width: sidebarW, opacity: 0.95,
          background: theme.sidebar.background,
          borderColor: theme.sidebar.border_color,
          borderWidth: 0, borderRightWidth: 1, borderStyle: 'solid',
        }}
      >
        {[0, 1, 2].map((i) => (
          <div key={i} style={{
            height: 3, margin: '6px 3px',
            background: i === 0 ? theme.sidebar.active_background : theme.sidebar.text_color,
            opacity: i === 0 ? 1 : 0.5,
          }} />
        ))}
      </div>

      {/* mini header */}
      <div style={{
        position: 'absolute', top: 0, left: sidebarW, right: 0, height: 14,
        background: theme.header.background,
        borderColor: theme.header.border_color,
        borderBottomWidth: 1, borderStyle: 'solid',
      }} />

      {/* mini cards */}
      <div style={{ position: 'absolute', top: 22, left: sidebarW + 6, right: 6, display: 'flex', gap: 4 }}>
        {[0, 1].map((i) => (
          <div key={i} style={{
            flex: 1, height: 64,
            background: theme.card.background,
            borderColor: theme.card.border_color,
            borderWidth: theme.card.border_width, borderStyle: 'solid',
            borderRadius: Math.min(theme.card.border_radius, 8),
            boxShadow: theme.card.shadow,
          }}>
            <div style={{ height: 4, margin: '5px 5px', background: halfHex(theme.card.text_color) }} />
            <div style={{ height: 4, margin: '4px 5px', width: '70%', background: halfHex(theme.accent.primary), opacity: 0.45 }} />
            <div style={{ height: 10, margin: '5px 5px', width: '40%', background: theme.button.background, borderRadius: Math.min(theme.button.border_radius, 4) }} />
          </div>
        ))}
      </div>

      {/* media-marker badge for image/video/gradient */}
      {(theme.background.type === 'image' || theme.background.type === 'video' || theme.background.type === 'gradient') && (
        <span style={{
          position: 'absolute', right: 4, top: 18, fontSize: 7,
          padding: '1px 4px', borderRadius: 3,
          background: 'rgba(0,0,0,0.6)', color: '#fff', border: '1px solid rgba(255,255,255,0.2)',
        }}>
          {theme.background.type.toUpperCase()}
        </span>
      )}
    </div>
  );
};

export default ThemePreview;
