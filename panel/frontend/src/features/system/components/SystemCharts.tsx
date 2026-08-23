import type { SeriesSample } from '@/features/system/types/system';

const REFRESH_MS = 15_000;

export function fmtGB(gb: number): string {
  if (!isFinite(gb) || gb <= 0) return '—';
  if (gb >= 1024) return `${(gb / 1024).toFixed(1)} TB`;
  if (gb >= 100) return `${gb.toFixed(1)} GB`;
  if (gb >= 1) return `${gb.toFixed(2)} GB`;
  return `${(gb * 1024).toFixed(0)} MB`;
}

export function fmtMB(mb: number): string {
  if (!isFinite(mb) || mb <= 0) return '—';
  if (mb >= 1024 * 1024) return `${(mb / 1024 / 1024).toFixed(2)} TB`;
  if (mb >= 1024) return `${(mb / 1024).toFixed(2)} GB`;
  return `${mb.toFixed(0)} MB`;
}

export function fmtBytes(n: number): string {
  if (!isFinite(n) || n <= 0) return '—';
  const u = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'];
  let v = n, i = 0;
  while (v >= 1024 && i < u.length - 1) { v /= 1024; i++; }
  const digits = i === 0 ? 0 : v < 10 ? 2 : v < 100 ? 1 : 0;
  return `${v.toFixed(digits)} ${u[i]}`;
}

export function fmtUptime(s: number): string {
  if (!isFinite(s) || s <= 0) return '—';
  const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60);
  if (d > 0) return `${d}d ${h}h ${m}m`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

export function fmtPct(v: number): string {
  if (!isFinite(v)) return '—';
  return `${v.toFixed(1)}%`;
}

export interface StatCardProps {
  label: string;
  value: number | string;
  icon: React.ReactNode;
  accent?: string;
  hint?: string;
}

export const StatCard: React.FC<StatCardProps> = ({ label, value, icon, accent = 'text-white', hint }) => (
  <div className="ks-card ks-stat-card rounded-xl flex items-center ga">
    <div className={`shrink-0 w-10 h-10 rounded-lg flex items-center justify-center border border-white/10 bg-white/5 ${accent}`}>
      {icon}
   </div>
    <div className="min-w-0">
      <div className="text-2xl font-semibold text-white leading-none tabular-nums">{value}</div>
      <div className="text-xs text-gray-400 mt-1 uppercase tracking-wide truncate">{label}</div>
      {hint && <div className="text-[11px] text-gray-500 mt-0.5 truncate">{hint}</div>}
   </div>
  </div>
);

export const PctBar: React.FC<{ label: string; used: number; total: number; color: string }> = ({ label, used, total, color }) => {
  const p = total > 0 ? Math.round((used / total) * 100) : 0;
  return (
    <div>
      <div className="flex items-center justify-between text-xs mb-1">
        <span className="text-gray-400 uppercase tracking-wide">{label}</span>
        <span className="text-gray-200 font-mono tabular-nums">{p}%</span>
     </div>
      <div className="h-2 bg-neutral-800 rounded-full overflow-hidden">
        <div className={`h-2 ${color} transition-all duration-500`} style={{ width: `${p}%` }} />
     </div>
    </div>
  );
};

export const Donut: React.FC<{
  segs: Array<{ value: number; color: string; label?: string }>;
  size?: number;
  thickness?: number;
  centerText?: { value: string; sub?: string };
}> = ({ segs, size = 92, thickness = 8, centerText }) => {
  const r = (size - thickness) / 2;
  const c = 2 * Math.PI * r;
  const total = segs.reduce((acc, s) => acc + s.value, 0);
  let offset = 0;
  const arcs = segs.map((s) => {
    const frac = total > 0 ? s.value / total : 0;
    const len = frac * c;
    const arc = { color: s.color, dash: `${len} ${c - len}`, offset: -offset };
    offset += len;
    return arc;
  });
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="shrink-0">
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--ks-chart-track, #1f2937)" strokeWidth={thickness} />
      <g transform={`rotate(-90 ${size / 2} ${size / 2})`}>
        {total > 0 ? arcs.map((a, i) => (
          <circle key={i} cx={size / 2} cy={size / 2} r={r} fill="none" stroke={a.color} strokeWidth={thickness}
            strokeDasharray={a.dash} strokeDashoffset={a.offset} />
        )) : null}
     </g>
      {centerText && (
        <text x={size / 2} y={size / 2 - 2} textAnchor="middle" className="fill-white" fontSize="18" fontWeight="600">
          {centerText.value}
        </text>
      )}
      {centerText?.sub && (
        <text x={size / 2} y={size / 2 + 14} textAnchor="middle" className="fill-gray-400" fontSize="9">
          {centerText.sub}
        </text>
      )}
    </svg>
  );
};

export const LineChart: React.FC<{ samples: SeriesSample[]; metric: 'cpu_percent' | 'ram_used_pct' | 'load1'; color: string; height?: number; }> = ({
  samples, metric, color, height = 110,
}) => {
  const W = 720, H = height, PAD = 14;
  const max = samples.length === 0 ? 100 : Math.max(100, ...samples.map((s) => s[metric])) * 1.1;
  const usableW = W - PAD * 2, usableH = H - PAD * 2;
  const points = samples.map((s, i) => {
    const x = PAD + (samples.length === 1 ? usableW / 2 : (i / (samples.length - 1)) * usableW);
    const y = PAD + (1 - s[metric] / max) * usableH;
    return [x, y] as const;
  });
  const path = points.length === 0
    ? ''
    : points.map(([x, y], i) => `${i === 0 ? 'M' : 'L'} ${x.toFixed(2)} ${y.toFixed(2)}`).join(' ');
  const fillPath = points.length < 2
    ? ''
    : `${path} L ${points[points.length - 1][0].toFixed(2)} ${(H - PAD).toFixed(2)} L ${points[0][0].toFixed(2)} ${(H - PAD).toFixed(2)} Z`;
  const last = samples[samples.length - 1];
  return (
    <div className="relative">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" preserveAspectRatio="none">
        {[0.25, 0.5, 0.75].map((r) => (
          <line key={r} x1={PAD} x2={W - PAD} y1={PAD + r * usableH} y2={PAD + r * usableH}
            stroke="var(--ks-chart-track, #27272a)" strokeDasharray="3 4" strokeWidth="0.5" />
        ))}
        {fillPath && <path d={fillPath} fill={color} opacity="0.18" />}
        {path && <path d={path} fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />}
        {!path && (
          <text x={W / 2} y={H / 2} textAnchor="middle" fill="#6b7280" fontSize="12">warming up…</text>
        )}
     </svg>
      {last && (
        <div className="absolute top-1 right-2 text-xs font-mono tabular-nums" style={{ color }}>
          {(last[metric] || 0).toFixed(1)}{metric === 'ram_used_pct' ? '%' : ''}
       </div>
      )}
    </div>
  );
};

export const Sparkline: React.FC<{ values: number[]; color: string }> = ({ values, color }) => {
  const W = 100, H = 28, PAD = 2;
  const max = values.length === 0 ? 1 : Math.max(...values, 1);
  const xstep = (W - PAD * 2) / Math.max(1, values.length - 1);
  const pts = values.map((v, i) => {
    const x = PAD + i * xstep;
    const y = PAD + (1 - v / max) * (H - PAD * 2);
    return [x, y] as const;
  });
  const d = pts.map(([x, y], i) => `${i === 0 ? 'M' : 'L'} ${x.toFixed(2)} ${y.toFixed(2)}`).join(' ');
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-7 mt-1">
      {d && <path d={d} fill="none" stroke={color} strokeWidth="1.4" />}
    </svg>
  );
};

export const BarChart: React.FC<{ values: Array<{ label: string; value: number; max: number }> }> = ({ values }) => (
  <div className="space-y-2">
    {values.map((v) => {
      const widthPct = v.max > 0 ? Math.min(100, (v.value / v.max) * 100) : 0;
      let color = 'bg-emerald-500';
      if (v.value > v.max) color = 'bg-red-500';
      else if (v.value > v.max * 0.66) color = 'bg-amber-500';
      return (
        <div key={v.label}>
          <div className="flex items-center justify-between text-xs text-gray-300 mb-1">
            <span className="uppercase tracking-wide text-gray-400">{v.label}</span>
            <span className="font-mono tabular-nums">{v.value.toFixed(2)}</span>
         </div>
          <div className="h-2.5 bg-neutral-800 rounded-full overflow-hidden">
            <div className={`h-2.5 ${color} transition-all duration-500`} style={{ width: `${widthPct}%` }} />
         </div>
        </div>
      );
    })}
  </div>
);

export const Gauge: React.FC<{ value: number; total: number; label: string }> = ({ value, total, label }) => {
  const pct = total > 0 ? Math.min(100, (value / total) * 100) : 0;
  const r = 56;
  const c = Math.PI * r;
  const dash = (pct / 100) * c;
  let color = '#34d399';
  if (pct > 85) color = '#ef4444';
  else if (pct > 70) color = '#fbbf24';
  return (
    <div className="flex flex-col items-center justify-center">
      <svg width="140" height="86" viewBox="0 0 140 86">
        <path d={`M 14 80 A ${r} ${r} 0 0 1 ${126} 80`} fill="none" stroke="var(--ks-chart-track, #27272a)" strokeWidth="9" strokeLinecap="round" />
        <path d={`M 14 80 A ${r} ${r} 0 0 1 ${126} 80`} fill="none" stroke={color} strokeWidth="9"
          strokeLinecap="round" strokeDasharray={`${dash} ${c}`} />
        <text x="70" y="62" textAnchor="middle" className="fill-white" fontSize="22" fontWeight="600">{pct.toFixed(0)}%</text>
        <text x="70" y="80" textAnchor="middle" className="fill-gray-400" fontSize="9">{label}</text>
     </svg>
      <div className="text-xs text-gray-300 font-mono mt-1">
        {fmtGB(value)} / {fmtGB(total)}
     </div>
    </div>
  );
};

export function instanceDot(status: string): string {
  switch (status) {
    case 'running': return 'bg-emerald-400';
    case 'stopped': return 'bg-neutral-500';
    case 'creating': return 'bg-amber-400';
    case 'errored': return 'bg-red-500';
    default: return 'bg-neutral-600';
  }
}