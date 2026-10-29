import type { Panel } from './types';

const EMPTY = '—';

function num(value: number | undefined): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

export function fmtMB(value?: number): string {
  const n = num(value);
  return n === null ? EMPTY : `${n.toFixed(0)} MB`;
}

export function fmtGB(value?: number): string {
  const n = num(value);
  return n === null ? EMPTY : `${n.toFixed(1)} GB`;
}

export function fmtUptime(seconds?: number): string {
  const n = num(seconds);
  if (n === null || n <= 0) return EMPTY;
  const d = Math.floor(n / 86400);
  const h = Math.floor((n % 86400) / 3600);
  const m = Math.floor((n % 3600) / 60);
  if (d) return `${d}d ${h}h`;
  if (h) return `${h}h ${m}m`;
  return `${m}m`;
}

export function fmtAgo(timestamp?: string): string {
  if (!timestamp) return EMPTY;
  const date = new Date(timestamp);
  const diff = (Date.now() - date.getTime()) / 1000;
  if (!Number.isFinite(diff)) return EMPTY;
  if (diff < 60) return `${Math.max(0, Math.floor(diff))}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return date.toLocaleString();
}

export function locStr(panel: Panel): string {
  let loc = [panel.city, panel.region, panel.country].filter(Boolean).join(', ');
  if (panel.country_code) loc = `${loc ? `${loc} ` : ''}(${panel.country_code})`;
  return loc || EMPTY;
}

export function hasGeo(panel: Panel): boolean {
  return (
    Number.isFinite(panel.lat) &&
    Number.isFinite(panel.lon) &&
    (panel.lat !== 0 || panel.lon !== 0)
  );
}

export function panelName(panel: Panel): string {
  return panel.hostname || panel.panel_id.slice(0, 10);
}
