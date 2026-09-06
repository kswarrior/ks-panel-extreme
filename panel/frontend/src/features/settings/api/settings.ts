import client from '@/shared/api/client';
import type {
  PanelLogo,
  PanelLogoStyle,
  PanelNameStyle,
} from '@/shared/stores/settingsStore';
import {
  DEFAULT_PANEL_LOGO_STYLE,
  DEFAULT_PANEL_NAME_STYLE,
} from '@/shared/stores/settingsStore';

// Public brand endpoint – used during initial app load (no auth required).
// Returns the panel name + optional logo so callers can bootstrap their
// store without further round trips. Brand-style fields ride along so
// logged-out pages render the styled name without a second fetch.
export interface PublicBrand {
  panel_name: string;
  panel_logo: PanelLogo | null;
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

const pick = (v: unknown, fallback: string): string =>
  typeof v === 'string' && v.trim() !== '' ? v : fallback;

export function brandNameStyleFromWire(src: Partial<PublicBrand>): PanelNameStyle {
  return {
    color: pick(src.panel_name_color, DEFAULT_PANEL_NAME_STYLE.color),
    font: pick(src.panel_name_font, DEFAULT_PANEL_NAME_STYLE.font),
    weight: pick(src.panel_name_weight, DEFAULT_PANEL_NAME_STYLE.weight),
    size: pick(src.panel_name_size, DEFAULT_PANEL_NAME_STYLE.size),
    effect: pick(src.panel_name_effect, DEFAULT_PANEL_NAME_STYLE.effect),
    shadow: pick(src.panel_name_shadow, DEFAULT_PANEL_NAME_STYLE.shadow),
    gradientFrom: pick(src.panel_name_gradient_from, DEFAULT_PANEL_NAME_STYLE.gradientFrom),
    gradientTo: pick(src.panel_name_gradient_to, DEFAULT_PANEL_NAME_STYLE.gradientTo),
    gradientDir: pick(src.panel_name_gradient_dir, DEFAULT_PANEL_NAME_STYLE.gradientDir),
    italic: pick(src.panel_name_italic, DEFAULT_PANEL_NAME_STYLE.italic),
    uppercase: pick(src.panel_name_uppercase, DEFAULT_PANEL_NAME_STYLE.uppercase),
    spacing: pick(src.panel_name_spacing, DEFAULT_PANEL_NAME_STYLE.spacing),
  };
}

export function brandLogoStyleFromWire(src: Partial<PublicBrand>): PanelLogoStyle {
  return {
    size: pick(src.panel_logo_size, DEFAULT_PANEL_LOGO_STYLE.size),
    shape: pick(src.panel_logo_shape, DEFAULT_PANEL_LOGO_STYLE.shape),
    fit: pick(src.panel_logo_fit, DEFAULT_PANEL_LOGO_STYLE.fit),
    bg: pick(src.panel_logo_bg, DEFAULT_PANEL_LOGO_STYLE.bg),
    shadow: pick(src.panel_logo_shadow, DEFAULT_PANEL_LOGO_STYLE.shadow),
    ring: pick(src.panel_logo_ring, DEFAULT_PANEL_LOGO_STYLE.ring),
  };
}

export async function getPanelName(): Promise<PublicBrand & { nameStyle: PanelNameStyle; logoStyle: PanelLogoStyle }> {
  try {
    const res = await client.get<PublicBrand>('/api/settings/panel-name');
    const data = res.data || ({} as PublicBrand);
    return {
      ...data,
      panel_name: data?.panel_name || 'KS Panel',
      panel_logo: data?.panel_logo || null,
      footer_text: data?.footer_text,
      nameStyle: brandNameStyleFromWire(data),
      logoStyle: brandLogoStyleFromWire(data),
    };
  } catch {
    return {
      panel_name: 'KS Panel',
      panel_logo: null,
      footer_text: 'KS Warrior',
      nameStyle: { ...DEFAULT_PANEL_NAME_STYLE },
      logoStyle: { ...DEFAULT_PANEL_LOGO_STYLE },
    };
  }
}

// Admin settings endpoints (require auth + VIEW_SETTINGS).
export interface SettingsSnapshot {
  panel_name: string;
  panel_logo?: PanelLogo | null;
  // Panel-name brand styling + logo presentation (Settings > General).
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
  // Auth + registration toggles (string "1"/"0" on the wire, matching the
  // backend key/value store).
  register_allow?: string;
  register_role?: string;
  device_account_limit?: string;
  verify_required?: string;
  smtp_host?: string;
  smtp_port?: string;
  smtp_user?: string;
  smtp_password?: string;
  smtp_from?: string;
  smtp_tls?: string;
}

// Auth flags read by the public /auth/login page (no auth required).
export interface AuthFlags {
  register_allow: boolean;
  verify_required: boolean;
  device_limit: number;
  device_used: number;
  has_device_cookie: boolean;
}

// PublicAuthFlags fetches the gating toggles the login page needs to decide
// whether to render "Create new account". Tolerates failure (defaults off).
export async function getAuthFlags(): Promise<AuthFlags> {
  try {
    const res = await client.get<AuthFlags>('/api/auth/flags');
    return {
      register_allow: !!res.data?.register_allow,
      verify_required: !!res.data?.verify_required,
      device_limit: Number(res.data?.device_limit) || 0,
      device_used: Number(res.data?.device_used) || 0,
      has_device_cookie: !!res.data?.has_device_cookie,
    };
  } catch {
    return { register_allow: false, verify_required: false, device_limit: 0, device_used: 0, has_device_cookie: false };
  }
}

// ensureDeviceId asks the backend to mint + cookie a device id when none is
// present yet. Called from the Register page on mount so the per-device
// account limit query returns accurate counts. Returns the active id.
export async function ensureDeviceId(): Promise<string> {
  try {
    const res = await client.get<{ device_id: string }>('/api/auth/device-id');
    return res.data?.device_id || '';
  } catch {
    return '';
  }
}

export type SettingsResponse = SettingsSnapshot & { panel_logo: PanelLogo | null };

// normalize passes through the full snapshot the backend returns. Earlier
// versions of these wrappers only copied `panel_name` / `panel_logo`, which
// silently dropped the auth toggles + SMTP fields — so on refresh the
// Settings page read every toggle as "off" and every input as blank even
// though the saved values were intact server-side. We pass everything
// through now and just guarantee the two always-present fields.
function normalize(res: Partial<SettingsSnapshot> | undefined): SettingsResponse {
  return {
    panel_name: res?.panel_name || 'KS Panel',
    panel_logo: res?.panel_logo || null,
    panel_name_color: res?.panel_name_color,
    panel_name_font: res?.panel_name_font,
    panel_name_weight: res?.panel_name_weight,
    panel_name_size: res?.panel_name_size,
    panel_name_effect: res?.panel_name_effect,
    panel_name_shadow: res?.panel_name_shadow,
    panel_name_gradient_from: res?.panel_name_gradient_from,
    panel_name_gradient_to: res?.panel_name_gradient_to,
    panel_name_gradient_dir: res?.panel_name_gradient_dir,
    panel_name_italic: res?.panel_name_italic,
    panel_name_uppercase: res?.panel_name_uppercase,
    panel_name_spacing: res?.panel_name_spacing,
    panel_logo_size: res?.panel_logo_size,
    panel_logo_shape: res?.panel_logo_shape,
    panel_logo_fit: res?.panel_logo_fit,
    panel_logo_bg: res?.panel_logo_bg,
    panel_logo_shadow: res?.panel_logo_shadow,
    panel_logo_ring: res?.panel_logo_ring,
    register_allow: res?.register_allow,
    register_role: res?.register_role,
    device_account_limit: res?.device_account_limit,
    verify_required: res?.verify_required,
    smtp_host: res?.smtp_host,
    smtp_port: res?.smtp_port,
    smtp_user: res?.smtp_user,
    smtp_password: res?.smtp_password,
    smtp_from: res?.smtp_from,
    smtp_tls: (res as any)?.smtp_tls,
  };
}

export async function getSettings(): Promise<SettingsResponse> {
  const res = await client.get<SettingsSnapshot>('/api/settings');
  return normalize(res.data);
}

// updateSettings sends the auth + general fields. The SMTP password is
// handled specially: the backend never echoes it back, so the SPA sends
// "*" to mean "leave unchanged" and "" (or a new value) to overwrite.
export async function updateSettings(payload: Partial<SettingsSnapshot>): Promise<SettingsResponse> {
  const res = await client.put<SettingsSnapshot>('/api/settings', payload);
  return normalize(res.data);
}

// uploadPanelLogo streams the file in a multipart/form-data POST. Mirrors
// the backend's SettingsLogoUploadHandler (5 MiB max; png/jpg/gif/webp/svg).
export async function uploadPanelLogo(file: File): Promise<SettingsResponse> {
  const form = new FormData();
  form.append('logo', file);
  const res = await client.post<SettingsSnapshot>('/api/settings/logo', form, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return normalize(res.data);
}

// deletePanelLogo clears the configured logo on the server and returns the
// refreshed settings snapshot. The settingsStore picks up the resulting
// `panel_logo: null` so the header / login fall back to the default SVG.
export async function deletePanelLogo(): Promise<SettingsResponse> {
  const res = await client.delete<SettingsSnapshot>('/api/settings/logo');
  return normalize(res.data);
}
