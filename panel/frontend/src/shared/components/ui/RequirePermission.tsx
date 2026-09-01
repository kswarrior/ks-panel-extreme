import React, { PropsWithChildren } from 'react';
import { useAuthStore } from '@/shared/stores/authStore';
import { AREA_PERM_KEYS, PERMISSION_AREAS, hasPermissionAny } from '@/shared/types/permissions';

interface Props extends PropsWithChildren {
  /**
   * The permission to require. When this key is an area umbrella (e.g.
   * MANAGE_USERS), the guard admits the user if they hold the umbrella OR
   * ANY granular/extra key of that area — so a narrowed role carrying
   * USERS_VIEW (without MANAGE_USERS) still reaches the Users page. For a
   * plain page-level key that's not an area umbrella (e.g. VIEW_ACCOUNT,
   * ACCESS_ADMIN_PANEL), strict `.includes()` semantics apply.
   */
  permission: string;
  /**
   * Optional explicit multi-key gate: admit when the user holds ANY of the
   * listed keys (in addition to `permission`). Use this when a route/page
   * needs to admit more than one umbrella / action key directly, without
   * going through the area-umbrella resolution above.
   */
  anyOf?: string[];
}

const RequirePermission: React.FC<Props> = ({ permission, anyOf, children }) => {
  const { permissions } = useAuthStore();

  // Resolve: a single key is granted when (a) the user holds it directly,
  // OR (b) `permission` is an area umbrella and the user holds any key of
  // that area (umbrella implies all actions, AND any action implies the
  // area — the page-level gate is symmetric with the backend route gate).
  let ok = permissions.includes(permission);
  if (!ok && AREA_PERM_KEYS.has(permission)) {
    const area = PERMISSION_AREAS.find((a) => a.umbrella === permission);
    if (area) {
      ok = hasPermissionAny(permissions, ...AREA_KEYS_FOR_AREA.get(area.label) ?? []);
    }
  }
  if (anyOf && !ok) {
    ok = hasPermissionAny(permissions, ...anyOf);
  }

  if (!ok) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[50vh] text-center p-8">
        <div className="w-12 h-12 rounded-full bg-white/5 border border-white/10 flex items-center justify-center mb-4">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-6 h-6 text-amber-400">
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
        </div>
        <h2 className="text-lg font-semibold text-white">Permission denied</h2>
        <p className="text-sm text-gray-400 mt-2 max-w-md">
          You do not have the required permission to view this page.
          {permission && <span className="block mt-1 font-mono text-xs text-amber-300/80">{permission}</span>}
        </p>
      </div>
    );
  }
  return <>{children}</>;
};

// Precompute the full key set per area (umbrella + CRUD + extras + Own/All) so the
// guard doesn't rebuild it on every render. Mirrors the backend
// permissions.Group keysForAction rule (umbrella implies all actions).
const AREA_KEYS_FOR_AREA = new Map<string, string[]>(
  PERMISSION_AREAS.map((a) => {
    const keys: string[] = [];
    if (a.umbrella) keys.push(a.umbrella);
    for (const k of Object.values(a.keys)) if (k) keys.push(k);
    for (const k of a.extraKeys ?? []) keys.push(k);
    if (a.ownKey) keys.push(a.ownKey);
    if (a.allKey) keys.push(a.allKey);
    return [a.label, keys];
  }),
);

export default RequirePermission;
