import React from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { useAuthStore } from '@/shared/stores/authStore';
import { useSettingsStore } from '@/shared/stores/settingsStore';
import { PermissionKey, PERMISSION_AREAS, hasPermissionAny } from '@/shared/types/permissions';
import SidebarSkeleton from './SidebarSkeleton';

interface SidebarProps {
  open: boolean;
  onClose: () => void;
  collapsed: boolean;
  setCollapsed: React.Dispatch<React.SetStateAction<boolean>>;
}

// Small inline icon set (SVG-only). Exported so the header breadcrumb can
// reuse the exact same glyphs in front of page titles: [SVG] [Title].
export const Icons: Record<string, React.ReactNode> = {
  Instances: (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5" aria-hidden="true">
      <rect x="3" y="6" width="11" height="9" rx="1.2" />
      <path d="M3 10h11" opacity="0.5" />
      <circle cx="5.5" cy="8" r="0.7" fill="currentColor" />
      <circle cx="7.5" cy="8" r="0.7" fill="currentColor" opacity="0.5" />
      <rect x="8" y="11" width="11" height="9" rx="1.2" />
      <path d="M8 15h11" opacity="0.5" />
      <circle cx="10.5" cy="13" r="0.7" fill="currentColor" />
      <circle cx="12.5" cy="13" r="0.7" fill="currentColor" opacity="0.5" />
    </svg>
  ),
  Admin: (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5" aria-hidden="true">
      <path d="M12 2 4 6v6c0 5 3.4 8.6 8 10 4.6-1.4 8-5 8-10V6l-8-4Z" />
     </svg>
  ),
  Users: (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4" aria-hidden="true">
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
     </svg>
  ),
  Roles: (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4" aria-hidden="true">
      <path d="M12 2 4 6v6c0 5 3.4 8.6 8 10 4.6-1.4 8-5 8-10V6l-8-4Z" />
     </svg>
  ),
  Settings: (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4" aria-hidden="true">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1A1.7 1.7 0 0 0 9 19.4a1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1A1.7 1.7 0 0 0 4.6 9a1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z" />
     </svg>
  ),
  Authority: (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4" aria-hidden="true">
      <circle cx="8" cy="14" r="4" />
      <path d="m10.8 11.2 9.2-9.2" />
      <path d="m16 6 3 3" />
      <path d="m19 3 2 2" />
    </svg>
  ),
  ApiKeys: (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4" aria-hidden="true">
      <path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4" />
     </svg>
  ),
  Nodes: (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4" aria-hidden="true">
      <circle cx="12" cy="12" r="3" fill="currentColor" opacity="0.15" />
      <circle cx="12" cy="12" r="3" />
      <circle cx="4" cy="5" r="1.8" />
      <circle cx="20" cy="5" r="1.8" />
      <circle cx="4" cy="19" r="1.8" />
      <circle cx="20" cy="19" r="1.8" />
      <line x1="10.2" y1="10.2" x2="5.4" y2="6.4" opacity="0.6" />
      <line x1="13.8" y1="10.2" x2="18.6" y2="6.4" opacity="0.6" />
      <line x1="10.2" y1="13.8" x2="5.4" y2="17.6" opacity="0.6" />
      <line x1="13.8" y1="13.8" x2="18.6" y2="17.6" opacity="0.6" />
   </svg>
  ),
  Templates: (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4" aria-hidden="true">
      <rect x="7" y="4" width="13" height="15" rx="2" />
      <path d="M7 9H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2v-1" />
      <line x1="11" y1="9" x2="17" y2="9" opacity="0.7" />
      <line x1="11" y1="13" x2="17" y2="13" opacity="0.7" />
      <line x1="11" y1="17" x2="15" y2="17" opacity="0.5" />
     </svg>
  ),
  Themes: (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4" aria-hidden="true">
      <circle cx="13.5" cy="6.5" r="2.5" />
      <circle cx="17.5" cy="10.5" r="2.5" />
      <circle cx="8.5" cy="7.5" r="2.5" />
      <circle cx="6.5" cy="12.5" r="2.5" />
      <path d="M12 22a2 2 0 0 0 2-2v-2.5a2.5 2.5 0 0 0-5 0V20a2 2 0 0 0 2 2z" />
     </svg>
  ),
  Mods: (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4" aria-hidden="true">
      <path d="M9 2h6l2 4-3 2 3 2-2 4H9l-2-4 3-2-3-2z" />
      <path d="M12 14v8" />
     </svg>
  ),
  Applications: (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4" aria-hidden="true">
      <rect x="2" y="3" width="8" height="8" rx="1.5" />
      <rect x="14" y="3" width="8" height="8" rx="1.5" />
      <rect x="2" y="13" width="8" height="8" rx="1.5" />
      <rect x="14" y="13" width="8" height="8" rx="1.5" />
     </svg>
  ),
  Dashboard: (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4" aria-hidden="true">
      <rect x="3" y="3" width="7" height="9" rx="1" />
      <rect x="14" y="3" width="7" height="5" rx="1" />
      <rect x="14" y="12" width="7" height="9" rx="1" />
      <rect x="3" y="16" width="7" height="5" rx="1" />
     </svg>
  ),
  Activity: (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4" aria-hidden="true">
      <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
     </svg>
  ),
  Database: (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4" aria-hidden="true">
      <ellipse cx="12" cy="5" rx="9" ry="3" />
      <path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3" />
      <path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5" />
     </svg>
  ),
  Security: (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4" aria-hidden="true">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
      <path d="m9 12 2 2 4-4" />
     </svg>
  ),
  Chevron: (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4 pointer-events-none" aria-hidden="true">
      <polyline points="6 9 12 15 18 9" />
     </svg>
  ),
  Home: (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4" aria-hidden="true">
      <path d="M3 9.5 12 3l9 6.5V21a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1Z" />
     </svg>
  ),
  Files: (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4" aria-hidden="true">
      <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z" />
     </svg>
  ),
  Terminal: (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4" aria-hidden="true">
      <path d="m4 17 6-6-6-6" /><path d="M12 19h8" />
     </svg>
  ),
  Network: (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4" aria-hidden="true">
      <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
     </svg>
  ),
  Env: (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4" aria-hidden="true">
      <rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" />
     </svg>
  ),
  Automation: (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4" aria-hidden="true">
      <circle cx="12" cy="12" r="3" /><path d="M12 2v3M12 19v3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M2 12h3M19 12h3M4.9 19.1 7 17M17 7l2.1-2.1" />
     </svg>
  ),
  Processes: (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4" aria-hidden="true">
      <rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><path d="M14 17.5h7M17.5 14v7" />
     </svg>
  ),
  Metrics: (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4" aria-hidden="true">
      <path d="M3 3v18h18" /><rect x="7" y="12" width="3" height="6" /><rect x="13" y="7" width="3" height="11" />
     </svg>
  ),
  Ports: (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4" aria-hidden="true">
      <rect x="4" y="4" width="16" height="16" rx="2" /><path d="M9 4v16M15 4v16M4 9h16M4 15h16" />
     </svg>
  ),
  Backups: (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4" aria-hidden="true">
      <path d="M21 12a9 9 0 1 1-3-6.7" /><path d="M21 3v5h-5" />
     </svg>
  ),
  Audit: (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4" aria-hidden="true">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><path d="M14 2v6h6" /><path d="m9 15 2 2 4-4" />
     </svg>
  ),
  Tickets: (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4" aria-hidden="true">
      <path d="M2 9a3 3 0 0 1 3-3h5l4 4-4 4H5a3 3 0 0 1-3-3z" />
      <path d="M22 9a3 3 0 0 0-3-3h-5l-4 4 4 4h5a3 3 0 0 0 3-3z" />
      <path d="M9 13H8M16 17H8" opacity="0.5" />
      <circle cx="12" cy="12" r="1" fill="currentColor" />
    </svg>
  ),
  Notifications: (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4" aria-hidden="true">
      <circle cx="12" cy="3.35" r="1.1" fill="currentColor" stroke="none" />
      <path d="M12 5.45a6 6 0 0 0-6 6V14c0 .5-.2 1-.55 1.35L4.2 16.6a.6.6 0 0 0 .42 1.05h14.76a.6.6 0 0 0 .42-1.05l-1.24-1.25A1.9 1.9 0 0 1 18 14v-2.55a6 6 0 0 0-6-6Z" />
      <path d="M8.2 17.65h7.6" strokeWidth="1.55" />
      <path d="M12 17.65v1.45" strokeWidth="1.35" />
      <circle cx="12" cy="20.15" r="1.55" fill="currentColor" stroke="none" />
      <circle cx="11.45" cy="19.65" r="0.42" fill="white" opacity="0.62" />
    </svg>
  ),
  // Account has no sidebar entry but the header shows an "Account" title —
  // reuse a user glyph so the header can still render [SVG] [Account].
  Account: (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4" aria-hidden="true">
      <path d="M20 21a8 8 0 1 0-16 0" />
      <circle cx="12" cy="7" r="4" />
    </svg>
  ),
  // KS Warrior logo for footer
  KSWarrior: (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5 pointer-events-none" aria-hidden="true">
      <path d="M12 2 4 6v6c0 5 3.4 8.6 8 10 4.6-1.4 8-5 8-10V6l-8-4Z" />
      <path d="M12 14v4M10 16h4M8 18h8" />
    </svg>
  ),
};

interface SubItem {
  to: string;
  label: string;
  permission: string;
  icon: string;
}

const adminSubItems: SubItem[] = [
  { to: '/system', label: 'System', permission: PermissionKey.ACCESS_ADMIN_PANEL, icon: 'Dashboard' },
  { to: '/tickets', label: 'Tickets', permission: PermissionKey.MANAGE_TICKETS, icon: 'Tickets' },
  { to: '/notifications', label: 'Notifications', permission: PermissionKey.MANAGE_NOTIFICATIONS, icon: 'Notifications' },
  { to: '/security', label: 'Security', permission: PermissionKey.ACCESS_ADMIN_PANEL, icon: 'Security' },
  { to: '/activity', label: 'Activity', permission: PermissionKey.ACCESS_ADMIN_PANEL, icon: 'Activity' },
  { to: '/database', label: 'Database', permission: PermissionKey.ACCESS_ADMIN_PANEL, icon: 'Database' },
  { to: '/users', label: 'Users', permission: PermissionKey.MANAGE_USERS, icon: 'Users' },
  { to: '/roles', label: 'Roles', permission: PermissionKey.MANAGE_ROLES, icon: 'Roles' },
  { to: '/settings', label: 'Settings', permission: PermissionKey.VIEW_SETTINGS, icon: 'Settings' },
  { to: '/api-keys', label: 'API Keys', permission: PermissionKey.MANAGE_API_KEYS, icon: 'ApiKeys' },
  { to: '/nodes', label: 'Nodes', permission: PermissionKey.MANAGE_NODES, icon: 'Nodes' },
  { to: '/templates', label: 'Templates', permission: PermissionKey.MANAGE_TEMPLATES, icon: 'Templates' },
  { to: '/instance-pages', label: 'Instance Pages', permission: PermissionKey.MANAGE_INSTANCE_PAGES, icon: 'Templates' },
  { to: '/mods', label: 'Mods', permission: PermissionKey.MANAGE_MODS, icon: 'Mods' },
  { to: '/applications', label: 'Applications', permission: PermissionKey.MANAGE_APPLICATIONS, icon: 'Applications' },
  { to: '/themes', label: 'Themes', permission: PermissionKey.MANAGE_THEMES, icon: 'Themes' },
  { to: '/instances', label: 'All Instances', permission: PermissionKey.MANAGE_INSTANCES, icon: 'Instances' },
];

const instanceSubItems: SubItem[] = [];

const Sidebar: React.FC<SidebarProps> = ({ open, onClose, collapsed, setCollapsed }) => {
  const { permissions } = useAuthStore();
  const initialized = useAuthStore((s) => s.initialized);
  const panelName = useSettingsStore((s) => s.panelName);
  const panelLogo = useSettingsStore((s) => s.panelLogo);
  const footerText = useSettingsStore((s) => s.footerText);
  const isCollapsed = collapsed !== undefined ? collapsed : false;

  // Area-aware permission check: umbrella permission admits any granular key of that area,
  // so a role with only USERS_VIEW still sees the Users page (mirrors RequirePermission).
  // VIEW_INSTANCES additionally admits instance-area VIEW/MANAGE keys.
  const hasSidebarAccess = (required: string): boolean => {
    if (!required) return true;
    if (permissions.includes(required)) return true;
    const area = PERMISSION_AREAS.find((a) => a.umbrella === required);
    if (area) {
      const allKeys: string[] = [];
      if (area.umbrella) allKeys.push(area.umbrella);
      for (const k of Object.values(area.keys)) if (k) allKeys.push(k as string);
      if (area.extraKeys) allKeys.push(...area.extraKeys);
      if (area.ownKey) allKeys.push(area.ownKey);
      if (area.allKey) allKeys.push(area.allKey);
      if (hasPermissionAny(permissions, ...allKeys)) return true;
    }
    // Instances list page: VIEW_INSTANCES page key should also admit instance-area perms
    if (required === PermissionKey.VIEW_INSTANCES) {
      const instArea = PERMISSION_AREAS.find((a) => a.label === 'Instances');
      if (instArea) {
        const instKeys = [
          instArea.umbrella,
          instArea.keys.VIEW as string | undefined,
          instArea.ownKey,
          instArea.allKey,
        ].filter(Boolean) as string[];
        if (hasPermissionAny(permissions, ...instKeys)) return true;
      }
      // also allow granular INSTANCES_* directly
      if (hasPermissionAny(permissions, PermissionKey.MANAGE_INSTANCES, PermissionKey.INSTANCES_VIEW, PermissionKey.INSTANCES_CREATE, PermissionKey.INSTANCES_EDIT, PermissionKey.INSTANCES_DELETE)) return true;
    }
    // Themes: MANAGE_THEMES umbrella also handled above, but also allow bare theme sub-caps
    // (already covered by area lookup). For safety, allow any theme key explicitly.
    if (required === PermissionKey.MANAGE_THEMES) {
      if (hasPermissionAny(permissions, PermissionKey.USE_LOCAL_THEMES, PermissionKey.CREATE_LOCAL_THEMES, PermissionKey.USE_GLOBAL_THEMES, PermissionKey.CREATE_GLOBAL_THEMES, PermissionKey.EDIT_THEMES, PermissionKey.ASSIGN_THEMES)) return true;
    }
    return false;
  };

  const adminEntries = adminSubItems.filter((i) => hasSidebarAccess(i.permission));
  const canAdmin = adminEntries.length > 0;

  return (
    <>
      {/* Mobile backdrop */}
      <button
        type="button"
        aria-label="Close sidebar"
        onClick={onClose}
        className={`md:hidden fixed inset-0 z-30 bg-black/50 transition-opacity ${
          open ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
        }`}
      />

      <aside
        className={` fixed inset-y-0 left-0 z-40 h-dvh flex flex-col overflow-hidden transition-all duration-200 glass-chrome ks-sidebar-bg text-gray-100 md:static md:relative md:inset-auto md:flex-shrink-0 md:translate-x-0 ${open ? 'translate-x-0' : '-translate-x-full md:translate-x-0'} ${isCollapsed ? 'ks-sidebar-collapsed w-16' : 'w-64'}`}
        aria-label="Main navigation"
      >
        {/* Fixed top brand area — never scrolls */}
        <div className={`shrink-0 z-10 px-3 py-4 border-b border-gray-800 flex items-center gap-2.5 ${isCollapsed ? 'justify-center' : ''}`}>
          {panelLogo ? (
            <img
              src={panelLogo.url}
              alt={panelName}
              className="h-7 w-7 shrink-0 rounded-md object-contain bg-neutral-900 border border-neutral-700"
            />
          ) : (
            <span className="inline-flex items-center justify-center h-7 w-7 shrink-0 rounded-md bg-neutral-900 border border-neutral-700">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="h-4 w-4 text-white"
                aria-hidden="true"
              >
                <path d="M12 2 4 6v6c0 5 3.4 8.6 8 10 4.6-1.4 8-5 8-10V6l-8-4Z" />
              </svg>
            </span>
          )}
          {!isCollapsed && (
            <span className="text-lg font-semibold tracking-tight whitespace-nowrap truncate flex-1 min-w-0">{panelName}</span>
          )}
        </div>

        {/* Scrollable navigation area — only this section scrolls */}
        <nav className="flex-1 min-h-0 overflow-y-auto p-3 space-y-1">
          {/* Panel items — displayed directly without dropdown, in serial order */}
          {!initialized ? (
            <SidebarSkeleton collapsed={isCollapsed} />
          ) : (
            canAdmin &&
            adminEntries.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                onClick={onClose}
                className={({ isActive }) =>
                  `flex items-center rounded-md text-sm transition text-gray-400 ks-nav-item ${
                    isCollapsed ? 'justify-center px-2 py-2' : 'gap-3 px-3 py-2'
                  } ${isActive ? 'ks-nav-active' : ''}`
                }
                title={isCollapsed ? item.label : undefined}
              >
                <span className={`shrink-0 flex items-center justify-center ${isCollapsed ? 'text-gray-100' : ''}`}>
                  {Icons[item.icon]}
                </span>
                {!isCollapsed && <span className="truncate">{item.label}</span>}
              </NavLink>
            ))
          )}
        </nav>

        {/* Fixed footer — toggle button: SVG-only vs SVG + text */}
        <button
          type="button"
          onClick={() => setCollapsed((v) => !v)}
          aria-expanded={!isCollapsed}
          aria-label={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          className={`shrink-0 z-10 border-t border-gray-800 w-full flex items-center gap-2.5 px-3 py-3 text-left hover:bg-white/5 transition-colors ${isCollapsed ? 'justify-center' : ''}`}
        >
          <span className="shrink-0 flex items-center justify-center text-gray-100 pointer-events-none">
            {Icons.KSWarrior}
          </span>
          {!isCollapsed && (
            <>
              <span className="text-xs font-medium text-gray-400 truncate flex-1 min-w-0 pointer-events-none">{footerText}</span>
              <span className="shrink-0 text-gray-500 transition-transform pointer-events-none">{Icons.Chevron}</span>
            </>
          )}
        </button>
      </aside>
    </>
  );
};

export default Sidebar;