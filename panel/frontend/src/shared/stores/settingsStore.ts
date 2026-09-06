import create from 'zustand';

// PanelLogo is the bootstrap-friendly view of the configured panel logo.
// Both fields are always set when a logo is present; otherwise the object
// is null so the UI can decide whether to render a fallback.
export interface PanelLogo {
  url: string;
  mime: string;
  filename?: string;
}

// PanelNameStyle carries the Settings > General brand styling for the panel
// name: color, font, weight, size, shadow, effect (shadow/outline/3D/neon/
// gradient), gradient endpoints, italic/uppercase/spacing. Plain strings so
// they round-trip through the backend KV store untouched.
export interface PanelNameStyle {
  color: string;
  font: string;
  weight: string;
  size: string;
  effect: string;
  shadow: string;
  gradientFrom: string;
  gradientTo: string;
  gradientDir: string;
  italic: string;
  uppercase: string;
  spacing: string;
}

// PanelLogoStyle carries the Settings > General logo presentation: how the
// stored bytes are rendered (size scale, corner shape, object-fit, tile
// background, shadow, border ring). Rendering-only — never touches bytes.
export interface PanelLogoStyle {
  size: string;
  shape: string;
  fit: string;
  bg: string;
  shadow: string;
  ring: string;
}

export const DEFAULT_PANEL_NAME_STYLE: PanelNameStyle = {
  color: '#ffffff',
  font: 'inter',
  weight: '800',
  size: 'lg',
  effect: 'shadow',
  shadow: 'sm',
  gradientFrom: '#ffffff',
  gradientTo: '#a5b4fc',
  gradientDir: '90deg',
  italic: '0',
  uppercase: '0',
  spacing: 'normal',
};

export const DEFAULT_PANEL_LOGO_STYLE: PanelLogoStyle = {
  size: 'md',
  shape: 'large',
  fit: 'contain',
  bg: 'dark',
  shadow: 'md',
  ring: '1',
};

// AuthorityBranding is the public authority-brand override served by
// GET /api/authority/branding. Mirrors the backend's
// authorityBrandingResponse shape so the login page + ThemedBackground can
// prefer it over the themeStore/global brand when present.
export interface AuthorityBranding {
  panel_name: string;
  logo_url?: string;
  logo_source: 'authority' | 'global' | 'none';
  background_url?: string;
  background_type?: 'image' | 'gradient';
  background_source: 'authority' | 'none';
}

// Bootstrap data spliced into index.html by the Go server so the SPA knows
// the brand before any JS is even loaded. Keeps the first paint free of
// the "KS Panel" default that used to flash on hard reloads.
interface BrandBootstrap {
  panel_name?: string;
  logo_url?: string;
  logo_mime?: string;
  footer_text?: string;
  panel_name_color?: string;
  panel_name_font?: string;
  panel_name_weight?: string;
  panel_name_size?: string;
  panel_name_effect?: string;
  panel_name_shadow?: string;
  panel_name_gradient_from?: string;
  panel_name_gradient_to?: string;
  panel_name_gradient_dir?: string;
  panel_name_italic?: string;
  panel_name_uppercase?: string;
  panel_name_spacing?: string;
  panel_logo_size?: string;
  panel_logo_shape?: string;
  panel_logo_fit?: string;
  panel_logo_bg?: string;
  panel_logo_shadow?: string;
  panel_logo_ring?: string;
}

declare global {
  interface Window {
    __KSPANEL_BOOTSTRAP__?: BrandBootstrap;
  }
}

function pick(v: unknown, fallback: string): string {
  return typeof v === 'string' && v.trim() !== '' ? v : fallback;
}

function readBootstrap(): {
  panelName: string;
  panelLogo: PanelLogo | null;
  footerText: string;
  nameStyle: PanelNameStyle;
  logoStyle: PanelLogoStyle;
} {
  // Guarded for SSR / test environments where window isn't defined.
  if (typeof window === 'undefined') {
    return {
      panelName: 'KS Panel',
      panelLogo: null,
      footerText: 'KS Warrior',
      nameStyle: { ...DEFAULT_PANEL_NAME_STYLE },
      logoStyle: { ...DEFAULT_PANEL_LOGO_STYLE },
    };
  }
  const boot = window.__KSPANEL_BOOTSTRAP__ || {};
  const panelName = (boot.panel_name && boot.panel_name.trim()) || 'KS Panel';
  const panelLogo =
    boot.logo_url && boot.logo_mime
      ? { url: boot.logo_url, mime: boot.logo_mime }
      : null;
  const footerText = (boot.footer_text && boot.footer_text.trim()) || 'KS Warrior';
  return {
    panelName,
    panelLogo,
    footerText,
    nameStyle: {
      color: pick(boot.panel_name_color, DEFAULT_PANEL_NAME_STYLE.color),
      font: pick(boot.panel_name_font, DEFAULT_PANEL_NAME_STYLE.font),
      weight: pick(boot.panel_name_weight, DEFAULT_PANEL_NAME_STYLE.weight),
      size: pick(boot.panel_name_size, DEFAULT_PANEL_NAME_STYLE.size),
      effect: pick(boot.panel_name_effect, DEFAULT_PANEL_NAME_STYLE.effect),
      shadow: pick(boot.panel_name_shadow, DEFAULT_PANEL_NAME_STYLE.shadow),
      gradientFrom: pick(boot.panel_name_gradient_from, DEFAULT_PANEL_NAME_STYLE.gradientFrom),
      gradientTo: pick(boot.panel_name_gradient_to, DEFAULT_PANEL_NAME_STYLE.gradientTo),
      gradientDir: pick(boot.panel_name_gradient_dir, DEFAULT_PANEL_NAME_STYLE.gradientDir),
      italic: pick(boot.panel_name_italic, DEFAULT_PANEL_NAME_STYLE.italic),
      uppercase: pick(boot.panel_name_uppercase, DEFAULT_PANEL_NAME_STYLE.uppercase),
      spacing: pick(boot.panel_name_spacing, DEFAULT_PANEL_NAME_STYLE.spacing),
    },
    logoStyle: {
      size: pick(boot.panel_logo_size, DEFAULT_PANEL_LOGO_STYLE.size),
      shape: pick(boot.panel_logo_shape, DEFAULT_PANEL_LOGO_STYLE.shape),
      fit: pick(boot.panel_logo_fit, DEFAULT_PANEL_LOGO_STYLE.fit),
      bg: pick(boot.panel_logo_bg, DEFAULT_PANEL_LOGO_STYLE.bg),
      shadow: pick(boot.panel_logo_shadow, DEFAULT_PANEL_LOGO_STYLE.shadow),
      ring: pick(boot.panel_logo_ring, DEFAULT_PANEL_LOGO_STYLE.ring),
    },
  };
}

// Initial state seeded from the inline bootstrap. The fetch in App
// bootstrap() reconciles any drift without ever overwriting good values
// with the wrong default.
const initial = readBootstrap();

interface SettingsState {
  panelName: string;
  panelLogo: PanelLogo | null;
  footerText: string;
  nameStyle: PanelNameStyle;
  logoStyle: PanelLogoStyle;
  // Authority branding override (GET /api/authority/branding, public).
  // When set, the login page + ThemedBackground prefer it over the
  // themeStore/global brand; when null the GLOBAL panel_name/logo
  // fallback above stays in effect.
  branding: AuthorityBranding | null;
  setPanelName: (name: string) => void;
  setPanelLogo: (logo: PanelLogo | null) => void;
  setFooterText: (text: string) => void;
  setNameStyle: (style: PanelNameStyle) => void;
  setLogoStyle: (style: PanelLogoStyle) => void;
  setBranding: (branding: AuthorityBranding | null) => void;
  // bootstrapFromServer replaces the bootstrap-derived state with a fresh
  // server snapshot. Called once on app boot; idempotent.
  bootstrapFromServer: (snap: {
    panel_name: string;
    panel_logo: PanelLogo | null;
    footer_text: string;
    nameStyle?: Partial<PanelNameStyle>;
    logoStyle?: Partial<PanelLogoStyle>;
  }) => void;
}

export const useSettingsStore = create<SettingsState>((set) => ({
  panelName: initial.panelName,
  panelLogo: initial.panelLogo,
  footerText: initial.footerText,
  nameStyle: initial.nameStyle,
  logoStyle: initial.logoStyle,
  branding: null,
  setPanelName: (name: string) =>
    set({ panelName: (name && name.trim()) || 'KS Panel' }),
  setPanelLogo: (logo: PanelLogo | null) => set({ panelLogo: logo }),
  setFooterText: (text: string) => set({ footerText: (text && text.trim()) || 'KS Warrior' }),
  setNameStyle: (style: PanelNameStyle) => set({ nameStyle: { ...style } }),
  setLogoStyle: (style: PanelLogoStyle) => set({ logoStyle: { ...style } }),
  setBranding: (branding: AuthorityBranding | null) => set({ branding }),
  bootstrapFromServer: (snap) =>
    set((prev) => ({
      panelName: (snap.panel_name && snap.panel_name.trim()) || 'KS Panel',
      panelLogo: snap.panel_logo,
      footerText: (snap.footer_text && snap.footer_text.trim()) || 'KS Warrior',
      nameStyle: { ...prev.nameStyle, ...(snap.nameStyle || {}) },
      logoStyle: { ...prev.logoStyle, ...(snap.logoStyle || {}) },
    })),
}));
