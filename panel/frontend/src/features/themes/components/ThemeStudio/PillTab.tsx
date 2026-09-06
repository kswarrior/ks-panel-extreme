import React, { useEffect, useRef, useState } from 'react';
import { ColorField, Label, Text, Slider, Select } from '@/theme/studioControls';

interface PillTabProps {
  draft: any;
  patch: (section: 'pill', p: Record<string, any>) => void;
}

export const PillTab: React.FC<PillTabProps> = ({ draft, patch }) => {
  const p = draft.pill;
  const autoOn = p.auto_hide_enabled ?? true;

  // Live preview — a miniature of the real top-right pill, painted straight
  // from the draft (surface / sizing / motion / timing). "Simulate
  // auto-off" collapses it with the chosen animation, then slides it back
  // on after the chosen delay so the timing can be felt before saving.
  const [previewOff, setPreviewOff] = useState(false);
  const previewTimer = useRef<number | null>(null);
  useEffect(() => {
    return () => {
      if (previewTimer.current) window.clearTimeout(previewTimer.current);
    };
  }, []);
  const simulateOff = () => {
    if (previewTimer.current) window.clearTimeout(previewTimer.current);
    setPreviewOff(true);
    previewTimer.current = window.setTimeout(() => setPreviewOff(false), Math.max(300, Number(p.auto_show_delay) || 2500));
  };
  const hiddenTransform =
    p.animation === 'fade' ? 'none'
    : p.animation === 'scale' ? 'scale(0.92)'
    : p.animation === 'none' ? 'none'
    : 'translateX(8px)';
  // Tabs Pill preview is the manual upward dropdown (closed `ActiveLabel <`
  // vs open `PageName ^` + vertical list), so it has no collapse transform.

  return (
    <div className="space-y-4">
      <div className="ks-form-card rounded-lg space-y-4">
        <Label label="Surface" hint="The glass background of both pills — the top-right Actions Pill and the phone Tabs Pill share these settings." />
        <ColorField label="Background" value={p.background} onChange={(v) => patch('pill', { background: v })} />
        <ColorField label="Border color" value={p.border_color} onChange={(v) => patch('pill', { border_color: v })} />
        <ColorField label="Toggle color" value={p.text_color} onChange={(v) => patch('pill', { text_color: v })} hint="Tint of the `<` / `>` / `^` collapse chevron." />
        <Text label="Shadow (CSS)" value={p.shadow} onChange={(v) => patch('pill', { shadow: v })} mono placeholder="0 8px 32px rgba(0,0,0,0.45)" />
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
          <Slider label="Border width" max={4} value={p.border_width} onChange={(v) => patch('pill', { border_width: v })} />
          <Slider label="Border radius" max={24} value={p.border_radius} onChange={(v) => patch('pill', { border_radius: v })} />
          <Slider label="Padding" max={24} value={p.padding} onChange={(v) => patch('pill', { padding: v })} />
          <Slider label="Backdrop blur" max={40} value={p.backdrop_blur} onChange={(v) => patch('pill', { backdrop_blur: v })} />
        </div>
      </div>

      <div className="ks-form-card rounded-lg space-y-4">
        <Label label="Buttons" hint="Size of the buttons living inside both pills (actions + phone tabs)." />
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Slider label="Button padding X" max={24} value={p.tab_padding_x} onChange={(v) => patch('pill', { tab_padding_x: v })} />
          <Slider label="Button padding Y" max={16} value={p.tab_padding_y} onChange={(v) => patch('pill', { tab_padding_y: v })} />
          <Slider label="Button font size" min={10} max={20} value={p.font_size} onChange={(v) => patch('pill', { font_size: v })} />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Slider label="Button gap" max={16} value={p.gap} onChange={(v) => patch('pill', { gap: v })} />
          <Slider label="Toggle icon size" min={12} max={28} value={p.icon_size} onChange={(v) => patch('pill', { icon_size: v })} />
        </div>
      </div>

      <div className="ks-form-card rounded-lg space-y-4">
        <Label label="Tabs menu width" hint="Width of the phone Tabs Pill's upward dropdown. Shrink hugs the longest tab label; fixed uses the pixel width below (clamped to the viewport)." />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Select
            label="Menu width"
            value={p.tabs_menu_width ?? 'shrink'}
            options={[
              { label: 'Shrink to content', value: 'shrink' },
              { label: 'Fixed width', value: 'fixed' },
            ]}
            onChange={(v) => patch('pill', { tabs_menu_width: v as any })}
          />
          {(p.tabs_menu_width ?? 'shrink') === 'fixed' && (
            <Slider label="Fixed width" min={160} max={480} step={10} suffix="px" value={p.tabs_menu_fixed_width ?? 240} onChange={(v) => patch('pill', { tabs_menu_fixed_width: v })} />
          )}
        </div>
      </div>

      <div className="ks-form-card rounded-lg space-y-4">
        <Label label="Collapse animation" hint="Motion played when either pill goes off / on. A pill never disappears — off just shows `<`." />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Select
            label="Animation"
            value={p.animation}
            options={[
              { label: 'Slide + fade', value: 'slide' },
              { label: 'Fade only', value: 'fade' },
              { label: 'Scale + fade', value: 'scale' },
              { label: 'None (instant)', value: 'none' },
            ]}
            onChange={(v) => patch('pill', { animation: v as any })}
          />
          <Slider label="Animation duration" min={0} max={1000} step={50} suffix="ms" value={p.animation_duration} onChange={(v) => patch('pill', { animation_duration: v })} />
        </div>
      </div>

      <div className="ks-form-card rounded-lg space-y-4">
        <Label label="Auto-off timing" hint="Scroll or outside-click collapses the Actions pill to `<`; idle slides it back on. The phone Tabs pill is manual-only — it starts closed and only its toggle opens it." />
        <label className="flex items-center gap-2 text-xs text-gray-300">
          <input
            type="checkbox"
            checked={autoOn}
            onChange={(e) => patch('pill', { auto_hide_enabled: e.target.checked })}
            className="ks-checkbox w-4 h-4"
          />
          Auto-off on scroll / outside-click
        </label>
        {autoOn && (
          <Slider
            label="Auto-on delay"
            min={500}
            max={10000}
            step={100}
            suffix="ms"
            value={p.auto_show_delay}
            onChange={(v) => patch('pill', { auto_show_delay: v })}
          />
        )}
        {!autoOn && (
          <p className="text-xs text-gray-500">Auto-off disabled — both pills stay open until their `&gt;` toggle is clicked.</p>
        )}
      </div>

      <div className="ks-form-card rounded-lg space-y-3">
        <Label label="Preview" hint="Live samples painted from this tab — the Actions Pill (top-right) and the Tabs Pill (phone bottom dropdown). Simulate collapses both (the Tabs Pill re-opens via its toggle)." />
        <p className="text-[11px] uppercase tracking-wide text-gray-500">Actions Pill</p>
        <div className="flex items-center justify-end">
          <div
            className="flex items-center shadow-lg shadow-black/40"
            style={{
              background: p.background,
              borderColor: p.border_color,
              borderWidth: p.border_width,
              borderStyle: 'solid',
              borderRadius: p.border_radius,
              boxShadow: p.shadow,
              padding: p.padding,
              backdropFilter: `blur(${p.backdrop_blur}px)`,
              color: p.text_color,
            }}
          >
            <div
              className="flex items-center overflow-hidden transition-all ease-in-out"
              style={
                previewOff
                  ? {
                      maxWidth: 0,
                      opacity: 0,
                      transform: hiddenTransform,
                      transformOrigin: p.animation === 'scale' ? 'right center' : undefined,
                      transitionDuration: `${p.animation_duration}ms`,
                      transitionProperty: p.animation === 'none' ? 'none' : undefined,
                      pointerEvents: 'none',
                      visibility: 'hidden',
                      padding: 0,
                      margin: 0,
                      gap: 0,
                    }
                  : {
                      maxWidth: 400,
                      opacity: 1,
                      transform: 'none',
                      transitionDuration: `${p.animation_duration}ms`,
                      transitionProperty: p.animation === 'none' ? 'none' : undefined,
                      padding: 0,
                      margin: 0,
                      gap: p.gap,
                    }
              }
              aria-hidden={previewOff}
            >
              {['Search', 'Filter', '+'].map((t) => (
                <span
                  key={t}
                  className="ks-tab inline-flex items-center justify-center shrink-0 whitespace-nowrap"
                  style={{
                    ['--ks-tab-px' as any]: `${p.tab_padding_x}px`,
                    ['--ks-tab-py' as any]: `${p.tab_padding_y}px`,
                    ['--ks-tab-font' as any]: `${p.font_size}px`,
                  }}
                >
                  {t}
                </span>
              ))}
            </div>
            <span
              className="ks-tab inline-flex items-center justify-center shrink-0"
              style={{
                ['--ks-tab-px' as any]: `${p.tab_padding_x}px`,
                ['--ks-tab-py' as any]: `${p.tab_padding_y}px`,
                color: p.text_color,
              }}
              aria-hidden="true"
            >
              {previewOff ? (
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ width: p.icon_size, height: p.icon_size }}><polyline points="15 18 9 12 15 6" /></svg>
              ) : (
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ width: p.icon_size, height: p.icon_size }}><polyline points="9 18 15 12 9 6" /></svg>
              )}
            </span>
          </div>
        </div>
        <p className="text-[11px] uppercase tracking-wide text-gray-500 pt-1">Tabs Pill</p>
        <div className="flex items-center justify-start">
          <div
            className="flex flex-col items-stretch shadow-lg shadow-black/40 w-fit"
            style={{
              background: p.background,
              borderColor: p.border_color,
              borderWidth: p.border_width,
              borderStyle: 'solid',
              borderRadius: p.border_radius,
              boxShadow: p.shadow,
              padding: p.padding,
              backdropFilter: `blur(${p.backdrop_blur}px)`,
              color: p.text_color,
              ...((p.tabs_menu_width ?? 'shrink') === 'fixed' && !previewOff
                ? { width: `${p.tabs_menu_fixed_width ?? 240}px`, maxWidth: '100%' }
                : { maxWidth: '100%' }),
            }}
          >
            {!previewOff && (
              <div
                className="flex flex-col w-full min-w-0 pb-1 mb-1 border-b border-white/10"
                style={{ gap: p.gap }}
              >
                {['Theme', 'Background', 'Button', 'Tabs'].map((t, i) => (
                  <span
                    key={t}
                    className={`ks-tab inline-flex items-center justify-start w-full whitespace-nowrap ${i === 0 ? 'ks-tab-active' : ''}`}
                    style={{
                      ['--ks-tab-px' as any]: `${p.tab_padding_x}px`,
                      ['--ks-tab-py' as any]: `${p.tab_padding_y}px`,
                      ['--ks-tab-font' as any]: `${p.font_size}px`,
                    }}
                  >
                    {t}
                  </span>
                ))}
              </div>
            )}
            <span
              className="ks-tab inline-flex items-center justify-between gap-1.5 shrink-0 w-full"
              style={{
                ['--ks-tab-px' as any]: `${p.tab_padding_x}px`,
                ['--ks-tab-py' as any]: `${p.tab_padding_y}px`,
                color: p.text_color,
              }}
              aria-hidden="true"
            >
              <span className="inline-flex items-center gap-1.5 min-w-0">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={{ width: p.icon_size, height: p.icon_size }}><rect x="3" y="5" width="18" height="14" rx="2" /><line x1="3" y1="10" x2="21" y2="10" /></svg>
                <span className="whitespace-nowrap leading-none" style={{ fontSize: p.font_size }}>{previewOff ? 'Theme' : 'Themes'}</span>
              </span>
              {previewOff ? (
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ width: p.icon_size, height: p.icon_size }}><polyline points="15 18 9 12 15 6" /></svg>
              ) : (
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ width: p.icon_size, height: p.icon_size }}><polyline points="18 15 12 9 6 15" /></svg>
              )}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={simulateOff}
            disabled={!autoOn}
            className="ks-ghost-btn px-3 py-1.5 text-xs rounded border border-white/10 bg-white/5 hover:bg-white/10 text-gray-200 disabled:opacity-40"
          >
            Simulate auto-off
          </button>
          <span className="text-[11px] text-gray-500">
            {autoOn ? `off → on after ${p.auto_show_delay}ms` : 'enable auto-off to test timing'}
          </span>
        </div>
      </div>
    </div>
  );
};
