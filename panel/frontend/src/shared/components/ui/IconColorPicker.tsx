// IconColorPicker — shared icon + accent-colour picker with live card preview.
//
// Used by TemplateForm (General), Instance Page Studio (Settings),
// Application Studio/Edit (General) and Theme Studio so every entity gets
// the same UX the Nodes / Instances forms already have:
//   - left: live preview tile tinted with the chosen colour
//   - icon preset gallery (inner-SVG markup, lucide style)
//   - colour swatches + custom colour (native picker + #rrggbb input)
//   - custom SVG textarea (full <svg> or inner markup, sanitised on render)
//
// Colours are #rrggbb hex; empty == theme default. Icons are raw SVG inner
// markup (e.g. `<path .../>`) or a full `<svg>…</svg>` block — both render
// through sanitizeSvgIcon so pasted markup can never execute script.

import React, { useMemo, useState } from 'react';
import { glassFieldClass } from '@/shared/components/ui/Field';
import { sanitizeSvgIcon } from '@/shared/utils/sanitizeSvgIcon';

export const ICON_COLOR_SWATCHES: string[] = [
  '#34d399',
  '#38bdf8',
  '#60a5fa',
  '#a78bfa',
  '#f472b6',
  '#f87171',
  '#fbbf24',
  '#fb923c',
  '#a3e635',
  '#2dd4bf',
];

export const ICON_COLOR_NAMES: Record<string, string> = {
  '#34d399': 'Emerald',
  '#38bdf8': 'Sky',
  '#60a5fa': 'Blue',
  '#a78bfa': 'Violet',
  '#f472b6': 'Pink',
  '#f87171': 'Red',
  '#fbbf24': 'Amber',
  '#fb923c': 'Orange',
  '#a3e635': 'Lime',
  '#2dd4bf': 'Teal',
};

export const ICON_PRESETS: Array<{ label: string; svg: string }> = [
  { label: 'Box', svg: '<path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/>' },
  { label: 'Server', svg: '<rect x="2" y="2" width="20" height="8" rx="2"/><rect x="2" y="14" width="20" height="8" rx="2"/><line x1="6" y1="6" x2="6.01" y2="6"/><line x1="6" y1="18" x2="6.01" y2="18"/>' },
  { label: 'Clock', svg: '<circle cx="12" cy="13" r="8"/><path d="M12 9v4l2.5 2.5"/><path d="M9 2h6"/><path d="m19 5 1.5 1.5"/>' },
  { label: 'Drive', svg: '<line x1="22" y1="12" x2="2" y2="12"/><path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"/><line x1="6" y1="16" x2="6.01" y2="16"/><line x1="10" y1="16" x2="10.01" y2="16"/>' },
  { label: 'Download', svg: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>' },
  { label: 'Shield', svg: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="M12 8v4"/><path d="M12 16h.01"/>' },
  { label: 'Users', svg: '<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>' },
  { label: 'CPU', svg: '<rect x="4" y="4" width="16" height="16" rx="2"/><rect x="9" y="9" width="6" height="6"/><path d="M9 1v3"/><path d="M15 1v3"/><path d="M9 20v3"/><path d="M15 20v3"/><path d="M20 9h3"/><path d="M20 14h3"/><path d="M1 9h3"/><path d="M1 14h3"/>' },
  { label: 'File', svg: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/><path d="m9 15 2 2 4-4"/>' },
  { label: 'Sun', svg: '<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M2 12h3M19 12h3M4.9 19.1 7 17M17 7l2.1-2.1"/>' },
  { label: 'Refresh', svg: '<path d="M21 12a9 9 0 1 1-3-6.7"/><path d="M21 3v5h-5"/>' },
  { label: 'Layers', svg: '<path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/>' },
  { label: 'Globe', svg: '<circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>' },
  { label: 'Terminal', svg: '<polyline points="4 17 10 11 4 5"/><line x1="12" y1="19" x2="20" y2="19"/>' },
  { label: 'Database', svg: '<ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"/><path d="M3 12c0 1.66 4 3 9 3s9-1.34 9-3"/>' },
  { label: 'Zap', svg: '<polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>' },
];

export const HEX_RE = /^#[0-9a-fA-F]{6}$/;

export function renderIconInner(icon: string): { isFullSvg: boolean; sanitized: string } {
  const sanitized = sanitizeSvgIcon(icon || '');
  const isFullSvg = sanitized.trim().toLowerCase().startsWith('<svg');
  return { isFullSvg, sanitized };
}

export interface IconColorPickerProps {
  icon: string;
  color: string;
  onIconChange: (v: string) => void;
  onColorChange: (v: string) => void;
  previewName?: string;
  /** Fallback glyph when no icon is set (rendered inside preview tile). */
  fallback?: React.ReactNode;
}

export const IconColorPicker: React.FC<IconColorPickerProps> = ({
  icon,
  color,
  onIconChange,
  onColorChange,
  previewName,
  fallback,
}) => {
  const [customColorOpen, setCustomColorOpen] = useState(false);
  const trimmedColor = (color || '').trim();
  const colorOk = trimmedColor === '' || HEX_RE.test(trimmedColor);
  const presetMatch = useMemo(
    () => ICON_COLOR_SWATCHES.find((c) => c.toLowerCase() === trimmedColor.toLowerCase()) ?? null,
    [trimmedColor],
  );
  const showCustomColor = customColorOpen || (trimmedColor !== '' && !presetMatch);

  const { isFullSvg, sanitized } = renderIconInner(icon);

  return (
    <div className="rounded-md border border-white/10 bg-black/20 p-3 space-y-3">
      <div className="flex items-start gap-3">
        {/* Live preview tile — same shape as node / instance cards */}
        <div className="flex flex-col items-center gap-1 shrink-0" title="Card preview">
          <span
            className="w-12 h-12 rounded-lg flex items-center justify-center border bg-white/[0.05] border-white/10 overflow-hidden"
            style={colorOk && trimmedColor ? { color: trimmedColor } : undefined}
            aria-hidden="true"
          >
            {sanitized ? (
              isFullSvg ? (
                <span
                  className="w-6 h-6 block [&>svg]:w-6 [&>svg]:h-6 [&>svg]:block"
                  dangerouslySetInnerHTML={{ __html: sanitized }}
                />
              ) : (
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="w-6 h-6">
                  <g dangerouslySetInnerHTML={{ __html: sanitized }} />
                </svg>
              )
            ) : fallback ? (
              <>{fallback}</>
            ) : (
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" className="w-6 h-6 text-gray-500"><circle cx="12" cy="12" r="9" /><path d="M12 8v8" /><path d="M8 12h8" /></svg>
            )}
          </span>
          {previewName !== undefined && (
            <span className="text-[11px] text-gray-500 max-w-[4.5rem] truncate">{previewName.trim() || 'Preview'}</span>
          )}
        </div>

        <div className="flex-1 min-w-0 space-y-3">
          <div>
            <span className="block text-xs text-gray-400 mb-1.5">Icon — pick a preset or paste SVG below</span>
            <div className="flex flex-wrap gap-1.5">
              <button
                type="button"
                onClick={() => onIconChange('')}
                title="No icon (driver / kind default)"
                className={`w-9 h-9 rounded-lg border bg-white/[0.04] text-gray-300 hover:text-white hover:border-white/25 inline-flex items-center justify-center ${!icon ? 'border-emerald-500' : 'border-white/10'}`}
              >
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
              </button>
              {ICON_PRESETS.map((p) => (
                <button
                  key={p.label}
                  type="button"
                  title={p.label}
                  onClick={() => onIconChange(p.svg)}
                  className={`w-9 h-9 rounded-lg border bg-white/[0.04] text-gray-300 hover:text-white hover:border-white/25 inline-flex items-center justify-center ${icon === p.svg ? 'border-emerald-500' : 'border-white/10'}`}
                >
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" className="w-4 h-4"><g dangerouslySetInnerHTML={{ __html: p.svg }} /></svg>
                </button>
              ))}
            </div>
          </div>

          <div>
            <span className="block text-xs text-gray-400 mb-1.5">Colour — tints the icon on cards</span>
            <div className="flex flex-wrap items-center gap-1.5">
              <button
                type="button"
                onClick={() => { onColorChange(''); setCustomColorOpen(false); }}
                title="Default (no tint)"
                className={`px-2.5 h-8 rounded-lg border text-xs transition-colors ${trimmedColor === '' ? 'border-emerald-500 text-white bg-emerald-500/10' : 'border-white/10 bg-white/5 text-gray-300 hover:border-white/25'}`}
              >
                Default
              </button>
              {ICON_COLOR_SWATCHES.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => { onColorChange(c); setCustomColorOpen(false); }}
                  title={`${ICON_COLOR_NAMES[c.toLowerCase()] ?? c} (${c.toUpperCase()})`}
                  className={`w-8 h-8 rounded-lg border transition-transform ${presetMatch === c ? 'border-white scale-105' : 'border-white/10 hover:border-white/30'}`}
                  style={{ backgroundColor: c }}
                >
                  {presetMatch === c && (
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" className="w-5 h-5 m-auto"><polyline points="20 6 9 17 4 12" /></svg>
                  )}
                </button>
              ))}
              <button
                type="button"
                onClick={() => setCustomColorOpen((v) => !v)}
                title="Custom colour"
                className={`px-2.5 h-8 rounded-lg border text-xs transition-colors ${showCustomColor && trimmedColor !== '' ? 'border-emerald-500 text-white bg-emerald-500/10' : 'border-white/10 bg-white/5 text-gray-300 hover:border-white/25'}`}
              >
                Custom
              </button>
            </div>
          </div>
        </div>
      </div>

      {showCustomColor && (
        <div className="flex flex-wrap items-center gap-2">
          <input
            type="color"
            value={HEX_RE.test(trimmedColor) ? trimmedColor : '#34d399'}
            onChange={(e) => onColorChange(e.target.value.toUpperCase())}
            className="h-9 w-12 cursor-pointer rounded border border-white/10 bg-transparent p-0.5"
            aria-label="Custom colour picker"
          />
          <input
            type="text"
            value={color}
            onChange={(e) => onColorChange(e.target.value)}
            placeholder="#rrggbb"
            spellCheck={false}
            autoComplete="off"
            className={`${glassFieldClass} flex-1 min-w-[8rem] font-mono text-xs`}
          />
        </div>
      )}
      {!colorOk && <p className="text-xs text-red-400">Colour must be a #rrggbb hex value (or empty for default)</p>}

      <div>
        <label className="block text-xs text-gray-400 mb-1">Custom icon SVG (inner markup or full &lt;svg&gt; block)</label>
        <textarea
          value={icon}
          onChange={(e) => onIconChange(e.target.value)}
          rows={2}
          className={`${glassFieldClass} font-mono text-xs w-full`}
          placeholder='<path d="M12 2L2 7l10 5 10-5-10-5z" />'
        />
      </div>
    </div>
  );
};

/** CardIconTile renders an icon tinted with its colour inside a card header —
 *  the same tile Nodes / Instances use, so Templates / Pages / Applications /
 *  Themes cards read identically. Falls back to `fallback` when empty. */
export const CardIconTile: React.FC<{
  icon?: string;
  color?: string;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
  fallback?: React.ReactNode;
}> = ({ icon, color, size = 'md', className, fallback }) => {
  const sz = size === 'sm' ? 'w-10 h-10' : size === 'lg' ? 'w-12 h-12' : 'w-10 h-10';
  const inner = size === 'lg' ? 'w-6 h-6' : 'w-5 h-5';
  const { isFullSvg, sanitized } = renderIconInner(icon || '');
  const c = (color || '').trim();
  return (
    <div
      className={`shrink-0 ${sz} rounded-lg flex items-center justify-center border bg-white/[0.05] border-white/10 overflow-hidden ${className ?? ''}`}
      style={c ? { color: c } : undefined}
      aria-hidden="true"
    >
      {sanitized ? (
        isFullSvg ? (
          <span className={`${inner} block [&>svg]:w-full [&>svg]:h-full [&>svg]:block`} dangerouslySetInnerHTML={{ __html: sanitized }} />
        ) : (
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className={inner}>
            <g dangerouslySetInnerHTML={{ __html: sanitized }} />
          </svg>
        )
      ) : (
        <>{fallback}</>
      )}
    </div>
  );
};

export default IconColorPicker;
