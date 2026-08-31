import React from 'react';

// TicketChatSkeleton — loading placeholder for the individual chat page/component.
// Mirrors the structure of TicketChat.tsx (header + bubbles + composer) using
// themed --ks-skeleton-* tokens with fallbacks so it adapts to light/dark themes.
const TicketChatSkeleton: React.FC = () => {
  const base: React.CSSProperties = {
    backgroundColor: 'var(--ks-skeleton-base, rgba(255,255,255,0.08))',
    borderRadius: 'var(--ks-skeleton-radius, 6px)',
  };
  const shimmer: React.CSSProperties = {
    backgroundColor: 'var(--ks-skeleton-shimmer, rgba(255,255,255,0.14))',
    borderRadius: 'var(--ks-skeleton-radius, 6px)',
  };

  return (
    <div
      className="glass-card rounded-xl overflow-hidden flex flex-col border animate-pulse w-full flex-1 min-h-0 h-full"
      style={{
        borderColor: 'var(--ks-card-border)',
        backgroundColor: 'var(--ks-card-bg)',
      }}
    >
      {/* Header skeleton */}
      <div
        className="shrink-0 flex items-center gap-3 px-4 py-3 border-b"
        style={{
          background: 'color-mix(in srgb, var(--ks-card-bg) 80%, transparent)',
          borderColor: 'var(--ks-card-border)',
        }}
      >
        <div className="w-8 h-8 rounded-full shrink-0" style={shimmer} />
        <div className="flex-1 space-y-2 min-w-0">
          <div className="h-3 w-1/2 rounded" style={shimmer} />
          <div className="h-2.5 w-1/3 rounded" style={base} />
        </div>
        <div className="hidden lg:flex gap-1.5 shrink-0">
          <div className="h-6 w-20 rounded-full" style={base} />
          <div className="h-6 w-16 rounded-full" style={base} />
        </div>
      </div>

      {/* Messages skeleton — fills viewport, composer pinned */}
      <div className="flex-1 min-h-0 overflow-hidden p-3 sm:p-4 space-y-4">
        {/* date pill */}
        <div className="flex justify-center">
          <div className="h-5 w-24 rounded-full" style={base} />
        </div>

        {/* left bubble skeleton */}
        <div className="flex gap-2.5">
          <div className="w-7 h-7 rounded-full shrink-0 mt-1" style={shimmer} />
          <div className="flex flex-col gap-1.5 max-w-[78%]">
            <div className="h-2.5 w-28 rounded" style={base} />
            <div className="rounded-2xl rounded-tl-sm border p-3 space-y-2" style={{ background: 'color-mix(in srgb, var(--ks-card-bg) 88%, transparent)', borderColor: 'var(--ks-card-border)' }}>
              <div className="h-3 w-64 rounded" style={shimmer} />
              <div className="h-3 w-48 rounded" style={base} />
              <div className="h-3 w-56 rounded" style={base} />
            </div>
            <div className="h-2 w-16 rounded" style={base} />
          </div>
        </div>

        {/* right bubble skeleton */}
        <div className="flex gap-2.5 justify-end">
          <div className="flex flex-col gap-1.5 max-w-[78%] items-end">
            <div className="h-2.5 w-24 rounded" style={base} />
            <div className="rounded-2xl rounded-br-sm border p-3 space-y-2" style={{ background: 'var(--ks-btn-bg, #fff)', borderColor: 'var(--ks-card-border)' }}>
              <div className="h-3 w-52 rounded" style={{ ...shimmer, opacity: 0.6 }} />
              <div className="h-3 w-40 rounded" style={{ ...base, opacity: 0.6 }} />
            </div>
            <div className="h-2 w-14 rounded" style={base} />
          </div>
          <div className="w-7 h-7 rounded-full shrink-0 mt-1" style={shimmer} />
        </div>

        {/* left bubble short */}
        <div className="flex gap-2.5">
          <div className="w-7 h-7 rounded-full shrink-0 mt-1" style={shimmer} />
          <div className="flex flex-col gap-1.5 max-w-[78%]">
            <div className="rounded-2xl rounded-tl-sm border p-3" style={{ background: 'color-mix(in srgb, var(--ks-card-bg) 88%, transparent)', borderColor: 'var(--ks-card-border)' }}>
              <div className="h-3 w-48 rounded" style={shimmer} />
            </div>
          </div>
        </div>

        {/* another date pill */}
        <div className="flex justify-center">
          <div className="h-5 w-20 rounded-full" style={base} />
        </div>

        {/* left + right group skeleton */}
        <div className="flex gap-2.5">
          <div className="w-7 h-7 rounded-full shrink-0 mt-1" style={shimmer} />
          <div className="flex flex-col gap-1.5 max-w-[78%]">
            <div className="h-2.5 w-20 rounded" style={base} />
            <div className="rounded-2xl rounded-tl-sm border p-3 space-y-2" style={{ background: 'color-mix(in srgb, var(--ks-accent-warning, #fbbf24) 16%, var(--ks-card-bg))', borderColor: 'color-mix(in srgb, var(--ks-accent-warning) 35%, transparent)' }}>
              <div className="h-3 w-56 rounded" style={shimmer} />
              <div className="h-3 w-32 rounded" style={base} />
            </div>
          </div>
        </div>
      </div>

      {/* Composer skeleton — pinned footer */}
      <div className="shrink-0 mt-auto border-t p-3 space-y-2" style={{ background: 'color-mix(in srgb, var(--ks-card-bg) 92%, transparent)', borderColor: 'var(--ks-card-border)' }}>
        <div className="h-[42px] w-full rounded-lg" style={base} />
        <div className="flex items-center justify-between gap-2">
          <div className="h-6 w-44 rounded-full" style={base} />
          <div className="h-8 w-24 rounded-lg shrink-0" style={shimmer} />
        </div>
        <div className="hidden sm:block h-3 w-40 rounded" style={base} />
      </div>
    </div>
  );
};

export default TicketChatSkeleton;
