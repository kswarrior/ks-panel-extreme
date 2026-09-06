import React, { useEffect, useRef, useState } from 'react';
import {
  deletePanelLogo,
  getSettings,
  updateSettings,
  uploadPanelLogo,
} from '@/features/settings/api/settings';
import { useSettingsStore } from '@/shared/stores/settingsStore';
import SkeletonCard from '@/shared/components/ui/SkeletonCard';
import { useConfirm } from '@/shared/stores/confirmStore';

const MAX_LOGO_BYTES = 5 * 1024 * 1024; // mirrors server-side limit
const ALLOWED_LOGO_TYPES = ['image/png', 'image/jpeg', 'image/jpg', 'image/gif', 'image/webp', 'image/svg+xml'];

// The Settings page is now the BRAND panel — only the panel name + logo
// live here. Everything auth-related (SMTP, registration gates, OAuth
// providers, OTP/SMS channels, the TOTP authenticator-app connection,
// and the configurable registration requirement policy) moved to
// Security > Authority. The AI Assistant config lives in the chat panel's
// gear menu (bottom-right bubble). The SettingsHandler
// backend still accepts the auth fields, but Settings no longer sends
// them — leaving their persisted values intact for the Authority page
// to read + write.
const Settings: React.FC = () => {
  const setPanelName = useSettingsStore((s) => s.setPanelName);
  const setPanelLogo = useSettingsStore((s) => s.setPanelLogo);
  const confirm = useConfirm();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [name, setName] = useState('KS Panel');
  const [logo, setLogo] = useState<{ url: string; mime: string; filename?: string } | null>(null);
  // Cache-bust the <img> when the user picks a local file to preview it
  // before the upload finishes. Resets to empty when the upload completes
  // (the server returns the canonical URL).
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const snap = await getSettings();
        setName(snap.panel_name || 'KS Panel');
        setLogo(snap.panel_logo || null);
      } catch (e: any) {
        setError(e?.response?.data || 'Failed to load settings');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

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
      // We only send the brand fields — auth-related fields (SMTP, allow
      // registration, verify_required, etc) live on Security > Authority
      // now and must not be wiped here.
      const snap = await updateSettings({ panel_name: name.trim() });
      setName(snap.panel_name);
      // Push the new name into the global store so Header / Login pick it up.
      setPanelName(snap.panel_name);
      document.title = snap.panel_name;
      if (snap.panel_logo) setLogo(snap.panel_logo);
      setPanelLogo(snap.panel_logo || null);
      setSuccess('Saved.');
    } catch (e: any) {
      setError(e?.response?.data || 'Failed to save settings');
    } finally {
      setSaving(false);
    }
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

  return (
    // Title lives in the app header ("Settings").
    <div>
      <form
        onSubmit={submit}
        className="glass-card ks-form-card rounded-xl space-y-6 max-w-2xl"
      >
        {/* ===================== GENERAL ===================== */}
        <section>
          <h3 className="text-sm font-semibold uppercase tracking-wide text-gray-400 mb-4">
            General
          </h3>
          <div className="space-y-6">
            {/* Logo card */}
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">
                Panel Logo
              </label>
              <p className="text-xs text-gray-500 mb-3">
                Shown to the left of the panel name on the login page and in
                the application header. PNG, JPEG, GIF, WebP, or SVG up to 5 MiB.
              </p>
              <div className="flex items-center gap-4">
                <div className="h-16 w-16 rounded-xl bg-neutral-900 border border-neutral-700 flex items-center justify-center overflow-hidden">
                  {previewSrc ? (
                    <img
                      src={previewSrc}
                      alt="Panel logo preview"
                      className="h-full w-full object-contain"
                    />
                  ) : (
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.6"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      className="h-8 w-8 text-gray-400"
                      aria-hidden="true"
                    >
                      <rect x="3" y="3" width="18" height="18" rx="3" />
                      <circle cx="8.5" cy="8.5" r="1.5" />
                      <path d="m21 15-5-5L5 21" />
                     </svg>
                  )}
                </div>
                <div className="flex flex-col gap-3">
                  <div className="flex items-center gap-2">
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
                </div>
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

            {/* Panel name */}
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1" htmlFor="panel-name">
                Panel Name
              </label>
              <p className="text-xs text-gray-500 mb-2">
                Appears on the login page, in the application header, in the
                sidebar, and in the browser tab title.
              </p>
                <input
                  id="panel-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                  className="w-full bg-black/30 backdrop-blur-md text-white border border-white/10 placeholder-gray-500 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-white/60 focus:border-white/40 transition-colors duration-150"
                  placeholder="KS Panel"
                />
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
