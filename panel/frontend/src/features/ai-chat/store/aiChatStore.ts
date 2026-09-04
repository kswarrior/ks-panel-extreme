import create from 'zustand';
import {
  approveAITicket,
  sendAIChat,
  type AIChatMessage,
  type AIConfirmationTicket,
  type AIExecuted,
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
  actionBusy: boolean;
  error: string;
  nextId: number;
  setOpen: (v: boolean) => void;
  toggle: () => void;
  send: (text: string) => Promise<void>;
  approveTicket: () => Promise<void>;
  denyTicket: () => void;
  clearError: () => void;
}

function errText(e: unknown, fallback: string): string {
  const r = (e as { response?: { data?: unknown; status?: number } })?.response;
  if (typeof r?.data === 'string' && r.data) return r.data;
  if (r?.data && typeof r.data === 'object') {
    const d = r.data as { error?: unknown; reply?: unknown };
    if (typeof d.error === 'string' && d.error) return d.error;
    if (typeof d.reply === 'string' && d.reply) return d.reply;
  }
  return fallback;
}

export const useAIChatStore = create<AIChatState>((set, get) => ({
  open: false,
  messages: [],
  ticket: null,
  loading: false,
  actionBusy: false,
  error: '',
  nextId: 1,

  setOpen: (v) => set({ open: v }),
  toggle: () => set((s) => ({ open: !s.open })),

  send: async (text) => {
    const trimmed = text.trim();
    if (!trimmed || get().loading || get().ticket) return;
    const userMsg: ChatBubble = { id: get().nextId, role: 'user', content: trimmed };
    set((s) => ({ messages: [...s.messages, userMsg], nextId: s.nextId + 1, loading: true, error: '' }));
    const history: AIChatMessage[] = [...get().messages]
      .slice(-20)
      .map((m) => ({ role: m.role, content: m.content }));
    try {
      const res = await sendAIChat(history);
      const reply = res.reply || 'The assistant returned an empty reply.';
      const assistant: ChatBubble = {
        id: get().nextId,
        role: 'assistant',
        content: reply,
        ticket: res.confirmation_ticket || null,
        executed: res.executed || null,
      };
      set((s) => ({
        messages: [...s.messages, assistant],
        nextId: s.nextId + 1,
        ticket: res.confirmation_ticket || null,
        loading: false,
      }));
    } catch (e) {
      set((s) => ({ loading: false, error: errText(e, 'Failed to reach the assistant') }));
    }
  },

  approveTicket: async () => {
    const t = get().ticket;
    if (!t || get().actionBusy) return;
    set({ actionBusy: true, error: '' });
    try {
      const res = await approveAITicket(t.id);
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

  clearError: () => set({ error: '' }),
}));
