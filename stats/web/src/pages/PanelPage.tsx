import { Link, useParams } from 'react-router-dom';
import StatusBadge from '../components/StatusBadge';
import { usePanels } from '../context/PanelsContext';
import { fmtGB, fmtMB, fmtUptime, locStr, panelName } from '../lib/format';

export default function PanelPage() {
  const { panelId } = useParams();
  const { panels, loading } = usePanels();
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

  return (
    <div className="wrap">
      <div className="detail-head">
        <Link className="pill" to="/table">
          ← Back to table
        </Link>
        <h2 className="detail-title">{panelName(panel)}</h2>
        <StatusBadge online={panel.online} />
      </div>

      <div className="grid2">
        <div className="kvrow">
          <span>Panel ID</span>
          <b style={{ fontFamily: 'monospace' }}>{panel.panel_id}</b>
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
          <span>IP / Location</span>
          <b>
            {panel.ip || '—'} • {locStr(panel)}
          </b>
        </div>
        <div className="kvrow">
          <span>Coords</span>
          <b>
            {panel.lat && panel.lon
              ? `${panel.lat.toFixed(4)}, ${panel.lon.toFixed(4)}`
              : '—'}
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
        <div className="kvrow">
          <span>CPU / Load</span>
          <b>
            {panel.cpu_percent ? `${panel.cpu_percent.toFixed(1)}%` : '—'} •{' '}
            {panel.load1 ? panel.load1.toFixed(2) : '—'}/
            {panel.load5 ? panel.load5.toFixed(2) : '—'}
          </b>
        </div>
        <div className="kvrow">
          <span>RAM</span>
          <b>
            {fmtMB(panel.ram_used_mb)} / {fmtMB(panel.ram_total_mb)}{' '}
            {panel.ram_used_pct ? `${panel.ram_used_pct.toFixed(1)}%` : ''}
          </b>
        </div>
        <div className="kvrow">
          <span>Disk</span>
          <b>
            {fmtGB(panel.disk_used_gb)} / {fmtGB(panel.disk_total_gb)}
          </b>
        </div>
        <div className="kvrow">
          <span>Nodes / Instances</span>
          <b>
            {panel.nodes || 0} / {panel.instrunning || 0}/{panel.instances || 0}
          </b>
        </div>
        <div className="kvrow">
          <span>Uptime / Goroutines</span>
          <b>
            {fmtUptime(panel.uptime_sec)} • {panel.goroutines || 0} gr
          </b>
        </div>
        <div className="kvrow">
          <span>Last seen</span>
          <b>{panel.last_seen ? new Date(panel.last_seen).toLocaleString() : '—'}</b>
        </div>
      </div>

      <div className="table-wrap" style={{ marginTop: 12 }}>
        <div className="maphead">
          <span className="title">Raw heartbeat</span>
        </div>
        <div style={{ padding: 14 }}>
          <pre>{JSON.stringify(panel, null, 2)}</pre>
        </div>
      </div>
    </div>
  );
}
