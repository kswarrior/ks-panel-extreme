import React, { useMemo } from 'react';
import { useParams } from 'react-router-dom';
import Slot from '@/shared/components/ui/Slot';

// ModScreen — full-screen host route for mod-provided admin pages (M15).
//
// An active mod that declares a `mod.screen` slot gets a real page here at
// /mods/view/<slug>/<path…>. The same <Slot> registry that powers the fixed
// layout mounts resolves the component from the mod's bundle; the URL slug is
// passed as the `mod` owner filter so two screen mods sharing the slot name
// can never render into each other's route. `path` carries the sub-path after
// the slug so a mod can route internally and deep links land on the same view.
//
// Deep link and Sidebar entry converge on this component — the Sidebar "Mods"
// section builds its entries from the cached slots registry and links here.
const ModScreen: React.FC = () => {
  const { slug = '', '*': sub = '' } = useParams<{ slug: string; '*': string }>();
  const context = useMemo(() => ({ slug, path: sub }), [slug, sub]);

  return (
    <div className="w-full max-w-6xl mx-auto">
      <Slot
        name="mod.screen"
        mod={slug}
        context={context}
        fallback={
          <div className="ks-card rounded-xl p-6 text-sm text-gray-400">
            No active mod is rendering this screen. It may have been deactivated, or its bundle
            failed to load — check the Mods page for its runtime status.
          </div>
        }
      />
    </div>
  );
};

export default ModScreen;
