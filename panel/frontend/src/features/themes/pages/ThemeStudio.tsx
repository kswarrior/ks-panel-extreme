import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useThemeStore, scopeForArea, scopeForPage } from '@/shared/stores/themeStore';
import { useAuthStore } from '@/shared/stores/authStore';
import type { Theme, ThemeKey } from '@/features/themes/types/theme';
import { AREAS, STANDALONE_PAGES } from '@/features/instance-pages/types/pageregistry';
import Loading from '@/shared/components/ui/Loading';
import SkeletonGrid from '@/shared/components/ui/SkeletonGrid';
import {
  BackgroundTab,
  CardTab,
  SidebarTab,
  HeaderTab,
  ButtonTab,
  TabsTab,
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
} from '@/features/themes/components/ThemeStudio';
import GlassCard from '@/shared/components/ui/Card';
import ThemePreview from '@/features/themes/components/ThemePreview';
import { Label } from '@/theme/studioControls';

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

// SCOPE_OPTIONS is the flat list of every area + page scope the custom-CSS
// editor can target, mirroring the SAME scope model the theme-assignment
// system uses ('area:<id>' / 'page:<id>'). Built once at module load so the
// studio's "Add scope" picker and the per-row labels don't re-derive it on
// every render. Adding a new area / page to the registry automatically
// surfaces it here, so custom CSS follows the same coverage as theme
// assignments with zero extra plumbing.
const SCOPE_OPTIONS: Array<{ scope: string; label: string }> = (() => {
  const out: Array<{ scope: string; label: string }> = [];
  for (const area of AREAS) {
    out.push({ scope: scopeForArea(area.id), label: `Whole ${area.label}` });
    for (const p of area.pages) {
      out.push({ scope: scopeForPage(p.id), label: `${area.label} · ${p.label}` });
    }
  }
  for (const p of STANDALONE_PAGES) {
    out.push({ scope: scopeForPage(p.id), label: `${p.areaLabel} · ${p.label}` });
  }
  return out;
})();

// scopeLabelFor looks up the human label for a scope key, falling back to
// the raw key when the scope isn't in the registry (defensive: an admin who
// saved a scope that was since removed from the registry still sees a
// meaningful row instead of a blank chip).
function scopeLabelFor(scope: string): string {
  return SCOPE_OPTIONS.find((o) => o.scope === scope)?.label || scope;
}

// Tabs surfaced in the studio sidebar. Each entry maps to a section key on
// the Theme object; the panel below renders the matching editor block.
type TabKey = ThemeKey;
const TABS: Array<{ key: TabKey; label: string; icon: React.ReactNode }> = [
  { key: 'background', label: 'Background', icon: ICON_BG },
  { key: 'card', label: 'Card', icon: ICON_CARD },
  { key: 'sidebar', label: 'Sidebar', icon: ICON_SIDEBAR },
  { key: 'header', label: 'Header', icon: ICON_HEADER },
  { key: 'button', label: 'Button', icon: ICON_BUTTON },
  { key: 'tabs', label: 'Tabs', icon: ICON_TABS },
  { key: 'dropdowns', label: 'Dropdowns', icon: ICON_DROPDOWNS },
  { key: 'typography', label: 'Typography', icon: ICON_TYPOGRAPHY },
  { key: 'accent', label: 'Accent', icon: ICON_ACCENT },
  { key: 'shape', label: 'Shape', icon: ICON_SHAPE },
  { key: 'loading', label: 'Loading', icon: ICON_LOADING },
  { key: 'forms', label: 'Forms', icon: ICON_FORMS },
  { key: 'components', label: 'Components', icon: ICON_COMPONENTS },
  { key: 'utilities', label: 'Utilities', icon: ICON_UTILITIES },
  { key: 'cards', label: 'Cards', icon: ICON_SHAPE },
  { key: 'customCSS', label: 'Custom CSS', icon: ICON_CSS },
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

  const [tab, setTab] = useState<TabKey>('background');
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

  const patch = (section: TabKey, p: Record<string, any>) => patchDraft(section, p);

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

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        <div className="lg:col-span-7 xl:col-span-8 space-y-4">
          <GlassCard className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <input
              type="text"
              className="w-full bg-black/30 border border-white/10 rounded-md px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-white/60"
              label="Theme name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="My Theme"
            />
            <input
              type="text"
              className="w-full bg-black/30 border border-white/10 rounded-md px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-white/60"
              label="Description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="A short note about this theme."
            />
          </GlassCard>

          <div className="flex gap-2 overflow-x-auto pb-1">
            {TABS.map((t) => (
              <button
                key={t.key}
                type="button"
                onClick={() => setTab(t.key)}
                className={`ks-tab shrink-0 flex items-center gap-2 transition ${tab === t.key ? 'ks-tab-active' : ''}`}
              >
                <span className="inline-flex items-center">{t.icon}</span>
                {t.label}
              </button>
            ))}
          </div>

          <GlassCard className="space-y-4">
            {tab === 'background' && <BackgroundTab draft={draft} patch={patch} />}
            {tab === 'card' && <CardTab draft={draft} patch={patch} />}
            {tab === 'sidebar' && <SidebarTab draft={draft} patch={patch} />}
            {tab === 'header' && <HeaderTab draft={draft} patch={patch} />}
            {tab === 'button' && <ButtonTab draft={draft} patch={patch} />}
            {tab === 'tabs' && <TabsTab draft={draft} patch={patch} />}
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
          </GlassCard>

          <GlassCard className="">
            <Label label="Tip" />
            <p className="text-xs text-gray-400 leading-relaxed">
              Edits here preview live on the whole panel — drag the Background opacity, switch to an image, or
              soften a card's border radius. Use <span className="text-gray-200">Reset preview</span> to jump back
              to the currently-saved theme without saving.
            </p>
          </GlassCard>
        </div>

        <div className="lg:col-span-5 xl:col-span-4">
          <div className="sticky top-4 space-y-4">
            <GlassCard className="">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-sm font-semibold text-white">Live preview</h3>
                <span className="text-xs text-gray-500">As you edit</span>
              </div>
              <ThemePreview theme={draft as Theme} className="mb-3" />

              <div
                className="rounded-lg overflow-hidden border"
                style={{
                  background: draft.background.type === 'color' ? draft.background.color : '#0a0a0a',
                  borderColor: 'rgba(255,255,255,0.08)',
                }}
              >
                <div style={{
                  height: draft.header.height / 2, display: 'flex', alignItems: 'center',
                  background: draft.header.background,
                  color: draft.header.text_color, padding: '0 8px',
                  borderColor: draft.header.border_color, borderBottomWidth: 1, borderStyle: 'solid',
                }}>
                  <span style={{ fontSize: 9, fontWeight: 600 }}>{name || 'My Theme'}</span>
                </div>
                <div style={{ display: 'flex', height: 80 }}>
                  <div style={{
                    width: 36, background: draft.sidebar.background,
                    borderColor: draft.sidebar.border_color, borderRightWidth: 1, borderStyle: 'solid',
                    padding: '5px 3px', display: 'flex', flexDirection: 'column', gap: 4,
                  }}>
                    <span style={{ height: 6, background: draft.sidebar.active_background, borderRadius: 2 }} />
                    <span style={{ height: 6, background: draft.sidebar.text_color, opacity: 0.45, borderRadius: 2 }} />
                    <span style={{ height: 6, background: draft.sidebar.text_color, opacity: 0.45, borderRadius: 2 }} />
                  </div>

                  <div style={{ flex: 1, padding: 8 }}>
                    <div style={{
                      background: draft.card.background,
                      borderColor: draft.card.border_color,
                      borderWidth: draft.card.border_width, borderStyle: 'solid',
                      borderRadius: draft.card.border_radius / 2,
                      boxShadow: draft.card.shadow,
                      padding: draft.card.padding / 2, height: '100%',
                      color: draft.card.text_color, display: 'flex', flexDirection: 'column', gap: 5,
                    }}>
                      <span style={{ fontSize: 8, fontWeight: 700, color: draft.typography.heading_color }}>Dashboard</span>
                      <span style={{ fontSize: 7, color: draft.typography.body_color }}>Total: 12 instances · 3 nodes</span>
                      <div>
                        <span style={{
                          display: 'inline-block', fontSize: 8, fontWeight: 600,
                          background: draft.button.background, color: draft.button.text_color,
                          borderRadius: draft.button.border_radius,
                          padding: `${draft.button.padding_y / 2}px ${draft.button.padding_x / 2}px`,
                        }}>Create</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </GlassCard>

            <GlassCard className="">
              <Label label="Tip" />
              <p className="text-xs text-gray-400 leading-relaxed">
                Edits here preview live on the whole panel — drag the Background opacity, switch to an image, or
                soften a card's border radius. Use <span className="text-gray-200">Reset preview</span> to jump back
                to the currently-saved theme without saving.
              </p>
            </GlassCard>
          </div>
        </div>

        <div className="flex justify-end items-center gap-2 flex-wrap">
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
      </div>
    </div>
  );
};

export default ThemeStudio;