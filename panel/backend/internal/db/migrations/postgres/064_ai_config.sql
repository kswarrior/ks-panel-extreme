-- 064_ai_config.sql: default KV rows for the panel-wide AI assistant.
--
-- The AI assistant stores its runtime config in the existing settings KV
-- (same shape as panel_port in 040 / ddos settings in 039) so the
-- migration is symmetric across all three supported engines. No schema
-- change is needed: the repository layer reads each key with a safe
-- fallback (disabled / empty) and the API key itself is sealed with
-- secretbox before it ever lands in ai_api_key_enc.
--
-- Keys:
--   ai_enabled      "1"/"0" — master kill-switch (default off).
--   ai_base_url     provider base URL (OpenAI-compatible root or Ollama root).
--   ai_api_key_enc  secretbox-sealed provider key (base64 of nonce||cipher).
--   ai_model_id     model id sent to the provider.
--   ai_ollama_mode  "1" = talk Ollama /api/chat, "0" = OpenAI /chat/completions.
--   ai_temperature  float 0..2 (stored as string).
--   ai_max_tokens   int cap per reply (stored as string).
--   ai_allow_writes "1"/"0" — writes kill-switch (default off: read-only).
--   ai_system_extra admin-authored extra system instructions.
--   hosting_name    public hosting brand used in the assistant identity.
--   hosting_about   short "about us" blurb used in the assistant identity.

INSERT INTO settings (key, value) VALUES
  ('ai_enabled', '0'),
  ('ai_base_url', ''),
  ('ai_api_key_enc', ''),
  ('ai_model_id', ''),
  ('ai_ollama_mode', '0'),
  ('ai_temperature', '0.7'),
  ('ai_max_tokens', '1024'),
  ('ai_allow_writes', '0'),
  ('ai_system_extra', ''),
  ('hosting_name', ''),
  ('hosting_about', '') ON CONFLICT DO NOTHING;
