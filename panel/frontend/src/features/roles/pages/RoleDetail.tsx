import React, { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { deleteRole, listRoles, listUsers } from '@/shared/api/admin';
import type { Role, User } from '@/shared/types/user';
import GlassCard from '@/shared/components/ui/Card';
import CardMenu from '@/shared/components/ui/CardMenu/CardMenu';
import { PageActionsPill } from '@/shared/components/ui/PageActionsPill';
import { useConfirm } from '@/shared/stores/confirmStore';

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

function relativeTime(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso as string);
  if (isNaN(d.getTime())) return '';
  const s = Math.floor((Date.now() - d.getTime()) / 1000);
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  const days = Math.floor(s / 86400);
  return days < 30 ? `${days}d ago` : days < 365 ? `${Math.floor(days / 30)}mo ago` : `${Math.floor(days / 365)}y ago`;
}

const RoleDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const confirm = useConfirm();
  const [role, setRole] = useState<Role | null>(null);
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [deleting, setDeleting] = useState(false);

  const numericId = id ? Number(id) : NaN;
  const validId = Number.isFinite(numericId) && numericId > 0;

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      if (!id) return;
      if (!validId) {
        setError('Invalid role ID');
        setLoading(false);
        return;
      }
      setLoading(true);
      setError('');
      try {
        const [roles, us] = await Promise.all([
          listRoles(),
          listUsers().catch(() => [] as User[]),
        ]);
        if (cancelled) return;
        setRole(roles.find((r) => r.id === numericId) || null);
        setUsers(us as User[]);
      } catch (e: any) {
        if (!cancelled) setError(getErrorMessage(e, 'Failed to load role'));
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => { cancelled = true; };
  }, [id, numericId, validId]);

  const members = useMemo(
    () => users.filter((u) => u.role_id === numericId),
    [users, numericId],
  );

  const back = () => navigate('/roles');

  const handleDelete = async () => {
    if (!role) return;
    if (!(await confirm({ title: 'Delete role', message: `Delete role "${role.display_name || role.name}"? Members keep their accounts but lose this role's permissions.`, tone: 'danger', confirmLabel: 'Delete' }))) return;
    setDeleting(true);
    try {
      await deleteRole(role.id);
      navigate('/roles');
    } catch (e: any) {
      alert(getErrorMessage(e, 'Delete failed'));
    } finally {
      setDeleting(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-4 animate-pulse">
        <div className="h-8 w-40 bg-white/5 rounded" />
        <div className="h-32 bg-white/5 rounded-xl" />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {[1, 2, 3].map((i) => <div key={i} className="h-20 bg-white/5 rounded-xl" />)}
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
          <h2 className="text-xl font-semibold text-white">Role Detail</h2>
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
  if (!role) {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <button onClick={back} className="ks-btn-header ks-icon-btn" aria-label="Back">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-5 h-5"><polyline points="15 18 9 12 15 6" /></svg>
          </button>
          <h2 className="text-xl font-semibold text-white">Role Detail</h2>
        </div>
        <GlassCard className="p-6"><p className="text-gray-400">Role not found</p><button onClick={back} className="mt-3 px-3 py-1.5 text-xs rounded-md border border-white/10 bg-white/5 hover:bg-white/10 text-white">Back</button></GlassCard>
      </div>
    );
  }

  const perms = role.permissions || [];
  const builtin = (role as Role & { builtin?: boolean }).builtin;
  const createdAt = (role as Role & { created_at?: string }).created_at;
  const label = role.display_name || role.name;

  return (
    <div className="space-y-4">
      <PageActionsPill>
        <CardMenu
          ariaLabel={`Actions for role ${label}`}
          items={[
            { key: 'edit', label: 'Edit role', tone: 'default' },
            { key: 'delete', label: deleting ? 'Deleting…' : 'Delete', tone: 'danger' },
          ]}
          onSelect={(k) => {
            if (k === 'edit') navigate(`/roles/${role.id}/edit`);
            if (k === 'delete') handleDelete();
          }}
        />
      </PageActionsPill>

      <GlassCard className="p-4">
        <div className="flex items-center gap-3">
          <span className="w-10 h-10 rounded-lg border border-white/10 flex items-center justify-center text-lg shrink-0" style={{ background: `${role.color || '#9ca3af'}22` }}>
            <span className="w-4 h-4 rounded-full" style={{ background: role.color || '#9ca3af' }} />
          </span>
          <div className="flex-1 min-w-0">
            <h2 className="text-xl font-semibold text-white truncate flex items-center gap-2">
              {label}
              {builtin ? <span className="text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded-md border bg-sky-900/30 border-sky-700/30 text-sky-200">Builtin</span> : null}
              <span className="text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded-md border bg-white/5 border-white/10 text-gray-300">{members.length} user{members.length === 1 ? '' : 's'}</span>
            </h2>
            <p className="text-xs text-gray-500 truncate">ID {role.id} · {role.name}{createdAt ? ` · ${relativeTime(createdAt)}` : ''}</p>
            {role.description && <p className="text-sm text-gray-300 mt-1">{role.description}</p>}
          </div>
        </div>
      </GlassCard>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <GlassCard className="p-3">
          <h4 className="text-xs uppercase tracking-wide text-gray-500">Identity</h4>
          <div className="mt-2 space-y-1.5 text-sm">
            <div className="flex justify-between gap-2"><span className="text-gray-400">Name</span><span className="text-white font-mono text-xs">{role.name}</span></div>
            {role.display_name && <div className="flex justify-between gap-2"><span className="text-gray-400">Display</span><span className="text-white">{role.display_name}</span></div>}
            <div className="flex justify-between gap-2"><span className="text-gray-400">Color</span><span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-full border border-white/20" style={{ background: role.color || '#9ca3af' }} /><span className="font-mono text-xs text-white">{role.color || '—'}</span></span></div>
          </div>
        </GlassCard>
        <GlassCard className="p-3">
          <h4 className="text-xs uppercase tracking-wide text-gray-500">Grants</h4>
          <div className="mt-2 space-y-1.5 text-sm">
            <div className="flex justify-between gap-2"><span className="text-gray-400">Permissions</span><span className="text-white">{perms.length}</span></div>
            <div className="flex justify-between gap-2"><span className="text-gray-400">Members</span><span className="text-white">{members.length}</span></div>
            <div className="flex justify-between gap-2"><span className="text-gray-400">Auth types</span><span className="text-white text-xs">{role.allowed_auth_types == null ? 'Unrestricted' : role.allowed_auth_types.length === 0 || (role.allowed_auth_types.length === 1 && role.allowed_auth_types[0] === 'password') ? 'Password only' : role.allowed_auth_types.join(', ')}</span></div>
          </div>
        </GlassCard>
        <GlassCard className="p-3">
          <h4 className="text-xs uppercase tracking-wide text-gray-500">Timeline</h4>
          <div className="mt-2 space-y-1.5 text-sm">
            <div className="flex justify-between gap-2"><span className="text-gray-400">Created</span><span className="text-white text-xs" title={formatDate(createdAt)}>{createdAt ? relativeTime(createdAt) : '—'}</span></div>
            <div className="pt-1 flex gap-2">
              <button onClick={() => navigate(`/roles/${role.id}/edit`)} className="flex-1 px-3 py-1.5 text-xs rounded-md bg-white text-black hover:bg-gray-200">Edit</button>
              <button onClick={back} className="px-3 py-1.5 text-xs rounded-md border border-white/10 bg-white/5 hover:bg-white/10 text-gray-300">Back</button>
            </div>
          </div>
        </GlassCard>
      </div>

      <GlassCard className="p-4">
        <div className="flex items-center justify-between mb-3">
          <h4 className="text-xs uppercase tracking-wide text-gray-500">Permissions · {perms.length}</h4>
        </div>
        {perms.length === 0 ? (
          <p className="text-sm text-gray-500">This role grants no permissions.</p>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {perms.map((p) => (
              <span key={p} className="inline-flex items-center text-[11px] font-mono px-1.5 py-0.5 rounded border border-white/10 bg-white/5 text-gray-200">{p}</span>
            ))}
          </div>
        )}
      </GlassCard>

      <GlassCard className="p-4">
        <h4 className="text-xs uppercase tracking-wide text-gray-500 mb-2">Users in role · {members.length}</h4>
        {members.length === 0 ? (
          <p className="text-sm text-gray-500">No users currently hold this role.</p>
        ) : (
          <div className="divide-y divide-white/5">
            {members.map((u) => (
              <div key={u.id} className="py-2 flex items-center justify-between gap-2 text-sm">
                <span className="text-white truncate">{u.username}<span className="text-gray-500 text-xs ml-2">{u.email}</span></span>
                <Link to={`/user/${u.id}`} className="text-xs text-sky-300 hover:text-sky-200 shrink-0">Open →</Link>
              </div>
            ))}
          </div>
        )}
      </GlassCard>

      <div className="flex gap-2">
        <button onClick={() => navigate(`/roles/${role.id}/edit`)} className="px-4 py-2 text-sm rounded-lg bg-white text-black hover:bg-gray-200">Edit role</button>
        <button onClick={handleDelete} disabled={deleting} className="px-4 py-2 text-sm rounded-lg border border-red-900/40 bg-red-900/20 hover:bg-red-900/30 text-red-200 disabled:opacity-50">{deleting ? 'Deleting…' : 'Delete'}</button>
        <button onClick={back} className="ml-auto px-4 py-2 text-sm rounded-lg border border-white/10 bg-white/5 hover:bg-white/10 text-gray-300">Back to roles</button>
      </div>
    </div>
  );
};
export default RoleDetail;
