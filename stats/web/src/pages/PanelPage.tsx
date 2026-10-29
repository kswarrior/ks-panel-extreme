import { Link, useParams } from 'react-router-dom';
import StatusBadge from '../components/StatusBadge';
import { MapIcon } from '../components/icons';
import { usePanels } from '../context/PanelsContext';
import { fmtAgo, fmtGB, fmtMB, fmtUptime, hasGeo, locStr, panelName } from '../lib/format';
import './PanelPage.css';

type Severity = '' | 'warn' | 'crit';

function clamp(value: number): number {
  return Math.max(0, Math.min(100, value));
}

function usagePercent(used?: number, total?: number): number | null {
  if (
    typeof used !== 'number' ||
    typeof total !== 'number' ||
    !Number.isFinite(used) ||
    !Number.isFinite(total) ||
    total <= 0
  ) {
    return null;
  }
  return clamp((used / total) * 100);
}

function severity(value: number | null): Severity {
  if (value === null) return '';
  if (value >= 90) return 'crit';
  if (value >= 75) return 'warn';
  return '';
}

function fmtNum(value?: number, digits = 2): string {
  return typeof value === 'number' && Number.isFinite(value) ? value.toFixed(digits) : '—';
}

interface GaugeCardProps {
  label: string;
  value: number | null;
  center: string;
  detail: string;
  note?: string;
}

function GaugeCard({ label, value, center, detail, note }: GaugeCardProps) {
  const level = severity(value);
  const width = value === null ? 0 : value;

  return (
    <div className="card gauge-card">
      <div className="gauge-label">{label}</div>
      <svg
        className="gauge-ring"
        viewBox="0 0 120 120"
        role="img"
        aria-label={`${label}: ${center}`}
      >
        <circle className="ring-track" cx="60" cy="60" r="52" pathLength={100} />
        <circle
          className={`ring-value ${level}`}
          cx="60"
          cy="60"
          r="52"
          pathLength={100}
          strokeDasharray={`${width} 100`}
        />
        <text
          className={`ring-text${center.length > 5 ? ' small' : ''}`}
          x="60"
          y="60"
          textAnchor="middle"
          dominantBaseline="central"
        >
          {center}
        </text>
      </svg>
      <div className="gauge-detail">{detail}</div>
      <div className="gauge-note">{note || '\u00a0'}</div>
      <div className="meter" aria-hidden="true">
        <div className={`meter-fill ${level}`} style={{ width: `${width}%` }} />
      </div>
    </div>
  );
}

export default function PanelPage() {
  const { panelId } = useParams();
  const { panels, loading, lastUpdated } = usePanels();
  const panel = panels.find((item) => item.panel_id === panelId);

  if (!panel && loading) {
    return (
      <div className="wrap">
        <div className="page-loader">Loading panel…</div>
      </div>
    );
  }

  if (!panel) {
    return (
      <div className="wrap">
        <div className="detail-head">
          <Link className="pill" to="/table">
            ← Back to table
          </Link>
        </div>
        <div className="table-wrap">
          <div className="empty">Panel not found.</div>
        </div>
      </div>
    );
  }

  const online = panel.online;
  const cpu = typeof panel.cpu_percent === 'number' ? clamp(panel.cpu_percent) : null;
  const ram = usagePercent(panel.ram_used_mb, panel.ram_total_mb);
  const disk = usagePercent(panel.disk_used_gb, panel.disk_total_gb);
  const instances = panel.instances || 0;
  const running = panel.instrunning || 0;
  const nodes = panel.nodes || 0;
  const instancePct = instances > 0 ? clamp((running / instances) * 100) : 0;
  const located = hasGeo(panel);
  const coords = located
    ? `${panel.lat.toFixed(4)}, ${panel.lon.toFixed(4)}`
    : '—';

  return (
    <div className="wrap">
      <div className="detail-head">
        <Link className="pill" to="/table">
          ← Back to table
        </Link>
        <h2 className="detail-title">{panelName(panel)}</h2>
        <StatusBadge online={online} />
        <div className="panel-actions">
          {located ? (
            <Link
              className="pill pill-strong"
              to={`/map?panel=${encodeURIComponent(panel.panel_id)}`}
            >
              <MapIcon width={14} height={14} />
              View on map
            </Link>
          ) : (
            <button className="pill" disabled title="No coordinates in heartbeat">
              <MapIcon width={14} height={14} />
              No map data
            </button>
          )}
        </div>
      </div>

      <div className="panel-meta">
        <span>
          last heartbeat <b>{fmtAgo(panel.last_seen)}</b>
        </span>
        <span>
          first seen <b>{panel.first_seen ? new Date(panel.first_seen).toLocaleString() : '—'}</b>
        </span>
        <span>
          auto-refresh <b>5s</b>
        </span>
        <span>
          updated <b>{lastUpdated ? lastUpdated.toLocaleTimeString() : '—'}</b>
        </span>
      </div>

      <div className="gauges">
        <GaugeCard
          label="CPU"
          value={cpu}
          center={cpu === null ? '—' : `${cpu.toFixed(1)}%`}
          detail={`load ${fmtNum(panel.load1)} / ${fmtNum(panel.load5)}`}
          note="1m / 5m load average"
        />
        <GaugeCard
          label="Memory"
          value={ram}
          center={ram === null ? '—' : `${ram.toFixed(0)}%`}
          detail={`${fmtMB(panel.ram_used_mb)} / ${fmtMB(panel.ram_total_mb)}`}
          note="used / total"
        />
        <GaugeCard
          label="Disk"
          value={disk}
          center={disk === null ? '—' : `${disk.toFixed(0)}%`}
          detail={`${fmtGB(panel.disk_used_gb)} / ${fmtGB(panel.disk_total_gb)}`}
          note="used / total"
        />
        <GaugeCard
          label="Instances"
          value={instancePct}
          center={`${running}/${instances}`}
          detail={`${running} running / ${instances} total`}
          note={`${nodes} node${nodes === 1 ? '' : 's'}`}
        />
      </div>

      <div className="detail-grid">
        <div className="table-wrap">
          <div className="maphead">
            <span className="title">System</span>
          </div>
          <div className="section-body">
            <div className="kvrow mono">
              <span>Panel ID</span>
              <b>{panel.panel_id}</b>
            </div>
            <div className="kvrow">
              <span>Hostname</span>
              <b>{panel.hostname || '—'}</b>
            </div>
            <div className="kvrow">
              <span>Version</span>
              <b>
                {panel.version || '—'} {panel.commit || ''}
              </b>
            </div>
            <div className="kvrow">
              <span>OS / Arch</span>
              <b>{[panel.os, panel.arch].filter(Boolean).join(' / ') || '—'}</b>
            </div>
            <div className="kvrow">
              <span>Go</span>
              <b>{panel.go_version || '—'}</b>
            </div>
          </div>
        </div>

        <div className="table-wrap">
          <div className="maphead">
            <span className="title">Location</span>
          </div>
          <div className="section-body">
            <div className="kvrow">
              <span>IP</span>
              <b>{panel.ip || '—'}</b>
            </div>
            <div className="kvrow">
              <span>Location</span>
              <b>{locStr(panel)}</b>
            </div>
            <div className="kvrow">
              <span>Coords</span>
              <b>{coords}</b>
            </div>
            <div className="section-action">
              {located ? (
                <Link
                  className="pill"
                  to={`/map?panel=${encodeURIComponent(panel.panel_id)}`}
                >
                  <MapIcon width={14} height={14} />
                  Show this panel on the map
                </Link>
              ) : (
                <button className="pill" disabled title="No coordinates in heartbeat">
                  No map data
                </button>
              )}
            </div>
          </div>
        </div>

        <div className="table-wrap">
          <div className="maphead">
            <span className="title">Workload</span>
          </div>
          <div className="section-body">
            <div className="kvrow">
              <span>Nodes</span>
              <b>{nodes}</b>
            </div>
            <div className="kvrow">
              <span>Instances</span>
              <b>
                {running} running / {instances} total
              </b>
            </div>
            <div className="kvrow">
              <span>Goroutines</span>
              <b>{panel.goroutines || 0}</b>
            </div>
            <div className="kvrow">
              <span>CPU / Load</span>
              <b>
                {cpu === null ? '—' : `${cpu.toFixed(1)}%`} / {fmtNum(panel.load1)} /{' '}
                {fmtNum(panel.load5)}
              </b>
            </div>
          </div>
        </div>

        <div className="table-wrap">
          <div className="maphead">
            <span className="title">Lifetime</span>
          </div>
          <div className="section-body">
            <div className="kvrow">
              <span>Uptime</span>
              <b>{fmtUptime(panel.uptime_sec)}</b>
            </div>
            <div className="kvrow">
              <span>Process uptime</span>
              <b>{fmtUptime(panel.process_uptime)}</b>
            </div>
            <div className="kvrow">
              <span>First seen</span>
              <b>
                {panel.first_seen ? new Date(panel.first_seen).toLocaleString() : '—'}
              </b>
            </div>
            <div className="kvrow">
              <span>Last seen</span>
              <b>{panel.last_seen ? new Date(panel.last_seen).toLocaleString() : '—'}</b>
            </div>
          </div>
        </div>
      </div>

      <details className="rawbox">
        <summary>
          <span className="title">Raw heartbeat</span>
          <span className="small">click to expand</span>
        </summary>
        <div className="raw-body">
          <pre>{JSON.stringify(panel, null, 2)}</pre>
        </div>
      </details>
    </div>
  );
}
