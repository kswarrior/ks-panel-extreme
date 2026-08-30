import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { listApiKeys, createApiKey, updateApiKey, deleteApiKey } from '@/features/account/api/profile';
import { listPermissions } from '@/shared/api/admin';
import type { ApiKey, CreateApiKeyResult } from '@/features/api-keys/types/apiKey';
import type { Permission } from '@/shared/types/user';
import SkeletonGrid from '@/shared/components/ui/SkeletonGrid';
import SearchDropdown from '@/shared/components/ui/SearchDropdown';
import GlassModal from '@/shared/components/ui/Modal';
import GlassField, { glassFieldClass } from '@/shared/components/ui/Field';
import { useConfirm } from '@/shared/stores/confirmStore';
import { useAuthStore } from '@/shared/stores/authStore';
import {
  ALL_ACTIONS,
  AREA_PERM_KEYS,
  PERMISSION_AREAS,
  type PermissionArea,
} from '@/shared/types/permissions';
import { hasPermissionAny, PermissionKey } from '@/shared/types/permissions';

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

function expiryValueToInput(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
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
function permGroupKeySet(area: PermissionArea): Set<string> {
  const s = new Set<string>();
  if (area.umbrella) s.add(area.umbrella);
  for (const k of Object.values(area.keys)) if (k) s.add(k);
  for (const k of area.extraKeys ?? []) s.add(k);
  return s;
}

const UserApiKeys: React.FC = () => {
  const navigate = useNavigate();
  const confirm = useConfirm();
  const permissions = useAuthStore((s) => s.permissions);
  const canView = hasPermissionAny(permissions, PermissionKey.MANAGE_API_KEYS, PermissionKey.API_KEYS_VIEW, PermissionKey.API_KEYS_CREATE, PermissionKey.API_KEYS_EDIT, PermissionKey.API_KEYS_DELETE);
  const canCreate = hasPermissionAny(permissions, PermissionKey.MANAGE_API_KEYS, PermissionKey.API_KEYS_CREATE);
  const canEdit = hasPermissionAny(permissions, PermissionKey.MANAGE_API_KEYS, PermissionKey.API_KEYS_EDIT);
  const canDelete = hasPermissionAny(permissions, PermissionKey.MANAGE_API_KEYS, PermissionKey.API_KEYS_DELETE);
  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [perms, setPerms] = useState<Permission[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [editingKey, setEditingKey] = useState<ApiKey | null>(null);
  const [createdToken, setCreatedToken] = useState<CreateApiKeyResult | null>(null);

  // form state for create/edit modal
  const [formName, setFormName] = useState('');
  const [formPerms, setFormPerms] = useState<string[]>([]);
  const [noExpiry, setNoExpiry] = useState(true);
  const [expiresAtLocal, setExpiresAtLocal] = useState('');
  const [noRateLimit, setNoRateLimit] = useState(true);
  const [rateLimit, setRateLimit] = useState<number | ''>(25);
  const [rateWindow, setRateWindow] = useState<number | ''>(60);
  const [active, setActive] = useState(true);
  const [displayName, setDisplayName] = useState('');
  const [description, setDescription] = useState('');
  const [accentColor, setAccentColor] = useState('');
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');

  const formatError = (reason: any): string => {
    const data = reason?.response?.data;
    if (typeof data === 'string' && data.length > 0) return data;
    if (data && typeof data === 'object') return JSON.stringify(data);
    return reason?.message || 'unknown error';
  };

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    const [keysResult, permsResult] = await Promise.allSettled([listApiKeys(), listPermissions()]);
    if (keysResult.status === 'fulfilled') {
      // filter out system keys just in case (backend already does, but keep defensive)
      setKeys(keysResult.value.filter((k) => !k.is_system));
    } else {
      setError(`keys: ${formatError(keysResult.reason)}`);
    }
    if (permsResult.status === 'fulfilled') {
      setPerms(permsResult.value);
    } else {
      // permissions listing may be forbidden for non-admin roles; keep empty and show warning
      setPerms([]);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const areaByKey = useMemo(() => {
    const m = new Map<string, PermissionArea>();
    for (const a of PERMISSION_AREAS) {
      for (const k of permGroupKeySet(a)) m.set(k, a);
    }
    return m;
  }, []);
  const permByKey = useMemo(() => {
    const m = new Map<string, Permission>();
    for (const p of perms) m.set(p.key, p);
    return m;
  }, [perms]);
  const restPerms = useMemo(() => perms.filter((p) => !AREA_PERM_KEYS.has(p.key)), [perms]);

  const togglePerm = (key: string) => {
    setFormPerms((prev) => {
      if (prev.includes(key)) return prev.filter((p) => p !== key);
      const next = [...prev, key];
      const area = areaByKey.get(key);
      if (area && area.umbrella && !next.includes(area.umbrella)) next.push(area.umbrella);
      return next;
    });
  };
  const toggleGroup = (area: PermissionArea, enable: boolean) => {
    setFormPerms((prev) => {
      const groupKeys = permGroupKeySet(area);
      if (enable) {
        const merged = new Set(prev);
        groupKeys.forEach((k) => merged.add(k));
        return Array.from(merged);
      }
      return prev.filter((p) => !groupKeys.has(p));
    });
  };

  const openCreate = () => {
    if (!canCreate) {
      setError('You need API_KEYS_CREATE or MANAGE_API_KEYS permission to create API keys.');
      return;
    }
    setEditingKey(null);
    setFormName('');
    setFormPerms([]);
    setNoExpiry(true);
    setExpiresAtLocal('');
    setNoRateLimit(true);
    setRateLimit(25);
    setRateWindow(60);
    setActive(true);
    setDisplayName('');
    setDescription('');
    setAccentColor('');
    setFormError('');
    setShowCreate(true);
  };
  const openEdit = (k: ApiKey) => {
    if (!canEdit) {
      alert('You need API_KEYS_EDIT or MANAGE_API_KEYS permission to edit API keys.');
      return;
    }
    setEditingKey(k);
    setFormName(k.name);
    setFormPerms(k.permissions || []);
    if (k.expires_at) {
      setNoExpiry(false);
      setExpiresAtLocal(expiryValueToInput(k.expires_at));
    } else setNoExpiry(true);
    if (k.rate_limit !== undefined && k.rate_limit !== null && k.rate_limit > 0) {
      setNoRateLimit(false);
      setRateLimit(k.rate_limit);
      setRateWindow(k.rate_window_seconds && k.rate_window_seconds > 0 ? k.rate_window_seconds : 60);
    } else setNoRateLimit(true);
    setActive(k.active !== false);
    setDisplayName(k.display_name || '');
    setDescription(k.description || '');
    setAccentColor(k.accent_color || '');
    setFormError('');
    setShowCreate(true);
  };

  const badgeFor = (k: ApiKey) => {
    const badges: { text: string; cls: string }[] = [];
    if (k.expires_at) {
      const exp = new Date(k.expires_at);
      const expired = !isNaN(exp.getTime()) && exp.getTime() < Date.now();
      badges.push({ text: expired ? `Expired ${exp.toLocaleDateString()}` : `Expires ${exp.toLocaleDateString()}`, cls: expired ? 'bg-red-900/50 border-red-700/40 text-red-300' : 'bg-amber-900/40 border-amber-700/40 text-amber-200' });
    } else badges.push({ text: 'No expiry', cls: 'bg-emerald-900/40 border-emerald-700/40 text-emerald-200' });
    if (k.rate_limit !== undefined && k.rate_limit !== null && k.rate_limit > 0) {
      const win = k.rate_window_seconds && k.rate_window_seconds > 0 ? k.rate_window_seconds : 60;
      badges.push({ text: `${k.rate_limit} req / ${win}s`, cls: 'bg-sky-900/40 border-sky-700/40 text-sky-200' });
    } else badges.push({ text: 'Unlimited', cls: 'bg-emerald-900/40 border-emerald-700/40 text-emerald-200' });
    return badges;
  };

  const filteredKeys = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return keys;
    return keys.filter((k) => k.name.toLowerCase().includes(q) || (k.display_name || '').toLowerCase().includes(q) || k.prefix.toLowerCase().includes(q));
  }, [keys, search]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formName.trim()) {
      setFormError('Name is required');
      return;
    }
    let rateLimitNum: number | null = null;
    if (!noRateLimit) {
      const rl = typeof rateLimit === 'number' ? rateLimit : Number(rateLimit);
      const rw = typeof rateWindow === 'number' ? rateWindow : Number(rateWindow);
      if (!Number.isFinite(rl) || rl <= 0) { setFormError('Rate limit must be positive'); return; }
      if (!Number.isFinite(rw) || rw <= 0) { setFormError('Rate window must be positive'); return; }
      rateLimitNum = Math.floor(rl);
    }
    setSaving(true);
    setFormError('');
    try {
      const extras = { description: description.trim(), display_name: displayName.trim(), accent_color: accentColor };
      if (editingKey) {
        const expiresISO = noExpiry ? '' : inputToISO(expiresAtLocal);
        await updateApiKey(editingKey.id, {
          name: formName,
          permissions: formPerms,
          expires_at: noExpiry ? null : expiresISO || null,
          expires_at_set: true,
          rate_limit: noRateLimit ? null : rateLimitNum,
          rate_limit_set: true,
          rate_window_seconds: noRateLimit ? 0 : (typeof rateWindow === 'number' ? rateWindow : Number(rateWindow)),
          rate_window_set: !noRateLimit,
          active,
          active_set: true,
          ...extras,
        });
        setShowCreate(false);
        await load();
      } else {
        const expiresISO = noExpiry ? null : inputToISO(expiresAtLocal) || null;
        const created = await createApiKey({
          name: formName,
          permissions: formPerms,
          expires_at: expiresISO,
          rate_limit: noRateLimit ? null : rateLimitNum,
          rate_window_seconds: noRateLimit ? 0 : (typeof rateWindow === 'number' ? rateWindow : Number(rateWindow)),
          ...extras,
        });
        setCreatedToken(created);
        setShowCreate(false);
        await load();
      }
    } catch (err: any) {
      setFormError(err?.response?.data || 'Failed to save API key');
    } finally {
      setSaving(false);
    }
  };

  const remove = async (k: ApiKey) => {
    if (!canDelete) { alert('You need API_KEYS_DELETE or MANAGE_API_KEYS permission to delete API keys.'); return; }
    if (!(await confirm({ title: 'Delete API key', message: `Delete API key "${k.name}"?`, tone: 'danger', confirmLabel: 'Delete' }))) return;
    try {
      await deleteApiKey(k.id);
      await load();
    } catch (e: any) {
      alert(e?.response?.data || 'Failed to delete');
    }
  };

  const toggleActive = async (k: ApiKey, nextActive: boolean) => {
    if (!canEdit) { alert('You need API_KEYS_EDIT or MANAGE_API_KEYS permission to edit API keys.'); return; }
    try {
      await updateApiKey(k.id, {
        name: k.name,
        permissions: k.permissions,
        active: nextActive,
        active_set: true,
      });
      setKeys((prev) => prev.map((x) => (x.id === k.id ? { ...x, active: nextActive } : x)));
    } catch (e: any) {
      alert(e?.response?.data || 'Failed to update');
    }
  };

  const copyToken = async (token: string) => {
    try { await navigator.clipboard.writeText(token); } catch {}
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-4 gap-4 flex-wrap">
        <div>
          <h2 className="text-xl font-semibold text-white">My API Keys</h2>
          <p className="text-xs text-gray-400">Keys for your account. System keys are managed by admins and not shown here.</p>
        </div>
        <div className="flex items-center gap-2">
          <SearchDropdown value={search} onChange={setSearch} placeholder="Search name, prefix…" ariaLabel="Search API keys" />
          <button onClick={openCreate} disabled={!canCreate} className="ks-icon-btn disabled:opacity-40 disabled:cursor-not-allowed" aria-label="Add API Key" title={canCreate ? "Add API Key" : "Requires API_KEYS_CREATE or MANAGE_API_KEYS"}>
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
          </button>
        </div>
      </div>
      {!canView && <p className="text-amber-300 text-xs mb-3 border border-amber-700/40 bg-amber-900/20 rounded px-3 py-2">You need API_KEYS_VIEW or MANAGE_API_KEYS permission to view your API keys. Ask an admin to grant it.</p>}
      {!canCreate && canView && <p className="text-amber-300/80 text-xs mb-3 border border-amber-700/30 bg-amber-900/10 rounded px-3 py-2">You can view keys but need API_KEYS_CREATE to create new ones.</p>}
      {error && <p className="text-red-400 mb-3">{error}</p>}
      {loading && <SkeletonGrid count={6} />}
      {!loading && filteredKeys.length > 0 && (
        <div className="ks-card-grid grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3">
          {filteredKeys.map((k) => {
            const badges = badgeFor(k);
            const label = (k.display_name || '').trim() || k.name;
            const iconStyle = k.accent_color ? { backgroundColor: k.accent_color, color: '#000', borderColor: k.accent_color } : undefined;
            return (
              <article key={k.id} className="ks-card ks-list-card glass-card rounded-xl flex flex-col gap-3 hover:border-white/20 transition-colors">
                <header className="flex items-start gap-3 min-w-0">
                  <div className={`shrink-0 w-10 h-10 rounded-full flex items-center justify-center border ${k.accent_color ? '' : 'bg-amber-900/50 border-amber-700/40 text-amber-300'}`} style={iconStyle} aria-hidden="true">
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4"><path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4" /></svg>
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 min-w-0"><h3 className="text-sm font-semibold text-white truncate">{label}</h3>{k.display_name && k.display_name.trim() !== k.name && <span className="shrink-0 text-[10px] uppercase tracking-wide font-mono text-gray-500 bg-white/5 border border-white/10 rounded px-1.5 py-0.5">{k.name}</span>}</div>
                    <p className="text-[11px] text-gray-500 truncate font-mono">{k.prefix}…</p>
                    {k.description && <p className="text-xs text-gray-400/90 truncate italic mt-1">{k.description}</p>}
                    <div className="flex items-center gap-2 mt-1">
                      <span className={`text-[10px] px-1.5 py-0.5 rounded border ${k.active !== false ? 'bg-emerald-900/40 border-emerald-700/40 text-emerald-200' : 'bg-red-900/40 border-red-700/40 text-red-300'}`}>{k.active !== false ? 'Active' : 'Inactive'}</span>
                      <button onClick={() => toggleActive(k, k.active === false)} className="text-[11px] text-sky-300 hover:text-sky-200">{k.active !== false ? 'Disable' : 'Enable'}</button>
                    </div>
                  </div>
                </header>
                <div className="flex flex-wrap gap-1.5">{badges.map((b, i) => <span key={i} className={`text-[10px] uppercase tracking-wide px-2 py-1 rounded-md border ${b.cls}`}>{b.text}</span>)}</div>
                <footer className="mt-auto pt-2 border-t border-white/[0.06] flex items-center justify-between gap-2">
                  <span className="text-[11px] text-gray-500 truncate">Created {new Date(k.created_at).toLocaleDateString()}{k.last_used_at && <> · Last used {new Date(k.last_used_at).toLocaleDateString()}</>}</span>
                  <div className="flex items-center gap-2 shrink-0">
                    <button onClick={() => openEdit(k)} disabled={!canEdit} className={`text-[11px] ${canEdit ? 'text-sky-300 hover:text-sky-200' : 'text-gray-500 cursor-not-allowed'}`} title={canEdit ? "" : "Requires API_KEYS_EDIT"}>Edit</button>
                    <button onClick={() => remove(k)} disabled={!canDelete} className={`text-[11px] ${canDelete ? 'text-red-300 hover:text-red-200' : 'text-gray-500 cursor-not-allowed'}`} title={canDelete ? "" : "Requires API_KEYS_DELETE"}>Delete</button>
                  </div>
                </footer>
              </article>
            );
          })}
        </div>
      )}
      {!loading && keys.length === 0 && !error && (
        <div className="flex flex-col items-center justify-center min-h-[40vh] px-4">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-20 h-20 text-gray-400" aria-hidden="true"><path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4" /></svg>
          <p className="text-lg font-medium text-gray-300 mt-4">No API keys yet</p>
          <p className="text-sm text-gray-500">Create one for your account.</p>
          <button onClick={openCreate} className="mt-4 ks-primary-btn bg-white text-black px-4 py-2 rounded text-sm">Create API Key</button>
        </div>
      )}

      {showCreate && (
        <GlassModal open={true} onClose={() => setShowCreate(false)} title={editingKey ? 'Edit API Key' : 'New API Key'} maxWidth="max-w-2xl">
          <form onSubmit={submit} className="space-y-4">
            <GlassField label="Name" htmlFor="uk-name" hint="Machine name">
              <input id="uk-name" value={formName} onChange={(e) => setFormName(e.target.value)} required />
            </GlassField>
            <GlassField label="Display Name" htmlFor="uk-display" hint="Friendly label, falls back to Name">
              <input id="uk-display" value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder={formName || 'optional'} />
            </GlassField>
            <GlassField label="Description" htmlFor="uk-desc" hint="Short note">
              <input id="uk-desc" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="e.g. Deploy token" />
            </GlassField>
            <div>
              <label className="block text-sm font-medium text-gray-200 mb-1">Accent colour</label>
              <div className="flex flex-wrap items-center gap-2">
                {COLOR_SWATCHES.map((s) => {
                  const activeSw = (accentColor || '') === s.value;
                  return (
                    <button key={s.value || 'none'} type="button" onClick={() => setAccentColor(s.value)} aria-pressed={activeSw} className={`group relative w-7 h-7 rounded-full border border-white/15 ring-1 ${activeSw ? 'ring-white/40 scale-110' : 'ring-transparent'} ${s.value ? '' : 'bg-white/[0.04]'}`} style={s.value ? { backgroundColor: s.value } : undefined}>
                      {!s.value && <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-3.5 h-3.5 text-gray-400 absolute inset-0 m-auto"><line x1="6" y1="6" x2="18" y2="18" /><line x1="18" y1="6" x2="6" y2="18" /></svg>}
                    </button>
                  );
                })}
                <label htmlFor="uk-accent" className="ks-ghost-btn inline-flex items-center gap-1.5 text-xs text-gray-300 border border-white/10 rounded-md px-2 py-1 cursor-pointer">
                  <input id="uk-accent" type="color" value={/^#[0-9a-fA-F]{6}$/.test(accentColor) ? accentColor : '#a78bfa'} onChange={(e) => setAccentColor(e.target.value)} className="w-4 h-4 rounded border-0 bg-transparent cursor-pointer p-0" />
                  <span>Custom</span>
                </label>
                <input type="text" value={accentColor} onChange={(e) => setAccentColor(e.target.value)} placeholder="#hex" className="flex-1 min-w-[8rem] bg-black/30 text-white placeholder-gray-500 border border-white/10 rounded-md px-2 py-1 text-xs font-mono" />
              </div>
            </div>

            <div className="space-y-2">
              <label className="flex items-center gap-2 text-sm text-gray-200 cursor-pointer"><input type="checkbox" checked={noExpiry} onChange={(e) => setNoExpiry(e.target.checked)} className="accent-white" /> No expiry</label>
              {!noExpiry && (
                <div className="space-y-2">
                  <GlassField label="Expires at" htmlFor="uk-expires"><input id="uk-expires" type="datetime-local" value={expiresAtLocal} onChange={(e) => setExpiresAtLocal(e.target.value)} /></GlassField>
                  <div className="flex gap-2"><button type="button" onClick={() => { const base = expiresAtLocal ? new Date(expiresAtLocal) : new Date(); const next = addDuration(base, 7); setNoExpiry(false); setExpiresAtLocal(expiryValueToInput(next.toISOString())); }} className="ks-btn-ghost text-xs rounded px-2 py-1">+7 days</button><button type="button" onClick={() => { const base = expiresAtLocal ? new Date(expiresAtLocal) : new Date(); const next = addDuration(base, 30); setNoExpiry(false); setExpiresAtLocal(expiryValueToInput(next.toISOString())); }} className="ks-btn-ghost text-xs rounded px-2 py-1">+30 days</button></div>
                </div>
              )}
            </div>
            <div className="space-y-2">
              <label className="flex items-center gap-2 text-sm text-gray-200 cursor-pointer"><input type="checkbox" checked={noRateLimit} onChange={(e) => setNoRateLimit(e.target.checked)} className="accent-white" /> No request limit</label>
              {!noRateLimit && (
                <div className="grid grid-cols-2 gap-3">
                  <GlassField label="Requests"><input type="number" min={1} value={rateLimit} onChange={(e) => setRateLimit(e.target.value === '' ? '' : Number(e.target.value))} placeholder="25" /></GlassField>
                  <GlassField label="Per seconds"><input type="number" min={1} value={rateWindow} onChange={(e) => setRateWindow(e.target.value === '' ? '' : Number(e.target.value))} placeholder="60" /></GlassField>
                </div>
              )}
            </div>
            {editingKey && <label className="flex items-center gap-2 text-sm text-gray-200 cursor-pointer"><input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} className="accent-white" /> Active</label>}

            <div className="border border-white/10 rounded-md p-3 max-h-[22rem] overflow-y-auto space-y-1.5">
              <h4 className="text-sm font-semibold text-white">Permissions <span className="text-[11px] text-gray-500">{formPerms.length} selected</span></h4>
              {perms.length === 0 ? <p className="text-xs text-gray-500">No permission list available (requires elevated role). Keys will be created with empty scope.</p> : PERMISSION_AREAS.map((area) => {
                const groupKeys = permGroupKeySet(area);
                const present = [...groupKeys].some((k) => permByKey.has(k));
                if (!present) return null;
                const allOn = [...groupKeys].every((k) => formPerms.includes(k));
                const someOn = !allOn && [...groupKeys].some((k) => formPerms.includes(k));
                const subRows: Permission[] = [];
                for (const action of ALL_ACTIONS) { const k = area.keys[action]; if (!k) continue; const p = permByKey.get(k); if (p) subRows.push(p); }
                for (const k of area.extraKeys ?? []) { const p = permByKey.get(k); if (p) subRows.push(p); }
                return (
                  <div key={area.label} className="ks-form-card rounded px-2 py-2 border-indigo-400/30" style={{ boxShadow: 'none' }}>
                    <label className="flex items-center gap-2 cursor-pointer"><input type="checkbox" checked={allOn} ref={(el) => { if (el) el.indeterminate = someOn; }} onChange={(e) => toggleGroup(area, e.target.checked)} className="accent-indigo-400" /><span className="text-sm font-semibold text-indigo-100">{area.label}</span></label>
                    <div className="mt-2 space-y-1">
                      {subRows.map((p) => (
                        <label key={p.key} className="flex items-start gap-2 ml-4 pl-2 py-1 rounded hover:bg-white/5 cursor-pointer">
                          <input type="checkbox" checked={formPerms.includes(p.key)} onChange={() => togglePerm(p.key)} className="mt-0.5 accent-indigo-400" />
                          <div><div className="text-sm font-medium text-white">{p.key}</div><div className="text-xs text-gray-400">{p.description}</div></div>
                        </label>
                      ))}
                    </div>
                  </div>
                );
              })}
              {restPerms.length > 0 && (
                <div className="pt-2 mt-2 border-t border-white/10 space-y-1">
                  {restPerms.map((p) => (
                    <label key={p.key} className="flex items-start gap-2 px-2 py-1.5 rounded hover:bg-white/5 cursor-pointer">
                      <input type="checkbox" checked={formPerms.includes(p.key)} onChange={() => togglePerm(p.key)} className="mt-0.5 accent-white" />
                      <div><div className="text-sm font-medium text-white">{p.key}</div><div className="text-xs text-gray-400">{p.description}</div></div>
                    </label>
                  ))}
                </div>
              )}
            </div>

            {formError && <p className="text-sm text-red-400">{formError}</p>}
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setShowCreate(false)} className="px-4 py-2 text-sm text-gray-300">Cancel</button>
              <button type="submit" disabled={saving} className="ks-primary-btn bg-white text-black px-4 py-2 rounded text-sm disabled:opacity-60">{saving ? 'Saving…' : editingKey ? 'Save' : 'Create'}</button>
            </div>
          </form>
        </GlassModal>
      )}
      {createdToken && (
        <GlassModal open={true} onClose={() => { setCreatedToken(null); }} title="API key created" maxWidth="max-w-lg">
          <p className="text-sm text-gray-300">Copy this token now — you won't see it again</p>
          <div className="flex items-center gap-2 mt-2">
            <code className="flex-1 bg-black border border-white/10 rounded-md px-3 py-2 text-sm text-white break-all">{createdToken.token}</code>
            <button onClick={() => copyToken(createdToken.token)} className="ks-primary-btn shrink-0 inline-flex items-center gap-2 bg-white text-black text-sm px-3 py-2 rounded">Copy</button>
          </div>
          <p className="text-xs text-gray-500 mt-3">Prefix <code className="text-white">{createdToken.prefix}</code></p>
        </GlassModal>
      )}
    </div>
  );
};

export default UserApiKeys;
