import React from 'react';
import type { ActivityLog, ActivityCategory } from '@/features/activity/types/activity';

// ActivityCards renders the audit timeline cards. It's shared by the
// standalone Activity page and the Dashboard's "Recent activity" strip so
// the visual language stays identical between the two contexts.

interface CategoryStyle {
  chip: string;
  verb: string;
  label: string;
  icon: React.ReactNode;
}

const CATEGORY_STYLES: Record<ActivityCategory, CategoryStyle> = {
  user: {
    chip: 'bg-sky-900/50 border-sky-700/40 text-sky-300',
    verb: 'bg-sky-800/50 text-sky-200',
    label: 'User',
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
        <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" />
       </svg>
    ),
  },
  role: {
    chip: 'bg-violet-900/50 border-violet-700/40 text-violet-300',
    verb: 'bg-violet-800/50 text-violet-200',
    label: 'Role',
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
        <path d="M12 2 4 6v6c0 5 3.4 8.6 8 10 4.6-1.4 8-5 8-10V6l-8-4Z" />
       </svg>
    ),
  },
  node: {
    chip: 'bg-emerald-900/50 border-emerald-700/40 text-emerald-300',
    verb: 'bg-emerald-800/50 text-emerald-200',
    label: 'Node',
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
        <rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" />
       </svg>
    ),
  },
  template: {
    chip: 'bg-indigo-900/50 border-indigo-700/40 text-indigo-300',
    verb: 'bg-indigo-800/50 text-indigo-200',
    label: 'Template',
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
        <rect x="3" y="3" width="18" height="18" rx="2" /><line x1="3" y1="9" x2="21" y2="9" /><line x1="9" y1="21" x2="9" y2="9" />
       </svg>
    ),
  },
  instance: {
    chip: 'bg-fuchsia-900/50 border-fuchsia-700/40 text-fuchsia-300',
    verb: 'bg-fuchsia-800/50 text-fuchsia-200',
    label: 'Instance',
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
        <rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" />
       </svg>
    ),
  },
  api_key: {
    chip: 'bg-amber-900/50 border-amber-700/40 text-amber-300',
    verb: 'bg-amber-800/50 text-amber-200',
    label: 'API Key',
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
        <path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4" />
       </svg>
    ),
  },
  settings: {
    chip: 'bg-slate-700/50 border-slate-600/40 text-slate-300',
    verb: 'bg-slate-800/50 text-slate-200',
    label: 'Settings',
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
        <circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1A1.7 1.7 0 0 0 9 19.4a1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1A1.7 1.7 0 0 0 4.6 9a1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z" />
       </svg>
    ),
  },
  auth: {
    chip: 'bg-cyan-900/50 border-cyan-700/40 text-cyan-300',
    verb: 'bg-cyan-800/50 text-cyan-200',
    label: 'Auth',
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
        <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4" /><polyline points="10 17 15 12 10 7" /><line x1="15" y1="12" x2="3" y2="12" />
       </svg>
    ),
  },
  system: {
    chip: 'bg-neutral-800 border-neutral-700 text-neutral-300',
    verb: 'bg-neutral-800/50 text-neutral-200',
    label: 'System',
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
      <rect x="2" y="3" width="20" height="6" rx="2" /><rect x="2" y="13" width="20" height="8" rx="2" /><line x1="6" y1="6" x2="6.01" y2="6" /><line x1="6" y1="17" x2="6.01" y2="17" />
      </svg>
    ),
  },
  ai: {
    chip: 'bg-cyan-900/50 border-cyan-700/40 text-cyan-300',
    verb: 'bg-cyan-800/50 text-cyan-200',
    label: 'AI',
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
      </svg>
    ),
  },
};

function friendlyVerb(action: string): { label: string; tone: string } {
  const lower = action.toLowerCase();
  if (lower === 'delete' || lower === 'destroy' || lower === 'login_failed') {
    return { label: action.replace(/_/g, ' '), tone: 'text-red-300 bg-red-900/40 border border-red-700/40' };
  }
  if (lower === 'create' || lower === 'deploy') {
    return { label: action, tone: 'text-emerald-300 bg-emerald-900/40 border border-emerald-700/40' };
  }
  if (lower === 'update' || lower === 'start') {
    return { label: action, tone: 'text-sky-300 bg-sky-900/40 border border-sky-700/40' };
  }
  if (lower === 'stop') {
    return { label: action, tone: 'text-amber-300 bg-amber-900/40 border border-amber-700/40' };
  }
  if (lower === 'rotate_token' || lower === 'probe') {
    return { label: action.replace(/_/g, ' '), tone: 'text-violet-300 bg-violet-900/40 border border-violet-700/40' };
  }
  return { label: action.replace(/_/g, ' '), tone: 'text-gray-300 bg-neutral-800/50 border border-white/10' };
}

function formatRelative(iso: string): string {
  const then = new Date(iso).getTime();
  if (!then) return iso;
  const diff = then - Date.now();
  const absDiff = Math.abs(diff);
  const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' });
  const minute = 60_000, hour = 60 * minute, day = 24 * hour;
  if (absDiff < minute) return rtf.format(Math.round(diff / 1000), 'second');
  if (absDiff < hour) return rtf.format(Math.round(diff / minute), 'minute');
  if (absDiff < day) return rtf.format(Math.round(diff / hour), 'hour');
  if (absDiff < 30 * day) return rtf.format(Math.round(diff / day), 'day');
  return rtf.format(Math.round(diff / (30 * day)), 'month');
}

function formatAbsolute(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleString();
}

function formatIP(ip: string): string {
  if (!ip) return '—';
  return ip;
}

function avatarInitial(name: string): string {
  if (!name) return '?';
  return name.trim().charAt(0).toUpperCase();
}

function avatarColor(name: string): string {
  if (!name) return '#4b5563';
  let h = 0;
  for (let i = 0; i < name.length; i++) {
    h = (h * 31 + name.charCodeAt(i)) | 0;
  }
  const hue = Math.abs(h) % 360;
  return `hsl(${hue} 60% 45%)`;
}

interface ActivityCardsProps {
  rows: ActivityLog[];
}

const ActivityCards: React.FC<ActivityCardsProps> = ({ rows }) => {
  return (
    <div className="ks-card-grid grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4" id="ks-activitycards-grid">
      {rows.map((r) => {
        const style = CATEGORY_STYLES[r.category as ActivityCategory] || CATEGORY_STYLES.system;
        const verb = friendlyVerb(r.action);
        return (
          <article key={r.id} id={`ks-activity-${r.id}`} className="ks-card ks-list-card glass-card rounded-xl flex flex-col gap-3 hover:border-white/20 transition-colors">
            <header className="flex items-start gap-3 min-w-0">
              <div
                className="shrink-0 w-10 h-10 rounded-full flex items-center justify-center text-base font-semibold text-white border border-white/10"
                style={{ backgroundColor: avatarColor(r.username) }}
                aria-hidden="true"
              >
                {avatarInitial(r.username)}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-sm font-semibold text-white truncate">
                    {r.username || 'system'}
                  </span>
                  {r.role && (
                    <span className="shrink-0 text-[10px] uppercase tracking-wide text-gray-400 border border-white/10 rounded px-1.5 py-0.5">
                      {r.role}
                    </span>
                  )}
                </div>
                <div className="text-[11px] text-gray-500 truncate font-mono">
                  user_id {r.user_id ?? '—'}
                </div>
              </div>
              <div className={`shrink-0 inline-flex items-center gap-1.5 text-[10px] uppercase tracking-wide px-2 py-1 rounded-md border ${style.chip}`}>
                {style.icon}
                {style.label}
              </div>
            </header>

            <div className="min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <span className={`text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded ${verb.tone}`}>
                  {verb.label}
                </span>
                {(r.target_label || r.target_id) && (
                  <span className="text-xs text-gray-200 truncate font-mono">
                    {r.target_label || `#${r.target_id}`}
                  </span>
                )}
              </div>
              {r.message && (
                <p className="text-sm text-gray-300 leading-snug break-words">
                  {r.message}
                </p>
              )}
            </div>

            <footer className="mt-auto pt-2 border-t border-white/[0.06] flex items-center justify-between gap-2 text-[11px]">
              <div className="flex items-center gap-1.5 text-gray-400 min-w-0" title={formatAbsolute(r.created_at)}>
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-3.5 h-3.5 shrink-0">
                  <circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" />
                 </svg>
                <span className="truncate">{formatRelative(r.created_at)}</span>
                <span className="text-gray-600 truncate hidden sm:inline">·</span>
                <span className="hidden sm:inline text-gray-600 truncate">{formatAbsolute(r.created_at)}</span>
              </div>
              <div className="flex items-center gap-1.5 text-gray-300 shrink-0" title={`Client IP · ${formatIP(r.ip_address)}`}>
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-3.5 h-3.5">
                  <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79Z" />
                 </svg>
                <span className="font-mono truncate max-w-[10rem]">{formatIP(r.ip_address)}</span>
              </div>
            </footer>
          </article>
        );
      })}
    </div>
  );
};

export default ActivityCards;
