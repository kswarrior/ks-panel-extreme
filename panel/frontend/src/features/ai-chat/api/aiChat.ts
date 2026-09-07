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

// ---------------------------------------------------------------------------
// Retry preferences (client-side, per browser). The chat store reads these
// when a request fails with 429 so the panel can back off and re-try
// instead of dead-ending. Tuned in the chat panel's gear > Reliability.
// ---------------------------------------------------------------------------

export interface AIRetryPrefs {
  autoRetry: boolean;
  maxRetries: number;
  baseDelaySec: number;
}

const RETRY_KEY = 'ai-chat-retry-prefs';

export const DEFAULT_RETRY_PREFS: AIRetryPrefs = { autoRetry: true, maxRetries: 2, baseDelaySec: 2 };

export function loadRetryPrefs(): AIRetryPrefs {
  try {
    const raw = window.localStorage.getItem(RETRY_KEY);
    if (!raw) return { ...DEFAULT_RETRY_PREFS };
    const p = JSON.parse(raw) as Partial<AIRetryPrefs>;
    return {
      autoRetry: p.autoRetry !== false,
      maxRetries: Math.max(1, Math.min(5, Math.round(Number(p.maxRetries) || DEFAULT_RETRY_PREFS.maxRetries))),
      baseDelaySec: Math.max(1, Math.min(30, Math.round(Number(p.baseDelaySec) || DEFAULT_RETRY_PREFS.baseDelaySec))),
    };
  } catch {
    return { ...DEFAULT_RETRY_PREFS };
  }
}

export function saveRetryPrefs(p: AIRetryPrefs): void {
  try {
    window.localStorage.setItem(RETRY_KEY, JSON.stringify(p));
  } catch {
    // Storage full/blocked — retry still works with in-memory defaults.
  }
}

// ---------------------------------------------------------------------------
// Enriched chat errors: carry the HTTP status + the server's rate-limit
// signal (code === 'rate_limited', retryAfter seconds) so the store can
// decide between "Retry" and plain failure. errText-style consumers keep
// working — the message is always human-readable.
// ---------------------------------------------------------------------------

export class AIChatError extends Error {
  status?: number;
  code?: string;
  retryAfter?: number;
  constructor(message: string, props?: { status?: number; code?: string; retryAfter?: number }) {
    super(message);
    this.name = 'AIChatError';
    if (props?.status) this.status = props.status;
    if (props?.code) this.code = props.code;
    if (props?.retryAfter) this.retryAfter = props.retryAfter;
  }
}

function retryAfterFromHeader(v: string | null): number {
  if (!v) return 0;
  const n = Number(String(v).trim());
  if (!Number.isFinite(n) || n <= 0 || n > 3600) return 0;
  return Math.round(n);
}

/** True when the failure is a rate limit (panel limiter or provider 429). */
export function rateLimitInfo(e: unknown): { limited: boolean; retryAfter: number } {
  const err = e as { status?: unknown; code?: unknown; retryAfter?: unknown; message?: unknown; response?: { status?: unknown; data?: unknown } };
  const status = typeof err?.status === 'number' ? err.status : typeof err?.response?.status === 'number' ? (err.response.status as number) : 0;
  const data = err?.response?.data as { code?: unknown; retry_after?: unknown; error?: unknown } | undefined;
  const code = typeof err?.code === 'string' ? err.code : typeof data?.code === 'string' ? data.code : '';
  let retryAfter = typeof err?.retryAfter === 'number' ? err.retryAfter : typeof data?.retry_after === 'number' ? (data.retry_after as number) : 0;
  if (!retryAfter) {
    const msg = [
      typeof err?.message === 'string' ? (err.message as string) : '',
      typeof err?.response?.data === 'string' ? (err.response.data as string) : '',
      typeof data?.error === 'string' ? (data.error as string) : '',
    ].join(' ');
    const m = msg.match(/retry after (\d+)\s*s/i);
    if (m) retryAfter = Math.max(0, Math.min(3600, Number(m[1])));
  }
  const text = [
    typeof err?.message === 'string' ? (err.message as string) : '',
    typeof err?.response?.data === 'string' ? (err.response.data as string) : '',
    typeof data?.error === 'string' ? (data.error as string) : '',
  ].join(' ').toLowerCase();
  const limited =
    status === 429 || code === 'rate_limited' || text.includes('rate limit') || text.includes('too many requests') || /\b429\b/.test(text);
  if (limited && !retryAfter) retryAfter = 60;
  return { limited, retryAfter: limited ? retryAfter : 0 };
}

function enrichAxiosError(e: unknown, fallback: string): AIChatError {
  const r = (e as { response?: { data?: unknown; status?: number; headers?: Record<string, unknown> } })?.response;
  let message = fallback;
  if (typeof r?.data === 'string' && r.data) message = r.data;
  else if (r?.data && typeof r.data === 'object') {
    const d = r.data as { error?: unknown };
    if (typeof d.error === 'string' && d.error) message = d.error;
  } else if (e instanceof Error && e.message) message = e.message;
  const data = r?.data as { code?: unknown; retry_after?: unknown } | undefined;
  let retryAfter = typeof data?.retry_after === 'number' ? (data.retry_after as number) : 0;
  const rawHeader = r?.headers?.['retry-after'];
  if (!retryAfter && rawHeader != null) retryAfter = retryAfterFromHeader(String(rawHeader));
  if (e instanceof AIChatError) return e;
  return new AIChatError(message, {
    status: r?.status,
    code: typeof data?.code === 'string' ? (data.code as string) : undefined,
    retryAfter: retryAfter || undefined,
  });
}

export async function getAIConfig(): Promise<AIConfigView> {
  const res = await client.get<AIConfigView>('/api/ai/config');
  return res.data;
}

export async function updateAIConfig(payload: AIConfigUpdate): Promise<AIConfigView> {
  const res = await client.put<AIConfigView>('/api/ai/config', payload);
  return res.data;
}

export interface AITestInput {
  target?: 'fallback';
  base_url?: string;
  api_key?: string;
  model_id?: string;
  ollama_mode?: boolean;
}

export async function testAIConfig(input?: AITestInput | 'fallback'): Promise<AITestResult> {
  let body: AITestInput = {};
  if (typeof input === 'string') body = { target: input };
  else if (input) body = input;
  const res = await client.post<AITestResult>('/api/ai/test', body, { timeout: 35000 });
  return res.data;
}

export interface AISendOptions {
  threadId?: number | null;
  // Per-request model override (admins only — the server ignores it for
  // everyone else).
  model?: string;
}

export async function sendAIChat(messages: AIChatMessage[], opts?: AISendOptions): Promise<AIChatResponse> {
  try {
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
  } catch (e) {
    throw enrichAxiosError(e, 'Failed to reach the assistant');
  }
}

export async function approveAITicket(ticketId: string, threadId?: number | null): Promise<AIChatResponse> {
  try {
    const res = await client.post<AIChatResponse>(
      '/api/ai/chat',
      { approve_ticket_id: ticketId, thread_id: threadId ?? undefined },
      { timeout: CHAT_TIMEOUT },
    );
    return res.data;
  } catch (e) {
    throw enrichAxiosError(e, 'Failed to execute the approved action');
  }
}

// Deny invalidates a pending write ticket server-side (single-use consume,
// idempotent) so a denied proposal can never be approved later via the API.
// The UI still clears its pending state even if this call fails — the ticket
// expires after 10 minutes either way.
export async function denyAITicket(ticketId: string): Promise<void> {
  try {
    await client.delete(`/api/ai/ticket/${encodeURIComponent(ticketId)}`);
  } catch {
    // Deny is best-effort: the ticket expires on its own. Swallowing here
    // keeps the UI responsive; the store still clears the pending card.
  }
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
    throw new AIChatError(text || `stream failed (HTTP ${res.status})`, {
      status: res.status,
      code: res.status === 429 ? 'rate_limited' : undefined,
      retryAfter: retryAfterFromHeader(res.headers.get('Retry-After')) || (res.status === 429 ? 60 : undefined),
    });
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
      code?: string;
      retry_after?: number;
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
    if (ev.error) {
      const retryAfter =
        typeof ev.retry_after === 'number' && ev.retry_after > 0 ? Math.min(3600, Math.round(ev.retry_after)) : undefined;
      throw new AIChatError(ev.error, {
        code: typeof ev.code === 'string' ? ev.code : undefined,
        retryAfter,
      });
    }
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
