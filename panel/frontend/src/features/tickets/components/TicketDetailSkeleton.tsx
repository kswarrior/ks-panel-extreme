import React from 'react';

// TicketDetailSkeleton — loading placeholder for the ticket details page.
// Mirrors TicketDetail.tsx layout (breadcrumb + left overview + right triage/details)
// using themed --ks-skeleton-* tokens with themed fallbacks.
const TicketDetailSkeleton: React.FC = () => {
  const base: React.CSSProperties = {
    backgroundColor: 'var(--ks-skeleton-base, rgba(255,255,255,0.08))',
    borderRadius: 'var(--ks-skeleton-radius, 6px)',
  };
  const shimmer: React.CSSProperties = {
    backgroundColor: 'var(--ks-skeleton-shimmer, rgba(255,255,255,0.14))',
    borderRadius: 'var(--ks-skeleton-radius, 6px)',
  };

  return (
    <div className="max-w-[1280px] mx-auto space-y-4 animate-pulse">
      {/* Breadcrumb skeleton */}
      <div className="flex items-center gap-2">
        <div className="h-6 w-20 rounded" style={base} />
        <div className="h-4 w-px" style={base} />
        <div className="h-5 w-24 rounded border" style={shimmer} />
        <div className="h-5 w-16 rounded-md border" style={base} />
        <div className="h-5 w-14 rounded-md border" style={base} />
        <div className="ml-auto hidden sm:flex gap-2">
          <div className="h-4 w-24 rounded" style={base} />
          <div className="h-5 w-16 rounded-full" style={shimmer} />
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[1.45fr_0.85fr] gap-4">
        {/* Left: overview + open chat card */}
        <div className="space-y-4 min-w-0">
          <div className="glass-card rounded-xl p-5 space-y-4">
            <div className="flex items-start gap-3">
              <div className="w-11 h-11 rounded-xl shrink-0" style={shimmer} />
              <div className="flex-1 space-y-2 min-w-0">
                <div className="h-4 w-3/4 rounded" style={shimmer} />
                <div className="h-3 w-1/2 rounded" style={base} />
                <div className="flex gap-1.5">
                  <div className="h-4 w-12 rounded-full" style={base} />
                  <div className="h-4 w-14 rounded-full" style={base} />
                  <div className="h-4 w-10 rounded-full" style={base} />
                </div>
              </div>
              <div className="hidden sm:flex gap-1.5 shrink-0">
                <div className="h-7 w-14 rounded-lg" style={base} />
                <div className="h-7 w-16 rounded-lg" style={base} />
              </div>
            </div>

            <div className="space-y-2">
              <div className="h-3 w-full rounded" style={base} />
              <div className="h-3 w-5/6 rounded" style={base} />
              <div className="h-3 w-3/4 rounded" style={base} />
            </div>

            <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="rounded-xl p-3 border space-y-2" style={{ borderColor: 'var(--ks-card-border)', background: 'color-mix(in srgb, var(--ks-card-bg) 60%, transparent)' }}>
                  <div className="h-2.5 w-1/2 rounded" style={base} />
                  <div className="h-3 w-3/4 rounded" style={shimmer} />
                  <div className="h-2 w-1/3 rounded" style={base} />
                </div>
              ))}
            </div>

            <div className="sm:hidden flex gap-2">
              <div className="flex-1 h-8 rounded-lg" style={base} />
              <div className="flex-1 h-8 rounded-full" style={shimmer} />
            </div>
          </div>

          {/* Open chat card skeleton (replaces inline chat) */}
          <div className="glass-card rounded-xl p-6 flex flex-col items-center justify-center text-center space-y-3 border" style={{ borderColor: 'var(--ks-card-border)', minHeight: 220 }}>
            <div className="w-12 h-12 rounded-2xl flex items-center justify-center" style={shimmer} />
            <div className="h-4 w-32 rounded" style={shimmer} />
            <div className="h-3 w-64 rounded" style={base} />
            <div className="h-3 w-52 rounded" style={base} />
            <div className="h-9 w-36 rounded-full" style={shimmer} />
            <div className="flex gap-1.5">
              <div className="h-5 w-14 rounded-full" style={base} />
              <div className="h-5 w-16 rounded-full" style={base} />
              <div className="h-5 w-20 rounded-full" style={base} />
            </div>
          </div>
        </div>

        {/* Right: triage + details skeletons */}
        <div className="space-y-4">
          <div className="glass-card rounded-xl p-4 space-y-3">
            <div className="h-3 w-20 rounded" style={shimmer} />
            <div className="space-y-3">
              <div className="space-y-1.5">
                <div className="h-2.5 w-14 rounded" style={base} />
                <div className="h-9 w-full rounded-lg" style={base} />
              </div>
              <div className="space-y-1.5">
                <div className="h-2.5 w-14 rounded" style={base} />
                <div className="h-9 w-full rounded-lg" style={base} />
              </div>
              <div className="space-y-1.5">
                <div className="h-2.5 w-14 rounded" style={base} />
                <div className="flex gap-2">
                  <div className="flex-1 h-9 rounded-lg" style={base} />
                  <div className="h-9 w-16 rounded-lg" style={shimmer} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2 pt-2">
                <div className="h-9 rounded-lg" style={shimmer} />
                <div className="h-9 rounded-lg" style={base} />
              </div>
            </div>
          </div>

          <div className="glass-card rounded-xl p-4 space-y-3">
            <div className="h-3 w-28 rounded" style={shimmer} />
            <div className="space-y-2.5">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="flex justify-between items-center">
                  <div className="h-2.5 w-16 rounded" style={base} />
                  <div className="h-3 w-24 rounded" style={shimmer} />
                </div>
              ))}
              <div className="pt-2 border-t space-y-2" style={{ borderColor: 'var(--ks-card-border)' }}>
                {Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className="flex justify-between">
                    <div className="h-2.5 w-16 rounded" style={base} />
                    <div className="h-3 w-20 rounded" style={base} />
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="glass-card rounded-xl p-4 space-y-2">
            <div className="h-3 w-28 rounded" style={shimmer} />
            <div className="h-3 w-full rounded" style={base} />
            <div className="h-3 w-5/6 rounded" style={base} />
            <div className="flex gap-1.5 pt-1">
              <div className="h-5 w-16 rounded-full" style={base} />
              <div className="h-5 w-14 rounded-full" style={base} />
              <div className="h-5 w-20 rounded-full" style={base} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default TicketDetailSkeleton;
