import React from 'react';
import { useNavigate } from 'react-router-dom';
import type { Notification } from '../types/notification';
import { CATEGORY_META, PRIORITY_META } from '../types/notification';

export const CategoryBadge: React.FC<{ cat: string }> = ({ cat }) => {
  const m = CATEGORY_META[cat as keyof typeof CATEGORY_META] || CATEGORY_META.general;
  return (
    <span className="inline-flex items-center gap-1.5 text-[10px] font-bold tracking-wide uppercase px-2 py-1 rounded-md border bg-white/[0.05] border-white/10" style={{ color: m.color }}>
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
  const navigate = useNavigate();
  const cat = CATEGORY_META[n.category] || CATEGORY_META.general;
  const pri = PRIORITY_META[n.priority] || PRIORITY_META.normal;
  const unread = !n.is_read;

  return (
    <article className={`ks-card ks-list-card group relative flex flex-col gap-3 p-4 rounded-xl border transition-all duration-200 hover:shadow-[0_8px_32px_rgba(0,0,0,0.5)] ${unread ? 'glass-card border-sky-400/25 bg-sky-500/[0.04] hover:border-sky-300/30' : 'glass-card hover:border-white/20'}`}>
      {unread && <div className="pointer-events-none absolute left-0 top-0 bottom-0 w-1 bg-sky-400 rounded-l-xl" aria-hidden="true" />}
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/10 to-transparent opacity-60" />
      <header className="flex items-start gap-3 min-w-0">
        <div className={`shrink-0 w-10 h-10 rounded-xl flex items-center justify-center border ${unread ? 'bg-sky-500/15 border-sky-400/20 text-sky-300' : 'bg-white/[0.05] border-white/10 text-gray-300'}`}>
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5" aria-hidden="true">
            {n.category === 'node' && <><circle cx="12" cy="12" r="3" /><circle cx="4" cy="5" r="1.5" /><circle cx="20" cy="5" r="1.5" /><circle cx="4" cy="19" r="1.5" /><circle cx="20" cy="19" r="1.5" /></>}
            {n.category === 'instance' && <><rect x="3" y="6" width="11" height="9" rx="1.2" /><rect x="8" y="11" width="11" height="9" rx="1.2" /></>}
            {n.category === 'security' && <><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /><path d="m9 12 2 2 4-4" /></>}
            {n.category === 'system' && <><rect x="3" y="3" width="7" height="9" rx="1" /><rect x="14" y="3" width="7" height="5" rx="1" /></>}
            {!['node','instance','security','system'].includes(n.category) && <><path d="M6 8a6 6 0 0 1 12 0c0 7-6 5-6 10" /><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" /></>}
          </svg>
        </div>
        <div className="min-w-0 flex-1">
          <h3 className={`text-sm leading-snug line-clamp-2 ${unread ? 'font-bold text-white' : 'font-semibold text-gray-100'}`} title={n.title}>{n.title}</h3>
          <p className="text-[11px] text-gray-500 font-mono mt-0.5 flex items-center gap-1.5">
            <span>{timeAgoFull(n.created_at)}</span>
            {n.actor_name && <><span className="w-1 h-1 rounded-full bg-white/20" /><span className="text-gray-400">by {n.actor_name}</span></>}
            {n.is_broadcast && <><span className="w-1 h-1 rounded-full bg-white/20" /><span className="px-1.5 py-0.5 rounded bg-fuchsia-500/20 border border-fuchsia-400/30 text-fuchsia-200 text-[10px] font-bold uppercase tracking-wide">Broadcast</span></>}
          </p>
        </div>
        <div className="shrink-0 flex flex-col items-end gap-1.5">
          {!n.is_read ? <span className="w-2.5 h-2.5 rounded-full bg-sky-400 shadow-[0_0_8px_rgba(56,189,248,0.7)] animate-pulse" title="Unread" /> : <span className="w-2.5 h-2.5 rounded-full border border-white/15 bg-white/5" title="Read" />}
        </div>
      </header>

      {n.message && <p className="text-sm text-gray-300 leading-relaxed line-clamp-3 bg-black/20 border border-white/[0.04] rounded-lg px-3 py-2">{n.message}</p>}

      <div className="flex flex-wrap items-center gap-1.5">
        <CategoryBadge cat={n.category} />
        <PriorityBadge pri={n.priority} />
        <span className="text-[11px] text-gray-500 ml-auto">{n.is_read && n.read_at ? `Read ${new Date(n.read_at).toLocaleDateString()}` : unread ? 'Unread' : 'Read'}</span>
      </div>

      <footer className="flex items-center justify-between gap-2 pt-2 border-t border-white/[0.06] mt-1">
        <div className="flex items-center gap-2">
          {n.link ? (
            <a href={n.link} onClick={(e) => { e.preventDefault(); if (n.link!.startsWith('/')) navigate(n.link!); else window.location.href = n.link!; }} className="inline-flex items-center gap-1.5 text-xs font-semibold text-white bg-white hover:bg-gray-100 px-3 py-1.5 rounded-md transition-colors">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-3.5 h-3.5"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" /><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" /></svg>
              {n.action_label || 'Open'}
            </a>
          ) : n.action_label ? (
            <span className="text-xs text-gray-400 border border-white/10 rounded-md px-2 py-1">{n.action_label}</span>
          ) : null}
        </div>
        <div className="flex items-center gap-1.5">
          {unread && onRead && (
            <button onClick={() => onRead(n.id)} disabled={!!busy} className="inline-flex items-center gap-1.5 text-xs font-medium text-sky-300 hover:text-sky-200 bg-sky-500/15 border border-sky-400/20 hover:bg-sky-500/25 px-3 py-1.5 rounded-md transition-colors disabled:opacity-50">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-3.5 h-3.5"><path d="M20 6L9 17l-5-5" /></svg>
              Mark read
            </button>
          )}
          {onDelete && (
            <button onClick={() => onDelete(n.id)} className="w-8 h-8 grid place-items-center rounded-md text-gray-500 hover:text-red-300 hover:bg-red-500/10 border border-white/10 hover:border-red-400/20 transition-colors">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="w-4 h-4"><polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /></svg>
            </button>
          )}
        </div>
      </footer>
    </article>
  );
};

export default NotificationCard;
