import React from 'react';

interface Props {
  className?: string;
  // Number of form field groups to fake while loading.
  fields?: number;
  // Show the avatar-circle + heading row (default true).
  header?: boolean;
}

// FormSkeleton renders a shimmering placeholder shaped like a typical
// form page (heading row, label+input pairs, footer buttons). Bar fills
// come from the themed --ks-skeleton-* tokens (Theme Studio → Loading)
// with stock neutral fallbacks so the pre-theme look is unchanged.
const FormSkeleton: React.FC<Props> = ({ className = '', fields = 4, header = true }) => {
  const base = {
    backgroundColor: 'var(--ks-skeleton-base, #262626)',
    borderRadius: 'var(--ks-skeleton-radius, 4px)',
  };
  const bar = {
    backgroundColor: 'var(--ks-skeleton-shimmer, #262626)',
    borderRadius: 'var(--ks-skeleton-radius, 4px)',
  };
  return (
    <div className={`glass-card rounded-xl p-6 space-y-5 animate-pulse ${className}`}>
      {header && (
        <div className="flex items-center gap-3 mb-1">
          <div className="w-10 h-10 rounded-full shrink-0" style={{ ...bar, borderRadius: '9999px' }} />
          <div className="flex-1 space-y-2">
            <div className="h-4 w-1/3 rounded" style={bar} />
            <div className="h-2.5 w-1/2 rounded" style={base} />
          </div>
        </div>
      )}
      {Array.from({ length: Math.max(1, fields) }).map((_, i) => (
        <div key={i} className="space-y-2">
          <div className="h-2.5 w-1/4 rounded" style={base} />
          <div className="h-9 w-full rounded-lg" style={base} />
        </div>
      ))}
      <div className="flex justify-end gap-2 pt-1">
        <div className="h-9 w-20 rounded-lg" style={base} />
        <div className="h-9 w-24 rounded-lg" style={bar} />
      </div>
    </div>
  );
};

export default FormSkeleton;
