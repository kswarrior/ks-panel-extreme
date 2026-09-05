import React from 'react';
import { useLocation } from 'react-router-dom';
import InstancePowerMenu from './InstancePowerMenu';
import InstanceInfoRow from './InstanceInfoRow';
import ErrorBoundary from '@/shared/components/ui/ErrorBoundary';

// InstanceMenu — the main thing of an instance in a single menu panel:
// power controls + template actions on top, status / uptime / type row
// below. Rendered inside the floating draggable square (InstanceMenuFab).
const InstanceMenu: React.FC = () => {
  const location = useLocation();

  return (
    <div className="flex flex-col min-h-0">
      {/* Power controls first, template actions below them. */}
      <div className="shrink-0 border-b border-white/10 pb-3">
        <ErrorBoundary resetKey={location.pathname} label="instance-menu-power">
          <InstancePowerMenu />
        </ErrorBoundary>
      </div>
      {/* Status / uptime / type row below, in its own row. */}
      <div className="shrink-0 pb-3">
        <ErrorBoundary resetKey={location.pathname} label="instance-menu-info">
          <InstanceInfoRow />
        </ErrorBoundary>
      </div>
    </div>
  );
};

export default InstanceMenu;
