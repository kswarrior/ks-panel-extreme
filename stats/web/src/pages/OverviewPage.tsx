import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import StatusBadge from '../components/StatusBadge';
import { CheckIcon, OverviewIcon, ServerIcon, XIcon } from '../components/icons';
import { usePanels } from '../context/PanelsContext';
import { fmtAgo, locStr, panelName } from '../lib/format';

export default function OverviewPage() {
  const { panels, lastUpdated } = usePanels();
  const navigate = useNavigate();

  const stats = useMemo(() => {
    const total = panels.length;
    const online = panels.filter((panel) => panel.online).length;
    const offline = total - online;
    const nodes = panels.reduce((sum, panel) => sum + (panel.nodes || 0), 0);
    const instances = panels.reduce((sum, panel) => sum + (panel.instances || 0), 0);
    const running = panels.reduce((sum, panel) => sum + (panel.instrunning || 0), 0);
    const avgCpu = total
      ? panels.reduce((sum, panel) => sum + (panel.cpu_percent || 0), 0) / total
      : 0;
    const avgRam = total
      ? panels.reduce((sum, panel) => sum + (panel.ram_used_pct || 0), 0) / total
      : 0;
    const versions = Array.from(
      new Set(panels.map((panel) => panel.version).filter((v): v is string => Boolean(v)))
    ).sort();
    const latest = versions.length ? versions[versions.length - 1] : '—';
    return { total, online, offline, nodes, instances, running, avgCpu, avgRam, versions, latest };
  }, [panels]);

  const updated = lastUpdated ? lastUpdated.toLocaleTimeString() : '—';
  const recent = panels.slice(0, 7);

  function openPanel(panelId: string) {
    navigate(`/panels/${encodeURIComponent(panelId)}`);
  }

  return (
    <div className="wrap">
      <div className="cards">
        <div className="card">
          <div className="k">
            <span className="ico">
              <OverviewIcon width={14} height={14} />
            </span>
            Total
          </div>
          <div className="v">{stats.total}</div>
          <div className="s">panels known</div>
        </div>
        <div className="card ok">
          <div className="k">
            <span className="ico">
              <CheckIcon width={14} height={14} />
            </span>
            Online
          </div>
          <div className="v">{stats.online}</div>
          <div className="s">{stats.offline} offline</div>
        </div>
        <div className="card bad">
          <div className="k">
            <span className="ico">
              <XIcon width={14} height={14} />
            </span>
            Offline
          </div>
          <div className="v">{stats.offline}</div>
          <div className="s">seen &gt;90s</div>
        </div>
        <div className="card">
          <div className="k">
            <span className="ico">
              <ServerIcon width={14} height={14} />
            </span>
            Resources
          </div>
          <div className="v">{stats.nodes} nodes</div>
          <div className="s">
            {stats.running}/{stats.instances} instances running
          </div>
        </div>
      </div>

      <div className="meta">
        <span className="kv">
          <b>{stats.total}</b> panels
        </span>
        <span className="kv">
          <b>{stats.online}</b> online
        </span>
        <span className="kv">
          <b>{stats.versions.length}</b> versions • latest <b>{stats.latest}</b>
        </span>
        <span className="kv" style={{ marginLeft: 'auto' }}>
          updated <b>{updated}</b>
        </span>
      </div>

      <div className="table-wrap" style={{ marginTop: 8 }}>
        <div className="maphead">
          <span className="title">Recent panels</span>
          <span className="spacer" />
          <span className="small">updated {updated}</span>
        </div>
        <div className="table-scroll" style={{ maxHeight: '38vh' }}>
          <table>
            <thead>
              <tr>
                <th>status</th>
                <th>panel</th>
                <th>version</th>
                <th>location</th>
                <th>load</th>
                <th>last seen</th>
              </tr>
            </thead>
            <tbody>
              {recent.map((panel) => (
                <tr
                  key={panel.panel_id}
                  className="rowclick"
                  tabIndex={0}
                  onClick={() => openPanel(panel.panel_id)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault();
                      openPanel(panel.panel_id);
                    }
                  }}
                >
                  <td>
                    <StatusBadge online={panel.online} />
                  </td>
                  <td>
                    <b>{panelName(panel)}</b>
                    <div className="small">{panel.panel_id}</div>
                  </td>
                  <td>{panel.version || '—'}</td>
                  <td>{locStr(panel)}</td>
                  <td>{panel.load1 ? panel.load1.toFixed(2) : '—'}</td>
                  <td>{fmtAgo(panel.last_seen)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="table-wrap" style={{ marginTop: 12 }}>
        <div className="maphead">
          <span className="title">Fleet health</span>
        </div>
        <div style={{ padding: 14, display: 'grid', gap: 10 }}>
          <div className="grid2">
            <div className="kvrow">
              <span>Avg CPU</span>
              <b>{stats.avgCpu ? `${stats.avgCpu.toFixed(1)}%` : '—'}</b>
            </div>
            <div className="kvrow">
              <span>Avg RAM used</span>
              <b>{stats.avgRam ? `${stats.avgRam.toFixed(1)}%` : '—'}</b>
            </div>
            <div className="kvrow">
              <span>Total Nodes</span>
              <b>{stats.nodes}</b>
            </div>
            <div className="kvrow">
              <span>Total Instances (running/total)</span>
              <b>
                {stats.running} / {stats.instances}
              </b>
            </div>
            <div className="kvrow">
              <span>Latest version</span>
              <b>{stats.latest}</b>
            </div>
            <div className="kvrow">
              <span>Distinct versions</span>
              <b>{stats.versions.length ? stats.versions.join(', ') : '—'}</b>
            </div>
          </div>
          {stats.total === 0 ? (
            <div className="small">
              No panels yet — panels dial <code>wss://.../ws?token=</code> on startup via env{' '}
              <code>KSPANEL_STATS_URL</code> or remote <code>stats/url.json</code>.
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
