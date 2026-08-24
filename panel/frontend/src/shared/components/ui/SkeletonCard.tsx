import React from 'react';

interface Props {
  className?: string;
  // Number of skeleton lines to render vertically inside the block.
  lines?: number;
}

// SkeletonCard renders an animated placeholder block. Bar fills come from
// the themed --ks-skeleton-* tokens (Theme Studio → Loading) with stock
// neutral-800 fallbacks so the pre-theme look is unchanged.
const SkeletonCard: React.FC<Props> = ({ className = '', lines = 3 }) => {
  const barStyle: React.CSSProperties = {
    backgroundColor: 'var(--ks-skeleton-shimmer, #262626)',
    borderRadius: 'var(--ks-skeleton-radius, 4px)',
  };
  return (
    <div
      className={`glass-card rounded-xl animate-pulse ${className}`}
    >
      <div className="h-5 w-1/3 rounded mb-3" style={{ backgroundColor: 'var(--ks-skeleton-base, #262626)', borderRadius: 'var(--ks-skeleton-radius, 4px)' }} />
      <div className="space-y-2">
        {Array.from({ length: lines }).map((_, i) => (
          <div
            key={i}
            className="h-3 rounded"
            style={{ ...barStyle, width: `${100 - i * 12}%` }}
          />
        ))}
      </div>
    </div>
  );
};

export default SkeletonCard;
