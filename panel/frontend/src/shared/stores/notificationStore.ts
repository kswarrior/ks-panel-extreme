import create from 'zustand';
import type { Notification } from '@/features/notifications/types/notification';
import { getUnreadCount, listNotifications } from '@/features/notifications/api/notifications';

interface NotificationState {
  unread: number;
  recent: Notification[];
  loading: boolean;
  lastFetched: number | null;
  fetchUnread: () => Promise<void>;
  fetchRecent: () => Promise<void>;
  setUnread: (n: number) => void;
  markLocalRead: (id: number) => void;
  markAllLocalRead: () => void;
  removeLocal: (id: number) => void;
  applyPush: (n: Notification, unread: number) => void;
}

export const useNotificationStore = create<NotificationState>((set, get) => ({
  unread: 0,
  recent: [],
  loading: false,
  lastFetched: null,

  fetchUnread: async () => {
    try {
      const n = await getUnreadCount();
      set({ unread: n });
    } catch {
      // silent — polling should not surface a toast
    }
  },

  fetchRecent: async () => {
    set({ loading: true });
    try {
      const rows = await listNotifications({ limit: 10 });
      set({ recent: rows, lastFetched: Date.now(), loading: false });
      // also sync unread from stats if present via list? we keep separate poll for count
    } catch {
      set({ loading: false });
    }
  },

  setUnread: (n: number) => set({ unread: n }),

  markLocalRead: (id: number) =>
    set((s) => ({
      recent: s.recent.map((r) => (r.id === id ? { ...r, is_read: true } : r)),
      unread: Math.max(0, s.unread - (s.recent.find((x) => x.id === id && !x.is_read) ? 1 : 0)),
    })),

  markAllLocalRead: () =>
    set((s) => ({
      recent: s.recent.map((r) => ({ ...r, is_read: true })),
      unread: 0,
    })),

  removeLocal: (id: number) =>
    set((s) => {
      const wasUnread = s.recent.find((x) => x.id === id && !x.is_read);
      return {
        recent: s.recent.filter((x) => x.id !== id),
        unread: wasUnread ? Math.max(0, s.unread - 1) : s.unread,
      };
    }),

  // applyPush merges one WS-pushed notification into the bell state: the
  // row lands at the top of `recent` (capped at 10, like fetchRecent) and
  // the badge jumps to the server-reported unread count — no poll needed.
  applyPush: (n: Notification, unread: number) =>
    set((s) => {
      const exists = s.recent.some((x) => x.id === n.id);
      const recent = exists ? s.recent : [n, ...s.recent].slice(0, 10);
      return { recent, unread, lastFetched: Date.now() };
    }),
}));
