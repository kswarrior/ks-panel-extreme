import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useThemeStore } from '@/shared/stores/themeStore';
import { StatCard } from '@/shared/components/ui/StatDashboard';
import GlassCard from '@/shared/components/ui/Card';
import { PageActionsPill, PILL_TAB_STYLE } from '@/shared/components/ui/PageActionsPill';

// ThemeSchedules — themes have no cron. Themes apply instantly on
// assignment; this page only surfaces theme + assignment counts and
// explains that there is nothing to schedule.
const ThemeSchedules: React.FC = () => {
  const themes = useThemeStore((s) => s.themes);
  const globalThemes = useThemeStore((s) => s.globalThemes);
  const assignments = useThemeStore((s) => s.assignments);
  const globalAssignments = useThemeStore((s) => s.globalAssignments);
  const load = useThemeStore((s) => s.load);
  const loadGlobal = useThemeStore((s) => s.loadGlobal);
  const [error, setError] = useState('');

  useEffect(() => {
    (async () => {
      try {
        load();
        await loadGlobal();
      } catch (e: any) {
        setError(e?.response?.data || e?.message || 'Failed to load theme data');
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const counts = useMemo(() => {
    const ids = new Set<string>();
    for (const t of themes) ids.add(t.id);
    for (const t of globalThemes) ids.add(t.id);
    const scopes = new Set<string>([
      ...Object.keys(assignments || {}),
      ...Object.keys(globalAssignments || {}),
    ]);
    return { total: ids.size, assigned: scopes.size };
  }, [themes, globalThemes, assignments, globalAssignments]);

  return (
    <div className="space-y-4">
      <PageActionsPill>
        <Link to="/themes" className="ks-tab inline-flex items-center justify-center px-2 text-xs" style={PILL_TAB_STYLE} title="Themes">
          Themes
        </Link>
        <Link to="/themes/stats" className="ks-tab inline-flex items-center justify-center px-2 text-xs" style={PILL_TAB_STYLE} title="Theme statistics">
          Stats
        </Link>
      </PageActionsPill>

      <div className="grid gap-4 grid-cols-1 sm:grid-cols-2">
        <StatCard label="Total Themes" value={counts.total} color="text-white" dotColor="bg-white" />
        <StatCard label="Assigned Scopes" value={counts.assigned} color="text-violet-300" dotColor="bg-violet-400" />
      </div>

      {error && <p className="text-red-400 text-sm">{error}</p>}

      <GlassCard>
        <h3 className="text-sm font-semibold text-white mb-1">No schedules</h3>
        <p className="text-sm text-gray-400">
          Themes apply instantly — no schedules. Assign a theme to an area or
          page and it paints on the next render; there is no cron to configure.
        </p>
        <div className="mt-3 flex gap-3 text-sm">
          <Link to="/themes" className="text-sky-300 hover:text-sky-200 underline">Manage themes</Link>
          <Link to="/themes/stats" className="text-sky-300 hover:text-sky-200 underline">Theme stats</Link>
        </div>
      </GlassCard>
    </div>
  );
};

export default ThemeSchedules;
