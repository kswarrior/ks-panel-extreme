import React, { useEffect, useRef, useState } from 'react';

interface Props {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  ariaLabel?: string;
  className?: string;
  width?: string;
}

const ExpandableSearch: React.FC<Props> = ({
  value,
  onChange,
  placeholder = 'Search…',
  ariaLabel = 'Search',
  className = '',
  width = 'w-72',
}) => {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (!wrapRef.current) return;
      if (!wrapRef.current.contains(e.target as Node)) {
        if (!value) setOpen(false);
      }
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [value]);

  return (
    <div ref={wrapRef} className={`relative inline-flex items-center ${className}`}>
      <button
        type="button"
        aria-label={ariaLabel}
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className={`shrink-0 inline-flex items-center justify-center w-9 h-9 rounded-md border transition-colors ${
          open || value
            ? 'bg-white/10 border-white/30 text-white'
            : 'bg-black/30 border-white/10 text-gray-400 hover:text-white hover:border-white/20'
        }`}
      >
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
          <circle cx="11" cy="11" r="8" />
          <line x1="21" y1="21" x2="16.65" y2="16.65" />
         </svg>
      </button>
      <div
        className={`overflow-hidden transition-[width,opacity] duration-300 ease-out ${
          open || value ? `${width} opacity-100 ml-2` : 'w-0 opacity-0 ml-0'
        }`}
      >
        <div className="relative">
          <input
            ref={inputRef}
            type="text"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder={placeholder}
            aria-label={ariaLabel}
            className="w-full bg-black/30 border border-white/10 rounded-md text-sm text-white placeholder-gray-500 px-3 py-1.5 pr-7 focus:outline-none focus:border-white/40"
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                if (value) onChange('');
                else setOpen(false);
              }
            }}
          />
          {value && (
            <button
              type="button"
              aria-label="Clear search"
              onClick={() => onChange('')}
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

export default ExpandableSearch;
