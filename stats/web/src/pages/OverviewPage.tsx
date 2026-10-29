import { useMemo } from 'react';
import { CheckIcon, OverviewIcon, ServerIcon, XIcon } from '../components/icons';
import { usePanels } from '../context/PanelsContext';

export default function OverviewPage() {
  const { panels, lastUpdated } = usePanels();

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
        </div>
      </div>
    </div>
  );
}
