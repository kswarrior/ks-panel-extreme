import React from 'react';
import type { Theme } from '../types/theme';

// ThemePreview renders a tiny scale-diagram of a theme — a mini sidebar,
// header and stacked glass cards — using the theme's raw values as inline
// styles. It is intentionally NOT driven by the live CSS custom
// properties (those reflect the *active* theme); building the preview
// straight from the passed theme object keeps every list card honest
// about what it would look like if it were applied, including drafts.
const ThemePreview: React.FC<{ theme: Theme; className?: string }> = ({ theme, className = '' }) => {
  // Custom themes round-trip through the backend as an opaque spec blob with
  // no shape validation, and sectionBackfill spreads raw over defaults — so a
  // null/number color survives into the UI. Coerce defensively: one corrupt
  // custom theme must never blank the Themes grid / Studio template preview.
  const str = (v: unknown, fb: string): string => (typeof v === 'string' && v ? v : fb);
  const num = (v: unknown, fb: number): number =>
    (typeof v === 'number' && Number.isFinite(v) ? v : fb);
  // A corrupt custom theme can carry null / primitive sections (backend treats
  // spec as opaque; sectionBackfill spreads raw over defaults), so coerce every
  // section this tile reads — a null section must render a fallback, never throw.
  const sec = (v: unknown): any => (v && typeof v === 'object' ? v : {});
  const bg = sec((theme as any)?.background);
  const sb = sec((theme as any)?.sidebar);
  const hd = sec((theme as any)?.header);
  const cd = sec((theme as any)?.card);
  const ac = sec((theme as any)?.accent);
  const bt = sec((theme as any)?.button);
  const halfHex = (h: unknown) => {
    const s = str(h, '#ffffff');
    return s.length === 7 ? s + '80' : s;
  };
  // Scale the mini sidebar width from the themed sidebar.width (160–320)
  // so the width slider is visibly reflected in the preview. Default 225
  // maps to the original 28px; extremes map to ~20px / ~40px keeping the
  // diagram readable while still showing the delta.
  const rawW = sb?.width;
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
      }}>
        {/* mini loading bar — mirrors Header.tsx (fill sweeps at 70%) so the
            Header tab's bar color / track / thickness / edge show in the tile. */}
        {(theme.header as any)?.loading_bar_enabled !== false && (
          <div
            style={{
              position: 'absolute', left: 0, right: 0,
              ...((theme.header as any)?.loading_bar_position === 'top' ? { top: 0 } : { bottom: 0 }),
              height: Math.max(1, Math.min(4, (theme.header as any)?.loading_bar_height ?? 2)),
              backgroundColor: (theme.header as any)?.loading_bar_background ?? 'transparent',
            }}
          >
            <div style={{ width: '70%', height: '100%', backgroundColor: (theme.header as any)?.loading_bar_color ?? '#ffffff' }} />
          </div>
        )}
      </div>

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
          {str(theme.background.type, '').toUpperCase()}
        </span>
      )}
    </div>
  );
};

export default ThemePreview;
