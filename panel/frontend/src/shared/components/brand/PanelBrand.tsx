import React from 'react';
import type { PanelLogo, PanelLogoStyle, PanelNameStyle } from '@/shared/stores/settingsStore';

// ── Font stacks ──────────────────────────────────────────────────────────
// The backend stores only the short key (inter|system|poppins|...); the stack
// resolves it to a CSS family with graceful fallbacks so a missing webfont
// never breaks the brand — it just falls back to Inter/system.
export const PANEL_NAME_FONTS: Record<string, { label: string; stack: string }> = {
  inter: { label: 'Inter (Default)', stack: "Inter, system-ui, -apple-system, 'Segoe UI', sans-serif" },
  system: { label: 'System', stack: "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif" },
  poppins: { label: 'Poppins', stack: "Poppins, Inter, system-ui, sans-serif" },
  montserrat: { label: 'Montserrat', stack: "Montserrat, Inter, system-ui, sans-serif" },
  roboto: { label: 'Roboto', stack: "Roboto, Inter, system-ui, sans-serif" },
  outfit: { label: 'Outfit', stack: "Outfit, Inter, system-ui, sans-serif" },
  space: { label: 'Space Grotesk', stack: "'Space Grotesk', Inter, system-ui, sans-serif" },
  playfair: { label: 'Playfair Display', stack: "'Playfair Display', Georgia, serif" },
  mono: { label: 'Monospace', stack: "ui-monospace, SFMono-Regular, Menlo, monospace" },
};

const NAME_SIZE_SCALE: Record<string, number> = { sm: 0.9, md: 1, lg: 1.15, xl: 1.3 };
const LOGO_SIZE_SCALE: Record<string, number> = { sm: 0.85, md: 1, lg: 1.18, xl: 1.35 };

function shadowFor(key: string | undefined, color?: string): string | undefined {
  switch (key) {
    case 'none':
      return 'none';
    case 'md':
      return '0 2px 10px rgba(0,0,0,0.55)';
    case 'lg':
      return '0 4px 18px rgba(0,0,0,0.6)';
    case 'glow':
      return color
        ? `0 0 14px ${color}66, 0 2px 8px rgba(0,0,0,0.5)`
        : '0 0 14px rgba(255,255,255,0.25), 0 2px 8px rgba(0,0,0,0.5)';
    case 'sm':
    default:
      return '0 1px 2px rgba(0,0,0,0.55)';
  }
}

// brandNameCss converts the stored PanelNameStyle into an inline style.
// `basePx` is the context's natural size (sidebar ≈18, auth ≈30, preview
// ≈24); the style's size key scales it so one setting works everywhere.
export function brandNameCss(style: PanelNameStyle, basePx: number): React.CSSProperties {
  const font = PANEL_NAME_FONTS[style.font]?.stack || PANEL_NAME_FONTS.inter.stack;
  const scale = NAME_SIZE_SCALE[style.size] ?? 1;
  const css: React.CSSProperties = {
    fontFamily: font,
    fontWeight: Number(style.weight) || 800,
    fontSize: Math.round(basePx * scale),
    lineHeight: 1.15,
    letterSpacing: style.spacing === 'tight' ? '-0.03em' : style.spacing === 'wide' ? '0.08em' : '-0.01em',
    fontStyle: style.italic === '1' ? 'italic' : 'normal',
    textTransform: style.uppercase === '1' ? 'uppercase' : 'none',
  };
  const color = style.color || '#ffffff';

  if (style.effect === 'gradient') {
    const from = style.gradientFrom || '#ffffff';
    const to = style.gradientTo || '#a5b4fc';
    const dir = style.gradientDir || '90deg';
    css.backgroundImage = `linear-gradient(${dir}, ${from}, ${to})`;
    // background-clip:text needs the webkit prefix + transparent fill.
    (css as Record<string, string>).WebkitBackgroundClip = 'text';
    (css as Record<string, string>).backgroundClip = 'text';
    css.color = 'transparent';
    css.WebkitTextFillColor = 'transparent';
    // text-shadow punches through the clipped gradient, so express the
    // shadow as a drop-shadow filter instead.
    if (style.shadow !== 'none') {
      const s = shadowFor(style.shadow, from);
      css.filter = s && s !== 'none' ? `drop-shadow(${s})` : undefined;
    }
    return css;
  }

  css.color = color;
  switch (style.effect) {
    case 'none':
      css.textShadow = 'none';
      break;
    case 'outline':
      (css as Record<string, string>).WebkitTextStroke = '1px rgba(0,0,0,0.7)';
      (css as Record<string, string>).paintOrder = 'stroke fill';
      css.textShadow = shadowFor(style.shadow, color) || undefined;
      break;
    case '3d':
      css.textShadow =
        '1px 1px 0 rgba(0,0,0,0.45), 2px 2px 0 rgba(0,0,0,0.35), 3px 3px 10px rgba(0,0,0,0.55)';
      break;
    case 'neon':
      css.textShadow = `0 0 6px ${color}, 0 0 20px ${color}99, 0 0 36px ${color}66`;
      break;
    case 'shadow':
    default:
      css.textShadow = shadowFor(style.shadow, color) || undefined;
      break;
  }
  return css;
}

// ── PanelBrandName ───────────────────────────────────────────────────────
export const PanelBrandName: React.FC<{
  name: string;
  style: PanelNameStyle;
  basePx?: number;
  className?: string;
  as?: 'h1' | 'span' | 'p';
}> = ({ name, style, basePx = 24, className = '', as = 'h1' }) => {
  const Tag = as as 'h1';
  return (
    <Tag className={`font-extrabold tracking-tight leading-tight min-w-0 truncate ${className}`} style={brandNameCss(style, basePx)}>
      {name || 'KS Panel'}
    </Tag>
  );
};

// ── PanelBrandLogo ───────────────────────────────────────────────────────
// One crisp renderer for every surface (login, sidebar, settings preview,
// header dropdown). Fixes the old blur/crop bugs:
//
//   - fit defaults to `contain` (the header dropdown used `cover`, which
//     cropped wide logos and forced tiny downscales that looked blurry);
//   - the <img> carries explicit width/height + decoding=async +
//     draggable=false so layout never shifts and the browser picks the
//     right decode path;
//   - `imageRendering: auto` lets the browser use high-quality downscaling
//     instead of the pixelated fast path some zoom levels triggered.
export const PanelBrandLogo: React.FC<{
  logo: PanelLogo | null;
  style: PanelLogoStyle;
  baseSize?: number;
  alt?: string;
  eager?: boolean;
  className?: string;
}> = ({ logo, style, baseSize = 64, alt = 'Panel logo', eager = false, className = '' }) => {
  const scale = LOGO_SIZE_SCALE[style.size] ?? 1;
  const size = Math.max(20, Math.round(baseSize * scale));
  const radius = style.shape === 'circle' ? 9999 : style.shape === 'rounded' ? 10 : style.shape === 'square' ? 6 : 16;
  const bg =
    style.bg === 'transparent'
      ? 'transparent'
      : style.bg === 'light'
        ? 'rgba(255,255,255,0.92)'
        : '#18181b'; // dark (zinc-900) — matches the old tile
  const shadow =
    style.shadow === 'none'
      ? 'none'
      : style.shadow === 'sm'
        ? '0 1px 2px rgba(0,0,0,0.5)'
        : style.shadow === 'lg'
          ? '0 12px 32px rgba(0,0,0,0.55)'
          : style.shadow === 'glow'
            ? '0 0 18px rgba(255,255,255,0.18), 0 8px 24px rgba(0,0,0,0.45)'
            : '0 8px 24px rgba(0,0,0,0.45)';
  const ring = style.ring === '1' ? '1px solid rgba(63,63,70,0.9)' : '1px solid transparent';
  const fit = style.fit === 'cover' ? 'cover' : style.fit === 'fill' ? 'fill' : 'contain';

  if (!logo?.url) {
    return (
      <span
        aria-hidden="true"
        className={`inline-flex items-center justify-center shrink-0 ${className}`}
        style={{ width: size, height: size, borderRadius: radius, background: bg, border: ring, boxShadow: shadow }}
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
          style={{ width: Math.round(size * 0.5), height: Math.round(size * 0.5) }}
          className="text-white"
          aria-hidden="true"
        >
          <path d="M12 2 4 6v6c0 5 3.4 8.6 8 10 4.6-1.4 8-5 8-10V6l-8-4Z" />
        </svg>
      </span>
    );
  }

  return (
    <img
      src={logo.url}
      alt={alt}
      width={size}
      height={size}
      draggable={false}
      decoding="async"
      loading={eager ? 'eager' : 'lazy'}
      {...(eager ? { fetchPriority: 'high' as const } : {})}
      className={`shrink-0 ${className}`}
      style={{
        width: size,
        height: size,
        borderRadius: radius,
        background: bg,
        border: ring,
        boxShadow: shadow,
        objectFit: fit,
        // A little breathing room for `contain` so non-square art never
        // kisses the tile edge; `cover`/`fill` stay edge-to-edge.
        padding: fit === 'contain' ? Math.max(2, Math.round(size * 0.1)) : 0,
        imageRendering: 'auto',
      }}
    />
  );
};
