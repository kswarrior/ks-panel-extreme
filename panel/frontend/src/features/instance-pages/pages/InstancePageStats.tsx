import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { listInstancePages } from '@/shared/api/admin';
import type { InstancePage } from '@/shared/types/instancePage';
import {
  StatCard,
} from '@/shared/components/ui/StatDashboard';
import GlassCard from '@/shared/components/ui/Card';
import SearchDropdown from '@/shared/components/ui/SearchDropdown';
import { PageActionsPill, PILL_TAB_STYLE } from '@/shared/components/ui/PageActionsPill';

type KindKey = 'builtin' | 'custom' | 'unknown';

const KIND_META: Record<KindKey, { label: string; badge: string; dot: string; color: string }> = {
  builtin: { label: 'Built-in', badge: 'bg-sky-900/60 text-sky-200 border-sky-700/60', dot: 'bg-sky-400', color: '#38bdf8' },
  custom: { label: 'Custom', badge: 'bg-emerald-900/60 text-emerald-200 border-emerald-700/60', dot: 'bg-emerald-400', color: '#34d399' },
  unknown: { label: 'UNKNOWN', badge: 'bg-neutral-800 text-gray-300 border-neutral-700', dot: 'bg-gray-500', color: '#9ca3af' },
};

function kindKey(k: string): KindKey {
  return (k in KIND_META ? k : 'unknown') as KindKey;
}

// getErrorMessage normalises API failures for display: some panel endpoints
// answer with JSON bodies ({error|message}) instead of plain text, which would
// otherwise render as "[object Object]".
function getErrorMessage(e: any, fallback: string): string {
  const data = e?.response?.data;
  if (typeof data === 'string' && data.trim()) return data;
  if (data && typeof data === 'object') {
    if (typeof data.error === 'string') return data.error;
    if (typeof data.message === 'string') return data.message;
    try { return JSON.stringify(data); } catch { return fallback; }
  }
  if (typeof e?.message === 'string' && e.message.trim()) return e.message;
  return fallback;
}

const InstancePageStats: React.FC = () => {
  const [pages, setPages] = useState<InstancePage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [timeRange, setTimeRange] = useState<'1h' | '6h' | '24h' | '7d'>('24h');
  const [kindFilter, setKindFilter] = useState<KindKey | 'all'>('all');
  const [filterOpen, setFilterOpen] = useState(false);
  const filterRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (filterRef.current && !filterRef.current.contains(event.target as Node)) {
        setFilterOpen(false);
      }
    }
    if (filterOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [filterOpen]);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      setPages(await listInstancePages());
    } catch (e: any) {
      setError(getErrorMessage(e, 'Failed to load'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const enriched = useMemo(() => pages.map((p) => ({
    page: p,
    kind: kindKey(p.kind),
    category: p.category || '',
    updated: p.updated_at ? new Date(p.updated_at).getTime() : 0,
    created: p.created_at ? new Date(p.created_at).getTime() : 0,
    hasContent: !!(p.content_html || p.content_markdown || p.content_blocks),
    hasIcon: !!p.icon_svg,
  })).filter((e) => {
    const q = search.trim().toLowerCase();
    if (q) {
      const hay = `${e.page.slug || ''} ${e.page.title || ''} ${e.category}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    if (kindFilter !== 'all' && e.kind !== kindFilter) return false;
    return true;
  }), [pages, search, kindFilter]);

  const stats = useMemo(() => {
    const byKind: Record<string, number> = {};
    const byCategory: Record<string, number> = {};
    let withContent = 0;
    let withIcon = 0;
    enriched.forEach((e) => {
      byKind[e.kind] = (byKind[e.kind] || 0) + 1;
      if (e.category) byCategory[e.category] = (byCategory[e.category] || 0) + 1;
      if (e.hasContent) withContent++;
      if (e.hasIcon) withIcon++;
    });
    return {
      total: enriched.length,
      builtin: byKind.builtin || 0,
      custom: byKind.custom || 0,
      categories: Object.keys(byCategory).length,
      byKind,
      byCategory,
      withContent,
      withIcon,
    };
  }, [enriched]);

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-white/5 rounded w-1/4" />
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            {[1, 2, 3, 4].map((i) => <div key={i} className="h-20 bg-white/5 rounded" />)}
          </div>
          <div className="h-64 bg-white/5 rounded" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Fixed top-right pill — "Statistics" title lives in the app header. */}
      <PageActionsPill>
        <SearchDropdown
          value={search}
          onChange={setSearch}
          placeholder="Search pages..."
          ariaLabel="Search instance pages"
          buttonClassName="ks-tab inline-flex items-center justify-center"
          buttonStyle={PILL_TAB_STYLE}
        />
        <select
          value={timeRange}
          onChange={(e) => setTimeRange(e.target.value as any)}
          className="ks-tab"
          style={PILL_TAB_STYLE}
          aria-label="Time range"
        >
          <option value="1h">Last hour</option>
          <option value="6h">Last 6 hours</option>
          <option value="24h">Last 24 hours</option>
          <option value="7d">Last 7 days</option>
        </select>
        <div className="relative" ref={filterRef}>
          <button
            type="button"
            onClick={() => setFilterOpen(!filterOpen)}
            className={`ks-tab inline-flex items-center justify-center gap-1 transition-colors ${filterOpen ? 'is-open' : ''}`}
            style={PILL_TAB_STYLE}
            aria-label="Open filters"
            aria-expanded={filterOpen}
            aria-haspopup="true"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4">
              <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
            </svg>
            {(kindFilter !== 'all' || search.trim() !== '') && (
              <span className="w-1.5 h-1.5 rounded-full bg-sky-400" />
            )}
          </button>
          {filterOpen && (
            <div className="absolute right-0 top-full mt-1 z-30 w-56">
              <div className="ks-dropdown min-w-[200px] animate-in fade-in slide-in-from-to duration-150">
                <div className="p-3 space-y-3">
                  <div>
                    <label className="block text-xs text-gray-400 uppercase tracking-wide mb-1.5">Kind</label>
                    <select
                      value={kindFilter}
                      onChange={(e) => setKindFilter(e.target.value as any)}
                      className="w-full glass-field"
                    >
                      <option value="all">All · {pages.length}</option>
                      <option value="builtin">Built-in · {stats.builtin}</option>
                      <option value="custom">Custom · {stats.custom}</option>
                    </select>
                  </div>
                  <div className="pt-2 border-t border-white/5 flex items-center justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => setFilterOpen(false)}
                      className="px-3 py-1.5 text-sm text-gray-400 hover:text-white"
                    >
                      Close
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </PageActionsPill>

      {/* Stat Cards only - removed all other sections per requirements */}
      <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 mb-6">
        <StatCard
          label="Total Pages"
          value={stats.total}
          icon={<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" className="w-5 h-5"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /><line x1="16" y1="13" x2="8" y2="13" /><line x1="16" y1="17" x2="8" y2="17" /><polyline points="10 9 9 9 8 9" /></svg>}
          color="text-white"
          dotColor="bg-white"
        />
        <StatCard
          label="Custom Pages"
          value={stats.custom}
          icon={<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" className="w-5 h-5"><path d="M12 2l3 7h7l-5.5 4 2 7-6-5-6 5 2-7-5.5-4z" /></svg>}
          color="text-emerald-300"
          dotColor="bg-emerald-400"
        />
        <StatCard
          label="With Content"
          value={stats.withContent}
          icon={<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" className="w-5 h-5"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /><line x1="16" y1="13" x2="8" y2="13" /><line x1="16" y1="17" x2="8" y2="17" /><polyline points="10 9 9 9 8 9" /></svg>}
          color="text-sky-300"
          dotColor="bg-sky-400"
        />
        <StatCard
          label="With Icons"
          value={stats.withIcon}
          icon={<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" className="w-5 h-5"><circle cx="12" cy="12" r="10" /><path d="M12 8v8" /><path d="M8 12h8" /></svg>}
          color="text-violet-300"
          dotColor="bg-violet-400"
        />
      </div>

      {error && (
        <GlassCard className="text-sm text-red-300 border border-red-700/40">
          {error}
        </GlassCard>
      )}
    </div>
  );
};

export default InstancePageStats;