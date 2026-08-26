import React, { useEffect, useRef } from 'react';
import { useThemeStore } from '@/shared/stores/themeStore';
import { useConfirmStore, type ConfirmTone } from '@/shared/stores/confirmStore';

// Themed confirmation dialog — the panel-owned replacement for
// window.confirm(). Mirrors Modal.tsx surface conventions
// (ks-modal-panel + glass-strong so Theme Studio restyles it too), with a
// tone-tinted icon, explicit Cancel/Confirm actions and Escape-to-cancel.
// Mounted once in App; state lives in confirmStore.

const TONE_STYLES: Record<ConfirmTone, { iconWrap: string; button: string }> = {
  danger: {
    iconWrap: 'bg-red-500/15 text-red-300 ring-red-500/30',
    button: 'bg-red-600 hover:bg-red-500 focus-visible:outline-red-400',
  },
  warning: {
    iconWrap: 'bg-amber-500/15 text-amber-300 ring-amber-500/30',
    button: 'bg-amber-600 hover:bg-amber-500 focus-visible:outline-amber-400',
  },
  default: {
    iconWrap: 'bg-sky-500/15 text-sky-300 ring-sky-500/30',
    button: 'bg-sky-600 hover:bg-sky-500 focus-visible:outline-sky-400',
  },
};

const ToneIcon: React.FC<{ tone: ConfirmTone }> = ({ tone }) => {
  const common = 'w-5 h-5';
  if (tone === 'default') {
    return (
      <svg className={common} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10" />
        <line x1="12" y1="16" x2="12" y2="12" />
        <line x1="12" y1="8" x2="12.01" y2="8" />
      </svg>
    );
  }
  return (
    <svg className={common} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
      <line x1="12" y1="9" x2="12" y2="13" />
      <line x1="12" y1="17" x2="12.01" y2="17" />
    </svg>
  );
};

const ConfirmDialog: React.FC = () => {
  const open = useConfirmStore((s) => s.open);
  const opts = useConfirmStore((s) => s.opts);
  const settle = useConfirmStore((s) => s.settle);
  const glassStyle = useThemeStore((s) => s.active().card.glass_style);
  const confirmRef = useRef<HTMLButtonElement>(null);

  const modifier = !glassStyle || glassStyle === 'frosted'
    ? ''
    : glassStyle === 'solid'
      ? 'ks-card-glass-solid'
      : 'ks-card-glass-strong';

  useEffect(() => {
    if (!open) return;
    confirmRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        settle(false);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, settle]);

  if (!open || !opts) return null;

  const tone = opts.tone ?? 'danger';
  const ts = TONE_STYLES[tone];

  return (
    <div
      className="ks-modal-overlay fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
      role="dialog"
      aria-modal="true"
      aria-label={opts.title ?? 'Confirm'}
      onMouseDown={(e) => { if (e.target === e.currentTarget) settle(false); }}
    >
      <div className={`ks-modal-panel glass-strong ${modifier} rounded-xl w-full max-w-md`}>
        <div className="flex items-start gap-4 px-6 pt-6 pb-2">
          <div className={`shrink-0 rounded-full p-2.5 ring-1 ${ts.iconWrap}`}>
            <ToneIcon tone={tone} />
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="text-lg font-semibold text-white leading-snug">
              {opts.title ?? 'Are you sure?'}
            </h3>
            <div className="mt-1.5 text-sm text-gray-300 leading-relaxed break-words">
              {opts.message}
            </div>
          </div>
        </div>
        <div className="flex justify-end gap-2 px-6 py-5">
          <button
            type="button"
            onClick={() => settle(false)}
            className="px-4 py-2 text-sm rounded-lg border border-white/10 bg-white/5 hover:bg-white/10 text-white transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-white/40"
          >
            {opts.cancelLabel ?? 'Cancel'}
          </button>
          <button
            ref={confirmRef}
            type="button"
            onClick={() => settle(true)}
            className={`px-4 py-2 text-sm rounded-lg text-white font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-white/40 ${ts.button}`}
          >
            {opts.confirmLabel ?? 'Confirm'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ConfirmDialog;
