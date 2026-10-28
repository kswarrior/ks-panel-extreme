import create from 'zustand';
import type { OverviewSectionDef } from '@/features/instances/components/OverviewSectionSelect';

interface OverviewSectionState {
  sections: OverviewSectionDef[];
  active: string;
  setActive: (id: string) => void;
  setSections: (sections: OverviewSectionDef[]) => void;
  reset: () => void;
}

export const useOverviewSectionStore = create<OverviewSectionState>((set) => ({
  sections: [],
  active: 'details',
  setActive: (id) => set({ active: id }),
  setSections: (sections) => set({ sections }),
  reset: () => set({ sections: [], active: 'details' }),
}));
