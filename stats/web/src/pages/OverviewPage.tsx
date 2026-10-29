import { CheckIcon, OverviewIcon, ServerIcon, XIcon } from '../components/icons';
import { useOverview } from '../context/OverviewContext';

export default function OverviewPage() {
  const { overview, lastUpdated, loading } = useOverview();

  if (loading && !overview) {
    return <div className="page-loader">Loading overview…</div>;
  }

  const total = overview?.total ?? 0;
  const online = overview?.online ?? 0;
  const offline = overview?.offline ?? 0;
  const nodes = overview?.nodes ?? 0;
  const instances = overview?.instances ?? 0;
  const running = overview?.running ?? 0;
  const avgCpu = overview?.avg_cpu ?? 0;
  const avgRam = overview?.avg_ram ?? 0;
  const versions = overview?.versions ?? [];
  const latest = overview?.latest_version || '—';
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
          <div className="v">{total}</div>
          <div className="s">panels known</div>
        </div>
        <div className="card ok">
          <div className="k">
            <span className="ico">
              <CheckIcon width={14} height={14} />
            </span>
            Online
          </div>
          <div className="v">{online}</div>
          <div className="s">{offline} offline</div>
        </div>
        <div className="card bad">
          <div className="k">
            <span className="ico">
              <XIcon width={14} height={14} />
            </span>
            Offline
          </div>
          <div className="v">{offline}</div>
          <div className="s">seen &gt;90s</div>
        </div>
        <div className="card">
          <div className="k">
            <span className="ico">
              <ServerIcon width={14} height={14} />
            </span>
            Resources
          </div>
          <div className="v">{nodes} nodes</div>
          <div className="s">
            {running}/{instances} instances running
          </div>
        </div>
      </div>

      <div className="meta">
        <span className="kv">
          <b>{total}</b> panels
        </span>
        <span className="kv">
          <b>{online}</b> online
        </span>
        <span className="kv">
          <b>{versions.length}</b> versions • latest <b>{latest}</b>
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
              <b>{avgCpu ? `${avgCpu.toFixed(1)}%` : '—'}</b>
            </div>
            <div className="kvrow">
              <span>Avg RAM used</span>
              <b>{avgRam ? `${avgRam.toFixed(1)}%` : '—'}</b>
            </div>
            <div className="kvrow">
              <span>Total Nodes</span>
              <b>{nodes}</b>
            </div>
            <div className="kvrow">
              <span>Total Instances (running/total)</span>
              <b>
                {running} / {instances}
              </b>
            </div>
            <div className="kvrow">
              <span>Latest version</span>
              <b>{latest}</b>
            </div>
            <div className="kvrow">
              <span>Distinct versions</span>
              <b>{versions.length ? versions.join(', ') : '—'}</b>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
