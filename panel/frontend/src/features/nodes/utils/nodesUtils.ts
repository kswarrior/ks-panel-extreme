// Nodes utilities - extracted from Nodes.tsx

import type { Node } from '@/shared/types/node';
import type { StateStyle } from '../types/nodes';
import { STATE_STYLES, DRIVER_ARCS } from '../types/nodes';

export function resolveState(n: Node): Node['state'] & string {
  if (n.state) return n.state;
  return n.status === 'up' ? 'up' : 'down';
}

export function isLocalAddress(addr: string): boolean {
  try {
    const url = new URL(`http://${addr}`);
    const host = url.hostname;
    return (
      host === '127.0.0.1' ||
      host === 'localhost' ||
      host === '::1' ||
      host === '[::1]' ||
      host.startsWith('127.')
    );
  } catch {
    return (
      addr.startsWith('127.0.0.1:') ||
      addr.startsWith('127.0.0.1') ||
      addr.startsWith('localhost:') ||
      addr.startsWith('localhost') ||
      addr.startsWith('[::1]:') ||
      addr.startsWith('::1')
    );
  }
}

export function formatBytes(bytes: number): string {
  if (!bytes || bytes <= 0 || !Number.isFinite(bytes)) return '0 MB';
  if (bytes < 1024 ** 2) return `${Math.round(bytes / 1024)} KB`;
  if (bytes < 1024 ** 3) return `${Math.round(bytes / 1024 ** 2)} MB`;
  const gb = bytes / 1024 ** 3;
  if (gb < 1024) return gb >= 10 ? `${gb.toFixed(1)}GB` : `${gb.toFixed(2)}GB`;
  const tb = gb / 1024;
  return tb >= 10 ? `${tb.toFixed(1)}TB` : `${tb.toFixed(2)}TB`;
}

export function formatBytesPair(used: number, total: number): string {
  if (!total || total <= 0 || !Number.isFinite(total)) {
    return used > 0 ? `${formatBytes(used)} / —` : '— / —';
  }
  return `${formatBytes(used)} / ${formatBytes(total)}`;
}

export function formatPercent(pct: number): string {
  if (!Number.isFinite(pct)) return '0%';
  return `${pct.toFixed(pct >= 10 ? 0 : 1)}%`;
}

export function withAlpha(color: string, alpha: number): string {
  const c = color.trim();
  if (!c) return c;
  const hexMatch = c.match(/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})([0-9a-fA-F]{2})?$/);
  if (hexMatch) {
    let h = hexMatch[1];
    if (h.length === 3) h = h.split('').map((x) => x + x).join('');
    const r = parseInt(h.slice(0, 2), 16);
    const g = parseInt(h.slice(2, 4), 16);
    const b = parseInt(h.slice(4, 6), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }
  const rgbMatch = c.match(/^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)/);
  if (rgbMatch) return `rgba(${rgbMatch[1]}, ${rgbMatch[2]}, ${rgbMatch[3]}, ${alpha})`;
  return c;
}

export function buildMonitor(n: Node, hbMap: Record<number, any[]>): ('up' | 'down')[] {
  const hbs = hbMap[n.id] || [];
  const out: ('up' | 'down')[] = [];
  for (let i = 0; i < 40; i++) {
    if (i < hbs.length) {
      out.push(hbs[i].status === 'up' ? 'up' : 'down');
    } else {
      out.push(n.status === 'up' ? 'up' : 'down');
    }
  }
  return out;
}

export function buildEdgeConfig(
  name: string,
  address: string,
  useTls: boolean,
  token: string,
): string {
  const origin = typeof window !== 'undefined' ? window.location.origin : 'http://localhost:5050';
  const cfg = {
    uuid: 'auto-generated-by-panel',
    name,
    panel_url: origin,
    token,
    listen_port: 4040,
    heartbeat_interval: 60,
    use_tls_upstream: useTls,
    skip_verify: false,
  };
  return JSON.stringify(cfg, null, 2);
}