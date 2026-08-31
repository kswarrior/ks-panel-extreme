import React, { PropsWithChildren } from 'react';
import { useAuthStore } from '@/shared/stores/authStore';
import { Navigate } from 'react-router-dom';
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
    // Simple redirect – could also render a Forbidden page.
    return <Navigate to="/instances" replace />;
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
