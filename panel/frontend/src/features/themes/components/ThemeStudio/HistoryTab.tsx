import React, { useEffect, useMemo, useState } from 'react';
import GlassCard from '@/shared/components/ui/Card';
import ThemePreview from '@/features/themes/components/ThemePreview';
import { fetchThemeRevisions, rollbackTheme, type ThemeRevision } from '@/features/themes/api/themes';
import { useThemeStore } from '@/shared/stores/themeStore';

// diffNote compares a revision against the CURRENT live theme and returns a
// short human note for the History list (e.g. "name + spec changed").
// The spec comparison is a canonical JSON string compare — the backend
// stores the spec verbatim, so equal strings mean an identical theme.
function diffNote(rev: ThemeRevision, live: { name: string; description: string; spec: unknown } | null): string {
  if (!live) return `rev ${rev.rev} snapshot`;
  const parts: string[] = [];
  if (rev.name !== live.name) parts.push('name changed');
  if ((rev.description || '') !== (live.description || '')) parts.push('description changed');
  try {
    const a = JSON.stringify(rev.spec);
    const b = JSON.stringify(live.spec);
    if (a !== b) parts.push(`spec changed (${(a.length / 1024).toFixed(1)} KiB snapshot)`);
  } catch {
    parts.push('spec changed');
  }
  if (parts.length === 0) return 'identical to current';
  return parts.join(' · ');
}

// HistoryTab is the studio History section: pick a GLOBAL theme, list its
// snapshotted revisions newest-first (each with a diff-note vs the live
// row + a ThemePreview), and restore any revision. Restore snapshots the
// pre-rollback row server-side first, so no restore ever destroys history.
export const HistoryTab: React.FC = () => {
  const globalThemes = useThemeStore((s) => s.globalThemes);
  const loadGlobal = useThemeStore((s) => s.loadGlobal);
  const draft = useThemeStore((s) => s.draft);
  const [themeId, setThemeId] = useState<string>('');
  const [revisions, setRevisions] = useState<ThemeRevision[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [restoring, setRestoring] = useState<number | null>(null);
  const [previewRev, setPreviewRev] = useState<number | null>(null);

  // Preselect the theme the studio draft is editing (when it is a global
  // theme), else the first global theme.
  useEffect(() => {
    if (themeId) return;
    const draftGlobal = draft?.id ? globalThemes.find((t) => t.id === draft.id) : undefined;
    setThemeId(draftGlobal?.id || globalThemes[0]?.id || '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [globalThemes]);

  useEffect(() => {
    if (!themeId) {
      setRevisions([]);
      return;
    }
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError('');
      setPreviewRev(null);
      try {
        const revs = await fetchThemeRevisions(themeId);
        if (!cancelled) setRevisions(revs || []);
      } catch (e: any) {
        if (cancelled) return;
        const data = e?.response?.data;
        setError(typeof data === 'string' && data ? data : 'Failed to load revisions.');
        setRevisions([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [themeId]);

  const live = useMemo(() => {
    const t = globalThemes.find((x) => x.id === themeId);
    return t ? { name: t.name, description: t.description, spec: t as unknown } : null;
  }, [globalThemes, themeId]);

  const restore = async (rev: number) => {
    if (restoring !== null) return;
    if (!window.confirm(`Restore rev ${rev}? The current theme is snapshotted first, so this stays reversible.`)) return;
    setRestoring(rev);
    setError('');
    try {
      await rollbackTheme(themeId, rev);
      await loadGlobal();
      const revs = await fetchThemeRevisions(themeId);
      setRevisions(revs || []);
      setPreviewRev(null);
    } catch (e: any) {
      const data = e?.response?.data;
      setError(typeof data === 'string' && data ? data : 'Restore failed.');
    } finally {
      setRestoring(null);
    }
  };

  if (globalThemes.length === 0) {
    return <p className="text-sm text-gray-400">No global themes yet — publish one before its history can appear here.</p>;
  }

  return (
    <div className="space-y-4">
      <label className="block">
        <span className="text-xs text-gray-400">Theme</span>
        <select
          value={themeId}
          onChange={(e) => setThemeId(e.target.value)}
          className="block w-full mt-1 bg-black/30 border border-white/10 rounded-md text-sm text-white px-3 py-1.5 focus:outline-none focus:border-white/40"
        >
          {globalThemes.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name} ({t.id})
            </option>
          ))}
        </select>
      </label>

      {loading && <p className="text-sm text-gray-400">Loading revisions…</p>}
      {error && <p className="text-sm text-red-300">{error}</p>}
      {!loading && !error && revisions.length === 0 && (
        <p className="text-sm text-gray-400">
          No revisions yet — edit and save this theme once and the previous version appears here.
        </p>
      )}

      <div className="space-y-2">
        {revisions.map((r) => (
          <GlassCard key={r.rev} className="space-y-2">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div className="min-w-0">
                <p className="text-sm font-medium text-white">
                  rev {r.rev} <span className="text-gray-500 font-normal">· {r.name}</span>
                </p>
                <p className="text-[11px] text-gray-500">
                  {new Date(r.created_at).toLocaleString()} · {diffNote(r, live)}
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => setPreviewRev(previewRev === r.rev ? null : r.rev)}
                  className="ks-ghost-btn px-3 py-1.5 text-xs rounded"
                >
                  {previewRev === r.rev ? 'Hide preview' : 'Preview'}
                </button>
                <button
                  type="button"
                  onClick={() => restore(r.rev)}
                  disabled={restoring !== null}
                  className="ks-primary-btn px-3 py-1.5 text-xs rounded hover:bg-gray-200 disabled:opacity-60"
                >
                  {restoring === r.rev ? 'Restoring…' : 'Restore'}
                </button>
              </div>
            </div>
            {previewRev === r.rev && (
              <div className="space-y-2">
                <ThemePreview theme={r.spec} />
                {r.description && <p className="text-xs text-gray-400">{r.description}</p>}
              </div>
            )}
          </GlassCard>
        ))}
      </div>
    </div>
  );
};
