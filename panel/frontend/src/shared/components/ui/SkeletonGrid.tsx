import React from 'react';
import SkeletonCard from './SkeletonCard';
import { useThemeStore } from '@/shared/stores/themeStore';

interface Props {
  count?: number;
}

// Renders a grid of skeleton cards. Mirrors the layout used by Users/Roles
// while data is loading. Count defaults to the theme's Loading-tab
// "skeleton count" so the studio slider drives real list loading states.
const SkeletonGrid: React.FC<Props> = ({ count }) => {
  const themeCount = useThemeStore((s) => s.active().loading?.skeleton_count);
  const n = count ?? (typeof themeCount === 'number' ? themeCount : 6);
  return (
    <div className="ks-loading-host grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
      {Array.from({ length: n }).map((_, i) => (
        <SkeletonCard key={i} />
      ))}
    </div>
  );
};

export default SkeletonGrid;
