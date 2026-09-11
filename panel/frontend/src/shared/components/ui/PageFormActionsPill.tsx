import React, { useEffect, useMemo, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useThemeStore } from '@/shared/stores/themeStore';
import { PILL_SHOW_DELAY, PILL_TAB_STYLE, PILL_TOGGLE_COLLAPSED_PX, useAutoHidePill } from './PageActionsPill';

interface PageFormActionsPillProps {
  children: React.ReactNode;
  className?: string;
  outerClassName?: string;
  outerStyle?: React.CSSProperties;
  // Reserves scroll room so the fixed bottom bar never covers trailing
  // content. Disable when the caller already renders its own spacer
  // (e.g. a form that also mounts the phone Tabs pill).
  spacer?: boolean;
}

// Mount counter for the body flag below — several pills never coexist on
// one page, but StrictMode double-mounts, so a bare set/remove would flap.
let formBarMounts = 0;

// PageFormActionsPill renders the bottom-docked form-action bar (Cancel /
// Create / Save / Deploy / Broadcast …) used by every panel form: a
// full-width bar fixed to the screen bottom (tabs-pill positioning) with
// the buttons hugging the right — never a floating card over the content.
// ALWAYS visible by default. Auto-off (scroll / outside-click, idle
// restore) is opt-in via the Theme Studio's Pill tab
// (`form_actions_auto_hide_enabled` + `form_actions_auto_show_delay`) —
// the Default theme ships it OFF so Save is never hidden. The manual `>`
// / `<` toggle always works. Surface / sizing / motion all come from the
// Pill tab, shared with the Actions + Tabs pills (paint via --ks-pill-*
// vars, collapse motion resolved for the current route).
//
// While mounted it sets body[data-ks-form-actions] so the phone Tabs pill
// (same bottom strip) lifts above the bar instead of sliding underneath
// it — see the lift rules in themeStore.
export const PageFormActionsPill: React.FC<PageFormActionsPillProps> = ({
  children,
  className = '',
  outerClassName,
  outerStyle,
  spacer = true,
}) => {
  const location = useLocation();
  const resolveThemeForRoute = useThemeStore((s) => s.resolveThemeForRoute);
  const pillTheme = useMemo(
    () => resolveThemeForRoute(location.pathname)?.pill as any,
    [resolveThemeForRoute, location.pathname],
  );
  // Own auto-off switch — defaults OFF (always show). Falls back to the
  // shared actions-pill delay when no explicit form-actions delay is set
  // so older themes still get a sane timing once auto is enabled.
  const autoEnabled = pillTheme?.form_actions_auto_hide_enabled ?? false;
  const autoDelay =
    pillTheme?.form_actions_auto_show_delay ??
    pillTheme?.auto_show_delay ??
    PILL_SHOW_DELAY;
  const animation = pillTheme?.animation ?? 'slide';
  const { visible, ref, show } = useAutoHidePill(autoDelay, autoEnabled);
  const [manualOff, setManualOff] = useState(false);
  const isOff = manualOff || (autoEnabled && !visible);
  const toggle = () => {
    show();
    setManualOff(isOff ? false : true);
  };
  const hiddenTransform =
    animation === 'fade' ? 'none'
    : animation === 'scale' ? 'scale(0.92)'
    : animation === 'none' ? 'none'
    : 'translateX(8px)';
  // Signal the docked bar so the phone Tabs pill lifts above it.
  useEffect(() => {
    formBarMounts += 1;
    if (formBarMounts === 1) document.body.dataset.ksFormActions = '1';
    return () => {
      formBarMounts = Math.max(0, formBarMounts - 1);
      if (formBarMounts === 0) delete document.body.dataset.ksFormActions;
    };
  }, []);
  return (
    <>
      <div
        className={outerClassName ?? 'fixed inset-x-4 bottom-[max(0.75rem,env(safe-area-inset-bottom))] z-40 flex justify-end'}
        style={outerStyle}
        onMouseEnter={show}
      >
        <div
          ref={ref}
          className={`ks-card ks-pill-anim ks-form-actions-pill rounded-md flex items-center justify-end flex-wrap w-full shadow-lg shadow-black/40 opacity-100 ${isOff ? 'ks-pill-collapsed' : ''} ${animation === 'none' ? 'ks-pill-instant' : ''} ${className}`}
          style={{ '--ks-card-padding': '6px' } as React.CSSProperties}
        >
          <div
            className="ks-pill-content flex items-center gap-1 transition-all duration-300 ease-in-out"
            style={
              isOff
                ? {
                    maxWidth: 0,
                    opacity: 0,
                    transform: hiddenTransform,
                    transformOrigin: animation === 'scale' ? 'right center' : undefined,
                    transition: animation === 'none' ? 'none' : undefined,
                    pointerEvents: 'none' as const,
                    visibility: 'hidden' as const,
                    overflow: 'hidden' as const,
                    padding: 0,
                    margin: 0,
                  }
                : { maxWidth: 800, opacity: 1, transform: 'none', padding: 0, margin: 0, overflow: 'visible' as const }
            }
            aria-hidden={isOff}
          >
            {children}
          </div>
          <button
            type="button"
            onClick={toggle}
            aria-label={isOff ? 'Show form actions' : 'Hide form actions'}
            aria-expanded={!isOff}
            title={isOff ? 'Show form actions' : 'Hide form actions'}
            style={
              isOff
                ? ({ ...PILL_TAB_STYLE, '--ks-tab-px': PILL_TOGGLE_COLLAPSED_PX } as React.CSSProperties)
                : PILL_TAB_STYLE
            }
            className="ks-tab ks-pill-toggle inline-flex items-center justify-center shrink-0"
          >
            {isOff ? (
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4" aria-hidden="true"><polyline points="15 18 9 12 15 6" /></svg>
            ) : (
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4" aria-hidden="true"><polyline points="9 18 15 12 9 6" /></svg>
            )}
          </button>
        </div>
      </div>
      {spacer && <div aria-hidden="true" className="h-20" />}
    </>
  );
};

export default PageFormActionsPill;
