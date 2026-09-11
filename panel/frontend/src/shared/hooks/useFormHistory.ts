import { useCallback, useEffect, useReducer, useRef } from 'react';

// useFormHistory — session edit history for panel forms (undo / redo /
// dirty-tracking), shared by every form pill (Settings, Security tabs,
// nodes / users / roles / templates / …).
//
// Model: the form owns its many useStates as today. Each render it builds
// ONE deterministic JSON snapshot of every editable field and passes it
// in; this hook diffs snapshots over time:
//
//   - user edit (snapshot changes) → previous snapshot pushed to past
//     (fast typing within GROUP_MS coalesces into one step), future cleared
//   - undo() → restores past top (form setters run via `restore`), the
//     undone state moves to future so redo() can replay it
//   - commit() → call after a successful save: latest known state becomes
//     the new baseline, both stacks clear. Reads from a ref, so it is safe
//     to call from async continuations even if the user kept typing while
//     the save was in flight.
//   - suspend() → call immediately before applying server state (initial
//     load, refresh, save echo — same tick as the setters, never across an
//     await): the next snapshot change rebaselines silently (fresh server
//     values become the new baseline) instead of pushing an undo step,
//     and stacks clear.
//   - revert() → Cancel/discard: restores the baseline (last saved /
//     loaded values) with no network round-trip, stacks clear. No-op when
//     already pristine.
//   - isDirty → snapshot !== baseline; drives Cancel disabled state.
//
// restore must set EVERY snapshotted field (missing fields go stale on
// undo). Snapshots must be key-order stable — build them from one object
// literal in the same order every render.

const GROUP_MS = 800;
const MAX_STEPS = 50;

export interface FormHistory {
  canUndo: boolean;
  canRedo: boolean;
  isDirty: boolean;
  undo: () => void;
  redo: () => void;
  commit: () => void;
  suspend: () => void;
  revert: () => void;
}

export function useFormHistory(snapshot: string, restore: (snap: string) => void): FormHistory {
  const restoreRef = useRef(restore);
  restoreRef.current = restore;
  const snapshotRef = useRef(snapshot);
  snapshotRef.current = snapshot;
  const lastRef = useRef(snapshot);
  const baselineRef = useRef(snapshot);
  const pastRef = useRef<string[]>([]);
  const futureRef = useRef<string[]>([]);
  const suspendedRef = useRef(false);
  const stampRef = useRef(0);
  const [rev, bump] = useReducer((x: number) => x + 1, 0);

  // Capture user edits. Suspended runs (load / refresh / save echo /
  // revert) rebaseline silently instead of pushing.
  useEffect(() => {
    if (suspendedRef.current) {
      suspendedRef.current = false;
      lastRef.current = snapshot;
      baselineRef.current = snapshot;
      pastRef.current = [];
      futureRef.current = [];
      bump();
      return;
    }
    if (snapshot === lastRef.current) return;
    const now = Date.now();
    // Coalesce fast typing bursts into one undo step; distinct pauses
    // (field hops, picks, toggles) each push their own step.
    if (!pastRef.current.length || now - stampRef.current >= GROUP_MS) {
      pastRef.current.push(lastRef.current);
      if (pastRef.current.length > MAX_STEPS) pastRef.current.shift();
    }
    stampRef.current = now;
    lastRef.current = snapshot;
    futureRef.current = [];
    bump();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [snapshot]);

  const undo = useCallback(() => {
    const past = pastRef.current;
    if (!past.length) return;
    const prev = past.pop() as string;
    futureRef.current.push(lastRef.current);
    lastRef.current = prev;
    try {
      restoreRef.current(prev);
    } finally {
      bump();
    }
  }, []);

  const redo = useCallback(() => {
    const future = futureRef.current;
    if (!future.length) return;
    const next = future.pop() as string;
    pastRef.current.push(lastRef.current);
    lastRef.current = next;
    try {
      restoreRef.current(next);
    } finally {
      bump();
    }
  }, []);

  const commit = useCallback(() => {
    // Baseline follows the latest known snapshot (covers keystrokes typed
    // while the save was in flight). A suspended server-echo render still
    // in flight rebaselines again on arrival — convergent either way.
    baselineRef.current = lastRef.current;
    lastRef.current = snapshotRef.current;
    pastRef.current = [];
    futureRef.current = [];
    bump();
  }, []);

  const suspend = useCallback(() => {
    suspendedRef.current = true;
  }, []);

  const revert = useCallback(() => {
    const base = baselineRef.current;
    if (snapshotRef.current === base) return;
    suspendedRef.current = true;
    lastRef.current = base;
    try {
      restoreRef.current(base);
    } finally {
      bump();
    }
  }, []);

  void rev;
  return {
    canUndo: pastRef.current.length > 0,
    canRedo: futureRef.current.length > 0,
    isDirty: snapshot !== baselineRef.current,
    undo,
    redo,
    commit,
    suspend,
    revert,
  };
}
