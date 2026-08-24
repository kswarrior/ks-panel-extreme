import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { getPublicProfile } from '@/features/account/api/profile';
import { listRoles, listUsers } from '@/shared/api/admin';
import type { Profile, Role, User } from '@/shared/types/user';
import GlassCard from '@/shared/components/ui/Card';
import Avatar from '@/shared/components/ui/Avatar';
import CardMenu from '@/shared/components/ui/CardMenu/CardMenu';
import { MarkdownBio } from '@/shared/components/ui/MarkdownBio';
import { SocialIcon, socialLabel } from '@/shared/components/ui/SocialIcons';

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

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleString();
}

function relativeTime(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  const diff = Date.now() - d.getTime();
  const s = Math.floor(diff / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const days = Math.floor(h / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo ago`;
  return `${Math.floor(days / 365)}y ago`;
}

const UserDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [userRow, setUserRow] = useState<User | null>(null);
  const [role, setRole] = useState<Role | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState<string>('');

  const numericId = id ? Number(id) : NaN;
  const validId = Number.isFinite(numericId) && numericId > 0;

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      if (!id) return;
      if (!validId) {
        setError('Invalid user ID');
        setLoading(false);
        return;
      }
      setLoading(true);
      setError('');
      try {
        const [prof, users, roles] = await Promise.all([
          getPublicProfile(numericId),
          listUsers().catch(() => [] as User[]),
          listRoles().catch(() => [] as Role[]),
        ]);
        if (cancelled) return;
        setProfile(prof);
        const u = (users as User[]).find((x) => x.id === numericId) || null;
        setUserRow(u);
        const r = (roles as Role[]).find((x) => x.id === (u?.role_id ?? (prof as any).role_id)) || null;
        setRole(r);
      } catch (e: any) {
        if (!cancelled) setError(getErrorMessage(e, 'Failed to load user profile'));
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => { cancelled = true; };
  }, [id, numericId, validId]);

  const back = () => navigate('/users');

  const copy = async (text: string, key: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(key);
      setTimeout(() => setCopied(''), 1500);
    } catch {
      // ignore
    }
  };

  if (loading) {
    return (
      <div className="space-y-4 animate-pulse">
        <div className="h-8 w-40 bg-white/5 rounded" />
        <div className="h-48 bg-white/5 rounded-xl" />
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
          <button onClick={back} className="ks-btn-header ks-icon-btn" aria-label="Back to Users list">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-5 h-5"><polyline points="15 18 9 12 15 6" /></svg>
          </button>
          <h2 className="text-xl font-semibold text-white">User Detail</h2>
        </div>
        <GlassCard className="p-6 border border-red-900/40">
          <p className="text-red-400 text-sm">{error}</p>
          <div className="mt-3 flex gap-2">
            <button onClick={() => window.location.reload()} className="px-3 py-1.5 text-xs rounded-md border border-white/10 bg-white/5 hover:bg-white/10 text-white">Retry</button>
            <button onClick={back} className="px-3 py-1.5 text-xs rounded-md border border-white/10 bg-white/5 hover:bg-white/10 text-gray-300">Back to users</button>
          </div>
        </GlassCard>
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <button onClick={back} className="ks-btn-header ks-icon-btn" aria-label="Back">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-5 h-5"><polyline points="15 18 9 12 15 6" /></svg>
          </button>
          <h2 className="text-xl font-semibold text-white">User Detail</h2>
        </div>
        <p className="text-gray-400">User not found</p>
      </div>
    );
  }

  const avatarUrl = profile.avatar_url;
  const bannerUrl = profile.banner_url;
  const isSuspended = !!userRow?.suspended;
  const suspensionCount = userRow?.suspension_count || 0;
  const suspendedUntil = userRow?.suspended_until;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <button onClick={back} className="ks-btn-header ks-icon-btn" aria-label="Back to Users list">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-5 h-5"><polyline points="15 18 9 12 15 6" /></svg>
        </button>
        <div className="flex-1 min-w-0">
          <h2 className="text-xl font-semibold text-white truncate">User Detail</h2>
          <p className="text-xs text-gray-500 truncate">ID {profile.id} · @{profile.username} · {relativeTime(profile.created_at)}</p>
        </div>
        <CardMenu
          ariaLabel={`Actions for ${profile.username}`}
          items={[
            { key: 'edit', label: 'Edit user', tone: 'default' },
            { key: 'copy', label: copied === 'id' ? 'Copied!' : 'Copy ID', tone: 'default' },
            { key: 'copyLink', label: 'Copy profile link', tone: 'default' },
          ]}
          onSelect={(k) => {
            if (k === 'edit') navigate(`/users/${profile.id}/edit`);
            if (k === 'copy') copy(String(profile.id), 'id');
            if (k === 'copyLink') copy(`${window.location.origin}/user/${profile.id}`, 'link');
          }}
        />
      </div>

      <GlassCard className="relative overflow-hidden rounded-xl p-0">
        {bannerUrl ? (
          <div className="relative h-36 w-full overflow-hidden bg-black/40">
            <img src={bannerUrl} alt="banner" className="w-full h-full object-cover" />
            <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/10 to-transparent" />
          </div>
        ) : (
          <div className="h-20 w-full bg-gradient-to-br from-white/[0.06] via-white/[0.02] to-transparent border-b border-white/5" />
        )}
        <div className="px-4 pb-4">
          <div className="flex items-end gap-4 -mt-8 relative">
            <div className="rounded-full ring-4 ring-black/40 bg-black/40 shrink-0">
              <Avatar
                name={profile.username}
                size={80}
                accentColor={profile.accent_color || role?.color || '#5865F2'}
                symbol={profile.avatar_symbol}
                imageUrl={avatarUrl}
              />
            </div>
            <div className="flex-1 min-w-0 pb-1">
              <h3 className="text-lg font-semibold text-white truncate">{profile.display_name || profile.username}</h3>
              <p className="text-sm text-gray-400 truncate">@{profile.username}</p>
              {profile.pronouns && <p className="text-xs text-gray-300 mt-0.5">{profile.pronouns}</p>}
            </div>
            <div className="hidden sm:flex items-center gap-1.5 pb-1">
              {isSuspended ? (
                <span className="inline-flex items-center gap-1.5 text-[10px] uppercase tracking-wide px-2 py-1 rounded-md border bg-red-900/40 border-red-700/40 text-red-200">Suspended</span>
              ) : (
                <span className="inline-flex items-center gap-1.5 text-[10px] uppercase tracking-wide px-2 py-1 rounded-md border bg-emerald-900/30 border-emerald-700/30 text-emerald-200">Active</span>
              )}
              {role && (
                <span className="inline-flex items-center gap-1.5 text-[10px] uppercase tracking-wide px-2 py-1 rounded-md border bg-white/5 border-white/10 text-gray-200" style={role.color ? { borderColor: role.color + '55' } : undefined}>
                  <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: role.color || '#9ca3af' }} />
                  {role.display_name || role.name}
                </span>
              )}
            </div>
          </div>

          {profile.accent_color && (
            <div className="mt-4 h-1.5 rounded-full w-full" style={{ background: profile.accent_color }} aria-hidden="true" />
          )}

          {profile.bio ? (
            <div className="mt-4">
              <h4 className="text-xs uppercase tracking-wide text-gray-500 mb-1.5">About</h4>
              <div className="rounded-lg border border-white/5 bg-white/[0.03] p-3">
                <MarkdownBio source={profile.bio} className="text-sm text-gray-200 break-words" />
              </div>
            </div>
          ) : null}

          <div className="mt-4 flex flex-wrap gap-2 sm:hidden">
            {isSuspended ? (
              <span className="text-[10px] uppercase tracking-wide px-2 py-1 rounded-md border bg-red-900/40 border-red-700/40 text-red-200">Suspended</span>
            ) : (
              <span className="text-[10px] uppercase tracking-wide px-2 py-1 rounded-md border bg-emerald-900/30 border-emerald-700/30 text-emerald-200">Active</span>
            )}
            {role && (
              <span className="text-[10px] uppercase tracking-wide px-2 py-1 rounded-md border bg-white/5 border-white/10 text-gray-200">{role.display_name || role.name}</span>
            )}
          </div>
        </div>
      </GlassCard>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <GlassCard className="p-3">
          <h4 className="text-xs uppercase tracking-wide text-gray-500">Identity</h4>
          <div className="mt-2 space-y-1.5 text-sm">
            <div className="flex items-center justify-between gap-2">
              <span className="text-gray-400">ID</span>
              <span className="font-mono text-white flex items-center gap-1.5">{profile.id}
                <button onClick={() => copy(String(profile.id), 'id2')} className="p-1 rounded hover:bg-white/10 text-gray-400 hover:text-white" aria-label="Copy ID">
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="w-3.5 h-3.5"><rect x="9" y="9" width="10" height="10" rx="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v3" /></svg>
                </button>
                {copied === 'id2' && <span className="text-[10px] text-emerald-300">copied</span>}
              </span>
            </div>
            <div className="flex items-center justify-between gap-2">
              <span className="text-gray-400">Email</span>
              <span className="text-white truncate max-w-[150px] inline-flex items-center gap-1.5" title={profile.email}>{profile.email}
                <button onClick={() => copy(profile.email, 'email')} className="p-1 rounded hover:bg-white/10 text-gray-400 hover:text-white shrink-0" aria-label="Copy email">
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="w-3.5 h-3.5"><rect x="9" y="9" width="10" height="10" rx="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v3" /></svg>
                </button>
                {copied === 'email' && <span className="text-[10px] text-emerald-300">copied</span>}
              </span>
            </div>
            <div className="flex items-center justify-between gap-2">
              <span className="text-gray-400">Username</span>
              <span className="text-white">@{profile.username}</span>
            </div>
            {profile.display_name && (
              <div className="flex items-center justify-between gap-2">
                <span className="text-gray-400">Display</span>
                <span className="text-white truncate">{profile.display_name}</span>
              </div>
            )}
          </div>
        </GlassCard>

        <GlassCard className="p-3">
          <h4 className="text-xs uppercase tracking-wide text-gray-500">Role & Status</h4>
          <div className="mt-2 space-y-1.5 text-sm">
            <div className="flex items-center justify-between gap-2">
              <span className="text-gray-400">Role</span>
              <span className="text-white flex items-center gap-1.5">
                {role ? (
                  <>
                    <span className="w-2 h-2 rounded-full" style={{ background: role.color || '#9ca3af' }} />
                    {role.display_name || role.name}
                  </>
                ) : `ID ${profile.role_id}`}
              </span>
            </div>
            <div className="flex items-center justify-between gap-2">
              <span className="text-gray-400">Status</span>
              <span className={isSuspended ? 'text-red-300' : 'text-emerald-300'}>{isSuspended ? 'Suspended' : 'Active'}</span>
            </div>
            {isSuspended && suspendedUntil && (
              <div className="flex items-center justify-between gap-2">
                <span className="text-gray-400">Until</span>
                <span className="text-white text-xs">{formatDate(suspendedUntil)}</span>
              </div>
            )}
            {suspensionCount > 0 && (
              <div className="flex items-center justify-between gap-2">
                <span className="text-gray-400">Suspensions</span>
                <span className="text-white">{suspensionCount}</span>
              </div>
            )}
            <div className="flex items-center justify-between gap-2">
              <span className="text-gray-400">Accent</span>
              <span className="flex items-center gap-1.5">
                {profile.accent_color ? (
                  <>
                    <span className="w-3 h-3 rounded-full border border-white/20" style={{ background: profile.accent_color }} />
                    <span className="font-mono text-xs text-white">{profile.accent_color}</span>
                  </>
                ) : <span className="text-gray-500 text-xs">default</span>}
              </span>
            </div>
            {profile.avatar_symbol && (
              <div className="flex items-center justify-between gap-2">
                <span className="text-gray-400">Symbol</span>
                <span className="text-white text-lg leading-none">{profile.avatar_symbol}</span>
              </div>
            )}
          </div>
        </GlassCard>

        <GlassCard className="p-3">
          <h4 className="text-xs uppercase tracking-wide text-gray-500">Timeline</h4>
          <div className="mt-2 space-y-1.5 text-sm">
            <div className="flex items-center justify-between gap-2">
              <span className="text-gray-400">Created</span>
              <span className="text-white text-xs" title={formatDate(profile.created_at)}>{formatDate(profile.created_at)} <span className="text-gray-500">· {relativeTime(profile.created_at)}</span></span>
            </div>
            {userRow?.has_avatar !== undefined && (
              <div className="flex items-center justify-between gap-2">
                <span className="text-gray-400">Avatar file</span>
                <span className={userRow.has_avatar ? 'text-emerald-300' : 'text-gray-500'}>{userRow.has_avatar ? 'Uploaded' : 'None'}</span>
              </div>
            )}
            {userRow?.has_banner !== undefined && (
              <div className="flex items-center justify-between gap-2">
                <span className="text-gray-400">Banner file</span>
                <span className={userRow.has_banner ? 'text-emerald-300' : 'text-gray-500'}>{userRow.has_banner ? 'Uploaded' : 'None'}</span>
              </div>
            )}
            <div className="flex items-center justify-between gap-2">
              <span className="text-gray-400">Social links</span>
              <span className="text-white">{profile.social_links?.length ?? 0}</span>
            </div>
            <div className="pt-2 flex gap-2">
              <button onClick={() => navigate(`/users/${profile.id}/edit`)} className="flex-1 px-3 py-1.5 text-xs rounded-md border border-white/10 bg-white/5 hover:bg-white/10 text-white">Edit user</button>
              <button onClick={() => copy(String(profile.id), 'id3')} className="px-3 py-1.5 text-xs rounded-md border border-white/10 bg-white/5 hover:bg-white/10 text-gray-300">{copied === 'id3' ? 'Copied!' : 'Copy ID'}</button>
            </div>
          </div>
        </GlassCard>
      </div>

      {profile.social_links && profile.social_links.length > 0 && (
        <GlassCard className="p-4">
          <h4 className="text-xs uppercase tracking-wide text-gray-500 mb-3">Social Links · {profile.social_links.length}</h4>
          <ul className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {profile.social_links.map((link, i) => (
              <li key={i} className="flex items-center gap-2 rounded-lg border border-white/5 bg-white/[0.02] px-3 py-2 hover:bg-white/[0.05] transition-colors">
                <span className="shrink-0 w-7 h-7 rounded-md flex items-center justify-center bg-white/[0.06] border border-white/10 text-gray-300">
                  <SocialIcon type={link.type} className="w-4 h-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-xs text-gray-400 truncate">{socialLabel(link.type)}{link.label ? ` · ${link.label}` : ''}</p>
                  <a href={link.url} target="_blank" rel="noreferrer" className="text-sm text-sky-300 hover:text-sky-200 hover:underline truncate block" title={link.url}>{link.url}</a>
                </div>
                <a href={link.url} target="_blank" rel="noreferrer" className="shrink-0 p-1.5 rounded-md hover:bg-white/10 text-gray-400 hover:text-white" aria-label={`Open ${socialLabel(link.type)}`}>
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="w-3.5 h-3.5"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" /><polyline points="15 3 21 3 21 9" /><line x1="10" y1="14" x2="21" y2="3" /></svg>
                </a>
              </li>
            ))}
          </ul>
        </GlassCard>
      )}

      <GlassCard className="p-3 flex items-center justify-between">
        <p className="text-xs text-gray-500">Profile page is read-only. Edit via the Users form.</p>
        <button onClick={() => navigate(`/users/${profile.id}/edit`)} className="px-3 py-1.5 text-xs rounded-md bg-white text-black hover:bg-gray-200">Edit profile</button>
      </GlassCard>
    </div>
  );
};

export default UserDetail;
