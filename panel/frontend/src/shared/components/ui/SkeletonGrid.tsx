import React from 'react';
import SkeletonCard from './SkeletonCard';

interface Props {
  count?: number;
}

// Renders a grid of skeleton cards. Mirrors the layout used by Users/Roles
// while data is loading.
const SkeletonGrid: React.FC<Props> = ({ count = 6 }) => {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
      {Array.from({ length: count }).map((_, i) => (
        <SkeletonCard key={i} />
      ))}
    </div>
  );
};

export default SkeletonGrid;
