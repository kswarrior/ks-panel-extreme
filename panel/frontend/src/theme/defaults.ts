import type { Theme } from '@/features/themes/types/theme';

// The 'default' theme replicates the glassmorphism panel look — black canvas
// image backdrop with solid glass cards, frosted sidebar/header, and
// horizontal-bar loading. Keep this object PURE DATA — no Date(), no
// crypto.randomUUID() — so it can be referenced as a `const` default inside
// the reducer without breaking referential equality between renders. The
// timestamps are fixed strings on purpose.
export const DEFAULT_THEME: Theme = {
  id: 'default',
  name: 'Default',
  description: 'Glassmorphism on a black canvas — the look KS Panel ships with.',
  builtin: true,
  created_at: '2024-01-01T00:00:00.000Z',
  updated_at: '2024-01-01T00:00:00.000Z',

  background: {
    type: 'image',
    color: '#000000',
    image_url: 'https://w0.peakpx.com/wallpaper/131/370/HD-wallpaper-dark-tech-929-black-faded-grunge-metalic-new-smoked-thumbnail.jpg',
    video_url: '',
    gradient: '',
    attachment: 'fixed',
    opacity: 1,
    blur: 0,
    position: 'center',
    size: 'cover',
    repeat: 'no-repeat',
  },

  card: {
    background: 'rgba(255,255,255,0.04)',
    bg_type: 'color',
    bg_image: '',
    bg_video: '',
    bg_gradient: '',
    bg_opacity: 1,
    bg_size: 'cover',
    bg_position: 'center',
    bg_repeat: 'no-repeat',
    backdrop_blur: 1,
    border_color: 'rgba(255,255,255,0.10)',
    border_width: 1,
    border_radius: 5,
    padding: 15,
    margin: 0,
    gap_h: 16,
    gap_v: 16,
    gap: 16,
    shadow: '0 8px 32px rgba(0,0,0,0.45)',
    text_color: '#ffffff',
    hover_border: 'rgba(255,255,255,0.20)',
    glass_style: 'solid',
  },

  sidebar: {
    background: 'rgba(0,0,0,0.40)',
    backdrop_blur: 17,
    border_color: 'rgba(255,255,255,0.10)',
    width: 225,
    text_color: '#9ca3af',
    active_background: '#ffffff',
    active_text_color: '#000000',
    hover_background: '#1f2937',
  },

  button: {
    background: '#ffffff',
    text_color: '#000000',
    border: 'none',
    border_radius: 5,
    padding_x: 19,
    padding_y: 8,
    hover_background: '#e5e7eb',
    font_size: 14,
    ghost_background: 'transparent',
    ghost_text_color: '#e5e7eb',
    ghost_hover_background: 'rgba(255,255,255,0.10)',
    ghost_border: '1px solid rgba(255,255,255,0.10)',
    ghost_border_radius: 5,
    ghost_padding_x: 12,
    ghost_padding_y: 8,
    ghost_font_size: 14,
    icon_background: 'rgba(255,255,255,0.10)',
    icon_text_color: '#ffffff',
    icon_hover_background: 'rgba(255,255,255,0.20)',
    icon_border: 'none',
    icon_border_radius: 5,
    icon_padding: 12,
    icon_size: 14,
  },

  header: {
    background: 'rgba(0,0,0,0.40)',
    backdrop_blur: 23,
    border_color: 'rgba(255,255,255,0.10)',
    height: 55,
    text_color: '#ffffff',
  },

  typography: {
    font_family: 'ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif',
    heading_color: '#ffffff',
    body_color: '#9ca3af',
    link_color: '#60a5fa',
    base_size: 14,
  },

  accent: {
    primary: '#ffffff',
    danger: '#ff0000',
    success: '#4ade80',
    warning: '#fbbf24',
  },

  shape: {
    border_radius_sm: 4,
    border_radius_md: 6,
    border_radius_lg: 12,
  },

  loading: {
    type: 'horizontal-bar',
    color: '#ffffff',
    background: '#000000',
    bg_type: 'image',
    bg_image: 'https://w0.peakpx.com/wallpaper/131/370/HD-wallpaper-dark-tech-929-black-faded-grunge-metalic-new-smoked-thumbnail.jpg',
    bg_video: '',
    bg_gradient: '',
    bg_opacity: 1,
    bg_size: 'cover',
    bg_position: 'center',
    bg_repeat: 'no-repeat',
    bg_blur: 0,
    text_color: '#ffffff',
    show_header: true,
    show_sidebar: true,
    full_screen: true,
    size: 'lg',
    animation_speed: 'fast',
    show_text: false,
    text: 'Loading...',
    skeleton_type: 'mixed',
    skeleton_count: 3,
    skeleton_lines: 1,
    skeleton_base_color: 'rgba(255,255,255,0.06)',
    skeleton_shimmer_color: 'rgba(255,255,255,0.18)',
    skeleton_speed: 'fast',
    skeleton_interval: 2400,
    skeleton_radius: 6,
  },

  tabs: {
    active_background: '#ffffff',
    active_text_color: '#000000',
    inactive_background: 'transparent',
    inactive_text_color: '#d1d5db',
    hover_background: '#ffffff',
    hover_text_color: '#000000',
    border: 'none',
    border_radius: 5,
    padding_x: 8,
    padding_y: 6,
    font_size: 14,
    indicator_color: '#ffffff',
    indicator_height: 0,
  },

  dropdowns: {
    background: 'rgba(12,14,18,0.22)',
    bg_type: 'color',
    bg_image: '',
    bg_video: '',
    bg_gradient: '',
    bg_opacity: 1,
    bg_blur: 0,
    border_color: 'rgba(255,255,255,0.10)',
    border_width: 1,
    border_radius: 5,
    shadow: '0 12px 40px rgba(0,0,0,0.55)',
    backdrop_blur: 25,
    padding: 5,
    min_width: 192,
    item_text_color: '#e5e7eb',
    item_hover_background: 'rgba(255,255,255,0.08)',
    item_padding_x: 12,
    item_padding_y: 8,
    item_gap: 10,
    font_size: 14,
    danger_text_color: '#ff5757',
    danger_hover_background: 'rgba(239,68,68,0.18)',
    header_separator: 'rgba(255,255,255,0.10)',
  },

  // Custom CSS — empty by default. The Theme Studio surfaces a "Custom
  // CSS" tab where the admin can paste arbitrary CSS (panel-wide via
  // `global`, or per-route via `scopes`). Kept flat + empty so it
  // round-trips through localStorage + the opaque backend spec blob with
  // no special handling, and so backfill-merging an older persisted
  // theme with `{ ...DEFAULT_THEME.customCSS, ...t.customCSS }` always
  // yields a well-shaped object (never undefined).
  customCSS: {
    global: '',
    scopes: {},
  },
};

// A few curated background presets surfaced in the Theme Studio so the
// admin has one-click options (Black / Dark Blue / etc.) rather than
// having to type a hex code cold.
export const BACKGROUND_COLOR_PRESETS: string[] = [
  '#000000',
  '#020617', // slate-950 (dark blue)
  '#0f172a', // slate-900
  '#0b132b', // deep navy
  '#1e1b4b', // indigo-950
  '#0a0a0a',
  '#18181b', // zinc-900
  '#171717', // neutral-900
];