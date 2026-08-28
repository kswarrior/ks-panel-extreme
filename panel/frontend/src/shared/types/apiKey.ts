export interface ApiKey {
  id: number;
  user_id: number;
  /** Owner's username – only populated by the admin (all-keys) endpoint. */
  owner_name?: string;
  name: string;
  prefix: string;
  created_at: string;
  last_used_at?: string | null;
  permissions: string[];
  /** Optional ISO-8601 expiry timestamp; null/absent means "never expires". */
  expires_at?: string | null;
  /** Optional max requests per window; null/absent means "no limit". */
  rate_limit?: number | null;
  /** Window size in seconds for rate_limit. Defaults to 60 when rate_limit is set. */
  rate_window_seconds?: number;
  /** Whether the key is currently active. When false, the key is soft-revoked. */
  active?: boolean;
  /** Free-form short note shown alongside the key in the admin list. Persisted server-side. */
  description?: string;
  /** Friendly label rendered in the UI instead of the machine name. Falls back to `name` when empty. */
  display_name?: string;
  /** Optional CSS colour used to tint the key's badge/chip in the admin list. */
  accent_color?: string;
}

export interface CreateApiKeyResult extends ApiKey {
  token: string; // returned only once
}

/**
 * Payload shared between create + admin update. On update, the *_set flags
 * control whether the corresponding optional field is written to the row
 * (true => write the value, even if it's null/zero => "clear the limit").
 * When a *_set flag is false the existing stored value is left untouched.
 */
export interface ApiKeyMutationPayload {
  name: string;
  permissions: string[];
  expires_at?: string | null;
  rate_limit?: number | null;
  rate_window_seconds?: number;
  expires_at_set?: boolean;
  rate_limit_set?: boolean;
  rate_window_set?: boolean;
  active?: boolean;
  active_set?: boolean;
  description?: string;
  display_name?: string;
  accent_color?: string;
}