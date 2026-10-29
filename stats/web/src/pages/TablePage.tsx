import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import StatusBadge from '../components/StatusBadge';
import { SearchIcon } from '../components/icons';
import { usePanels } from '../context/PanelsContext';
import { fmtAgo, fmtGB, fmtMB, fmtUptime, locStr, panelName } from '../lib/format';
import type { Panel } from '../lib/types';

type Filter = 'all' | 'online' | 'offline';
type SortKey = 'nodes' | 'instances';
type SortDir = 'asc' | 'desc';

const FILTERS: { value: Filter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'online', label: 'Online' },
  { value: 'offline', label: 'Offline' },
];

function sortValue(panel: Panel, key: SortKey): number {
  return key === 'nodes' ? panel.nodes || 0 : panel.instrunning || 0;
}

export default function TablePage() {
  const { panels } = usePanels();
  const navigate = useNavigate();
  const [filter, setFilter] = useState<Filter>('all');
  const [query, setQuery] = useState('');
  const [sortKey, setSortKey] = useState<SortKey | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>('desc');

  const rows = useMemo(() => {
    let out = panels.slice();
    if (filter === 'online') out = out.filter((panel) => panel.online);
    else if (filter === 'offline') out = out.filter((panel) => !panel.online);

    const q = query.trim().toLowerCase();
    if (q) {
      out = out.filter((panel) => {
        const haystack = [
          panel.hostname,
          panel.panel_id,
          panel.ip,
          panel.city,
          panel.region,
          panel.country,
          panel.country_code,
          panel.version,
          panel.commit,
        ]
          .join(' ')
          .toLowerCase();
        return haystack.includes(q);
      });
    }

    if (sortKey) {
      const direction = sortDir === 'desc' ? -1 : 1;
      out = out.slice().sort((a, b) => {
        const diff = (sortValue(a, sortKey) - sortValue(b, sortKey)) * direction;
        if (diff !== 0) return diff;
        if (sortKey === 'instances') {
          const total = ((a.instances || 0) - (b.instances || 0)) * direction;
          if (total !== 0) return total;
        }
        return a.panel_id.localeCompare(b.panel_id);
      });
    }

    return out;
  }, [panels, filter, query, sortKey, sortDir]);

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((direction) => (direction === 'desc' ? 'asc' : 'desc'));
      return;
    }
    setSortKey(key);
    setSortDir('desc');
  }

  function openPanel(panelId: string) {
    navigate(`/panels/${encodeURIComponent(panelId)}`);
  }

  return (
    <div className="wrap">
      <div className="toolbar">
        <label className="search" aria-label="search">
          <SearchIcon />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="search hostname, id, ip, country, version…"
            autoComplete="off"
          />
        </label>
        {FILTERS.map((item) => (
          <button
            key={item.value}
            className={`pill${filter === item.value ? ' active' : ''}`}
            aria-pressed={filter === item.value}
            onClick={() => setFilter(item.value)}
          >
            {item.label}
          </button>
        ))}
        <span className="kv">
          {rows.length} / {panels.length}
        </span>
      </div>

      <div className="table-wrap">
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>status</th>
                <th>panel</th>
                <th>version</th>
                <th>ip</th>
                <th>location</th>
                <th>cpu</th>
                <th>ram</th>
                <th>disk</th>
                <th>load</th>
                <th
                  aria-sort={
                    sortKey === 'nodes'
                      ? sortDir === 'desc'
                        ? 'descending'
                        : 'ascending'
                      : 'none'
                  }
                >
                  <button
                    type="button"
                    className="th-sort"
                    onClick={() => toggleSort('nodes')}
                    title="Sort by nodes"
                  >
                    nodes
                    <span className="sort-ind">
                      {sortKey === 'nodes' ? (sortDir === 'desc' ? '▼' : '▲') : '↕'}
                    </span>
                  </button>
                </th>
                <th
                  aria-sort={
                    sortKey === 'instances'
                      ? sortDir === 'desc'
                        ? 'descending'
                        : 'ascending'
                      : 'none'
                  }
                >
                  <button
                    type="button"
                    className="th-sort"
                    onClick={() => toggleSort('instances')}
                    title="Sort by running instances"
                  >
                    instances
                    <span className="sort-ind">
                      {sortKey === 'instances' ? (sortDir === 'desc' ? '▼' : '▲') : '↕'}
                    </span>
                  </button>
                </th>
                <th>uptime</th>
                <th>last seen</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((panel) => (
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
                  <td title={panel.panel_id}>
                    <b>{panelName(panel)}</b>
                    <div className="small">{panel.panel_id.slice(0, 12)}</div>
                  </td>
                  <td>
                    {panel.version || '—'}
                    <div className="small">{panel.commit || ''}</div>
                  </td>
                  <td>{panel.ip || '—'}</td>
                  <td>
                    {locStr(panel)}
                    <div className="small">
                      {panel.lat && panel.lon
                        ? `${panel.lat.toFixed(2)},${panel.lon.toFixed(2)}`
                        : ''}
                    </div>
                  </td>
                  <td>{panel.cpu_percent ? `${panel.cpu_percent.toFixed(1)}%` : '—'}</td>
                  <td>
                    {fmtMB(panel.ram_used_mb)} / {fmtMB(panel.ram_total_mb)}
                    <div className="small">
                      {panel.ram_used_pct ? `${panel.ram_used_pct.toFixed(1)}%` : ''}
                    </div>
                  </td>
                  <td>
                    {fmtGB(panel.disk_used_gb)} / {fmtGB(panel.disk_total_gb)}
                  </td>
                  <td>
                    {panel.load1 ? panel.load1.toFixed(2) : '—'} /{' '}
                    {panel.load5 ? panel.load5.toFixed(2) : '—'}
                  </td>
                  <td>{panel.nodes || 0}</td>
                  <td>
                    {panel.instrunning || 0}/{panel.instances || 0}
                  </td>
                  <td>{fmtUptime(panel.uptime_sec)}</td>
                  <td>{fmtAgo(panel.last_seen)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
