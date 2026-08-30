import React from 'react';
import { Link } from 'react-router-dom';
import type { Notification } from '../types/notification';
import { CATEGORY_META, PRIORITY_META } from '../types/notification';

export const CategoryBadge: React.FC<{ cat: string }> = ({ cat }) => {
  const m = CATEGORY_META[cat as keyof typeof CATEGORY_META] || CATEGORY_META.general;
  return (
    <span className="inline-flex items-center gap-1.5 text-[10px] font-bold tracking-wide uppercase px-2 py-1 rounded-md border" style={{ background: 'color-mix(in srgb, var(--ks-card-bg) 70%, transparent)', borderColor: 'var(--ks-card-border)', color: m.color }}>
      <span className="w-1.5 h-1.5 rounded-full" style={{ background: m.color }} />
      {m.label}
    </span>
  );
};

export const PriorityBadge: React.FC<{ pri: string }> = ({ pri }) => {
  const m = PRIORITY_META[pri as keyof typeof PRIORITY_META] || PRIORITY_META.normal;
  return (
    <span className={`inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-1 rounded-md border ${m.bg} ${m.color}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${m.dot}`} />
      {m.label}
    </span>
  );
};

function parseMediaCard(json?: string): { type: string; url: string }[] {
  if (!json || json === '[]') return [];
  try {
    const arr = JSON.parse(json);
    if (!Array.isArray(arr)) return [];
    return arr.map((it: any) => typeof it === 'string' ? { type: 'image', url: it } : { type: (it.type || 'image').toLowerCase(), url: it.url || '' }).filter((m: any) => m.url).slice(0, 3);
  } catch { return []; }
}

const timeAgoFull = (iso: string) => {
  const d = new Date(iso);
  return d.toLocaleString(undefined, { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
};

const NotificationCard: React.FC<{
  n: Notification;
  onRead?: (id: number) => void;
  onDelete?: (id: number) => void;
  busy?: boolean;
}> = ({ n, onRead, onDelete, busy }) => {
  const cat = CATEGORY_META[n.category] || CATEGORY_META.general;
  const pri = PRIORITY_META[n.priority] || PRIORITY_META.normal;
  const unread = !n.is_read;
  const cover = (n as any).cover_image as string | undefined;
  const notes = (n as any).notes as string | undefined;
  const media = parseMediaCard((n as any).media_json);

  return (
    <article className={`ks-card ks-list-card group relative flex flex-col gap-3 p-4 rounded-xl border transition-all duration-200 ${unread ? 'border-sky-400/30' : ''}`} style={{ borderColor: unread ? 'color-mix(in srgb, var(--ks-info, #38bdf8) 30%, var(--ks-card-border))' : 'var(--ks-card-border)', background: unread ? 'color-mix(in srgb, var(--ks-info, #38bdf8) 5%, var(--ks-card-bg))' : 'var(--ks-card-bg)' }}>
      {unread && <div className="pointer-events-none absolute left-0 top-0 bottom-0 w-1 rounded-l-xl" style={{ background: 'var(--ks-info, #38bdf8)' }} aria-hidden="true" />}
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px opacity-60" style={{ background: 'linear-gradient(to right, transparent, var(--ks-card-border), transparent)' }} />
      <header className="flex items-start gap-3 min-w-0">
        <div className="shrink-0 w-10 h-10 rounded-xl flex items-center justify-center border overflow-hidden" style={{ background: unread ? 'color-mix(in srgb, var(--ks-info) 14%, var(--ks-card-bg))' : 'var(--ks-card-bg)', borderColor: unread ? 'color-mix(in srgb, var(--ks-info) 22%, var(--ks-card-border))' : 'var(--ks-card-border)', color: cat.color }}>
          {cover ? <img src={cover} alt="" className="w-full h-full object-cover" loading="lazy" /> : (
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5" aria-hidden="true">
            {n.category === 'node' && <><circle cx="12" cy="12" r="3" /><circle cx="4" cy="5" r="1.5" /><circle cx="20" cy="5" r="1.5" /><circle cx="4" cy="19" r="1.5" /><circle cx="20" cy="19" r="1.5" /></>}
            {n.category === 'instance' && <><rect x="3" y="6" width="11" height="9" rx="1.2" /><rect x="8" y="11" width="11" height="9" rx="1.2" /></>}
            {n.category === 'security' && <><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /><path d="m9 12 2 2 4-4" /></>}
            {n.category === 'system' && <><rect x="3" y="3" width="7" height="9" rx="1" /><rect x="14" y="3" width="7" height="5" rx="1" /></>}
            {!['node','instance','security','system'].includes(n.category) && <><path d="M6 8a6 6 0 0 1 12 0c0 7-6 5-6 10" /><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" /></>}
          </svg>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="text-sm leading-snug line-clamp-2 font-semibold" style={{ color: 'var(--ks-text-body)', fontWeight: unread ? 700 : 600 }} title={n.title}>{n.title}</h3>
          <p className="text-[11px] font-mono mt-0.5 flex items-center gap-1.5 flex-wrap" style={{ color: 'var(--ks-muted)' }}>
            <span>{timeAgoFull(n.created_at)}</span>
            {n.actor_name && <><span className="w-1 h-1 rounded-full" style={{ background: 'var(--ks-card-border)' }} /><span>by <span style={{ color: 'var(--ks-text-body)' }}>{n.actor_name}</span></span></>}
            {n.is_broadcast && <><span className="w-1 h-1 rounded-full" style={{ background: 'var(--ks-card-border)' }} /><span className="px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wide border" style={{ background: 'color-mix(in srgb, #e879f9 14%, transparent)', borderColor: 'color-mix(in srgb, #e879f9 30%, transparent)', color: '#f0abfc' }}>Broadcast</span></>}
          </p>
          {notes && <p className="text-xs mt-1 line-clamp-2" style={{ color: 'var(--ks-muted)' }}><span className="font-semibold" style={{ color: 'var(--ks-text-body)' }}>Notes:</span> {notes}</p>}
        </div>
        <div className="shrink-0 flex flex-col items-end gap-1.5">
          {!n.is_read ? <span className="w-2.5 h-2.5 rounded-full animate-pulse" style={{ background: 'var(--ks-info, #38bdf8)', boxShadow: '0 0 8px color-mix(in srgb, var(--ks-info) 70%, transparent)' }} title="Unread" /> : <span className="w-2.5 h-2.5 rounded-full border" style={{ borderColor: 'var(--ks-card-border)', background: 'color-mix(in srgb, var(--ks-card-bg) 80%, transparent)' }} title="Read" />}
        </div>
      </header>

      {cover && !media.length && (
        <div className="rounded-xl overflow-hidden border" style={{ borderColor: 'var(--ks-card-border)' }}>
          <img src={cover} alt="cover" className="w-full h-36 object-cover" loading="lazy" />
        </div>
      )}

      {media.length > 0 && (
        <div className="grid grid-cols-3 gap-1.5">
          {media.map((m, i) => {
            const isVideo = m.type === 'video' || /\.(mp4|webm|mov)(\?|$)/i.test(m.url);
            return (
              <div key={i} className="rounded-lg overflow-hidden border aspect-video relative bg-black/20" style={{ borderColor: 'var(--ks-card-border)' }}>
                {isVideo ? <video src={m.url} className="w-full h-full object-cover" muted playsInline /> : <img src={m.url} alt="" className="w-full h-full object-cover" loading="lazy" />}
                {m.type === 'gif' && <span className="absolute top-1 left-1 text-[8px] font-bold px-1 py-0.5 rounded bg-black/60 text-white">GIF</span>}
              </div>
            );
          })}
        </div>
      )}

      {n.message && <p className="text-sm leading-relaxed line-clamp-3 rounded-lg px-3 py-2 border" style={{ color: 'var(--ks-text-body)', background: 'color-mix(in srgb, var(--ks-bg-color, #000) 40%, transparent)', borderColor: 'var(--ks-card-border)' }}>{n.message}</p>}

      <div className="flex flex-wrap items-center gap-1.5">
        <CategoryBadge cat={n.category} />
        <PriorityBadge pri={n.priority} />
        <span className="text-[11px] ml-auto" style={{ color: 'var(--ks-muted)' }}>{n.is_read && n.read_at ? `Read ${new Date(n.read_at).toLocaleDateString()}` : unread ? 'Unread' : 'Read'}</span>
      </div>

      <footer className="flex items-center justify-between gap-2 pt-2 border-t mt-1" style={{ borderColor: 'var(--ks-card-border)' }}>
        <div className="flex items-center gap-2 flex-wrap">
          <Link to={`/notifications/${n.id}`} className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-md border" style={{ background: 'var(--ks-card-bg)', color: 'var(--ks-text-body)', borderColor: 'var(--ks-card-border)' }}>
            Details
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-3 h-3"><path d="M9 18l6-6-6-6" /></svg>
          </Link>
          {n.link ? (
            <a href={n.link} onClick={(e) => { e.preventDefault(); window.location.href = n.link!; }} className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-md" style={{ background: 'var(--ks-btn-bg)', color: 'var(--ks-btn-text)' }}>
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-3.5 h-3.5"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" /><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" /></svg>
              {n.action_label || 'Open'}
            </a>
          ) : n.action_label ? (
            <span className="text-xs rounded-md px-2 py-1 border" style={{ color: 'var(--ks-muted)', borderColor: 'var(--ks-card-border)', background: 'var(--ks-card-bg)' }}>{n.action_label}</span>
          ) : null}
        </div>
        <div className="flex items-center gap-1.5">
          {unread && onRead && (
            <button onClick={() => onRead(n.id)} disabled={!!busy} className="inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-md border disabled:opacity-50" style={{ color: 'var(--ks-info)', background: 'color-mix(in srgb, var(--ks-info) 14%, transparent)', borderColor: 'color-mix(in srgb, var(--ks-info) 30%, transparent)' }}>
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-3.5 h-3.5"><path d="M20 6L9 17l-5-5" /></svg>
              Mark read
            </button>
          )}
          {onDelete && (
            <button onClick={() => onDelete(n.id)} className="w-8 h-8 grid place-items-center rounded-md border" style={{ color: 'var(--ks-muted)', borderColor: 'var(--ks-card-border)', background: 'var(--ks-card-bg)' }}>
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="w-4 h-4"><polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /></svg>
            </button>
          )}
        </div>
      </footer>
    </article>
  );
};

export default NotificationCard;
