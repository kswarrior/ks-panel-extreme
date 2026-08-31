import React, { useMemo, useState } from 'react';

// ---------------------------------------------------------------------------
//  MetricsChart primitives
// ---------------------------------------------------------------------------
//  Reusable, dependency-free SVG chart primitives for the Instance Metrics
//  page. Every chart here ships with:
//   * real CSS color values (not Tailwind classes) — Tailwind classes on
//     <svg stroke=>/<svg fill=> are silently ignored by the browser
//   * a stable canvas size driven by the parent (responsive viewBox)
//   * optional "optimistic" overlay — a dashed projection of the next value
//     based on a simple linear-regression on the last few samples, so the
//     graph keeps moving between 5s polls instead of flatlining
//   * consistent axis/labels/grid so every chart on the page reads as a set
//
//  Tailwind utilities are used only for *positioning* of the SVG container
//  (height, padding, color of the labels around it); the SVG paint itself
//  uses inline hex / rgb() values.

export interface MetricSample {
  /** Sample timestamp (ms since epoch). */
  t: number;
  /** Sample value (units depend on the metric). */
  v: number;
}

const VIEW_W = 100; // SVG viewBox is fixed at 100 wide so all charts line up
const VIEW_H = 36;  // tall charts (donut, gauge) reuse the same width

/** Format a timestamp as HH:MM:SS — short, monospace, no locale surprise. */
export const fmtClock = (ms: number): string => {
  const d = new Date(ms);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
};

/** Clamp a value between min and max (inclusive). */
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/**
 * Linear regression on the last `n` samples; returns {slope, intercept} so
 * the caller can predict `intercept + slope * futureIndex`. Falls back to
 * the most-recent value when there aren't enough samples to regress (<=2).
 * Used to draw the dashed "optimistic" segment on every chart.
 */
export function predictNext(samples: MetricSample[], n = 6): { slope: number; intercept: number } {
  if (samples.length < 2) return { slope: 0, intercept: samples[0]?.v ?? 0 };
  const last = samples.slice(-Math.min(n, samples.length));
  const xs = last.map((_, i) => i);
  const ys = last.map((s) => s.v);
  const meanX = xs.reduce((a, b) => a + b, 0) / xs.length;
  const meanY = ys.reduce((a, b) => a + b, 0) / ys.length;
  let num = 0;
  let den = 0;
  for (let i = 0; i < xs.length; i++) {
    num += (xs[i] - meanX) * (ys[i] - meanY);
    den += (xs[i] - meanX) * (xs[i] - meanX);
  }
  const slope = den === 0 ? 0 : num / den;
  const intercept = meanY - slope * meanX;
  return { slope, intercept };
}

// ---------------------------------------------------------------------------
//  AreaChart — gradient-filled time series with grid, labels, optimistic line
// ---------------------------------------------------------------------------

export interface AreaChartProps {
  samples: MetricSample[];
  /** Upper bound for the Y axis. */
  max: number;
  /** Optional hard lower bound for the Y axis (default 0). */
  min?: number;
  /** Hex/rgb stroke + fill for the area. */
  color: string;
  /** Label rendered above the chart (e.g. "CPU %"). */
  label?: string;
  /** Optional unit suffix appended to the y-axis tick labels (e.g. "%"). */
  unit?: string;
  /** Height in Tailwind units; default h-44. */
  heightClass?: string;
  /**
   * When true, draw a dashed "predict" segment extending to the right edge
   * of the chart based on a short-window linear regression. Defaults true.
   */
  optimistic?: boolean;
  /** Optional threshold line (e.g. 80 for "warn at 80%") in chart units. */
  threshold?: number;
  /** Stroke color for the threshold line (default amber). */
  thresholdColor?: string;
}

export const AreaChart: React.FC<AreaChartProps> = ({
  samples,
  max,
  min = 0,
  color,
  label,
  unit = '',
  heightClass = 'h-44',
  optimistic = true,
  threshold,
  thresholdColor = 'var(--ks-accent-warning, #fbbf24)',
}) => {
  // Down-sample for the polyline — keep up to ~80 points for a clean path
  // but render whatever the parent gives us (the 5s poll caps samples at
  // ~30-300 entries over the user's selected window).
  const [hover, setHover] = useState<number | null>(null);

  const { path, areaPath, dots, predictDots, thresholdY, ticks } = useMemo(() => {
    const n = samples.length;
    const ticks: { y: number; label: string }[] = [];
    // Four y-axis ticks evenly spaced.
    for (let i = 0; i <= 4; i++) {
      const v = min + (max - min) * (1 - i / 4);
      ticks.push({ y: (i / 4) * VIEW_H, label: `${v.toFixed(0)}${unit}` });
    }
    if (n === 0) return { path: '', areaPath: '', dots: [], predictDots: [], thresholdY: -1, ticks };

    const xAt = (i: number) => (i / Math.max(n - 1, 1)) * VIEW_W;
    const yAt = (v: number) => ((clamp(v, min, max) - min) / (max - min || 1)) * VIEW_H;

    const pts = samples.map((s, i) => [xAt(i), yAt(s.v)] as [number, number]);
    const path = pts
      .map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(2)},${y.toFixed(2)}`)
      .join(' ');

    const areaPath =
      `M${pts[0][0].toFixed(2)},${VIEW_H} ` +
      pts.map(([x, y]) => `L${x.toFixed(2)},${y.toFixed(2)}`).join(' ') +
      ` L${pts[pts.length - 1][0].toFixed(2)},${VIEW_H} Z`;

    const dots = pts.map(([x, y], i) => ({ x, y, sample: samples[i] }));

    // Optimistic projection: 6 future points, fading in.
    const predictDots: { x: number; y: number }[] = [];
    if (optimistic && n >= 2) {
      const { slope, intercept } = predictNext(samples);
      const steps = 6;
      const lastIdx = n - 1;
      for (let k = 1; k <= steps; k++) {
        const futureIdx = lastIdx + k;
        const v = intercept + slope * futureIdx;
        const x = (futureIdx / Math.max(lastIdx + steps - 1, 1)) * VIEW_W;
        const y = yAt(v);
        // Fade opacity from 0.7 -> 0 across the projection.
        predictDots.push({ x, y });
      }
    }

    const thresholdY =
      threshold !== undefined && threshold >= min && threshold <= max
        ? yAt(threshold)
        : -1;

    return { path, areaPath, dots, predictDots, thresholdY, ticks };
  }, [samples, max, min, unit, optimistic, threshold]);

  // Convert pointer position to nearest sample index for the tooltip.
  const onMove = (e: React.MouseEvent<SVGSVGElement>) => {
    if (dots.length === 0) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const rel = clamp((e.clientX - rect.left) / rect.width, 0, 1);
    setHover(Math.round(rel * (dots.length - 1)));
  };

  const gradId = React.useId();
  const hoverSample = hover != null ? dots[hover]?.sample : null;
  const latestSample = samples[samples.length - 1];

  return (
    <div className={`relative w-full ${heightClass}`}>
      {/* Header line: label left, latest value right */}
      <div className="flex items-baseline justify-between text-[11px] text-gray-400 mb-1 px-1">
        <span className="uppercase tracking-wide">{label}</span>
        <span className="font-mono text-gray-200">
          {latestSample
            ? `${latestSample.v.toFixed(latestSample.v >= 100 ? 0 : 1)}${unit}`
            : '—'} 
        </span>
      </div>
      <svg
        viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
        preserveAspectRatio="none"
        className="w-full h-[calc(100%-1.25rem)] block"
        onMouseMove={onMove}
        onMouseLeave={() => setHover(null)}
      >
        <defs>
          <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.55" />
            <stop offset="100%" stopColor={color} stopOpacity="0.02" /> 
          </linearGradient>
        </defs>
        {/* Grid lines + y-tick labels */}
        {ticks.map((t, i) => (
          <g key={i}>
            <line
              x1="0"
              y1={t.y}
              x2={VIEW_W}
              y2={t.y}
              stroke="var(--ks-chart-grid, rgba(255,255,255,0.06))"
              strokeWidth="0.2"
              vectorEffect="non-scaling-stroke"
            /> 
          </g>
        ))}

        {/* Optional threshold (warning line) */}
        {thresholdY >= 0 && (
          <line
            x1="0"
            y1={thresholdY}
            x2={VIEW_W}
            y2={thresholdY}
            stroke={thresholdColor}
            strokeOpacity="0.55"
            strokeWidth="0.3"
            strokeDasharray="1.5 1"
            vectorEffect="non-scaling-stroke"
          />
        )}

        {/* Filled area under the line */}
        {areaPath && (
          <path d={areaPath} fill={`url(#${gradId})`} stroke="none" />
        )}

        {/* Dashed optimistic projection */}
        {predictDots.length >= 2 && (
          <polyline
            points={predictDots.map((p) => `${p.x.toFixed(2)},${p.y.toFixed(2)}`).join(' ')}
            fill="none"
            stroke={color}
            strokeOpacity="0.55"
            strokeWidth="0.6"
            strokeDasharray="1.2 0.8"
            vectorEffect="non-scaling-stroke"
          />
        )}

        {/* Main line */}
        {path && (
          <path
            d={path}
            fill="none"
            stroke={color}
            strokeWidth="0.8"
            strokeLinejoin="round"
            strokeLinecap="round"
            vectorEffect="non-scaling-stroke"
          />
        )}

        {/* Hover crosshair + dot */}
        {hover != null && dots[hover] && (
          <g>
            <line
              x1={dots[hover].x}
              y1="0"
              x2={dots[hover].x}
              y2={VIEW_H}
              stroke="rgba(255,255,255,0.35)"
              strokeWidth="0.2"
              vectorEffect="non-scaling-stroke"
            />
            <circle cx={dots[hover].x} cy={dots[hover].y} r="0.9" fill="var(--ks-chart-dot, #ffffff)" />
          </g>
        )} 
      </svg>
      {/* Floating tooltip */}
      {hoverSample && (
        <div
          className="absolute pointer-events-none -translate-x-1/2 -top-1 px-2 py-1 rounded bg-black/80 border border-white/10 text-[10px] text-gray-100 font-mono whitespace-nowrap"
          style={{ left: `${((hover ?? 0) / Math.max(samples.length - 1, 1)) * 100}%` }}
        >
          {fmtClock(hoverSample.t)} · {hoverSample.v.toFixed(1)}{unit} 
        </div>
      )}

      {/* X-axis time labels (first / mid / last) */}
      <div className="flex justify-between text-[9px] text-gray-500 font-mono mt-0.5 px-0.5">
        <span>{samples[0] ? fmtClock(samples[0].t) : '—' }</span>
        <span>
          {samples.length > 2 ? fmtClock(samples[Math.floor(samples.length / 2)].t) : ''} 
        </span>
        <span>{samples[samples.length - 1] ? fmtClock(samples[samples.length - 1].t) : '—' }</span> 
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
//  DonutChart — disk / memory utilisation with centre label
// ---------------------------------------------------------------------------

export interface DonutChartProps {
  /** 0..100 percentage of the slice. */
  pct: number;
  /** Hex/rgb stroke for the filled arc. */
  color: string;
  /** Background ring color. */
  bgColor?: string;
  /** Center label (e.g. "73%"). */
  label: string;
  /** Smaller subtitle under the label (e.g. "12.4 GB / 18 GB"). */
  sub?: string;
  /** Diameter in pixels; default 132. */
  size?: number;
  /** When pct crosses this, the arc flips to `warnColor`. */
  warnAt?: number;
  /** When pct crosses this, the arc flips to `dangerColor`. */
  dangerAt?: number;
  warnColor?: string;
  dangerColor?: string;
}

export const DonutChart: React.FC<DonutChartProps> = ({
  pct,
  color,
  bgColor = 'rgba(255,255,255,0.08)',
  label,
  sub,
  size = 132,
  warnAt = 75,
  dangerAt = 90,
  warnColor = 'var(--ks-accent-warning, #fbbf24)',
  dangerColor = 'var(--ks-accent-danger, #f87171)',
}) => {
  const safe = clamp(pct, 0, 100);
  const arcColor = safe >= dangerAt ? dangerColor : safe >= warnAt ? warnColor : color;
  const r = 42;
  const cx = 50;
  const cy = 50;
  const circumference = 2 * Math.PI * r;
  const dash = (safe / 100) * circumference;

  return (
    <div className="flex flex-col items-center justify-center">
      <div className="relative" style={{ width: size, height: size }}>
        <svg viewBox="0 0 100 100" className="w-full h-full -rotate-90">
          <circle
            cx={cx}
            cy={cy}
            r={r}
            fill="none"
            stroke={bgColor}
            strokeWidth="9"
          />
          <circle
            cx={cx}
            cy={cy}
            r={r}
            fill="none"
            stroke={arcColor}
            strokeWidth="9"
            strokeLinecap="round"
            strokeDasharray={`${dash} ${circumference - dash}`}
            style={{ transition: 'stroke-dasharray 600ms ease-out, stroke 400ms ease-out' }}
          /> 
         </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-xl font-semibold tabular-nums text-white">{label}</span>
          {sub && <span className="text-[10px] text-gray-400 mt-0.5">{sub}</span>} 
        </div>
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
//  GaugeChart — radial half-arc gauge for CPU / load
// ---------------------------------------------------------------------------

export interface GaugeChartProps {
  /** 0..100 */
  pct: number;
  color: string;
  label?: string;
  /** Display value in the centre (defaults to `${pct}%`). */
  display?: string;
  /** Stroke width in pixels. */
  thickness?: number;
  /** Width/height in pixels. */
  size?: number;
}

export const GaugeChart: React.FC<GaugeChartProps> = ({
  pct,
  color,
  label,
  display,
  thickness = 10,
  size = 132,
}) => {
  const safe = clamp(pct, 0, 100);
  // Half-circle gauge: arc spans 180deg (from x=-1 to x=+1 in unit circle space).
  const cx = 50;
  const cy = 50;
  const r = 42;
  // Endpoint angle (in degrees, 0 = +x axis, going clockwise visually).
  const startAngle = 180;
  const sweep = (safe / 100) * 180;
  const endAngle = startAngle + sweep;
  const polar = (deg: number) => {
    const rad = (deg * Math.PI) / 180;
    return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
  };
  const start = polar(startAngle);
  const end = polar(endAngle);
  const largeArc = sweep > 180 ? 1 : 0;
  const trackStart = polar(startAngle);
  const trackEnd = polar(360);

  return (
    <div className="flex flex-col items-center justify-center">
      <div className="relative" style={{ width: size, height: size / 2 + 12 }}>
        <svg viewBox="0 0 100 60" className="w-full h-full">
          {/* Background half-circle */}
          <path
            d={`M ${trackStart.x} ${trackStart.y} A ${r} ${r} 0 0 1 ${trackEnd.x} ${trackEnd.y}`}
            fill="none"
            stroke="rgba(255,255,255,0.08)"
            strokeWidth={thickness}
            strokeLinecap="round"
          />
          {/* Filled portion */}
          {safe > 0 && (
            <path
              d={`M ${start.x} ${start.y} A ${r} ${r} 0 ${largeArc} 1 ${end.x} ${end.y}`}
              fill="none"
              stroke={color}
              strokeWidth={thickness}
              strokeLinecap="round"
              style={{ transition: 'd 600ms ease-out' }}
            />
          )} 
         </svg>
        <div className="absolute inset-x-0 bottom-0 flex flex-col items-center justify-end">
          <span className="text-xl font-semibold tabular-nums text-white leading-none">
            {display ?? `${safe.toFixed(0)}%`} 
          </span>
          {label && <span className="text-[10px] text-gray-400 mt-0.5 uppercase tracking-wide">{label}</span>} 
        </div>
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
//  Sparkline — tiny inline trend for stat tiles
// ---------------------------------------------------------------------------

export const Sparkline: React.FC<{
  samples: MetricSample[];
  color: string;
  width?: number;
  height?: number;
}> = ({ samples, color, width = 96, height = 28 }) => {
  if (samples.length < 2) {
    return (
      <svg width={width} height={height} className="opacity-40">
        <line x1="0" y1={height / 2} x2={width} y2={height / 2} stroke={color} strokeWidth="1" strokeDasharray="2 3" /> 
       </svg>
    );
  }
  const max = Math.max(...samples.map((s) => s.v), 1);
  const min = Math.min(...samples.map((s) => s.v), 0);
  const range = max - min || 1;
  const stepX = width / (samples.length - 1);
  const pts = samples
    .map((s, i) => {
      const x = i * stepX;
      const y = height - ((s.v - min) / range) * (height - 2) - 1;
      return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
      <path d={pts} fill="none" stroke={color} strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" /> 
     </svg>
  );
};

// ---------------------------------------------------------------------------
//  TrendDelta — small up/down/flat glyph + delta in absolute units
// ---------------------------------------------------------------------------

export const TrendDelta: React.FC<{
  current: number;
  previous?: number;
  unit?: string;
  digits?: number;
}> = ({ current, previous, unit = '', digits = 1 }) => {
  if (previous == null) return <span className="text-[10px] text-gray-500 font-mono">—</span>;
  const delta = current - previous;
  const same = Math.abs(delta) < 0.05;
  const dir = same ? 'flat' : delta > 0 ? 'up' : 'down';
  const tone =
    dir === 'flat' ? 'text-gray-400' : dir === 'up' ? 'text-emerald-300' : 'text-red-300';
  const arrow = dir === 'flat' ? '→' : dir === 'up' ? '↑' : '↓';
  return (
    <span className={`text-[10px] font-mono ${tone}`} title={`Δ vs. previous poll`}>
      {arrow} {Math.abs(delta).toFixed(digits)}{unit} 
    </span>
  );
};

// ---------------------------------------------------------------------------
//  HealthBadge — top-line status pill (green/amber/red)
// ---------------------------------------------------------------------------

export type Health = 'healthy' | 'warn' | 'danger' | 'unknown';

export const healthOf = (
  pct: number | undefined,
  warnAt = 75,
  dangerAt = 90,
): Health => {
  if (pct == null || !isFinite(pct)) return 'unknown';
  if (pct >= dangerAt) return 'danger';
  if (pct >= warnAt) return 'warn';
  return 'healthy';
};

export const HealthBadge: React.FC<{ health: Health; label?: string }> = ({ health, label }) => {
  const map = {
    healthy: { dot: 'bg-emerald-400', ring: 'ring-emerald-400/30', text: 'text-emerald-300', bg: 'bg-emerald-900/30', word: 'Healthy' },
    warn: { dot: 'bg-amber-400', ring: 'ring-amber-400/30', text: 'text-amber-300', bg: 'bg-amber-900/30', word: 'Watch' },
    danger: { dot: 'bg-red-400', ring: 'ring-red-400/30', text: 'text-red-300', bg: 'bg-red-900/30', word: 'Critical' },
    unknown: { dot: 'bg-gray-400', ring: 'ring-gray-400/30', text: 'text-gray-300', bg: 'bg-gray-800/40', word: 'No data' },
  } as const;
  const m = map[health];
  return (
    <span className={`inline-flex items-center gap-1.5 text-[11px] font-medium px-2 py-0.5 rounded-full ring-1 ${m.bg} ${m.ring} ${m.text}`}>
      <span className={`relative inline-flex w-1.5 h-1.5 rounded-full ${m.dot}`}>
        {(health === 'warn' || health === 'danger') && (
          <span className={`absolute inline-flex w-full h-full rounded-full ${m.dot} opacity-75 animate-ping`} />
        )} 
      </span>
      {label ?? m.word} 
    </span>
  );
};
