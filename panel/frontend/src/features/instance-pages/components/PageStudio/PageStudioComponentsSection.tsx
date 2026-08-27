import React from 'react';
import { sectionCls } from '@/features/instance-pages/types/pageStudio';

export interface PageStudioComponentsSectionProps {
  sectionCls?: string;
}

export const PageStudioComponentsSection: React.FC<PageStudioComponentsSectionProps> = ({
  sectionCls: cls = sectionCls,
}) => {
  return (
    <div className={cls}>
      <h4 className="text-sm font-semibold uppercase tracking-wide text-gray-400 mb-1">Section E · Components</h4>
      <h3 className="text-sm font-semibold text-white mb-3">Reusable components</h3>
      <p className="text-xs text-gray-500">
        Components for Instance Pages are coming soon. This tab will host reusable UI blocks, custom
        page components, and shared partials that can be referenced across pages.
      </p>
      <div className="mt-4 p-4 border border-dashed border-white/10 rounded-lg text-center text-sm text-gray-500">
        No components defined yet.
      </div>
    </div>
  );
};
