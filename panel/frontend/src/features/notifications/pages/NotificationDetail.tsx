import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { deleteNotification, getNotification, markRead } from '../api/notifications';
import type { Notification } from '../types/notification';
import { CATEGORY_META, PRIORITY_META } from '../types/notification';
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

const NotificationDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const confirm = useConfirm();
  const [item, setItem] = useState<Notification | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [marking, setMarking] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const numericId = id ? Number(id) : NaN;
  const validId = Number.isFinite(numericId) && numericId > 0;

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      if (!id) return;
      if (!validId) {
        setError('Invalid notification ID');
        setLoading(false);
        return;
      }
      setLoading(true);
      setError('');
      try {
        const n = await getNotification(numericId);
        if (!cancelled) setItem(n);
      } catch (e: any) {
        if (!cancelled) setError(getErrorMessage(e, 'Failed to load notification'));
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => { cancelled = true; };
  }, [id, numericId, validId]);

  const back = () => navigate('/notifications');

  const handleMarkRead = async () => {
    if (!item || item.is_read) return;
    setMarking(true);
    try {
      await markRead(item.id);
      setItem((p) => (p ? { ...p, is_read: true, read_at: new Date().toISOString() } : p));
    } catch (e: any) {
      alert(getErrorMessage(e, 'Failed to mark as read'));
    } finally {
      setMarking(false);
    }
  };

  const handleDelete = async () => {
    if (!item) return;
    if (!(await confirm({ title: 'Delete notification', message: `Delete "${item.title}"? This cannot be undone.`, tone: 'danger', confirmLabel: 'Delete' }))) return;
    setDeleting(true);
    try {
      await deleteNotification(item.id);
      navigate('/notifications');
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
          <h2 className="text-xl font-semibold text-white">Notification Detail</h2>
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
  if (!item) {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <button onClick={back} className="ks-btn-header ks-icon-btn" aria-label="Back">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-5 h-5"><polyline points="15 18 9 12 15 6" /></svg>
          </button>
          <h2 className="text-xl font-semibold text-white">Notification Detail</h2>
        </div>
        <GlassCard className="p-6"><p className="text-gray-400">Notification not found</p><button onClick={back} className="mt-3 px-3 py-1.5 text-xs rounded-md border border-white/10 bg-white/5 hover:bg-white/10 text-white">Back</button></GlassCard>
      </div>
    );
  }

  const cat = CATEGORY_META[item.category];
  const pri = PRIORITY_META[item.priority];

  return (
    <div className="space-y-4">
      <PageActionsPill>
        <CardMenu
          ariaLabel={`Actions for notification ${item.title}`}
          items={[
            ...(!item.is_read ? [{ key: 'read', label: marking ? '…' : 'Mark read', tone: 'default' as const }] : []),
            ...(item.link ? [{ key: 'open', label: 'Open link', tone: 'default' as const }] : []),
            { key: 'delete', label: deleting ? 'Deleting…' : 'Delete', tone: 'danger' as const },
          ]}
          onSelect={(k) => {
            if (k === 'read') handleMarkRead();
            if (k === 'open' && item.link) window.open(item.link, '_blank', 'noopener');
            if (k === 'delete') handleDelete();
          }}
        />
      </PageActionsPill>

      <GlassCard className="p-4">
        <div className="flex items-start gap-3">
          <span className="w-2.5 h-2.5 rounded-full mt-1.5 shrink-0" style={{ background: cat?.color || '#9ca3af' }} title={cat?.label} />
          <div className="flex-1 min-w-0">
            <h2 className="text-xl font-semibold text-white flex items-center gap-2 flex-wrap">
              {item.title}
              {item.is_read
                ? <span className="text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded-md border bg-white/5 border-white/10 text-gray-400">Read</span>
                : <span className="text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded-md border bg-sky-900/30 border-sky-700/30 text-sky-200">Unread</span>}
              {pri ? <span className={`text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded-md border ${pri.bg} ${pri.color}`}>{pri.label}</span> : null}
              {cat ? <span className="text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded-md border bg-white/5 border-white/10 text-gray-300">{cat.label}</span> : <span className="text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded-md border bg-white/5 border-white/10 text-gray-300">{item.category}</span>}
            </h2>
            <p className="text-xs text-gray-500 mt-1">ID {item.id} · from {item.actor_name || 'system'} · {relativeTime(item.created_at)}</p>
          </div>
        </div>
      </GlassCard>

      <GlassCard className="p-4">
        <h4 className="text-xs uppercase tracking-wide text-gray-500 mb-2">Message</h4>
        <p className="text-sm text-gray-200 whitespace-pre-wrap">{item.message}</p>
      </GlassCard>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <GlassCard className="p-3">
          <h4 className="text-xs uppercase tracking-wide text-gray-500">Source</h4>
          <div className="mt-2 space-y-1.5 text-sm">
            <div className="flex justify-between gap-2"><span className="text-gray-400">Actor</span><span className="text-white">{item.actor_name || '—'}</span></div>
            <div className="flex justify-between gap-2"><span className="text-gray-400">Category</span><span className="text-white text-xs">{cat?.label || item.category}</span></div>
            <div className="flex justify-between gap-2"><span className="text-gray-400">Priority</span><span className={`text-xs ${pri?.color || 'text-white'}`}>{pri?.label || item.priority}</span></div>
            {item.is_broadcast ? <div className="flex justify-between gap-2"><span className="text-gray-400">Scope</span><span className="text-amber-300 text-xs">Broadcast</span></div> : null}
          </div>
        </GlassCard>
        <GlassCard className="p-3">
          <h4 className="text-xs uppercase tracking-wide text-gray-500">Link</h4>
          <div className="mt-2 space-y-1.5 text-sm">
            {item.link ? (
              <>
                <p className="text-white font-mono text-xs truncate" title={item.link}>{item.link}</p>
                <button onClick={() => window.open(item.link, '_blank', 'noopener')} className="px-3 py-1.5 text-xs rounded-md bg-white text-black hover:bg-gray-200">{item.action_label || 'Open link'}</button>
              </>
            ) : (
              <p className="text-gray-500 text-xs">No link attached.</p>
            )}
          </div>
        </GlassCard>
        <GlassCard className="p-3">
          <h4 className="text-xs uppercase tracking-wide text-gray-500">Timeline</h4>
          <div className="mt-2 space-y-1.5 text-sm">
            <div className="flex justify-between gap-2"><span className="text-gray-400">Created</span><span className="text-white text-xs" title={formatDate(item.created_at)}>{relativeTime(item.created_at)}</span></div>
            <div className="flex justify-between gap-2"><span className="text-gray-400">Read</span><span className="text-white text-xs" title={formatDate(item.read_at)}>{item.read_at ? relativeTime(item.read_at) : 'Unread'}</span></div>
            <div className="pt-1 flex gap-2">
              {!item.is_read && <button onClick={handleMarkRead} disabled={marking} className="flex-1 px-3 py-1.5 text-xs rounded-md bg-white text-black hover:bg-gray-200 disabled:opacity-50">{marking ? '…' : 'Mark read'}</button>}
              <button onClick={back} className="px-3 py-1.5 text-xs rounded-md border border-white/10 bg-white/5 hover:bg-white/10 text-gray-300">Back</button>
            </div>
          </div>
        </GlassCard>
      </div>

      <div className="flex gap-2">
        {!item.is_read && <button onClick={handleMarkRead} disabled={marking} className="px-4 py-2 text-sm rounded-lg bg-white text-black hover:bg-gray-200 disabled:opacity-50">{marking ? 'Marking…' : 'Mark read'}</button>}
        <button onClick={handleDelete} disabled={deleting} className="px-4 py-2 text-sm rounded-lg border border-red-900/40 bg-red-900/20 hover:bg-red-900/30 text-red-200 disabled:opacity-50">{deleting ? 'Deleting…' : 'Delete'}</button>
        <button onClick={back} className="ml-auto px-4 py-2 text-sm rounded-lg border border-white/10 bg-white/5 hover:bg-white/10 text-gray-300">Back to notifications</button>
      </div>
    </div>
  );
};
export default NotificationDetail;
