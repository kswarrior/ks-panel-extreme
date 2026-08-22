// InstanceAdvancedPages.tsx — facade.
//
// This file used to be the ~1,800-line monolith that held every "advanced"
// built-in instance sub-page: Env (secrets), Automation, Processes, Metrics,
// Ports, Backups (snapshots), and Audit. Each page's implementation now lives
// in its own self-contained file under src/lib/builtin/*.tsx, sharing UI
// helpers via src/lib/builtin/_shared.tsx. This module is now a THIN FACADE
// that:
//
//   • re-exports the seven built-in advanced page components (so anything
//     importing them by name — notably router.tsx, which lazy-imports this
//     module and picks `m[name]` for the boundary-wrapped *Page exports —
//     keeps resolving);
//   • builds the boundary-wrapped *Page variants via withBoundary
//     (PageErrorBoundary) from _shared so a render-time throw in a lazy page
//     renders a visible crash card instead of blanking the SPA;
//   • re-exports the legacy default (InstanceAdvancedDefault = InstanceEnv).
//
// Bug fixes for a specific advanced sub-page should now land in its
// lib/builtin/<Page>.tsx file instead of here.

import React from 'react';
import { withBoundary } from '@/features/builtin-pages/_shared';

// The seven built-in advanced page implementations (moved to features/builtin-pages/).
import { InstanceEnv } from '@/features/builtin-pages/Env';
import { InstanceAutomation } from '@/features/builtin-pages/Automation';
import { InstanceProcesses } from '@/features/builtin-pages/Processes';
import { InstanceMetrics } from '@/features/builtin-pages/Metrics';
import { InstancePorts } from '@/features/builtin-pages/Ports';
import { InstanceSnapshots } from '@/features/builtin-pages/Backups';
import { InstanceAudit } from '@/features/builtin-pages/Audit';

// Re-export the raw components in case a consumer imports them by name.
export {
  InstanceEnv,
  InstanceAutomation,
  InstanceProcesses,
  InstanceMetrics,
  InstancePorts,
  InstanceSnapshots,
  InstanceAudit,
};

// Boundary-wrapped variants. router.tsx lazy-imports this module and selects
// these via `m[name]` for the /env, /automation, /processes, /metrics, /ports,
// /backups, /audit routes. Each wraps its page in PageErrorBoundary
// (withBoundary) so a render-time throw becomes a visible crash card instead
// of blanking the whole SPA (the router's lazy wrappers don't carry their
// own boundary).
export const InstanceEnvPage = withBoundary('Env', InstanceEnv);
export const InstanceAutomationPage = withBoundary('Automation', InstanceAutomation);
export const InstanceProcessesPage = withBoundary('Processes', InstanceProcesses);
export const InstanceMetricsPage = withBoundary('Metrics', InstanceMetrics);
export const InstancePortsPage = withBoundary('Ports', InstancePorts);
export const InstanceSnapshotsPage = withBoundary('Snapshots', InstanceSnapshots);
export const InstanceAuditPage = withBoundary('Audit', InstanceAudit);

// Match the legacy default export (the raw Env page).
const InstanceAdvancedDefault = InstanceEnv;
export default InstanceAdvancedDefault;
