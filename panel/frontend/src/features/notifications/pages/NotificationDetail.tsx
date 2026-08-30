import React, { useCallback, useEffect, useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { getNotification, markRead, deleteNotification } from '../api/notifications';
import type { Notification } from '../types/notification';
import { CATEGORY_META, PRIORITY_META } from '../types/notification';
import GlassCard from '@/shared/components/ui/Card';
import CardMediaLayer from '@/shared/components/ui/CardMediaLayer';
import { useThemeStore } from '@/shared/stores/themeStore';
import { useConfirm } from '@/shared/stores/confirmStore';

function parseMedia(json?: string): { type: string; url: string }[] {
  if (!json || json === '[]') return [];
  try {
    const arr = JSON.parse(json);
    if (!Array.isArray(arr)) return [];
    return arr.map((it: any) => {
      if (typeof it === 'string') {
        const url = it;
        const lower = url.toLowerCase();
        let t = 'image';
        if (lower.endsWith('.mp4') || lower.endsWith('.webm') || lower.endsWith('.mov')) t = 'video';
        else if (lower.endsWith('.gif')) t = 'gif';
        return { type: t, url };
      }
      return { type: (it.type || 'image').toLowerCase(), url: it.url || '' };
    }).filter((m: any) => m.url);
  } catch { return []; }
}

const NotificationDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const confirm = useConfirm();
  const glassModifier = useThemeStore((s) => {
    const g = s.active().card.glass_style;
    if (!g || g === 'frosted') return '';
    return g === 'solid' ? 'ks-card-glass-solid' : 'ks-card-glass-strong';
  });
  const [n, setN] = useState<Notification | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError('');
    try {
      const data = await getNotification(Number(id));
      setN(data);
    } catch (e: any) {
      setError(e?.response?.data || 'Failed to load notification');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  const handleMarkRead = async () => {
    if (!n || n.is_read) return;
    setBusy(true);
    try {
      await markRead(n.id);
      await load();
    } catch (e: any) {
      alert(e?.response?.data || 'Failed to mark read');
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async () => {
    if (!n) return;
    if (!(await confirm({ title: 'Delete notification', message: `Delete "${n.title}"? This cannot be undone.`, tone: 'danger', confirmLabel: 'Delete' }))) return;
    try {
      await deleteNotification(n.id);
      navigate('/notifications');
    } catch (e: any) {
      alert(e?.response?.data || 'Failed to delete');
    }
  };

  if (loading) return <div className="p-8 text-center" style={{ color: 'var(--ks-muted)' }}>Loading notification…</div>;
  if (error) return <div className="p-8 text-center" style={{ color: 'var(--ks-bad)' }}>{String(error)}</div>;
  if (!n) return <div className="p-8 text-center" style={{ color: 'var(--ks-muted)' }}>Notification not found.</div>;

  const cat = CATEGORY_META[n.category] || CATEGORY_META.general;
  const pri = PRIORITY_META[n.priority] || PRIORITY_META.normal;
  const media = parseMedia(n.media_json);
  const hasCover = !!n.cover_image;
  const hasMedia = media.length > 0;

  return (
    <div className="max-w-[1280px] mx-auto space-y-4">
      <div className="flex items-center gap-2 flex-wrap">
        <Link to="/notifications" className="ks-btn-ghost inline-flex items-center gap-1 text-sm px-2 py-1 rounded">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-4 h-4"><path d="M19 12H5" /><path d="M12 19l-7-7 7-7" /></svg>
          Notifications
        </Link>
        <span style={{ color: 'var(--ks-muted)' }}>/</span>
        <span className="font-mono text-sm font-semibold tracking-wide px-2 py-0.5 rounded border" style={{ color: cat.color, background: 'color-mix(in srgb, ' + cat.color + ' 12%, transparent)', borderColor: 'color-mix(in srgb, ' + cat.color + ' 20%, transparent)' }}>{cat.label}</span>
        <span className={`inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full border ${pri.bg} ${pri.color}`}><span className={`w-1.5 h-1.5 rounded-full ${pri.dot}`} />{pri.label}</span>
        {n.is_broadcast && <span className="text-[11px] px-2 py-0.5 rounded-full border" style={{ background: 'color-mix(in srgb, #e879f9 14%, transparent)', borderColor: 'color-mix(in srgb, #e879f9 30%, transparent)', color: '#f0abfc' }}>Broadcast</span>}
        {!n.is_read && <span className="text-[11px] px-2 py-0.5 rounded-full bg-sky-500 text-white font-bold animate-pulse">Unread</span>}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[1.6fr_0.9fr] gap-4">
        <div className="space-y-4 min-w-0">
          <GlassCard className={`p-5 ${glassModifier} relative overflow-hidden`}>
            <CardMediaLayer />
            <div className="flex items-start gap-3">
              <div className="shrink-0 w-11 h-11 rounded-xl flex items-center justify-center border overflow-hidden" style={{ background: 'var(--ks-card-bg)', borderColor: 'var(--ks-card-border)', color: cat.color }}>
                {hasCover ? <img src={n.cover_image} alt="" className="w-full h-full object-cover" /> : <span className="w-5 h-5 grid place-items-center"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} className="w-5 h-5"><path d="M6 8a6 6 0 0 1 12 0c0 7-6 5-6 10" /><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" /></svg></span>}
              </div>
              <div className="min-w-0 flex-1">
                <h1 className="text-[16px] font-semibold leading-tight" style={{ color: 'var(--ks-text-body)' }}>{n.title}</h1>
                <div className="flex flex-wrap items-center gap-1.5 mt-1.5 text-xs" style={{ color: 'var(--ks-muted)' }}>
                  <span className="capitalize inline-flex items-center gap-1"><span className="w-2 h-2 rounded-full" style={{ background: cat.color }} />{cat.label}</span>
                  <span>•</span>
                  <span>{new Date(n.created_at).toLocaleString(undefined, { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
                  {n.actor_name && <><span>•</span><span>by <span style={{ color: 'var(--ks-text-body)' }} className="font-medium">{n.actor_name}</span></span></>}
                  {n.read_at && <><span>•</span><span>read {new Date(n.read_at).toLocaleString()}</span></>}
                </div>
              </div>
              <div className="shrink-0 hidden sm:flex items-center gap-1.5">
                {!n.is_read && <button onClick={handleMarkRead} disabled={busy} className="ks-btn-ghost text-xs px-3 py-1.5 rounded-lg border disabled:opacity-50">Mark read</button>}
                <button onClick={handleDelete} className="ks-btn-ghost text-xs px-3 py-1.5 rounded-lg border" style={{ color: 'var(--ks-bad)', borderColor: 'color-mix(in srgb, var(--ks-bad) 30%, transparent)' }}>Delete</button>
              </div>
            </div>

            {/* cover image hero */}
            {hasCover && (
              <div className="mt-4 rounded-xl overflow-hidden border" style={{ borderColor: 'var(--ks-card-border)' }}>
                <img src={n.cover_image} alt="cover" className="w-full max-h-[380px] object-cover" loading="lazy" />
              </div>
            )}

            {/* message */}
            {n.message && (
              <div className="mt-4 p-3.5 rounded-xl border text-sm whitespace-pre-wrap leading-relaxed" style={{ background: 'color-mix(in srgb, var(--ks-bg-color, #000) 40%, transparent)', borderColor: 'var(--ks-card-border)', color: 'var(--ks-text-body)' }}>
                {n.message}
              </div>
            )}

            {/* notes */}
            {n.notes && (
              <div className="mt-3 p-3.5 rounded-xl border" style={{ background: 'var(--ks-card-bg)', borderColor: 'var(--ks-card-border)' }}>
                <div className="text-[11px] uppercase tracking-wide font-bold mb-1.5" style={{ color: 'var(--ks-muted)' }}>Notes</div>
                <div className="text-sm whitespace-pre-wrap leading-relaxed" style={{ color: 'var(--ks-text-body)' }}>{n.notes}</div>
              </div>
            )}

            {/* media gallery */}
            {hasMedia && (
              <div className="mt-4">
                <div className="text-[11px] uppercase tracking-wide font-bold mb-2" style={{ color: 'var(--ks-muted)' }}>Media • {media.length} item{media.length===1?'':'s'} (images / videos / gif)</div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {media.map((m, i) => {
                    const isVideo = m.type === 'video' || /\.(mp4|webm|mov)(\?|$)/i.test(m.url);
                    const isGif = m.type === 'gif' || /\.gif(\?|$)/i.test(m.url);
                    return (
                      <div key={i} className="rounded-xl overflow-hidden border group relative" style={{ borderColor: 'var(--ks-card-border)', background: 'var(--ks-card-bg)' }}>
                        {isVideo ? (
                          <video src={m.url} controls playsInline className="w-full h-48 object-cover bg-black" />
                        ) : (
                          <img src={m.url} alt={`media ${i+1}`} className="w-full h-48 object-cover" loading="lazy" />
                        )}
                        <div className="absolute top-2 left-2 flex items-center gap-1">
                          <span className="text-[10px] font-bold tracking-wide px-1.5 py-0.5 rounded-full border backdrop-blur-md" style={{ background: 'rgba(0,0,0,0.55)', color: '#fff', borderColor: 'rgba(255,255,255,0.2)' }}>{isVideo ? 'VIDEO' : isGif ? 'GIF' : 'IMAGE'}</span>
                        </div>
                        <a href={m.url} target="_blank" rel="noreferrer" className="absolute bottom-2 right-2 text-[11px] px-2 py-1 rounded-full bg-black/60 text-white border border-white/20 opacity-0 group-hover:opacity-100 transition-opacity">Open</a>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* link */}
            {n.link && (
              <div className="mt-4">
                <a href={n.link} target={n.link.startsWith('http') ? '_blank' : undefined} rel="noreferrer" className="inline-flex items-center gap-1.5 text-sm font-medium px-4 py-2 rounded-lg border" style={{ background: 'var(--ks-btn-bg)', color: 'var(--ks-btn-text)', borderColor: 'var(--ks-card-border)' }}>
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-4 h-4"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" /><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" /></svg>
                  {n.action_label || 'Open link'}
                </a>
              </div>
            )}

            {n.metadata && (
              <div className="mt-3 text-[11px] font-mono p-2 rounded border overflow-x-auto" style={{ background: 'color-mix(in srgb, var(--ks-bg-color) 30%, transparent)', borderColor: 'var(--ks-card-border)', color: 'var(--ks-muted)' }}>
                {n.metadata}
              </div>
            )}
          </GlassCard>

          <GlassCard className={`${glassModifier} p-4 text-center relative overflow-hidden`}>
            <CardMediaLayer />
            <div className="text-xs" style={{ color: 'var(--ks-muted)' }}>
              Notification <span className="font-mono font-semibold" style={{ color: 'var(--ks-info)' }}>#{n.id}</span> • {n.is_read ? 'read' : 'unread'} • {n.is_broadcast ? 'broadcast to all' : `for user #${n.user_id}`}
            </div>
            <div className="mt-2 flex items-center justify-center gap-2">
              {!n.is_read && <button onClick={handleMarkRead} disabled={busy} className="ks-btn-ghost text-xs px-4 py-1.5 rounded-lg border">Mark as read</button>}
              <Link to="/notifications" className="ks-btn-ghost text-xs px-4 py-1.5 rounded-lg border">Back to inbox</Link>
              <button onClick={handleDelete} className="ks-btn-ghost text-xs px-4 py-1.5 rounded-lg border" style={{ color: 'var(--ks-bad)' }}>Delete</button>
            </div>
          </GlassCard>
        </div>

        <div className="space-y-4">
          <GlassCard className={`p-4 ${glassModifier}`}>
            <h4 className="text-xs font-semibold uppercase tracking-wide mb-3" style={{ color: 'var(--ks-text-body)' }}>Details</h4>
            <dl className="space-y-2.5 text-xs">
              <div className="flex justify-between gap-2 items-center"><dt style={{ color: 'var(--ks-muted)' }}>ID</dt><dd className="font-mono font-semibold" style={{ color: 'var(--ks-info)' }}>#{n.id}</dd></div>
              <div className="flex justify-between gap-2 items-center"><dt style={{ color: 'var(--ks-muted)' }}>Category</dt><dd className="capitalize inline-flex items-center gap-1.5" style={{ color: 'var(--ks-text-body)' }}><span className="w-2 h-2 rounded-full" style={{ background: cat.color }} />{cat.label}</dd></div>
              <div className="flex justify-between gap-2 items-center"><dt style={{ color: 'var(--ks-muted)' }}>Priority</dt><dd><span className={`inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full border ${pri.bg} ${pri.color}`}><span className={`w-1.5 h-1.5 rounded-full ${pri.dot}`} />{pri.label}</span></dd></div>
              <div className="flex justify-between gap-2 items-center"><dt style={{ color: 'var(--ks-muted)' }}>Broadcast</dt><dd style={{ color: n.is_broadcast ? 'var(--ks-purple, #a78bfa)' : 'var(--ks-muted)' }}>{n.is_broadcast ? 'Yes — all users' : 'No — single user'}</dd></div>
              <div className="pt-2 border-t space-y-2" style={{ borderColor: 'var(--ks-card-border)' }}>
                <div className="flex justify-between gap-2"><dt style={{ color: 'var(--ks-muted)' }}>Created</dt><dd style={{ color: 'var(--ks-text-body)' }}>{new Date(n.created_at).toLocaleString()}</dd></div>
                <div className="flex justify-between gap-2"><dt style={{ color: 'var(--ks-muted)' }}>Read</dt><dd style={{ color: n.is_read ? 'var(--ks-ok, #22c55e)' : 'var(--ks-muted)' }}>{n.read_at ? new Date(n.read_at).toLocaleString() : n.is_read ? '—' : 'Unread'}</dd></div>
                <div className="flex justify-between gap-2"><dt style={{ color: 'var(--ks-muted)' }}>Actor</dt><dd style={{ color: 'var(--ks-text-body)' }}>{n.actor_name || 'System'}{n.actor_id ? ` (#${n.actor_id})` : ''}</dd></div>
                <div className="flex justify-between gap-2"><dt style={{ color: 'var(--ks-muted)' }}>Owner</dt><dd style={{ color: 'var(--ks-text-body)' }}>#{n.user_id}</dd></div>
              </div>
              {n.cover_image && <div className="pt-2 border-t" style={{ borderColor: 'var(--ks-card-border)' }}><dt className="mb-1" style={{ color: 'var(--ks-muted)' }}>Cover</dt><dd className="break-all text-[11px] font-mono" style={{ color: 'var(--ks-text-body)' }}>{n.cover_image}</dd></div>}
              {hasMedia && <div className="pt-2 border-t" style={{ borderColor: 'var(--ks-card-border)' }}><dt className="mb-1" style={{ color: 'var(--ks-muted)' }}>Media</dt><dd style={{ color: 'var(--ks-text-body)' }}>{media.length} item(s)</dd></div>}
            </dl>
          </GlassCard>

          <GlassCard className={`p-4 ${glassModifier}`}>
            <h4 className="text-xs font-semibold uppercase tracking-wide mb-2" style={{ color: 'var(--ks-text-body)' }}>Actions</h4>
            <div className="grid grid-cols-1 gap-2">
              {!n.is_read && <button onClick={handleMarkRead} disabled={busy} className="w-full ks-btn-ghost text-xs px-3 py-2 rounded-lg border">Mark as read</button>}
              {n.link && <a href={n.link} target={n.link.startsWith('http') ? '_blank' : undefined} rel="noreferrer" className="w-full inline-flex items-center justify-center gap-1.5 text-xs px-3 py-2 rounded-lg" style={{ background: 'var(--ks-btn-bg)', color: 'var(--ks-btn-text)' }}>Open link</a>}
              <Link to="/notifications" className="w-full inline-flex items-center justify-center gap-1.5 text-xs px-3 py-2 rounded-lg border ks-btn-ghost">Back to inbox</Link>
              <button onClick={handleDelete} className="w-full text-xs px-3 py-2 rounded-lg border" style={{ color: 'var(--ks-bad)', borderColor: 'color-mix(in srgb, var(--ks-bad) 30%, transparent)', background: 'color-mix(in srgb, var(--ks-bad) 8%, transparent)' }}>Delete notification</button>
            </div>
          </GlassCard>
        </div>
      </div>
    </div>
  );
};

export default NotificationDetail;
