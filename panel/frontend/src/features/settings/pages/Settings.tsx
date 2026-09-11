import React, { useEffect, useRef, useState } from 'react';
import {
  brandLogoStyleFromWire,
  brandNameStyleFromWire,
  deleteFavicon,
  deletePanelLogo,
  getSettings,
  updateSettings,
  uploadFavicon,
  uploadPanelLogo,
} from '@/features/settings/api/settings';
import {
  DEFAULT_PANEL_LOGO_STYLE,
  DEFAULT_PANEL_NAME_STYLE,
  useSettingsStore,
  type PanelLogoStyle,
  type PanelNameStyle,
} from '@/shared/stores/settingsStore';
import { PANEL_NAME_FONTS, PanelBrandLogo, PanelBrandName } from '@/shared/components/brand/PanelBrand';
import { applyBrandToDocument, effectiveTabTitle } from '@/shared/utils/brandTab';
import SkeletonCard from '@/shared/components/ui/SkeletonCard';
import GlassModal from '@/shared/components/ui/Modal';
import { useConfirm } from '@/shared/stores/confirmStore';

const MAX_LOGO_BYTES = 5 * 1024 * 1024; // mirrors server-side limit
const ALLOWED_LOGO_TYPES = ['image/png', 'image/jpeg', 'image/jpg', 'image/gif', 'image/webp', 'image/svg+xml'];
const MAX_FAVICON_BYTES = 5 * 1024 * 1024; // mirrors server-side limit
const ALLOWED_FAVICON_TYPES = ['image/png', 'image/jpeg', 'image/jpg', 'image/gif', 'image/webp', 'image/svg+xml', 'image/x-icon', 'image/vnd.microsoft.icon', 'image/ico'];
const MAX_TAB_TITLE_LEN = 120;

const NAME_COLOR_PRESETS = ['#ffffff', '#e5e7eb', '#a5b4fc', '#93c5fd', '#6ee7b7', '#fcd34d', '#fca5a5', '#f0abfc'];
const GRADIENT_PRESETS: Array<[string, string]> = [
  ['#ffffff', '#a5b4fc'],
  ['#6ee7b7', '#38bdf8'],
  ['#fcd34d', '#fb7185'],
  ['#f0abfc', '#818cf8'],
];

const fieldClass =
  'w-full bg-black/30 backdrop-blur-md text-white border border-white/10 placeholder-gray-500 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-white/60 focus:border-white/40 transition-colors duration-150';

const segBtn = (active: boolean) =>
  `px-3 py-1.5 rounded-md text-xs font-medium transition-colors border ${
    active
      ? 'bg-white text-black border-white'
      : 'bg-black/30 text-gray-300 border-white/10 hover:bg-white/10'
  }`;

// probeDims resolves the pixel dimensions of an image URL / data URL without
// rendering it. Used to warn about tiny rasters BEFORE they become a blurry
// logo (the #1 complaint vs. profile avatars, which are always shown small
// and circular so the same file looks fine there).
function probeDims(src: string): Promise<{ w: number; h: number } | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve({ w: img.naturalWidth, h: img.naturalHeight });
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(2)} MB`;
}

// Settings — Brand only (logo + panel-name styling). Auth-related config
// (SMTP, registration gates, OAuth, OTP/SMS, TOTP, requirement policy)
// lives on Security > Authority; AI config lives in the chat panel's gear menu.
const Settings: React.FC = () => {
  const setPanelName = useSettingsStore((s) => s.setPanelName);
  const setPanelLogo = useSettingsStore((s) => s.setPanelLogo);
  const setNameStyle = useSettingsStore((s) => s.setNameStyle);
  const setLogoStyle = useSettingsStore((s) => s.setLogoStyle);
  const setBrowserTabTitle = useSettingsStore((s) => s.setBrowserTabTitle);
  const setFavicon = useSettingsStore((s) => s.setFavicon);
  const setPanelRootUrl = useSettingsStore((s) => s.setPanelRootUrl);
  const confirm = useConfirm();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [uploadingFavicon, setUploadingFavicon] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [name, setName] = useState('KS Panel');
  const [tabTitle, setTabTitle] = useState('');
  const [rootUrl, setRootUrl] = useState('');
  const [nameStyle, setNameStyleLocal] = useState<PanelNameStyle>({ ...DEFAULT_PANEL_NAME_STYLE });
  const [logoStyle, setLogoStyleLocal] = useState<PanelLogoStyle>({ ...DEFAULT_PANEL_LOGO_STYLE });
  const [logo, setLogo] = useState<{ url: string; mime: string; filename?: string } | null>(null);
  const [favicon, setFaviconLocal] = useState<{ url: string; mime: string; filename?: string } | null>(null);
  // Cache-bust the <img> when the user picks a local file to preview it
  // before the upload finishes. Resets to empty when the upload completes
  // (the server returns the canonical URL).
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const [logoDims, setLogoDims] = useState<{ w: number; h: number } | null>(null);
  const [logoFileInfo, setLogoFileInfo] = useState<{ size: number; type: string } | null>(null);
  const [faviconPreview, setFaviconPreview] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const faviconInputRef = useRef<HTMLInputElement | null>(null);
  // Sub-page modals (node-form Icon & colour pattern): the overview shows
  // only a Logo row + Edit and a Name row + Edit; the full controls live
  // in these modals.
  const [logoModalOpen, setLogoModalOpen] = useState(false);
  const [nameModalOpen, setNameModalOpen] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const snap = await getSettings();
        setName(snap.panel_name || 'KS Panel');
        setLogo(snap.panel_logo || null);
        setTabTitle((snap as any).browser_tab_title || '');
        setRootUrl((snap as any).panel_root_url || '');
        setFaviconLocal((snap as any).favicon || null);
        setNameStyleLocal(brandNameStyleFromWire(snap as any));
        setLogoStyleLocal(brandLogoStyleFromWire(snap as any));
      } catch (e: any) {
        setError(e?.response?.data || 'Failed to load settings');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  // Resolve dimensions for whatever is currently shown (server logo or local
  // preview) so the quality hints stay accurate after upload/remove too.
  useEffect(() => {
    const src = logoPreview || logo?.url;
    if (!src) {
      setLogoDims(null);
      return;
    }
    let cancelled = false;
    probeDims(src).then((d) => {
      if (!cancelled) setLogoDims(d);
    });
    return () => {
      cancelled = true;
    };
  }, [logoPreview, logo?.url]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError('Panel name cannot be empty');
      return;
    }
    if (tabTitle.trim().length > MAX_TAB_TITLE_LEN) {
      setError(`Browser tab title is too long (max ${MAX_TAB_TITLE_LEN} characters)`);
      return;
    }
    const normRoot = rootUrl.trim().toLowerCase().replace(/^\/+|\/+$/g, '');
    if (normRoot && !/^[a-z0-9][a-z0-9-]{0,31}$/.test(normRoot)) {
      setError('Root URL must be lowercase letters, digits and hyphens (max 32), starting with a letter or digit');
      return;
    }
    if (['api', 'health', 'favicon.ico', 'assets'].includes(normRoot)) {
      setError(`Root URL "${normRoot}" is reserved by the panel`);
      return;
    }
    setSaving(true);
    setError('');
    setSuccess('');
    try {
      // Brand fields only — auth-related fields (SMTP, allow registration,
      // verify_required, etc) live on Security > Authority now and must not
      // be wiped here.
      const snap = await updateSettings({
        panel_name: name.trim(),
        browser_tab_title: tabTitle.trim(),
        panel_root_url: normRoot,
        panel_name_color: nameStyle.color,
        panel_name_font: nameStyle.font,
        panel_name_weight: nameStyle.weight,
        panel_name_size: nameStyle.size,
        panel_name_effect: nameStyle.effect,
        panel_name_shadow: nameStyle.shadow,
        panel_name_gradient_from: nameStyle.gradientFrom,
        panel_name_gradient_to: nameStyle.gradientTo,
        panel_name_gradient_dir: nameStyle.gradientDir,
        panel_name_italic: nameStyle.italic,
        panel_name_uppercase: nameStyle.uppercase,
        panel_name_spacing: nameStyle.spacing,
        panel_logo_size: logoStyle.size,
        panel_logo_shape: logoStyle.shape,
        panel_logo_fit: logoStyle.fit,
        panel_logo_bg: logoStyle.bg,
        panel_logo_shadow: logoStyle.shadow,
        panel_logo_ring: logoStyle.ring,
      });
      setName(snap.panel_name);
      setTabTitle((snap as any).browser_tab_title || '');
      setRootUrl((snap as any).panel_root_url || '');
      setPanelRootUrl((snap as any).panel_root_url || '');
      // Push the new brand into the global store so Header / Sidebar / Login
      // pick it up without a reload.
      setPanelName(snap.panel_name);
      setBrowserTabTitle((snap as any).browser_tab_title || '');
      const fav = (snap as any).favicon || null;
      setFaviconLocal(fav);
      setFavicon(fav);
      applyBrandToDocument({
        panelName: snap.panel_name,
        tabTitle: (snap as any).browser_tab_title,
        faviconUrl: fav?.url,
        faviconMime: fav?.mime,
      });
      const ns = brandNameStyleFromWire(snap as any);
      const ls = brandLogoStyleFromWire(snap as any);
      setNameStyleLocal(ns);
      setLogoStyleLocal(ls);
      setNameStyle(ns);
      setLogoStyle(ls);
      if (snap.panel_logo) setLogo(snap.panel_logo);
      setPanelLogo(snap.panel_logo || null);
      setSuccess('Saved.');
    } catch (e: any) {
      setError(e?.response?.data || 'Failed to save settings');
    } finally {
      setSaving(false);
    }
  };

  const resetStyle = () => {
    setNameStyleLocal({ ...DEFAULT_PANEL_NAME_STYLE });
    setLogoStyleLocal({ ...DEFAULT_PANEL_LOGO_STYLE });
    setSuccess('');
    setError('');
  };

  const onPickLogo = () => fileInputRef.current?.click();

  const onLogoFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    // Always clear the input so re-picking the same file still triggers
    // a change event.
    if (e.target) e.target.value = '';
    if (!file) return;
    if (!ALLOWED_LOGO_TYPES.includes(file.type)) {
      setError(`Unsupported image type "${file.type || 'unknown'}". Allowed: ${ALLOWED_LOGO_TYPES.join(', ')}.`);
      return;
    }
    if (file.size > MAX_LOGO_BYTES) {
      setError('Logo file is too large (max 5 MiB).');
      return;
    }
    setError('');
    setSuccess('');
    setUploadingLogo(true);
    setLogoFileInfo({ size: file.size, type: file.type });
    // Show the file locally while the upload runs so the admin sees the
    // pick reflected in the UI immediately.
    const reader = new FileReader();
    reader.onload = () => setLogoPreview(typeof reader.result === 'string' ? reader.result : null);
    reader.readAsDataURL(file);
    try {
      const snap = await uploadPanelLogo(file);
      setLogo(snap.panel_logo || null);
      setPanelLogo(snap.panel_logo || null);
      if (snap.panel_logo) {
        document.title = snap.panel_name || document.title;
      }
      setLogoPreview(null);
      setSuccess('Logo uploaded.');
    } catch (e: any) {
      setError(e?.response?.data || 'Failed to upload logo');
      setLogoPreview(null);
    } finally {
      setUploadingLogo(false);
    }
  };

  const onRemoveLogo = async () => {
    if (!logo) return;
    if (!(await confirm({ title: 'Remove logo', message: 'Remove the panel logo? The default icon will be used.', tone: 'danger', confirmLabel: 'Remove' }))) return;
    setError('');
    setSuccess('');
    setUploadingLogo(true);
    try {
      const snap = await deletePanelLogo();
      setLogo(snap.panel_logo || null);
      setPanelLogo(null);
      setLogoPreview(null);
      setLogoFileInfo(null);
      setLogoDims(null);
      setSuccess('Logo removed.');
    } catch (e: any) {
      setError(e?.response?.data || 'Failed to remove logo');
    } finally {
      setUploadingLogo(false);
    }
  };

  const onPickFavicon = () => faviconInputRef.current?.click();

  const onFaviconFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (e.target) e.target.value = '';
    if (!file) return;
    // Browsers report .ico as image/x-icon or image/vnd.microsoft.icon;
    // some report empty string — fall back to the extension then.
    const ext = (file.name.split('.').pop() || '').toLowerCase();
    const typeOk =
      ALLOWED_FAVICON_TYPES.includes(file.type) ||
      ((file.type === '' || file.type === 'application/octet-stream') && (ext === 'ico' || ext === 'svg' || ext === 'png'));
    if (!typeOk) {
      setError(`Unsupported icon type "${file.type || 'unknown'}". Allowed: PNG, JPEG, GIF, WebP, SVG, ICO.`);
      return;
    }
    if (file.size > MAX_FAVICON_BYTES) {
      setError('Icon file is too large (max 5 MiB).');
      return;
    }
    setError('');
    setSuccess('');
    setUploadingFavicon(true);
    const reader = new FileReader();
    reader.onload = () => setFaviconPreview(typeof reader.result === 'string' ? reader.result : null);
    reader.readAsDataURL(file);
    try {
      const snap = await uploadFavicon(file);
      const fav = (snap as any).favicon || null;
      setFaviconLocal(fav);
      setFavicon(fav);
      applyBrandToDocument({
        panelName: snap.panel_name || name,
        tabTitle: (snap as any).browser_tab_title ?? tabTitle,
        faviconUrl: fav?.url,
        faviconMime: fav?.mime,
      });
      setFaviconPreview(null);
      setSuccess('Tab icon uploaded.');
    } catch (e: any) {
      setError(e?.response?.data || 'Failed to upload tab icon');
      setFaviconPreview(null);
    } finally {
      setUploadingFavicon(false);
    }
  };

  const onRemoveFavicon = async () => {
    if (!favicon && !faviconPreview) return;
    if (!(await confirm({ title: 'Remove tab icon', message: 'Remove the custom browser-tab icon? The default icon will be used.', tone: 'danger', confirmLabel: 'Remove' }))) return;
    setError('');
    setSuccess('');
    setUploadingFavicon(true);
    try {
      const snap = await deleteFavicon();
      const fav = (snap as any).favicon || null;
      setFaviconLocal(fav);
      setFavicon(null);
      setFaviconPreview(null);
      // Drop the <link rel="icon"> back to default: remove ours so the
      // browser falls back, then re-apply title without an icon.
      try {
        document.querySelector('link[rel="icon"]')?.remove();
      } catch { /* best-effort */ }
      applyBrandToDocument({ panelName: snap.panel_name || name, tabTitle: (snap as any).browser_tab_title ?? tabTitle });
      setSuccess('Tab icon removed.');
    } catch (e: any) {
      setError(e?.response?.data || 'Failed to remove tab icon');
    } finally {
      setUploadingFavicon(false);
    }
  };

  // The <img> src prefers the local preview (when picking) over the
  // server URL so admins see the new image the instant they select it.
  const previewSrc = logoPreview || logo?.url;
  const previewMime = logoPreview ? logoFileInfo?.type || logo?.mime || '' : logo?.mime || '';
  const isSvg = previewMime === 'image/svg+xml' || (logo?.filename || '').toLowerCase().endsWith('.svg');
  const isSmallRaster =
    !isSvg && logoDims != null && (logoDims.w < 128 || logoDims.h < 128);
  const isNonSquare = logoDims != null && Math.abs(logoDims.w - logoDims.h) > Math.max(logoDims.w, logoDims.h) * 0.15;
  const previewLogo = previewSrc ? { url: previewSrc, mime: previewMime } : null;
  const showGradient = nameStyle.effect === 'gradient';
  const showShadow = nameStyle.effect === 'shadow' || nameStyle.effect === 'outline' || nameStyle.effect === 'gradient';

  const patchName = (p: Partial<PanelNameStyle>) => setNameStyleLocal((s) => ({ ...s, ...p }));
  const patchLogo = (p: Partial<PanelLogoStyle>) => setLogoStyleLocal((s) => ({ ...s, ...p }));

  return (
    // Title lives in the app header ("Settings").
    <div className="space-y-4">
      {loading ? (
        <div>
          <SkeletonCard lines={2} />
        </div>
      ) : (
      <>
      <form
        onSubmit={submit}
        className="glass-card ks-form-card rounded-xl space-y-6 max-w-2xl"
      >
        {/* Hidden file inputs — always mounted so the summary-row Edit
            buttons and the modal buttons can both trigger the native OS
            picker even when a modal is closed. */}
        <input
          ref={fileInputRef}
          type="file"
          accept={ALLOWED_LOGO_TYPES.join(',')}
          onChange={onLogoFile}
          className="hidden"
        />
        <input
          ref={faviconInputRef}
          type="file"
          accept={ALLOWED_FAVICON_TYPES.join(',')}
          onChange={onFaviconFile}
          className="hidden"
        />

        {/* ===================== LOGO ROW + EDIT ===================== */}
        <div className="ks-card ks-form-card rounded-md space-y-3">
          <div>
            <p className="text-sm text-gray-200 font-medium">Logo</p>
            <p className="text-xs text-gray-500">Icon and colour shown across the panel — login, sidebar and header.</p>
          </div>
          <div className="flex items-center gap-3">
            <div className="relative shrink-0" title="Logo preview">
              <PanelBrandLogo logo={previewLogo} style={logoStyle} baseSize={48} alt="Panel logo preview" eager />
              <button
                type="button"
                onClick={() => setLogoModalOpen(true)}
                title="Edit logo"
                aria-label="Edit logo"
                className="absolute -bottom-1.5 -right-1.5 w-6 h-6 rounded-full flex items-center justify-center border border-white/20 bg-neutral-800 hover:bg-neutral-700 text-gray-200 transition-colors"
              >
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-3 h-3" aria-hidden="true"><path d="M12 20h9" /><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4Z" /></svg>
              </button>
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm text-gray-200 font-medium truncate">{logo?.filename || (logo ? 'Custom logo' : 'Default icon')}</p>
              <p className="text-xs text-gray-500 truncate">
                {logoDims ? <>{logoDims.w}×{logoDims.h}px{logoFileInfo ? <> · {formatBytes(logoFileInfo.size)}</> : null}</> : (logo ? <>{logo.mime}</> : 'No custom logo uploaded')}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setLogoModalOpen(true)}
              title="Edit logo"
              className="ks-ghost-btn shrink-0 px-2.5 py-1.5 rounded-md text-xs border border-white/10 bg-white/5 text-white hover:bg-white/10 inline-flex items-center gap-1.5"
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-3.5 h-3.5" aria-hidden="true"><path d="M12 20h9" /><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4Z" /></svg>
              Edit
            </button>
          </div>
        </div>

        {/* ===================== NAME ROW + EDIT ===================== */}
        <div className="ks-card ks-form-card rounded-md space-y-3">
          <div>
            <p className="text-sm text-gray-200 font-medium">Name</p>
            <p className="text-xs text-gray-500">Icon and colour shown across the panel — login, sidebar and browser tab.</p>
          </div>
          <div className="flex items-center gap-3">
            <div className="relative shrink-0 flex items-center gap-2 min-w-0 rounded-xl border border-white/10 bg-black/40 px-3 py-2 flex-1 overflow-hidden" title="Name preview">
              <PanelBrandLogo logo={previewLogo} style={logoStyle} baseSize={28} alt="" />
              <div className="min-w-0 flex-1">
                <PanelBrandName name={name} style={nameStyle} basePx={20} />
              </div>
              <button
                type="button"
                onClick={() => setNameModalOpen(true)}
                title="Edit name"
                aria-label="Edit name"
                className="absolute -bottom-1 -right-1 w-6 h-6 rounded-full flex items-center justify-center border border-white/20 bg-neutral-800 hover:bg-neutral-700 text-gray-200 transition-colors"
              >
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-3 h-3" aria-hidden="true"><path d="M12 20h9" /><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4Z" /></svg>
              </button>
            </div>
            <div className="min-w-0 hidden sm:block flex-1">
              <p className="text-sm text-gray-200 font-medium truncate">{name.trim() || 'KS Panel'}</p>
              <p className="text-xs text-gray-500 truncate">Icon &amp; colour shown across the panel</p>
            </div>
            <button
              type="button"
              onClick={() => setNameModalOpen(true)}
              title="Edit name"
              className="ks-ghost-btn shrink-0 px-2.5 py-1.5 rounded-md text-xs border border-white/10 bg-white/5 text-white hover:bg-white/10 inline-flex items-center gap-1.5"
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-3.5 h-3.5" aria-hidden="true"><path d="M12 20h9" /><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4Z" /></svg>
              Edit
            </button>
          </div>
        </div>

        {/* ===================== ROOT URL ===================== */}
        <section>
          <h3 className="text-sm font-semibold uppercase tracking-wide text-gray-400 mb-1">
            Root URL
          </h3>
          <p className="text-xs text-gray-500 mb-4">
            The path segment the panel lives under. Empty (default) serves the panel at the origin root
            (<span className="font-mono">/mods</span>, <span className="font-mono">/instances</span>, …);
            e.g. <span className="font-mono">panel</span> serves it at <span className="font-mono">/panel/mods</span>,{' '}
            <span className="font-mono">/panel/instances/…</span>. Takes effect after you reload the page.
          </p>
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1" htmlFor="panel-root-url">
              Base path
            </label>
            <div className="flex items-center gap-2">
              <span className="text-sm text-gray-500 font-mono">/</span>
              <input
                id="panel-root-url"
                value={rootUrl}
                onChange={(e) => setRootUrl(e.target.value.toLowerCase())}
                className={fieldClass}
                placeholder="(empty = origin root)"
                spellCheck={false}
                autoComplete="off"
              />
            </div>
            <p className="mt-1.5 text-[11px] text-gray-500">
              Lowercase letters, digits and hyphens, max 32. Reserved: api, health, favicon.ico, assets.
              Must not equal a stack app mount.
            </p>
          </div>
        </section>

        {error && <p className="text-sm text-red-400">{error}</p>}
        {success && <p className="text-sm text-green-400">{success}</p>}

        <div className="flex justify-end">
          <button
            type="submit"
            disabled={saving}
            className="ks-primary-btn inline-flex items-center gap-2 bg-white text-black px-4 py-2 rounded hover:bg-gray-200 text-sm disabled:opacity-60"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4"><polyline points="20 6 9 17 4 12" /> </svg>
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </form>
      )}
    </div>
  );
};

export default Settings;
