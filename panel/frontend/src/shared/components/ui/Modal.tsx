import React from 'react';
import { useThemeStore } from '@/shared/stores/themeStore';

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  // Footer width override for content that fills (e.g. wide JSON
  // preview on node-token disclose).
  maxWidth?: string;
  // Optional footer (action buttons). When omitted the modal renders
  // nothing here so callers can put the action row inside `children`.
  footer?: React.ReactNode;
}

// Modal is used only for genuinely transient overlays – one-time
// token disclosures, the first-time-deploy config preview, etc. Create
// and edit flows are routed pages via FormPage now, so this stays small.
//
// Backdrop opacity is tuned so the AuroraBackground still bleeds through
// subtly, which keeps the modal feeling attached to the page rather than
// detached like the old flat-black `bg-black/60` overlay.
//
// The active card.glass_style is also read here so the admin's
// "Glass style: strong / solid" choice applies to modals too — without
// this hook the modal would always render frozen-frosted even when the
// admin picked 'solid' for the rest of the panel.
const Modal: React.FC<ModalProps> = ({
  open,
  onClose,
  title,
  children,
  maxWidth = 'max-w-lg',
  footer,
}) => {
  const glassStyle = useThemeStore((s) => {
    const t = s.active();
    return t.card.glass_style;
  });
  const modifier = !glassStyle || glassStyle === 'frosted'
    ? ''
    : glassStyle === 'solid'
      ? 'ks-card-glass-solid'
      : 'ks-card-glass-strong';

  if (!open) return null;
  return (
    <div
      className="ks-modal-overlay fixed inset-0 z-50 flex items-center justify-center
                bg-black/60 backdrop-blur-sm p-4"
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      {/* ks-modal-panel lets the Theme Studio's Components section restyle
          the dialog surface (fill / border / shadow / radius / blur). The
          glass-strong base stays so the panel renders identically before
          any customisation. */}
      <div className={`ks-modal-panel glass-strong ${modifier} rounded-xl w-full ${maxWidth} max-h-[90dvh] overflow-y-auto`}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/10 sticky top-0 bg-white/[0.05] backdrop-blur-xl z-10">
          <h3 className="text-lg font-semibold text-white">{title}</h3>
          <button
            onClick={onClose}
            type="button"
            className="text-gray-400 hover:text-white transition-colors"
            aria-label="Close"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
             </svg>
          </button>
        </div>
        <div className="px-6 py-4 space-y-4">{children}</div>
        {footer && (
          <div className="flex justify-end gap-2 px-6 py-4 border-t border-white/10">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
};

export default Modal;
