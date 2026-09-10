import React from 'react';
import { useLocation } from 'react-router-dom';
import InstancePowerMenu from './InstancePowerMenu';
import InstanceInfoRow from './InstanceInfoRow';
import ErrorBoundary from '@/shared/components/ui/ErrorBoundary';

// InstanceMenu — the main thing of an instance in a single menu panel,
// ordered top to bottom: status / uptime / type row, then power controls
// (Start / Stop / Restart), then template actions last. Rendered inside
// the floating draggable square (InstanceMenuFab).
const InstanceMenu: React.FC = () => {
  const location = useLocation();

  return (
    <div className="ks-fab-stagger flex flex-col min-h-0 py-1">
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
