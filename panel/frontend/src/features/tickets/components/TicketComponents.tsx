import React from 'react';
import type { TicketPriority, TicketStatus, TicketCategory } from '../types/ticket';

// Status/priority meta – 100% theme-aware via CSS variables.
// Uses panel theme tokens (--ks-info, --ks-warn, --ks-ok, --ks-bad, --ks-purple, --ks-muted)
// so a theme change recolors every badge without a rebuild.
export const STATUS_META: Record<TicketStatus, { label: string; color: string }> = {
  open:        { label: 'Open',        color: 'var(--ks-info)' },
  pending:     { label: 'Pending',     color: 'var(--ks-warn)' },
  in_progress: { label: 'In Progress', color: 'var(--ks-purple)' },
  resolved:    { label: 'Resolved',    color: 'var(--ks-ok)' },
  closed:      { label: 'Closed',      color: 'var(--ks-muted)' },
};

export const PRIORITY_META: Record<TicketPriority, { label: string; color: string }> = {
  low:      { label: 'Low',      color: 'var(--ks-muted)' },
  medium:   { label: 'Medium',   color: 'var(--ks-info)' },
  high:     { label: 'High',     color: 'var(--ks-warn)' },
  urgent:   { label: 'Urgent',   color: '#fb923c' },
  critical: { label: 'Critical', color: 'var(--ks-bad)' },
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
    <span
      className={`inline-flex items-center gap-1.5 rounded-md border font-semibold uppercase tracking-wide ${sz}`}
      style={{ background: `color-mix(in srgb, ${m.color} 14%, transparent)`, borderColor: `color-mix(in srgb, ${m.color} 30%, transparent)`, color: m.color }}
    >
      <span className="w-1.5 h-1.5 rounded-full" style={{ background: m.color }} />
      {m.label}
    </span>
  );
};

export const TicketPriorityBadge: React.FC<{ priority: TicketPriority; size?: 'sm' | 'xs' }> = ({ priority, size = 'xs' }) => {
  const m = PRIORITY_META[priority] || PRIORITY_META.medium;
  const sz = size === 'xs' ? 'text-[10px] px-1.5 py-0.5' : 'text-xs px-2 py-1';
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-md border font-medium ${sz}`}
      style={{ background: `color-mix(in srgb, ${m.color} 14%, transparent)`, borderColor: `color-mix(in srgb, ${m.color} 30%, transparent)`, color: m.color }}
    >
      <span className="w-1.5 h-1.5 rounded-full" style={{ background: m.color }} />
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
