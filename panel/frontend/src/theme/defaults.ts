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
    loading_bar_enabled: true,
    loading_bar_color: '#ffffff',
    loading_bar_height: 2,
    loading_bar_position: 'bottom',
    loading_bar_background: 'transparent',
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
    info: '#38bdf8',
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

  // Pill — the fixed top-right action cluster. Surface defaults mirror the
  // Card tab so the pill keeps inheriting the live card look (see buildVars
  // eqTok) until an admin explicitly overrides it here; padding/gap/tab
  // sizing reproduce today's hardcoded pill geometry (6px surface, 10/5px
  // tab buttons, 13px font, 16px chevron, 300ms slide, 2.5s auto-on).
  pill: {
    background: 'rgba(255,255,255,0.04)',
    border_color: 'rgba(255,255,255,0.10)',
    border_width: 1,
    border_radius: 5,
    padding: 6,
    backdrop_blur: 1,
    shadow: '0 8px 32px rgba(0,0,0,0.45)',
    text_color: '#e5e7eb',
    gap: 4,
    tab_padding_x: 10,
    tab_padding_y: 5,
    font_size: 13,
    icon_size: 16,
    animation: 'slide',
    animation_duration: 300,
    auto_hide_enabled: true,
    auto_show_delay: 2500,
    tabs_menu_width: 'shrink',
    tabs_menu_fixed_width: 240,
  },

  // Instance menu — floating square toggle + popover on instance pages.
  // Surface defaults mirror the Card tab (toggle) and the dropdown
  // backdrop (popover) so the menu inherits the live look until an admin
  // explicitly overrides it here; sizing reproduces today's hardcoded
  // geometry (46px square, 15px radius, 320px panel).
  menu: {
    toggle_background: 'rgba(255,255,255,0.04)',
    toggle_border_color: 'rgba(255,255,255,0.10)',
    toggle_icon_color: '#e5e7eb',
    toggle_radius: 15,
    toggle_shadow: '0 8px 32px rgba(0,0,0,0.45)',
    accent_color: '#6ee7b7',
    popover_width: 320,
    popover_background: 'rgba(12,14,18,0.22)',
    popover_border_color: 'rgba(255,255,255,0.18)',
    popover_radius: 15,
    popover_blur: 40,
  },

  // Forms / Components / Utilities / Cards seed values REPRODUCE the stock
  // Tailwind look exactly. Where a variant should keep following the base
  // Card tab live (list/stat/form/glass-strong surfaces), its default equals
  // the corresponding card default — buildVars treats equality-with-default
  // as "inherit the base token" so tweaking the Card tab still cascades
  // everywhere until an admin explicitly overrides a variant.
  forms: {
    input_background: 'rgba(0,0,0,0.30)',
    input_text_color: '#ffffff',
    input_placeholder_color: '#6b7280',
    input_border_color: 'rgba(255,255,255,0.10)',
    input_focus_border_color: 'rgba(255,255,255,0.40)',
    input_focus_ring_color: 'rgba(255,255,255,0.60)',
    input_border_radius: 6,
    input_padding_x: 12,
    input_padding_y: 8,
    input_font_size: 14,
    select_background: 'rgba(0,0,0,0.30)',
    select_text_color: '#ffffff',
    select_border_color: 'rgba(255,255,255,0.10)',
    select_arrow_color: '#ffffff',
    select_border_radius: 6,
    select_padding_x: 12,
    select_padding_y: 8,
    select_font_size: 14,
    textarea_background: 'rgba(0,0,0,0.30)',
    textarea_text_color: '#ffffff',
    textarea_border_color: 'rgba(255,255,255,0.10)',
    textarea_border_radius: 6,
    textarea_padding_x: 12,
    textarea_padding_y: 8,
    textarea_font_size: 14,
    checkbox_bg_unchecked: 'rgba(0,0,0,0.30)',
    checkbox_bg_checked: '#10b981',
    checkbox_border_unchecked: 'rgba(255,255,255,0.20)',
    checkbox_border_checked: '#10b981',
    checkbox_checkmark_color: '#0b0d10',
    checkbox_border_radius: 4,
    checkbox_size: 16,
    radio_bg_unchecked: 'rgba(0,0,0,0.30)',
    radio_bg_checked: '#10b981',
    radio_border_unchecked: 'rgba(255,255,255,0.20)',
    radio_border_checked: '#10b981',
    radio_dot_color: '#0b0d10',
    radio_size: 16,
    toggle_track_off: 'rgba(255,255,255,0.10)',
    toggle_track_on: '#10b981',
    toggle_thumb_color: '#ffffff',
    // '' keeps the stock Tailwind shadow-md on the knob; any colour swaps it
    // for a tight single-colour shadow built from this token.
    toggle_thumb_shadow: '',
    toggle_track_height: 24,
    toggle_thumb_size: 20,
    toggle_border_radius: 9999,
    label_text_color: '#e5e7eb',
    label_hint_color: '#6b7280',
    label_font_size: 14,
    label_font_weight: 500,
    hint_text_color: '#6b7280',
    hint_error_color: '#f87171',
    hint_success_color: '#34d399',
    hint_font_size: 12,
    // Field wrapper (.ks-field).
    field_bg: 'transparent',
    field_gap: 6,
    field_margin_bottom: 0,
    focus_ring_width: 2,
    focus_ring_offset: 0,
    focus_ring_offset_color: '#0b0d10',
  },

  components: {
    // Mirror the card defaults so .glass-strong keeps inheriting the live
    // Card-tab tokens until explicitly overridden here.
    glass_strong_background: 'rgba(255,255,255,0.04)',
    glass_strong_border_color: 'rgba(255,255,255,0.10)',
    glass_strong_shadow: '0 8px 32px rgba(0,0,0,0.45)',
    glass_strong_border_radius: 5,
    glass_strong_backdrop_blur: 1,
    modal_background: 'rgba(255,255,255,0.04)',
    modal_border_color: 'rgba(255,255,255,0.10)',
    modal_shadow: '0 8px 32px rgba(0,0,0,0.45)',
    modal_overlay_color: 'rgba(0,0,0,0.60)',
    modal_border_radius: 5,
    modal_backdrop_blur: 1,
    modal_max_width: 512,
    glass_chrome_background: 'rgba(0,0,0,0.40)',
    glass_chrome_backdrop_blur: 24,
    glass_chrome_border_color: 'rgba(255,255,255,0.10)',
  },

  utilities: {
    color_primary: '#ffffff',
    color_secondary: '#38bdf8',
    color_success: '#22c55e',
    color_warning: '#fbbf24',
    color_danger: '#ef4444',
    color_muted: '#6b7280',
    spacing_base: 4,
    radius_none: 0,
    radius_sm: 4,
    radius_md: 8,
    radius_lg: 12,
    radius_full: 9999,
    shadow_1: 4,
    shadow_2: 8,
    shadow_3: 16,
    shadow_4: 24,
    transition_fast: 150,
    transition_normal: 200,
    transition_slow: 300,
    transition_very_slow: 500,
    z_dropdown: 50,
    z_modal: 60,
    z_tooltip: 70,
    z_toast: 80,
    z_overlay: 40,
  },

  cards: {
    // Equal-to-card-default values mean "inherit the live Card tab token".
    list_background: 'rgba(255,255,255,0.04)',
    list_border_color: 'rgba(255,255,255,0.10)',
    list_hover_border_color: 'rgba(255,255,255,0.20)',
    list_shadow: '0 8px 32px rgba(0,0,0,0.45)',
    list_border_radius: 5,
    list_backdrop_blur: 1,
    list_padding: 15,
    stat_background: 'rgba(255,255,255,0.04)',
    stat_border_color: 'rgba(255,255,255,0.10)',
    stat_icon_color: '#ffffff',
    stat_border_radius: 5,
    stat_padding_x: 15,
    stat_padding_y: 15,
    form_background: 'rgba(255,255,255,0.04)',
    form_border_color: 'rgba(255,255,255,0.10)',
    form_shadow: '0 8px 32px rgba(0,0,0,0.45)',
    form_border_radius: 5,
    form_padding: 15,
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