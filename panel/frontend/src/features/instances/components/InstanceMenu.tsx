import React from 'react';
import { useLocation } from 'react-router-dom';
import { useInstanceNav } from '@/shared/components/layout/InstanceNavContext';
import InstancePageSelect from './InstancePageSelect';
import InstancePowerMenu from './InstancePowerMenu';
import InstanceInfoRow from './InstanceInfoRow';
import ErrorBoundary from '@/shared/components/ui/ErrorBoundary';

// InstanceMenu — the main thing of an instance in a single menu panel,
// ordered top to bottom: page switcher, status / uptime / type row, then
// power controls (Start / Stop / Restart), then template actions last.
// Rendered inside the floating draggable square (InstanceMenuFab).
const InstanceMenu: React.FC = () => {
  const location = useLocation();
  const { instanceId, nav } = useInstanceNav();

  // Active page slug ('' on the index route → '.') for the switcher.
  const activeSlug = React.useMemo(() => {
    const m = location.pathname.match(/^\/instances\/\d+(?:\/(.*))?$/);
    const raw = (m?.[1] ?? '').replace(/\/+$/, '');
    return raw === '' ? '.' : raw;
  }, [location.pathname]);

  return (
    <div className="ks-fab-stagger flex flex-col min-h-0 py-1">
      {/* Page switcher (moved here from the header): control pages, native
          tool pages and the instance's own custom pages in one dropdown. */}
      {instanceId != null && (
        <div className="shrink-0 border-b border-white/10 px-3 pb-2">
          <ErrorBoundary resetKey={location.pathname} label="instance-menu-pages">
            <InstancePageSelect
              instanceId={instanceId}
              activeSlug={activeSlug}
              nav={nav}
              fullWidth
            />
          </ErrorBoundary>
        </div>
      )}
      {/* Status / uptime / type row first. */}
      <div className="shrink-0 border-b border-white/10 pb-3">
        <ErrorBoundary resetKey={location.pathname} label="instance-menu-info">
          <InstanceInfoRow />
        </ErrorBoundary>
      </div>
      {/* Power controls next, template actions last. */}
      <div className="shrink-0 pt-1 pb-3">
        <ErrorBoundary resetKey={location.pathname} label="instance-menu-power">
          <InstancePowerMenu />
        </ErrorBoundary>
      </div>
    </div>
  );
};

export default InstanceMenu;
