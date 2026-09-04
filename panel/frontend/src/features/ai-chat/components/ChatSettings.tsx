import React, { useEffect, useState } from 'react';
import {
  DEFAULT_RETRY_PREFS,
  getAIConfig,
  loadRetryPrefs,
  saveRetryPrefs,
  testAIConfig,
  updateAIConfig,
  type AIConfigView,
  type AIRetryPrefs,
} from '../api/aiChat';

// Chat settings: only Providers (primary/fallback) + Retry.
// Ollama mode has no toggle — it follows the provider preset / base URL.
// Same backend as the old Settings > AI Assistant card
// (GET/PUT /api/ai/config): keys are sealed server-side, blank input
// means "keep the stored secret".
type Tab = 'primary' | 'fallback';

type Preset = 'openai' | 'ollama' | 'custom';

const PRESETS: { id: Preset; label: string; baseUrl: string; ollama: boolean; modelHint: string }[] = [
  { id: 'openai', label: 'OpenAI', baseUrl: 'https://api.openai.com/v1', ollama: false, modelHint: 'gpt-4o-mini' },
  { id: 'ollama', label: 'Ollama', baseUrl: 'http://localhost:11434', ollama: true, modelHint: 'llama3.1' },
  { id: 'custom', label: 'Custom (OpenAI-compatible)', baseUrl: '', ollama: false, modelHint: '' },
];

function detectPreset(baseUrl: string, ollama: boolean): Preset {
  const b = baseUrl.trim().replace(/\/+$/, '');
  if (ollama && (b === '' || b === 'http://localhost:11434' || b.endsWith(':11434'))) return 'ollama';
  if (!ollama && b === 'https://api.openai.com/v1') return 'openai';
  return 'custom';
}

function inferOllamaMode(baseUrl: string): boolean {
  const b = baseUrl.trim().replace(/\/+$/, '');
  if (!b) return false;
  return b === 'http://localhost:11434' || b.endsWith(':11434');
}

const inputCls =
  'w-full bg-black/30 text-white border border-white/10 placeholder-gray-500 rounded-md px-2.5 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-white/60 focus:border-white/40 transition-colors disabled:opacity-60';
const labelCls = 'block text-[11px] font-medium text-gray-300 mb-1';
const sectionCls = 'text-[11px] font-semibold uppercase tracking-wide text-gray-500';

const ChatSettings: React.FC = () => {
  const [cfg, setCfg] = useState<AIConfigView | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [testOut, setTestOut] = useState('');
  const [tab, setTab] = useState<Tab>('primary');
  const [apiKey, setApiKey] = useState('');
  const [fallbackApiKey, setFallbackApiKey] = useState('');
  const [retryPrefs, setRetryPrefs] = useState<AIRetryPrefs>(() => {
    try {
      return loadRetryPrefs();
    } catch {
      return { ...DEFAULT_RETRY_PREFS };
    }
  });

  const setRetry = (patch: Partial<AIRetryPrefs>) => {
    setRetryPrefs((p) => {
      const next: AIRetryPrefs = {
        autoRetry: patch.autoRetry ?? p.autoRetry,
        maxRetries: Math.max(1, Math.min(5, Math.round(patch.maxRetries ?? p.maxRetries) || 1)),
        baseDelaySec: Math.max(1, Math.min(30, Math.round(patch.baseDelaySec ?? p.baseDelaySec) || 1)),
      };
      saveRetryPrefs(next);
      return next;
    });
  };

  useEffect(() => {
    (async () => {
      try {
        setCfg(await getAIConfig());
      } catch (e: unknown) {
        const r = (e as { response?: { data?: unknown } })?.response;
        setError(typeof r?.data === 'string' ? r.data : 'Failed to load provider settings');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  if (loading) {
    return <p className="px-4 py-6 text-xs text-gray-400 animate-pulse">Loading provider settings…</p>;
  }

  if (!cfg) {
    return <p className="px-4 py-6 text-xs text-red-400">{error || 'Provider settings unavailable.'}</p>;
  }

  const set = (patch: Partial<AIConfigView>) => {
    setCfg((c) => (c ? { ...c, ...patch } : c));
    setSuccess('');
    setError('');
    setTestOut('');
  };

  const isFallback = tab === 'fallback';
  const baseUrl = isFallback ? cfg.fallback_base_url : cfg.base_url;
  const modelId = isFallback ? cfg.fallback_model_id : cfg.model_id;
  const ollamaMode = isFallback ? cfg.fallback_ollama_mode : cfg.ollama_mode;
  const keyConfigured = isFallback ? cfg.fallback_api_key_configured : cfg.api_key_configured;
  const keyValue = isFallback ? fallbackApiKey : apiKey;
  const setKeyValue = isFallback ? setFallbackApiKey : setApiKey;
  const preset = detectPreset(baseUrl, ollamaMode);

  const applyPreset = (p: Preset) => {
    const found = PRESETS.find((x) => x.id === p);
    if (!found) return;
    if (p === 'custom') return;
    if (isFallback) {
      set({ fallback_base_url: found.baseUrl, fallback_ollama_mode: found.ollama });
      if (!modelId.trim() && found.modelHint) set({ fallback_model_id: found.modelHint });
    } else {
      set({ base_url: found.baseUrl, ollama_mode: found.ollama });
      if (!modelId.trim() && found.modelHint) set({ model_id: found.modelHint });
    }
  };

  const setBaseUrl = (v: string) =>
    isFallback ? set({ fallback_base_url: v, fallback_ollama_mode: inferOllamaMode(v) }) : set({ base_url: v, ollama_mode: inferOllamaMode(v) });
  const setModelId = (v: string) => (isFallback ? set({ fallback_model_id: v }) : set({ model_id: v }));

  const onTest = async () => {
    setTesting(true);
    setTestOut('');
    setError('');
    try {
      const res = await testAIConfig(isFallback ? 'fallback' : undefined);
      setTestOut(res.ok ? `OK (${res.model || 'model'}): ${res.reply || 'ok'}` : `Failed: ${res.error || 'unknown error'}`);
    } catch (err: unknown) {
      const r = (err as { response?: { data?: unknown } })?.response;
      setTestOut(`Failed: ${typeof r?.data === 'string' ? r.data : 'test request failed'}`);
    } finally {
      setTesting(false);
    }
  };

  const onSave = async () => {
    setSaving(true);
    setError('');
    setSuccess('');
    setTestOut('');
    try {
      const next = await updateAIConfig({
        enabled: cfg.enabled,
        base_url: cfg.base_url,
        api_key: apiKey || undefined,
        model_id: cfg.model_id,
        ollama_mode: cfg.ollama_mode,
        temperature: cfg.temperature,
        max_tokens: cfg.max_tokens,
        allow_writes: cfg.allow_writes,
        system_extra: cfg.system_extra,
        hosting_name: cfg.hosting_name,
        hosting_about: cfg.hosting_about,
        fallback_base_url: cfg.fallback_base_url,
        fallback_api_key: fallbackApiKey || undefined,
        fallback_model_id: cfg.fallback_model_id,
        fallback_ollama_mode: cfg.fallback_ollama_mode,
        cost_per_1k_in: cfg.cost_per_1k_in,
        cost_per_1k_out: cfg.cost_per_1k_out,
      });
      setCfg(next);
      setApiKey('');
      setFallbackApiKey('');
      setSuccess('AI Assistant settings saved.');
    } catch (err: unknown) {
      const r = (err as { response?: { data?: unknown } })?.response;
      setError(typeof r?.data === 'string' ? r.data : 'Failed to save provider');
    } finally {
      setSaving(false);
    }
  };

  const configured = cfg.base_url.trim() !== '' && cfg.model_id.trim() !== '';
  const statusLine = !cfg.enabled
    ? 'Disabled — turn on the assistant so roles with AI Chat access can talk to it.'
    : !configured
      ? 'Enabled but not configured — set Base URL + Model ID below, then Test connection.'
      : 'Enabled and configured — roles with AI Chat access can talk to it.';

  return (
    <div className="flex-1 overflow-y-auto px-4 py-3 space-y-4">
      <p className="text-[11px] text-gray-500 leading-relaxed">
        Panel-wide assistant. Keys are sealed server-side and never reach the browser — leave a key blank to keep the stored one.
      </p>

      {/* ── Assistant (master switches — fixes "disabled by administrator") ── */}
      <section className="space-y-3">
        <h4 className={sectionCls}>Assistant</h4>
        <p className={`text-[11px] leading-relaxed ${!cfg.enabled || !configured ? 'text-amber-300' : 'text-gray-500'}`}>
          {statusLine}
        </p>
        <label className="flex items-start justify-between gap-3 cursor-pointer select-none">
          <span className="flex-1 min-w-0">
            <span className="block text-xs font-medium text-gray-200">Enable assistant</span>
            <span className="block text-[11px] text-gray-500">Master kill-switch. Off = everyone gets “disabled by the administrator”.</span>
          </span>
          <button
            type="button"
            role="switch"
            aria-checked={cfg.enabled}
            aria-label="Enable assistant"
            onClick={() => set({ enabled: !cfg.enabled })}
            className={`ks-toggle shrink-0 ${cfg.enabled ? 'is-on' : ''}`}
          >
            <span className="ks-toggle__thumb" />
          </button>
        </label>
        <label className="flex items-start justify-between gap-3 cursor-pointer select-none">
          <span className="flex-1 min-w-0">
            <span className="block text-xs font-medium text-gray-200">Allow writes</span>
            <span className="block text-[11px] text-gray-500">Lets the assistant propose writes (start/stop, themes, templates…) as approval tickets. Each write still needs the caller’s area permission.</span>
          </span>
          <button
            type="button"
            role="switch"
            aria-checked={cfg.allow_writes}
            aria-label="Allow AI writes"
            onClick={() => set({ allow_writes: !cfg.allow_writes })}
            className={`ks-toggle shrink-0 ${cfg.allow_writes ? 'is-on' : ''}`}
          >
            <span className="ks-toggle__thumb" />
          </button>
        </label>
      </section>

      {/* ── Providers ─────────────────────────────────────────── */}
      <section className="space-y-3">
        <h4 className={sectionCls}>Providers</h4>
        <div className="grid grid-cols-2 gap-1 p-0.5 rounded-lg bg-black/30 border border-white/10" role="tablist" aria-label="Provider">
          {(['primary', 'fallback'] as Tab[]).map((t) => (
            <button
              key={t}
              type="button"
              role="tab"
              aria-selected={tab === t}
              onClick={() => {
                setTab(t);
                setTestOut('');
              }}
              className={`rounded-md px-2 py-1.5 text-xs font-medium transition-colors ${
                tab === t ? 'bg-white text-black' : 'text-gray-400 hover:text-white'
              }`}
            >
              {t === 'primary' ? 'Primary' : 'Fallback'}
            </button>
          ))}
        </div>
        {isFallback && (
          <p className="text-[11px] text-gray-500 leading-relaxed">
            Answers when the primary fails (transport error or HTTP 5xx/429). Empty base URL = no fallback.
          </p>
        )}

        <div>
          <label className={labelCls} htmlFor="ai-chat-provider">
            Provider
          </label>
          <select
            id="ai-chat-provider"
            value={preset}
            onChange={(e) => applyPreset(e.target.value as Preset)}
            className="w-full bg-black/30 text-gray-200 border border-white/10 rounded-md px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-white/60"
          >
            {PRESETS.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className={labelCls} htmlFor="ai-chat-base-url">
            Base URL
          </label>
          <input
            id="ai-chat-base-url"
            value={baseUrl}
            onChange={(e) => setBaseUrl(e.target.value)}
            placeholder={ollamaMode ? 'http://localhost:11434' : 'https://api.openai.com/v1'}
            spellCheck={false}
            className={inputCls}
          />
        </div>

        <div>
          <label className={labelCls} htmlFor="ai-chat-api-key">
            API Key {keyConfigured ? '(configured)' : '(not set)'}
          </label>
          <input
            id="ai-chat-api-key"
            type="password"
            value={keyValue}
            onChange={(e) => setKeyValue(e.target.value)}
            placeholder={keyConfigured ? 'Blank = keep stored key' : 'sk-… (Ollama usually needs none)'}
            autoComplete="off"
            className={inputCls}
          />
        </div>

        <div>
          <label className={labelCls} htmlFor="ai-chat-model">
            Model ID
          </label>
          <input
            id="ai-chat-model"
            value={modelId}
            onChange={(e) => setModelId(e.target.value)}
            placeholder={ollamaMode ? 'llama3.1' : 'gpt-4o-mini'}
            spellCheck={false}
            className={inputCls}
          />
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onTest}
            disabled={testing || saving}
            className="inline-flex items-center gap-2 bg-white/10 text-gray-200 px-3 py-1.5 rounded-md hover:bg-white/20 text-xs disabled:opacity-60"
          >
            {testing ? 'Testing…' : `Test ${isFallback ? 'fallback' : 'connection'}`}
          </button>
          {testOut && (
            <p className={`text-xs flex-1 min-w-0 truncate ${testOut.startsWith('OK') ? 'text-green-400' : 'text-red-400'}`} title={testOut}>
              {testOut}
            </p>
          )}
        </div>
      </section>

      {/* ── Retry ───────────────────────────────────────────── */}
      <section className="space-y-3">
        <h4 className={sectionCls}>Retry</h4>
        <label className="flex items-start justify-between gap-3 cursor-pointer select-none">
          <span className="flex-1 min-w-0">
            <span className="block text-xs font-medium text-gray-200">Auto-retry on rate limit</span>
            <span className="block text-[11px] text-gray-500">When the provider answers 429, wait and re-send automatically.</span>
          </span>
          <button
            type="button"
            role="switch"
            aria-checked={retryPrefs.autoRetry}
            aria-label="Auto-retry on rate limit"
            onClick={() => setRetry({ autoRetry: !retryPrefs.autoRetry })}
            className={`ks-toggle shrink-0 ${retryPrefs.autoRetry ? 'is-on' : ''}`}
          >
            <span className="ks-toggle__thumb" />
          </button>
        </label>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className={labelCls} htmlFor="ai-chat-max-retries">
              Max retries (1–5)
            </label>
            <input
              id="ai-chat-max-retries"
              type="number"
              min={1}
              max={5}
              step={1}
              value={retryPrefs.maxRetries}
              disabled={!retryPrefs.autoRetry}
              onChange={(e) => setRetry({ maxRetries: Number(e.target.value) })}
              className={inputCls}
            />
          </div>
          <div>
            <label className={labelCls} htmlFor="ai-chat-retry-delay">
              Base delay, sec (1–30)
            </label>
            <input
              id="ai-chat-retry-delay"
              type="number"
              min={1}
              max={30}
              step={1}
              value={retryPrefs.baseDelaySec}
              disabled={!retryPrefs.autoRetry}
              onChange={(e) => setRetry({ baseDelaySec: Number(e.target.value) })}
              className={inputCls}
            />
          </div>
        </div>
        <p className="text-[11px] text-gray-500 leading-relaxed">
          Honors the server's Retry-After hint when present, otherwise backs off exponentially from the base delay. A
          Retry button is always offered on the failed message.
        </p>
      </section>

      {error && <p className="text-xs text-red-400">{error}</p>}
      {success && <p className="text-xs text-green-400">{success}</p>}

      <div className="flex justify-end gap-2 pt-1 pb-1 sticky bottom-0">
        <button
          type="button"
          onClick={onSave}
          disabled={saving}
          className="inline-flex items-center gap-2 bg-white text-black px-3 py-1.5 rounded-md hover:bg-gray-200 text-xs font-medium disabled:opacity-60"
        >
          {saving ? 'Saving…' : 'Save all'}
        </button>
      </div>
    </div>
  );
};

export default ChatSettings;
