import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useThemeStore } from '@/shared/stores/themeStore';
import { useAuthStore } from '@/shared/stores/authStore';
import type { Theme, ThemeKey } from '@/features/themes/types/theme';
import Loading from '@/shared/components/ui/Loading';
import SkeletonGrid from '@/shared/components/ui/SkeletonGrid';
import {
  ThemeTab,
  BackgroundTab,
  SidebarTab,
  HeaderTab,
  ButtonTab,
  TabsTab,
  PillTab,
  MenuTab,
  DropdownsTab,
  TypographyTab,
  AccentTab,
  ShapeTab,
  LoadingTab,
  FormsTab,
  ComponentsTab,
  UtilitiesTab,
  CardsTab,
  CustomCSSTab,
  MarketTab,
  HistoryTab,
} from '@/features/themes/components/ThemeStudio';
import { PageActionsPill, PILL_TAB_STYLE } from '@/shared/components/ui/PageActionsPill';
import SectionRailTabs from '@/shared/components/ui/SectionRailTabs';

// renderLoadingPreview renders a preview of the loading animation based on
// the theme's loading configuration. This is used in the live preview area
// of the studio.
const renderLoadingPreview = (loading: any) => {
  const speed = loading.animation_speed === 'slow' ? '2s' : loading.animation_speed === 'fast' ? '0.5s' : '1s';

  return (
    <>
      <Loading
        type={loading.type}
        color=""
        size={loading.size}
        skeletonType={loading.skeleton_type}
        skeletonCount={loading.skeleton_count}
        skeletonLines={loading.skeleton_lines}
        skeletonBaseColor={loading.skeleton_base_color}
        skeletonShimmerColor={loading.skeleton_shimmer_color}
        skeletonSpeed={loading.skeleton_speed}
        skeletonInterval={loading.skeleton_interval}
        skeletonRadius={loading.skeleton_radius}
        bgType={loading.bg_type}
        background={loading.background}
        bgImage={loading.bg_image}
        bgVideo={loading.bg_video}
        bgGradient={loading.bg_gradient}
        bgOpacity={loading.bg_opacity}
        bgSize={loading.bg_size}
        bgPosition={loading.bg_position}
        bgRepeat={loading.bg_repeat}
        bgBlur={loading.bg_blur}
      />
      <style>{`
        .ks-loading-host .animate-spin,
        .ks-loading-host .animate-bounce,
        .ks-loading-host .animate-pulse {
          animation-duration: ${speed} !important;
          color: ${loading.color};
        }
      `}</style>
    </>
  );
};

// Tab icons
const ICON_THEME = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4" aria-hidden="true">
    <path d="M12 3a9 9 0 1 0 0 18c1.2 0 2-1 2-2 0-1.5-1.5-2-1.5-3.5 0-1.2 1-2 2.2-2H17a4 4 0 0 0 4-4c0-3.3-4-6.5-9-6.5z" />
    <circle cx="7.5" cy="11.5" r="1" fill="currentColor" />
    <circle cx="10.5" cy="7.5" r="1" fill="currentColor" />
    <circle cx="15" cy="7.5" r="1" fill="currentColor" />
  </svg>
);
const ICON_BG = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4" aria-hidden="true">
    <rect x="3" y="4" width="18" height="16" rx="2" />
    <circle cx="9" cy="10" r="1.5" />
    <path d="M3 17l5-5 4 4 3-3 6 6" />
  </svg>
);
const ICON_CARD = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4" aria-hidden="true">
    <rect x="4" y="6" width="16" height="12" rx="2" />
    <line x1="8" y1="11" x2="16" y2="11" />
    <line x1="8" y1="14" x2="13" y2="14" />
  </svg>
);
const ICON_SIDEBAR = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4" aria-hidden="true">
    <rect x="3" y="4" width="18" height="16" rx="2" />
    <line x1="9" y1="4" x2="9" y2="20" />
    <line x1="13" y1="9" x2="17" y2="9" />
    <line x1="13" y1="13" x2="17" y2="13" />
  </svg>
);
const ICON_HEADER = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4" aria-hidden="true">
    <rect x="3" y="4" width="18" height="16" rx="2" />
    <line x1="3" y1="10" x2="21" y2="10" />
    <line x1="7" y1="7" x2="11" y2="7" />
  </svg>
);
const ICON_BUTTON = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4" aria-hidden="true">
    <rect x="3" y="8" width="18" height="9" rx="2" />
    <line x1="12" y1="8" x2="12" y2="17" />
  </svg>
);
const ICON_TYPOGRAPHY = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4" aria-hidden="true">
    <path d="M5 6h14" />
    <path d="M12 6v13" />
    <path d="M9 19h6" />
  </svg>
);
const ICON_ACCENT = (
  <svg viewBox="0 0 24 24" className="w-4 h-4" aria-hidden="true">
    <circle cx="12" cy="12" r="8" fill="none" stroke="currentColor" strokeWidth="1.8" />
    <path d="M12 4a8 8 0 0 1 0 16z" fill="currentColor" />
  </svg>
);
const ICON_FORMS = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4" aria-hidden="true">
    <rect x="3" y="8" width="18" height="9" rx="2" />
    <path d="M7 12h10M7 16h10M7 8h10" />
  </svg>
);
const ICON_COMPONENTS = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4" aria-hidden="true">
    <rect x="3" y="3" width="7" height="7" rx="1" />
    <rect x="14" y="3" width="7" height="7" rx="1" />
    <rect x="3" y="14" width="7" height="7" rx="1" />
    <rect x="14" y="14" width="7" height="7" rx="1" />
  </svg>
);
const ICON_UTILITIES = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4" aria-hidden="true">
    <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
    <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
  </svg>
);
const ICON_SHAPE = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4" aria-hidden="true">
    <circle cx="8" cy="12" r="5" />
    <rect x="12" y="7" width="9" height="9" rx="4.5" />
  </svg>
);
const ICON_LOADING = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4" aria-hidden="true">
    <circle cx="12" cy="12" r="8" />
    <path d="M12 4a8 8 0 0 1 8 8" />
  </svg>
);
const ICON_TABS = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4" aria-hidden="true">
    <rect x="3" y="5" width="18" height="14" rx="2" />
    <line x1="3" y1="10" x2="21" y2="10" />
    <rect x="6" y="7" width="6" height="2" rx="0.5" fill="currentColor" />
  </svg>
);
const ICON_PILL = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4" aria-hidden="true">
    <rect x="2" y="7" width="20" height="10" rx="5" />
    <polyline points="15 10.5 12.5 12 15 13.5" />
  </svg>
);
const ICON_MENU = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4" aria-hidden="true">
    <rect x="4" y="4" width="10" height="10" rx="3" />
    <circle cx="9" cy="9" r="2.5" />
    <path d="M18 6h3M18 12h3M18 18h3" />
  </svg>
);
const ICON_DROPDOWNS = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4" aria-hidden="true">
    <rect x="3" y="4" width="18" height="4" rx="1.5" />
    <rect x="6" y="11" width="12" height="3" rx="1.5" />
    <rect x="9" y="17" width="6" height="3" rx="1.5" />
  </svg>
);
const ICON_CSS = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4" aria-hidden="true">
    <polyline points="16 18 22 12 16 6" />
    <polyline points="8 6 2 12 8 18" />
    <line x1="14" y1="4" x2="10" y2="20" />
  </svg>
);
const ICON_MARKET = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4" aria-hidden="true">
    <path d="M3 9l1.5-5h15L21 9" />
    <path d="M3 9h18v2a3 3 0 0 1-3 3 3 3 0 0 1-3-3 3 3 0 0 1-6 0 3 3 0 0 1-3 3 3 3 0 0 1-3-3V9z" />
    <path d="M5 14v6h14v-6" />
  </svg>
);
const ICON_HISTORY = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4" aria-hidden="true">
    <path d="M3 12a9 9 0 1 0 3-6.7" />
    <polyline points="3 4 3 9 8 9" />
    <line x1="12" y1="8" x2="12" y2="12" />
    <line x1="12" y1="12" x2="15" y2="14" />
  </svg>
);

// SCOPE_OPTIONS / scopeLabelFor previously lived here but were only ever
// used by the Custom CSS tab, which now owns its own copy in
// CustomCSSTab.tsx. Removed as dead code (V5).

// Tabs surfaced in the studio sidebar. Each entry maps to a section key on
// the Theme object; the panel below renders the matching editor block.
// 'market' + 'history' are studio-level (not theme sections): the
// marketplace browser (catalog → preview → install) and the version
// history (list + diff-note + restore) for GLOBAL themes.
type TabKey = ThemeKey | 'theme' | 'forms' | 'components' | 'utilities' | 'cards' | 'market' | 'history';
const TABS: Array<{ key: TabKey; label: string; hint: string; icon: React.ReactNode }> = [
  { key: 'theme', label: 'Theme', hint: 'Name, note, icon & colour', icon: ICON_THEME },
  { key: 'background', label: 'Background', hint: 'Image, video, colour & blur', icon: ICON_BG },
  { key: 'sidebar', label: 'Sidebar', hint: 'Fill, blur, width & items', icon: ICON_SIDEBAR },
  { key: 'header', label: 'Header', hint: 'Fill, blur, height & bar', icon: ICON_HEADER },
  { key: 'button', label: 'Button', hint: 'Primary, ghost & icon', icon: ICON_BUTTON },
  { key: 'tabs', label: 'Tabs', hint: 'Pills, scope cards & rail', icon: ICON_TABS },
  { key: 'pill', label: 'Pill', hint: 'Surface, motion & timing', icon: ICON_PILL },
  { key: 'menu', label: 'Menu', hint: 'Instance menu toggle & popover', icon: ICON_MENU },
  { key: 'dropdowns', label: 'Dropdowns', hint: 'Surface, items & danger', icon: ICON_DROPDOWNS },
  { key: 'typography', label: 'Typography', hint: 'Font, colours & size', icon: ICON_TYPOGRAPHY },
  { key: 'accent', label: 'Accent', hint: 'Primary & status colours', icon: ICON_ACCENT },
  { key: 'shape', label: 'Shape', hint: 'Corner radii', icon: ICON_SHAPE },
  { key: 'loading', label: 'Loading', hint: 'Spinner, text & backdrop', icon: ICON_LOADING },
  { key: 'forms', label: 'Forms', hint: 'Inputs, checks & toggles', icon: ICON_FORMS },
  { key: 'components', label: 'Components', hint: 'Modals, glass & chrome', icon: ICON_COMPONENTS },
  { key: 'utilities', label: 'Utilities', hint: 'Tokens, shadows & z-index', icon: ICON_UTILITIES },
  { key: 'cards', label: 'Cards', hint: 'List, stat & form cards', icon: ICON_CARD },
  { key: 'customCSS', label: 'Custom CSS', hint: 'Raw CSS, global & scoped', icon: ICON_CSS },
  { key: 'market', label: 'Market', hint: 'Browse & install themes', icon: ICON_MARKET },
  { key: 'history', label: 'History', hint: 'Versions & restore', icon: ICON_HISTORY },
];

const ThemeStudio: React.FC = () => {
  const navigate = useNavigate();
  const draft = useThemeStore((s) => s.draft);
  const beginDraft = useThemeStore((s) => s.beginDraft);
  const patchDraft = useThemeStore((s) => s.patchDraft);
  const patchDraftMeta = useThemeStore((s) => s.patchDraftMeta);
  const saveDraft = useThemeStore((s) => s.saveDraft);
  const discardDraft = useThemeStore((s) => s.discardDraft);
  const reapply = useThemeStore((s) => s.reapply);
  const themes = useThemeStore((s) => s.themes);
  const createGlobalTheme = useThemeStore((s) => s.createGlobalTheme);
  const updateGlobalTheme = useThemeStore((s) => s.updateGlobalTheme);
  const globalThemes = useThemeStore((s) => s.globalThemes);
  const canManageGlobal = useAuthStore((s) =>
    s.permissions.includes('MANAGE_THEMES') ||
    s.permissions.includes('CREATE_GLOBAL_THEMES') ||
    s.permissions.includes('EDIT_THEMES'),
  );

  const [tab, setTab] = useState<TabKey>('theme');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveScope, setSaveScope] = useState<'local' | 'global'>('local');

  useEffect(() => {
    if (!useThemeStore.getState().draft) {
      beginDraft(useThemeStore.getState().active());
    }
  }, [beginDraft]);

  useEffect(() => {
    if (draft) {
      setName(draft.name === 'Default' ? 'My Theme' : draft.name);
      setDescription(draft.description || '');
    }
  }, [draft?.id]);

  useEffect(() => {
    return () => {
      if (useThemeStore.getState().draft) {
        discardDraft();
      }
    };
  }, [discardDraft]);

  useEffect(() => {
    const d = useThemeStore.getState().draft;
    if (!d || !d.id) return;
    if (globalThemes.some((t) => t.id === d.id) && canManageGlobal) {
      setSaveScope('global');
    } else if (themes.some((t) => t.id === d.id)) {
      setSaveScope('local');
    }
  }, [draft?.id, globalThemes, themes, canManageGlobal]);

  if (!draft) {
    return (
      <div className="flex min-h-[200px] items-center justify-center">
        <SkeletonGrid count={3} />
      </div>
    );
  }

  const patch = (section: TabKey, p: Record<string, any>) => patchDraft(section as ThemeKey, p);

  const existingLocal = draft.id && themes.some((t) => t.id === draft.id);
  const existingGlobal = draft.id && globalThemes.some((t) => t.id === draft.id);
  const editingExisting = !!((existingLocal || existingGlobal) && draft.id);

  const save = async (asNew: boolean) => {
    if (!name.trim()) {
      alert('Please give your theme a name before saving.');
      return;
    }
    patchDraftMeta({ name: name.trim(), description: description.trim() });
    setSaving(true);
    try {
      if (saveScope === 'global' && canManageGlobal) {
        const d = useThemeStore.getState().draft;
        if (!d) return;
        const id = asNew ? `theme-${Date.now().toString(36)}` : (d.id || `theme-${Date.now().toString(36)}`);
        const base: Theme = { ...d, id, name: name.trim(), description: description.trim(), builtin: false };
        if (existingGlobal && !asNew) {
          await updateGlobalTheme(id, base);
        } else {
          await createGlobalTheme({ ...base, id });
        }
      } else {
        saveDraft(asNew);
      }
      navigate('/themes');
    } catch (e: any) {
      const msg = e?.response?.data || e?.message || 'Failed to save theme.';
      alert(typeof msg === 'string' ? msg : 'Failed to save theme.');
    } finally {
      setSaving(false);
    }
  };

  const cancel = () => {
    discardDraft();
    navigate('/themes');
  };

  return (
    <div>
      {/* Fixed top-right pill — "Theme Studio" title lives in the app header. */}
      <PageActionsPill>
        <button
          type="button"
          onClick={() => reapply()}
          title="Restart the live preview from the saved theme"
          aria-label="Reset preview"
          className="ks-tab shrink-0 inline-flex items-center justify-center transition"
          style={PILL_TAB_STYLE}
        >
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4"><polyline points="23 4 23 10 17 10" /><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" /></svg>
        </button>
        {canManageGlobal && (
          <select
            value={saveScope}
            onChange={(e) => setSaveScope(e.target.value as 'local' | 'global')}
            title={saveScope === 'local' ? 'Save to this browser (localStorage). Only this user sees this theme.' : 'Publish to the server. Every user will see this theme on the areas/pages you assign it to.'}
            aria-label="Save scope"
            className="ks-tab shrink-0 px-3 py-1.5 rounded text-sm text-center transition"
            style={PILL_TAB_STYLE}
          >
            <option value="local">Local</option>
            <option value="global">Global</option>
          </select>
        )}
        <button
          type="button"
          onClick={cancel}
          title="Cancel and back to Themes"
          aria-label="Cancel and back to Themes"
          className="ks-tab shrink-0 px-3 py-1.5 rounded text-sm text-center transition"
          style={PILL_TAB_STYLE}
        >
          Cancel
        </button>
        {editingExisting && (
          <button
            type="button"
            onClick={() => save(true)}
            disabled={saving}
            title="Save as a new theme"
            className="ks-tab shrink-0 px-3 py-1.5 rounded text-sm text-center transition disabled:opacity-60"
            style={PILL_TAB_STYLE}
          >
            {saving ? 'Saving…' : 'Save as new'}
          </button>
        )}
        <button
          type="button"
          onClick={() => save(false)}
          disabled={saving}
          title={editingExisting ? 'Save theme' : 'Create theme'}
          className="ks-tab ks-tab-active shrink-0 px-3 py-1.5 rounded text-sm text-center transition disabled:opacity-60"
          style={PILL_TAB_STYLE}
        >
          {saving ? 'Saving…' : editingExisting ? 'Save' : 'Create'}
        </button>
      </PageActionsPill>

      {/* Phone tabs — same shared rail style, horizontal: the ~20 sections
          scroll sideways with one-tap switching (no bottom dropdown). */}
      <div className="lg:hidden mb-4">
        <SectionRailTabs
          ariaLabel="Theme studio sections"
          orientation="horizontal"
          active={tab}
          onChange={(id) => setTab(id as TabKey)}
          tabs={TABS.map((t) => ({ id: t.key, label: t.label, hint: t.hint, icon: t.icon }))}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[220px_1fr] gap-4">
        {/* Desktop tabs — same shared rail style as Security/Database, but
            vertical: ~20 sections stack full-width with hints always
            visible. Sticky so they stay visible while the studio scrolls. */}
        <div className="hidden lg:block lg:sticky lg:top-4 self-start">
          <SectionRailTabs
            ariaLabel="Theme studio sections"
            orientation="vertical"
            active={tab}
            onChange={(id) => setTab(id as TabKey)}
            tabs={TABS.map((t) => ({ id: t.key, label: t.label, hint: t.hint, icon: t.icon }))}
          />
        </div>
        {/* Content column — NO outer card here (node pattern): every tab
            section renders its own GlassCard, so a wrapper would nest a
            card inside a card. */}
        <div className="space-y-4 min-w-0">
          {/* Fixed-height options box — every studio control scrolls inside
              (same pattern as the API-key permission list) so the page
              itself never stretches on small laptops. */}
          <div className="max-h-[70vh] overflow-y-auto pr-1 space-y-4">
            {tab === 'theme' && (
              <ThemeTab
                name={name}
                description={description}
                icon={draft.icon || ''}
                color={draft.color || ''}
                onNameChange={setName}
                onDescriptionChange={setDescription}
                onIconChange={(v) => patchDraftMeta({ icon: v })}
                onColorChange={(v) => patchDraftMeta({ color: v })}
              />
            )}
            {tab === 'background' && <BackgroundTab draft={draft} patch={patch} />}
            {tab === 'sidebar' && <SidebarTab draft={draft} patch={patch} />}
            {tab === 'header' && <HeaderTab draft={draft} patch={patch} />}
            {tab === 'button' && <ButtonTab draft={draft} patch={patch} />}
            {tab === 'tabs' && <TabsTab draft={draft} patch={patch} />}
            {tab === 'pill' && <PillTab draft={draft} patch={patch} />}
            {tab === 'menu' && <MenuTab draft={draft} patch={patch} />}
            {tab === 'dropdowns' && <DropdownsTab draft={draft} patch={patch} />}
            {tab === 'typography' && <TypographyTab draft={draft} patch={patch} />}
            {tab === 'accent' && <AccentTab draft={draft} patch={patch} />}
            {tab === 'shape' && <ShapeTab draft={draft} patch={patch} />}
            {tab === 'loading' && <LoadingTab draft={draft} patch={patch} renderLoadingPreview={renderLoadingPreview} />}
            {tab === 'forms' && <FormsTab draft={draft} patch={patch} />}
            {tab === 'components' && <ComponentsTab draft={draft} patch={patch} />}
            {tab === 'utilities' && <UtilitiesTab draft={draft} patch={patch} />}
            {tab === 'cards' && <CardsTab draft={draft} patch={patch} />}
            {tab === 'customCSS' && <CustomCSSTab draft={draft} patch={patch} />}
            {tab === 'market' && <MarketTab />}
            {tab === 'history' && <HistoryTab />}
          </div>
        </div>
      </div>
    </div>
  );
};

export default ThemeStudio;