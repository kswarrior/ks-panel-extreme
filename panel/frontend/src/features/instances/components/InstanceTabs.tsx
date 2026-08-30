import React, { useCallback, useEffect, useRef, useState } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { useInstanceNav } from '@/shared/components/layout/InstanceNavContext';
import { createPortal } from 'react-dom';
import { sanitizeSvgIcon } from '@/shared/utils/sanitizeSvgIcon';

const InstanceTabs: React.FC = () => {
  const { nav, instanceId, loading } = useInstanceNav();
  const location = useLocation();
  const navigate = useNavigate();
  const scrollRef = useRef<HTMLDivElement>(null);
  const [showFade, setShowFade] = useState(false);
  const [iconOnly, setIconOnly] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [showAllPagesDropdown, setShowAllPagesDropdown] = useState(false);
  const allPagesTriggerRef = useRef<HTMLButtonElement>(null);

  const filteredNav = nav.filter((item) =>
    item.label.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchQuery(e.target.value);
  };

  const handlePageSelect = (pageSlug: string) => {
    const item = nav.find((n) => n.to === pageSlug);
    if (item) {
      const absTo =
        item.to === '.' || item.to === ''
          ? `/instances/${instanceId}`
          : `/instances/${instanceId}/${item.to}`;
      navigate(absTo);
    }
  };

  const handleAllPagesToggle = () => {
    setShowAllPagesDropdown((prev) => !prev);
    setSearchQuery('');
  };

  const handleAllPagesClose = () => {
    setShowAllPagesDropdown(false);
  };

  // checkOverflow + the resize effect must be declared BEFORE the early
  // return below. Declaring a hook after a conditional return makes it
  // conditional: the first render (nav empty) skips it, then the moment the
  // instance nav context populates the hook appears, and React throws
  // Error 310 ("Rendered more hooks than during the previous render"),
  // unmounting the whole app into a blank black page.
  const checkOverflow = useCallback(() => {
    const el = scrollRef.current;
    if (el) {
      setShowFade(el.scrollWidth > el.clientWidth + 4);
    }
  }, []);

  useEffect(() => {
    checkOverflow();
    window.addEventListener('resize', checkOverflow);
    return () => window.removeEventListener('resize', checkOverflow);
  }, [nav, checkOverflow]);

  // Close all pages dropdown on outside click or escape
  useEffect(() => {
    if (!showAllPagesDropdown) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        handleAllPagesClose();
      }
    };
    const onClick = (e: MouseEvent) => {
      if (allPagesTriggerRef.current && !allPagesTriggerRef.current.contains(e.target as Node)) {
        // Check if click is inside the dropdown portal
        const dropdown = document.querySelector('[data-all-pages-dropdown]');
        if (dropdown && !dropdown.contains(e.target as Node)) {
          handleAllPagesClose();
        }
      }
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('click', onClick);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('click', onClick);
    };
  }, [showAllPagesDropdown]);

  if (!instanceId) {
    return null;
  }

  // While the instance fetch is in flight (or the spec has been parsed but
  // resolveInstanceNav hasn't produced entries yet) render a shimmering
  // skeleton placeholder instead of `null`. Without this the tab bar would
  // flicker to empty for a few hundred ms on every navigation — the user
  // landed on the sub-page without a header, looking like the whole
  // nav had disappeared.
  if (loading || nav.length === 0) {
    return (
      <div className="flex-1 min-w-0 relative bg-transparent">
        <div className="relative">
          <nav
            className="flex items-center gap-1 px-0 py-2 overflow-x-auto"
            aria-label="Instance pages"
            aria-busy="true"
          >
            <div className="shrink-0 w-8 h-8 rounded bg-neutral-800/60 animate-pulse" />
            {Array.from({ length: 5 }).map((_, i) => (
              <div
                key={i}
                className="shrink-0 h-7 w-20 rounded-md bg-neutral-800/60 animate-pulse"
                style={{ animationDelay: `${i * 80}ms` }}
              />
            ))}
          </nav>
        </div>
        <div
          className="absolute bottom-0 left-0 right-0 h-1 bg-gradient-to-t from-white/10 via-transparent to-transparent pointer-events-none instance-tabs-scroll-indicator"
          aria-hidden="true"
        />
      </div>
    );
  }

  // All Pages Dropdown Portal — the left edge is clamped to the viewport so
  // the fixed-width (320px) menu can never hang off the right side of a
  // narrow screen (the trigger sits ~44px from the left, so an unclamped
  // left+320 clipped on phones).
  const allPagesRect = showAllPagesDropdown && allPagesTriggerRef.current
    ? allPagesTriggerRef.current.getBoundingClientRect()
    : null;
  const DROPDOWN_WIDTH = 320;
  const dropdownLeft = allPagesRect
    ? Math.min(Math.max(8, allPagesRect.left), Math.max(8, window.innerWidth - DROPDOWN_WIDTH - 8))
    : 0;
  const allPagesDropdown = allPagesRect
    ? createPortal(
        <>
          {/* Invisible full-screen scrim — closes on click */}
          <div
            onClick={handleAllPagesClose}
            style={{ position: 'fixed', inset: 0, zIndex: 2147483639 }}
            aria-hidden="true"
          />
          <div
            data-all-pages-dropdown
            role="menu"
            style={{
              position: 'fixed',
              left: dropdownLeft,
              top: allPagesRect.bottom + 6,
              zIndex: 2147483640,
              width: `${DROPDOWN_WIDTH}px`,
              maxHeight: '70vh',
            }}
            className="glass-dropdown rounded-lg overflow-visible text-sm"
          >
            <div className="p-3 border-b border-white/10 shrink-0">
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  placeholder="Search pages..."
                  value={searchQuery}
                  onChange={handleSearchChange}
                  onClick={(e) => e.stopPropagation()}
                  className="ks-input flex-1 min-w-0 px-3 py-2 text-sm bg-white/5 border border-white/10 rounded-md text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-white/20"
                  aria-label="Search pages"
                  autoFocus
                />
                {/* Icon-only toggle button (icon only, no text) */}
                <button
                  type="button"
                  onClick={() => setIconOnly(!iconOnly)}
                  aria-pressed={iconOnly}
                  aria-label={iconOnly ? 'Show labels' : 'Icon only'}
                  className="flex items-center justify-center w-8 h-8 rounded-md text-gray-300 hover:bg-white/5 hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-neutral-500 transition-colors shrink-0"
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="w-4 h-4"
                    aria-hidden="true"
                  >
                    {iconOnly ? (
                      <>
                        <rect x="3" y="3" width="7" height="7" rx="1" />
                        <rect x="14" y="3" width="7" height="7" rx="1" />
                        <rect x="3" y="14" width="7" height="7" rx="1" />
                        <rect x="14" y="14" width="7" height="7" rx="1" />
                        <text x="6.5" y="7.5" fontSize="5" fill="currentColor" textAnchor="middle">A</text>
                        <text x="17.5" y="7.5" fontSize="5" fill="currentColor" textAnchor="middle">A</text>
                      </>
                    ) : (
                      <>
                        <rect x="3" y="3" width="18" height="7" rx="1" />
                        <rect x="3" y="14" width="18" height="7" rx="1" />
                        <text x="12" y="7.5" fontSize="5" fill="currentColor" textAnchor="middle">ABC</text>
                        <text x="12" y="18.5" fontSize="5" fill="currentColor" textAnchor="middle">ABC</text>
                      </>
                    )}
                  </svg>
                </button>
              </div>
            </div>
            <div className="rich-menu-grid py-2 overflow-y-auto" style={{ maxHeight: 'calc(70vh - 56px)' }}>
              {filteredNav.map((item) => {
                const dSanitized = item.iconKind === 'svg' && item.iconSvg ? sanitizeSvgIcon(item.iconSvg) : '';
                const dIsFull = dSanitized.trim().toLowerCase().startsWith('<svg');
                return (
                <button
                  key={`page-${item.to}`}
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    handlePageSelect(item.to);
                    handleAllPagesClose();
                  }}
                  className="ks-dropdown-item text-left rounded-md transition-colors w-full"
                >
                  {dSanitized ? (
                    dIsFull ? (
                      <span className="w-4 h-4 flex-shrink-0 block text-gray-300 [&>svg]:w-4 [&>svg]:h-4 [&>svg]:block" aria-hidden="true" dangerouslySetInnerHTML={{ __html: dSanitized }} />
                    ) : (
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.8"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        className="w-4 h-4 flex-shrink-0 text-gray-300"
                        aria-hidden="true"
                        dangerouslySetInnerHTML={{ __html: dSanitized }}
                      />
                    )
                  ) : null}
                  <span className="flex-1 truncate text-white">{item.label}</span>
                </button>
              )})}
              {filteredNav.length === 0 && (
                <div className="px-3 py-4 text-center text-gray-500 text-sm">
                  No pages found
                </div>
              )}
            </div>
          </div>
        </>,
        document.body
      )
    : null;

return (
    <div className="flex-1 min-w-0 relative bg-transparent">
      <div className="relative">
        <nav
          ref={scrollRef}
          className="flex items-center gap-1 px-0 py-2 overflow-x-auto"
          aria-label="Instance pages"
          onScroll={checkOverflow}
        >
          {/* All Pages button - search icon (leftmost) */}
          <button
            ref={allPagesTriggerRef}
            type="button"
            onClick={handleAllPagesToggle}
            aria-haspopup="menu"
            aria-label="Search pages"
            aria-expanded={showAllPagesDropdown}
            className="flex items-center justify-center w-8 h-8 rounded-none text-gray-300 hover:bg-white/5 hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-neutral-500 transition-colors shrink-0"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="w-5 h-5"
              aria-hidden="true"
            >
              <circle cx="11" cy="11" r="8" />
              <path d="M21 21l-4.35-4.35" />
            </svg>
          </button>
          
          {nav.map((item) => {
            const absTo =
              item.to === '.' || item.to === ''
                ? `/instances/${instanceId}`
                : `/instances/${instanceId}/${item.to}`;
            const sanitized = item.iconKind === 'svg' && item.iconSvg ? sanitizeSvgIcon(item.iconSvg) : '';
            const isFullSvg = sanitized.trim().toLowerCase().startsWith('<svg');
            const iconEl =
              item.iconKind === 'svg' && sanitized
                ? isFullSvg
                  ? (
                      <span
                        className="w-4 h-4 flex-shrink-0 block [&>svg]:w-4 [&>svg]:h-4 [&>svg]:block"
                        aria-hidden="true"
                        dangerouslySetInnerHTML={{ __html: sanitized }}
                      />
                    )
                  : (
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.8"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        className="w-4 h-4 flex-shrink-0"
                        aria-hidden="true"
                        dangerouslySetInnerHTML={{ __html: sanitized }}
                      />
                    )
                : null;
            return (
              <NavLink
                key={item.to}
                to={absTo}
                end={item.end}
                className={({ isActive }) =>
                  `flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition whitespace-nowrap ${
                    isActive
                      ? 'bg-white/10 text-white'
                      : 'text-gray-300 hover:bg-white/5 hover:text-white'
                  }`
                }
              >
                {iconEl}
                {!iconOnly && <span>{item.label}</span>}
              </NavLink>
            );
          })}
        </nav>
      </div>
      {/* Bottom scroll indicator line - visible scrollbar for horizontal scrolling */}
      <div
        className="absolute bottom-0 left-0 right-0 h-1 bg-gradient-to-t from-white/10 via-transparent to-transparent pointer-events-none instance-tabs-scroll-indicator"
        aria-hidden="true"
      />
      {allPagesDropdown}
    </div>
  );
};

export default InstanceTabs;