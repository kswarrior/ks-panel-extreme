import create from 'zustand';

// ------------------------------------------------------------------
//  Prefs store
// ------------------------------------------------------------------
//  A small per-browser preference store for the toggles/checkboxes
//  surfaced by the Header profile dropdown (compact mode, reduced
//  motion, etc.). It uses the same persistence pattern as the
//  themeStore: a JSON blob under one localStorage key that we round-
//  trip on each change. It's deliberately separate from the theme
//  system — those preferences describe how a USER eyeballs the panel
//  on their machine, not the visual theme (which gets stored /
//  assigned per-area or globally).
//
//  The store also drives a tiny DOM side effect: every `compact` /
//  `density` / `reducedMotion` toggle is reflected on the <html>
//  element as a data attribute so plain CSS rules in index.css can
//  tighten paddings / disable animations / collapse rows without
//  pulling a class through each component. Keeping it in CSS keeps
//  the "live preview" behaviour crisp — flip a toggle and the whole
//  page re-flows without any React rebuild.

const STORAGE_KEY = 'kspanel.prefs';

export interface PrefsState {
  // Compact mode: smaller paddings, tighter borders, denser cards.
  compact: boolean;
  // Dense mode: tables/grid lists use a 32px row height instead of 44.
  dense: boolean;
  // Reduced motion: disables transitions + the Aurora background
  // drifting animation. Mirrors prefers-reduced-motion for users
  // who want the choice without flipping the OS setting.
  reducedMotion: boolean;
  // Show tooltips / keyboard hint rows in sidebars + actions.
  showShortcuts: boolean;

  setPref: <K extends keyof Omit<PrefsState, 'setPref' | 'syncDom'>>(
    key: K,
    value: PrefsState[K]
  ) => void;
  // Re-apply all prefs to the document element data-attribs.
  syncDom: () => void;
}

interface PersistShape {
  compact: boolean;
  dense: boolean;
  reducedMotion: boolean;
  showShortcuts: boolean;
}

const DEFAULTS: PersistShape = {
  compact: false,
  dense: false,
  reducedMotion: false,
  showShortcuts: true,
};

function loadPersisted(): PersistShape {
  if (typeof window === 'undefined') return { ...DEFAULTS };
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULTS };
    const parsed = JSON.parse(raw) as Partial<PersistShape>;
    return {
      ...DEFAULTS,
      compact: !!parsed.compact,
      dense: !!parsed.dense,
      reducedMotion: !!parsed.reducedMotion,
      showShortcuts:
        typeof parsed.showShortcuts === 'boolean' ? parsed.showShortcuts : true,
    };
  } catch {
    return { ...DEFAULTS };
  }
}

function persist(state: PersistShape): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Storage off / quota: prefs silently become session-only.
  }
}

const initial = loadPersisted();

export const usePrefsStore = create<PrefsState>((set, get) => ({
  ...initial,

  setPref: (key, value) => {
    set({ [key]: value } as any);
    persist(snapshot(get()));
    get().syncDom();
  },

  syncDom: () => {
    if (typeof document === 'undefined') return;
    const s = get();
    const html = document.documentElement;
    html.dataset.ksCompact = s.compact ? '1' : '0';
    html.dataset.ksDense = s.dense ? '1' : '0';
    html.dataset.ksReducedMotion = s.reducedMotion ? '1' : '0';
    html.dataset.ksShortcuts = s.showShortcuts ? '1' : '0';
  },
}));

function snapshot(s: PrefsState): PersistShape {
  return {
    compact: s.compact,
    dense: s.dense,
    reducedMotion: s.reducedMotion,
    showShortcuts: s.showShortcuts,
  };
}

// Apply the prefs to the DOM once on module load so the very first
// paint already honours the saved values (no FOUC flash).
if (typeof window !== 'undefined') {
  usePrefsStore.getState().syncDom();
}
