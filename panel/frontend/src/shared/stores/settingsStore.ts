import create from 'zustand';

// PanelLogo is the bootstrap-friendly view of the configured panel logo.
// Both fields are always set when a logo is present; otherwise the object
// is null so the UI can decide whether to render a fallback.
export interface PanelLogo {
  url: string;
  mime: string;
  filename?: string;
}

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
}

declare global {
  interface Window {
    __KSPANEL_BOOTSTRAP__?: BrandBootstrap;
  }
}

function readBootstrap(): { panelName: string; panelLogo: PanelLogo | null; footerText: string } {
  // Guarded for SSR / test environments where window isn't defined.
  if (typeof window === 'undefined') {
    return { panelName: 'KS Panel', panelLogo: null, footerText: 'KS Warrior' };
  }
  const boot = window.__KSPANEL_BOOTSTRAP__ || {};
  const panelName = (boot.panel_name && boot.panel_name.trim()) || 'KS Panel';
  const panelLogo =
    boot.logo_url && boot.logo_mime
      ? { url: boot.logo_url, mime: boot.logo_mime }
      : null;
  const footerText = (boot.footer_text && boot.footer_text.trim()) || 'KS Warrior';
  return { panelName, panelLogo, footerText };
}

// Initial state seeded from the inline bootstrap. The fetch in App
// bootstrap() reconciles any drift without ever overwriting good values
// with the wrong default.
const initial = readBootstrap();

interface SettingsState {
  panelName: string;
  panelLogo: PanelLogo | null;
  footerText: string;
  // Authority branding override (GET /api/authority/branding, public).
  // When set, the login page + ThemedBackground prefer it over the
  // themeStore/global brand; when null the GLOBAL panel_name/logo
  // fallback above stays in effect.
  branding: AuthorityBranding | null;
  setPanelName: (name: string) => void;
  setPanelLogo: (logo: PanelLogo | null) => void;
  setFooterText: (text: string) => void;
  setBranding: (branding: AuthorityBranding | null) => void;
  // bootstrapFromServer replaces the bootstrap-derived state with a fresh
  // server snapshot. Called once on app boot; idempotent.
  bootstrapFromServer: (snap: { panel_name: string; panel_logo: PanelLogo | null; footer_text: string }) => void;
}

export const useSettingsStore = create<SettingsState>((set) => ({
  panelName: initial.panelName,
  panelLogo: initial.panelLogo,
  footerText: initial.footerText,
  branding: null,
  setPanelName: (name: string) =>
    set({ panelName: (name && name.trim()) || 'KS Panel' }),
  setPanelLogo: (logo: PanelLogo | null) => set({ panelLogo: logo }),
  setFooterText: (text: string) => set({ footerText: (text && text.trim()) || 'KS Warrior' }),
  setBranding: (branding: AuthorityBranding | null) => set({ branding }),
  bootstrapFromServer: (snap) =>
    set({
      panelName: (snap.panel_name && snap.panel_name.trim()) || 'KS Panel',
      panelLogo: snap.panel_logo,
      footerText: (snap.footer_text && snap.footer_text.trim()) || 'KS Warrior',
    }),
}));
