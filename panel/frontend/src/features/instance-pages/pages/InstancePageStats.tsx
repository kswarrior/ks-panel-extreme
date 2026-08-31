import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { listInstancePages } from '@/shared/api/admin';
import type { InstancePage } from '@/shared/types/instancePage';
import {
  HeaderWithAction,
  StatCard,
} from '@/shared/components/ui/StatDashboard';
import GlassCard from '@/shared/components/ui/Card';

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
  })), [pages]);

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
      <HeaderWithAction
        title="Instance Page Statistics"
        backHref="/instance-pages"
        backLabel="Instance Pages"
      />

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