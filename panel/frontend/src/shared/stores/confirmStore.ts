import create from 'zustand';
import type { ReactNode } from 'react';

// ------------------------------------------------------------------
//  Confirm store
// ------------------------------------------------------------------
//  Panel-owned replacement for browser-native confirm(). Any page can
//  await a themed dialog instead of the ugly chrome popup:
//
//    const confirm = useConfirm();
//    if (!(await confirm({ title: 'Delete X', message: '…', tone: 'danger' }))) return;
//
//  Non-React code (SDK bridge, helpers) uses confirmDialog() directly.
//  The host <ConfirmDialog /> is mounted once in App and renders
//  whatever request() last pushed; settle() resolves the promise and
//  closes. A second request while one is open cancels the first so a
//  dangling promise never hangs a handler.

export type ConfirmTone = 'danger' | 'warning' | 'default';

export interface ConfirmOptions {
  // Heading — falls back to "Are you sure?".
  title?: string;
  // Body copy / question. Accepts a node for inline <code> etc.
  message: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: ConfirmTone;
}

interface ConfirmState {
  open: boolean;
  opts: ConfirmOptions | null;
  resolve: ((v: boolean) => void) | null;
  request: (opts: ConfirmOptions) => Promise<boolean>;
  settle: (v: boolean) => void;
}

export const useConfirmStore = create<ConfirmState>((set, get) => ({
  open: false,
  opts: null,
  resolve: null,

  request: (opts) =>
    new Promise<boolean>((resolve) => {
      // Cancel any dialog that is somehow still open so its awaiting
      // caller unblocks instead of leaking a promise forever.
      const prev = get().resolve;
      if (prev) prev(false);
      set({ open: true, opts, resolve });
    }),

  settle: (v) => {
    const r = get().resolve;
    set({ open: false, resolve: null, opts: null });
    r?.(v);
  },
})));

// Hook form for components — stable reference, safe in deps arrays.
export const useConfirm = () => useConfirmStore((s) => s.request);

// Plain-function form for non-component contexts.
export const confirmDialog = (opts: ConfirmOptions): Promise<boolean> =>
  useConfirmStore.getState().request(opts);
