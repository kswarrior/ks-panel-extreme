import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';

// OverviewSectionSelect — the instance overview page's section switcher.
// A compact select-style trigger in the top-right of the page (no card):
// it shows the active section ("Details" + chevron) and opens a dropdown
// with a search field on top and every allowed section below. Sections
// keep their hue (Details sky, Monitoring emerald, Manage amber, Activity
// violet) plus their live marker (status dot / LIVE pulse / count badge).
//
// Keyboard: ArrowUp / ArrowDown move the highlight, Home / End jump,
// Enter selects, Escape closes and returns focus to the trigger. Typing in
// the search box filters by label and hint.

export type OverviewMarker =
  | { kind: 'dot'; className?: string; title?: string }
  | { kind: 'pulse'; title?: string }
  | { kind: 'badge'; text: string | number; title?: string };

export interface OverviewSectionDef {
  id: string;
  label: string;
  /** One-line hint of the section's contents. */
  hint: string;
  icon: React.ReactNode;
  /** #rrggbb hue driving the section's icon / active wash. */
  accent: string;
  marker?: OverviewMarker;
}

interface OverviewSectionSelectProps {
  sections: OverviewSectionDef[];
  active: string;
  onChange: (id: string) => void;
  ariaLabel?: string;
}

const LISTBOX_ID = 'overview-section-listbox';

const OverviewSectionSelect: React.FC<OverviewSectionSelectProps> = ({
  sections,
  active,
  onChange,
  ariaLabel = 'Overview section',
}) => {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [highlight, setHighlight] = useState(0);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const current = sections.find((s) => s.id === active) ?? sections[0];

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return sections;
    return sections.filter((s) => `${s.label} ${s.hint}`.toLowerCase().includes(q));
  }, [sections, query]);

  const close = useCallback((focusTrigger = false) => {
    setOpen(false);
    setQuery('');
    if (focusTrigger) triggerRef.current?.focus();
  }, []);

  const openMenu = useCallback(() => {
    setOpen(true);
    setQuery('');
    setHighlight(Math.max(0, sections.findIndex((s) => s.id === active)));
  }, [sections, active]);

  const commit = useCallback(
    (id: string) => {
      onChange(id);
      close(true);
    },
    [onChange, close],
  );

  // Focus the search field as soon as the panel opens.
  useEffect(() => {
    if (!open) return;
    const t = window.setTimeout(() => inputRef.current?.focus(), 0);
    return () => window.clearTimeout(t);
  }, [open]);

  // Keep the highlight inside the filtered result set.
  useEffect(() => {
    if (highlight >= filtered.length) setHighlight(0);
  }, [filtered.length, highlight]);

  // Close on outside tap/click and on Escape.
  useEffect(() => {
    if (!open) return;
    const onDocDown = (e: Event) => {
      if (wrapRef.current?.contains(e.target as Node)) return;
      close();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close(true);
    };
    document.addEventListener('pointerdown', onDocDown as EventListener);
    document.addEventListener('touchstart', onDocDown as EventListener, { passive: true } as AddEventListenerOptions);
    document.addEventListener('mousedown', onDocDown as EventListener);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onDocDown as EventListener);
      document.removeEventListener('touchstart', onDocDown as EventListener);
      document.removeEventListener('mousedown', onDocDown as EventListener);
      document.removeEventListener('keydown', onKey);
    };
  }, [open, close]);

  if (!current) return null;

  const onSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (filtered.length) setHighlight((h) => Math.min(filtered.length - 1, h + 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (filtered.length) setHighlight((h) => Math.max(0, h - 1));
    } else if (e.key === 'Home') {
      e.preventDefault();
      setHighlight(0);
    } else if (e.key === 'End') {
      e.preventDefault();
      if (filtered.length) setHighlight(filtered.length - 1);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const target = filtered[highlight];
      if (target) commit(target.id);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      close(true);
    }
  };

  const renderMarker = (marker?: OverviewMarker) => {
    if (!marker) return null;
    if (marker.kind === 'dot') {
      return (
        <span
          aria-hidden="true"
          title={marker.title}
          className={`shrink-0 w-2.5 h-2.5 rounded-full ${marker.className ?? 'bg-gray-500'}`}
        />
      );
    }
    if (marker.kind === 'pulse') {
      return (
        <span aria-hidden="true" title={marker.title ?? 'Live'} className="shrink-0 relative flex w-2.5 h-2.5">
          <span className="absolute inline-flex w-full h-full rounded-full bg-emerald-400 opacity-60 animate-ping" />
          <span className="relative inline-flex rounded-full w-2.5 h-2.5 bg-emerald-400" />
        </span>
      );
    }
    return (
      <span
        title={marker.title}
        className="shrink-0 min-w-[20px] text-center text-[10px] font-semibold tabular-nums px-1.5 py-0.5 rounded-full bg-black/20 text-gray-200"
      >
        {marker.text}
      </span>
    );
  };

  return (
    <div ref={wrapRef} className="relative inline-flex">
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? LISTBOX_ID : undefined}
        aria-label={`${ariaLabel}: ${current.label}`}
        title={`${current.label} — ${current.hint}`}
        onClick={() => (open ? close(true) : openMenu())}
        className="ks-dropdown-trigger inline-flex items-center justify-between gap-2 min-w-[10.5rem] max-w-[15rem] outline-none focus-visible:ring-2 focus-visible:ring-white/60 focus-visible:ring-offset-2 focus-visible:ring-offset-black"
      >
        <span className="flex items-center gap-2 min-w-0">
          <span
            aria-hidden="true"
            className="shrink-0 flex items-center justify-center w-6 h-6 rounded-md border"
            style={{
              background: `${current.accent}1f`,
              borderColor: `${current.accent}66`,
              color: current.accent,
            }}
          >
            <span className="flex [&>svg]:w-3.5 [&>svg]:h-3.5 [&>svg]:block">{current.icon}</span>
          </span>
          <span className="truncate text-[13px] font-semibold text-white">{current.label}</span>
          {renderMarker(current.marker)}
        </span>
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={`w-4 h-4 shrink-0 transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
          aria-hidden="true"
        >
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>

      {open && (
        <div className="absolute right-0 top-full z-40 mt-2 w-[min(18rem,calc(100vw-2rem))]">
          <div className="ks-dropdown overflow-hidden">
            <div className="p-2 border-b border-white/10">
              <div className="relative">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-500 pointer-events-none"
                  aria-hidden="true"
                >
                  <circle cx="11" cy="11" r="7" />
                  <path d="m20 20-3.5-3.5" />
                </svg>
                <input
                  ref={inputRef}
                  type="text"
                  role="combobox"
                  aria-autocomplete="list"
                  aria-expanded="true"
                  aria-controls={LISTBOX_ID}
                  aria-activedescendant={filtered[highlight] ? `overview-section-${filtered[highlight].id}` : undefined}
                  value={query}
                  onChange={(e) => {
                    setQuery(e.target.value);
                    setHighlight(0);
                  }}
                  onKeyDown={onSearchKeyDown}
                  placeholder="Search sections…"
                  aria-label="Search sections"
                  autoComplete="off"
                  className="ks-input ks-input-sm pl-8 pr-8"
                />
                {query && (
                  <button
                    type="button"
                    aria-label="Clear search"
                    onClick={() => {
                      setQuery('');
                      setHighlight(0);
                      inputRef.current?.focus();
                    }}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-500 hover:text-white"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-3.5 h-3.5" aria-hidden="true">
                      <line x1="18" y1="6" x2="6" y2="18" />
                      <line x1="6" y1="6" x2="18" y2="18" />
                    </svg>
                  </button>
                )}
              </div>
            </div>

            {filtered.length === 0 ? (
              <p className="px-3 py-3 text-xs text-gray-500">No sections match “{query.trim()}”.</p>
            ) : (
              <ul id={LISTBOX_ID} role="listbox" aria-label={ariaLabel} className="max-h-64 overflow-y-auto py-1">
                {filtered.map((s, i) => {
                  const selected = s.id === active;
                  const highlighted = i === highlight;
                  return (
                    <li
                      key={s.id}
                      id={`overview-section-${s.id}`}
                      role="option"
                      aria-selected={selected}
                      onMouseEnter={() => setHighlight(i)}
                      onMouseDown={(e) => {
                        e.preventDefault();
                        commit(s.id);
                      }}
                      className={`ks-dropdown-item flex items-center gap-2.5 cursor-pointer ${highlighted ? 'bg-white/10' : ''}`}
                    >
                      <span
                        aria-hidden="true"
                        className="shrink-0 flex items-center justify-center w-7 h-7 rounded-md border"
                        style={{
                          background: `${s.accent}1f`,
                          borderColor: `${s.accent}55`,
                          color: s.accent,
                        }}
                      >
                        <span className="flex [&>svg]:w-4 [&>svg]:h-4 [&>svg]:block">{s.icon}</span>
                      </span>
                      <span className="min-w-0 flex-1 leading-tight">
                        <span className={`block text-[13px] font-medium truncate ${selected ? 'text-white' : 'text-gray-200'}`}>
                          {s.label}
                        </span>
                        <span className="block text-[10px] text-gray-500 truncate">{s.hint}</span>
                      </span>
                      {renderMarker(s.marker)}
                      {selected && (
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2.4"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          className="w-4 h-4 shrink-0"
                          style={{ color: s.accent }}
                          aria-hidden="true"
                        >
                          <path d="M20 6L9 17l-5-5" />
                        </svg>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default OverviewSectionSelect;
