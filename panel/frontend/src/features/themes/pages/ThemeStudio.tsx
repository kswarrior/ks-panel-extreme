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
import GlassCard from '@/shared/components/ui/Card';

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
const TABS: Array<{ key: TabKey; label: string; icon: React.ReactNode }> = [
  { key: 'theme', label: 'Theme', icon: ICON_THEME },
  { key: 'background', label: 'Background', icon: ICON_BG },
  { key: 'sidebar', label: 'Sidebar', icon: ICON_SIDEBAR },
  { key: 'header', label: 'Header', icon: ICON_HEADER },
  { key: 'button', label: 'Button', icon: ICON_BUTTON },
  { key: 'tabs', label: 'Tabs', icon: ICON_TABS },
  { key: 'pill', label: 'Pill', icon: ICON_PILL },
  { key: 'dropdowns', label: 'Dropdowns', icon: ICON_DROPDOWNS },
  { key: 'typography', label: 'Typography', icon: ICON_TYPOGRAPHY },
  { key: 'accent', label: 'Accent', icon: ICON_ACCENT },
  { key: 'shape', label: 'Shape', icon: ICON_SHAPE },
  { key: 'loading', label: 'Loading', icon: ICON_LOADING },
  { key: 'forms', label: 'Forms', icon: ICON_FORMS },
  { key: 'components', label: 'Components', icon: ICON_COMPONENTS },
  { key: 'utilities', label: 'Utilities', icon: ICON_UTILITIES },
  { key: 'cards', label: 'Cards', icon: ICON_CARD },
  { key: 'customCSS', label: 'Custom CSS', icon: ICON_CSS },
  { key: 'market', label: 'Market', icon: ICON_MARKET },
  { key: 'history', label: 'History', icon: ICON_HISTORY },
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
      <div className="flex items-center gap-2 text-xs text-gray-400 mb-2">
        <button type="button" onClick={() => navigate('/themes')} className="hover:text-white">Themes</button>
        <span className="text-gray-600">/</span>
        <span className="text-gray-200">Theme Studio</span>
      </div>
      <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
        <div>
          <h2 className="text-xl font-semibold text-white">Theme Studio</h2>
          <p className="text-sm text-gray-400 -mt-0.5">
            Customise every part of the panel. Changes preview live — save to keep them.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => reapply()}
            className="ks-ghost-btn inline-flex items-center gap-2 px-3 py-1.5 rounded border border-white/10 bg-white/5 text-gray-200 hover:bg-white/10 hover:text-white text-sm"
            title="Restart the live preview from the saved theme"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4"><polyline points="23 4 23 10 17 10" /><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" /> </svg>
            Reset preview
          </button>
        </div>
      </div>

      {/* Save scope + actions — top-left, always visible */}
      <div className="flex justify-start items-center gap-2 flex-wrap mb-4">
          {canManageGlobal && (
              <div className="flex items-center gap-1 mr-auto p-1 rounded-lg border border-white/10 bg-white/[0.04]">
                <button
                  type="button"
                  onClick={() => setSaveScope('local')}
                  className={`ks-tab text-xs rounded-md transition ${saveScope === 'local' ? 'ks-tab-active' : ''}`}
                  title="Save to this browser (localStorage). Only this user sees this theme."
                >
                  Local
                </button>
                <button
                  type="button"
                  onClick={() => setSaveScope('global')}
                  className={`ks-tab text-xs rounded-md transition ${saveScope === 'global' ? 'ks-tab-active' : ''}`}
                  title="Publish to the server. Every user will see this theme on the areas/pages you assign it to."
                >
                  Global
                </button>
              </div>
            )}
            <button type="button" onClick={cancel} className="ks-ghost-btn px-4 py-2 text-sm rounded transition-colors">
              Cancel
            </button>
            {editingExisting && (
              <button
                type="button"
                onClick={() => save(true)}
                disabled={saving}
                className="ks-ghost-btn px-4 py-2 text-sm rounded disabled:opacity-60"
              >
                {saving ? 'Saving…' : 'Save as new'}
              </button>
            )}
            <button
              type="button"
              onClick={() => save(false)}
              disabled={saving}
              className="ks-primary-btn px-4 py-2 text-sm rounded hover:bg-gray-200 disabled:opacity-60"
            >
              {saving ? 'Saving…' : editingExisting ? 'Save' : 'Create theme'}
            </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        <div className="lg:col-span-12">
          <div className="grid grid-cols-1 lg:grid-cols-[220px_1fr] gap-4">
            <GlassCard className="lg:sticky lg:top-4 self-start">
              <nav className="flex lg:flex-col gap-1 overflow-x-auto">
                {TABS.map((t) => (
                  <button
                    key={t.key}
                    type="button"
                    onClick={() => setTab(t.key)}
                    className={`ks-tab shrink-0 flex items-center gap-2 transition text-left ${tab === t.key ? 'ks-tab-active' : ''}`}
                  >
                    <span className="inline-flex items-center">{t.icon}</span>
                    <span className="flex flex-col">
                      <span className="text-sm">{t.label}</span>
                    </span>
                  </button>
                ))}
              </nav>
            </GlassCard>
            <div className="space-y-4">
              <GlassCard className="space-y-4">
              {/* Fixed-height options box — every studio control scrolls inside
                  (same pattern as the API-key permission list) so the page
                  itself never stretches on small laptops. */}
              <div className="max-h-[70vh] overflow-y-auto pr-1">
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
          </GlassCard>
        </div>
          </div>
        </div>



      </div>
    </div>
  );
};

export default ThemeStudio;