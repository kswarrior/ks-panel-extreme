import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '@/shared/stores/authStore';
import Avatar from '@/shared/components/ui/Avatar';
import { BioMarkdownEditor } from '@/shared/components/ui/MarkdownBio';
import {
  DEFAULT_AVATAR_SYMBOLS,
  SocialIcon,
  socialLabel,
} from '@/shared/components/ui/SocialIcons';
import {
  changePassword,
  changeUsername,
  getMyProfile,
  updateMyProfile,
  uploadAvatar,
  uploadBanner,
  deleteAvatar,
  deleteBanner,
} from '@/features/account/api/profile';
import { getMyAuth, updateMyAuth } from '@/features/auth/api/meAuth';
import type { Profile, SocialLink } from '@/shared/types/user';
import { CUSTOM_LINK_TYPE, SOCIAL_LINK_TYPES } from '@/shared/types/user';
import { PermissionKey, hasPermissionAny } from '@/shared/types/permissions';
import { AUTHORITY_PROVIDER, type AuthProviderInfo, type UserAuthorityMode } from '@/shared/types/authority';
import FormSkeleton from '@/shared/components/ui/FormSkeleton';

// Account-area sub-cap check. Mirrors the backend's
// checker.EnsureAny(uid, VIEW_ACCOUNT, subCap) — holding the umbrella
// VIEW_ACCOUNT implies every customization sub-cap, so any role with the
// page access (the seeded admin/moderator/user roles do) keeps full
// personalization, while a narrowed role (e.g. only ACCOUNT_EDIT_BANNER) can
// be scoped to just one piece.
function canCustomize(perms: string[] | ReadonlySet<string>, subCap: string): boolean {
  return hasPermissionAny(perms, PermissionKey.VIEW_ACCOUNT, subCap);
}

// Reusable styled input shared across every field in the page. Mirrors the
// GlassField class so the whole page reads consistently with the rest of the
// panel, without pulling GlassField's cloneElement wrapping (we need to mix
// inputs + selects + textareas + buttons inside one card).
const fieldClass =
  'w-full bg-black/30 backdrop-blur-md text-white placeholder-gray-500 ' +
  'border border-white/10 rounded-md px-3 py-2 text-sm ' +
  'focus:outline-none focus:ring-2 focus:ring-white/60 focus:border-white/40 ' +
  'transition-colors duration-150';

const btnPrimary =
  'inline-flex items-center justify-center bg-white text-black text-sm py-2 px-4 rounded ' +
  'hover:bg-gray-200 disabled:opacity-60 transition-colors';
const btnGhost =
  'inline-flex items-center justify-center text-sm py-2 px-3 rounded ' +
  'text-gray-200 hover:bg-white/10 border border-white/10 disabled:opacity-60 transition-colors';

// True when a link's `type` is not one of the built-in keys, i.e. it's a
// user-supplied custom type. The editor renders an extra "type name" input
// for those rows; built-in rows stay exactly as they were.
const isCustomLinkType = (t: string) =>
  !SOCIAL_LINK_TYPES.includes(t as (typeof SOCIAL_LINK_TYPES)[number]);

// Local status message helper — keeps the JSX clean.
function Msg({ msg }: { msg: { kind: 'ok' | 'err'; text: string } | null }) {
  if (!msg) return null;
  return (
    <p
      className={`mt-3 text-sm ${msg.kind === 'ok' ? 'text-green-400' : 'text-red-400'}`}
    >
      {msg.text}
    </p>
  );
}

type UploadKind = 'avatar' | 'banner';

const Account: React.FC = () => {
  const { user, setAuth, clearAuth, token, permissions } = useAuthStore();
  const navigate = useNavigate();

  // Derive each Account area sub-cap once per render. Mirrors the backend
  // route gates so the UI hides exactly what the server would 403 anyway —
  // a role holding only ACCOUNT_EDIT_BANNER, for example, sees banner
  // controls but not the bio / accent / avatar symbol / avatar upload
  // sections. VIEW_ACCOUNT (the umbrella) implies every sub-cap so the
  // default seeded roles see everything.
  const canEditBanner = canCustomize(permissions, PermissionKey.ACCOUNT_EDIT_BANNER);
  const canEditAbout = canCustomize(permissions, PermissionKey.ACCOUNT_EDIT_ABOUT);
  const canEditAccent = canCustomize(permissions, PermissionKey.ACCOUNT_EDIT_ACCENT);
  const canUseAvatarSymbol = canCustomize(permissions, PermissionKey.ACCOUNT_USE_AVATAR_SYMBOL);
  const canUploadAvatar = canCustomize(permissions, PermissionKey.ACCOUNT_UPLOAD_AVATAR);
  // Has any profile-edit capability: drives whether the Profile form (and
  // its Save button) renders at all. If the role is allowed to read but not
  // write the profile (none of the sub-caps granted) the editable form is
  // hidden entirely.
  const canEditAnyProfile =
    canEditBanner || canEditAbout || canEditAccent || canUseAvatarSymbol || canUploadAvatar;

  // ── Profile state (loaded in an effect once we know the user id) ────────
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loadingProfile, setLoadingProfile] = useState(false);
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileMsg, setProfileMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);

  // Buffered editable fields — only flushed to the API on Save. Keeping them
  // separate from `profile` lets the header/avatar preview update live without
  // clobbering the saved snapshot, and makes "cancel the edit" trivial.
  const [displayName, setDisplayName] = useState('');
  const [bio, setBio] = useState('');
  const [pronouns, setPronouns] = useState('');
  const [accentColor, setAccentColor] = useState('#5865F2');
  const [avatarSymbol, setAvatarSymbol] = useState('');
  const [links, setLinks] = useState<SocialLink[]>([]);

  const [imgBusy, setImgBusy] = useState<UploadKind | null>(null);
  const [imgMsg, setImgMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);

  // ── Username form state ─────────────────────────────────────────────────
  const [username, setUsername] = useState('');
  const [savingUsername, setSavingUsername] = useState(false);
  const [usernameMsg, setUsernameMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);

  // ── Password form state ──────────────────────────────────────────────────
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [savingPassword, setSavingPassword] = useState(false);
  const [passwordMsg, setPasswordMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);

  const avatarInputRef = useRef<HTMLInputElement | null>(null);
  const bannerInputRef = useRef<HTMLInputElement | null>(null);

  // ── Sign-in authorities state ────────────────────────────────────────────
  // Per-user "make my account safe" snap — the set of authority providers
  // the user has turned on for their own login and HOW MANY of them a
  // sign-in must satisfy. Loaded in parallel with the profile so the
  // Account page paints the authorities card in the same first fetch.
  const [authProviders, setAuthProviders] = useState<AuthProviderInfo[]>([]);
  const [authEnabled, setAuthEnabled] = useState<string[]>([]);
  const [authMode, setAuthMode] = useState<UserAuthorityMode>('any');
  const [authN, setAuthN] = useState(1);
  const [authUnrestricted, setAuthUnrestricted] = useState(true);
  const [loadingAuth, setLoadingAuth] = useState(false);
  const [savingAuth, setSavingAuth] = useState(false);
  const [authMsg, setAuthMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);

  // Load the caller's profile once (and whenever the authenticated user id
  // flips — e.g. after a username change the user.id stays stable, but a
  // fresh login would re-mount the page). We intentionally don't refetch on
  // every render so the form's buffered values aren't stomped by the next
  // Save round trip while the user is still typing.
  const loadProfile = useCallback(async () => {
    setLoadingProfile(true);
    try {
      const p = await getMyProfile();
      setProfile(p);
      setDisplayName(p.display_name ?? '');
      setBio(p.bio ?? '');
      setPronouns(p.pronouns ?? '');
      setAccentColor(p.accent_color && p.accent_color !== '' ? p.accent_color : '#5865F2');
      setAvatarSymbol(p.avatar_symbol ?? '');
      setLinks(Array.isArray(p.social_links) ? p.social_links : []);
    } catch (e: any) {
      setProfileMsg({ kind: 'err', text: e?.response?.data || 'Failed to load profile' });
    } finally {
      setLoadingProfile(false);
    }
  }, []);

  // loadAuth fetches the available + currently-persisted sign-in
  // authorities for the logged-in user. Kept separate from loadProfile
  // so a save on one card doesn't clobber the other's in-flight state.
  const loadAuth = useCallback(async () => {
    setLoadingAuth(true);
    setAuthMsg(null);
    try {
      const res = await getMyAuth();
      setAuthProviders(res.available);
      setAuthEnabled(res.cfg.enabled_authorities);
      setAuthMode(res.cfg.required_mode);
      setAuthN(res.cfg.required_n);
      setAuthUnrestricted(!!res.unrestricted);
    } catch (e: any) {
      setAuthMsg({ kind: 'err', text: e?.response?.data || 'Failed to load sign-in authorities' });
    } finally {
      setLoadingAuth(false);
    }
  }, []);

  useEffect(() => {
    if (user) {
      setUsername(user.username);
      loadProfile();
      loadAuth();
    }
  }, [user, loadProfile, loadAuth]);

  if (!user) {
    return <FormSkeleton fields={4} />;
  }

  // The header preview uses the buffered (unsaved) values so the user sees
  // the change live before committing — same UX as Discord's settings modal.
  const previewName =
    (displayName && displayName.trim()) || user.username;
  const avatarUrl = profile?.avatar_url; // undefined means fall back to symbol
  const bannerUrl = profile?.banner_url;

  const submitProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingProfile(true);
    setProfileMsg(null);
    try {
      // Build a PARTIAL payload — only include the fields the user's
      // role grants the matching sub-cap (umbrella implies all, the same
      // OR gate the backend uses). Sending only the keys the caller is
      // allowed to write avoids a 403 round-trip when a narrowed role
      // (e.g. only ACCOUNT_EDIT_BANNER) edits fields outside its scope,
      // and keeps the wire payload lean too. The backend re-validates
      // every field it receives, so this is purely a client-side
      // convenience that mirrors the route's permission boundary.
      const payload: Parameters<typeof updateMyProfile>[0] = {};
      if (canEditAbout) {
        payload.display_name = displayName;
        payload.bio = bio;
        payload.pronouns = pronouns;
        payload.social_links = links;
      }
      if (canEditAccent) {
        payload.accent_color = accentColor;
      }
      if (canUseAvatarSymbol) {
        payload.avatar_symbol = avatarSymbol;
      }
      const updated = await updateMyProfile(payload);
      setProfile(updated);
      // Keep the local buffer in sync with the server-canonicalized value
      // (e.g. link types get lowercased); the form should "stick" on Save.
      setLinks(Array.isArray(updated.social_links) ? updated.social_links : []);
      setProfileMsg({ kind: 'ok', text: 'Profile saved.' });
    } catch (e: any) {
      setProfileMsg({ kind: 'err', text: e?.response?.data || 'Failed to save profile' });
    } finally {
      setSavingProfile(false);
    }
  };

  // Update local <img src> immediately after an upload so the user sees the
  // new picture without a manual refresh. The backend returns the refreshed
  // profile (with a cache-busted URL because the filename carries random hex),
  // so we just point `profile` back at it.
  const onImagePicked = async (kind: UploadKind, file: File | undefined) => {
    if (!file) return;
    setImgBusy(kind);
    setImgMsg(null);
    try {
      const updated =
        kind === 'avatar' ? await uploadAvatar(file) : await uploadBanner(file);
      setProfile(updated);
      setImgMsg({ kind: 'ok', text: `${kind === 'avatar' ? 'Avatar' : 'Banner'} updated.` });
    } catch (e: any) {
      setImgMsg({ kind: 'err', text: e?.response?.data || `Failed to upload ${kind}` });
    } finally {
      setImgBusy(null);
    }
  };

  const onImageRemoved = async (kind: UploadKind) => {
    setImgBusy(kind);
    setImgMsg(null);
    try {
      const updated =
        kind === 'avatar' ? await deleteAvatar() : await deleteBanner();
      setProfile(updated);
      setImgMsg({ kind: 'ok', text: `${kind === 'avatar' ? 'Avatar' : 'Banner'} removed.` });
    } catch (e: any) {
      setImgMsg({ kind: 'err', text: e?.response?.data || `Failed to remove ${kind}` });
    } finally {
      setImgBusy(null);
    }
  };

  // ── social links editor: add / edit / remove entries ────────────────────
  const addLink = () =>
    setLinks((l) => [...l, { type: 'website', label: '', url: '' }]);
  const updateLink = (i: number, patch: Partial<SocialLink>) =>
    setLinks((l) => l.map((link, idx) => (idx === i ? { ...link, ...patch } : link)));
  const removeLink = (i: number) =>
    setLinks((l) => l.filter((_, idx) => idx !== i));

  const submitUsername = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim()) {
      setUsernameMsg({ kind: 'err', text: 'Username is required' });
      return;
    }
    if (username.trim() === user.username) {
      setUsernameMsg({ kind: 'err', text: 'That is already your username' });
      return;
    }
    setSavingUsername(true);
    setUsernameMsg(null);
    try {
      await changeUsername(username.trim());
      // Reflect the change locally so the header/sidebar stay in sync.
      setAuth({ ...user, username: username.trim() }, token ?? '', permissions);
      setUsernameMsg({ kind: 'ok', text: 'Username updated.' });
    } catch (e: any) {
      setUsernameMsg({ kind: 'err', text: e?.response?.data || 'Failed to update username' });
    } finally {
      setSavingUsername(false);
    }
  };

  const submitPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!oldPassword || !newPassword || !confirmPassword) {
      setPasswordMsg({ kind: 'err', text: 'All fields are required' });
      return;
    }
    if (newPassword.length < 8) {
      setPasswordMsg({ kind: 'err', text: 'New password must be at least 8 characters' });
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordMsg({ kind: 'err', text: 'New passwords do not match' });
      return;
    }
    setSavingPassword(true);
    setPasswordMsg(null);
    try {
      await changePassword(oldPassword, newPassword);
      // Backend invalidates ALL sessions for this user on password change
      // (me_handler.go:146). Clear local auth state and redirect to login
      // so the user re-authenticates with the new password.
      clearAuth();
      navigate('/auth/login', { replace: true });
      return;
    } catch (e: any) {
      setPasswordMsg({ kind: 'err', text: e?.response?.data || 'Failed to update password' });
    } finally {
      setSavingPassword(false);
    }
  };

  // ── Sign-in authorities handlers ─────────────────────────────────────────
  // toggleAuthority flips membership of an authority id in the user's
  // enabled set. password is implicit + always-on; the picker renders it
  // as a disabled pill so the user can't accidentally disable the only
  // authority keeping them logged in.
  const toggleAuthority = (id: string) => {
    if (id === AUTHORITY_PROVIDER.password) return; // always enabled
    setAuthEnabled((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  };

  const submitAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingAuth(true);
    setAuthMsg(null);
    // Always keep password enabled — the server enforces this too but
    // surfacing the validation before the round-trip is friendlier.
    const enabled = Array.from(new Set([...authEnabled, AUTHORITY_PROVIDER.password]));
    if (enabled.length < 1) {
      setAuthMsg({ kind: 'err', text: 'At least one sign-in authority is required.' });
      setSavingAuth(false);
      return;
    }
    if (authMode === 'n') {
      if (authN < 1 || authN > enabled.length) {
        setAuthMsg({
          kind: 'err',
          text: `When "N of allowed" is selected, the count must be between 1 and ${enabled.length}.`,
        });
        setSavingAuth(false);
        return;
      }
    }
    try {
      const res = await updateMyAuth({
        enabled_authorities: enabled,
        required_mode: authMode,
        required_n: authN,
      });
      setAuthProviders(res.available);
      setAuthEnabled(res.cfg.enabled_authorities);
      setAuthMode(res.cfg.required_mode);
      setAuthN(res.cfg.required_n);
      setAuthUnrestricted(!!res.unrestricted);
      setAuthMsg({ kind: 'ok', text: 'Sign-in authorities saved.' });
    } catch (e: any) {
      setAuthMsg({ kind: 'err', text: e?.response?.data || 'Failed to save authorities' });
    } finally {
      setSavingAuth(false);
    }
  };

  return (
    // Title lives in the app header ("Account").
    <div className="space-y-4">

      {/* ── Profile preview + editor ─────────────────────────────────────── */}
      <div className="ks-card ks-form-card rounded-xl overflow-hidden">
        {/* Banner: 600x180 Discord-style ribbon. Click to upload or replace. */}
        <div
          className="relative h-36 sm:h-44 group cursor-pointer"
          style={{
            // Use the accent color as a gradient placeholder when no banner
            // is uploaded — keeps the banner area looking intentional even
            // before the user picks an image. Mirrors the avatar fallback.
            background: bannerUrl
              ? undefined
              : `linear-gradient(135deg, ${accentColor} 0%, ${accentColor}cc 60%, #0b0f1a 100%)`,
          }}
          onClick={() => bannerInputRef.current?.click()}
          title="Click to upload a banner image"
        >
          {bannerUrl && (
            <img
              src={bannerUrl}
              alt="Profile banner"
              className="w-full h-full object-cover"
            />
          )}
          {/* Upload / remove controls overlay */}
          <div className="absolute inset-0 flex items-center justify-end gap-2 p-3 bg-black/20 opacity-0 group-hover:opacity-100 transition-opacity">
            <button
              type="button"
              className={btnGhost + ' !bg-black/40'}
              disabled={imgBusy !== null}
              onClick={(e) => {
                e.stopPropagation();
                bannerInputRef.current?.click();
              }}
            >
              {imgBusy === 'banner' ? 'Uploading…' : bannerUrl ? 'Replace' : 'Upload'}
            </button>
            {bannerUrl && (
              <button
                type="button"
                className={btnGhost + ' !bg-black/40'}
                disabled={imgBusy !== null}
                onClick={(e) => {
                  e.stopPropagation();
                  onImageRemoved('banner');
                }}
              >
                Remove
              </button>
            )}
          </div>
        </div>

        {/* Header row: avatar + name. The avatar overlaps the banner edge
            (Discord-like) and sits inside the accent ring picked above. */}
        <div className="px-5 pb-5 -mt-10 flex flex-col sm:flex-row sm:items-end gap-4">
          <div className="relative group shrink-0">
            <Avatar
              name={previewName}
              imageUrl={avatarUrl}
              symbol={avatarSymbol}
              accentColor={accentColor}
              size={96}
              className="ring-4 ring-[#0b0f1a]"
            />
            <button
              type="button"
              className="absolute inset-0 rounded-full flex items-center justify-center bg-black/50 text-white text-xs opacity-0 group-hover:opacity-100 transition-opacity"
              disabled={imgBusy !== null}
              onClick={() => avatarInputRef.current?.click()}
              title="Change avatar"
            >
              {imgBusy === 'avatar' ? 'Uploading…' : 'Change'}
            </button>
          </div>

          <div className="flex flex-col gap-1 min-w-0">
            <span className="text-lg font-semibold text-white truncate">
              {previewName}
            </span>
            <span className="text-sm text-gray-400 truncate">@{user.username}</span>
            {pronouns && <span className="text-xs text-gray-500">{pronouns}</span>}
          </div>

          <div className="sm:ml-auto flex items-center gap-2">
            <button
              type="button"
              className={btnGhost}
              disabled={imgBusy !== null}
              onClick={() => avatarInputRef.current?.click()}
            >
              Upload avatar
            </button>
            {avatarUrl && (
              <button
                type="button"
                className={btnGhost}
                disabled={imgBusy !== null}
                onClick={() => onImageRemoved('avatar')}
              >
                Remove
              </button>
            )}
          </div>
        </div>

        {/* The hidden file inputs back the click-to-upload pattern. Two
            separate refs (avatar vs banner) because the user may want to
            queue both at once even though they trigger them in sequence. */}
        <input
          ref={avatarInputRef}
          type="file"
          accept="image/png,image/jpeg,image/gif,image/webp,image/svg+xml"
          className="hidden"
          onChange={(e) => onImagePicked('avatar', e.target.files?.[0])}
        />
        <input
          ref={bannerInputRef}
          type="file"
          accept="image/png,image/jpeg,image/gif,image/webp,image/svg+xml"
          className="hidden"
          onChange={(e) => onImagePicked('banner', e.target.files?.[0])}
        />

        {imgMsg && <div className="px-5 pb-3"><Msg msg={imgMsg} /></div>}
      </div>

      {/* ── Profile editor form ──────────────────────────────────────────── */}
      {/* Only render the editable Profile form when the role has at least
          ONE profile sub-cap. A read-only role with VIEW_ACCOUNT but no
          edit sub-cap should see nothing here — the avatar/banner card
          above still lets them read their picture. Hiding the form is
          the simplest "fail-soft" for narrowed roles: matching what the
          server would 403 anyway. */}
      {canEditAnyProfile && (
      <form onSubmit={submitProfile} className="ks-card ks-form-card rounded-xl">
        <h3 className="text-base font-semibold text-white mb-1">Profile</h3>
        <p className="text-xs text-gray-400 mb-4">
          Show up however you like — display name, a banner, an avatar, links.
          Your username stays your unique handle; the display name is what
          others see.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* ACCOUNT_EDIT_ABOUT gates the display name, pronouns, bio and
              social links together — they ride the same field-level
              permission (see internal/api/handlers/profile_handler.go). */}
          {canEditAbout && (
          <>
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">Display name</label>
              <input
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                maxLength={64}
                className={fieldClass}
                placeholder={user.username}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">Pronouns</label>
              <input
                value={pronouns}
                onChange={(e) => setPronouns(e.target.value)}
                maxLength={32}
                className={fieldClass}
                placeholder="e.g. they/them"
              />
            </div>
            <div className="md:col-span-2">
              <BioMarkdownEditor
                value={bio}
                onChange={setBio}
                maxLength={1000}
                placeholder="Tell the panel who you are…"
                areaClassName={fieldClass}
                label="About me"
              />
            </div>
          </>
          )}

          {canEditAccent && (
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">Accent color</label>
            <div className="flex items-center gap-3">
              <input
                type="color"
                value={accentColor}
                onChange={(e) => setAccentColor(e.target.value)}
                className="h-10 w-12 bg-transparent border border-white/10 rounded cursor-pointer"
                aria-label="Pick an accent color"
              />
              <input
                value={accentColor}
                onChange={(e) => setAccentColor(e.target.value)}
                maxLength={7}
                className={fieldClass + ' w-24'}
                placeholder="#5865F2"
              />
            </div>
          </div>
          )}

          {canUseAvatarSymbol && (
          <div className="md:col-span-2">
            <label className="block text-sm font-medium text-gray-300 mb-1">
              Default avatar symbol
            </label>
            <p className="text-xs text-gray-400 mb-2">
              Used when no avatar image is uploaded. Pick one or leave the first
              (blank) to use your initials instead.
            </p>
            <div className="flex flex-wrap gap-2 max-h-32 overflow-y-auto p-1">
              {DEFAULT_AVATAR_SYMBOLS.map((sym) => {
                const selected = avatarSymbol === sym;
                return (
                  <button
                    type="button"
                    key={sym || 'blank'}
                    onClick={() => setAvatarSymbol(sym)}
                    title={sym ? `Use ${sym}` : 'Use initials'}
                    className={
                      'w-10 h-10 rounded-md flex items-center justify-center text-lg border transition-colors ' +
                      (selected
                        ? 'border-white bg-white/10 text-white'
                        : 'border-white/10 bg-black/30 text-gray-300 hover:bg-white/5')
                    }
                  >
                    {sym ? (
                      <span>{sym}</span>
                    ) : (
                      <span className="text-xs font-semibold">ABC</span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
          )}

          {/* ── Social links editor (rides ACCOUNT_EDIT_ABOUT, like bio) ──── */}
          {canEditAbout && (
          <div className="md:col-span-2">
            <div className="flex items-center justify-between mb-1">
              <label className="block text-sm font-medium text-gray-300">Links</label>
              <button
                type="button"
                onClick={addLink}
                disabled={links.length >= 25}
                className={btnGhost}
              >
                + Add link
              </button>
            </div>
            <p className="text-xs text-gray-400 mb-2">
              YouTube, GitHub, Hugging Face, Instagram, Facebook, and more.
            </p>

            <div className="space-y-2">
              {links.length === 0 && (
                <p className="text-xs text-gray-500 italic">No links yet.</p>
              )}
              {links.map((link, i) => {
                const custom = isCustomLinkType(link.type);
                return (
                <div key={i} className="ks-card ks-form-card rounded-md space-y-2">
                  {/* Row 1: icon + type select (+ custom name) + remove */}
                  <div className="flex items-center gap-2">
                    <span className="shrink-0 w-8 h-8 flex items-center justify-center rounded-md border border-white/10 bg-black/30 text-gray-300">
                      <SocialIcon type={link.type} className="w-4 h-4" />
                    </span>
                    <select
                      value={custom ? CUSTOM_LINK_TYPE : link.type}
                      onChange={(e) => {
                        const v = e.target.value;
                        // Picking "Custom…" blanks the stored key so the user
                        // types a fresh name in the field below; built-in keys
                        // are stored verbatim.
                        updateLink(i, { type: v === CUSTOM_LINK_TYPE ? '' : v });
                      }}
                      className={fieldClass + ' w-32 shrink-0'}
                      aria-label="Link type"
                    >
                      {SOCIAL_LINK_TYPES.map((t) => (
                        <option key={t} value={t} className="bg-neutral-900 text-white">
                          {socialLabel(t)}
                        </option>
                      ))}
                      <option value={CUSTOM_LINK_TYPE} className="bg-neutral-900 text-white">
                        Custom…
                      </option>
                    </select>
                    {custom && (
                      <input
                        value={link.type}
                        onChange={(e) => updateLink(i, { type: e.target.value })}
                        placeholder="Type name (e.g. linktree)"
                        maxLength={32}
                        className={fieldClass + ' flex-1 min-w-0'}
                        aria-label="Custom link type name"
                      />
                    )}
                    <button
                      type="button"
                      onClick={() => removeLink(i)}
                      className={btnGhost + ' shrink-0 !text-red-300 hover:!bg-red-500/20'}
                      aria-label="Remove link"
                    >
                      ✕
                    </button>
                  </div>
                  {/* Row 2: label + URL — always get full width so the URL
                      input is visible no matter how narrow the card is. */}
                  <div className="flex items-center gap-2">
                    <input
                      value={link.label}
                      onChange={(e) => updateLink(i, { label: e.target.value })}
                      placeholder="Label (optional)"
                      maxLength={64}
                      className={fieldClass + ' w-32 shrink-0'}
                    />
                    <input
                      value={link.url}
                      onChange={(e) => updateLink(i, { url: e.target.value })}
                      placeholder="https://…"
                      maxLength={500}
                      className={fieldClass + ' flex-1 min-w-0'}
                    />
                  </div>
                </div>
                );
              })}
            </div>
          </div>
          )}
        </div>

        <div className="mt-5 flex items-center gap-3">
          <button type="submit" disabled={savingProfile || loadingProfile} className={btnPrimary}>
            {savingProfile ? 'Saving…' : 'Save profile'}
          </button>
          {loadingProfile && (
            <span className="inline-block h-3 w-20 rounded bg-white/15 animate-pulse align-middle" aria-busy="true" aria-label="Loading" />
          )}
        </div>
        <Msg msg={profileMsg} />
      </form>
      )}

      {/* ── Username + Password (kept from the original Account) ──────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Static profile summary */}
        <div className="ks-card ks-form-card rounded-xl">
          <h3 className="text-base font-semibold text-white mb-4">Account details</h3>
          <div className="space-y-3">
            <div>
              <span className="text-xs font-medium text-gray-500 block">Username</span>
              <span className="text-sm text-white">{user.username}</span>
            </div>
            <div>
              <span className="text-xs font-medium text-gray-500 block">Email</span>
              <span className="text-sm text-white">{user.email}</span>
            </div>
            <div>
              <span className="text-xs font-medium text-gray-500 block">Created</span>
              <span className="text-sm text-white">
                {new Date(user.created_at).toLocaleString()}
              </span>
            </div>
          </div>
        </div>

        {/* Change Username */}
        <form onSubmit={submitUsername} className="ks-card ks-form-card rounded-xl flex flex-col">
          <h3 className="text-base font-semibold text-white mb-1">Change Username</h3>
          <p className="text-xs text-gray-400 mb-4">
            You can sign in with either your username or email — keep it memorable.
          </p>
          <label className="block text-sm font-medium text-gray-300 mb-1">New username</label>
          <input
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            required
            className={fieldClass}
            placeholder={user.username}
          />
          <Msg msg={usernameMsg} />
          <button type="submit" disabled={savingUsername} className="mt-auto pt-4">
            <span className={btnPrimary + ' w-full'}>
              {savingUsername ? 'Saving…' : 'Save Username'}
            </span>
          </button>
        </form>

        <form
          onSubmit={submitPassword}
          className="ks-card ks-form-card rounded-xl flex flex-col lg:col-span-2"
        >
          <h3 className="text-base font-semibold text-white mb-1">Change Password</h3>
          <p className="text-xs text-gray-400 mb-4">
            Enter your current password first — it confirms you own this account.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">
                Current password
              </label>
              <input
                type="password"
                value={oldPassword}
                onChange={(e) => setOldPassword(e.target.value)}
                required
                className={fieldClass}
                autoComplete="current-password"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">
                New password
              </label>
              <input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                required
                className={fieldClass}
                autoComplete="new-password"
                placeholder="At least 8 characters"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">
                Confirm new password
              </label>
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                className={fieldClass}
                autoComplete="new-password"
              />
            </div>
          </div>
          <Msg msg={passwordMsg} />
          <div className="mt-auto pt-4">
            <button type="submit" disabled={savingPassword} className={btnPrimary}>
              {savingPassword ? 'Saving…' : 'Save Password'}
            </button>
          </div>
        </form>
      </div>

      {/* ── Sign-in authorities ("make my account safe") ─────────────────── */}
      <form onSubmit={submitAuth} className="ks-card ks-form-card rounded-xl">
        <h3 className="text-base font-semibold text-white mb-1">Sign-in authorities</h3>
        <p className="text-xs text-gray-400 mb-4">
          Pick which sign-in methods you want enabled on your account and
          HOW MANY of them a login must satisfy. The list is limited to the
          authorities your role permits and the administrator has enabled —
          you can never grant yourself something outside that boundary.
          Password is always on so you can't lock yourself out before any
          other method is configured.
        </p>

        {authProviders.length === 0 && loadingAuth && (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mb-4 animate-pulse" aria-busy="true" aria-label="Loading available authorities">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-10 rounded-md bg-white/[0.06]" style={{ animationDelay: `${i * 120}ms` }} />
            ))}
          </div>
        )}
        {authProviders.length > 0 && (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mb-4">
              {authProviders.map((p) => {
                const checked = authEnabled.includes(p.id);
                const isPassword = p.id === AUTHORITY_PROVIDER.password;
                const kindLabel = p.kind === 'oauth' ? 'OAuth' : 'Channel';
                return (
                  <label
                    key={p.id}
                    className={`flex items-center gap-2 rounded-md border px-3 py-2 text-sm cursor-pointer select-none transition-colors ${
                      checked
                        ? 'border-emerald-600/60 bg-emerald-800/20 text-emerald-200'
                        : 'border-white/[0.06] bg-black/20 text-gray-300'
                    } ${isPassword ? 'opacity-80' : ''}`}
                    title={isPassword ? 'Password is always enabled.' : undefined}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      disabled={isPassword}
                      onChange={() => toggleAuthority(p.id)}
                      className="accent-emerald-500"
                    />
                    <span className="flex-1 min-w-0">
                      <span className="block truncate">{p.label}</span>
                      <span className="block text-[10px] uppercase tracking-wide text-gray-500">
                        {kindLabel}
                      </span>
                    </span>
                  </label>
                );
              })}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1" htmlFor="auth-mode">
                  Login requirement
                </label>
                <p className="text-xs text-gray-400 mb-2">
                  How many of the enabled authorities a sign-in must satisfy.
                </p>
                <select
                  id="auth-mode"
                  value={authMode}
                  onChange={(e) => setAuthMode(e.target.value as UserAuthorityMode)}
                  className={fieldClass}
                >
                  <option value="any">Any one enabled authority</option>
                  <option value="n">N of enabled authorities</option>
                  <option value="all">All enabled authorities</option>
                </select>
              </div>
              {authMode === 'n' && (
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-1" htmlFor="auth-n">
                    Required count (N)
                  </label>
                  <p className="text-xs text-gray-400 mb-2">
                    Sign-in succeeds once you satisfy N of your enabled authorities.
                  </p>
                  <input
                    id="auth-n"
                    type="number"
                    min={1}
                    max={Math.max(1, authEnabled.length)}
                    step={1}
                    value={authN}
                    onChange={(e) => setAuthN(Number(e.target.value) || 1)}
                    className={fieldClass}
                  />
                </div>
              )}
            </div>

            {authUnrestricted ? (
              <p className="mt-3 text-xs text-gray-500">
                Your role imposes no restriction on which authorities you may enable — the picker above lists every admin-enabled provider.
              </p>
            ) : (
              <p className="mt-3 text-xs text-gray-500">
                Your role limits you to the providers the administrator selected. The picker shows only those.
              </p>
            )}
          </>
        )}

        <Msg msg={authMsg} />
        <div className="mt-4">
          <button type="submit" disabled={savingAuth || authProviders.length === 0} className={btnPrimary}>
            {savingAuth ? 'Saving…' : 'Save authorities'}
          </button>
        </div>
      </form>
    </div>
  );
};

export default Account;
