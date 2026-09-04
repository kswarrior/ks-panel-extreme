import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  listTemplates,
} from '@/shared/api/admin';
import type { Template } from '@/shared/types/instance';
import {
  StatCard,
} from '@/shared/components/ui/StatDashboard';
import GlassCard from '@/shared/components/ui/Card';
import SearchDropdown from '@/shared/components/ui/SearchDropdown';
import { PageActionsPill, PILL_TAB_STYLE } from '@/shared/components/ui/PageActionsPill';

type KindKey = 'docker' | 'lxd' | 'kvm' | 'multipass' | 'unknown';

const KIND_META: Record<KindKey, { label: string; badge: string; dot: string; color: string }> = {
  docker: { label: 'Docker', badge: 'bg-sky-900/60 text-sky-200 border-sky-700/60', dot: 'bg-sky-400', color: '#38bdf8' },
  lxd: { label: 'LXD', badge: 'bg-indigo-900/60 text-indigo-200 border-indigo-700/60', dot: 'bg-indigo-400', color: '#a78bfa' },
  kvm: { label: 'KVM', badge: 'bg-orange-900/60 text-orange-200 border-orange-700/60', dot: 'bg-orange-400', color: '#f97316' },
  multipass: { label: 'Multipass', badge: 'bg-fuchsia-900/60 text-fuchsia-200 border-fuchsia-700/60', dot: 'bg-fuchsia-400', color: '#ec4899' },
  unknown: { label: 'UNKNOWN', badge: 'bg-neutral-800 text-gray-300 border-neutral-700', dot: 'bg-gray-500', color: '#9ca3af' },
};

function kindKey(k: string): KindKey {
  return (k in KIND_META ? k : 'unknown') as KindKey;
}

function parseSpec(raw: string): Record<string, any> {
  if (!raw) return {};
  try { return JSON.parse(raw) as Record<string, any>; } catch { return {}; }
}

const TemplateStats: React.FC = () => {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [kindFilter, setKindFilter] = useState<KindKey | 'all'>('all');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
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
      const ts = await listTemplates();
      setTemplates(ts);
    } catch (e: any) {
      setError(e?.response?.data || 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const enriched = useMemo(() => templates.map((t) => {
    const s = parseSpec(t.spec);
    const limits = (s.limits || {}) as Record<string, string>;
    const ports = Array.isArray(s.ports) ? s.ports.length : 0;
    const env = Array.isArray(s.env) ? s.env.length : 0;
    const installs = Array.isArray(s.install) ? s.install.length : 0;
    const mounts = Array.isArray(s.mounts) ? s.mounts.length : 0;
    return {
      template: t,
      kind: kindKey(t.kind),
      category: s.category ? String(s.category) : '',
      type: s.type ? String(s.type) : '',
      memLimit: limits.memory || '',
      cpuLimit: limits.cpus || limits.cpu || '',
      diskLimit: limits.disk || '',
      ports,
      env,
      installs,
      mounts,
    };
  }), [templates]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    let out = enriched;
    if (q) {
      out = out.filter((e) =>
        e.template.name.toLowerCase().includes(q) ||
        e.template.description.toLowerCase().includes(q) ||
        e.template.image.toLowerCase().includes(q) ||
        e.category.toLowerCase().includes(q) ||
        e.type.toLowerCase().includes(q)
      );
    }
    if (kindFilter !== 'all') out = out.filter((e) => e.kind === kindFilter);
    if (categoryFilter !== 'all') out = out.filter((e) => e.category === categoryFilter);
    return out;
  }, [enriched, search, kindFilter, categoryFilter]);

  const categories = useMemo(() => {
    const cats = new Set<string>();
    enriched.forEach((e) => { if (e.category) cats.add(e.category); });
    return [...cats].sort();
  }, [enriched]);

  // Template stats
  const templateStats = useMemo(() => {
    const byKind: Record<string, number> = {};
    const byCategory: Record<string, number> = {};
    let totalPorts = 0;
    let totalEnv = 0;
    let totalInstalls = 0;
    let totalMounts = 0;
    let withLimits = 0;

    filtered.forEach((e) => {
      byKind[e.kind] = (byKind[e.kind] || 0) + 1;
      if (e.category) byCategory[e.category] = (byCategory[e.category] || 0) + 1;
      totalPorts += e.ports;
      totalEnv += e.env;
      totalInstalls += e.installs;
      totalMounts += e.mounts;
      if (e.memLimit || e.cpuLimit || e.diskLimit) withLimits++;
    });

    return {
      total: filtered.length,
      byKind,
      byCategory,
      totalPorts,
      totalEnv,
      totalInstalls,
      totalMounts,
      withLimits,
      avgPorts: filtered.length > 0 ? totalPorts / filtered.length : 0,
      avgEnv: filtered.length > 0 ? totalEnv / filtered.length : 0,
      avgInstalls: filtered.length > 0 ? totalInstalls / filtered.length : 0,
    };
  }, [filtered]);

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-white/5 rounded w-1/4" />
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            {[1,2,3,4].map(i => <div key={i} className="h-20 bg-white/5 rounded" />)}
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
              placeholder="Search name, image, category, type…"
              ariaLabel="Search templates"
              buttonClassName="ks-tab inline-flex items-center justify-center"
              buttonStyle={PILL_TAB_STYLE}
            />
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
                {(kindFilter !== 'all' || categoryFilter !== 'all' || search.trim() !== '') && (
                  <span className="w-1.5 h-1.5 rounded-full bg-sky-400" />
                )}
              </button>
              {filterOpen && (
                <div className="absolute right-0 top-full mt-1 z-30 w-64">
                  <div className="ks-dropdown min-w-[240px] animate-in fade-in slide-in-from-to duration-150">
                    <div className="p-3 space-y-3">
                      <div>
                        <label className="block text-xs text-gray-400 uppercase tracking-wide mb-1.5">Driver</label>
                        <select
                          value={kindFilter}
                          onChange={(e) => setKindFilter(e.target.value as any)}
                          className="w-full glass-field"
                        >
                          <option value="all">All drivers</option>
                          <option value="docker">Docker</option>
                          <option value="lxd">LXD</option>
                          <option value="kvm">KVM</option>
                          <option value="multipass">Multipass</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs text-gray-400 uppercase tracking-wide mb-1.5">Category</label>
                        <select
                          value={categoryFilter}
                          onChange={(e) => setCategoryFilter(e.target.value)}
                          disabled={categories.length === 0}
                          className="w-full glass-field disabled:opacity-50"
                        >
                          <option value="all">All categories</option>
                          {categories.map((c) => <option key={c} value={c}>{c}</option>)}
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
          </div>
        }
      />

      {/* Stat Cards only - removed Key Metrics and Templates by Runtime per requirements */}
      <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 mb-6">
        <StatCard
          label="Total Templates"
          value={templateStats.total}
          icon={<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" className="w-5 h-5"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /><line x1="16" y1="13" x2="8" y2="13" /><line x1="16" y1="17" x2="8" y2="17" /><polyline points="10 9 9 9 8 9" /></svg>}
          color="text-white"
          dotColor="bg-white"
        />
        <StatCard
          label="Driver Types"
          value={Object.keys(templateStats.byKind).length}
          icon={<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" className="w-5 h-5"><rect x="5" y="5" width="14" height="14" rx="2" /><rect x="9" y="9" width="6" height="6" rx="0.5" /><path d="M2 9h3M2 15h3M19 9h3M19 15h3M9 2v3M15 2v3M9 19v3M15 19v3" /></svg>}
          color="text-amber-300"
          dotColor="bg-amber-400"
        />
        <StatCard
          label="Total Ports"
          value={templateStats.totalPorts}
          icon={<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" className="w-5 h-5"><rect x="3" y="3" width="18" height="18" rx="2" /><path d="M9 3v18M15 3v18M3 9h18M3 15h18" /></svg>}
          color="text-emerald-300"
          dotColor="bg-emerald-400"
        />
        <StatCard
          label="Total Env Vars"
          value={templateStats.totalEnv}
          icon={<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" className="w-5 h-5"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" /><path d="M4 12h16" /><path d="M4 18h16" /></svg>}
          color="text-sky-300"
          dotColor="bg-sky-400"
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

export default TemplateStats;