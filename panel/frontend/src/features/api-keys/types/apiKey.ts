// Re-export canonical types from shared so there is a single source of truth.
// Keeping this file avoids breaking existing imports via `features/api-keys/types/apiKey`.
export type { ApiKey, CreateApiKeyResult, ApiKeyMutationPayload } from '@/shared/types/apiKey';
