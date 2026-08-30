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
