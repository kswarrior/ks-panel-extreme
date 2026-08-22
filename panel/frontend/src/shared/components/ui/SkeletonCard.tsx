import React from 'react';

interface Props {
  className?: string;
  // Number of skeleton lines to render vertically inside the block.
  lines?: number;
}

// SkeletonCard renders an animated placeholder block in neutral-800 tones.
// Use it while data is being fetched so the UI doesn't flash "Loading…".
const SkeletonCard: React.FC<Props> = ({ className = '', lines = 3 }) => {
  return (
    <div
      className={`glass-card rounded-xl animate-pulse ${className}`}
    >
      <div className="h-5 w-1/3 bg-neutral-800 rounded mb-3" />
      <div className="space-y-2">
        {Array.from({ length: lines }).map((_, i) => (
          <div
            key={i}
            className="h-3 bg-neutral-800 rounded"
            style={{ width: `${100 - i * 12}%` }}
          />
        ))}
      </div>
    </div>
  );
};

export default SkeletonCard;
