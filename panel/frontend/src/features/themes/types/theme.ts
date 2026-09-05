// Theme model for the panel-wide appearance customization system.
//
// Every theme is a plain serialisable object (no functions / class
// instances) so it can round-trip through localStorage and (later) be
// POSTed to a backend `/api/themes` endpoint without any custom
// marshalling on the client side.
//
// The values are flat CSS-friendly strings — colours as hex (#rrggbb /
// #rrggbbaa), sizes as px, blur as px — so the runtime applier
// (themeStore.applyTheme) can drop them straight onto CSS custom
// properties on :root without further parsing.

export type BgType = 'color' | 'image' | 'video' | 'gradient';

// Background fills. `color` lets the admin pick a flat colour; `image`
// and `video` take a URL (either a remote URL or a blob: URL produced by
// the studio's "upload" tab); `gradient` renders an arbitrary CSS
// gradient string. `position` / `size` / `repeat` only apply to image
// backgrounds; videos always render object-cover.
export interface ThemeBackground {
  type: BgType;
  color: string;        // hex, used when type === 'color'
  image_url: string;    // used when type === 'image'
  video_url: string;    // used when type === 'video'
  gradient: string;     // CSS gradient expression, type === 'gradient'
  attachment: 'scroll' | 'fixed';
  opacity: number;      // 0..1 — applied to the media layer only
  blur: number;         // px — applied to the media layer only
  position: string;     // e.g. 'center'
  size: string;         // e.g. 'cover'
  repeat: 'repeat' | 'no-repeat';
}

export type CardBgType = 'color' | 'image' | 'video' | 'gradient';

export interface ThemeCard {
  background: string;       // rgba/hex/card fill behind content (used when bg_type === 'color')
  bg_type: CardBgType;      // how the card background is painted
  bg_image: string;         // URL/blob; used when bg_type === 'image'
  bg_video: string;         // URL/blob; used when bg_type === 'video'
  bg_gradient: string;      // CSS gradient expression, bg_type === 'gradient'
  bg_opacity: number;       // 0..1 — applied to the media/gradient layer only
  bg_size: string;          // CSS background-size (image only), e.g. 'cover'
  bg_position: string;      // CSS background-position (image only), e.g. 'center'
  bg_repeat: 'repeat' | 'no-repeat';
  backdrop_blur: number;     // px
  border_color: string;      // hex or rgba
  border_width: number;      // px
  border_radius: number;     // px
  padding: number;           // px
  margin: number;             // px (gutter around the card)
  gap?: number;               // px — space between sibling cards in a grid/flex wrapper (ks-card-grid) [legacy]
  gap_h: number;              // px — horizontal space between sibling cards (ks-card-grid)
  gap_v: number;              // px — vertical space between sibling cards (ks-card-grid)
  shadow: string;            // raw CSS box-shadow
  text_color: string;        // hex
  hover_border: string;      // hex — border colour swap on hover
  // Glass style controls how the card surface itself reads on top of its
  // background fill — frosted (default, translucent + blur), strong (heavier
  // blur + border for cards that need to read crisply above busy media), or
  // solid (opaque, no blur, for flat / non-glass designs).
  glass_style: 'frosted' | 'strong' | 'solid';
}

export interface ThemeSidebar {
  background: string;
  backdrop_blur: number;
  border_color: string;
  width: number;             // px
  text_color: string;
  active_background: string; // active item fill
  active_text_color: string;
  hover_background: string;
}

// Three button flavours cover every CTA on the panel:
//   - primary: the high-emphasis solid fill ("Create", "Save", "Activate")
//   - ghost:   the low-emphasis outline/transparent ("Cancel", secondary)
//   - icon:    the square translucent buttons in page headers ("Filter", "New")
// Each carries its own fill / text / hover / border / radius / padding so the
// admin can tune all three independently instead of one ring fitting all.
export interface ThemeButton {
  // Primary solid button.
  background: string;
  text_color: string;
  hover_background: string;
  border: string;
  border_radius: number;
  padding_x: number;
  padding_y: number;
  font_size: number;
  // Ghost / transparent button (Cancel, secondary actions).
  ghost_background: string;
  ghost_text_color: string;
  ghost_hover_background: string;
  ghost_border: string;
  ghost_border_radius: number;
  ghost_padding_x: number;
  ghost_padding_y: number;
  ghost_font_size: number;
  // Icon button (filter toggle, "New" square buttons in page headers).
  icon_background: string;
  icon_text_color: string;
  icon_hover_background: string;
  icon_border: string;
  icon_border_radius: number;
  icon_padding: number;
  icon_size: number;
}

// Tab navigation (the pill bar seen on /admin/security, /admin/system,
// /admin/database, /admin/templates/:id/edit, /admin/nodes/:id/edit, …).
// `active_*` paints the selected tab; `inactive_*` paints the rest. A thin
// bottom indicator on the active tab is supported via `indicator_*`.
export interface ThemeTabs {
  active_background: string;
  active_text_color: string;
  inactive_background: string;
  inactive_text_color: string;
  hover_background: string;
  hover_text_color: string;
  border: string;
  border_radius: number;
  padding_x: number;
  padding_y: number;
  font_size: number;
  indicator_color: string;
  indicator_height: number;
}

// Dropdown surface — the frosted panel that pops open from the card 3-dot
// menu, the header account/profile menu, the Themes "Apply to…" picker,
// and every inline filter dropdown in the admin pages (Filters button on
// Templates / Mods / Nodes / etc.). One set of variables covers all of
// them so the admin gets a single coherent dropdown look everywhere.
export interface ThemeDropdown {
  // Surface fill. Mirrors the card background tab: flat colour, uploaded
  // image / video, or CSS gradient, with opacity + blur controls.
  background: string;
  bg_type: 'color' | 'image' | 'video' | 'gradient';
  bg_image: string;
  bg_video: string;
  bg_gradient: string;
  bg_opacity: number;
  bg_blur: number;
  // Chrome.
  border_color: string;
  border_width: number;
  border_radius: number;
  shadow: string;
  backdrop_blur: number;
  padding: number;
  min_width: number;
  // Item rows.
  item_text_color: string;
  item_hover_background: string;
  item_padding_x: number;
  item_padding_y: number;
  item_gap: number;
  font_size: number;
  // Destructive rows (Delete / Remove) get their own pair so the admin
  // can tint danger actions distinctly from neutral ones.
  danger_text_color: string;
  danger_hover_background: string;
  // Header / separator line drawn between an optional menu title and the
  // item list (used by the profile dropdown's identity block).
  header_separator: string;
}

export interface ThemeHeader {
  background: string;
  backdrop_blur: number;
  border_color: string;
  height: number;            // px
  text_color: string;
  // Page-switch loading bar pinned to the header edge (Header.tsx sweeps
  // left → right while a new page opens). All fields are optional at rest
  // so older persisted themes backfill from DEFAULT via sectionBackfill.
  loading_bar_enabled: boolean;              // false = hide the bar entirely
  loading_bar_color: string;                 // bar fill (default white)
  loading_bar_height: number;                // px thickness (1..8)
  loading_bar_position: 'top' | 'bottom';    // which header edge to pin to
  loading_bar_background: string;            // track behind the bar (transparent = none)
}

export interface ThemeTypography {
  font_family: string;       // CSS font-family stack
  heading_color: string;
  body_color: string;
  link_color: string;
  base_size: number;         // px
}

export interface ThemeAccent {
  primary: string;           // hex — primary accent colour
  danger: string;
  success: string;
  warning: string;
  info: string;              // sky/blue family (links, info chips, terminal blue)
}

export interface ThemeShape {
  border_radius_sm: number;  // px — pills, small chips
  border_radius_md: number;  // px — inputs/buttons
  border_radius_lg: number;  // px — cards/modals
}

export type LoadingType = 'cycle' | 'horizontal-bar' | 'vertical-bar' | 'dots' | 'pulse' | 'wave' | 'spiral' | 'skeleton';

export type LoadingBgType = 'color' | 'image' | 'video' | 'gradient';

export type SkeletonType = 'cards' | 'list' | 'text' | 'avatar' | 'mixed';

export interface ThemeLoading {
  type: LoadingType;
  color: string;
  // Loading backdrop. Mirrors the card/page background model so admins can
  // paint a flat colour, an uploaded image/video, or a CSS gradient under
  // the loading overlay — same options the card tab exposes for cards.
  background: string;             // flat colour when bg_type === 'color'
  bg_type: LoadingBgType;         // how the loading backdrop is painted
  bg_image: string;               // URL/blob; used when bg_type === 'image'
  bg_video: string;               // URL/blob; used when bg_type === 'video'
  bg_gradient: string;            // CSS gradient expression, bg_type === 'gradient'
  bg_opacity: number;             // 0..1 — applied to the media/gradient layer
  bg_size: string;                // CSS background-size (image only)
  bg_position: string;            // CSS background-position (image only)
  bg_repeat: 'repeat' | 'no-repeat';
  bg_blur: number;                // px — applied to the media/gradient layer
  text_color: string;
  show_header: boolean;
  show_sidebar: boolean;
  full_screen: boolean;
  size: 'sm' | 'md' | 'lg';
  animation_speed: 'slow' | 'normal' | 'fast';
  show_text: boolean;
  text: string;
  // Skeleton-specific options. Only consulted when type === 'skeleton'.
  skeleton_type: SkeletonType;     // layout variant rendered in place of a spinner
  skeleton_count: number;          // how many skeleton cards/rows to render
  skeleton_lines: number;          // lines per skeleton card
  skeleton_base_color: string;     // hex/rgba — the static placeholder fill
  skeleton_shimmer_color: string;  // hex/rgba — the pulse highlight colour
  skeleton_speed: 'slow' | 'normal' | 'fast'; // pulse animation duration preset
  skeleton_interval: number;       // ms — minimum display time + stagger between items
  skeleton_radius: number;         // px — corner radius for skeleton blocks
}

// ThemeCustomCSS is the escape hatch that lets the admin inject COMPLETELY
// ARBITRARY CSS anywhere on the panel — the structured controls above cover
// the common tokens (colours / sizes / blur / radius / …), but a real
// designer will always want raw CSS for the one-off tweak no token exposes.
//
// Two layers are supported so CSS can be targeted both "everywhere" and
// "only on this specific area/page" without the admin hand-writing route
// attribute selectors:
//
//   - `global` is emitted VERBATIM into the panel's theme <style> block on
//     every route. Any selector / at-rule / nested rule the admin writes
//     applies panel-wide. This is the literal "add CSS anywhere" knob.
//
//   - `scopes` is a map keyed by scope string ('area:<id>' or 'page:<id>')
//     mirroring the SAME scope model the theme-assignment system uses.
//     The theme store's route resolver only emits the scopes whose area/page
//     matches the CURRENT route (plus `global`), so the admin can write a
//     block that only fires on e.g. the admin area or the Users page. The
//     Theme Studio's live preview emits ALL scopes so the admin sees their
//     scoped CSS while editing regardless of the current URL.
//
// Values are stored raw inside the theme `spec` blob; the backend treats
// `spec` as an opaque JSON document (never inspecting it), so adding this
// field needs no backend migration — the whole Theme object round-trips
// through /api/themes unchanged. Like the rest of the spec the data
// is flat JSON so it survives localStorage + JSON.stringify without custom
// marshalling.
export interface ThemeCustomCSS {
  // Raw CSS injected panel-wide on EVERY route. Empty string = none.
  // Emitted verbatim (the admin owns selector correctness); the theme
  // applier sets the <style> element via textContent, so a stray
  // "</style>" substring cannot break out of the style element.
  global: string;
  // Per-route CSS blocks. The key is a scope string of the form
  // 'area:<id>' (e.g. 'area:admin') or 'page:<id>' (e.g.
  // 'page:admin.users'). Only blocks whose scope matches the current
  // route are emitted at runtime; the studio preview emits all of
  // them. An empty map = no per-route CSS.
  scopes: Record<string, string>;
}

// ThemeForms drives every form control on the panel (the `.ks-input` /
// `.ks-select` / `.ks-textarea` / `.ks-checkbox` / `.ks-radio` / `.ks-toggle`
// primitives plus the GlassField wrapper used by every create/edit page and
// list filter bar). Values mirror the panel's stock Tailwind look so the
// Default theme renders pixel-identical to the pre-theme baseline.
export interface ThemeForms {
  // Text inputs.
  input_background: string;
  input_text_color: string;
  input_placeholder_color: string;
  input_border_color: string;
  input_focus_border_color: string;
  input_focus_ring_color: string;
  input_border_radius: number;   // px
  input_padding_x: number;       // px
  input_padding_y: number;       // px
  input_font_size: number;       // px
  // Native selects.
  select_background: string;
  select_text_color: string;
  select_border_color: string;
  select_arrow_color: string;    // hex — recolours the .ks-select chevron
  select_border_radius: number;
  select_padding_x: number;
  select_padding_y: number;
  select_font_size: number;
  // Textareas.
  textarea_background: string;
  textarea_text_color: string;
  textarea_border_color: string;
  textarea_border_radius: number;
  textarea_padding_x: number;
  textarea_padding_y: number;
  textarea_font_size: number;
  // Checkboxes (accent-color based).
  checkbox_bg_unchecked: string;
  checkbox_bg_checked: string;   // accent-color when checked
  checkbox_border_unchecked: string;
  checkbox_border_checked: string;  // border colour once checked (.rich-check + custom skin)
  checkbox_checkmark_color: string; // glyph colour on custom check chips (.rich-check)
  checkbox_border_radius: number;
  checkbox_size: number;         // px
  // Radios.
  radio_bg_unchecked: string;    // fill while unchecked (custom skin)
  radio_bg_checked: string;      // accent-color when checked
  radio_border_unchecked: string;
  radio_border_checked: string;
  radio_dot_color: string;       // centre dot painted when checked (custom skin)
  radio_size: number;            // px
  // Toggle switches (.ks-toggle).
  toggle_track_off: string;
  toggle_track_on: string;
  toggle_thumb_color: string;
  toggle_thumb_shadow: string;   // knob shadow colour ('' = stock Tailwind shadow-md)
  toggle_track_height: number;   // px — width derives from height
  toggle_thumb_size: number;     // px
  toggle_border_radius: number;  // px (9999 = pill)
  // Labels + hints (.ks-label / .ks-hint).
  label_text_color: string;
  label_hint_color: string;
  label_font_size: number;
  label_font_weight: number;     // 100..900
  hint_text_color: string;
  hint_error_color: string;
  hint_success_color: string;
  hint_font_size: number;
  // Field wrapper (.ks-field).
  field_bg: string;              // wrapper fill (transparent = none)
  field_gap: number;             // px between label/hint/input
  field_margin_bottom: number;   // px below the wrapper
  // Focus ring shared by inputs/selects/textareas.
  focus_ring_width: number;      // px
  focus_ring_offset: number;     // px
  focus_ring_offset_color: string; // gap ring between focus border and page
}

// ThemeComponents styles the floating surfaces that aren't covered by a
// dedicated tab: modal dialogs (.ks-modal-panel), the modal overlay scrim,
// the "strong" glass surface modals render on (.glass-strong) and the app
// chrome surface (.glass-chrome — excluding the sidebar/header which own
// their themed sections). Defaults mirror today's rendered look exactly so
// the Default theme stays pixel-identical.
export interface ThemeComponents {
  glass_strong_background: string;
  glass_strong_border_color: string;
  glass_strong_shadow: string;
  glass_strong_border_radius: number;  // px
  glass_strong_backdrop_blur: number;  // px
  modal_background: string;            // .ks-modal-panel fill
  modal_border_color: string;
  modal_shadow: string;
  modal_overlay_color: string;         // backdrop scrim behind the dialog
  modal_border_radius: number;         // px
  modal_backdrop_blur: number;         // px
  modal_max_width: number;             // px; 512 = keep each caller's own default
  glass_chrome_background: string;
  glass_chrome_backdrop_blur: number;  // px
  glass_chrome_border_color: string;
}

// ThemeUtilities exposes design tokens as CSS custom properties for custom-CSS
// authors and drives the transition speeds used by the themed components.
// They never restyle anything on their own (zero visual delta by default).
export interface ThemeUtilities {
  color_primary: string;
  color_secondary: string;
  color_success: string;
  color_warning: string;
  color_danger: string;
  color_muted: string;
  spacing_base: number;          // px — --ks-space-base token
  radius_none: number;           // px
  radius_sm: number;
  radius_md: number;
  radius_lg: number;
  radius_full: number;           // px (9999 ≈ pill)
  shadow_1: number;              // blur px — composed into --ks-elev-1..4
  shadow_2: number;
  shadow_3: number;
  shadow_4: number;
  transition_fast: number;       // ms
  transition_normal: number;     // ms
  transition_slow: number;       // ms
  transition_very_slow: number;  // ms
  z_dropdown: number;
  z_modal: number;
  z_tooltip: number;
  z_toast: number;
  z_overlay: number;
}

// ThemeCards styles the semantic card variants layered on top of the base
// card look: list rows (.ks-list-card), stat strips (.ks-stat-card) and
// form sections (.ks-form-card). Defaults inherit the base card appearance,
// matching today's rendering.
export interface ThemeCards {
  list_background: string;
  list_border_color: string;
  list_hover_border_color: string;
  list_shadow: string;
  list_border_radius: number;    // px
  list_backdrop_blur: number;    // px
  list_padding: number;          // px
  stat_background: string;
  stat_border_color: string;
  stat_icon_color: string;
  stat_border_radius: number;    // px
  stat_padding_x: number;        // px
  stat_padding_y: number;        // px
  form_background: string;
  form_border_color: string;
  form_shadow: string;
  form_border_radius: number;    // px
  form_padding: number;          // px
}

// Pill — the fixed top-right action cluster (PageActionsPill) rendered on
// nearly every panel page (search / filter / stats / new / …). It never goes
// invisible: auto-off (scroll / outside-click) and the manual toggle only
// collapse it to a `<` chevron. This section themes its surface, its button
// sizing, its collapse animation, and the auto-off → auto-on timing.
export type PillAnimation = 'slide' | 'fade' | 'scale' | 'none';

// Upward phone-tabs menu width mode: 'shrink' hugs the longest tab label,
// 'fixed' uses tabs_menu_fixed_width (clamped to the viewport).
export type PillTabsMenuWidth = 'shrink' | 'fixed';

export interface ThemePill {
  background: string;       // pill surface fill (default mirrors card → inherits live Card tab)
  border_color: string;     // hex or rgba
  border_width: number;     // px
  border_radius: number;    // px
  padding: number;          // px — inner padding of the pill surface
  backdrop_blur: number;    // px
  shadow: string;           // raw CSS box-shadow
  text_color: string;       // `<` / `>` toggle chevron tint
  gap: number;              // px — space between the action buttons
  tab_padding_x: number;    // px — action button horizontal padding
  tab_padding_y: number;    // px — action button vertical padding
  font_size: number;        // px — action button font size
  icon_size: number;        // px — `<` / `>` toggle chevron size
  animation: PillAnimation; // collapse/expand motion
  animation_duration: number; // ms
  auto_hide_enabled: boolean; // false = pill never auto-offs, toggle still works
  auto_show_delay: number;    // ms idle after auto-off before it slides back on
  tabs_menu_width: PillTabsMenuWidth; // phone Tabs Pill upward-menu width mode
  tabs_menu_fixed_width: number;      // px — used when tabs_menu_width === 'fixed'
}

// Instance menu — the floating draggable square toggle on instance detail
// pages plus its popover (status row, power controls, template actions).
// Surface defaults mirror the Card tab so the menu keeps inheriting the
// live card look until an admin explicitly overrides it here.
export interface ThemeMenu {
  toggle_background: string; // square fill (default mirrors card → inherits live Card tab)
  toggle_border_color: string; // hex or rgba
  toggle_icon_color: string;  // wheel glyph + chevron tint
  toggle_radius: number;      // px — square corner radius
  toggle_shadow: string;      // raw CSS box-shadow at rest
  accent_color: string;       // open-state glow + active wheel tint
  popover_width: number;      // px — menu panel width
  popover_background: string; // panel fill (default mirrors dropdowns)
  popover_border_color: string; // hex or rgba
  popover_radius: number;     // px
  popover_blur: number;       // px — backdrop blur behind the panel
}

export interface Theme {
  id: string;                // stable id; 'default' is reserved for the seed
  name: string;
  description: string;
  builtin: boolean;          // true for the 'default' glassmorphism theme
  created_at: string;        // ISO timestamp
  updated_at: string;
  /** Raw SVG markup for the theme tile (optional). Empty = palette glyph. */
  icon?: string;
  /** Optional #rrggbb accent tinting the tile on theme cards. */
  color?: string;

  background: ThemeBackground;
  card: ThemeCard;
  sidebar: ThemeSidebar;
  button: ThemeButton;
  header: ThemeHeader;
  typography: ThemeTypography;
  accent: ThemeAccent;
  shape: ThemeShape;
  loading: ThemeLoading;
  tabs: ThemeTabs;
  dropdowns: ThemeDropdown;
  pill: ThemePill;
  menu: ThemeMenu;
  forms: ThemeForms;
  components: ThemeComponents;
  utilities: ThemeUtilities;
  cards: ThemeCards;
  customCSS: ThemeCustomCSS;
}

export type ThemeKey = keyof Pick<Theme,
  'background' | 'card' | 'sidebar' | 'button' | 'header' | 'typography' | 'accent' | 'shape'
  | 'loading' | 'tabs' | 'dropdowns' | 'pill' | 'menu' | 'forms' | 'components' | 'utilities' | 'cards' | 'customCSS'>;
