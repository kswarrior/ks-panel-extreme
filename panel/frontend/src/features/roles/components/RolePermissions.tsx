import React, { useMemo, useRef, useEffect } from 'react';
import GlassField from '@/shared/components/ui/Field';
import type { PermissionArea } from '@/shared/types/permissions';
import type { Permission } from '@/shared/types/user';
import { ALL_ACTIONS, AREA_PERM_KEYS, PERMISSION_AREAS } from '@/shared/types/permissions';

interface RolePermissionsProps {
  formPermissions: string[];
  setFormPermissions: React.Dispatch<React.SetStateAction<string[]>>;
  permissions: Permission[];
}

function groupKeySet(area: PermissionArea): Set<string> {
  const s = new Set<string>();
  if (area.umbrella) s.add(area.umbrella);
  for (const k of Object.values(area.keys)) if (k) s.add(k);
  for (const k of area.extraKeys ?? []) s.add(k);
  return s;
}

const useIndeterminate = (indeterminate: boolean) => {
  const ref = useRef<HTMLInputElement | null>(null);
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = indeterminate;
  }, [indeterminate]);
  return ref;
};

const AreaGroupCard: React.FC<{
  area: PermissionArea;
  umbrellaPerm: Permission | undefined;
  subRows: Permission[];
  allOn: boolean;
  someOn: boolean;
  selected: string[];
  onToggleGroup: (enable: boolean) => void;
  onTogglePerm: (key: string) => void;
}> = ({ area, umbrellaPerm, subRows, allOn, someOn, selected, onToggleGroup, onTogglePerm }) => {
  const parentRef = useIndeterminate(someOn);
  return (
    <div className="rounded bg-indigo-500/10 border border-indigo-400/30 px-2 py-2" style={{ boxShadow: 'none' }}>
      <label className="flex items-start gap-2 cursor-pointer">
        <input
          type="checkbox"
          ref={parentRef}
          checked={allOn}
          onChange={(e) => onToggleGroup(e.target.checked)}
          className="mt-0.5 accent-indigo-400"
        />
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-indigo-100">{area.label}</span>
            <span className="text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded bg-indigo-900/60 text-indigo-200 border border-indigo-700/60">
              group
            </span>
            {area.umbrella && (
              <span className="text-[10px] font-mono text-indigo-300/70 truncate">{area.umbrella}</span>
            )}
          </div>
          <div className="text-xs text-gray-400 mt-0.5">
            {umbrellaPerm?.description ?? `Manage ${area.label.toLowerCase()} (umbrella + granular verbs).`}
          </div>
        </div>
      </label>
      <div className="mt-2 space-y-1.5">
        {subRows.map((p) => (
          <label
            key={p.key}
            className="flex items-start gap-2 ml-auto pl-4 pr-2 py-1.5 rounded hover:bg-white/5 cursor-pointer w-full sm:w-[60%] min-w-[14rem]"
          >
            <input
              type="checkbox"
              checked={selected.includes(p.key)}
              onChange={() => onTogglePerm(p.key)}
              className="mt-0.5 accent-indigo-400"
            />
            <div className="flex-1">
              <div className="text-sm font-medium text-white">{p.key}</div>
              <div className="text-xs text-gray-400">{p.description}</div>
            </div>          </label>
        ))}
      </div>
    </div>
  );
};

const FlatPermRow: React.FC<{ p: Permission; checked: boolean; onToggle: () => void }> = ({ p, checked, onToggle }) => (
  <label className="flex items-start gap-2 px-2 py-1.5 rounded hover:bg-white/5 cursor-pointer">
    <input
      type="checkbox"
      checked={checked}
      onChange={onToggle}
      className="mt-0.5 accent-white"
    />
    <div className="flex-1">
      <div className="text-sm font-medium text-white">{p.key}</div>
      <div className="text-xs text-gray-400">{p.description}</div>
    </div>
  </label>
);

const RolePermissions: React.FC<RolePermissionsProps> = ({
  formPermissions,
  setFormPermissions,
  permissions,
}) => {
  const areaByKey = useMemo(() => {
    const m = new Map<string, PermissionArea>();
    for (const a of PERMISSION_AREAS) {
      for (const k of groupKeySet(a)) m.set(k, a);
    }
    return m;
  }, []);

  const findAreaForKey = (key: string): PermissionArea | undefined => areaByKey.get(key);

  const togglePerm = (key: string) => {
    setFormPermissions((f) => {
      const has = f.includes(key);
      if (has) {
        return f.filter((p) => p !== key);
      }
      const next = [...f, key];
      const area = findAreaForKey(key);
      if (area && area.umbrella && !next.includes(area.umbrella)) {
        next.push(area.umbrella);
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
  };

  const permByKey = useMemo(() => {
    const m = new Map<string, Permission>();
    for (const p of permissions) m.set(p.key, p);
    return m;
  }, [permissions]);

  const restPerms = useMemo(
    () => permissions.filter((p) => !AREA_PERM_KEYS.has(p.key)),
    [permissions],
  );

  return (
    <GlassField label="Permissions" htmlFor="perms">
      <div className="space-y-1.5 border border-white/10 rounded-md p-3 max-h-96 overflow-y-auto">
        {PERMISSION_AREAS.map((area) => {
          const umbrellaPerm = area.umbrella ? permByKey.get(area.umbrella) : undefined;
          const groupKeys = groupKeySet(area);
          const present = [...groupKeys].some((k) => permByKey.has(k));
          if (!present) return null;

          const allOn = [...groupKeys].every((k) => formPermissions.includes(k));
          const someOn = !allOn && [...groupKeys].some((k) => formPermissions.includes(k));

          const subRows: Permission[] = [];
          for (const action of ALL_ACTIONS) {
            const k = area.keys[action];
            if (!k) continue;
            const p = permByKey.get(k);
            if (p) subRows.push(p);
          }
          for (const k of area.extraKeys ?? []) {
            const p = permByKey.get(k);
            if (p) subRows.push(p);
          }

          return (
            <AreaGroupCard
              key={area.label}
              area={area}
              umbrellaPerm={umbrellaPerm}
              subRows={subRows}
              allOn={allOn}
              someOn={someOn}
              selected={formPermissions}
              onToggleGroup={(en) => toggleGroup(area, en)}
              onTogglePerm={togglePerm}
            />
          );
        })}

        {restPerms.length > 0 && (
          <div className="pt-2 mt-2 border-t border-white/10 space-y-1">
            {restPerms.map((p) => (
              <FlatPermRow key={p.key} p={p} checked={formPermissions.includes(p.key)} onToggle={() => togglePerm(p.key)} />
            ))}
          </div>
        )}
      </div>
    </GlassField>
  );
};

export default RolePermissions;