import React, { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { DonutChart, AreaChart, MetricSample, GaugeChart, Sparkline, HealthBadge, healthOf } from './MetricsChart';
import GlassCard from '@/shared/components/ui/Card';

export type { MetricSample };

export interface StatCardProps {
  label: string;
  value: number | string;
  icon?: React.ReactNode;
  color?: string;
  dotColor?: string;
  trend?: { current: number; previous: number; unit?: string };
  subLabel?: string;
}

export const StatCard: React.FC<StatCardProps> = ({
  label,
  value,
  icon,
  color = 'text-white',
  dotColor = 'bg-white',
  trend,
  subLabel,
}) => (
  <GlassCard className="ks-stat-card px-4 py-3 flex items-start gap-3">
    {icon && <div className="shrink-0 w-10 h-10 rounded-lg flex items-center justify-center bg-white/[0.05] border border-white/10 text-gray-300">{icon}</div>}
    <div className="min-w-0 flex-1">
      <p className="text-xs text-gray-400 truncate">{label}</p>
      <p className={`text-xl font-semibold ${color}`}>{value}</p>
      {trend && (
        <span className="text-[10px] font-mono">
          {trend.current - trend.previous >= 0 ? '↑' : '↓'} {Math.abs(trend.current - trend.previous).toFixed(1)}{trend.unit || ''}
        </span>
      )}
      {subLabel && <p className="text-[10px] text-gray-500 mt-0.5">{subLabel}</p>}
    </div>
    <span className={`w-2 h-10 rounded-full ${dotColor} shrink-0`} />
  </GlassCard>
);

export interface DonutStatProps {
  label: string;
  value: number;
  color: string;
  subLabel?: string;
  size?: number;
  warnAt?: number;
  dangerAt?: number;
}

export const DonutStat: React.FC<DonutStatProps> = ({
  label,
  value,
  color,
  subLabel,
  size = 132,
  warnAt = 75,
  dangerAt = 90,
}) => (
  <GlassCard className="p-4 flex flex-col items-center">
    <DonutChart pct={value} color={color} label={`${value.toFixed(0)}%`} sub={subLabel} size={size} warnAt={warnAt} dangerAt={dangerAt} />
    <p className="text-xs text-gray-400 mt-2 text-center">{label}</p>
  </GlassCard>
);

export interface PieSlice {
  label: string;
  value: number;
  color: string;
}

export interface PieChartProps {
  slices: PieSlice[];
  title?: string;
  centerLabel?: string;
  size?: number;
}

export const PieChart: React.FC<PieChartProps> = ({ slices, title, centerLabel, size = 200 }) => {
  const total = useMemo(() => slices.reduce((sum, s) => sum + s.value, 0), [slices]);
  const slicesWithAngles = useMemo(() => {
    let startAngle = -90;
    return slices.map((slice) => {
      const angle = (slice.value / (total || 1)) * 360;
      const endAngle = startAngle + angle;
      const midAngle = (startAngle + endAngle) / 2;
      const rad = (midAngle * Math.PI) / 180;
      const labelRadius = 60;
      const labelX = 50 + labelRadius * Math.cos(rad);
      const labelY = 50 + labelRadius * Math.sin(rad);
      const largeArc = angle > 180 ? 1 : 0;
      const start = { x: 50 + 42 * Math.cos((startAngle * Math.PI) / 180), y: 50 + 42 * Math.sin((startAngle * Math.PI) / 180) };
      const end = { x: 50 + 42 * Math.cos((endAngle * Math.PI) / 180), y: 50 + 42 * Math.sin((endAngle * Math.PI) / 180) };
      startAngle = endAngle;
      return { ...slice, angle, start, end, largeArc, labelX, labelY, percentage: total > 0 ? ((slice.value / total) * 100).toFixed(1) : '0' };
    });
  }, [slices, total]);

  return (
    <GlassCard className="p-4">
      {title && <h4 className="text-sm font-semibold text-white mb-3">{title}</h4>}
      <div className="flex flex-col items-center">
        <div className="relative" style={{ width: size, height: size }}>
          <svg viewBox="0 0 100 100" className="w-full h-full -rotate-90">
            {slicesWithAngles.map((slice, i) => (
              <g key={i}>
                <path
                  d={`M 50 50 L ${slice.start.x} ${slice.start.y} A 42 42 0 ${slice.largeArc} 1 ${slice.end.x} ${slice.end.y} Z`}
                  fill={slice.color}
                  stroke="rgba(0,0,0,0.2)"
                  strokeWidth="0.5"
                />
                {slice.angle > 30 && (
                  <text
                    x={slice.labelX}
                    y={slice.labelY}
                    textAnchor="middle"
                    dominantBaseline="middle"
                    fill="white"
                    fontSize="8"
                    fontWeight="bold"
                    pointerEvents="none"
                  >
                    {slice.percentage}%
                  </text>
                )}
              </g>
            ))}
            <circle cx="50" cy="50" r="28" fill="#0f172a" />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            {centerLabel && <span className="text-xl font-semibold text-white">{centerLabel}</span>}
            <span className="text-[10px] text-gray-400">Total: {total}</span>
          </div>
        </div>
        <div className="mt-3 flex flex-wrap justify-center gap-3 text-[10px]">
          {slices.map((slice, i) => (
            <span key={i} className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full" style={{ backgroundColor: slice.color }} />
              {slice.label} ({slice.value})
            </span>
          ))}
        </div>
      </div>
    </GlassCard>
  );
};

export interface AreaChartWidgetProps {
  samples: MetricSample[];
  label: string;
  color: string;
  unit?: string;
  max?: number;
  heightClass?: string;
  threshold?: number;
}

export const AreaChartWidget: React.FC<AreaChartWidgetProps> = ({
  samples,
  label,
  color,
  unit = '',
  max = 100,
  heightClass = 'h-48',
  threshold,
}) => (
  <GlassCard className="p-4">
    <AreaChart samples={samples} max={max} color={color} label={label} unit={unit} heightClass={heightClass} threshold={threshold} />
  </GlassCard>
);

export interface GaugeWidgetProps {
  label: string;
  value: number;
  color: string;
  unit?: string;
  size?: number;
}

export const GaugeWidget: React.FC<GaugeWidgetProps> = ({
  label,
  value,
  color,
  unit = '%',
  size = 132,
}) => (
  <GlassCard className="p-4 flex flex-col items-center">
    <GaugeChart pct={value} color={color} label={label} display={`${value.toFixed(0)}${unit}`} size={size} />
  </GlassCard>
);

export interface TimeSeriesChartProps {
  data: { name: string; data: MetricSample[]; color: string }[];
  label: string;
  unit?: string;
  max?: number;
  heightClass?: string;
}

export const TimeSeriesChart: React.FC<TimeSeriesChartProps> = ({
  data,
  label,
  unit = '',
  max = 100,
  heightClass = 'h-64',
}) => (
  <GlassCard className="p-4">
    <div className="flex items-baseline justify-between text-[11px] text-gray-400 mb-1 px-1">
      <span className="uppercase tracking-wide">{label}</span>
      <span className="font-mono text-gray-200">
        {data.map((d) => (d.data.length ? d.data[d.data.length - 1]?.v?.toFixed(1) ?? '—' : '—')).join(' / ')}{unit}
      </span>
    </div>
    <svg viewBox={`0 0 ${100} ${36}`} preserveAspectRatio="none" className={`w-full ${heightClass} block`}>
      <defs>
        {data.map((d, i) => (
          <linearGradient key={i} id={`grad-${i}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={d.color} stopOpacity="0.45" />
            <stop offset="100%" stopColor={d.color} stopOpacity="0.01" />
          </linearGradient>
        ))}
      </defs>
      {/* Grid */}
      {[0, 0.25, 0.5, 0.75, 1].map((t, i) => (
        <line key={i} x1="0" y1={t * 36} x2={100} y2={t * 36} stroke="rgba(255,255,255,0.06)" strokeWidth="0.2" vectorEffect="non-scaling-stroke" />
      ))}
      {data.map((d, di) => {
        const n = d.data.length;
        if (n < 2) return null;
        const pts = d.data.map((s, i) => [
          (i / Math.max(n - 1, 1)) * 100,
          ((Math.max(0, Math.min(max, s.v)) - 0) / (max || 1)) * 36,
        ] as [number, number]);
        const path = pts.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(2)},${y.toFixed(2)}`).join(' ');
        const areaPath = `M${pts[0][0].toFixed(2)},36 ` + pts.map(([x, y]) => `L${x.toFixed(2)},${y.toFixed(2)}`).join(' ') + ` L${pts[pts.length - 1][0].toFixed(2)},36 Z`;
        return (
          <g key={di}>
            <path d={areaPath} fill={`url(#grad-${di})`} stroke="none" />
            <path d={path} fill="none" stroke={d.color} strokeWidth="0.8" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
          </g>
        );
      })}
    </svg>
    <div className="flex flex-wrap justify-center gap-3 mt-2 text-[10px]">
      {data.map((d, i) => (
        <span key={i} className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-full" style={{ backgroundColor: d.color }} />
          {d.name}
        </span>
      ))}
    </div>
  </GlassCard>
);

export interface DashboardSectionProps {
  title: string;
  children: React.ReactNode;
  className?: string;
}

export const DashboardSection: React.FC<DashboardSectionProps> = ({ title, children, className }) => (
  <section className={className}>
    <h3 className="text-lg font-semibold text-white mb-3 flex items-center gap-2">
      <span className="w-1 h-5 rounded bg-sky-400" />
      {title}
    </h3>
    {children}
  </section>
);

export interface DashboardGridProps {
  children: React.ReactNode;
  columns?: 1 | 2 | 3 | 4;
  className?: string;
}

export const DashboardGrid: React.FC<DashboardGridProps> = ({ children, columns = 2, className }) => {
  const colClasses = {
    1: 'grid-cols-1',
    2: 'grid-cols-1 md:grid-cols-2',
    3: 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3',
    4: 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-4',
  };
  return <div className={`grid gap-4 ${colClasses[columns]} ${className || ''}`}>{children}</div>;
};

export interface HeaderWithActionProps {
  title: string;
  description?: string;
  action?: React.ReactNode;
  backHref?: string;
  backLabel?: string;
}

export const HeaderWithAction: React.FC<HeaderWithActionProps> = ({ title, description, action, backHref, backLabel = 'Back' }) => (
  <div className="flex items-center justify-between flex-wrap gap-4 mb-6">
    <div>
      {backHref && (
        <Link to={backHref} className="inline-flex items-center gap-1.5 text-sm text-sky-300 hover:text-sky-100 mb-2">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4"><path d="M19 12H5M12 19l-7-7 7-7" /></svg>
          {backLabel}
        </Link>
      )}
      <h1 className="text-2xl lg:text-3xl font-semibold text-white tracking-tight">{title}</h1>
      {description && <p className="text-sm text-gray-400 mt-1">{description}</p>}
    </div>
    {action && <div className="shrink-0">{action}</div>}
  </div>
);