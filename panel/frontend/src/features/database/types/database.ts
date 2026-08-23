// Database types - extracted from Database.tsx

// The switch-engine contracts live in one place (shared/api/admin.ts) so the
// wire shape can't drift between the API layer and this feature. Re-exported
// here for the components that still import them from '../types/database'.
export type {
  DatabaseEngineInfo,
  DatabaseEngineSwitchResponse,
} from '@/shared/api/admin';

export const HISTORY_WINDOW = 60;
export const REFRESH_MS = 5000;

export interface DatabaseInfo {
  engine: string;
  path: string;
  version: string;
  engine_not_supported: boolean;
  size_bytes: number;
  logical_bytes: number;
  free_bytes: number;
  page_count: number;
  page_size: number;
  encoding: string;
  auto_vacuum_mode: number;
  cache_size_pages: number;
  max_page_count: number;
  free_pages: number;
  wal_bytes: number;
  shm_bytes: number;
  fragmentation_pct: number;
  tables: DatabaseTable[];
  integrity_ok: boolean;
  integrity_issues: string[];
  foreign_key_ok: boolean;
  foreign_key_issues: string[];
  journal_mode: string;
  last_checkpoint: number;
  last_modified_ago_secs: number;
  size_delta: number;
  row_delta_since_last: number;
  wal_delta: number;
}

export interface DatabaseTable {
  name: string;
  type: string;
  row_count: number;
  column_count: number;
  index_count: number;
  size_bytes: number;
  index_bytes: number;
  leaf_pages: number;
  internal_pages: number;
  overflow_pages: number;
  page_count: number;
  avg_row_bytes: number;
  max_payload: number;
  row_delta: number;
  size_delta: number;
  autoincr_value: number;
  without_rowid: boolean;
}

export type DatabaseTabId = 'overview' | 'change';

export const DATABASE_TABS: Array<{ id: DatabaseTabId; label: string }> = [
  { id: 'overview', label: 'Overview' },
  { id: 'change', label: 'Switch' },
];