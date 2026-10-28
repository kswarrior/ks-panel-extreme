import { parseConfig } from '@/shared/hooks/useInstance';
import type { AutomationKind } from '@/features/instances/types/instanceAdvanced';

export interface AutomationControls {
  allowEdit: boolean;
  allowedKinds: AutomationKind[];
  maxTimeoutSec: number;
  maxActiveJobs: number;
}

function clampInt(value: unknown, cap: number, fallback: number): number {
  const n = typeof value === 'number' ? Math.floor(value) : parseInt(String(value ?? ''), 10);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.max(1, Math.min(cap, n));
}

// resolveAutomationControls mirrors the backend gates
// (shortcuts.automation) so the native editor hides choices the API would
// reject. Missing/garbled blocks stay allow-all, like resolveInstanceControls.
export function resolveAutomationControls(
  raw?: string | Record<string, any> | null,
): AutomationControls {
  const root = typeof raw === 'string' ? parseConfig(raw) : (raw ?? {});
  const auto = root?.instance_controls?.shortcuts?.automation;
  const cfg: Record<string, any> = auto && typeof auto === 'object' && !Array.isArray(auto) ? auto : {};
  const kinds: AutomationKind[] = [];
  if (cfg.allow_shell !== false) kinds.push('shell');
  if (cfg.allow_power !== false) kinds.push('power');
  if (cfg.allow_actions !== false) kinds.push('action');
  return {
    allowEdit: cfg.allow_edit !== false,
    allowedKinds: kinds,
    maxTimeoutSec: clampInt(cfg.max_timeout_sec, 1800, 1800),
    maxActiveJobs: Number.isFinite(Number(cfg.max_active_jobs)) && Number(cfg.max_active_jobs) > 0
      ? clampInt(cfg.max_active_jobs, 1000, 0)
      : 0,
  };
}
