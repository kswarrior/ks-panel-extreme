import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useLocation, matchPath } from 'react-router-dom';
import { resolveInstanceNav, ResolvedNavEntry } from '@/shared/utils/instancePages';

// InstanceNavContext carries the resolved sidebar nav for the currently
// active /instances/:id/ route. The Sidebar is mounted far up the tree so
// it can't fetch template state itself without an extra round-trip per nav
// hover; instead the InstanceDetail shell pushes the resolved entries
// here whenever the route changes.
//
// PAGES ARE PER-INSTANCE: the nav is resolved from the INSTANCE's own
// config (the deploy-time snapshot of the merged spec — template spec +
// per-deploy page overrides), NOT from the live template. That way a user
// who adds/removes/renames pages in the deploy form sees exactly those
// pages on their instance, and later template edits don't mutate already
// deployed instances.
interface InstanceNavContextValue {
  nav: ResolvedNavEntry[];
  instanceId: number | null;
  setActiveInstance: (id: number | null, spec: Record<string, any> | null) => void;
}

const Ctx = createContext<InstanceNavContextValue>({
  nav: [],
  instanceId: null,
  setActiveInstance: () => {},
});

export const InstanceNavProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [instanceId, setInstanceId] = useState<number | null>(null);
  const [spec, setSpec] = useState<Record<string, any> | null>(null);

  // setActiveInstance must be referentially stable: it's a dependency of the
  // useInstanceNavSync effect and the provider re-renders whenever the spec
  // updates. A fresh function identity here would re-trigger consumers'
  // effects on every provider render, which — combined with a freshly-parsed
  // spec object — drove an infinite render loop ("Too many re-renders") that
  // blanked the whole app the moment an instance's pages loaded.
  const setActiveInstance = useCallback((id: number | null, s: Record<string, any> | null) => {
    setInstanceId(id);
    setSpec(s);
  }, []);

  const nav = useMemo<ResolvedNavEntry[]>(() => {
    if (instanceId == null) return [];
    return resolveInstanceNav(spec);
  }, [instanceId, spec]);

  return (
    <Ctx.Provider value={{ nav, instanceId, setActiveInstance }}>
      {children}
    </Ctx.Provider>
  );
};

export const useInstanceNav = (): InstanceNavContextValue => useContext(Ctx);

// useInstanceNavSync is a no-render hook that the InstanceDetail shell
// calls so the provider learns about the current route. It's deliberately
// separate from InstanceNavProvider so consumers that don't need
// /instances/:id/* (e.g. login) don't pay the template-fetch cost.
// `spec` is the parsed instance config (parseConfig(instance.config)).
export const useInstanceNavSync = (instanceId: number | null, spec: Record<string, any> | null): void => {
  const { setActiveInstance } = useContext(Ctx);
  const location = useLocation();
  useEffect(() => {
    const m = matchPath('/instances/:id/*', location.pathname);
    const activeId = m && instanceId != null ? instanceId : null;
    setActiveInstance(activeId, activeId != null ? spec : null);
  }, [location.pathname, instanceId, spec, setActiveInstance]);
};
