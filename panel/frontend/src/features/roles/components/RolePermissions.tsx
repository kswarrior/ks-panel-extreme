import React, { useMemo, useState, useEffect } from 'react';
import Modal from '@/shared/components/ui/Modal';
import type { PermissionArea } from '@/shared/types/permissions';
import type { Permission } from '@/shared/types/user';
import { PERMISSION_AREAS, ALL_ACTIONS } from '@/shared/types/permissions';

// ------------------------------------------------------------------
// Helpers
// ------------------------------------------------------------------
function groupKeySet(area: PermissionArea): Set<string> {
  const s = new Set<string>();
  if (area.umbrella) s.add(area.umbrella);
  for (const k of Object.values(area.keys)) if (k) s.add(k);
  for (const k of area.extraKeys ?? []) s.add(k);
  if (area.ownKey) s.add(area.ownKey);
  if (area.allKey) s.add(area.allKey);
  return s;
}

// ------------------------------------------------------------------
// Group icons – one per PERMISSION_AREAS label. Lucide-style, stroke only
// so they inherit currentColor and stay crisp at any size.
// ------------------------------------------------------------------
const GroupIcon: React.FC<{ label: string; size?: number; className?: string }> = ({ label, size = 18, className = '' }) => {
  const common = {
    width: size,
    height: size,
    viewBox: '0 0 24 24',
    fill: 'none' as const,
    stroke: 'currentColor' as const,
    strokeWidth: 1.9,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    className,
  };
  switch (label) {
    case 'Users':
      return (
        <svg {...common}><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></svg>
      );
    case 'Roles':
      return (
        <svg {...common}><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /></svg>
      );
    case 'Nodes':
      return (
        <svg {...common}><rect x="2" y="2" width="20" height="8" rx="2" /><rect x="2" y="14" width="20" height="8" rx="2" /><line x1="6" y1="6" x2="6.01" y2="6" /><line x1="6" y1="18" x2="6.01" y2="18" /></svg>
      );
    case 'Templates':
      return (
        <svg {...common}><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /><line x1="16" y1="13" x2="8" y2="13" /><line x1="16" y1="17" x2="8" y2="17" /></svg>
      );
    case 'Instances':
      return (
        <svg {...common}><path d="M12 2L2 7l10 5 10-5-10-5z" /><path d="M2 17l10 5 10-5" /><path d="M2 12l10 5 10-5" /></svg>
      );
    case 'API Keys':
      return (
        <svg {...common}><path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3" /><path d="M21 11.5V6.5a3.5 3.5 0 0 0-7 0v5" /></svg>
      );
    case 'Mods':
      return (
        <svg {...common}><path d="M12 2a2 2 0 0 0-2 2c0 1.1-.9 2-2 2a2 2 0 0 0-2 2v1a2 2 0 0 0 2 2c1.1 0 2 .9 2 2a2 2 0 0 0 2 2h1a2 2 0 0 0 2-2c0-1.1.9-2 2-2a2 2 0 0 0 2-2v-1a2 2 0 0 0-2-2c-1.1 0-2-.9-2-2a2 2 0 0 0-2-2h-1z" /></svg>
      );
    case 'Applications':
      return (
        <svg {...common}><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /></svg>
      );
    case 'Instance Pages':
      return (
        <svg {...common}><rect x="3" y="3" width="18" height="18" rx="2" /><line x1="3" y1="9" x2="21" y2="9" /><line x1="9" y1="21" x2="9" y2="9" /></svg>
      );
    case 'Tickets':
      return (
        <svg {...common}><path d="M2 9a3 3 0 0 1 0 6v2a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-2a3 3 0 0 1 0-6V7a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2z" /><path d="M13 5v2" /><path d="M13 17v2" /><path d="M13 11v2" /></svg>
      );
    case 'Notifications':
      return (
        <svg {...common}><path d="M6 8a6 6 0 0 1 12 0c0 7-6 5-6 9" /><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" /></svg>
      );
    case 'Settings':
      return (
        <svg {...common}><circle cx="12" cy="12" r="3" /><path d="M12 1v2" /><path d="M12 21v2" /><path d="M4.22 4.22l1.42 1.42" /><path d="M18.36 18.36l1.42 1.42" /><path d="M1 12h2" /><path d="M21 12h2" /><path d="M4.22 19.78l1.42-1.42" /><path d="M18.36 5.64l1.42-1.42" /></svg>
      );
    case 'Themes':
      return (
        <svg {...common}><circle cx="13.5" cy="6.5" r="0.5" /><circle cx="17.5" cy="10.5" r="0.5" /><circle cx="8.5" cy="7.5" r="0.5" /><circle cx="6.5" cy="12.5" r="0.5" /><path d="M12 22a7 7 0 0 0 7-7c0-3.5-2-6.5-7-11-5 4.5-7 7.5-7 11a7 7 0 0 0 7 7z" /></svg>
      );
    case 'Account':
      return (
        <svg {...common}><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" /></svg>
      );
    case 'AI Chat':
      return (
        <svg {...common}><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /><path d="M12 7v2" /><path d="M9 11h6" /></svg>
      );
    default:
      return (
        <svg {...common}><circle cx="12" cy="12" r="10" /><path d="M12 16v-4" /><path d="M12 8h.01" /></svg>
      );
  }
};

// ------------------------------------------------------------------
// Props
// ------------------------------------------------------------------
interface RolePermissionsProps {
  formPermissions: string[];
  setFormPermissions: React.Dispatch<React.SetStateAction<string[]>>;
  permissions: Permission[];
}

// ------------------------------------------------------------------
// Main
// ------------------------------------------------------------------
const RolePermissions: React.FC<RolePermissionsProps> = ({ formPermissions, setFormPermissions, permissions }) => {
  const [configureArea, setConfigureArea] = useState<PermissionArea | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [importSelection, setImportSelection] = useState<Set<string>>(new Set());
  const [importSearch, setImportSearch] = useState('');
  // per-key scope map: key -> 'OWN' | 'ALL' for each checked permission
  const [keyScopes, setKeyScopes] = useState<Record<string, 'OWN' | 'ALL'>>({});

  const permByKey = useMemo(() => {
    const m = new Map<string, Permission>();
    for (const p of permissions) m.set(p.key, p);
    return m;
  }, [permissions]);

  const areaByKey = useMemo(() => {
    const m = new Map<string, PermissionArea>();
    for (const a of PERMISSION_AREAS) for (const k of groupKeySet(a)) m.set(k, a);
    return m;
  }, []);

  const findAreaForKey = (key: string) => areaByKey.get(key);

  // Selected = any group where at least one of its keys is in formPermissions
  const selectedGroups = useMemo(() => {
    return PERMISSION_AREAS.filter((area) => {
      const keys = groupKeySet(area);
      for (const k of keys) if (formPermissions.includes(k)) return true;
      return false;
    });
  }, [formPermissions]);

  const availableGroups = useMemo(() => {
    const q = importSearch.trim().toLowerCase();
    let list = PERMISSION_AREAS.filter((a) => !selectedGroups.includes(a));
    if (q) list = list.filter((a) => a.label.toLowerCase().includes(q) || (a.umbrella || '').toLowerCase().includes(q));
    return list;
  }, [selectedGroups, importSearch]);

  // Keep keyScopes in sync when formPermissions changes externally (e.g. role load or import)
  // For any checked key without an entry, default to current area global scope (ALL if present else OWN else ALL)
  useEffect(() => {
    if (!configureArea) return;
    const area = configureArea;
    const rowsKeys = [
      ...(area.umbrella ? [area.umbrella] : []),
      ...Object.values(area.keys).filter(Boolean) as string[],
      ...(area.extraKeys ?? []),
    ].filter((k) => permByKey.has(k));
    let changed = false;
    const next: Record<string, 'OWN' | 'ALL'> = { ...keyScopes };
    // Determine default from existing global scope if available
    const globalHasAll = formPermissions.includes(area.allKey!);
    const globalHasOwn = formPermissions.includes(area.ownKey!);
    const globalDefault: 'OWN' | 'ALL' = globalHasAll ? 'ALL' : globalHasOwn ? 'OWN' : 'ALL';
    for (const k of rowsKeys) {
      if (formPermissions.includes(k) && !next[k]) {
        next[k] = globalDefault;
        changed = true;
      }
      if (!formPermissions.includes(k) && next[k]) {
        delete next[k];
        changed = true;
      }
    }
    if (changed) setKeyScopes(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [formPermissions, configureArea, permByKey]);

  // helper to sync area OWN/ALL keys in formPermissions from per-key map
  const syncAreaScopesToPermissions = (area: PermissionArea, scopes: Record<string, 'OWN' | 'ALL'>) => {
    const checkedKeys = [
      ...(area.umbrella ? [area.umbrella] : []),
      ...Object.values(area.keys).filter(Boolean) as string[],
      ...(area.extraKeys ?? []),
    ].filter((k) => permByKey.has(k) && formPermissions.includes(k) || scopes[k]); // actually use scopes to know checked
    // But we need to consider currently checked keys (formPermissions) + scopes
    // Simpler: look at scopes entries for this area's keys that are checked
    const areaKeysSet = new Set([
      ...(area.umbrella ? [area.umbrella] : []),
      ...Object.values(area.keys).filter(Boolean) as string[],
      ...(area.extraKeys ?? []),
    ]);
    const values = Object.entries(scopes)
      .filter(([k]) => areaKeysSet.has(k) && formPermissions.includes(k))
      .map(([, v]) => v);
    // If no checked keys, keep existing scopes as is (don't auto-remove)
    // For bulk operations we will have at least one checked key, so values non-empty
    // Derive hasOwn/hasAll
    const hasOwn = values.includes('OWN');
    const hasAll = values.includes('ALL');
    setFormPermissions((f) => {
      let next = [...f];
      // Remove existing scopes for this area first
      next = next.filter((k) => k !== area.ownKey && k !== area.allKey);
      if (values.length === 0) {
        // No checked keys: keep no scopes (group will be removed anyway) – but if area still has checked keys via f, fallback to global
        // Instead, if there are checked keys but no scopes (should not happen), default to ALL
        const hasChecked = [...areaKeysSet].some((k) => f.includes(k));
        if (hasChecked) {
          // default to ALL
          if (area.allKey && !next.includes(area.allKey)) next.push(area.allKey);
        }
        return next;
      }
      if (hasOwn && area.ownKey && !next.includes(area.ownKey)) next.push(area.ownKey);
      if (hasAll && area.allKey && !next.includes(area.allKey)) next.push(area.allKey);
      // Ensure at least one verb remains if we added scopes but somehow no verb – handled elsewhere
      return next;
    });
  };

  // ---- permission mutators ----
  const togglePerm = (key: string) => {
    const area = findAreaForKey(key);
    const isRemoving = formPermissions.includes(key);
    if (isRemoving) {
      setKeyScopes((prev) => {
        const n = { ...prev };
        delete n[key];
        // after removal, sync scopes
        if (area) {
          // defer sync to next tick? we can sync after state update via effect, but do inline
          // we need to compute new scopes without this key
          setTimeout(() => syncAreaScopesToPermissions(area, n), 0);
        }
        return n;
      });
    } else {
      // adding
      const defaultScope: 'OWN' | 'ALL' =
        keyScopes[key] ?? (formPermissions.includes(area?.allKey!) ? 'ALL' : formPermissions.includes(area?.ownKey!) ? 'OWN' : 'ALL');
      setKeyScopes((prev) => {
        const n = { ...prev, [key]: defaultScope };
        if (area) setTimeout(() => syncAreaScopesToPermissions(area, n), 0);
        return n;
      });
    }
    setFormPermissions((f) => {
      const has = f.includes(key);
      if (has) return f.filter((p) => p !== key);
      const next = [...f, key];
      if (area?.umbrella && !next.includes(area.umbrella)) next.push(area.umbrella);
      // ensure a scope is present – default to ALL when first verb of area is enabled
      if (area?.ownKey && area?.allKey && !next.includes(area.ownKey) && !next.includes(area.allKey)) {
        next.push(area.allKey);
        // also set per-key scope to ALL for this key if not set
        setKeyScopes((prev) => ({ ...prev, [key]: prev[key] ?? 'ALL' }));
      }
      return next;
    });
  };

  const toggleGroup = (area: PermissionArea, enable: boolean) => {
    setFormPermissions((f) => {
      const groupKeys = groupKeySet(area);
      if (enable) {
        const merged = new Set(f);
        groupKeys.forEach((k) => merged.add(k));
        return Array.from(merged);
      }
      return f.filter((p) => !groupKeys.has(p));
    });
    // also manage keyScopes for this area
    if (enable) {
      setKeyScopes((prev) => {
        const n = { ...prev };
        const keys = [
          ...(area.umbrella ? [area.umbrella] : []),
          ...Object.values(area.keys).filter(Boolean) as string[],
          ...(area.extraKeys ?? []),
        ].filter((k) => permByKey.has(k));
        for (const k of keys) if (!n[k]) n[k] = 'ALL';
        return n;
      });
    } else {
      setKeyScopes((prev) => {
        const n = { ...prev };
        for (const k of groupKeySet(area)) delete n[k];
        return n;
      });
    }
  };

  const handleRemoveGroup = (area: PermissionArea) => {
    toggleGroup(area, false);
    if (configureArea?.label === area.label) setConfigureArea(null);
  };

  const handlePerKeyScopeChange = (area: PermissionArea, key: string, scope: 'OWN' | 'ALL') => {
    setKeyScopes((prev) => {
      const n = { ...prev, [key]: scope };
      syncAreaScopesToPermissions(area, n);
      return n;
    });
  };

  const handleBulkScope = (area: PermissionArea, scope: 'OWN' | 'ALL') => {
    // set all checked keys in this area to scope
    const keys = [
      ...(area.umbrella ? [area.umbrella] : []),
      ...Object.values(area.keys).filter(Boolean) as string[],
      ...(area.extraKeys ?? []),
    ].filter((k) => permByKey.has(k) && formPermissions.includes(k));
    setKeyScopes((prev) => {
      const n = { ...prev };
      for (const k of keys) n[k] = scope;
      syncAreaScopesToPermissions(area, n);
      return n;
    });
    // also ensure formPermissions has correct global scope immediately (optimistic)
    setFormPermissions((f) => {
      let next = f.filter((k) => k !== area.ownKey && k !== area.allKey);
      if (scope === 'OWN' && area.ownKey) next.push(area.ownKey);
      if (scope === 'ALL' && area.allKey) next.push(area.allKey);
      // ensure umbrella stays
      if (area.umbrella && !next.includes(area.umbrella) && keys.length > 0) next.push(area.umbrella);
      return next;
    });
  };

  const getBulkStatus = (area: PermissionArea): 'OWN' | 'ALL' | 'SUITABLE' | 'NONE' => {
    const keys = [
      ...(area.umbrella ? [area.umbrella] : []),
      ...Object.values(area.keys).filter(Boolean) as string[],
      ...(area.extraKeys ?? []),
    ].filter((k) => permByKey.has(k) && formPermissions.includes(k));
    if (keys.length === 0) return 'NONE';
    const vals = keys.map((k) => keyScopes[k] ?? (formPermissions.includes(area.allKey!) ? 'ALL' : formPermissions.includes(area.ownKey!) ? 'OWN' : 'ALL'));
    const hasOwn = vals.includes('OWN');
    const hasAll = vals.includes('ALL');
    if (hasOwn && hasAll) return 'SUITABLE';
    if (hasOwn) return 'OWN';
    return 'ALL';
  };

  const toggleImportSelection = (label: string) => {
    setImportSelection((prev) => {
      const next = new Set(prev);
      if (next.has(label)) next.delete(label);
      else next.add(label);
      return next;
    });
  };

  const handleConfirmImport = () => {
    if (importSelection.size === 0) return;
    const newScopes: Record<string, 'OWN' | 'ALL'> = {};
    setFormPermissions((f) => {
      const merged = new Set(f);
      for (const label of importSelection) {
        const area = PERMISSION_AREAS.find((a) => a.label === label);
        if (!area) continue;
        for (const k of groupKeySet(area)) merged.add(k);
        // prepare scopes for imported area's keys
        const keys = [
          ...(area.umbrella ? [area.umbrella] : []),
          ...Object.values(area.keys).filter(Boolean) as string[],
          ...(area.extraKeys ?? []),
        ].filter((k) => permByKey.has(k));
        for (const k of keys) newScopes[k] = 'ALL';
      }
      return Array.from(merged);
    });
    setKeyScopes((prev) => ({ ...prev, ...newScopes }));
    setImportSelection(new Set());
    setImportOpen(false);
    setImportSearch('');
  };

  const closeImport = () => {
    setImportOpen(false);
    setImportSelection(new Set());
    setImportSearch('');
  };

  // ---- configure subpage rows ----
  const configRows = useMemo(() => {
    if (!configureArea) return [];
    const rows: Array<{ key: string; perm?: Permission; label: string; description: string; isView?: boolean }> = [];
    // umbrella first
    if (configureArea.umbrella) {
      const p = permByKey.get(configureArea.umbrella);
      rows.push({
        key: configureArea.umbrella,
        perm: p,
        label: 'Umbrella',
        description: p?.description ?? `Full access to ${configureArea.label}`,
      });
    }
    for (const action of ALL_ACTIONS) {
      const k = configureArea.keys[action];
      if (!k) continue;
      const p = permByKey.get(k);
      if (!p) continue;
      rows.push({ key: k, perm: p, label: action, description: p.description, isView: action === 'VIEW' });
    }
    for (const k of configureArea.extraKeys ?? []) {
      const p = permByKey.get(k);
      if (!p) continue;
      rows.push({ key: k, perm: p, label: k, description: p.description });
    }
    return rows;
  }, [configureArea, permByKey]);

  // ---- render configure subpage ----
  if (configureArea) {
    const bulk = getBulkStatus(configureArea);
    return (
      <div className="space-y-4">
        {/* Subpage header: left Back, right [SVG][Group Name] */}
        <div className="flex items-center justify-between gap-3 pb-2 border-b border-white/10">
          <button
            type="button"
            onClick={() => setConfigureArea(null)}
            className="inline-flex items-center gap-1.5 text-xs font-medium text-gray-300 hover:text-white transition-colors px-2 py-1 rounded-md border border-white/10 bg-white/[0.04] hover:bg-white/10"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-3.5 h-3.5">
              <path d="M19 12H5" /><path d="M12 19l-7-7 7-7" />
            </svg>
            Back
          </button>
          <div className="flex items-center gap-2 shrink-0">
            <div className="w-8 h-8 rounded-lg bg-white/5 border border-white/10 flex items-center justify-center text-indigo-300">
              <GroupIcon label={configureArea.label} size={18} />
            </div>
            <span className="text-sm font-semibold text-white tracking-tight">{configureArea.label}</span>
            {configureArea.umbrella && (
              <span className="hidden sm:inline text-[10px] font-mono text-indigo-300/70 border border-indigo-500/20 bg-indigo-500/10 px-1.5 py-0.5 rounded">
                {configureArea.umbrella}
              </span>
            )}
          </div>
        </div>

        <div className="space-y-2">
          <p className="text-xs text-gray-400">
            Toggle the verbs for <span className="text-gray-200 font-medium">{configureArea.label}</span>. When a verb is enabled you can choose its scope — <span className="text-white">Own</span> (only resources you own) or <span className="text-white">All</span> (any resource).
          </p>

          {configRows.length === 0 ? (
            <div className="text-center py-8 text-sm text-gray-500 border border-dashed border-white/10 rounded-lg">No configurable keys for this group.</div>
          ) : (
            <div className="space-y-2">
              {configRows.map((row) => {
                const checked = formPermissions.includes(row.key);
                const perKeyVal: 'OWN' | 'ALL' = keyScopes[row.key] ?? (formPermissions.includes(configureArea.allKey!) ? 'ALL' : formPermissions.includes(configureArea.ownKey!) ? 'OWN' : 'ALL');
                return (
                  <div
                    key={row.key}
                    className={`group flex items-start gap-3 p-3 rounded-xl border transition-colors ${
                      checked ? 'bg-white/[0.04] border-white/10 hover:border-white/15' : 'bg-black/20 border-white/5 hover:border-white/10'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => togglePerm(row.key)}
                      className="mt-1 accent-indigo-500 w-4 h-4 shrink-0"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={`text-sm font-medium ${checked ? 'text-white' : 'text-gray-300'}`}>{row.key}</span>
                        {row.isView && checked && (
                          <span className="text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded bg-amber-900/30 text-amber-300 border border-amber-700/40">controls scope</span>
                        )}
                      </div>
                      <div className="text-xs text-gray-400 mt-0.5 leading-relaxed">{row.description}</div>
                    </div>

                    {/* Scope dropdown – visible when this row's checkbox is on. Every row shows Own/All per spec "in all keys show Own All"; VIEW row is highlighted via spec but behavior is uniform. */}
                    {checked && configureArea.ownKey && configureArea.allKey && (
                      <div className="shrink-0 ml-auto flex flex-col items-end gap-1">
                        <label className="text-[10px] uppercase tracking-wide text-gray-500">Scope</label>
                        <select
                          value={perKeyVal}
                          onChange={(e) => handlePerKeyScopeChange(configureArea, row.key, e.target.value as 'OWN' | 'ALL')}
                          className="text-xs bg-black/40 border border-white/10 rounded-md px-2 py-1.5 text-white focus:outline-none focus:ring-2 focus:ring-white/20 focus:border-white/20 min-w-[5.5rem]"
                        >
                          <option value="OWN">Own</option>
                          <option value="ALL">All</option>
                        </select>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* Bottom bulk scope control – [Own][Suitable][All] */}
          {configureArea.ownKey && configureArea.allKey && (
            <div className="pt-3 mt-3 border-t border-white/10 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <span className="text-xs text-gray-500">
                {bulk === 'SUITABLE' ? (
                  <>
                    Mixed scope for <span className="text-gray-300">{configureArea.label}</span>: <span className="text-white font-medium">some Own, some All</span>
                  </>
                ) : bulk === 'OWN' ? (
                  <>
                    Current scope for <span className="text-gray-300">{configureArea.label}</span>: <span className="text-white font-medium">Own only</span>
                  </>
                ) : bulk === 'ALL' ? (
                  <>
                    Current scope for <span className="text-gray-300">{configureArea.label}</span>: <span className="text-white font-medium">All</span>
                  </>
                ) : (
                  <span className="text-white font-medium">No verbs selected</span>
                )}
              </span>
              <div className="inline-flex rounded-lg overflow-hidden border border-white/10 text-xs self-start sm:self-auto">
                <button
                  type="button"
                  onClick={() => handleBulkScope(configureArea, 'OWN')}
                  className={`px-3 py-1.5 transition-colors ${bulk === 'OWN' ? 'bg-white text-black' : 'bg-white/5 text-gray-300 hover:bg-white/10'}`}
                >
                  Own
                </button>
                <button
                  type="button"
                  className={`px-3 py-1.5 border-l border-r border-white/10 transition-colors ${bulk === 'SUITABLE' ? 'bg-amber-500 text-black' : 'bg-white/5 text-gray-500 cursor-default'}`}
                  title={bulk === 'SUITABLE' ? 'Mixed — some verbs Own, some All' : 'Shows as Suitable when some verbs are Own and some All'}
                  aria-pressed={bulk === 'SUITABLE'}
                >
                  Suitable
                </button>
                <button
                  type="button"
                  onClick={() => handleBulkScope(configureArea, 'ALL')}
                  className={`px-3 py-1.5 transition-colors ${bulk === 'ALL' ? 'bg-white text-black' : 'bg-white/5 text-gray-300 hover:bg-white/10'}`}
                >
                  All
                </button>
              </div>
            </div>
          )}
          <p className="text-[11px] text-gray-500">
            Click <span className="text-gray-300">Own</span> to set all checked verbs to Own, <span className="text-gray-300">All</span> to set all to All. <span className="text-gray-300">Suitable</span> lights up when some verbs are Own and some All.
          </p>
        </div>
      </div>
    );
  }

  // ---- main list view ----
  return (
    <div className="ks-card ks-form-card rounded-md space-y-3">
      {/* Header with title + import button top-right */}
      <div className="flex items-center justify-between gap-3">
        <div>
          <h4 className="text-sm font-semibold text-white tracking-tight">Permissions</h4>
          <p className="text-xs text-gray-400 mt-0.5">
            Groups only — import a group, then configure its verbs and scope.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setImportOpen(true)}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-white text-black hover:bg-gray-200 transition-colors shrink-0"
          aria-label="Import permission groups"
        >
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-3.5 h-3.5">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" />
          </svg>
          Import
        </button>
      </div>

      {/* Selected groups list */}
      <div className="border border-white/10 rounded-xl p-3 bg-black/20 space-y-2 min-h-[120px]">
        {selectedGroups.length === 0 ? (
          <div className="text-center py-10">
            <div className="mx-auto w-10 h-10 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center text-gray-500 mb-3">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
                <rect x="3" y="3" width="18" height="18" rx="2" /><line x1="12" y1="8" x2="12" y2="16" /><line x1="8" y1="12" x2="16" y2="12" />
              </svg>
            </div>
            <p className="text-sm text-gray-400">No permission groups added yet.</p>
            <p className="text-xs text-gray-500 mt-1">Click <span className="text-white font-medium">Import</span> top-right to add a group.</p>
          </div>
        ) : (
          <div className="grid gap-2">
            {selectedGroups.map((area) => {
              const keys = groupKeySet(area);
              const activeCount = [...keys].filter((k) => formPermissions.includes(k)).length;
              const totalCount = [...keys].filter((k) => permByKey.has(k)).length;
              return (
                <div
                  key={area.label}
                  className="ks-card glass-card rounded-xl flex items-center gap-3 px-3 py-3 border border-white/10 hover:border-white/20 transition-colors bg-white/[0.03]"
                >
                  {/* Left: [SVG] [Name] */}
                  <div className="w-9 h-9 rounded-lg bg-white/5 border border-white/10 flex items-center justify-center text-indigo-300 shrink-0">
                    <GroupIcon label={area.label} size={18} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-semibold text-white truncate">{area.label}</span>
                      <span className="text-[11px] text-gray-400 font-mono">
                        {activeCount}/{totalCount} keys
                      </span>
                    </div>
                    {area.umbrella && (
                      <span className="text-[11px] font-mono text-indigo-300/60 truncate hidden sm:inline">{area.umbrella}</span>
                    )}
                  </div>

                  {/* Right: remove, configure as SVG only */}
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      type="button"
                      onClick={() => setConfigureArea(area)}
                      aria-label={`Configure ${area.label}`}
                      title="Configure"
                      className="w-8 h-8 rounded-lg border border-white/10 bg-white/[0.04] hover:bg-white/10 text-gray-300 hover:text-white flex items-center justify-center transition-colors"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
                        <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.38a2 2 0 0 0-.73-2.73l-.15-.1a2 2 0 0 1-1-1.72v-.51a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
                        <circle cx="12" cy="12" r="3" />
                      </svg>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleRemoveGroup(area)}
                      aria-label={`Remove ${area.label}`}
                      title="Remove"
                      className="w-8 h-8 rounded-lg border border-white/10 bg-white/[0.04] hover:bg-red-500/10 text-gray-400 hover:text-red-400 flex items-center justify-center transition-colors"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
                        <polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                      </svg>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <p className="text-[11px] text-gray-500">
        Tip: <span className="text-gray-400">Configure</span> opens the group’s verbs. Checking <span className="text-gray-400">VIEW</span> reveals the <span className="text-gray-300">Own / All</span> scope selector — every enabled key shows the same selector. Bulk <span className="text-white">Own/All</span> at bottom sets all.
      </p>

      {/* Import modal – groups only */}
      <Modal open={importOpen} onClose={closeImport} title="Import permission groups" maxWidth="max-w-xl">
        <div className="space-y-4">
          <input
            type="text"
            value={importSearch}
            onChange={(e) => setImportSearch(e.target.value)}
            placeholder="Search groups (Users, Nodes, Templates…)"
            className="w-full bg-black/30 backdrop-blur-md text-white placeholder-gray-500 border border-white/10 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-white/60 focus:border-white/40 transition-colors"
            autoFocus
          />

          <div className="border border-white/10 rounded-lg overflow-hidden max-h-[50vh] overflow-y-auto divide-y divide-white/5 bg-black/20">
            {availableGroups.length === 0 ? (
              <div className="px-4 py-8 text-center text-sm text-gray-500">
                {PERMISSION_AREAS.length === selectedGroups.length ? 'All groups already imported.' : 'No groups match your search.'}
              </div>
            ) : (
              availableGroups.map((area) => {
                const isSelected = importSelection.has(area.label);
                const keyCount = [...groupKeySet(area)].filter((k) => permByKey.has(k)).length;
                return (
                  <button
                    key={area.label}
                    type="button"
                    onClick={() => toggleImportSelection(area.label)}
                    className={`w-full px-4 py-3 flex items-center gap-3 text-left transition-colors ${
                      isSelected ? 'bg-indigo-900/20 border-l-2 border-indigo-500' : 'hover:bg-white/5'
                    }`}
                    aria-pressed={isSelected}
                  >
                    <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 border ${isSelected ? 'bg-indigo-900/40 border-indigo-700/60 text-indigo-300' : 'bg-white/5 border-white/10 text-gray-400'}`}>
                      <GroupIcon label={area.label} size={18} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm text-white truncate">{area.label}</span>
                        <span className="text-[11px] px-1.5 py-0.5 rounded bg-white/5 border border-white/10 text-gray-400 font-mono">{keyCount} keys</span>
                      </div>
                      <span className="text-[11px] font-mono text-gray-500 truncate block mt-0.5">{area.umbrella || Object.values(area.keys)[0] || ''}</span>
                    </div>
                    <div className="shrink-0 flex items-center gap-2">
                      <span className={`text-xs px-2 py-1 rounded border transition-colors ${isSelected ? 'bg-indigo-600/30 border-indigo-500 text-indigo-200' : 'border-white/10 text-gray-400'}`}>
                        {isSelected ? 'Selected' : 'Select'}
                      </span>
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={`w-5 h-5 ${isSelected ? 'text-indigo-400' : 'text-gray-500'}`}>
                        {isSelected ? <path d="M20 6L9 17l-5-5" strokeLinecap="round" strokeLinejoin="round" /> : <circle cx="12" cy="12" r="10" />}
                      </svg>
                    </div>
                  </button>
                );
              })
            )}
          </div>

          <div className="flex items-center justify-between gap-3 pt-2 border-t border-white/10">
            <span className="text-xs text-gray-500">{importSelection.size === 0 ? 'Select groups to import' : `${importSelection.size} group${importSelection.size > 1 ? 's' : ''} selected`}</span>
            <div className="flex items-center gap-2">
              <button type="button" onClick={closeImport} className="px-4 py-2 text-sm border border-white/10 text-gray-300 rounded hover:bg-white/5 transition-colors">
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmImport}
                disabled={importSelection.size === 0}
                className="px-4 py-2 text-sm bg-white text-black rounded hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {importSelection.size === 0 ? 'Select groups' : `Import ${importSelection.size} group${importSelection.size > 1 ? 's' : ''}`}
              </button>
            </div>
          </div>
        </div>
      </Modal>
    </div>
  );
};

export default RolePermissions;
