// Database types - extracted from Database.tsx

// The wire contracts live in one place so they can't drift between the API
// layer and this feature:
//   - DatabaseEngineInfo / DatabaseEngineSwitchResponse → shared/api/admin.ts
//     (re-exported below for the components that still import them here).
//   - DatabaseInfo / DatabaseTable → features/system/types/system.ts (the
//     canonical /api/database response shape the page consumes).
// Do NOT re-declare them locally — a previous duplicate here typed
// last_checkpoint as number while the backend sends an RFC3339 string.
export type {
  DatabaseEngineInfo,
  DatabaseEngineSwitchResponse,
} from '@/shared/api/admin';

export const HISTORY_WINDOW = 60;
export const REFRESH_MS = 5000;

export type DatabaseTabId = 'overview' | 'change';

export const DATABASE_TABS: Array<{ id: DatabaseTabId; label: string }> = [
  { id: 'overview', label: 'Overview' },
  { id: 'change', label: 'Switch' },
];