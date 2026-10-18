import React, { useCallback, useEffect, useMemo, useState } from 'react';
import * as ReactDOM from 'react-dom';
import * as ReactDOMClient from 'react-dom/client';
import * as jsxRuntime from 'react/jsx-runtime';
import { fetchSlots } from '@/features/mods/api/mods';
import type {
  KSPluginComponent,
  RegisteredSlot,
  SlotRegistryResponse,
} from '@/shared/types/mod';

// Slot.tsx — Mod Engine v2 React UI slot system.
//
// The panel declares a set of well-known layout injection points scattered
// across the admin shell (e.g. "instance.detail.tabs", "dashboard.cards").
// Active mods publish React components for those names through a browser-side
// registry mounted on `window.KS`. This file owns three things:
//
//   1. The window.KS component registry — mods' JS bundles call
//      window.KS.registerComponent(slotName, componentName, ReactComponent)
//      when they load; <Slot /> looks the mapping up by slot name + exported
//      symbol at render time.
//   2. A remote plugin loader — on first <Slot /> mount (or panel boot), we
//      fetch /api/mods/v1/slots to learn which active mods declared slots.
//      Every registered slot carries a bundle_url (the mod's frontend ES
//      module on the asset route, with a version cache-buster); the loader
//      injects each missing bundle as a <script type="module"> and waits for
//      it to evaluate before the next one, tagging whatever it registers via
//      window.KS with the owning mod. Deactivated mods get their scripts
//      removed + registry entries pruned on the next refresh, so slot output
//      appears and disappears with the mod's active flag without a reload.
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
//
// Registrations are tagged with the mod whose bundle is currently evaluating
// (currentBundleMod, set while injectBundle runs a module script); a
// registration that arrives outside a bundle eval (eager inline script) keeps
// the '__pending__' label and is patched from the slots response later.
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
      // Register-then-notify: <Slot /> subscribers re-render so a component
      // that arrives after the host page painted shows up immediately.
      const list = components.get(slotName) ?? [];
      const mod = currentBundleMod ?? '__pending__';
      const idx = list.findIndex((c) => c.name === name);
      if (idx >= 0) {
        // Replace an existing registration so a hot-reload doesn't
        // double-mount the same component. Keep the previously-known mod
        // label when the new registration can't provide one.
        const prev = list[idx];
        list[idx] = { ...prev, Component, mod: mod === '__pending__' ? prev.mod : mod };
      } else {
        list.push({ mod, name, Component });
      }
      components.set(slotName, list);
      notifyRegistryChange();
    },
    getComponentsForSlot(slotName) {
      return components.get(slotName) ?? [];
    },
  };
  window.KS = ks;
  // Mod bundles are hand-authored files (no bundler), so the loader exposes
  // the same React surface the panel itself uses on window. Bundles are told
  // in the authoring docs (aiskills/mods.md) to read window.React /
  // window.ReactDOM / window.jsxRuntime instead of importing.
  exposeReactGlobals();
  return ks;
}

// exposeReactGlobals publishes React + react-dom on window for mod bundles.
// Idempotent; a bundle that ships its own copy is allowed to overwrite.
// `ReactJSXRuntime` is the documented alias for the automatic JSX runtime
// (jsx-runtime); `jsxRuntime` is kept as the short spelling.
function exposeReactGlobals(): void {
  const w = window as unknown as Record<string, unknown>;
  if (!w.React) w.React = React;
  if (!w.ReactDOM) w.ReactDOM = ReactDOM;
  if (!w.ReactDOMClient) w.ReactDOMClient = ReactDOMClient;
  if (!w.jsxRuntime) w.jsxRuntime = jsxRuntime;
  if (!w.ReactJSXRuntime) w.ReactJSXRuntime = jsxRuntime;
}

// ---------------------------------------------------------------------------
// Registry change emitter — one module-level Set keeps every mounted <Slot />
// in sync with late-arriving bundle registrations and deactivation prunes.
// ---------------------------------------------------------------------------

type RegistryListener = () => void;
const registryListeners = new Set<RegistryListener>();

function notifyRegistryChange(): void {
  for (const l of Array.from(registryListeners)) l();
}

function subscribeRegistry(l: RegistryListener): () => void {
  registryListeners.add(l);
  return () => {
    registryListeners.delete(l);
  };
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

// currentBundleMod labels whatever window.KS.registerComponent calls happen
// while a mod's module script evaluates. injectBundle runs scripts strictly
// one at a time (and load events fire after evaluation), so no two bundles
// can race this tag.
let currentBundleMod: string | null = null;

// bundleScripts tracks injected <script> elements by bundle URL so a refresh
// can remove the ones whose mod deactivated (and re-inject on re-activation).
const bundleScripts = new Map<string, HTMLScriptElement>();

// injectBundle appends a module script for `url` and resolves once it has
// evaluated (or failed — a broken bundle must never block the loader chain).
// The serving route needs no CORS/gate beyond the admin-panel session cookie
// the browser already sends for same-origin <script src>.
function injectBundle(url: string, mod: string): Promise<void> {
  return new Promise((resolve) => {
    const el = document.createElement('script');
    el.type = 'module';
    el.src = url;
    el.dataset.ksMod = mod;
    const done = () => {
      currentBundleMod = null;
      resolve();
    };
    el.onload = done;
    el.onerror = () => {
      // eslint-disable-next-line no-console
      console.error(`[KS Slot] failed to load bundle for mod "${mod}": ${url}`);
      done();
    };
    bundleScripts.set(url, el);
    currentBundleMod = mod;
    document.head.appendChild(el);
  });
}

// syncBundles reconciles the browser with the slots response:
//   • removes scripts + prunes registry entries for mods that are no longer
//     active (deactivation), so their slot output vanishes;
//   • injects every bundle the active mods advertise that isn't loaded yet,
//     sequentially, so registration tagging stays deterministic.
async function syncBundles(slots: RegisteredSlot[]): Promise<void> {
  const ks = ensureKSRegistry();
  const wanted = new Map<string, string>(); // bundle url -> owning mod slug
  for (const s of slots) {
    if (s.bundle_url) wanted.set(s.bundle_url, s.mod);
  }

  let changed = false;
  for (const [url, el] of Array.from(bundleScripts.entries())) {
    if (!wanted.has(url)) {
      el.remove();
      bundleScripts.delete(url);
      changed = true;
    }
  }

  const activeMods = new Set(slots.map((s) => s.mod));
  for (const [slotName, list] of Array.from(ks.__ksComponents.entries())) {
    const kept = list.filter((c) => c.mod === '__pending__' || activeMods.has(c.mod));
    if (kept.length !== list.length) {
      changed = true;
      if (kept.length === 0) ks.__ksComponents.delete(slotName);
      else ks.__ksComponents.set(slotName, kept);
    }
  }

  for (const [url, mod] of wanted) {
    if (bundleScripts.has(url)) continue;
    await injectBundle(url, mod);
    changed = true;
  }

  if (changed) notifyRegistryChange();
}

// refreshSlots forces a re-fetch. Call it from a failed-silently background
// poll or after an activate/deactivate so newly-active mods show up without a
// full page reload. Resolves after every newly-declared bundle has evaluated,
// so callers can await "slots + bundles ready".
export async function refreshSlots(): Promise<void> {
  try {
    const data = await fetchSlots();
    registry.response = data;
    registry.error = null;
    registry.loaded = true;
    // Patch '__pending__' labels from the slot declarations (a bundle that
    // registered before the fetch resolved). Bundles injected below tag
    // themselves directly and don't need this.
    const ks = ensureKSRegistry();
    for (const s of data.slots) {
      const list = ks.__ksComponents.get(s.name) ?? [];
      for (const entry of list) {
        if (entry.mod === '__pending__' && entry.name === s.component) entry.mod = s.mod;
      }
      ks.__ksComponents.set(s.name, list);
    }
    await syncBundles(data.slots);
  } catch (e) {
    registry.error = e instanceof Error ? e : new Error(String(e));
    registry.loaded = true;
  } finally {
    notifyRegistryChange();
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
// re-render once the load resolves, on late bundle registrations, and on
// deactivation prunes. Returns the current response (possibly null during the
// first paint), the error if any, and a version counter that busts memos
// derived from the live component list.
function useSlotsRegistry(): {
  response: SlotRegistryResponse | null;
  error: Error | null;
  loaded: boolean;
  version: number;
} {
  const [version, bump] = useState(0);

  useEffect(() => {
    return subscribeRegistry(() => bump((n) => n + 1));
  }, []);

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
      if (!cancelled) bump((n) => n + 1);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return {
    response: registry.response,
    error: registry.error,
    loaded: registry.loaded,
    version,
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
  // Optional owner filter: when set, only registrations tagged with this mod
  // slug mount. The mod screen route (/mods/view/:slug/*) passes the URL slug
  // so two screen mods sharing the "mod.screen" name can never render into
  // each other's page. Undefined keeps the name-only behaviour host mounts use.
  mod?: string;
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
const SlotInner: React.FC<SlotProps> = ({ name, mod, context, fallback }) => {
  const { response, error, version } = useSlotsRegistry();

  // Resolve the live registrations. The slots fetch tells the loader which
  // bundles to inject; the window.KS registry gives us the React component
  // each bundle registered. Computing this on every render is what makes
  // late-arriving components appear (the version bump from the registry
  // emitter re-renders us). The remote fetch alone is not enough — a bundle
  // may finish evaluating after the slots response was applied.
  const ks = ensureKSRegistry();
  const mounts: KSPluginComponent[] = ks
    .getComponentsForSlot(name)
    .filter((m) => !mod || m.mod === mod);

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
      if (s.name === name && (!mod || s.mod === mod)) {
        out[s.component] = { ...(s.props ?? {}) };
      }
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [name, mod, response, version]);

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

// Memoise: re-render only when `name`, `mod`, `context`, or `fallback` change
// by reference. The internal useSlotsRegistry hook still subscribes to load
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
