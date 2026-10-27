# Styling and Themes

- Tailwind CSS + PostCSS. Config: `tailwind.config.js`, `postcss.config.js`.
- Theme tokens: `var(--ks-*)` (accent, background, card, typography, sidebar, button, etc.).
- Theme defaults + studio controls: `src/theme/`, `features/themes/`.
- Global styles: `src/index.css`.
- Active theme baked into instance-page iframes as CSS vars.
- Theme market: `themes_market/` → embedded via `themelib`.

## Theme studio
`features/themes/pages/ThemeStudio.tsx` tabs: accent, background, button, card, typography, sidebar,
etc. Global themes published server-side; local themes in browser localStorage.
Permissions: USE/CREATE (local/global), EDIT, ASSIGN.
