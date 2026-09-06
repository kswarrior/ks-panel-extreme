import React, { useEffect, useRef, useState } from 'react';
import {
  brandLogoStyleFromWire,
  brandNameStyleFromWire,
  deletePanelLogo,
  getSettings,
  updateSettings,
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
import SkeletonCard from '@/shared/components/ui/SkeletonCard';
import { useConfirm } from '@/shared/stores/confirmStore';

const MAX_LOGO_BYTES = 5 * 1024 * 1024; // mirrors server-side limit
const ALLOWED_LOGO_TYPES = ['image/png', 'image/jpeg', 'image/jpg', 'image/gif', 'image/webp', 'image/svg+xml'];

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

// The Settings page is the BRAND panel — panel name + logo live here.
// Everything auth-related (SMTP, registration gates, OAuth providers,
// OTP/SMS channels, the TOTP authenticator-app connection, and the
// configurable registration requirement policy) moved to Security >
// Authority. The AI Assistant config lives in the chat panel's gear menu
// (bottom-right bubble).
const Settings: React.FC = () => {
  const setPanelName = useSettingsStore((s) => s.setPanelName);
  const setPanelLogo = useSettingsStore((s) => s.setPanelLogo);
  const setNameStyle = useSettingsStore((s) => s.setNameStyle);
  const setLogoStyle = useSettingsStore((s) => s.setLogoStyle);
  const confirm = useConfirm();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [name, setName] = useState('KS Panel');
  const [nameStyle, setNameStyleLocal] = useState<PanelNameStyle>({ ...DEFAULT_PANEL_NAME_STYLE });
  const [logoStyle, setLogoStyleLocal] = useState<PanelLogoStyle>({ ...DEFAULT_PANEL_LOGO_STYLE });
  const [logo, setLogo] = useState<{ url: string; mime: string; filename?: string } | null>(null);
  // Cache-bust the <img> when the user picks a local file to preview it
  // before the upload finishes. Resets to empty when the upload completes
  // (the server returns the canonical URL).
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const [logoDims, setLogoDims] = useState<{ w: number; h: number } | null>(null);
  const [logoFileInfo, setLogoFileInfo] = useState<{ size: number; type: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const snap = await getSettings();
        setName(snap.panel_name || 'KS Panel');
        setLogo(snap.panel_logo || null);
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
    setSaving(true);
    setError('');
    setSuccess('');
    try {
      // Brand fields only — auth-related fields (SMTP, allow registration,
      // verify_required, etc) live on Security > Authority now and must not
      // be wiped here.
      const snap = await updateSettings({
        panel_name: name.trim(),
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
      // Push the new brand into the global store so Header / Sidebar / Login
      // pick it up without a reload.
      setPanelName(snap.panel_name);
      document.title = snap.panel_name;
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

  if (loading) {
    return (
      <div>
        <SkeletonCard lines={2} />
      </div>
    );
  }

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
    <div>
      <form
        onSubmit={submit}
        className="glass-card ks-form-card rounded-xl space-y-8 max-w-2xl"
      >
        {/* ===================== PANEL LOGO ===================== */}
        <section>
          <h3 className="text-sm font-semibold uppercase tracking-wide text-gray-400 mb-1">
            Panel Logo
          </h3>
          <p className="text-xs text-gray-500 mb-4">
            Shown on the login page, in the sidebar, and in the header menu. PNG, JPEG, GIF, WebP, or SVG up to 5 MiB.
            For the sharpest result use a square <span className="font-mono">512×512</span> PNG with transparency — or an SVG, which stays crisp at every size.
          </p>

          <div className="flex items-start gap-4">
            <div className="rounded-xl bg-neutral-900/60 border border-neutral-700/60 p-3 flex items-center justify-center">
              <PanelBrandLogo logo={previewLogo} style={logoStyle} baseSize={64} alt="Panel logo preview" eager />
            </div>
            <div className="flex flex-col gap-3 min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={onPickLogo}
                  disabled={uploadingLogo || saving}
                  className="ks-primary-btn inline-flex items-center gap-2 bg-white text-black px-4 py-2 rounded hover:bg-gray-200 text-sm disabled:opacity-60"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="17 8 12 3 7 8" /><line x1="12" y1="3" x2="12" y2="15" /> </svg>
                  {uploadingLogo ? 'Uploading…' : logo ? 'Replace logo' : 'Upload logo'}
                </button>
                {logo && (
                  <button
                    type="button"
                    onClick={onRemoveLogo}
                    disabled={uploadingLogo || saving}
                    className="inline-flex items-center gap-2 bg-neutral-800 text-red-300 px-4 py-2 rounded hover:bg-neutral-700 text-sm disabled:opacity-60"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4"><polyline points="3 6 5 6 21 6" /><path d="M19 6 17.6 19a2 2 0 0 1-2 2H8.4a2 2 0 0 1-2-2L5 6" /><path d="M10 11v6" /><path d="M14 11v6" /> </svg>
                    Remove
                  </button>
                )}
              </div>
              {logo && (
                <p className="text-xs text-gray-500">
                  <span className="font-mono">{logo.filename}</span> · {logo.mime}
                </p>
              )}
              {(logoDims || logoFileInfo) && (
                <p className="text-xs text-gray-500">
                  {logoDims ? (
                    <>{logoDims.w}×{logoDims.h}px</>
                  ) : (
                    <>measuring…</>
                  )}
                  {logoFileInfo ? <> · {formatBytes(logoFileInfo.size)}</> : null}
                  {isSvg ? <> · vector (always sharp)</> : null}
                </p>
              )}
              {/* Hidden file input – click triggered by the button above so
                  we keep the native OS picker UI. */}
              <input
                ref={fileInputRef}
                type="file"
                accept={ALLOWED_LOGO_TYPES.join(',')}
                onChange={onLogoFile}
                className="hidden"
              />
            </div>
          </div>

          {/* Quality hints — the actual fix for "blurry/small logo" reports.
              Profile avatars never hit this because they render tiny +
              circular (cover-crop hides sins); the panel logo renders large
              + square, so a small or wide source shows immediately. */}
          {previewSrc && isSmallRaster && (
            <div className="mt-3 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2.5 text-xs text-amber-200">
              This image is only {logoDims?.w}×{logoDims?.h}px — it will look blurry when scaled up to the login tile.
              Re-export it at <span className="font-mono">512×512</span> or larger (or use an SVG) for a crisp logo.
            </div>
          )}
          {previewSrc && !isSvg && isNonSquare && logoStyle.fit === 'cover' && (
            <div className="mt-3 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2.5 text-xs text-amber-200">
              This image is wide ({logoDims?.w}×{logoDims?.h}px) and fit is set to <span className="font-mono">cover</span>, so the sides will be cropped.
              Switch fit to <span className="font-mono">contain</span> below to show the whole logo.
            </div>
          )}
          {previewSrc && !isSvg && isNonSquare && logoStyle.fit === 'contain' && (
            <p className="mt-2 text-xs text-gray-500">
              Wide source ({logoDims?.w}×{logoDims?.h}px) shown whole via <span className="font-mono">contain</span> — letterboxing is expected. A square export fills the tile better.
            </p>
          )}

          {/* Live multi-size preview — the same renderer the login page,
              sidebar and header use, so what you see here is what ships. */}
          {previewSrc && (
            <div className="mt-4 rounded-xl border border-white/10 bg-black/30 p-4">
              <p className="text-xs font-medium text-gray-400 mb-3">Live preview — exactly how it renders across the panel</p>
              <div className="flex items-end gap-6">
                <div className="flex flex-col items-center gap-1.5">
                  <PanelBrandLogo logo={previewLogo} style={logoStyle} baseSize={64} alt="Login-size logo preview" eager />
                  <span className="text-[11px] text-gray-500">Login · 64</span>
                </div>
                <div className="flex flex-col items-center gap-1.5">
                  <PanelBrandLogo logo={previewLogo} style={logoStyle} baseSize={28} alt="Sidebar-size logo preview" />
                  <span className="text-[11px] text-gray-500">Sidebar · 28</span>
                </div>
                <div className="flex flex-col items-center gap-1.5">
                  <PanelBrandLogo logo={previewLogo} style={logoStyle} baseSize={16} alt="Small-size logo preview" />
                  <span className="text-[11px] text-gray-500">Compact · 16</span>
                </div>
              </div>
            </div>
          )}

          {/* Logo presentation controls */}
          <div className="mt-5 grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">Fit</label>
              <div className="flex flex-wrap gap-2">
                {([
                  ['contain', 'Contain (whole logo)'],
                  ['cover', 'Cover (fill + crop)'],
                  ['fill', 'Fill (stretch)'],
                ] as Array<[string, string]>).map(([v, label]) => (
                  <button key={v} type="button" onClick={() => patchLogo({ fit: v })} className={segBtn(logoStyle.fit === v)} title={v === 'contain' ? 'Recommended — shows the whole image, never crops, never stretches.' : v === 'cover' ? 'Fills the tile; wide/tall images get cropped.' : 'Stretches to fill; may distort.'}>
                    {label}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">Corners</label>
              <div className="flex flex-wrap gap-2">
                {([
                  ['large', 'Rounded XL'],
                  ['rounded', 'Rounded'],
                  ['circle', 'Circle'],
                  ['square', 'Square'],
                ] as Array<[string, string]>).map(([v, label]) => (
                  <button key={v} type="button" onClick={() => patchLogo({ shape: v })} className={segBtn(logoStyle.shape === v)}>
                    {label}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">Tile size</label>
              <div className="flex flex-wrap gap-2">
                {([
                  ['sm', 'Small'],
                  ['md', 'Medium'],
                  ['lg', 'Large'],
                  ['xl', 'Extra large'],
                ] as Array<[string, string]>).map(([v, label]) => (
                  <button key={v} type="button" onClick={() => patchLogo({ size: v })} className={segBtn(logoStyle.size === v)}>
                    {label}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">Tile background</label>
              <div className="flex flex-wrap gap-2">
                {([
                  ['dark', 'Dark'],
                  ['transparent', 'Transparent'],
                  ['light', 'Light'],
                ] as Array<[string, string]>).map(([v, label]) => (
                  <button key={v} type="button" onClick={() => patchLogo({ bg: v })} className={segBtn(logoStyle.bg === v)}>
                    {label}
                  </button>
                ))}
              </div>
              <p className="mt-1.5 text-[11px] text-gray-500">Transparent suits logos that already carry their own background.</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">Shadow</label>
              <div className="flex flex-wrap gap-2">
                {(['none', 'sm', 'md', 'lg', 'glow'] as string[]).map((v) => (
                  <button key={v} type="button" onClick={() => patchLogo({ shadow: v })} className={segBtn(logoStyle.shadow === v)}>
                    {v === 'none' ? 'None' : v === 'glow' ? 'Glow' : v.toUpperCase()}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">Border ring</label>
              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={() => patchLogo({ ring: '1' })} className={segBtn(logoStyle.ring === '1')}>On</button>
                <button type="button" onClick={() => patchLogo({ ring: '0' })} className={segBtn(logoStyle.ring === '0')}>Off</button>
              </div>
              <p className="mt-1.5 text-[11px] text-gray-500">Turn off for edge-to-edge artwork.</p>
            </div>
          </div>
        </section>

        {/* ===================== PANEL NAME ===================== */}
        <section>
          <div className="flex items-center justify-between mb-1">
            <h3 className="text-sm font-semibold uppercase tracking-wide text-gray-400">
              Panel Name
            </h3>
            <button type="button" onClick={resetStyle} className="text-xs text-gray-400 hover:text-white underline underline-offset-2 decoration-white/20">
              Reset styling
            </button>
          </div>
          <p className="text-xs text-gray-500 mb-4">
            Appears on the login page, in the sidebar, and in the browser tab title.
          </p>

          {/* Live preview — updates as you type/pick, before saving. */}
          <div className="rounded-xl border border-white/10 bg-black/40 px-4 py-5 mb-4 flex items-center gap-3 overflow-hidden">
            <PanelBrandLogo logo={previewLogo} style={logoStyle} baseSize={40} alt="" />
            <div className="min-w-0">
              <PanelBrandName name={name} style={nameStyle} basePx={26} />
              <p className="text-[11px] text-gray-500 mt-1">Live preview</p>
            </div>
          </div>

          <div className="space-y-5">
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1" htmlFor="panel-name">
                Name
              </label>
              <input
                id="panel-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                className={fieldClass}
                placeholder="KS Panel"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">Color</label>
                <div className="flex items-center gap-3">
                  <input
                    type="color"
                    value={/^#[0-9a-fA-F]{6}$/.test(nameStyle.color) ? nameStyle.color : '#ffffff'}
                    onChange={(e) => patchName({ color: e.target.value })}
                    disabled={showGradient}
                    className="h-10 w-12 bg-transparent border border-white/10 rounded cursor-pointer disabled:opacity-40"
                    aria-label="Pick a panel name color"
                  />
                  <input
                    value={nameStyle.color}
                    onChange={(e) => patchName({ color: e.target.value })}
                    maxLength={7}
                    disabled={showGradient}
                    className={fieldClass + ' w-28 disabled:opacity-40'}
                    placeholder="#ffffff"
                  />
                </div>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {NAME_COLOR_PRESETS.map((c) => (
                    <button
                      key={c}
                      type="button"
                      title={c}
                      disabled={showGradient}
                      onClick={() => patchName({ color: c })}
                      className={`h-6 w-6 rounded-md border transition-transform hover:scale-110 disabled:opacity-40 ${nameStyle.color.toLowerCase() === c ? 'border-white ring-2 ring-white/40' : 'border-white/20'}`}
                      style={{ background: c }}
                    />
                  ))}
                </div>
                {showGradient && <p className="mt-1.5 text-[11px] text-gray-500">Color is ignored while the gradient effect is on.</p>}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1" htmlFor="panel-font">Font</label>
                <select id="panel-font" value={nameStyle.font} onChange={(e) => patchName({ font: e.target.value })} className={fieldClass}>
                  {Object.entries(PANEL_NAME_FONTS).map(([key, f]) => (
                    <option key={key} value={key} className="bg-neutral-900 text-white" style={{ fontFamily: f.stack }}>
                      {f.label}
                    </option>
                  ))}
                </select>
                <label className="block text-sm font-medium text-gray-300 mt-4 mb-1" htmlFor="panel-weight">Weight</label>
                <select id="panel-weight" value={nameStyle.weight} onChange={(e) => patchName({ weight: e.target.value })} className={fieldClass}>
                  {(['400', '500', '600', '700', '800', '900'] as string[]).map((w) => (
                    <option key={w} value={w} className="bg-neutral-900 text-white" style={{ fontWeight: Number(w) }}>
                      {w}{w === '400' ? ' · Regular' : w === '700' ? ' · Bold' : w === '800' ? ' · Extra bold' : w === '900' ? ' · Black' : ''}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">Size</label>
              <div className="flex flex-wrap gap-2">
                {([
                  ['sm', 'Small'],
                  ['md', 'Medium'],
                  ['lg', 'Large'],
                  ['xl', 'Extra large'],
                ] as Array<[string, string]>).map(([v, label]) => (
                  <button key={v} type="button" onClick={() => patchName({ size: v })} className={segBtn(nameStyle.size === v)}>
                    {label}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">Effect</label>
              <div className="flex flex-wrap gap-2">
                {([
                  ['shadow', 'Shadow'],
                  ['outline', 'Outline'],
                  ['3d', '3D'],
                  ['neon', 'Neon glow'],
                  ['gradient', 'Gradient'],
                  ['none', 'Flat'],
                ] as Array<[string, string]>).map(([v, label]) => (
                  <button key={v} type="button" onClick={() => patchName({ effect: v })} className={segBtn(nameStyle.effect === v)}>
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {showShadow && (
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">Shadow strength</label>
                <div className="flex flex-wrap gap-2">
                  {(['none', 'sm', 'md', 'lg', 'glow'] as string[]).map((v) => (
                    <button key={v} type="button" onClick={() => patchName({ shadow: v })} className={segBtn(nameStyle.shadow === v)}>
                      {v === 'none' ? 'None' : v === 'glow' ? 'Glow' : v.toUpperCase()}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {showGradient && (
              <div className="rounded-xl border border-white/10 bg-black/20 p-4 space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-1">Gradient from</label>
                    <div className="flex items-center gap-3">
                      <input
                        type="color"
                        value={/^#[0-9a-fA-F]{6}$/.test(nameStyle.gradientFrom) ? nameStyle.gradientFrom : '#ffffff'}
                        onChange={(e) => patchName({ gradientFrom: e.target.value })}
                        className="h-10 w-12 bg-transparent border border-white/10 rounded cursor-pointer"
                        aria-label="Pick a gradient start color"
                      />
                      <input
                        value={nameStyle.gradientFrom}
                        onChange={(e) => patchName({ gradientFrom: e.target.value })}
                        maxLength={7}
                        className={fieldClass + ' w-28'}
                        placeholder="#ffffff"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-1">Gradient to</label>
                    <div className="flex items-center gap-3">
                      <input
                        type="color"
                        value={/^#[0-9a-fA-F]{6}$/.test(nameStyle.gradientTo) ? nameStyle.gradientTo : '#a5b4fc'}
                        onChange={(e) => patchName({ gradientTo: e.target.value })}
                        className="h-10 w-12 bg-transparent border border-white/10 rounded cursor-pointer"
                        aria-label="Pick a gradient end color"
                      />
                      <input
                        value={nameStyle.gradientTo}
                        onChange={(e) => patchName({ gradientTo: e.target.value })}
                        maxLength={7}
                        className={fieldClass + ' w-28'}
                        placeholder="#a5b4fc"
                      />
                    </div>
                  </div>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {GRADIENT_PRESETS.map(([from, to]) => (
                    <button
                      key={from + to}
                      type="button"
                      title={`${from} → ${to}`}
                      onClick={() => patchName({ gradientFrom: from, gradientTo: to })}
                      className={`h-6 w-12 rounded-md border ${nameStyle.gradientFrom.toLowerCase() === from && nameStyle.gradientTo.toLowerCase() === to ? 'border-white ring-2 ring-white/40' : 'border-white/20'}`}
                      style={{ background: `linear-gradient(90deg, ${from}, ${to})` }}
                    />
                  ))}
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-1">Direction</label>
                  <div className="flex flex-wrap gap-2">
                    {([
                      ['90deg', '→ Across'],
                      ['135deg', '↘ Diagonal'],
                      ['180deg', '↓ Down'],
                    ] as Array<[string, string]>).map(([v, label]) => (
                      <button key={v} type="button" onClick={() => patchName({ gradientDir: v })} className={segBtn(nameStyle.gradientDir === v)}>
                        {label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">Style</label>
                <div className="flex flex-wrap gap-2">
                  <button type="button" onClick={() => patchName({ italic: nameStyle.italic === '1' ? '0' : '1' })} className={segBtn(nameStyle.italic === '1')} title="Italic">
                    <span className="italic">I</span>talic
                  </button>
                  <button type="button" onClick={() => patchName({ uppercase: nameStyle.uppercase === '1' ? '0' : '1' })} className={segBtn(nameStyle.uppercase === '1')} title="Uppercase">
                    ABC
                  </button>
                </div>
              </div>
              <div className="sm:col-span-2">
                <label className="block text-sm font-medium text-gray-300 mb-1">Letter spacing</label>
                <div className="flex flex-wrap gap-2">
                  {([
                    ['tight', 'Tight'],
                    ['normal', 'Normal'],
                    ['wide', 'Wide'],
                  ] as Array<[string, string]>).map(([v, label]) => (
                    <button key={v} type="button" onClick={() => patchName({ spacing: v })} className={segBtn(nameStyle.spacing === v)}>
                      {label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
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
    </div>
  );
};

export default Settings;
