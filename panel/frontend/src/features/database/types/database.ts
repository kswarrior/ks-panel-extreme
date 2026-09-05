// Database types - extracted from Database.tsx

// The switch-engine contracts live in one place (shared/api/admin.ts) so the
// wire shape can't drift between the API layer and this feature. Re-exported
// here for the components that still import them from '../types/database'.
// NOTE: the page-level DatabaseInfo / DatabaseTable shapes live in
// features/system/types/system.ts — do NOT re-declare them here; a previous
// local copy drifted from the backend contract.
export type {
  DatabaseEngineInfo,
  DatabaseEngineSwitchResponse,
  DatabaseBackup,
  BackupSchedule,
  BackupScheduleUpsert,
  S3ConfigView,
} from '@/shared/api/admin';

export type DatabaseTabId = 'overview' | 'tables' | 'change' | 'backup';

export const DATABASE_TABS: Array<{ id: DatabaseTabId; label: string; hint: string }> = [
  { id: 'overview', label: 'Overview', hint: 'Health, size, WAL' },
  { id: 'tables', label: 'Tables', hint: 'Rows, storage, filter' },
  { id: 'change', label: 'Switch', hint: 'Change engine' },
  { id: 'backup', label: 'Backup', hint: 'Create, upload, schedules' },
];