import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { listAdminApiKeys, listUsers, listRoles, deleteAdminApiKey, updateAdminApiKey } from '@/shared/api/admin';
import type { ApiKey } from '@/shared/types/apiKey';
import type { User, Role } from '@/shared/types/user';
import GlassCard from '@/shared/components/ui/Card';
import CardMenu from '@/shared/components/ui/CardMenu/CardMenu';
import { PERMISSION_AREAS } from '@/shared/types/permissions';

function getErrorMessage(e: any, fallback: string): string {
  const data = e?.response?.data;
  if (typeof data === 'string' && data.trim()) return data;
  if (data && typeof data === 'object') {
    if (typeof (data as any).error === 'string') return (data as any).error;
    if (typeof (data as any).message === 'string') return (data as any).message;
    try { return JSON.stringify(data); } catch { return fallback; }
  }
  if (typeof e?.message === 'string' && e.message.trim()) return e.message;
  return fallback;
}

function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleString();
}

function formatDateShort(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleDateString();
}

function relativeTime(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso as string);
  if (isNaN(d.getTime())) return '';
  const diff = Date.now() - d.getTime();
  const abs = Math.abs(diff);
  const s = Math.floor(abs / 1000);
  const future = diff < 0;
  let v: string;
  if (s < 60) v = `${s}s`;
  else if (s < 3600) v = `${Math.floor(s/60)}m`;
  else if (s < 86400) v = `${Math.floor(s/3600)}h`;
  else if (s < 2592000) v = `${Math.floor(s/86400)}d`;
  else if (s < 31536000) v = `${Math.floor(s/2592000)}mo`;
  else v = `${Math.floor(s/31536000)}y`;
  return future ? `in ${v}` : `${v} ago`;
}

function expiryStats(key: ApiKey) {
  if (!key.expires_at) return null;
  const exp = new Date(key.expires_at);
  const created = new Date(key.created_at);
  if (isNaN(exp.getTime()) || isNaN(created.getTime())) return null;
  const total = exp.getTime() - created.getTime();
  const remaining = exp.getTime() - Date.now();
  const expired = remaining <= 0;
  const pct = total > 0 ? Math.max(0, Math.min(100, (Math.max(0, remaining) / total) * 100)) : (expired ? 0 : 100);
  const days = Math.ceil(remaining / (24*60*60*1000));
  return { expired, pct, days, exp };
}

const ApiKeyDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [key, setKey] = useState<ApiKey | null>(null);
  const [users, setUsers] = useState<User[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [toggling, setToggling] = useState(false);

  const numericId = id ? Number(id) : NaN;
  const validId = Number.isFinite(numericId) && numericId > 0;

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      if (!id) return;
      if (!validId) {
        setError('Invalid API key ID');
        setLoading(false);
        return;
      }
      setLoading(true);
      setError('');
      try {
        const [keys, us, rs] = await Promise.all([listAdminApiKeys(), listUsers().catch(()=>[] as User[]), listRoles().catch(()=>[] as Role[])]);
        if (cancelled) return;
        const k = keys.find((x) => x.id === numericId) || null;
        setKey(k);
        setUsers(us as User[]);
        setRoles(rs as Role[]);
      } catch (e: any) {
        if (!cancelled) setError(getErrorMessage(e, 'Failed to load API key'));
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => { cancelled = true; };
  }, [id, numericId, validId]);

  const back = () => navigate('/api-keys');

  const copy = async (text: string, k: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(k);
      setTimeout(() => setCopied(''), 1500);
    } catch {}
  };

  const handleDelete = async () => {
    if (!key) return;
    if (!confirm(`Delete API key "${key.name}"? This cannot be undone.`)) return;
    setDeleting(true);
    try {
      await deleteAdminApiKey(key.id);
      navigate('/api-keys');
    } catch (e: any) {
      alert(getErrorMessage(e, 'Delete failed'));
    } finally {
      setDeleting(false);
    }
  };

  const toggleActive = async () => {
    if (!key) return;
    const next = !(key.active ?? true);
    setToggling(true);
    try {
      await updateAdminApiKey(key.id, { name: key.name, permissions: key.permissions, active: next, active_set: true });
      setKey((prev) => prev ? { ...prev, active: next } : prev);
    } catch (e: any) {
      alert(getErrorMessage(e, 'Failed to toggle active'));
    } finally {
      setToggling(false);
    }
  };

  const groupedPerms = useMemo(() => {
    if (!key) return [];
    const permSet = new Set(key.permissions || []);
    const groups: { area: string; perms: string[] }[] = [];
    for (const area of PERMISSION_AREAS) {
      const hit = [...permSet].filter((p) => {
        if (area.umbrella && p === area.umbrella) return true;
        if (Object.values(area.keys).includes(p)) return true;
        if (area.extraKeys?.includes(p)) return true;
        return false;
      });
      if (hit.length > 0) groups.push({ area: area.label, perms: hit });
    }
    // unknown perms that didn't match any area
    const known = new Set(groups.flatMap((g) => g.perms));
    const unknown = [...permSet].filter((p) => !known.has(p));
    if (unknown.length > 0) groups.push({ area: 'Other', perms: unknown });
    return groups;
  }, [key]);

  if (loading) {
    return (
      <div className="space-y-4 animate-pulse">
        <div className="h-8 w-40 bg-white/5 rounded" />
        <div className="h-32 bg-white/5 rounded-xl" />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {[1,2,3].map((i) => <div key={i} className="h-20 bg-white/5 rounded-xl" />)}
        </div>
      </div>
    );
  }
  if (error) {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <button onClick={back} className="ks-btn-header ks-icon-btn" aria-label="Back">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-5 h-5"><polyline points="15 18 9 12 15 6" /></svg>
          </button>
          <h2 className="text-xl font-semibold text-white">API Key Detail</h2>
        </div>
        <GlassCard className="p-6 border border-red-900/40">
          <p className="text-red-400 text-sm">{error}</p>
          <div className="mt-3 flex gap-2">
            <button onClick={() => window.location.reload()} className="px-3 py-1.5 text-xs rounded-md border border-white/10 bg-white/5 hover:bg-white/10 text-white">Retry</button>
            <button onClick={back} className="px-3 py-1.5 text-xs rounded-md border border-white/10 bg-white/5 hover:bg-white/10 text-gray-300">Back</button>
          </div>
        </GlassCard>
      </div>
    );
  }
  if (!key) {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <button onClick={back} className="ks-btn-header ks-icon-btn" aria-label="Back">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-5 h-5"><polyline points="15 18 9 12 15 6" /></svg>
          </button>
          <h2 className="text-xl font-semibold text-white">API Key Detail</h2>
        </div>
        <GlassCard className="p-6"><p className="text-gray-400">API key not found</p><button onClick={back} className="mt-3 px-3 py-1.5 text-xs rounded-md border border-white/10 bg-white/5 hover:bg-white/10 text-white">Back</button></GlassCard>
      </div>
    );
  }

  const owner = key.owner_name || (() => {
    const u = users.find((usr) => usr.id === key.user_id);
    return u ? u.username : `#${key.user_id}`;
  })();
  const ownerUser = users.find((u) => u.id === key.user_id) || null;
  const ownerRole = ownerUser ? roles.find((r) => r.id === ownerUser.role_id) || null : null;
  const stats = expiryStats(key);
  const isExpired = stats?.expired ?? false;
  const rateLimit = key.rate_limit ?? 0;
  const rateWindow = key.rate_window_seconds ?? 60;
  const isActive = key.active ?? true;
  const isUnlimited = !rateLimit || rateLimit <= 0;
  const windowLabel = rateWindow % 3600 === 0
    ? `${rateWindow / 3600} hour${rateWindow / 3600 > 1 ? 's' : ''}`
    : rateWindow % 60 === 0
      ? `${rateWindow / 60} minute${rateWindow / 60 > 1 ? 's' : ''}`
      : `${rateWindow} seconds`;

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-3">
        <button onClick={back} className="ks-btn-header ks-icon-btn mt-1 shrink-0" aria-label="Back to API keys list">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-5 h-5"><polyline points="15 18 9 12 15 6" /></svg>
        </button>
        <div className="shrink-0 w-10 h-10 rounded-lg flex items-center justify-center bg-amber-900/20 border border-amber-700/40 text-amber-300 mt-0.5">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5"><path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4" /></svg>
        </div>
        <div className="flex-1 min-w-0">
          <h2 className="text-xl font-semibold text-white truncate flex items-center gap-2">
            {key.display_name || key.name}
            {isActive ? <span className="text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded-md border bg-emerald-900/30 border-emerald-700/30 text-emerald-200">Active</span> : <span className="text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded-md border bg-red-900/30 border-red-700/30 text-red-200">Revoked</span>}
            {key.accent_color && <span className="w-3 h-3 rounded-full border border-white/20" style={{ background: key.accent_color }} title={key.accent_color} />}
          </h2>
          <p className="text-xs text-gray-500 truncate">ID {key.id} · {key.name} · prefix <span className="font-mono text-gray-400">{key.prefix || '—'}</span> · {relativeTime(key.created_at)}</p>
          {key.description && <p className="text-sm text-gray-300 mt-1">{key.description}</p>}
        </div>
        <CardMenu
          ariaLabel={`Actions for API key ${key.name}`}
          items={[
            { key: 'edit', label: 'Edit', tone: 'default' },
            { key: 'toggle', label: toggling ? '…' : isActive ? 'Revoke' : 'Activate', tone: isActive ? 'danger' : 'default' },
            { key: 'copyId', label: copied === 'id' ? 'Copied!' : 'Copy ID', tone: 'default' },
            { key: 'copyPrefix', label: copied === 'prefix' ? 'Copied!' : 'Copy prefix', tone: 'default' },
            { key: 'copyPerms', label: copied === 'perms' ? 'Copied!' : 'Copy permissions JSON', tone: 'default' },
            { key: 'delete', label: deleting ? 'Deleting…' : 'Delete', tone: 'danger' },
          ]}
          onSelect={(k) => {
            if (k === 'edit') navigate(`/api-keys/${key.id}/edit`);
            if (k === 'toggle') toggleActive();
            if (k === 'copyId') copy(String(key.id), 'id');
            if (k === 'copyPrefix') copy(key.prefix, 'prefix');
            if (k === 'copyPerms') copy(JSON.stringify(key.permissions || [], null, 2), 'perms');
            if (k === 'delete') handleDelete();
          }}
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <GlassCard className="p-3">
          <h4 className="text-xs uppercase tracking-wide text-gray-500">Identity</h4>
          <div className="mt-2 space-y-1.5 text-sm">
            <div className="flex justify-between gap-2"><span className="text-gray-400">Name</span><span className="text-white font-mono text-xs truncate max-w-[150px]" title={key.name}>{key.name}</span></div>
            {key.display_name && <div className="flex justify-between gap-2"><span className="text-gray-400">Display</span><span className="text-white truncate max-w-[150px]">{key.display_name}</span></div>}
            <div className="flex justify-between gap-2"><span className="text-gray-400">Prefix</span><span className="text-white font-mono text-xs flex items-center gap-1">{key.prefix || '—'}<button onClick={() => copy(key.prefix, 'prefix2')} className="p-1 rounded hover:bg-white/10 text-gray-400 hover:text-white"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="w-3 h-3"><rect x="9" y="9" width="10" height="10" rx="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v3" /></svg></button>{copied==='prefix2'&&<span className="text-[10px] text-emerald-300">copied</span>}</span></div>
            <div className="flex justify-between gap-2"><span className="text-gray-400">Status</span><span className={isActive ? 'text-emerald-300' : 'text-red-300'}>{isActive ? 'Active' : 'Revoked'}{isExpired ? ' · Expired' : ''}</span></div>
            {key.accent_color && <div className="flex justify-between gap-2"><span className="text-gray-400">Color</span><span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-full border border-white/20" style={{ background: key.accent_color }} /><span className="font-mono text-xs text-white">{key.accent_color}</span></span></div>}
          </div>
        </GlassCard>

        <GlassCard className="p-3">
          <h4 className="text-xs uppercase tracking-wide text-gray-500">Owner</h4>
          <div className="mt-2 space-y-1.5 text-sm">
            <div className="flex justify-between gap-2"><span className="text-gray-400">User</span><span className="text-white">{owner}{ownerUser?.email ? <span className="text-gray-500 text-xs ml-1">({ownerUser.email})</span> : null}</span></div>
            <div className="flex justify-between gap-2"><span className="text-gray-400">User ID</span><span className="text-white font-mono text-xs">{key.user_id}</span></div>
            {ownerRole && <div className="flex justify-between gap-2"><span className="text-gray-400">Role</span><span className="text-white flex items-center gap-1"><span className="w-2 h-2 rounded-full" style={{ background: ownerRole.color || '#9ca3af' }} />{ownerRole.display_name || ownerRole.name}</span></div>}
            {ownerUser?.suspended ? <div className="flex justify-between gap-2"><span className="text-gray-400">User status</span><span className="text-red-300 text-xs">Suspended</span></div> : null}
            <div className="flex justify-between gap-2"><span className="text-gray-400">Key ID</span><span className="text-white font-mono text-xs flex items-center gap-1">{key.id}<button onClick={()=>copy(String(key.id),'id2')} className="p-1 rounded hover:bg-white/10"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="w-3 h-3"><rect x="9" y="9" width="10" height="10" rx="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v3" /></svg></button>{copied==='id2'&&<span className="text-[10px] text-emerald-300">copied</span>}</span></div>
          </div>
        </GlassCard>

        <GlassCard className="p-3">
          <h4 className="text-xs uppercase tracking-wide text-gray-500">Timeline</h4>
          <div className="mt-2 space-y-1.5 text-sm">
            <div className="flex justify-between gap-2"><span className="text-gray-400">Created</span><span className="text-white text-xs" title={formatDate(key.created_at)}>{formatDateShort(key.created_at)} <span className="text-gray-500">· {relativeTime(key.created_at)}</span></span></div>
            <div className="flex justify-between gap-2"><span className="text-gray-400">Last used</span><span className="text-white text-xs inline-flex items-center gap-1.5">{key.last_used_at ? <span title={formatDate(key.last_used_at)}>{formatDateShort(key.last_used_at)} · {relativeTime(key.last_used_at)}</span> : <><span className="text-gray-500">never</span><span className="text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded bg-amber-900/30 border border-amber-700/30 text-amber-200">unused</span></>}</span></div>
            <div className="flex justify-between gap-2"><span className="text-gray-400">Expires</span><span className={isExpired ? 'text-red-300 text-xs' : 'text-white text-xs'}>{key.expires_at ? <span title={formatDate(key.expires_at)}>{formatDateShort(key.expires_at)} · {relativeTime(key.expires_at)}</span> : 'Never'}</span></div>
            <div className="pt-1 flex gap-2">
              <button onClick={() => navigate(`/api-keys/${key.id}/edit`)} className="flex-1 px-3 py-1.5 text-xs rounded-md bg-white text-black hover:bg-gray-200">Edit</button>
              <button onClick={toggleActive} disabled={toggling} className="px-3 py-1.5 text-xs rounded-md border border-white/10 bg-white/5 hover:bg-white/10 text-white disabled:opacity-50">{isActive ? 'Revoke' : 'Activate'}</button>
            </div>
          </div>
        </GlassCard>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <GlassCard className="p-3">
          <h4 className="text-xs uppercase tracking-wide text-gray-500 mb-2">Expiry</h4>
          {key.expires_at && stats ? (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className={isExpired ? 'text-red-300' : 'text-gray-300'}>
                  {isExpired ? `Expired ${relativeTime(key.expires_at)}` : `Expires ${formatDateShort(key.expires_at)}`}
                </span>
                <span className="text-xs text-gray-400">{isExpired ? '0%' : `${stats.pct.toFixed(0)}%`}</span>
              </div>
              <div className="h-2 rounded-full bg-white/10 overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-700"
                  style={{
                    width: `${isExpired ? 100 : stats.pct}%`,
                    background: isExpired ? 'rgba(239,68,68,0.8)' : stats.pct < 20 ? 'rgba(251,146,60,0.8)' : 'rgba(34,197,94,0.7)',
                  }}
                />
              </div>
              <p className="text-[11px] text-gray-500">
                {isExpired ? `Expired ${stats.days < 0 ? Math.abs(stats.days) + ' days ago' : ''} · created ${formatDateShort(key.created_at)}` : `${stats.days} days remaining · ${stats.pct.toFixed(1)}% of lifetime left`}
              </p>
            </div>
          ) : (
            <div className="flex items-center gap-2 text-sm">
              <span className="inline-flex items-center gap-1.5 text-[10px] uppercase tracking-wide px-2 py-1 rounded-md border bg-emerald-900/30 border-emerald-700/30 text-emerald-200">No expiry</span>
              <span className="text-xs text-gray-500">Key never expires · created {formatDateShort(key.created_at)}</span>
            </div>
          )}
        </GlassCard>

        <GlassCard className="p-3">
          <h4 className="text-xs uppercase tracking-wide text-gray-500 mb-2">Rate limit</h4>
          {isUnlimited ? (
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1.5 text-[10px] uppercase tracking-wide px-2 py-1 rounded-md border bg-emerald-900/30 border-emerald-700/30 text-emerald-200">Unlimited</span>
              <span className="text-xs text-gray-500">No request cap set · window {windowLabel}</span>
            </div>
          ) : (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-300">{rateLimit} req / {rateWindow}s</span>
                <span className="text-xs text-gray-400">{rateLimit} / {windowLabel}</span>
              </div>
              <div className="h-2 rounded-full bg-white/10 overflow-hidden">
                <div className="h-full rounded-full" style={{ width: '100%', background: 'linear-gradient(90deg, #38bdf8, #818cf8)' }} />
              </div>
              <p className="text-[11px] text-gray-500">Max {rateLimit} requests per {windowLabel}. Exceeding returns 429.</p>
            </div>
          )}
          <div className="mt-3 flex flex-wrap gap-1.5">
            <span className={`text-[10px] uppercase tracking-wide px-2 py-1 rounded-md border ${isUnlimited ? 'bg-emerald-900/30 border-emerald-700/30 text-emerald-200' : 'bg-sky-900/30 border-sky-700/30 text-sky-200'}`}>
              {isUnlimited ? 'Unlimited' : `${rateLimit} req / ${rateWindow}s`}
            </span>
            <span className={`text-[10px] uppercase tracking-wide px-2 py-1 rounded-md border ${isExpired ? 'bg-red-900/40 border-red-700/40 text-red-200' : key.expires_at ? 'bg-amber-900/30 border-amber-700/30 text-amber-200' : 'bg-emerald-900/30 border-emerald-700/30 text-emerald-200'}`}>
              {key.expires_at ? (isExpired ? `Expired ${formatDateShort(key.expires_at)}` : `Expires ${formatDateShort(key.expires_at)}`) : 'No expiry'}
            </span>
            <span className={`text-[10px] uppercase tracking-wide px-2 py-1 rounded-md border ${isActive ? 'bg-emerald-900/30 border-emerald-700/30 text-emerald-200' : 'bg-red-900/30 border-red-700/30 text-red-200'}`}>
              {isActive ? 'Active' : 'Revoked'}
            </span>
          </div>
        </GlassCard>
      </div>

      <GlassCard className="p-4">
        <div className="flex items-center justify-between mb-3">
          <h4 className="text-xs uppercase tracking-wide text-gray-500">Permissions · {(key.permissions || []).length}</h4>
          <span className="text-[11px] text-gray-500">{(key.permissions || []).length === 0 ? 'No permissions' : `${groupedPerms.length} area(s)`}</span>
        </div>
        {(key.permissions || []).length === 0 ? (
          <p className="text-sm text-gray-500">This key has no permissions — it cannot access any admin surface.</p>
        ) : (
          <div className="space-y-3">
            {groupedPerms.map((g) => (
              <div key={g.area}>
                <p className="text-[11px] uppercase tracking-wide text-gray-400 mb-1.5">{g.area} · {g.perms.length}</p>
                <div className="flex flex-wrap gap-1.5">
                  {g.perms.map((p) => (
                    <span key={p} className="inline-flex items-center gap-1 text-[11px] font-mono px-1.5 py-0.5 rounded border border-white/10 bg-white/5 text-gray-200">
                      {p}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
        <p className="mt-3 text-[11px] text-gray-500">Permissions gate what the key can call on <span className="font-mono text-gray-400">/api/*</span>. Edit to add or remove per-area verbs.</p>
      </GlassCard>

      <div className="flex gap-2">
        <button onClick={() => navigate(`/api-keys/${key.id}/edit`)} className="px-4 py-2 text-sm rounded-lg bg-white text-black hover:bg-gray-200">Edit key</button>
        <button onClick={handleDelete} disabled={deleting} className="px-4 py-2 text-sm rounded-lg border border-red-900/40 bg-red-900/20 hover:bg-red-900/30 text-red-200 disabled:opacity-50">{deleting ? 'Deleting…' : 'Delete'}</button>
        <button onClick={back} className="ml-auto px-4 py-2 text-sm rounded-lg border border-white/10 bg-white/5 hover:bg-white/10 text-gray-300">Back to keys</button>
      </div>
    </div>
  );
};
export default ApiKeyDetail;
