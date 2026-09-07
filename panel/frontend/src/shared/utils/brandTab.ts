// Brand-tab helper: single place that resolves what the browser tab shows.
//
// Title precedence (everywhere): browser_tab_title override when non-empty,
// otherwise panel_name, otherwise "KS Panel" — mirrors the backend's
// EffectiveTabTitle so server-injected <title> and SPA updates converge.
//
// Favicon: root-relative /api/settings/favicon URL (or https/data/blob) only —
// same allow-list spirit as isSafeAuthorityLogoUrl so a hostile row can never
// become a javascript: navigation at the <link> sink.
export function effectiveTabTitle(panelName: string, tabTitle?: string | null): string {
  const t = (tabTitle || '').trim();
  if (t) return t;
  const n = (panelName || '').trim();
  if (n) return n;
  return 'KS Panel';
}

export function isSafeFaviconUrl(u: string): boolean {
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

// applyBrandToDocument sets document.title + the tab icon in one call so
// App boot, login page and Settings saves can't drift apart.
export function applyBrandToDocument(opts: {
  panelName: string;
  tabTitle?: string | null;
  faviconUrl?: string | null;
  faviconMime?: string | null;
}): void {
  if (typeof document === 'undefined') return;
  try {
    document.title = effectiveTabTitle(opts.panelName, opts.tabTitle ?? undefined);
  } catch {
    /* title is best-effort */
  }
  const raw = (opts.faviconUrl || '').trim();
  if (!raw || !isSafeFaviconUrl(raw)) return;
  try {
    let link = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
    if (!link) {
      link = document.createElement('link');
      link.rel = 'icon';
      document.head.appendChild(link);
    }
    link.href = raw;
    const mime = (opts.faviconMime || '').trim();
    if (mime) {
      link.type = mime;
    } else {
      link.removeAttribute('type');
    }
  } catch {
    /* favicon is best-effort */
  }
}
