import client from '@/shared/api/client';

// Admin + masked AI assistant config (GET is masked, PUT needs SETTINGS_EDIT).
// The provider key never reaches the browser: blank means "keep".
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
  error?: string;
}

export interface AIChatMessage {
  role: 'user' | 'assistant';
  content: string;
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

export async function testAIConfig(): Promise<AITestResult> {
  const res = await client.post<AITestResult>('/api/ai/test', {}, { timeout: 35000 });
  return res.data;
}

export async function sendAIChat(messages: AIChatMessage[]): Promise<AIChatResponse> {
  const res = await client.post<AIChatResponse>('/api/ai/chat', { messages }, { timeout: CHAT_TIMEOUT });
  return res.data;
}

export async function approveAITicket(ticketId: string): Promise<AIChatResponse> {
  const res = await client.post<AIChatResponse>(
    '/api/ai/chat',
    { approve_ticket_id: ticketId },
    { timeout: CHAT_TIMEOUT },
  );
  return res.data;
}
