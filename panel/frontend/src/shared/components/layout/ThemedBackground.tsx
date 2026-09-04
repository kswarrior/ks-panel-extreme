import React from 'react';
import { useSettingsStore } from '@/shared/stores/settingsStore';

// isSafeBrandingUrl mirrors the theme store's cssUrl scheme allowlist
// (http(s) / data:image / blob: / root-relative) so an authority
// background/logo value can never break out of the style context it is
// rendered into. Gradient sources are validated separately (must look like
// a CSS gradient function, never a url()).
function isSafeBrandingUrl(u: string): boolean {
  const t = (u || '').trim();
  if (!t || t.length > 4096) return false;
  if (/["'\\\n\r]/.test(t)) return false;
  const lower = t.toLowerCase();
  return (
    lower.startsWith('https://') ||
    lower.startsWith('http://') ||
    lower.startsWith('data:image/') ||
    lower.startsWith('blob:') ||
    t.startsWith('/')
  );
}

function isSafeGradient(g: string): boolean {
  const t = (g || '').trim();
  if (!t || t.length > 4096) return false;
  if (/["'\\\n\r]/.test(t)) return false;
  return /^(linear-gradient|radial-gradient|conic-gradient|repeating-linear-gradient|repeating-radial-gradient)\s*\(/i.test(t);
}

// ThemedBackground renders the #ks-theme-layer mount the theme store writes
// the background media/gradient/color node into. It is positioned to fill
// its parent, sits behind the page content, and ignores pointer events.
//
// Authority branding override: when the admin configured an authority
// background (GET /api/authority/branding, stored in settingsStore), it is
// preferred over the themeStore background — the theme mount is hidden
// (the store keeps writing into it harmlessly) and the authority backdrop
// paints instead. The theme's CSS vars (:root tokens for cards/sidebar/…)
// still apply; only the backdrop media is superseded. When no authority
// background is configured the mount renders exactly as before, so the
// global theme fallback is untouched.
//
// Both the app shell (Layout) and the standalone auth pages (Login) mount
// this so a theme assigned to an auth area page (e.g. /auth/login) actually
// shows its background — the auth routes render outside of <Layout>, so
// they must provide their own mount for the store's background layer.
const ThemedBackground: React.FC = () => {
  const branding = useSettingsStore((s) => s.branding);
  const bgUrl = (branding?.background_url || '').trim();
  const bgType = branding?.background_type === 'gradient' ? 'gradient' : 'image';
  const hasAuthorityBg =
    branding?.background_source === 'authority' &&
    bgUrl !== '' &&
    (bgType === 'gradient' ? isSafeGradient(bgUrl) : isSafeBrandingUrl(bgUrl));

  if (!hasAuthorityBg) {
    return (
      <div
        id="ks-theme-layer"
        className="absolute inset-0 z-0 pointer-events-none overflow-hidden"
        aria-hidden="true"
      />
    );
  }

  const style: React.CSSProperties =
    bgType === 'gradient'
      ? { backgroundImage: bgUrl, backgroundSize: 'cover', backgroundPosition: 'center' }
      : { backgroundImage: `url("${bgUrl}")`, backgroundSize: 'cover', backgroundPosition: 'center', backgroundRepeat: 'no-repeat' };

  return (
    <>
      <div
        className="absolute inset-0 z-0 pointer-events-none overflow-hidden"
        style={style}
        aria-hidden="true"
      />
      {/* Kept mounted-but-hidden so the theme store's stamping target never
          disappears (applyTheme writes into it on every route change); the
          authority backdrop above is what actually paints. */}
      <div
        id="ks-theme-layer"
        className="absolute inset-0 z-0 pointer-events-none overflow-hidden"
        style={{ display: 'none' }}
        aria-hidden="true"
      />
    </>
  );
};

export default ThemedBackground;
