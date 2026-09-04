import React, { useEffect, useState } from 'react';
import GlassCard from '@/shared/components/ui/Card';
import ThemePreview from '@/features/themes/components/ThemePreview';
import { fetchThemeMarket, installThemeFromMarket, type ThemeMarketEntry } from '@/features/themes/api/themes';
import { useThemeStore } from '@/shared/stores/themeStore';
import type { Theme } from '@/features/themes/types/theme';

// MarketTab is the Theme Studio's marketplace browser: catalog list →
// preview via ThemePreview → install into the GLOBAL library.
//
// Entries already installed (id present in globalThemes) preview instantly
// from the in-memory theme — no network. New entries install server-side
// (POST /api/themes/market/install, CREATE_GLOBAL/EDIT-gated) and the
// install response carries the full spec, which is what the preview then
// renders. Either way every preview on this tab is a real ThemePreview of
// a full Theme object, never a mock.
export const MarketTab: React.FC = () => {
  const globalThemes = useThemeStore((s) => s.globalThemes);
  const loadGlobal = useThemeStore((s) => s.loadGlobal);
  const [entries, setEntries] = useState<ThemeMarketEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [installing, setInstalling] = useState(false);
  const [installError, setInstallError] = useState('');
  const [installedPreview, setInstalledPreview] = useState<Theme | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError('');
      try {
        const catalog = await fetchThemeMarket();
        if (cancelled) return;
        setEntries(catalog.pages || []);
        if (catalog.pages?.length && !selectedId) setSelectedId(catalog.pages[0].id);
      } catch (e: any) {
        if (cancelled) return;
        setError(e?.response?.data || 'Failed to load the theme marketplace.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const selected = entries.find((e) => e.id === selectedId) || null;
  const installedTheme = selected ? globalThemes.find((t) => t.id === selected.id) || null : null;
  // Preview prefers the just-installed response (freshest spec), then the
  // already-installed global theme. Both are full Theme objects.
  const previewTheme: Theme | null =
    installedPreview && selected && installedPreview.id === selected.id
      ? installedPreview
      : installedTheme;

  const install = async () => {
    if (!selected || installing) return;
    setInstalling(true);
    setInstallError('');
    try {
      const saved = await installThemeFromMarket(selected.id);
      await loadGlobal();
      // The install response carries the full spec — preview it directly.
      setInstalledPreview(saved.spec as Theme);
    } catch (e: any) {
      const data = e?.response?.data;
      setInstallError(typeof data === 'string' && data ? data : 'Install failed.');
    } finally {
      setInstalling(false);
    }
  };

  if (loading) {
    return <p className="text-sm text-gray-400">Loading the theme marketplace…</p>;
  }
  if (error) {
    return <p className="text-sm text-red-300">{error}</p>;
  }
  if (entries.length === 0) {
    return <p className="text-sm text-gray-400">The marketplace catalog is empty.</p>;
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {entries.map((e) => {
          const installed = globalThemes.some((t) => t.id === e.id);
          const active = e.id === selectedId;
          return (
            <button
              key={e.id}
              type="button"
              onClick={() => {
                setSelectedId(e.id);
                setInstallError('');
                setInstalledPreview(null);
              }}
              className={`text-left rounded-xl border p-3 transition-colors ${
                active ? 'border-white/40 bg-white/[0.07]' : 'border-white/10 bg-white/[0.03] hover:bg-white/[0.05]'
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-medium text-white truncate">{e.name}</p>
                {installed && (
                  <span className="shrink-0 text-[10px] uppercase tracking-wide text-emerald-300 border border-emerald-700/40 bg-emerald-900/40 rounded px-1.5 py-0.5">
                    Installed
                  </span>
                )}
              </div>
              {e.description && <p className="text-xs text-gray-400 mt-1 line-clamp-2">{e.description}</p>}
              <p className="text-[11px] text-gray-500 mt-1.5 font-mono">
                {e.id} · v{e.version || '1.0'}
                {e.author ? ` · by ${e.author}` : ''}
              </p>
            </button>
          );
        })}
      </div>

      {selected && (
        <GlassCard className="space-y-3">
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div className="min-w-0">
              <h4 className="text-sm font-semibold text-white">{selected.name}</h4>
              {selected.description && <p className="text-xs text-gray-400 mt-0.5">{selected.description}</p>}
              {selected.tags?.length > 0 && (
                <div className="flex items-center gap-1.5 mt-2 flex-wrap">
                  {selected.tags.map((t) => (
                    <span key={t} className="px-2 py-0.5 text-[10px] bg-white/5 border border-white/10 rounded text-gray-300">
                      {t}
                    </span>
                  ))}
                </div>
              )}
            </div>
            {!previewTheme && (
              <button
                type="button"
                onClick={install}
                disabled={installing}
                className="ks-primary-btn px-4 py-2 text-sm rounded hover:bg-gray-200 disabled:opacity-60 shrink-0"
              >
                {installing ? 'Installing…' : 'Install'}
              </button>
            )}
          </div>

          {previewTheme ? (
            <div className="space-y-2">
              <p className="text-xs text-gray-400">Preview — exactly how it paints when applied:</p>
              <ThemePreview theme={previewTheme} />
              <p className="text-[11px] text-emerald-300">
                Installed in the global library. Use “Apply to…” on the Themes page to paint an area or page with it.
              </p>
            </div>
          ) : (
            <p className="text-xs text-gray-500">
              Install to preview it here — the install response carries the full theme, rendered above with the same
              preview the Themes grid uses.
            </p>
          )}
          {installError && <p className="text-xs text-red-300">{installError}</p>}
        </GlassCard>
      )}
    </div>
  );
};
