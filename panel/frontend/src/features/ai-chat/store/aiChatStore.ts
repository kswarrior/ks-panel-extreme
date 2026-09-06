import create from 'zustand';
import { useAuthStore } from '@/shared/stores/authStore';
import {
  approveAITicket,
  createAIThread,
  deleteAIThread,
  getAIThread,
  listAIThreads,
  loadRetryPrefs,
  rateLimitInfo,
  renameAIThread,
  sendAIChat,
  streamAIChat,
  type AIChatMessage,
  type AIConfirmationTicket,
  type AIExecuted,
  type AIThread,
} from '../api/aiChat';

export interface ChatBubble {
  id: number;
  role: 'user' | 'assistant';
  content: string;
  // Snapshot of the ticket proposed in this turn (stays visible as history
  // even after the active ticket is approved/denied).
  ticket?: AIConfirmationTicket | null;
  executed?: AIExecuted | null;
}

interface AIChatState {
  open: boolean;
  messages: ChatBubble[];
  // The ticket currently awaiting an Approve/Deny decision (at most one —
  // the server stops the tool loop at the first write proposal).
  ticket: AIConfirmationTicket | null;
  loading: boolean;
  streaming: boolean;
  actionBusy: boolean;
  error: string;
  nextId: number;
  threads: AIThread[];
  threadsLoading: boolean;
  activeThreadId: number | null;
  // Admin-only per-request model override (the server ignores it for
  // everyone else).
  modelOverride: string;
  // Failed-turn retry: the last user prompt is kept so a 429 / network
  // blip can be re-sent via the error card's Retry button (or automatically
  // when the Reliability prefs allow it).
  canRetry: boolean;
  lastPrompt: string;
  retrying: boolean;
  retryAttempt: number;
  retryMax: number;
  // Per-user floating-button visibility (profile dropdown toggle). When
  // hidden the FAB disappears but the chat stays reachable via the
  // profile menu's "Open AI assistant" row.
  fabHidden: boolean;
  setFabHidden: (v: boolean) => void;
  refreshFabPref: () => void;
  setOpen: (v: boolean) => void;
  toggle: () => void;
  setModelOverride: (v: string) => void;
  refreshThreads: () => Promise<void>;
  newThread: () => Promise<void>;
  selectThread: (id: number | null) => Promise<void>;
  renameThread: (id: number, title: string) => Promise<void>;
  removeThread: (id: number) => Promise<void>;
  send: (text: string) => Promise<void>;
  retry: () => Promise<void>;
  approveTicket: () => Promise<void>;
  denyTicket: () => void;
  clearError: () => void;
}

const THREAD_KEY = 'ai-chat-thread';
const FAB_KEY = 'ai-chat-fab-hidden';

// Per-user FAB visibility: the key is namespaced by the active account id
// so each user on a shared browser keeps their own toggle. Falls back to
// the un-namespaced key when no account is known yet.
function fabKey(): string {
  try {
    const st = useAuthStore.getState();
    const id = st.activeAccountId ?? st.user?.id ?? null;
    return id != null ? `${FAB_KEY}:${id}` : FAB_KEY;
  } catch {
    return FAB_KEY;
  }
}

function loadFabHidden(): boolean {
  try {
    return window.localStorage.getItem(fabKey()) === '1';
  } catch {
    return false;
  }
}

function storedThreadId(): number | null {
  try {
    const v = window.localStorage.getItem(THREAD_KEY);
    const n = v ? Number(v) : 0;
    return n > 0 ? n : null;
  } catch {
    return null;
  }
}

function rememberThreadId(id: number | null) {
  try {
    if (id) window.localStorage.setItem(THREAD_KEY, String(id));
    else window.localStorage.removeItem(THREAD_KEY);
  } catch {
    // Storage full/blocked — threads still work for this tab.
  }
}

function errText(e: unknown, fallback: string): string {
  const r = (e as { response?: { data?: unknown; status?: number } })?.response;
  if (typeof r?.data === 'string' && r.data) return r.data;
  if (r?.data && typeof r.data === 'object') {
    const d = r.data as { error?: unknown; reply?: unknown };
    if (typeof d.error === 'string' && d.error) return d.error;
    if (typeof d.reply === 'string' && d.reply) return d.reply;
  }
  if (e instanceof Error && e.message) return e.message;
  return fallback;
}

export const useAIChatStore = create<AIChatState>((set, get) => ({
  open: false,
  messages: [],
  ticket: null,
  loading: false,
  streaming: false,
  actionBusy: false,
  error: '',
  nextId: 1,
  threads: [],
  threadsLoading: false,
  activeThreadId: storedThreadId(),
  modelOverride: '',
  canRetry: false,
  lastPrompt: '',
  retrying: false,
  retryAttempt: 0,
  retryMax: 0,
  fabHidden: loadFabHidden(),

  setFabHidden: (v) => {
    try {
      window.localStorage.setItem(fabKey(), v ? '1' : '0');
    } catch {
      // Storage blocked — still applies for this session.
    }
    set({ fabHidden: v });
  },
  // Re-read the toggle for the current account (call on login / account
  // switch so a shared browser picks up each user's own preference).
  refreshFabPref: () => set({ fabHidden: loadFabHidden() }),

  setOpen: (v) => set({ open: v }),
  toggle: () => set((s) => ({ open: !s.open })),
  setModelOverride: (v) => set({ modelOverride: v }),

  refreshThreads: async () => {
    set({ threadsLoading: true });
    try {
      const threads = await listAIThreads();
      const active = get().activeThreadId;
      if (active && !threads.some((t) => t.id === active)) {
        rememberThreadId(null);
        set({ threads, activeThreadId: null, messages: [], ticket: null, threadsLoading: false });
        return;
      }
      set({ threads, threadsLoading: false });
    } catch {
      set({ threadsLoading: false });
    }
  },

  newThread: async () => {
    if (get().loading) return;
    try {
      const th = await createAIThread();
      rememberThreadId(th.id);
      set((s) => ({
        threads: [th, ...s.threads],
        activeThreadId: th.id,
        messages: [],
        ticket: null,
        error: '',
        canRetry: false,
        lastPrompt: '',
        retrying: false,
        retryAttempt: 0,
        retryMax: 0,
      }));
    } catch (e) {
      set({ error: errText(e, 'Failed to create a chat thread') });
    }
  },

  selectThread: async (id) => {
    if (get().loading || get().ticket) return;
    if (id === get().activeThreadId && get().messages.length > 0) return;
    if (id == null) {
      rememberThreadId(null);
      set({ activeThreadId: null, messages: [], ticket: null, error: '', canRetry: false, lastPrompt: '', retrying: false, retryAttempt: 0, retryMax: 0 });
      return;
    }
    set({ threadsLoading: true, error: '' });
    try {
      const { messages } = await getAIThread(id);
      let next = get().nextId;
      const bubbles: ChatBubble[] = messages.map((m) => ({
        id: next++,
        role: m.role === 'assistant' ? 'assistant' : 'user',
        content: m.content,
      }));
      rememberThreadId(id);
      set((s) => ({
        activeThreadId: id,
        messages: bubbles,
        ticket: null,
        nextId: next,
        threadsLoading: false,
        threads: s.threads.some((t) => t.id === id) ? s.threads : [...s.threads],
        canRetry: false,
        lastPrompt: '',
        retrying: false,
        retryAttempt: 0,
        retryMax: 0,
      }));
    } catch (e) {
      set({ threadsLoading: false, error: errText(e, 'Failed to load chat thread') });
    }
  },

  renameThread: async (id, title) => {
    const name = title.trim();
    if (!name) return;
    try {
      const th = await renameAIThread(id, name);
      set((s) => ({ threads: s.threads.map((t) => (t.id === id ? th : t)) }));
    } catch (e) {
      set({ error: errText(e, 'Failed to rename chat thread') });
    }
  },

  removeThread: async (id) => {
    if (get().loading) return;
    try {
      await deleteAIThread(id);
      set((s) => {
        const threads = s.threads.filter((t) => t.id !== id);
        if (s.activeThreadId !== id) return { threads };
        rememberThreadId(null);
        return { threads, activeThreadId: null, messages: [], ticket: null, canRetry: false, lastPrompt: '', retrying: false, retryAttempt: 0, retryMax: 0 };
      });
    } catch (e) {
      set({ error: errText(e, 'Failed to delete chat thread') });
    }
  },

  send: async (text) => {
    const trimmed = text.trim();
    if (!trimmed || get().loading || get().ticket) return;
    // Bind every turn to a persisted thread so history survives reloads.
    let threadId = get().activeThreadId;
    if (!threadId) {
      try {
        const th = await createAIThread();
        threadId = th.id;
        rememberThreadId(threadId);
        set((s) => ({ threads: [th, ...s.threads], activeThreadId: threadId }));
      } catch (e) {
        set({ error: errText(e, 'Failed to create a chat thread') });
        return;
      }
    }
    const userMsg: ChatBubble = { id: get().nextId, role: 'user', content: trimmed };
    set((s) => ({
      messages: [...s.messages, userMsg],
      nextId: s.nextId + 1,
      loading: true,
      streaming: false,
      error: '',
      canRetry: false,
      lastPrompt: trimmed,
      retrying: false,
      retryAttempt: 0,
      retryMax: 0,
    }));
    await runPrompt(get, set, trimmed, threadId);
  },

  retry: async () => {
    const st = get();
    if (st.loading || st.ticket || !st.canRetry || !st.lastPrompt.trim()) return;
    // Bind to a thread like send() does (the thread may have been created
    // after the failed turn was first attempted).
    let threadId = st.activeThreadId;
    if (!threadId) {
      try {
        const th = await createAIThread();
        threadId = th.id;
        rememberThreadId(threadId);
        set((s) => ({ threads: [th, ...s.threads], activeThreadId: threadId }));
      } catch (e) {
        set({ error: errText(e, 'Failed to create a chat thread') });
        return;
      }
    }
    set({ loading: true, streaming: false, error: '', canRetry: false, retrying: false, retryAttempt: 0, retryMax: 0 });
    await runPrompt(get, set, st.lastPrompt, threadId);
  },

  approveTicket: async () => {
    const t = get().ticket;
    if (!t || get().actionBusy) return;
    set({ actionBusy: true, error: '' });
    try {
      const res = await approveAITicket(t.id, get().activeThreadId);
      const assistant: ChatBubble = {
        id: get().nextId,
        role: 'assistant',
        content: res.reply || 'Done.',
        executed: res.executed || null,
      };
      set((s) => ({
        messages: [...s.messages, assistant],
        nextId: s.nextId + 1,
        ticket: res.confirmation_ticket || null,
        actionBusy: false,
      }));
      void get().refreshThreads();
    } catch (e) {
      set({ actionBusy: false, error: errText(e, 'Failed to execute the approved action') });
    }
  },

  denyTicket: () => {
    const t = get().ticket;
    if (!t) return;
    const note: ChatBubble = {
      id: get().nextId,
      role: 'assistant',
      content: `Denied — "${t.summary}" was not executed. Nothing changed.`,
    };
    set((s) => ({ messages: [...s.messages, note], nextId: s.nextId + 1, ticket: null, error: '' }));
  },

  clearError: () => set({ error: '', canRetry: false, lastPrompt: '', retrying: false, retryAttempt: 0, retryMax: 0 }),
}));

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

// runPrompt performs one assistant turn for an already-recorded user prompt:
// streaming fast path (token-by-token SSE) with JSON fallback. Rate-limit
// (429) failures auto-retry with backoff when the Reliability prefs allow
// it; the final failure keeps lastPrompt so the error card's Retry button
// can re-send. The assistant bubble is created once and reused across
// attempts so retries never stack duplicate bubbles.
async function runPrompt(
  get: () => AIChatState,
  set: (p: Partial<AIChatState> | ((s: AIChatState) => Partial<AIChatState>)) => void,
  prompt: string,
  threadId: number,
): Promise<void> {
  const prefs = loadRetryPrefs();
  // Server holds the thread window: send only the new turn when bound.
  const history: AIChatMessage[] = [{ role: 'user', content: prompt }];
  const model = get().modelOverride.trim() || undefined;

  const streamId = get().nextId;
  set((s) => ({
    messages: [...s.messages, { id: streamId, role: 'assistant', content: '' }],
    nextId: s.nextId + 1,
    streaming: true,
  }));

  let attempt = 0;
  for (;;) {
    try {
      const res = await streamAIChat(history, {
        threadId,
        model,
        onToken: (tok) =>
          set((s) => ({
            messages: s.messages.map((m) => (m.id === streamId ? { ...m, content: m.content + tok } : m)),
          })),
      });
      const reply = res.reply || 'The assistant returned an empty reply.';
      set((s) => ({
        messages: s.messages.map((m) =>
          m.id === streamId ? { ...m, content: reply, ticket: res.ticket } : m,
        ),
        ticket: res.ticket,
        loading: false,
        streaming: false,
        error: '',
        canRetry: false,
        lastPrompt: '',
        retrying: false,
        retryAttempt: 0,
        retryMax: 0,
      }));
      if (res.threadId) {
        rememberThreadId(res.threadId);
        set({ activeThreadId: res.threadId });
      }
      void get().refreshThreads();
      return;
    } catch (streamErr) {
      // JSON fallback for non-rate-limit SSE failures (and as the second
      // chance inside every attempt).
      try {
        const res = await sendAIChat(history, { threadId, model });
        const reply = res.reply || 'The assistant returned an empty reply.';
        set((s) => ({
          messages: s.messages.map((m) =>
            m.id === streamId ? { ...m, content: reply, ticket: res.confirmation_ticket || null, executed: res.executed || null } : m,
          ),
          ticket: res.confirmation_ticket || null,
          loading: false,
          streaming: false,
          error: '',
          canRetry: false,
          lastPrompt: '',
          retrying: false,
          retryAttempt: 0,
          retryMax: 0,
        }));
        if (res.thread_id) {
          rememberThreadId(res.thread_id);
          set({ activeThreadId: res.thread_id });
        }
        void get().refreshThreads();
        return;
      } catch (e) {
        const info = rateLimitInfo(e);
        if (!info.limited) {
          const streamInfo = rateLimitInfo(streamErr);
          if (streamInfo.limited) {
            // Stream hit the limit but JSON did not — treat as retryable.
            (info as { limited: boolean; retryAfter: number }).limited = true;
            (info as { limited: boolean; retryAfter: number }).retryAfter = info.retryAfter || streamInfo.retryAfter;
          }
        }
        if (info.limited && prefs.autoRetry && attempt < prefs.maxRetries) {
          attempt++;
          const backoff = Math.max(1, Math.min(info.retryAfter || prefs.baseDelaySec * 2 ** (attempt - 1), 120));
          set({
            streaming: false,
            retrying: true,
            retryAttempt: attempt,
            retryMax: prefs.maxRetries,
            error: `Rate limited — retrying in ${backoff}s… (attempt ${attempt}/${prefs.maxRetries})`,
          });
          // Reset the bubble so the retry streams fresh.
          set((s) => ({
            messages: s.messages.map((m) => (m.id === streamId ? { ...m, content: '' } : m)),
          }));
          await sleep(backoff * 1000);
          set({ streaming: true, error: '' });
          continue;
        }
        set((s) => ({
          // Drop the placeholder bubble when nothing ever streamed into
          // it — otherwise its empty content renders as a stuck
          // "Thinking…" above the error card. Partial replies are kept.
          messages: s.messages.filter((m) => m.id !== streamId || m.content.trim() !== ''),
          loading: false,
          streaming: false,
          retrying: false,
          retryAttempt: 0,
          retryMax: 0,
          error: errText(e, errText(streamErr, 'Failed to reach the assistant')),
          canRetry: true,
          lastPrompt: prompt,
        }));
        return;
      }
    }
  }
}
