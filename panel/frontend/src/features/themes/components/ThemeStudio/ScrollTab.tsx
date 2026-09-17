import React from 'react';
import { ColorField, Label, Slider } from '@/theme/studioControls';
import { DEFAULT_THEME } from '@/theme/defaults';

interface ScrollTabProps {
  draft: any;
  patch: (section: 'scroll', p: Record<string, any>) => void;
}

const D: any = (DEFAULT_THEME as any).scroll ?? { sidebar: {}, page: {}, tabs: {} };

// SurfaceSection edits ONE scrollbar surface. patchDraft merges one level
// deep (section only), so every control spreads the current surface object
// — otherwise a single slider tick would wipe the surface's colours.
const SurfaceSection: React.FC<{
  title: string;
  hint: string;
  surface: any;
  fallback: any;
  onSurface: (next: Record<string, any>) => void;
  preview: React.ReactNode;
}> = ({ title, hint, surface, fallback, onSurface, preview }) => {
  const s = surface ?? {};
  const size = s.size ?? fallback.size ?? 8;
  const radius = s.radius ?? fallback.radius ?? 8;
  return (
    <div className="ks-form-card rounded-lg space-y-4">
      <Label label={title} hint={hint} />
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <Slider label="Thickness" min={0} max={20} value={size} suffix="px" onChange={(v) => onSurface({ ...s, size: v })} />
          <p className="text-xs text-gray-500 mt-1">0px hides the bar on Chromium (Firefox stays thin).</p>
        </div>
        <div>
          <Slider label="Thumb radius" min={0} max={32} value={Math.min(radius, 32)} onChange={(v) => onSurface({ ...s, radius: v })} />
          <div className="flex gap-1.5 mt-2">
            {[
              { label: 'Square', value: 0 },
              { label: 'Round', value: 8 },
              { label: 'Pill', value: 9999 },
            ].map((p) => (
              <button
                key={p.label}
                type="button"
                onClick={() => onSurface({ ...s, radius: p.value })}
                className={`px-2.5 py-1 rounded text-xs border transition ${radius === p.value ? 'bg-white/10 text-white border-white/20' : 'text-gray-400 border-transparent hover:text-white'}`}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>
      </div>
      <ColorField label="Track" value={s.track ?? fallback.track ?? 'transparent'} onChange={(v) => onSurface({ ...s, track: v })} hint="Fill behind the thumb — 'transparent' leaves the page showing through." />
      <ColorField label="Thumb" value={s.thumb ?? fallback.thumb ?? 'rgba(255,255,255,0.18)'} onChange={(v) => onSurface({ ...s, thumb: v })} hint="Solid colour or a gradient, e.g. linear-gradient(90deg, #3b82f6, #8b5cf6)." />
      <ColorField label="Thumb hover" value={s.hover ?? fallback.hover ?? 'rgba(255,255,255,0.32)'} onChange={(v) => onSurface({ ...s, hover: v })} hint="Thumb fill while the pointer rests on it." />
      {preview}
    </div>
  );
};

export const ScrollTab: React.FC<ScrollTabProps> = ({ draft, patch }) => {
  const c = draft.scroll ?? {};
  const setSurface = (key: 'sidebar' | 'page' | 'tabs') => (next: Record<string, any>) =>
    patch('scroll', { [key]: next });

  const sb = c.sidebar ?? D.sidebar;
  const pg = c.page ?? D.page;
  const tb = c.tabs ?? D.tabs;

  return (
    <div className="space-y-4">
      <SurfaceSection
        title="Sidebar"
        hint="Vertical bar inside the sidebar nav when items overflow (many pages, small screens)."
        surface={sb}
        fallback={D.sidebar}
        onSurface={setSurface('sidebar')}
        preview={(
          <div>
            <Label label="Preview — sidebar" hint="Scrolls vertically; hover the bar to feel the hover fill." />
            <div
              className="ks-sidebar-nav h-32 overflow-y-auto rounded-md border border-white/10 p-2 space-y-1.5"
              style={{
                ['--ks-scroll-sidebar-size' as any]: `${sb.size ?? D.sidebar.size}px`,
                ['--ks-scroll-sidebar-track' as any]: sb.track ?? D.sidebar.track,
                ['--ks-scroll-sidebar-thumb' as any]: sb.thumb ?? D.sidebar.thumb,
                ['--ks-scroll-sidebar-hover' as any]: sb.hover ?? D.sidebar.hover,
                ['--ks-scroll-sidebar-radius' as any]: `${sb.radius ?? D.sidebar.radius}px`,
              }}
            >
              {Array.from({ length: 12 }).map((_, i) => (
                <div key={i} className="rounded px-2.5 py-1.5 text-xs text-gray-300 bg-white/5 truncate">
                  Nav item {i + 1}
                </div>
              ))}
            </div>
          </div>
        )}
      />

      <SurfaceSection
        title="Pages"
        hint="Bars on the main page column when a page is taller or wider than the viewport."
        surface={pg}
        fallback={D.page}
        onSurface={setSurface('page')}
        preview={(
          <div>
            <Label label="Preview — page" hint="Scrolls both ways; drag the corner bars." />
            <div
              className="ks-page-scroll h-32 overflow-auto rounded-md border border-white/10 p-2"
              style={{
                ['--ks-scroll-page-size' as any]: `${pg.size ?? D.page.size}px`,
                ['--ks-scroll-page-track' as any]: pg.track ?? D.page.track,
                ['--ks-scroll-page-thumb' as any]: pg.thumb ?? D.page.thumb,
                ['--ks-scroll-page-hover' as any]: pg.hover ?? D.page.hover,
                ['--ks-scroll-page-radius' as any]: `${pg.radius ?? D.page.radius}px`,
              }}
            >
              <div style={{ width: '160%', height: '280px' }} className="rounded bg-white/5 p-2 text-xs text-gray-400">
                Page content taller + wider than its frame…
              </div>
            </div>
          </div>
        )}
      />

      <SurfaceSection
        title="Tabs"
        hint="Horizontal bars under tab strips (instance page tabs, preset strips) when tabs overflow."
        surface={tb}
        fallback={D.tabs}
        onSurface={setSurface('tabs')}
        preview={(
          <div>
            <Label label="Preview — tabs" hint="Scrolls horizontally; hover the bar to feel the hover fill." />
            <nav
              aria-label="Scrollbar preview"
              className="flex items-center gap-1.5 overflow-x-auto rounded-md border border-white/10 p-2"
              style={{
                ['--ks-scroll-tabs-size' as any]: `${tb.size ?? D.tabs.size}px`,
                ['--ks-scroll-tabs-track' as any]: tb.track ?? D.tabs.track,
                ['--ks-scroll-tabs-thumb' as any]: tb.thumb ?? D.tabs.thumb,
                ['--ks-scroll-tabs-hover' as any]: tb.hover ?? D.tabs.hover,
                ['--ks-scroll-tabs-radius' as any]: `${tb.radius ?? D.tabs.radius}px`,
              }}
            >
              {['Overview', 'Files', 'Terminal', 'Network', 'Ports', 'Env', 'Automation', 'Backups', 'Metrics', 'Audit'].map((t) => (
                <span key={t} className="shrink-0 whitespace-nowrap rounded-md bg-white/5 px-3 py-1.5 text-xs text-gray-300">
                  {t}
                </span>
              ))}
            </nav>
          </div>
        )}
      />

      <div className="ks-form-card rounded-lg space-y-2">
        <Label
          label="Notes"
          hint="Thickness applies to Chromium / Safari / Edge. Firefox always renders a thin bar and only honours solid colours there (gradients fall back to its default). The studio's own chip rails keep their edge-fade look by design and are not restyled here."
        />
      </div>
    </div>
  );
};
