import React from 'react';
import {
  useThemeStore,
  scopeForArea,
  scopeForPage,
  type Scope,
} from '@/shared/stores/themeStore';
import { AREAS, STANDALONE_PAGES } from '@/features/instance-pages/types/pageregistry';
import type { Theme } from '@/features/themes/types/theme';
import type { RichMenuItem } from '@/shared/components/ui/RichMenu';

// ------------------------------------------------------------------
//  useThemeAssignItems
// ------------------------------------------------------------------
//  Builds the RichMenuItem[] that the Themes page renders into its
//  "Apply to…" dropdown for a given theme. Every row maps onto a
//  scope assignment in the themeStore: rows under an area belong to
//  `area:<id>` / `page:<id>` keys, and a "[✓] Whole <area>" checkbox
//  toggles the area-default assignment. The "Whole area → pages"
//  rows are visible directly (no submenu) for fast scanning, while
//  less-frequent actions live below a submenu.
//
//  Layout (single menu, flush from top):
//    [✓] Whole admin                       (area checkbox)
//      [✓] Users                           (page checkbox, indented)
//      [✓] Roles                           (page checkbox, indented)
//      [✓] API keys                        (page checkbox, indented)
//      …
//    [✓] Whole instance
//      [✓] Panel                           (page)
//      [✓] Networks                        (page)
//      …
//    ------------------------------------- (separator)
//    Apply whole panel in one click  →      (submenu)
//      [✓] Activate everywhere                (sets every area)
//      [✓] Clear everywhere                   (unsets every area + page)
//    ------------------------------------- (separator)
//    View: All areas                        (submenu, pick filter:
//      Whole admin / Whole instance / Whole auth )
//  (the latter submenu is a useful example of submenu-on-submenu)
//
//  Returning a builder hook (not a component) keeps Themes.tsx
//  driving RichMenu directly via `trigger`, so RichMenu owns ALL
//  the portal + placement + scrim + escape logic, and the
//  ApplytoMenuPortal hack goes away.

export interface AssignItemsResult {
  items: RichMenuItem[];
  onToggle: (key: string, next: boolean) => void;
}

export function useThemeAssignItems(theme: Theme): AssignItemsResult {
  const assignments = useThemeStore((s) => s.assignments);
  const globalAssignments = useThemeStore((s) => s.globalAssignments);
  const assignTheme = useThemeStore((s) => s.assignTheme);
  const unassignTheme = useThemeStore((s) => s.unassignTheme);

  // Merge the LOCAL (this user's localStorage) + GLOBAL (server, admin-set)
  // assignment maps into a single lookup so the checkbox rows reflect BOTH
  // layers of the resolver. A Global theme not present in this user's local
  // list is only visible via globalAssignments — without the merge its rows
  // would read "unchecked" forever even after a successful PUT, which looked
  // like "global theme not working". Local wins on conflict (matching the
  // resolver precedence local > global > default).
  const bindings: Partial<Record<Scope, string>> = React.useMemo(() => {
    const out: Partial<Record<Scope, string>> = {};
    for (const [scope, id] of Object.entries(globalAssignments)) {
      if (id && typeof scope === 'string') (out as any)[scope] = id;
    }
    for (const [scope, id] of Object.entries(assignments)) {
      if (id && typeof scope === 'string') (out as any)[scope] = id;
    }
    return out;
  }, [assignments, globalAssignments]);

  // Build the items memoised on theme + the merged assignment map changes.
  const items = React.useMemo<RichMenuItem[]>(() => {
    const out: RichMenuItem[] = [];

    for (const area of AREAS) {
      const areaScope = scopeForArea(area.id);
      const areaOn = bindings[areaScope] === theme.id;
      // Area-level row is a checkbox — toggle binds/unbinds the WHOLE area.
      out.push({
        kind: 'checkbox',
        key: areaScope,
        label: `Whole ${area.label}`,
        checked: areaOn,
        hint: areaOn
          ? `Default theme for every page below unless overridden`
          : `Click to apply ${theme.name} across this area`,
      });
      // Each page becomes an indented checkbox row. The hint also
      // distinguishes "set directly" vs "inherited from area" so the
      // user knows what toggling will do.
      for (const p of area.pages) {
        const scope = scopeForPage(p.id);
        const direct = bindings[scope] === theme.id;
        const inherited = areaOn && !direct;
        out.push({
          kind: 'checkbox',
          key: scope,
          label: p.label,
          checked: direct || inherited,
          hint: direct
            ? `Set directly for this page`
            : inherited
            ? `Inherited from ${area.label} default`
            : undefined,
        });
      }
    }

    // Standalone pages (Login, Profile, etc.) live outside any area.
    for (const p of STANDALONE_PAGES) {
      const scope = scopeForPage(p.id);
      out.push({
        kind: 'checkbox',
        key: scope,
        label: p.label,
        checked: bindings[scope] === theme.id,
      });
    }

    out.push({ kind: 'separator', key: 'sep-quick' });

    // A submenu of bulk actions — proves RichMenu can nest an
    // arbitrary submenu to two levels deep in this menu. Both rows
    // are checkbox rows (single-select semantics: clicking activates
    // then the row reads "checked" while the panel re-assigns).
    const bulkAssignments: Record<string, boolean> = {};
    const allAreaOn = AREAS.every((a) => bindings[scopeForArea(a.id)] === theme.id);
    bulkAssignments['bulk-all'] = allAreaOn;
    const noneOn =
      AREAS.every((a) => {
        if (bindings[scopeForArea(a.id)] === theme.id) return false;
        return a.pages.every((p) => bindings[scopeForPage(p.id)] !== theme.id);
      }) &&
      STANDALONE_PAGES.every((p) => bindings[scopeForPage(p.id)] !== theme.id);
    bulkAssignments['bulk-none'] = noneOn;

    out.push({
      kind: 'submenu',
      key: 'bulk',
      label: 'Bulk actions…',
      children: [
        {
          kind: 'checkbox',
          key: 'bulk-all',
          label: 'Activate everywhere',
          checked: bulkAssignments['bulk-all'],
          hint: 'Set this theme as the default on every area + page',
        },
        {
          kind: 'checkbox',
          key: 'bulk-none',
          label: 'Remove everywhere',
          checked: bulkAssignments['bulk-none'],
          hint: 'Unset every binding owned by this theme',
        },
      ],
    });

    return out;
  }, [theme, bindings]);

  // onToggle handles every checkbox row in the menu + submenus. Key
  // values are real Scope strings or the bulk-* action keys.
  const onToggle = (key: string, next: boolean) => {
    if (key === 'bulk-all') {
      if (next) {
        for (const a of AREAS) assignTheme(theme.id, scopeForArea(a.id));
        for (const p of STANDALONE_PAGES) assignTheme(theme.id, scopeForPage(p.id));
      }
      return;
    }
    if (key === 'bulk-none') {
      if (next) {
        // Only clear scopes that this theme actually owns — `unassignTheme`
        // is scope-keyed, not theme-keyed, so unconditionally calling it on
        // every scope would clobber bindings that belong to OTHER themes
        // (e.g. another local theme set on `/users`).
        for (const a of AREAS) {
          const s = scopeForArea(a.id);
          if (bindings[s] === theme.id) unassignTheme(s);
          for (const p of a.pages) {
            const ps = scopeForPage(p.id);
            if (bindings[ps] === theme.id) unassignTheme(ps);
          }
        }
        for (const p of STANDALONE_PAGES) {
          const s = scopeForPage(p.id);
          if (bindings[s] === theme.id) unassignTheme(s);
        }
      }
      return;
    }
    // Otherwise treat `key` as a real Scope.
    const scope = key as Scope;
    if (next) assignTheme(theme.id, scope);
    else unassignTheme(scope);
  };

  return { items, onToggle };
}

// ------------------------------------------------------------------
//  RESERVED FOR FUTURE USE
// ------------------------------------------------------------------
// A small no-op default export keeps older imports of
// ThemeAssignMenu that may still exist (the Themes page used to
// mount <ThemeAssignMenu theme={...} onClose={...}/> directly).
// Replace those call sites with the ApplyToMenuPortal "RichMenu"
// wiring already in Themes.tsx.
const ThemeAssignMenu: React.FC<{ theme: Theme; onClose?: () => void }> = ({ onClose }) => {
  React.useEffect(() => {
    // Reflect any legacy onClose wiring cleanly.
    void onClose;
  }, [onClose]);
  return null;
};

export default ThemeAssignMenu;
