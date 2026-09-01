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
} from '@/shared/api/admin';

export type DatabaseTabId = 'overview' | 'change' | 'backup';

export const DATABASE_TABS: Array<{ id: DatabaseTabId; label: string }> = [
  { id: 'overview', label: 'Overview' },
  { id: 'change', label: 'Switch' },
  { id: 'backup', label: 'Backup' },
];

export interface DatabaseBackup {
  id: string;
  filename: string;
  path: string;
  size_bytes: number;
  created_at: string;
  sha256: string;
  source: string;
  is_live_safe: boolean;
}