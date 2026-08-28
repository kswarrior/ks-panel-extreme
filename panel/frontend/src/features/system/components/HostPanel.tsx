import React, { useMemo } from 'react';
import type { LocalHost, SeriesSample } from '@/features/system/types/system';
import { Donut, Gauge, LineChart, Sparkline, fmtPct, fmtMB, fmtBytes, fmtGB, fmtUptime } from './SystemCharts';
import { AreaChart, DonutChart, type MetricSample } from '@/shared/components/ui/MetricsChart';

interface HostPanelProps {
  host: LocalHost;
  samples: SeriesSample[];
  recentCPU: number[];
  recentRAM: number[];
  recentLoad: number[];
}

const HostPanel: React.FC<HostPanelProps> = React.memo(({ host, samples, recentCPU, recentRAM, recentLoad }) => {
  const cores = Math.max(host.cpu_cores || 1, 1);
  const safeSamples = useMemo(() => {
    const arr = (samples || []).map((s) => s || { unix_sec: 0, cpu_percent: 0, ram_used_pct: 0, ram_used_mb: 0, load1: 0 });
    return arr.length > 50 ? arr.slice(-50) : arr;
  }, [samples]);
  const last = useMemo(() => safeSamples.length > 0 ? safeSamples[safeSamples.length - 1] : { unix_sec: 0, cpu_percent: host.cpu_percent || 0, ram_used_pct: host.ram_used_pct || 0, ram_used_mb: 0, load1: host.load1 || 0 }, [safeSamples, host.cpu_percent, host.ram_used_pct, host.load1]);

  const ramSlices = useMemo(() => [
    { value: Math.max(0, host.ram_used_mb - host.ram_cached_mb - host.ram_buffers_mb), color: '#34d399', label: 'Used (excl. cache)' },
    { value: Math.max(0, host.ram_cached_mb), color: '#38bdf8', label: 'Cached' },
    { value: Math.max(0, host.ram_buffers_mb), color: '#a78bfa', label: 'Buffers' },
    { value: Math.max(0, host.ram_avail_mb), color: '#52525b', label: 'Free' },
  ], [host.ram_used_mb, host.ram_cached_mb, host.ram_buffers_mb, host.ram_avail_mb]);

  const cpuSamples = useMemo<MetricSample[]>(() => safeSamples.map(s => ({ t: s.unix_sec * 1000, v: s.cpu_percent })), [safeSamples]);
  const memSamples = useMemo<MetricSample[]>(() => safeSamples.map(s => ({ t: s.unix_sec * 1000, v: s.ram_used_pct })), [safeSamples]);

  return (
    <section>
      <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
        <h3 className="text-sm font-semibold text-white uppercase tracking-wide">
          Local host — {host.hostname || 'this panel'}
       </h3>
        <span className="text-[10px] text-gray-500 font-mono">
          {host.platform || host.os || 'unknown'} · {host.arch || ''} · {host.go_version || ''}
        </span>
      </div>

      {/* Metrics tiles */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
        <div className="ks-stat-card rounded-xl flex flex-col gap-2 animate-slide-up">
          <div className="text-[10px] text-gray-400 uppercase tracking-wide">Uptime</div>
          <div className="text-2xl font-semibold leading-none tabular-nums text-gray-200">{fmtUptime(host.uptime_sec || 0)}</div>
        </div>
        <div className="ks-stat-card rounded-xl flex flex-col gap-2 animate-slide-up">
          <div className="text-[10px] text-gray-400 uppercase tracking-wide">Swap</div>
          <div className="text-2xl font-semibold leading-none tabular-nums text-fuchsia-300">{host.swap_total_mb > 0 ? fmtPct(((host.swap_used_mb || 0) / host.swap_total_mb) * 100) : '—'}</div>
          <div className="text-[10px] text-gray-500 font-mono">{fmtMB(host.swap_used_mb || 0)} / {fmtMB(host.swap_total_mb || 0)}</div>
        </div>
        <div className="ks-stat-card rounded-xl flex flex-col gap-2 animate-slide-up sm:col-span-2">
          <div className="text-[10px] text-gray-400 uppercase tracking-wide">Load (1m)</div>
          <div className="text-2xl font-semibold leading-none tabular-nums text-violet-300">{(last.load1 || 0).toFixed(2)}</div>
          {recentLoad.length > 1 && <div className="-mb-1 -mx-1"><Sparkline values={recentLoad} color="#c4b5fd" /></div>}
        </div>
      </div>

      {/* CPU / Memory / Disk charts */}
      <div className="ks-card-grid grid grid-cols-1 xl:grid-cols-3 mb-4 gap-4">
        <div className="glass-card rounded-xl">
          <div className="flex items-center justify-between mb-2">
            <div>
              <h3 className="text-sm font-semibold text-white">CPU</h3>
              <p className="text-[11px] text-gray-500">Optimistic projection dashed · warning at 80%</p>
            </div>
            <span className="text-[10px] text-gray-500 font-mono">{host.cpu_percent ? `${host.cpu_percent.toFixed(1)}%` : '—'}</span>
          </div>
          <AreaChart samples={cpuSamples} max={100} color="#7dd3fc" unit="%" label="CPU %" threshold={80} heightClass="h-48" />
        </div>
        <div className="glass-card rounded-xl">
          <div className="flex items-center justify-between mb-2">
            <div>
              <h3 className="text-sm font-semibold text-white">Memory</h3>
              <p className="text-[11px] text-gray-500">Warning at 85% · danger at 95%</p>
            </div>
            <span className="text-[10px] text-gray-500 font-mono">{fmtMB(host.ram_used_mb)}</span>
          </div>
          <AreaChart samples={memSamples} max={100} color="#6ee7b7" unit="%" label="MEM %" threshold={85} heightClass="h-48" />
        </div>
        <div className="glass-card rounded-xl flex flex-col items-center justify-center p-4">
          <h3 className="text-sm font-semibold text-white self-start mb-2">Disk</h3>
          {(() => {
            const diskPct = host.disk_used_pct || (host.disk_total_gb > 0 ? (host.disk_used_gb / host.disk_total_gb) * 100 : 0);
            return (
              <DonutChart
                pct={diskPct}
                color="#fcd34d"
                label={`${diskPct.toFixed(1)}%`}
                sub={`${fmtGB(host.disk_used_gb)} / ${fmtGB(host.disk_total_gb)}`}
                warnAt={80}
                dangerAt={92}
                size={150}
              />
            );
          })()}
        </div>
      </div>
    </section>
  );
});

export default HostPanel;
