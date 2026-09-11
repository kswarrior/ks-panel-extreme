import React from 'react';
import { PILL_TAB_STYLE } from '@/shared/components/ui/PageActionsPill';
import type { FormHistory } from '@/shared/hooks/useFormHistory';

interface PillHistoryControlsProps {
  hist: FormHistory;
}

// PillHistoryControls renders the undo / redo cluster that sits
// at the head of every form pill (before Save), sharing the
// pill's ks-tab sizing. Undo = curved back arrow, redo = curved forward
// arrow (NOT </> chevrons — those already mean collapse on the pill
// toggle).
export const PillHistoryControls: React.FC<PillHistoryControlsProps> = ({
  hist,
}) => {
  const btnClass =
    'ks-tab inline-flex items-center justify-center shrink-0 disabled:opacity-40 disabled:pointer-events-none';
  return (
    <>
      <button
        type="button"
        onClick={hist.undo}
        disabled={!hist.canUndo}
        title="Undo last edit"
        aria-label="Undo last edit"
        style={PILL_TAB_STYLE}
        className={btnClass}
      >
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4" aria-hidden="true"><path d="M9 14 4 9l5-5" /><path d="M4 9h10.5a5.5 5.5 0 0 1 5.5 5.5v0a5.5 5.5 0 0 1-5.5 5.5H11" /></svg>
      </button>
      <button
        type="button"
        onClick={hist.redo}
        disabled={!hist.canRedo}
        title="Redo"
        aria-label="Redo"
        style={PILL_TAB_STYLE}
        className={btnClass}
      >
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4" aria-hidden="true"><path d="m15 14 5-5-5-5" /><path d="M20 9H9.5A5.5 5.5 0 0 0 4 14.5v0A5.5 5.5 0 0 0 9.5 20H13" /></svg>
      </button>
    </>
  );
};

export default PillHistoryControls;
