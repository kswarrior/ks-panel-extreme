import React, { useEffect, useState } from 'react';
import {
  getAIConfig,
  testAIConfig,
  updateAIConfig,
  type AIConfigView,
} from '../api/aiChat';

// Compact provider settings for the floating chat panel (admin only).
// Same backend as Settings > AI Assistant (GET/PUT /api/ai/config):
// the keys are sealed server-side, blank input means "keep stored secret".
// Presets just fill base URL + Ollama mode — everything stays editable
// so any OpenAI-compatible endpoint can be added by base URL + API key
// + model ID.
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

const inputCls =
  'w-full bg-black/30 text-white border border-white/10 placeholder-gray-500 rounded-md px-2.5 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-white/60 focus:border-white/40 transition-colors disabled:opacity-60';
const labelCls = 'block text-[11px] font-medium text-gray-300 mb-1';

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

  const setBaseUrl = (v: string) => (isFallback ? set({ fallback_base_url: v }) : set({ base_url: v }));
  const setModelId = (v: string) => (isFallback ? set({ fallback_model_id: v }) : set({ model_id: v }));
  const setOllama = (v: boolean) => (isFallback ? set({ fallback_ollama_mode: v }) : set({ ollama_mode: v }));

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
        fallback_base_url: cfg.fallback_base_url,
        fallback_api_key: fallbackApiKey || undefined,
        fallback_model_id: cfg.fallback_model_id,
        fallback_ollama_mode: cfg.fallback_ollama_mode,
      });
      setCfg(next);
      setApiKey('');
      setFallbackApiKey('');
      setSuccess('Provider saved.');
    } catch (err: unknown) {
      const r = (err as { response?: { data?: unknown } })?.response;
      setError(typeof r?.data === 'string' ? r.data : 'Failed to save provider');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
      <label className="flex items-start justify-between gap-3 cursor-pointer select-none">
        <span className="flex-1 min-w-0">
          <span className="block text-xs font-medium text-gray-200">Enabled</span>
          <span className="block text-[11px] text-gray-500">Master kill-switch for the assistant.</span>
        </span>
        <button
          type="button"
          role="switch"
          aria-checked={cfg.enabled}
          aria-label="AI assistant enabled"
          onClick={() => set({ enabled: !cfg.enabled })}
          className={`ks-toggle shrink-0 ${cfg.enabled ? 'is-on' : ''}`}
        >
          <span className="ks-toggle__thumb" />
        </button>
      </label>

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
          className="flex-1 min-w-0 w-full bg-black/30 text-gray-200 border border-white/10 rounded-md px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-white/60"
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

      <label className="flex items-start justify-between gap-3 cursor-pointer select-none">
        <span className="flex-1 min-w-0">
          <span className="block text-xs font-medium text-gray-200">Ollama mode</span>
          <span className="block text-[11px] text-gray-500">Talk Ollama /api/chat instead of OpenAI /chat/completions.</span>
        </span>
        <button
          type="button"
          role="switch"
          aria-checked={ollamaMode}
          aria-label="Ollama mode"
          onClick={() => setOllama(!ollamaMode)}
          className={`ks-toggle shrink-0 ${ollamaMode ? 'is-on' : ''}`}
        >
          <span className="ks-toggle__thumb" />
        </button>
      </label>

      {error && <p className="text-xs text-red-400">{error}</p>}
      {success && <p className="text-xs text-green-400">{success}</p>}
      {testOut && (
        <p className={`text-xs ${testOut.startsWith('OK') ? 'text-green-400' : 'text-red-400'}`}>{testOut}</p>
      )}

      <div className="flex justify-end gap-2 pt-1">
        <button
          type="button"
          onClick={onTest}
          disabled={testing || saving}
          className="inline-flex items-center gap-2 bg-white/10 text-gray-200 px-3 py-1.5 rounded-md hover:bg-white/20 text-xs disabled:opacity-60"
        >
          {testing ? 'Testing…' : 'Test'}
        </button>
        <button
          type="button"
          onClick={onSave}
          disabled={saving}
          className="inline-flex items-center gap-2 bg-white text-black px-3 py-1.5 rounded-md hover:bg-gray-200 text-xs font-medium disabled:opacity-60"
        >
          {saving ? 'Saving…' : 'Save'}
        </button>
      </div>
    </div>
  );
};

export default ChatSettings;
