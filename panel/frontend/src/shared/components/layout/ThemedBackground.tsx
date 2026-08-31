import React from 'react';

// ThemedBackground renders the #ks-theme-layer mount the theme store writes
// the background media/gradient/color node into. It is positioned to fill
// its parent, sits behind the page content, and ignores pointer events.
//
// Both the app shell (Layout) and the standalone auth pages (Login) mount
// this so a theme assigned to an auth area page (e.g. /auth/login) actually
// shows its background — the auth routes render outside of <Layout>, so
// they must provide their own mount for the store's background layer.
const ThemedBackground: React.FC = () => (
  <div
    id="ks-theme-layer"
    className="absolute inset-0 z-0 pointer-events-none overflow-hidden"
    aria-hidden="true"
  />
);

export default ThemedBackground;
