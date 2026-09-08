import React from 'react';
import type { TicketPriority, TicketStatus, TicketCategory } from '../types/ticket';

// Status badge matching nodes STATE_STYLES but for tickets
export const STATUS_META: Record<TicketStatus, { label: string; bg: string; text: string; dot: string; icon?: string }> = {
  open:        { label: 'Open',        bg: 'bg-sky-500/15 border-sky-500/30',    text: 'text-sky-300',    dot: 'bg-sky-400' },
  pending:     { label: 'Pending',     bg: 'bg-amber-500/15 border-amber-500/30', text: 'text-amber-300',  dot: 'bg-amber-400' },
  in_progress: { label: 'In Progress', bg: 'bg-violet-500/15 border-violet-500/30', text: 'text-violet-300', dot: 'bg-violet-400' },
  resolved:   { label: 'Resolved',    bg: 'bg-emerald-500/15 border-emerald-500/30', text:'text-emerald-300',dot:'bg-emerald-400'},
  closed:     { label: 'Closed',      bg: 'bg-gray-500/15 border-gray-500/30',   text: 'text-gray-300',   dot: 'bg-gray-400' },
};

export const PRIORITY_META: Record<TicketPriority, { label: string; bg: string; text: string; dot: string }> = {
  low:      { label: 'Low',      bg: 'bg-gray-500/15 border-gray-500/30', text: 'text-gray-400', dot: 'bg-gray-400' },
  medium:   { label: 'Medium',   bg: 'bg-sky-500/15 border-sky-500/30',    text: 'text-sky-300',  dot: 'bg-sky-400' },
  high:     { label: 'High',     bg: 'bg-amber-500/15 border-amber-500/30', text: 'text-amber-300',dot: 'bg-amber-400' },
  urgent:   { label: 'Urgent',   bg: 'bg-orange-500/15 border-orange-500/30',text: 'text-orange-300',dot:'bg-orange-400'},
  critical: { label: 'Critical', bg: 'bg-red-500/20 border-red-500/40',     text: 'text-red-300',  dot: 'bg-red-500' },
};

export const CATEGORY_META: Record<string, { label: string; icon: string }> = {
  general:   { label: 'General',   icon: 'ticket' },
  billing:   { label: 'Billing',   icon: 'billing' },
  technical: { label: 'Technical', icon: 'technical' },
  feature:   { label: 'Feature',   icon: 'feature' },
  bug:       { label: 'Bug',       icon: 'bug' },
  abuse:     { label: 'Abuse',     icon: 'abuse' },
  other:     { label: 'Other',     icon: 'other' },
};

export const TicketStatusBadge: React.FC<{ status: TicketStatus; size?: 'sm' | 'xs' }> = ({ status, size = 'xs' }) => {
  const m = STATUS_META[status] || STATUS_META.open;
  const sz = size === 'xs' ? 'text-[10px] px-1.5 py-0.5' : 'text-xs px-2 py-1';
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-md border font-semibold uppercase tracking-wide ${m.bg} ${m.text} ${sz}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${m.dot}`} />
      {m.label}
    </span>
  );
};

export const TicketPriorityBadge: React.FC<{ priority: TicketPriority; size?: 'sm' | 'xs' }> = ({ priority, size = 'xs' }) => {
  const m = PRIORITY_META[priority] || PRIORITY_META.medium;
  const sz = size === 'xs' ? 'text-[10px] px-1.5 py-0.5' : 'text-xs px-2 py-1';
  return (
    <span className={`inline-flex items-center gap-1 rounded-md border font-medium ${m.bg} ${m.text} ${sz}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${m.dot}`} />
      {m.label}
    </span>
  );
};

export const CategoryIcon: React.FC<{ category: string; className?: string }> = ({ category, className = 'w-4 h-4' }) => {
  const common = { xmlns: 'http://www.w3.org/2000/svg', viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, className, 'aria-hidden': true } as any;
  switch (category) {
    case 'billing':
      return <svg {...common}><rect x="2" y="5" width="20" height="14" rx="2" /><path d="M2 10h20" /><circle cx="12" cy="14" r="1.5" fill="currentColor" /></svg>;
    case 'technical':
      return <svg {...common}><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" /></svg>;
    case 'feature':
      return <svg {...common}><path d="M12 2 13.5 8.5 20 9l-5 4 1.5 6.5L12 16l-4.5 3.5L9 13 4 9l6.5-.5z" /></svg>;
    case 'bug':
      return <svg {...common}><path d="M12 8V4H8" /><rect x="4" y="8" width="16" height="12" rx="2" /><path d="M2 12h2M20 12h2M8 20v2M16 20v2" /><circle cx="9" cy="13" r="1" fill="currentColor" /><circle cx="15" cy="13" r="1" fill="currentColor" /></svg>;
    case 'abuse':
      return <svg {...common}><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /><path d="m9 12 2 2 4-4" /></svg>;
    default:
      return <svg {...common}><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><path d="M14 2v6h6" /><path d="M10 13H8M16 17H8M13 17h.01" /></svg>;
  }
};

export const TicketIcon: React.FC<{ status?: TicketStatus; className?: string }> = ({ status = 'open', className = 'w-5 h-5' }) => {
  const isActive = status === 'open' || status === 'in_progress';
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <path d="M2 9a3 3 0 0 1 3-3h14a3 3 0 0 1 3 3v6a3 3 0 0 1-3 3H5a3 3 0 0 1-3-3z" />
      <path d="M8 9v6M16 9v6" strokeWidth={1.4} opacity={0.6} />
      <circle cx="12" cy="12" r="1" fill="currentColor" opacity={isActive ? 1 : 0.5} />
    </svg>
  );
};

export function formatTicketDate(s?: string | null): string {
  if (!s) return '—';
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return s;
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}
export function formatTicketDateTime(s?: string | null): string {
  if (!s) return '—';
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return s;
  return d.toLocaleString(undefined, { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}
