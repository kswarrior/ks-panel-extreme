import React, { useCallback, useEffect, useRef, useState } from 'react';

interface Props {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  ariaLabel?: string;
  className?: string;
  width?: string;
  // Lets callers restyle the trigger (e.g. ks-tab pill to match the node
  // form's Cancel/Create buttons). Defaults keep the icon-button look.
  buttonClassName?: string;
  buttonStyle?: React.CSSProperties;
}

// SearchDropdown renders a magnifier icon button with an inline-expanding
// input. The input expands *inside* the pill row (no absolute overlay), so
// opening search never pushes the other pill buttons out and is never
// clipped by the pill's overflow-hidden collapse container. The input stays
// mounted while collapsed so tapping the toggle can focus() synchronously —
// required for the phone keyboard to open on iOS/Android.
const SearchDropdown: React.FC<Props> = ({
  value,
  onChange,
  placeholder = 'Search…',
  ariaLabel = 'Search',
  className = '',
  width,
  buttonClassName = 'ks-icon-btn',
  buttonStyle,
}) => {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const isOpen = open || !!value;

  const focusInput = useCallback(() => {
    // Synchronous focus attempt (same gesture = mobile keyboard opens) plus
    // rAF/timeout fallbacks for the width-transition frame.
    const el = inputRef.current;
    if (!el) return;
    try {
      el.focus({ preventScroll: true } as FocusOptions);
    } catch {
      el.focus();
    }
    requestAnimationFrame(() => {
      try {
        inputRef.current?.focus({ preventScroll: true } as FocusOptions);
      } catch {
        inputRef.current?.focus();
      }
    });
  }, []);

  const handleToggle = useCallback(() => {
    if (isOpen) {
      // Closing via toggle: clear first so a second tap fully collapses.
      if (value) {
        onChange('');
        focusInput();
        return;
      }
      setOpen(false);
      inputRef.current?.blur();
    } else {
      setOpen(true);
      // Input is always mounted (width-collapsed), so focus works in the
      // same tap — this is what opens the phone keyboard.
      focusInput();
    }
  }, [isOpen, value, onChange, focusInput]);

  // Keep open while the input itself is focused (phone keyboard up).
  const handleInputFocus = useCallback(() => setOpen(true), []);

  // Close on outside tap/click only when there is nothing typed, so the bar
  // stays while the user is writing. Listen to pointerdown + touchstart +
  // mousedown to cover phones and desktops.
  useEffect(() => {
    if (!isOpen) return;
    const onDoc = (e: Event) => {
      if (!wrapRef.current) return;
      if (wrapRef.current.contains(e.target as Node)) return;
      if (!value) setOpen(false);
    };
    document.addEventListener('pointerdown', onDoc as EventListener);
    document.addEventListener('touchstart', onDoc as EventListener, { passive: true } as AddEventListenerOptions);
    document.addEventListener('mousedown', onDoc as EventListener);
    return () => {
      document.removeEventListener('pointerdown', onDoc as EventListener);
      document.removeEventListener('touchstart', onDoc as EventListener);
      document.removeEventListener('mousedown', onDoc as EventListener);
    };
  }, [isOpen, value]);

  return (
    <div ref={wrapRef} className={`relative inline-flex items-center min-w-0 ${className}`}>
      <button
        type="button"
        aria-label={ariaLabel}
        aria-expanded={isOpen}
        onClick={handleToggle}
        className={`${buttonClassName} shrink-0 transition-colors ${
          isOpen ? 'is-open' : ''
        }`}
        style={buttonStyle}
      >
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
          <circle cx="11" cy="11" r="8" />
          <line x1="21" y1="21" x2="16.65" y2="16.65" />
        </svg>
      </button>
      {/* Always mounted (width-collapsed when closed) so focus() in the tap
          handler opens the phone keyboard. Responsive max-width keeps the
          other pill buttons visible on small screens. */}
      <div
        className={`overflow-hidden transition-[width,opacity,margin] duration-200 ease-out ${
          isOpen ? 'opacity-100 ml-1' : 'opacity-0 ml-0'
        } ${width ?? ''}`}
        style={isOpen ? { width: 'min(12rem, 38vw)', maxWidth: '16rem' } : { width: 0 }}
        aria-hidden={!isOpen}
      >
        <div className="relative w-full" style={{ width: 'min(12rem, 38vw)', maxWidth: '16rem' }}>
          <input
            ref={inputRef}
            type="search"
            inputMode="search"
            enterKeyHint="search"
            autoComplete="off"
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
            tabIndex={isOpen ? 0 : -1}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onFocus={handleInputFocus}
            placeholder={placeholder}
            aria-label={ariaLabel}
            className="ks-input w-full backdrop-blur border border-white/10 rounded-md text-white placeholder-gray-500 pl-3 pr-7 py-1.5 focus:outline-none focus:border-white/40 shadow-xl text-[16px] sm:text-sm"
            style={{ WebkitAppearance: 'none' } as React.CSSProperties}
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                if (value) onChange('');
                else {
                  setOpen(false);
                  inputRef.current?.blur();
                }
              }
            }}
          />
          {value && (
            <button
              type="button"
              aria-label="Clear search"
              tabIndex={isOpen ? 0 : -1}
              onClick={() => {
                onChange('');
                focusInput();
              }}
              className="absolute right-1.5 top-1/2 -translate-y-1/2 text-gray-500 hover:text-white"
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-3.5 h-3.5">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default SearchDropdown;
