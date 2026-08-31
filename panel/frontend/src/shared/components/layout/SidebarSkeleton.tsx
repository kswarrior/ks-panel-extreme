import React from 'react';

interface SidebarSkeletonProps {
  collapsed?: boolean;
  count?: number;
}

// SidebarSkeleton renders placeholder nav items that match the sidebar layout.
// Visual tokens are sourced from the themed --ks-skeleton-* vars (Theme Studio → Loading)
// so the admin's skeleton colour / radius controls apply here too. Animate via
// Tailwind's animate-pulse; each bar uses staggered opacity via inline animationDelay
// derived from count index to avoid a uniform flash.
const SidebarSkeleton: React.FC<SidebarSkeletonProps> = ({ collapsed = false, count = 10 }) => {
  const n = Math.max(1, Math.min(16, count));

  // Theme-driven skeleton tokens — fallback to palette that remains visible
  // over the dark ks-sidebar-bg even before the theme stylesheet loads.
  const baseStyle: React.CSSProperties = {
    backgroundColor: 'var(--ks-skeleton-base, rgba(255,255,255,0.06))',
    borderRadius: 'var(--ks-skeleton-radius, 6px)',
  };
  const shimmerStyle: React.CSSProperties = {
    backgroundColor: 'var(--ks-skeleton-shimmer, rgba(255,255,255,0.18))',
    borderRadius: 'var(--ks-skeleton-radius, 6px)',
  };

  // Collapsed: centered icon-only placeholders (sidebar width is w-16).
  if (collapsed) {
    return (
      <div
        role="status"
        aria-label="Loading navigation"
        aria-busy="true"
        className="space-y-1"
      >
        {Array.from({ length: n }).map((_, i) => (
          <div
            key={i}
            className="flex items-center justify-center px-3 py-2 rounded-md animate-pulse"
            style={{ animationDelay: `${i * 70}ms` }}
          >
            <div
              className="w-5 h-5 rounded-md shrink-0 animate-pulse"
              style={{ ...shimmerStyle, animationDelay: `${i * 70}ms` }}
            />
          </div>
        ))}
        <span className="sr-only">Loading navigation…</span>
      </div>
    );
  }

  // Expanded: icon + label bars mirroring the real NavLink row:
  // `flex items-center gap-3 px-3 py-2 rounded-md` with a w-5 icon slot and
  // a variable-width text bar. Widths vary per index so the skeleton does
  // not read as a single uniform block.
  const widths = ['58%', '42%', '66%', '54%', '72%', '46%', '62%', '50%'];

  return (
    <div
      role="status"
      aria-label="Loading navigation"
      aria-busy="true"
      className="space-y-1"
    >
      {Array.from({ length: n }).map((_, i) => (
        <div
          key={i}
          className="flex items-center gap-3 px-3 py-2 rounded-md animate-pulse"
          style={{ animationDelay: `${i * 60}ms` }}
        >
          <div
            className="w-5 h-5 rounded-md shrink-0 animate-pulse"
            style={{ ...shimmerStyle, animationDelay: `${i * 60}ms` }}
          />
          <div
            className="h-3 rounded animate-pulse"
            style={{
              ...baseStyle,
              width: widths[i % widths.length],
              animationDelay: `${i * 60 + 40}ms`,
            }}
          />
        </div>
      ))}
      <span className="sr-only">Loading navigation…</span>
    </div>
  );
};

export default SidebarSkeleton;
