import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { createAdminApiKey, listAdminApiKeys, listPermissions, listUsers, updateAdminApiKey } from '@/shared/api/admin';
import type { ApiKey, CreateApiKeyResult } from '@/shared/types/apiKey';
import type { Permission, User } from '@/shared/types/user';
import FormPage from '@/shared/components/forms/FormPage';
import GlassField, { glassFieldClass } from '@/shared/components/ui/Field';
import GlassModal from '@/shared/components/ui/Modal';
import FormSkeleton from '@/shared/components/ui/FormSkeleton';
import {
  ALL_ACTIONS,
  AREA_PERM_KEYS,
  PERMISSION_AREAS,
  type PermAction,
  type PermissionArea,
} from '@/shared/types/permissions';

interface Form {
  name: string;
  user_id: number;
  permissions: string[];
  description: string;
  display_name: string;
  accent_color: string;
}

const emptyForm: Form = {
  name: '',
  user_id: 0,
  permissions: [],
  description: '',
  display_name: '',
  accent_color: '',
};

// Curated accent palette shown as quick swatches — same set the role form
// uses, so admins see one consistent vocabulary for "which colour means
// what" across both surfaces. The native picker right below accepts any CSS
// colour for free-form tuning.
const COLOR_SWATCHES: Array<{ value: string; label: string }> = [
  { value: '', label: 'None' },
  { value: '#a78bfa', label: 'Violet' },
  { value: '#38bdf8', label: 'Sky' },
  { value: '#34d399', label: 'Emerald' },
  { value: '#fbbf24', label: 'Amber' },
  { value: '#f87171', label: 'Red' },
  { value: '#f472b6', label: 'Pink' },
  { value: '#94a3b8', label: 'Slate' },
];

type ApiKeyFormTabId = 'identity' | 'limits' | 'permissions';

// Same pill bar as the other admin forms — the three key sections become
// stacked tabs with the card chrome removed so content sits in the body.
const APIKEY_TABS: { id: ApiKeyFormTabId; label: string }[] = [
  { id: 'identity', label: 'Identity' },
  { id: 'limits', label: 'Limits' },
  { id: 'permissions', label: 'Permissions' },
];

// Helpers for the expiry field. We model the local form state with a plain
// string for datetime-local inputs (value="" means "no expiry"), and only
// convert to ISO on submit. fromKey pre-fills from an existing key.
function expiryValueToInput(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  // datetime-local needs the local "YYYY-MM-DDTHH:mm" form.
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function inputToISO(local: string): string {
  if (!local) return '';
  const d = new Date(local);
  if (isNaN(d.getTime())) return '';
  return d.toISOString();
}

function addDuration(base: Date, days: number): Date {
  const d = new Date(base.getTime());
  d.setDate(d.getDate() + days);
  return d;
}

const ApiKeyForm: React.FC = () => {
  const { id } = useParams<{ id?: string }>();
  const editing = !!id;
  const navigate = useNavigate();

  const [users, setUsers] = useState<User[]>([]);
  const [perms, setPerms] = useState<Permission[]>([]);
  const [form, setForm] = useState<Form>(emptyForm);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [createdToken, setCreatedToken] = useState<CreateApiKeyResult | null>(null);
  const [tab, setTab] = useState<ApiKeyFormTabId>('identity');

  // ── Limits state ────────────────────────────────────────────────────────
  // `noExpiry=true` => key never expires (expires_atLocal ignored).
  const [noExpiry, setNoExpiry] = useState(true);
  const [expiresAtLocal, setExpiresAtLocal] = useState('');
  // `noRateLimit=true` => unlimited requests.
  const [noRateLimit, setNoRateLimit] = useState(true);
  const [rateLimit, setRateLimit] = useState<number | ''>(25);
  const [rateWindow, setRateWindow] = useState<number | ''>(60);

  // Load backing data and optionally load editing key
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [usersRes, permsRes, keysRes] = await Promise.all([
          listUsers(),
          listPermissions(),
          listAdminApiKeys(),
        ]);
        if (cancelled) return;
        setUsers(usersRes);
        setPerms(permsRes);
        if (editing) {
          const key = keysRes.find((k) => k.id === Number(id));
          if (key) {
            setForm({
              name: key.name,
              user_id: key.user_id,
              permissions: key.permissions || [],
              description: key.description || '',
              display_name: key.display_name || '',
              accent_color: key.accent_color || '',
            });
            // Pre-fill limits from existing value.
            if (key.expires_at) {
              setNoExpiry(false);
              setExpiresAtLocal(expiryValueToInput(key.expires_at));
            } else {
              setNoExpiry(true);
            }
            if (key.rate_limit !== undefined && key.rate_limit !== null && key.rate_limit > 0) {
              setNoRateLimit(false);
              setRateLimit(key.rate_limit);
              setRateWindow(key.rate_window_seconds && key.rate_window_seconds > 0 ? key.rate_window_seconds : 60);
            } else {
              setNoRateLimit(true);
            }
          } else {
            setError('API key not found');
          }
        } else {
          // default owner to first user if any
          setForm({ ...emptyForm, user_id: usersRes[0]?.id || 0 });
        }
      } catch (e: any) {
        if (!cancelled) setError(e?.response?.data || 'Failed to load form data');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [id, editing]);

  // ── Permission helpers (mirror RoleForm) ────────────────────────────────
  const areaByKey = useMemo(() => {
    const m = new Map<string, PermissionArea>();
    for (const a of PERMISSION_AREAS) {
      for (const k of permGroupKeySet(a)) m.set(k, a);
    }
    return m;
  }, []);
  const findAreaForKey = (key: string): PermissionArea | undefined => areaByKey.get(key);

  const restPerms = useMemo(
    () => perms.filter((p) => !AREA_PERM_KEYS.has(p.key)),
    [perms],
  );

  const permByKey = useMemo(() => {
    const m = new Map<string, Permission>();
    for (const p of perms) m.set(p.key, p);
    return m;
  }, [perms]);

  const togglePerm = (key: string) => {
    setForm((f) => {
      const has = f.permissions.includes(key);
      if (has) {
        return { ...f, permissions: f.permissions.filter((p) => p !== key) };
      }
      // Granting a sub-cap also grants the umbrella so the role's key set
      // stays self-consistent — same contract the role form honours.
      const next = [...f.permissions, key];
      const area = findAreaForKey(key);
      if (area && area.umbrella && !next.includes(area.umbrella)) {
        next.push(area.umbrella);
      }
      return { ...f, permissions: next };
    });
  };

  const toggleGroup = (area: PermissionArea, enable: boolean) => {
    setForm((f) => {
      const groupKeys = permGroupKeySet(area);
      if (enable) {
        const merged = new Set(f.permissions);
        groupKeys.forEach((k) => merged.add(k));
        return { ...f, permissions: Array.from(merged) };
      }
      return { ...f, permissions: f.permissions.filter((p) => !groupKeys.has(p)) };
    });
  };

  // bumpExpiry extends the configured expiry forward by N days. When nothing
  // is configured yet, the new expiry is N days from "now". Lets an admin
  // "add more time" with a single click.
  const bumpExpiry = (days: number) => {
    const base = expiresAtLocal ? new Date(expiresAtLocal) : new Date();
    const next = addDuration(base, days);
    setNoExpiry(false);
    setExpiresAtLocal(expiryValueToInput(next.toISOString()));
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) {
      setError('Name is required');
      return;
    }
    if (!editing && !form.user_id) {
      setError('Owner user is required');
      return;
    }
    // Validate numeric limits only when the toggles are off.
    let rateLimitNum: number | null = null;
    if (!noRateLimit) {
      const rl = typeof rateLimit === 'number' ? rateLimit : Number(rateLimit);
      const rw = typeof rateWindow === 'number' ? rateWindow : Number(rateWindow);
      if (!Number.isFinite(rl) || rl <= 0) {
        setError('Rate limit must be a positive number (e.g. 25)');
        return;
      }
      if (!Number.isFinite(rw) || rw <= 0) {
        setError('Rate window must be a positive number of seconds (e.g. 60)');
        return;
      }
      rateLimitNum = Math.floor(rl);
      setRateWindow(Math.floor(rw));
    }

    setSaving(true);
    setError('');
    try {
      // The display / description / accent fields are sent in every payload
      // so the wire shape matches the role form. The current backend silently
      // drops unknown JSON keys, so this is forward-compatible with a future
      // migration that adds the matching api_keys columns.
      const extras = {
        description: form.description.trim(),
        display_name: form.display_name.trim(),
        accent_color: form.accent_color,
      };
      if (editing) {
        const expiresISO = noExpiry ? '' : inputToISO(expiresAtLocal);
        await updateAdminApiKey(Number(id), {
          name: form.name,
          permissions: form.permissions,
          // Send the *_set flags so the backend writes the new values (and
          // honours "clear back to unlimited" when the toggle is on).
          expires_at: noExpiry ? null : expiresISO || null,
          expires_at_set: true,
          rate_limit: noRateLimit ? null : rateLimitNum,
          rate_limit_set: true,
          rate_window_seconds: noRateLimit ? 0 : (typeof rateWindow === 'number' ? rateWindow : Number(rateWindow)),
          rate_window_set: !noRateLimit,
          ...extras,
        });
        navigate('/api-keys');
      } else {
        const expiresISO = noExpiry ? null : inputToISO(expiresAtLocal) || null;
        const created = await createAdminApiKey({
          name: form.name,
          user_id: form.user_id,
          permissions: form.permissions,
          expires_at: expiresISO,
          rate_limit: noRateLimit ? null : rateLimitNum,
          rate_window_seconds: noRateLimit ? 0 : (typeof rateWindow === 'number' ? rateWindow : Number(rateWindow)),
          ...extras,
        });
        setCreatedToken(created);
      }
    } catch (e: any) {
      setError(e?.response?.data || 'Failed to save API key');
    } finally {
      setSaving(false);
    }
  };

  const copyToken = async (token: string) => {
    try {
      await navigator.clipboard.writeText(token);
    } catch {}
  };

  const closeTokenModal = () => {
    setCreatedToken(null);
    navigate('/api-keys');
  };

  // Summary of the configured limit for the disclosure modal.
  const limitSummary = useMemo(() => {
    if (noExpiry && noRateLimit) {
      return 'No expiry · unlimited requests';
    }
    const parts: string[] = [];
    if (noExpiry) {
      parts.push('No expiry');
    } else {
      const iso = inputToISO(expiresAtLocal);
      parts.push(iso ? `Expires ${new Date(iso).toLocaleString()}` : 'Expires —');
    }
    const rl = typeof rateLimit === 'number' ? rateLimit : Number(rateLimit);
    const rw = typeof rateWindow === 'number' ? rateWindow : Number(rateWindow);
    if (noRateLimit) {
      parts.push('unlimited requests');
    } else {
      parts.push(`${rl} req / ${rw}s`);
    }
    return parts.join(' · ');
  }, [noExpiry, noRateLimit, expiresAtLocal, rateLimit, rateWindow]);

  // "Display label" the UI surfaces — falls back to the machine name when
  // the admin hasn't set a friendly label, so the card preview always
  // shows something meaningful.
  const displayLabel = form.display_name.trim() || form.name.trim() || 'Untitled key';
  // Preview chip rendered at the top of the Details card so the admin sees
  // the accent colour + display label together before saving.
  const accentStyle = form.accent_color
    ? { backgroundColor: form.accent_color, color: '#000', borderColor: form.accent_color }
    : undefined;

  if (loading) {
    return (
      <FormPage
        crumbs={[{ label: 'API Keys', to: '/api-keys' }, { label: editing ? 'Edit API Key' : 'New API Key' }]}
        saving={false}
        submitLabel="Save"
      >
        <FormSkeleton fields={5} />
     </FormPage>
    );
  }

  return (
    <>
      <FormPage
        crumbs={[{ label: 'API Keys', to: '/api-keys' }, { label: editing ? 'Edit API Key' : 'New API Key' }]}
        saving={saving}
        submitLabel={editing ? 'Save' : 'Create'}
        onSubmit={submit}
      >
        <div className="space-y-4">
          <div className="inline-flex flex-wrap gap-1 rounded-lg bg-neutral-900/60 border border-white/10 p-1">
            {APIKEY_TABS.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setTab(t.id)}
                className={`ks-tab transition-colors ${
                  tab === t.id ? 'ks-tab-active' : ''
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>

          {tab === 'identity' && (
          <>
          <div className="space-y-4">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div className="flex items-center gap-2 min-w-0">
                <h3 className="text-sm font-semibold text-white">Identity</h3>
                {/* Live preview chip — shows the chosen accent colour + the
                    display label side-by-side so the admin sees exactly how
                    the key will look in the admin list. Mirrors the role
                    badge the RoleForm renders. */}
                <span
                  className="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded border"
                  style={
                    form.accent_color
                      ? { backgroundColor: form.accent_color, color: '#000', borderColor: form.accent_color }
                      : { backgroundColor: 'rgba(255,255,255,0.08)', color: '#fff', borderColor: 'rgba(255,255,255,0.18)' }
                  }
                  title="How this key's badge will appear in the list"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-3 h-3" aria-hidden="true">
                    <path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4" />
                  </svg>
                  {displayLabel}
               </span>
             </div>
              <span className="text-[11px] text-gray-500">Preview</span>
           </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <GlassField label="Name" htmlFor="name" hint="Machine name used internally and in API responses.">
                <input
                  id="name"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  required
                />
             </GlassField>
              {!editing ? (
                <GlassField label="Owner" htmlFor="user_id">
                  {users.length === 0 ? (
                    <p className="text-xs text-red-400">No users available</p>
                  ) : (
                    <select
                      id="user_id"
                      value={form.user_id}
                      onChange={(e) => setForm({ ...form, user_id: Number(e.target.value) })}
                      required
                      className={glassFieldClass}
                    >
                      {users.map((u) => (
                        <option key={u.id} value={u.id}>
                          {u.username} ({u.email})
                       </option>
                      ))}
                   </select>
                  )}
               </GlassField>
              ) : (
                <GlassField label="Owner" htmlFor="owner_name_disabled">
                  <input id="owner_name_disabled" value={`User #${form.user_id}`} disabled />
               </GlassField>
              )}
           </div>

            <GlassField label="Display Name" htmlFor="display_name" hint="Friendly label shown in the UI. Falls back to Name when empty. Emoji decoration (e.g. “⚠ Deploy Key ⚠”) is supported.">
              <input
                id="display_name"
                value={form.display_name}
                onChange={(e) => setForm({ ...form, display_name: e.target.value })}
                placeholder={form.name || 'optional'}
              />
           </GlassField>

            <GlassField label="Description" htmlFor="description" hint="Short note explaining what the key is for. Shown next to the key in the admin list.">
              <input
                id="description"
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                placeholder="e.g. CI deploy token for staging cluster"
              />
           </GlassField>

            {/* Accent colour — same swatch + custom-picker pattern the role
                form uses, so admins see one consistent control across both
                forms. */}
            <div>
              <label className="block text-sm font-medium text-gray-200 mb-1">
                Accent colour
             </label>
              <p className="text-xs text-gray-400 mb-2">
                Tints the badge on the admin list. Pick a preset or use the picker for any CSS colour.
             </p>
              <div className="flex flex-wrap items-center gap-2">
                {COLOR_SWATCHES.map((s) => {
                  const active = (form.accent_color || '') === s.value;
                  return (
                    <button
                      key={s.value || 'none'}
                      type="button"
                      onClick={() => setForm({ ...form, accent_color: s.value })}
                      aria-pressed={active}
                      aria-label={`Colour: ${s.label}`}
                      className={`group relative w-7 h-7 rounded-full border border-white/15 ring-1 transition-all ${
                        active ? 'ring-white/40 scale-110' : 'ring-transparent hover:ring-white/20'
                      } ${s.value ? '' : 'bg-white/[0.04] border-white/25'}`}
                      style={s.value ? { backgroundColor: s.value } : undefined}
                    >
                      {!s.value && (
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="w-3.5 h-3.5 text-gray-400 absolute inset-0 m-auto">
                          <line x1="6" y1="6" x2="18" y2="18" />
                          <line x1="18" y1="6" x2="6" y2="18" />
                        </svg>
                      )}
                   </button>
                  );
                })}
                <label
                  htmlFor="accent_color_picker"
                  className="ks-ghost-btn inline-flex items-center gap-1.5 text-xs text-gray-300 border border-white/10 rounded-md px-2 py-1 cursor-pointer hover:bg-white/5 transition-colors"
                >
                  <input
                    id="accent_color_picker"
                    type="color"
                    value={/^#[0-9a-fA-F]{6}$/.test(form.accent_color) ? form.accent_color : '#a78bfa'}
                    onChange={(e) => setForm({ ...form, accent_color: e.target.value })}
                    className="w-4 h-4 rounded border-0 bg-transparent cursor-pointer p-0"
                    aria-label="Custom colour picker"
                  />
                  <span>Custom</span>
               </label>
                <input
                  type="text"
                  value={form.accent_color}
                  onChange={(e) => setForm({ ...form, accent_color: e.target.value })}
                  placeholder="#hex / hsl() / rgb()"
                  className="flex-1 min-w-[8rem] bg-black/30 text-white placeholder-gray-500 border border-white/10 rounded-md px-2 py-1 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-white/60 focus:border-white/40 transition-colors"
                />
             </div>
              {/* Mini preview swatch so the admin sees the rendered colour
                  inline; helps them catch "I typed transparent by accident"
                  before saving. */}
              {form.accent_color && (
                <div className="mt-2 flex items-center gap-2 text-xs text-gray-400">
                  <span
                    className="inline-block w-4 h-4 rounded border border-white/15"
                    style={{ backgroundColor: form.accent_color }}
                    aria-hidden="true"
                  />
                  <span className="font-mono">{form.accent_color}</span>
               </div>
              )}
           </div>
         </div>
          </>
          )}

          {tab === 'limits' && (
          <>
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-white">Expiry & Request Limits</h3>
              <span className="text-[11px] text-gray-500">{limitSummary}</span>
           </div>

            {/* Expiry row */}
            <div className="space-y-2">
              <label className="flex items-center gap-2 text-sm text-gray-200 cursor-pointer">
                <input
                  type="checkbox"
                  checked={noExpiry}
                  onChange={(e) => setNoExpiry(e.target.checked)}
                  className="accent-white"
                />
                No expiry (key never expires)
             </label>
              {!noExpiry && (
                <div className="space-y-2">
                  <GlassField label="Expires at" htmlFor="expires_at" hint="When the key stops working. Leave blank + toggle to set no expiry.">
                    <input
                      id="expires_at"
                      type="datetime-local"
                      value={expiresAtLocal}
                      onChange={(e) => setExpiresAtLocal(e.target.value)}
                    />
                 </GlassField>
                  <div className="flex flex-wrap gap-2">
                    <button type="button" onClick={() => bumpExpiry(7)} className="ks-btn-ghost text-xs rounded px-2 py-1">+7 days</button>
                    <button type="button" onClick={() => bumpExpiry(30)} className="ks-btn-ghost text-xs rounded px-2 py-1">+30 days</button>
                    <button type="button" onClick={() => bumpExpiry(365)} className="ks-btn-ghost text-xs rounded px-2 py-1">+1 year</button>
                 </div>
               </div>
              )}
           </div>

            {/* Rate limit row */}
            <div className="space-y-2">
              <label className="flex items-center gap-2 text-sm text-gray-200 cursor-pointer">
                <input
                  type="checkbox"
                  checked={noRateLimit}
                  onChange={(e) => setNoRateLimit(e.target.checked)}
                  className="accent-white"
                />
                No request limit (unlimited)
             </label>
              {!noRateLimit && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <GlassField label="Requests" htmlFor="rate_limit" hint="Max requests allowed per window (e.g. 25).">
                    <input
                      id="rate_limit"
                      type="number"
                      min={1}
                      value={rateLimit}
                      onChange={(e) => setRateLimit(e.target.value === '' ? '' : Number(e.target.value))}
                      placeholder="25"
                    />
                 </GlassField>
                  <GlassField label="Per ... seconds" htmlFor="rate_window" hint="Window size in seconds (e.g. 60 = per minute).">
                    <input
                      id="rate_window"
                      type="number"
                      min={1}
                      value={rateWindow}
                      onChange={(e) => setRateWindow(e.target.value === '' ? '' : Number(e.target.value))}
                      placeholder="60"
                    />
                 </GlassField>
               </div>
              )}
           </div>

            <p className="text-[11px] text-gray-500">
              Leave both boxed checked to mint a key with no expiry and no request limit. Tick off &ldquo;No request limit&rdquo; and fill e.g. 25 requests per 60 seconds to throttle the key to <span className="text-gray-300">25 requests per minute</span>.
           </p>
         </div>
          </>
          )}

          {tab === 'permissions' && (
          <>
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-white">Permissions</h3>
              <span className="text-[11px] text-gray-500">
                {form.permissions.length} selected
             </span>
           </div>
            <p className="text-xs text-gray-400">
              Tick an area group to grant every verb at once, or expand it and pick individual verbs. Granting a sub-verb also grants the area&rsquo;s umbrella so the key stays valid at the gate level.
           </p>
            <div className="space-y-1.5 border border-white/10 rounded-md p-3 max-h-[28rem] overflow-y-auto">
              {PERMISSION_AREAS.map((area) => {
                const umbrellaPerm = area.umbrella ? permByKey.get(area.umbrella) : undefined;
                // Don't render a group card if none of its keys are present
                // in the permissions endpoint payload (older install).
                const groupKeys = permGroupKeySet(area);
                const present = [...groupKeys].some((k) => permByKey.has(k));
                if (!present) return null;

                const allOn = [...groupKeys].every((k) => form.permissions.includes(k));
                const someOn = !allOn && [...groupKeys].some((k) => form.permissions.includes(k));

                // Build the ordered sub-rows: CRUD verbs first, then any
                // area-specific extras (Themes, Account).
                const subRows: Permission[] = [];
                for (const action of ALL_ACTIONS) {
                  const k = area.keys[action];
                  if (!k) continue;
                  const p = permByKey.get(k);
                  if (p) subRows.push(p);
                }
                for (const k of area.extraKeys ?? []) {
                  const p = permByKey.get(k);
                  if (p) subRows.push(p);
                }

                return (
                  <ApiKeyAreaGroupCard
                    key={area.label}
                    area={area}
                    umbrellaPerm={umbrellaPerm}
                    subRows={subRows}
                    allOn={allOn}
                    someOn={someOn}
                    selected={form.permissions}
                    onToggleGroup={(en) => toggleGroup(area, en)}
                    onTogglePerm={togglePerm}
                  />
                );
              })}

              {/* Non-area permissions fall through to the flat list below
                  so forward-compat keys never need a form edit. */}
              {restPerms.length > 0 && (
                <div className="pt-2 mt-2 border-t border-white/10 space-y-1">
                  {restPerms.map((p) => (
                    <ApiKeyFlatPermRow key={p.key} p={p} checked={form.permissions.includes(p.key)} onToggle={() => togglePerm(p.key)} />
                  ))}
               </div>
              )}
</div>
          </div>
          </>
          )}

          {error && <p className="text-sm text-red-400">{error}</p>}
        </div>
      </FormPage>
      {/* Token disclosure modal after creation */}
      {createdToken && (
        <GlassModal
          open={true}
          onClose={closeTokenModal}
          title="API key created"
          maxWidth="max-w-lg"
        >
          <p className="text-sm text-gray-300">Copy this token now — you won't see it again</p>
          <div className="flex items-center gap-2 mt-2">
            <code className="flex-1 bg-black border border-white/10 rounded-md px-3 py-2 text-sm text-white break-all">
              {createdToken.token}
           </code>
            <button
              onClick={() => copyToken(createdToken.token)}
              className="ks-primary-btn shrink-0 inline-flex items-center gap-2 bg-white text-black text-sm px-3 py-2 rounded hover:bg-gray-200"
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
                <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
              </svg>
              Copy
           </button>
         </div>
          <p className="text-xs text-gray-500 mt-3">
            Prefix <code className="text-white">{createdToken.prefix}</code> · Owner{' '}
            <code className="text-white">{createdToken.user_id}</code>
         </p>
          <p className="text-xs text-gray-500 mt-1">{limitSummary}</p>
       </GlassModal>
      )}
    </>
  );
};

// --------------------------------------------------------------------------
// Local helpers + sub-components for the Permissions block. Kept local to
// ApiKeyForm so the form owns its own row markup (matches the RoleForm
// convention). Mirrors RoleForm's helpers verbatim — extract to a shared
// module when a third form needs them.
// --------------------------------------------------------------------------

/** Every permission key that belongs to an area group: umbrella + sub verbs + extras. */
function permGroupKeySet(area: PermissionArea): Set<string> {
  const s = new Set<string>();
  if (area.umbrella) s.add(area.umbrella);
  for (const k of Object.values(area.keys)) if (k) s.add(k);
  for (const k of area.extraKeys ?? []) s.add(k);
  return s;
}

/** Indeterminate-aware parent checkbox ref callback. */
function useIndeterminate(indeterminate: boolean) {
  const ref = useRef<HTMLInputElement | null>(null);
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = indeterminate;
  }, [indeterminate]);
  return ref;
}

/** The parent group card for a regulatable area (parent checkbox + nested sub rows). */
const ApiKeyAreaGroupCard: React.FC<{
  area: PermissionArea;
  umbrellaPerm: Permission | undefined;
  subRows: Permission[];
  allOn: boolean;
  someOn: boolean;
  selected: string[];
  onToggleGroup: (enable: boolean) => void;
  onTogglePerm: (key: string) => void;
}> = ({ area, umbrellaPerm, subRows, allOn, someOn, selected, onToggleGroup, onTogglePerm }) => {
  const parentRef = useIndeterminate(someOn);
  return (
    <div className="ks-form-card rounded px-2 py-2 border-indigo-400/30" style={{ boxShadow: 'none' }}>
      <label className="flex items-start gap-2 cursor-pointer">
        <input
          type="checkbox"
          ref={parentRef}
          checked={allOn}
          onChange={(e) => onToggleGroup(e.target.checked)}
          className="mt-0.5 accent-indigo-400"
        />
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-indigo-100">{area.label}</span>
            <span className="text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded bg-indigo-900/60 text-indigo-200 border border-indigo-700/60">
              group
           </span>
            {area.umbrella && (
              <span className="text-[10px] font-mono text-indigo-300/70 truncate">{area.umbrella}</span>
            )}
         </div>
          <div className="text-xs text-gray-400 mt-0.5">
            {umbrellaPerm?.description ?? `Manage ${area.label.toLowerCase()} (umbrella + granular verbs).`}
         </div>
       </div>
     </label>
      <div className="mt-2 space-y-1.5">
        {subRows.map((p) => (
          <label
            key={p.key}
            className="flex items-start gap-2 ml-auto pl-4 pr-2 py-1.5 rounded hover:bg-white/5 cursor-pointer w-full sm:w-[60%] min-w-[14rem]"
          >
            <input
              type="checkbox"
              checked={selected.includes(p.key)}
              onChange={() => onTogglePerm(p.key)}
              className="mt-0.5 accent-indigo-400"
            />
            <div className="flex-1">
              <div className="text-sm font-medium text-white">{p.key}</div>
              <div className="text-xs text-gray-400">{p.description}</div>
           </div>
         </label>
        ))}
     </div>
   </div>
  );
};

/** Single-cell permission row used by the flat non-area list. */
const ApiKeyFlatPermRow: React.FC<{ p: Permission; checked: boolean; onToggle: () => void }> = ({ p, checked, onToggle }) => (
  <label className="flex items-start gap-2 px-2 py-1.5 rounded hover:bg-white/5 cursor-pointer">
    <input
      type="checkbox"
      checked={checked}
      onChange={onToggle}
      className="mt-0.5 accent-white"
    />
    <div className="flex-1">
      <div className="text-sm font-medium text-white">{p.key}</div>
      <div className="text-xs text-gray-400">{p.description}</div>
   </div>
 </label>
);

export default ApiKeyForm;
