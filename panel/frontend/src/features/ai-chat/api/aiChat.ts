import client from '@/shared/api/client';
import { useAuthStore } from '@/shared/stores/authStore';

// Admin + masked AI assistant config (GET is masked, PUT needs SETTINGS_EDIT).
// The provider keys never reach the browser: blank means "keep".
export interface AIConfigView {
  enabled: boolean;
  base_url: string;
  api_key_configured: boolean;
  model_id: string;
  ollama_mode: boolean;
  temperature: number;
  max_tokens: number;
  allow_writes: boolean;
  system_extra: string;
  hosting_name: string;
  hosting_about: string;
  fallback_base_url: string;
  fallback_api_key_configured: boolean;
  fallback_model_id: string;
  fallback_ollama_mode: boolean;
  cost_per_1k_in: number;
  cost_per_1k_out: number;
}

export interface AIConfigUpdate {
  enabled?: boolean;
  base_url?: string;
  api_key?: string;
  model_id?: string;
  ollama_mode?: boolean;
  temperature?: number;
  max_tokens?: number;
  allow_writes?: boolean;
  system_extra?: string;
  hosting_name?: string;
  hosting_about?: string;
  fallback_base_url?: string;
  fallback_api_key?: string;
  fallback_model_id?: string;
  fallback_ollama_mode?: boolean;
  cost_per_1k_in?: number;
  cost_per_1k_out?: number;
}

export interface AITestResult {
  ok: boolean;
  model?: string;
  reply?: string;
  error?: string;
}

export interface AIConfirmationTicket {
  id: string;
  tool: string;
  summary: string;
  diff: string;
}

export interface AIExecuted {
  tool: string;
  summary: string;
  ok: boolean;
  result?: string;
  error?: string;
}

export interface AIChatResponse {
  reply: string;
  confirmation_ticket?: AIConfirmationTicket | null;
  executed?: AIExecuted | null;
  thread_id?: number;
  error?: string;
}

export interface AIChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface AIThread {
  id: number;
  title: string;
  msg_count: number;
  created_at: string;
}

export interface AIThreadMessage {
  id: number;
  role: string;
  content: string;
}

export interface AIUsageTotals {
  requests: number;
  in_tokens: number;
  out_tokens: number;
  cost_usd: number;
}

export interface AIUsageByModel {
  model: string;
  provider: string;
  requests: number;
  in_tokens: number;
  out_tokens: number;
  cost_usd: number;
}

export interface AIUsageRecent {
  user: string;
  model: string;
  provider: string;
  in_tokens: number;
  out_tokens: number;
  cost_usd: number;
  at: string;
}

export interface AIUsage {
  totals: AIUsageTotals;
  by_model: AIUsageByModel[];
  recent: AIUsageRecent[];
}

// Chat calls can take up to the server's 60s tool-loop budget, well above
// the shared client's 15s default — override per request.
const CHAT_TIMEOUT = 65000;

export async function getAIConfig(): Promise<AIConfigView> {
  const res = await client.get<AIConfigView>('/api/ai/config');
  return res.data;
}

export async function updateAIConfig(payload: AIConfigUpdate): Promise<AIConfigView> {
  const res = await client.put<AIConfigView>('/api/ai/config', payload);
  return res.data;
}

export async function testAIConfig(target?: 'fallback'): Promise<AITestResult> {
  const res = await client.post<AITestResult>('/api/ai/test', target ? { target } : {}, { timeout: 35000 });
  return res.data;
}

export interface AISendOptions {
  threadId?: number | null;
  // Per-request model override (admins only — the server ignores it for
  // everyone else).
  model?: string;
}

export async function sendAIChat(messages: AIChatMessage[], opts?: AISendOptions): Promise<AIChatResponse> {
  const res = await client.post<AIChatResponse>(
    '/api/ai/chat',
    {
      messages,
      thread_id: opts?.threadId ?? undefined,
      model: opts?.model || undefined,
    },
    { timeout: CHAT_TIMEOUT },
  );
  return res.data;
}

export async function approveAITicket(ticketId: string, threadId?: number | null): Promise<AIChatResponse> {
  const res = await client.post<AIChatResponse>(
    '/api/ai/chat',
    { approve_ticket_id: ticketId, thread_id: threadId ?? undefined },
    { timeout: CHAT_TIMEOUT },
  );
  return res.data;
}

// ---------------------------------------------------------------------------
// Streaming (SSE POST /api/ai/chat/stream). axios can't consume incremental
// bodies, so this uses fetch with the same auth (Bearer + cookie). Resolves
// with the assembled reply; token deltas arrive via onToken for incremental
// rendering. Any transport/SSE failure rejects so the caller can fall back
// to sendAIChat.
// ---------------------------------------------------------------------------

export interface AIStreamResult {
  reply: string;
  ticket: AIConfirmationTicket | null;
  threadId: number;
}

function authHeaders(): Record<string, string> {
  const token = useAuthStore.getState().activeAccountToken();
  const h: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) h.Authorization = `Bearer ${token}`;
  return h;
}

export async function streamAIChat(
  messages: AIChatMessage[],
  opts: AISendOptions & { onToken: (tok: string) => void; signal?: AbortSignal },
): Promise<AIStreamResult> {
  const res = await fetch('/api/ai/chat/stream', {
    method: 'POST',
    credentials: 'include',
    headers: authHeaders(),
    signal: opts.signal,
    body: JSON.stringify({
      messages,
      thread_id: opts.threadId ?? undefined,
      model: opts.model || undefined,
    }),
  });
  if (!res.ok || !res.body) {
    const text = await res.text().catch(() => '');
    throw new Error(text || `stream failed (HTTP ${res.status})`);
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = '';
  let reply = '';
  let ticket: AIConfirmationTicket | null = null;
  let threadId = opts.threadId ?? 0;

  const handleFrame = (raw: string) => {
    const line = raw.trim();
    if (!line.startsWith('data:')) return;
    const payload = line.slice(5).trim();
    if (!payload) return;
    let ev: {
      token?: string;
      ticket?: AIConfirmationTicket;
      done?: boolean;
      reply?: string;
      confirmation_ticket?: AIConfirmationTicket;
      thread_id?: number;
      error?: string;
    };
    try {
      ev = JSON.parse(payload);
    } catch {
      return;
    }
    if (typeof ev.token === 'string' && ev.token) {
      reply += ev.token;
      opts.onToken(ev.token);
    }
    if (ev.ticket) ticket = ev.ticket;
    if (ev.confirmation_ticket) ticket = ev.confirmation_ticket;
    if (typeof ev.thread_id === 'number') threadId = ev.thread_id;
    if (ev.done && typeof ev.reply === 'string') {
      // Non-tool path streams the full reply as tokens already; the done
      // frame's reply is authoritative (ticket path sends only a summary
      // via tokens, if any).
      if (!ticket) reply = ev.reply;
      else if (!reply) reply = ev.reply;
    }
    if (ev.error) throw new Error(ev.error);
  };

  for (;;) {
    const { done, value } = await reader.read();
    if (value) {
      buf += decoder.decode(value, { stream: true });
      let idx: number;
      while ((idx = buf.indexOf('\n\n')) >= 0) {
        const frame = buf.slice(0, idx);
        buf = buf.slice(idx + 2);
        for (const line of frame.split('\n')) handleFrame(line);
      }
    }
    if (done) break;
  }
  // Flush any trailing frame without a blank-line terminator.
  if (buf.trim()) for (const line of buf.split('\n')) handleFrame(line);
  return { reply: reply || 'The assistant returned an empty reply.', ticket, threadId };
}

// ---------------------------------------------------------------------------
// Threads + usage.
// ---------------------------------------------------------------------------

export async function listAIThreads(): Promise<AIThread[]> {
  const res = await client.get<{ threads: AIThread[] }>('/api/ai/threads');
  return res.data.threads || [];
}

export async function createAIThread(title?: string): Promise<AIThread> {
  const res = await client.post<{ thread: AIThread }>('/api/ai/threads', title ? { title } : {});
  return res.data.thread;
}

export async function getAIThread(id: number): Promise<{ thread: AIThread; messages: AIThreadMessage[] }> {
  const res = await client.get<{ thread: AIThread; messages: AIThreadMessage[] }>(`/api/ai/threads/${id}/messages`);
  return res.data;
}

export async function renameAIThread(id: number, title: string): Promise<AIThread> {
  const res = await client.put<{ thread: AIThread }>(`/api/ai/threads/${id}`, { title });
  return res.data.thread;
}

export async function deleteAIThread(id: number): Promise<void> {
  await client.delete(`/api/ai/threads/${id}`);
}

export async function getAIUsage(): Promise<AIUsage> {
  const res = await client.get<AIUsage>('/api/ai/usage');
  return res.data;
}
