export type NotificationCategory =
  | 'system'
  | 'user'
  | 'role'
  | 'node'
  | 'template'
  | 'instance'
  | 'api_key'
  | 'auth'
  | 'mod'
  | 'application'
  | 'security'
  | 'theme'
  | 'update'
  | 'general';

export type NotificationPriority = 'low' | 'normal' | 'high' | 'urgent' | 'critical';

export interface Notification {
  id: number;
  user_id: number;
  actor_id?: number;
  actor_name: string;
  category: NotificationCategory;
  priority: NotificationPriority;
  title: string;
  message: string;
  link?: string;
  action_label?: string;
  metadata?: string;
  is_read: boolean;
  is_broadcast: boolean;
  created_at: string;
  read_at?: string;
}

export interface NotificationStats {
  total: number;
  unread: number;
  by_category: Record<string, number>;
  by_priority: Record<string, number>;
  broadcast?: number;
  read?: number;
}

export interface CreateNotificationPayload {
  user_id?: number;
  category?: NotificationCategory;
  priority?: NotificationPriority;
  title: string;
  message: string;
  link?: string;
  action_label?: string;
  metadata?: string;
  broadcast?: boolean;
}

export const CATEGORY_META: Record<NotificationCategory, { label: string; icon: string; color: string }> = {
  system:      { label: 'System',      icon: 'system',      color: '#38bdf8' },
  user:        { label: 'User',        icon: 'users',       color: '#a78bfa' },
  role:        { label: 'Role',        icon: 'shield',      color: '#f472b6' },
  node:        { label: 'Node',        icon: 'nodes',       color: '#34d399' },
  template:    { label: 'Template',    icon: 'templates',   color: '#60a5fa' },
  instance:    { label: 'Instance',    icon: 'instances',   color: '#fbbf24' },
  api_key:     { label: 'API Key',     icon: 'apikeys',     color: '#fb923c' },
  auth:        { label: 'Auth',        icon: 'auth',        color: '#f87171' },
  mod:         { label: 'Mod',         icon: 'mods',        color: '#c084fc' },
  application: { label: 'Application', icon: 'apps',        color: '#2dd4bf' },
  security:    { label: 'Security',    icon: 'security',    color: '#ef4444' },
  theme:       { label: 'Theme',       icon: 'themes',      color: '#e879f9' },
  update:      { label: 'Update',      icon: 'update',      color: '#22d3ee' },
  general:     { label: 'General',     icon: 'general',     color: '#9ca3af' },
};

export const PRIORITY_META: Record<NotificationPriority, { label: string; color: string; bg: string; dot: string }> = {
  low:      { label: 'Low',      color: 'text-gray-400',  bg: 'bg-gray-700/30 border-gray-600/30',  dot: 'bg-gray-500' },
  normal:   { label: 'Normal',   color: 'text-sky-300',   bg: 'bg-sky-500/10 border-sky-400/20',    dot: 'bg-sky-400' },
  high:     { label: 'High',     color: 'text-amber-300', bg: 'bg-amber-500/15 border-amber-400/30',dot: 'bg-amber-400' },
  urgent:   { label: 'Urgent',   color: 'text-orange-300',bg: 'bg-orange-500/15 border-orange-400/30',dot: 'bg-orange-400' },
  critical: { label: 'Critical', color: 'text-red-300',   bg: 'bg-red-500/15 border-red-400/30',    dot: 'bg-red-500' },
};
