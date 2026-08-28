// ActivityLog is one row of the admin audit timeline rendered by the
// Activity page. The shape is intentionally rich: each field gets its own
// dedicated card element, so the page never has to parse a free-form
// message string to figure out "who / what / when".

export type ActivityCategory =
  | 'user'
  | 'role'
  | 'node'
  | 'template'
  | 'instance'
  | 'api_key'
  | 'settings'
  | 'auth'
  | 'system';

export interface ActivityLog {
  id: number;
  // Nullable when the actor's users row was deleted after the action.
  user_id?: number | null;
  // Denormalised at write-time so the row stays readable post-delete.
  username: string;
  // Display name of the actor's role at the time of the action.
  role?: string;
  category: ActivityCategory;
  // Action verb: 'create' | 'update' | 'delete' | 'login' | 'login_failed'
  // | 'rotate_token' | 'probe' | 'deploy' | 'start' | 'stop' | 'destroy'.
  action: string;
  target_id?: number | null;
  // Human-readable label of the affected entity.
  target_label?: string;
  message: string;
  // Client IP captured at write-time. X-Forwarded-For friendly.
  ip_address: string;
  // Raw User-Agent header value (truncated).
  user_agent: string;
  created_at: string;
}
