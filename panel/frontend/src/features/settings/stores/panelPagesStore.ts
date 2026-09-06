import create from 'zustand';
import { fetchPanelPagesNav, type PanelPageNav } from '@/features/settings/api/panelPages';

// Sidebar + header share of the custom-pages nav: enabled pages visible to
// the current role (server-filtered). Loaded lazily on first use so
// anonymous/login traffic never pays for it.
interface PanelPagesState {
  nav: PanelPageNav[];
  loaded: boolean;
  loading: boolean;
  load: () => Promise<void>;
  refresh: () => Promise<void>;
  bySlug: (slug: string) => PanelPageNav | undefined;
}

export const usePanelPagesStore = create<PanelPagesState>((set, get) => ({
  nav: [],
  loaded: false,
  loading: false,
  load: async () => {
    const { loaded, loading } = get();
    if (loaded || loading) return;
    set({ loading: true });
    try {
      const nav = await fetchPanelPagesNav();
      set({ nav, loaded: true });
    } catch {
      // No session / network blip: stay empty rather than breaking the
      // sidebar. A later refresh (post-login) retries.
      set({ nav: [] });
    } finally {
      set({ loading: false });
    }
  },
  refresh: async () => {
    set({ loading: true });
    try {
      const nav = await fetchPanelPagesNav();
      set({ nav, loaded: true });
    } catch {
      set({ nav: [] });
    } finally {
      set({ loading: false });
    }
  },
  bySlug: (slug: string) => get().nav.find((n) => n.slug === slug),
}));
