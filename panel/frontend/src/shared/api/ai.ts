import client from '@/shared/api/client';

export interface AiProvider {
  id: string;
  name: string;
  type: string;
  base_url: string;
  api_key: string;
  models: string[];
  enabled: boolean;
}

export interface AiConfig {
  system_prompt: string;
  providers: AiProvider[];
  default_provider: string;
  default_model: string;
}

export interface AiChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export async function getAiConfig(): Promise<AiConfig> {
  const res = await client.get<AiConfig>('/api/ai/config');
  return res.data;
}

export async function updateAiConfig(cfg: AiConfig): Promise<AiConfig> {
  const res = await client.put<AiConfig>('/api/ai/config', cfg);
  return res.data;
}

export interface AiChatRequest {
  provider_id: string;
  model: string;
  messages: AiChatMessage[];
}

export interface AiChatResponse {
  provider_id: string;
  model: string;
  reply: string;
}

export async function sendAiChat(req: AiChatRequest): Promise<AiChatResponse> {
  const res = await client.post<AiChatResponse>('/api/ai/chat', req);
  return res.data;
}

// Streaming variant: calls POST /api/ai/chat/stream and invokes onDelta for each SSE chunk.
// Retries every 5s up to 25 times if the stream cannot be established (network / 5xx / timeout).
// Resolves when the stream completes (done=true or [DONE]), rejects after 25 failed attempts.
export async function sendAiChatStream(
  req: AiChatRequest,
  onDelta: (delta: string) => void,
  opts?: { signal?: AbortSignal; maxRetries?: number; retryDelayMs?: number }
): Promise<void> {
  const maxRetries = opts?.maxRetries ?? 25;
  const retryDelayMs = opts?.retryDelayMs ?? 5000;
  let attempt = 0;
  let lastError: unknown = null;

  const getToken = (): string | null => {
    try {
      // Prefer Bearer token from auth store (multi-account), fall back to cookie via withCredentials
      const raw = (window as any)?.__KSPANEL_ACTIVE_TOKEN as string | undefined;
      void raw;
      // We rely on axios client's interceptor for Bearer, but fetch needs manual header.
      // Import lazily to avoid circular dep — use localStorage fallback as last resort.
      const stored = window.localStorage.getItem('ks.accounts.list');
      if (stored) {
        const list = JSON.parse(stored);
        const activeIdRaw = window.localStorage.getItem('ks.accounts.activeId');
        const activeId = activeIdRaw != null ? Number(activeIdRaw) : 0;
        const acct = Array.isArray(list) ? list[activeId] : null;
        if (acct?.token) return acct.token as string;
      }
    } catch {}
    return null;
  };

  while (attempt <= maxRetries) {
    if (opts?.signal?.aborted) throw new DOMException('Aborted', 'AbortError');
    try {
      const token = getToken();
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        Accept: 'text/event-stream',
      };
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const resp = await fetch('/api/ai/chat/stream', {
        method: 'POST',
        headers,
        credentials: 'include',
        body: JSON.stringify(req),
        signal: opts?.signal,
      });

      if (!resp.ok) {
        // Retry on 5xx / network, but not on 4xx client errors (except 429 which is retryable)
        const retryable = resp.status >= 500 || resp.status === 429 || resp.status === 408;
        if (!retryable) {
          const txt = await resp.text().catch(() => '');
          throw new Error(txt || `Request failed ${resp.status}`);
        }
        throw new Error(`Stream failed ${resp.status}`);
      }
      if (!resp.body) throw new Error('No stream body');

      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        // Keep last incomplete line in buffer
        buffer = lines.pop() ?? '';
        for (const rawLine of lines) {
          const line = rawLine.trim();
          if (!line) continue;
          if (line === 'data: [DONE]') {
            return;
          }
          if (!line.startsWith('data:')) continue;
          const data = line.slice(5).trim();
          if (!data || data === '[DONE]') continue;
          try {
            const obj = JSON.parse(data) as { delta?: string; done?: boolean; error?: string };
            if (obj.error) throw new Error(obj.error);
            if (obj.done) return;
            if (obj.delta) onDelta(obj.delta);
          } catch {
            // ignore malformed SSE line
          }
        }
        if (opts?.signal?.aborted) throw new DOMException('Aborted', 'AbortError');
      }
      // Flush remaining buffer
      const tail = buffer.trim();
      if (tail.startsWith('data:')) {
        const data = tail.slice(5).trim();
        if (data && data !== '[DONE]') {
          try {
            const obj = JSON.parse(data) as { delta?: string };
            if (obj.delta) onDelta(obj.delta);
          } catch {}
        }
      }
      return;
    } catch (e: any) {
      if (e?.name === 'AbortError') throw e;
      lastError = e;
      attempt += 1;
      if (attempt > maxRetries) break;
      // Wait 5s before retry, abortable
      await new Promise<void>((resolve, reject) => {
        const t = setTimeout(resolve, retryDelayMs);
        opts?.signal?.addEventListener('abort', () => {
          clearTimeout(t);
          reject(new DOMException('Aborted', 'AbortError'));
        }, { once: true });
      });
      if (opts?.signal?.aborted) throw new DOMException('Aborted', 'AbortError');
    }
  }
  throw lastError ?? new Error('Stream failed after retries');
}
