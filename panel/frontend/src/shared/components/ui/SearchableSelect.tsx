import React, { useEffect, useRef, useState } from 'react';

// SearchableSelect — a text-input that filters an option list as the user
// types and shows a dropdown of matches. Selecting an option (click or
// keyboard) commits the value and closes the dropdown. The trigger button
// stays open while the input has focus.
//
// We intentionally avoid pulling in a Combobox component; this is the
// smallest thing that satisfies the spawn of the form / picker pattern
// used by the deploy picker: a chip with the current selection, a text
// input that filters, and a results list.

export interface SearchableOption<T> {
  value: T;
  label: string;
  description?: string;
  keywords?: string;
  // optional badge text rendered on the right of each row
  badge?: string;
}

interface SearchableSelectProps<T extends string | number> {
  options: SearchableOption<T>[];
  value: T | 0;                                  // 0 / "" → nothing selected
  onChange: (v: T) => void;
  placeholder?: string;
  emptyMessage?: string;
  // Drop the dropdown body to render a free-form preview of what each
  // option looks like (used by Deploy Instance to show kind icon, port
  // counts … in the row itself). Caller passes a function that returns
  // the row markup.
  renderRow?: (opt: SearchableOption<T>, active: boolean) => React.ReactNode;
  // Optional label shown at the top of the drop-down list (e.g.
  // "Templates" / "Nodes").
  groupLabel?: string;
}

export function SearchableSelect<T extends string | number>({
  options, value, onChange, placeholder = 'Search…', emptyMessage = 'No matches',
  renderRow, groupLabel,
}: SearchableSelectProps<T>) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const wrapRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const selected = options.find((o) => o.value === value);

  // When a selection exists, the input still holds the selection's label
  // as a "chip" so the dropdown body isn't always rendered.
  useEffect(() => {
    if (selected && !open) setQuery('');
  }, [selected?.value, open]);

  // Close on outside-click; refocus on Escape.
  useEffect(() => {
    if (!open) return;
    const onDocDown = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false);
        inputRef.current?.blur();
      }
    };
    document.addEventListener('mousedown', onDocDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDocDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const q = query.trim().toLowerCase();
  const filtered = q
    ? options.filter((o) => {
        const hay = `${o.label} ${o.keywords ?? ''} ${o.description ?? ''} ${o.badge ?? ''}`.toLowerCase();
        return hay.includes(q);
      })
    : options;

  // Keep highlight in range when results change.
  useEffect(() => {
    if (highlight >= filtered.length) setHighlight(0);
  }, [filtered.length, highlight]);

  const commit = (idx: number) => {
    const opt = filtered[idx];
    if (!opt) return;
    onChange(opt.value);
    setOpen(false);
    setQuery('');
    inputRef.current?.blur();
  };

  return (
    <div className="relative" ref={wrapRef}>
      <div
        className={`flex items-center gap-2 bg-black/30 border rounded-md px-3 py-1.5 transition-colors ${open ? 'border-white/40' : 'border-white/10 hover:border-white/30'}`}
      >
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4 text-gray-500 shrink-0">
          <circle cx="11" cy="11" r="7" />
          <path d="m20 20-3.5-3.5" />
         </svg>
        {selected && !open ? (
          <button
            type="button"
            className="flex-1 text-left text-sm text-white truncate"
            onClick={() => { setOpen(true); setTimeout(() => inputRef.current?.focus(), 0); }}
            title={`Selected: ${selected.label} — click to change`}
          >
            {selected.label}
            {selected.badge && <span className="ml-2 text-[11px] text-gray-500 font-mono">{selected.badge}</span>}
          </button>
        ) : (
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
            onFocus={() => setOpen(true)}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') {
                e.preventDefault();
                setHighlight((h) => Math.min(filtered.length - 1, h + 1));
              } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                setHighlight((h) => Math.max(0, h - 1));
              } else if (e.key === 'Enter') {
                e.preventDefault();
                commit(highlight);
              } else if (e.key === 'Backspace' && !query && selected) {
                // Backspace on empty input clears the selection.
                onChange(0 as unknown as T);
              }
            }}
            placeholder={placeholder}
            className="flex-1 bg-transparent text-sm text-white placeholder-gray-500 outline-none min-w-0"
            autoComplete="off"
          />
        )}
        {selected && (
          <button
            type="button"
            aria-label="Clear selection"
            title="Clear selection"
            onClick={(e) => { e.stopPropagation(); onChange(0 as unknown as T); inputRef.current?.focus(); setOpen(true); }}
            className="shrink-0 text-gray-500 hover:text-white"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" className="w-3.5 h-3.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/> </svg>
          </button>
        )}
      </div>

      {open && (
        <div className="absolute z-20 mt-1 w-full max-h-80 overflow-y-auto rounded-md border border-white/10 bg-[#0b0f14]/95 backdrop-blur-md shadow-xl">
          {filtered.length === 0 ? (
            <p className="px-3 py-3 text-xs text-gray-500">{emptyMessage}</p>
          ) : (
            <ul className="py-1" role="listbox">
              {groupLabel && (
                <li className="px-3 pt-1.5 pb-1 text-[10px] uppercase tracking-wider text-gray-500">{groupLabel}</li>
              )}
              {filtered.map((opt, i) => {
                const active = i === highlight;
                const selected = opt.value === value;
                return (
                  <li
                    key={String(opt.value)}
                    role="option"
                    aria-selected={selected}
                    onMouseEnter={() => setHighlight(i)}
                    onMouseDown={(e) => { e.preventDefault(); commit(i); }}
                    className={`px-3 py-1.5 cursor-pointer text-sm ${active ? 'bg-white/10' : 'hover:bg-white/5'} ${selected ? 'text-white' : 'text-gray-200'}`}
                  >
                    {renderRow
                      ? renderRow(opt, active)
                      : (
                        <div className="flex items-center justify-between gap-2">
                          <span className="flex items-center gap-2 min-w-0">
                            {selected && <span className="text-sky-300">●</span>}
                            <span className="truncate">{opt.label}</span>
                          </span>
                          {opt.badge && <span className="text-[10px] text-gray-500 font-mono shrink-0">{opt.badge}</span>}
                        </div>
                      )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
