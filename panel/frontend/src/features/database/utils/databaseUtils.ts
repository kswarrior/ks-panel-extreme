// Database utilities - extracted from Database.tsx

// Sparkline rolling window
export const HISTORY_WINDOW = 60;
export const REFRESH_MS = 5000;

export function BarWidth(bytes: number, max: number): number {
  if (!max || bytes <= 0) return 0;
  return Math.max(2, Math.round((bytes / max) * 100));
}

export function formatBytes(n: number): string {
  if (n === undefined || n === null || n < 0) return '—';
  if (n === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let v = n;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  const rounded = i === 0 ? v.toString() : v.toFixed(i >= 2 ? 2 : 1);
  return `${rounded} ${units[i]}`;
}

export function formatSigned(bytes: number): string {
  if (bytes === 0) return '0';
  const sign = bytes > 0 ? '+' : '−';
  return `${sign}${formatBytes(Math.abs(bytes))}`;
}

export function ago(seconds: number): string {
  if (seconds < 1) return 'just now';
  if (seconds < 60) return `${seconds}s ago`;
  const m = Math.floor(seconds / 60);
  if (m < 60) return `${m}m ago`;
  return `${Math.floor(m / 60)}h ago`;
}

export function autoVacuumLabel(mode: number): string {
  switch (mode) {
    case 1: return 'INCREMENTAL';
    case 2: return 'FULL';
    default: return 'NONE';
  }
}

export function tableTypeLabel(name: string): string {
  if (name.startsWith('sqlite_')) return 'system';
  return 'user';
}

export function tableTypeBadge(name: string): string {
  if (name.startsWith('sqlite_')) return 'bg-neutral-800 text-neutral-400';
  return 'bg-sky-900/50 text-sky-200';
}