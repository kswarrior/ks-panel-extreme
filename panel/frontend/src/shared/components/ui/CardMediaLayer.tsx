import React from 'react';

// CardMediaLayer renders the optional background VIDEO that can't be painted
// via CSS `background-image` (unlike color / image / gradient, which the theme
// store layers onto .glass-card through the --ks-card-bg-layer var). The store
// exposes the active card's video URL on the --ks-card-bg-video custom
// property; this component reads it on mount and injects a real
// <video autoplay muted loop playsinline> behind the card content.
//
// It is positioned absolute + inset-0 + pointer-events-none + a low z so it
// sits beneath the card's normal children (which the host element keeps above
// via its own stacking). Opacity is read from --ks-card-bg-opacity so the same
// dimming slider that controls image/gradient cards also dims the video.
//
// Both GlassCard and InstanceCard mount this layer so every themed card
// surface — including instance cards on /instances and /admin/instances — can
// carry an mp4 / gif background set in the Theme Studio's Card tab.
const CardMediaLayer: React.FC = () => {
  const ref = React.useRef<HTMLDivElement | null>(null);

  React.useEffect(() => {
    // Re-read the custom property whenever the theme store restamps the
    // <style> block (applyTheme replaces the whole textContent). We can't
    // subscribe cheaply here, so we observe the style element's mutations and
    // also re-check on route changes via a lightweight interval-free approach:
    // a MutationObserver on the <head> watching the theme style tag. This is
    // far cheaper than polling and reacts the instant a new theme applies.
    const mount = ref.current;
    if (!mount) return;

    const paint = () => {
      const url = (typeof getComputedStyle === 'function')
        ? getComputedStyle(document.documentElement).getPropertyValue('--ks-card-bg-video').trim()
        : '';
      const opacityRaw = (typeof getComputedStyle === 'function')
        ? getComputedStyle(document.documentElement).getPropertyValue('--ks-card-bg-opacity').trim()
        : '';
      // Resolve the vars on the documentElement (where buildVars declares them).
      const opacity = opacityRaw === '' ? 0.5 : Math.max(0, Math.min(1, Number(opacityRaw)));
      if (url) {
        const o = Number.isFinite(opacity) ? opacity : 0.5;
        // HTML-escape the URL before splicing into the innerHTML template so
        // a value containing `"` cannot break out of the src attribute and
        // inject markup. The previous implementation ran
        // `url.replace(/"/g, '"')` — replacing `"` with `"` — which was a
        // literal no-op and left this an HTML-injection sink. Use the DOM
        // API for the actual insertion (textContent on a freshly-built
        // <source>) so we never have to hand-escape anything.
        const safeOpacity = String(o).replace(/[^0-9.]/g, '').slice(0, 6);
        mount.replaceChildren();
        const video = document.createElement('video');
        video.autoplay = true;
        video.muted = true;
        video.loop = true;
        video.setAttribute('playsinline', '');
        video.setAttribute('aria-hidden', 'true');
        video.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;object-fit:cover;display:block;opacity:' + safeOpacity + ';';
        const source = document.createElement('source');
        source.src = url;
        video.appendChild(source);
        mount.appendChild(video);
      } else if (mount.firstChild) {
        mount.replaceChildren();
      }
    };

    paint();

    // Watch the theme style element for textContent changes (applyTheme
    // rewrites it each time) and repaint. Falls back to observing <head>.
    const styleEl = document.getElementById('kspanel-theme-vars');
    const target = styleEl || document.head;
    const obs = new MutationObserver(() => paint());
    obs.observe(target, { childList: true, characterData: true, subtree: !!styleEl });
    return () => obs.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 overflow-hidden"
      style={{ zIndex: -1 }}
    />
  );
};

export default CardMediaLayer;
