import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { fetchSlots } from '@/features/mods/api/mods';
import type {
  KSPluginComponent,
  RegisteredSlot,
  SlotRegistryResponse,
} from '@/shared/types/mod';

// Slot.tsx — Mod Engine v2 React UI slot system.
//
// The panel declares a set of well-known layout injection points scattered
// across the admin shell (e.g. "instance.detail.tabs", "dashboard.sidebar").
// Active mods publish React components for those names through a browser-side
// registry mounted on `window.KS`. This file owns three things:
//
//   1. The window.KS component registry — mods' JS bundles call
//      window.KS.registerComponent(slotName, componentName, ReactComponent)
//      when they load; <Slot /> looks the mapping up by slot name + exported
//      symbol at render time.
//   2. A remote plugin loader — on first <Slot /> mount (or panel boot), we
//      fetch /api/mods/v1/slots to learn which active mods declared slots.
//      When a mod ships a bundle URL (via a future /api/mods/:id/bundle
//      endpoint), the loader dynamically imports it; today it relies on the
//      bundle being pre-loaded so the registry is already populated, which
//      keeps the slot rendering synchronous and SSR-safe.
//   3. The memoized <Slot name="…" context={...} /> component. For each
//      registration matching the slot name it wraps the resolved component in
//      an ErrorBoundary so one crashing mod component never takes the whole
//      layout down (Error Isolation, client-side mirror of the Go contract).
// ---------------------------------------------------------------------------
//
// Why not React.lazy + Suspense: a slot may host several mods at once, and each
// needs independent error isolation. Lazy/Suspense give one error boundary per
// fallback and couple loading to the React tree; our registry + per-component
// ErrorBoundary lets every mod fail (or load) independently while still
// rendering the host layout immediately.

// ---------------------------------------------------------------------------
// window.KS registry
// ---------------------------------------------------------------------------

interface KSWindow {
  __ksComponents: Map<string, KSPluginComponent[]>;
  registerComponent: (this: void, slotName: string, name: string, component: React.ComponentType<any>) => void;
  getComponentsForSlot: (this: void, slotName: string) => KSPluginComponent[];
  __ksReady: boolean;
}

declare global {
  interface Window {
    KS?: KSWindow;
  }
}

// ensureKSRegistry installs the window.KS API if another component or a
// pre-loaded mod bundle hasn't already. Idempotent. We use a Map<string, []>
// (slot name -> registered components) because one slot can host several mods
// at the same location.
function ensureKSRegistry(): KSWindow {
  if (window.KS && window.KS.__ksReady) {
    return window.KS;
  }
  const components = new Map<string, KSPluginComponent[]>();
  const ks: KSWindow = {
    __ksComponents: components,
    __ksReady: true,
    registerComponent(slotName, name, Component) {
      if (!slotName || !name || !Component) return;
      const list = components.get(slotName) ?? [];
      // Replace an existing (mod,name) registration so a hot-reload doesn't
      // double-mount the same component. If the mod label is still empty
      // (set after refreshSlots runs) we preserve the previously-known mod
      // so we don't drop the React key.
      const idx = list.findIndex((c) => c.name === name);
      if (idx >= 0) list[idx] = { ...list[idx], Component };
      else list.push({ mod: '__pending__', name, Component });
      components.set(slotName, list);
    },
    getComponentsForSlot(slotName) {
      return components.get(slotName) ?? [];
    },
  };
  window.KS = ks;
  return ks;
}

// ---------------------------------------------------------------------------
// Slot registry store (module-level cache so every <Slot /> shares one fetch)
// ---------------------------------------------------------------------------

interface RegistryState {
  loaded: boolean;
  loading: Promise<void> | null;
  response: SlotRegistryResponse | null;
  error: Error | null;
}

const registry: RegistryState = {
  loaded: false,
  loading: null,
  response: null,
  error: null,
};

// refreshSlots forces a re-fetch. Call it from a failed-silently background
// poll or after an activate/deactivate so newly-active mods show up without a
// full page reload.
export async function refreshSlots(): Promise<void> {
  try {
    const data = await fetchSlots();
    registry.response = data;
    registry.error = null;
    registry.loaded = true;
    // Augment the registry's mod labels from the slot list so <Slot /> can
    // group instances by owning mod even when the bundle registered under an
    // empty mod string.
    const ks = ensureKSRegistry();
    for (const s of data.slots) {
      const list = ks.__ksComponents.get(s.name) ?? [];
      for (const entry of list) {
        if (!entry.mod) entry.mod = s.mod;
      }
      ks.__ksComponents.set(s.name, list);
    }
  } catch (e) {
    registry.error = e instanceof Error ? e : new Error(String(e));
    registry.loaded = true;
  }
}

// loadSlotsOnce returns a single shared in-flight promise so the first many
// <Slot /> mounts across the layout collapse into one round-trip rather than
// stampeding the slots endpoint.
function loadSlotsOnce(): Promise<void> {
  if (registry.loaded) return Promise.resolve();
  if (registry.loading) return registry.loading;
  registry.loading = refreshSlots().finally(() => {
    registry.loading = null;
  });
  return registry.loading;
}

// Slot hook: subscribes a component to the registry state and forces a
// re-render once the load resolves. Returns the current response (possibly null
// during the first paint) + the error if any.
function useSlotsRegistry(): {
  response: SlotRegistryResponse | null;
  error: Error | null;
  loaded: boolean;
} {
  const [, force] = useState(0);

  useEffect(() => {
    let cancelled = false;
    ensureKSRegistry();
    if (registry.loaded && !registry.loading) {
      return;
    }
    let p = registry.loading;
    if (!p) {
      p = refreshSlots().finally(() => {
        registry.loading = null;
      });
      registry.loading = p;
    }
    void p.then(() => {
      if (!cancelled) force((n) => n + 1);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return {
    response: registry.response,
    error: registry.error,
    loaded: registry.loaded,
  };
}

// ---------------------------------------------------------------------------
// ErrorBoundary — isolates a single mod component's render failure.
// ---------------------------------------------------------------------------

interface SlotErrorBoundaryProps {
  mod: string;
  name: string;
  children: React.ReactNode;
}

interface SlotErrorBoundaryState {
  error: Error | null;
}

class SlotErrorBoundary extends React.Component<
  SlotErrorBoundaryProps,
  SlotErrorBoundaryState
> {
  state: SlotErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): SlotErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo): void {
    // Forward to the console only — the panel's audit log is for admin
    // actions, and a mod rendering bug is a developer-time concern.
    // eslint-disable-next-line no-console
    console.error(
      `[KS Slot] mod "${this.props.mod}" component "${this.props.name}" crashed:`,
      error,
      info.componentStack,
    );
  }

  render(): React.ReactNode {
    if (this.state.error) {
      // Intentionally minimal: a crashed mod must not visually hijack the host
      // layout. Inline-blanking keeps the parent's flex flow intact.
      return null;
    }
    return this.props.children;
  }
}

// ---------------------------------------------------------------------------
// <Slot /> — the public API mods inject into.
// ---------------------------------------------------------------------------

export interface SlotProps {
  // Well-known layout slot name the panel renders at this location. Every
  // active mod that declared this slot name in its manifest contributes a
  // component here, in registry / activation order.
  name: string;
  // Arbitrary context forwarded as a prop to every mounted component for the
  // slot (e.g. { instanceId }) so a mod can scope its render to the page
  // it landed in without re-fetching from the URL. Memoised by the caller.
  context?: Record<string, any>;
  // Optional fallback rendered when no mod registered for the slot, so a host
  // page can show a friendly empty state instead of nothing.
  fallback?: React.ReactNode;
}

// Slot renders every mod component registered for `name`, each wrapped in its
// own ErrorBoundary and merged with the mod-declared props + the live `context`
// prop. The component is memoised so layout re-renders that pass a stable
// `context` reference don't blow away mounted mod React state.
const SlotInner: React.FC<SlotProps> = ({ name, context, fallback }) => {
  const { response, error } = useSlotsRegistry();

  // Resolve the live registrations. The remote fetch gives us the mod-declared
  // slots (name + component + props); the window.KS registry gives us the
  // React component each bundle registered. We join on (slot name) and keep
  // only entries whose bundle is actually loaded.
  const mounts = useMemo<KSPluginComponent[]>(() => {
    const ks = ensureKSRegistry();
    const registered = ks.getComponentsForSlot(name);
    if (registered.length > 0) {
      return registered;
    }
    // No bundle has registered a component for this slot yet — but the slots
    // API may still list declarations. We render nothing (the mod bundle hasn't
    // loaded or the panel runs in noop mode). The fallback path handles the
    // host page's own empty state.
    return [];
  }, [name, response]);

  if (error) {
    // Surface the load error to the developer console but never to the user —
    // the host layout must keep working when the slots endpoint fails.
    // eslint-disable-next-line no-console
    console.error('[KS Slot] failed to load slots registry:', error);
  }

  // Build the per-slot props map (mod name -> merged props) from the API
  // declarations so we can attach the manifest-declared props to the right
  // component even before the bundle re-declares them.
  const declaredProps = useMemo<Record<string, Record<string, any>>>(() => {
    const out: Record<string, Record<string, any>> = {};
    for (const s of response?.slots ?? []) {
      if (s.name === name) {
        out[s.component] = { ...(s.props ?? {}) };
      }
    }
    return out;
  }, [name, response]);

  if (mounts.length === 0) {
    // If the API reported declarations but no bundle has loaded, that's the
    // noop-mode case (the mod declared a slot but its JS bundle isn't running)
    // — we still want the host's fallback so the layout doesn't collapse.
    return <>{fallback ?? null}</>;
  }

  return (
    <>
      {mounts.map((m) => {
        const Component = m.Component;
        const merged = { ...(declaredProps[m.name] ?? {}), ...(context ?? {}) };
        return (
          <SlotErrorBoundary key={`${m.mod}:${m.name}`} mod={m.mod} name={m.name}>
            <Component {...merged} />
          </SlotErrorBoundary>
        );
      })}
    </>
  );
};

// Memoise: re-render only when `name`, `context`, or `fallback` change by
// reference. The internal useSlotsRegistry hook still subscribes to load
// completion, so the memoised boundary re-renders when slots arrive.
const Slot = React.memo(SlotInner);
export default Slot;

// Convenience: a hook for callers that want to drive the loader imperatively
// (e.g. after programmatically activating a mod from the admin page). It
// returns the current registry response + a forceReload callback.
export function useSlotRegistry(): {
  response: SlotRegistryResponse | null;
  reload: () => Promise<void>;
} {
  const { response } = useSlotsRegistry();
  const reload = useCallback(async () => {
    registry.loaded = false;
    await loadSlotsOnce();
  }, []);
  return { response, reload };
}

// Eagerly start the slots fetch at module load so the first <Slot /> mount has
// a warmed cache. Safe in non-browser environments because ensureKSRegistry
// guards on `window`.
if (typeof window !== 'undefined') {
  ensureKSRegistry();
  void loadSlotsOnce();
}
