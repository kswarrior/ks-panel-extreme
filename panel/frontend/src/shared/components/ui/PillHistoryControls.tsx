import React from 'react';
import { PILL_TAB_STYLE } from '@/shared/components/ui/PageActionsPill';
import type { FormHistory } from '@/shared/hooks/useFormHistory';

interface PillHistoryControlsProps {
  hist: FormHistory;
  // Refresh re-fetches canonical state from the server (never resets to
  // defaults — the server values become the new baseline). Omit to hide.
  onRefresh?: () => void;
  refreshing?: boolean;
}

// PillHistoryControls renders the undo / redo / refresh cluster that sits
// at the head of every form pill (before Cancel / Save), sharing the
// pill's ks-tab sizing. Undo = curved back arrow, redo = curved forward
// arrow (NOT </> chevrons — those already mean collapse on the pill
// toggle). Refresh spins while the refetch is in flight.
export const PillHistoryControls: React.FC<PillHistoryControlsProps> = ({
  hist,
  onRefresh,
  refreshing = false,
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
      {onRefresh && (
        <button
          type="button"
          onClick={onRefresh}
          disabled={refreshing}
          title="Refresh from server (reloads saved values, never resets to defaults)"
          aria-label="Refresh from server"
          style={PILL_TAB_STYLE}
          className={btnClass}
        >
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} aria-hidden="true"><path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" /><path d="M21 3v5h-5" /><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16" /><path d="M8 16H3v5" /></svg>
        </button>
      )}
    </>
  );
};

export default PillHistoryControls;
