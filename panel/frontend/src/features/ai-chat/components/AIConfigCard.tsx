import React, { useEffect, useState } from 'react';
import { getAIConfig, getAIUsage, testAIConfig, updateAIConfig, type AIConfigView, type AIUsage } from '../api/aiChat';
import { useAuthStore } from '@/shared/stores/authStore';
import { PermissionKey, hasPermissionAny } from '@/shared/types/permissions';
import SkeletonCard from '@/shared/components/ui/SkeletonCard';
import TextInput from '@/shared/components/ui/TextInput';
import NumberInput from '@/shared/components/ui/NumberInput';
import ToggleRow from '@/shared/components/ui/ToggleRow';

// Admin AI provider config (Settings > AI Assistant). SETTINGS_EDIT only.
// The API key inputs are write-only: blank means "keep the stored secret".
const AIConfigCard: React.FC = () => {
  const permissions = useAuthStore((s) => s.permissions);
  const canEdit = hasPermissionAny(permissions, PermissionKey.VIEW_SETTINGS, PermissionKey.SETTINGS_EDIT) &&
    permissions.includes(PermissionKey.SETTINGS_EDIT);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testingFallback, setTestingFallback] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [testOut, setTestOut] = useState('');
  const [fallbackTestOut, setFallbackTestOut] = useState('');
  const [cfg, setCfg] = useState<AIConfigView | null>(null);
  const [apiKey, setApiKey] = useState('');
  const [fallbackApiKey, setFallbackApiKey] = useState('');
  const [usage, setUsage] = useState<AIUsage | null>(null);
  const [usageError, setUsageError] = useState('');

  useEffect(() => {
    if (!canEdit) {
      setLoading(false);
      return;
    }
    (async () => {
      try {
        setCfg(await getAIConfig());
      } catch (e: unknown) {
        const r = (e as { response?: { data?: unknown } })?.response;
        setError(typeof r?.data === 'string' ? r.data : 'Failed to load AI config');
      } finally {
        setLoading(false);
      }
      try {
        setUsage(await getAIUsage());
      } catch {
        setUsageError('Usage stats unavailable.');
      }
    })();
  }, [canEdit]);

  if (!canEdit) return null;

  if (loading) {
    return (
      <div className="mt-6">
        <SkeletonCard lines={3} />
      </div>
    );
  }

  if (!cfg) {
    return error ? <p className="mt-6 text-sm text-red-400">{error}</p> : null;
  }

  const set = (patch: Partial<AIConfigView>) => {
    setCfg((c) => (c ? { ...c, ...patch } : c));
    setSuccess('');
    setError('');
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
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
      setSuccess('AI config saved.');
    } catch (err: unknown) {
      const r = (err as { response?: { data?: unknown } })?.response;
      setError(typeof r?.data === 'string' ? r.data : 'Failed to save AI config');
    } finally {
      setSaving(false);
    }
  };

  const onTest = async () => {
    setTesting(true);
    setTestOut('');
    setError('');
    try {
      const res = await testAIConfig();
      setTestOut(res.ok ? `OK (${res.model || 'model'}): ${res.reply || 'ok'}` : `Failed: ${res.error || 'unknown error'}`);
    } catch (err: unknown) {
      const r = (err as { response?: { data?: unknown } })?.response;
      setTestOut(`Failed: ${typeof r?.data === 'string' ? r.data : 'test request failed'}`);
    } finally {
      setTesting(false);
    }
  };

  const onTestFallback = async () => {
    setTestingFallback(true);
    setFallbackTestOut('');
    setError('');
    try {
      const res = await testAIConfig('fallback');
      setFallbackTestOut(res.ok ? `OK (${res.model || 'model'}): ${res.reply || 'ok'}` : `Failed: ${res.error || 'unknown error'}`);
    } catch (err: unknown) {
      const r = (err as { response?: { data?: unknown } })?.response;
      setFallbackTestOut(`Failed: ${typeof r?.data === 'string' ? r.data : 'test request failed'}`);
    } finally {
      setTestingFallback(false);
    }
  };

  return (
    <form onSubmit={submit} className="glass-card rounded-xl space-y-6 max-w-2xl mt-6">
      <section>
        <h3 className="text-sm font-semibold uppercase tracking-wide text-gray-400 mb-1">
          AI Assistant
        </h3>
        <p className="text-xs text-gray-500 mb-4">
          Panel-wide chat assistant (bottom-right bubble). The provider key is sealed server-side
          and never reaches the browser — leave the key blank to keep the stored one.
        </p>
        <div className="space-y-5">
          <ToggleRow
            id="ai-enabled"
            label="Enabled"
            description="Master kill-switch for the assistant."
            checked={cfg.enabled}
            onChange={(v) => set({ enabled: v })}
          />
          <TextInput
            id="ai-base-url"
            label="Base URL"
            value={cfg.base_url}
            onChange={(v) => set({ base_url: v })}
            placeholder="https://api.openai.com/v1  (or http://localhost:11434 for Ollama)"
          />
          <div>
            <TextInput
              id="ai-api-key"
              label={`API Key ${cfg.api_key_configured ? '(configured)' : '(not set)'}`}
              value={apiKey}
              onChange={setApiKey}
              placeholder={cfg.api_key_configured ? 'Blank = keep stored key' : 'sk-… (Ollama usually needs none)'}
              type="password"
            />
          </div>
          <TextInput
            id="ai-model"
            label="Model ID"
            value={cfg.model_id}
            onChange={(v) => set({ model_id: v })}
            placeholder="gpt-4o-mini  (or llama3.1 for Ollama)"
          />
          <ToggleRow
            id="ai-ollama"
            label="Ollama mode"
            description="Talk Ollama /api/chat instead of OpenAI /chat/completions."
            checked={cfg.ollama_mode}
            onChange={(v) => set({ ollama_mode: v })}
          />
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1" htmlFor="ai-temp">
                Temperature (0–2)
              </label>
              <input
                id="ai-temp"
                type="number"
                min={0}
                max={2}
                step={0.1}
                value={cfg.temperature}
                onChange={(e) => set({ temperature: Number(e.target.value) })}
                className="w-full bg-black/30 backdrop-blur-md text-white border border-white/10 placeholder-gray-500 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-white/60 focus:border-white/40 transition-colors duration-150"
              />
            </div>
            <NumberInput
              id="ai-max-tokens"
              label="Max tokens (1–8192)"
              value={cfg.max_tokens}
              onChange={(v) => set({ max_tokens: Math.max(1, Math.min(8192, Math.round(v) || 1)) })}
              min={1}
              max={8192}
            />
          </div>
          <ToggleRow
            id="ai-writes"
            label="Writes allowed"
            description="Kill-switch: when off the assistant is read-only and write tools are refused."
            checked={cfg.allow_writes}
            onChange={(v) => set({ allow_writes: v })}
          />
          <TextInput
            id="ai-hosting-name"
            label="Hosting name"
            value={cfg.hosting_name}
            onChange={(v) => set({ hosting_name: v })}
            placeholder="Used in the assistant identity line"
          />
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1" htmlFor="ai-about">
              About this hosting
            </label>
            <textarea
              id="ai-about"
              value={cfg.hosting_about}
              onChange={(e) => set({ hosting_about: e.target.value })}
              rows={2}
              placeholder="One or two sentences the assistant uses to describe your hosting"
              className="w-full bg-black/30 backdrop-blur-md text-white border border-white/10 placeholder-gray-500 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-white/60 focus:border-white/40 transition-colors duration-150"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1" htmlFor="ai-extra">
              Custom instructions
            </label>
            <textarea
              id="ai-extra"
              value={cfg.system_extra}
              onChange={(e) => set({ system_extra: e.target.value })}
              rows={3}
              placeholder="Extra system instructions appended to every chat (tone, house rules…)"
              className="w-full bg-black/30 backdrop-blur-md text-white border border-white/10 placeholder-gray-500 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-white/60 focus:border-white/40 transition-colors duration-150"
            />
          </div>
        </div>
      </section>

      <section>
        <h3 className="text-sm font-semibold uppercase tracking-wide text-gray-400 mb-1">
          Fallback provider
        </h3>
        <p className="text-xs text-gray-500 mb-4">
          Answers when the primary provider fails (transport error or HTTP 5xx/429). Same shape as
          above — empty base URL means no fallback.
        </p>
        <div className="space-y-5">
          <TextInput
            id="ai-fallback-base-url"
            label="Fallback base URL"
            value={cfg.fallback_base_url}
            onChange={(v) => set({ fallback_base_url: v })}
            placeholder="https://backup-provider/v1  (blank = disabled)"
          />
          <div>
            <TextInput
              id="ai-fallback-api-key"
              label={`Fallback API Key ${cfg.fallback_api_key_configured ? '(configured)' : '(not set)'}`}
              value={fallbackApiKey}
              onChange={setFallbackApiKey}
              placeholder={cfg.fallback_api_key_configured ? 'Blank = keep stored key' : 'sk-…'}
              type="password"
            />
          </div>
          <TextInput
            id="ai-fallback-model"
            label="Fallback model ID"
            value={cfg.fallback_model_id}
            onChange={(v) => set({ fallback_model_id: v })}
            placeholder="gpt-4o-mini"
          />
          <ToggleRow
            id="ai-fallback-ollama"
            label="Fallback Ollama mode"
            description="Talk Ollama /api/chat for the fallback provider."
            checked={cfg.fallback_ollama_mode}
            onChange={(v) => set({ fallback_ollama_mode: v })}
          />
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onTestFallback}
              disabled={testingFallback || saving}
              className="inline-flex items-center gap-2 bg-neutral-800 text-gray-200 px-4 py-2 rounded hover:bg-neutral-700 text-sm disabled:opacity-60"
            >
              {testingFallback ? 'Testing…' : 'Test fallback'}
            </button>
            {fallbackTestOut && (
              <p className={`text-sm ${fallbackTestOut.startsWith('OK') ? 'text-green-400' : 'text-red-400'}`}>{fallbackTestOut}</p>
            )}
          </div>
        </div>
      </section>

      <section>
        <h3 className="text-sm font-semibold uppercase tracking-wide text-gray-400 mb-1">
          Usage pricing
        </h3>
        <p className="text-xs text-gray-500 mb-4">
          Optional USD price per 1k tokens — used only for the cost column in the usage audit below.
        </p>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1" htmlFor="ai-cost-in">
              Cost / 1k input tokens (USD)
            </label>
            <input
              id="ai-cost-in"
              type="number"
              min={0}
              max={1000}
              step={0.0001}
              value={cfg.cost_per_1k_in}
              onChange={(e) => set({ cost_per_1k_in: Math.max(0, Math.min(1000, Number(e.target.value) || 0)) })}
              className="w-full bg-black/30 backdrop-blur-md text-white border border-white/10 placeholder-gray-500 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-white/60 focus:border-white/40 transition-colors duration-150"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1" htmlFor="ai-cost-out">
              Cost / 1k output tokens (USD)
            </label>
            <input
              id="ai-cost-out"
              type="number"
              min={0}
              max={1000}
              step={0.0001}
              value={cfg.cost_per_1k_out}
              onChange={(e) => set({ cost_per_1k_out: Math.max(0, Math.min(1000, Number(e.target.value) || 0)) })}
              className="w-full bg-black/30 backdrop-blur-md text-white border border-white/10 placeholder-gray-500 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-white/60 focus:border-white/40 transition-colors duration-150"
            />
          </div>
        </div>
      </section>

      <section>
        <h3 className="text-sm font-semibold uppercase tracking-wide text-gray-400 mb-1">
          Usage
        </h3>
        {usageError && <p className="text-xs text-gray-500">{usageError}</p>}
        {usage && (
          <div className="space-y-3">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <div className="rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2">
                <p className="text-[11px] text-gray-500">Requests</p>
                <p className="text-sm text-white font-semibold">{usage.totals.requests}</p>
              </div>
              <div className="rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2">
                <p className="text-[11px] text-gray-500">Input tokens</p>
                <p className="text-sm text-white font-semibold">{usage.totals.in_tokens}</p>
              </div>
              <div className="rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2">
                <p className="text-[11px] text-gray-500">Output tokens</p>
                <p className="text-sm text-white font-semibold">{usage.totals.out_tokens}</p>
              </div>
              <div className="rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2">
                <p className="text-[11px] text-gray-500">Cost (USD)</p>
                <p className="text-sm text-white font-semibold">${usage.totals.cost_usd.toFixed(4)}</p>
              </div>
            </div>
            {usage.by_model.length > 0 && (
              <div className="overflow-x-auto rounded-lg border border-white/10">
                <table className="w-full text-xs text-gray-300">
                  <thead>
                    <tr className="text-left text-gray-500 border-b border-white/10">
                      <th className="px-3 py-2 font-medium">Model</th>
                      <th className="px-3 py-2 font-medium">Provider</th>
                      <th className="px-3 py-2 font-medium text-right">Req</th>
                      <th className="px-3 py-2 font-medium text-right">In</th>
                      <th className="px-3 py-2 font-medium text-right">Out</th>
                      <th className="px-3 py-2 font-medium text-right">USD</th>
                    </tr>
                  </thead>
                  <tbody>
                    {usage.by_model.map((row) => (
                      <tr key={`${row.model} ${row.provider}`} className="border-b border-white/5 last:border-0">
                        <td className="px-3 py-1.5 truncate max-w-[160px]">{row.model}</td>
                        <td className="px-3 py-1.5">{row.provider}</td>
                        <td className="px-3 py-1.5 text-right">{row.requests}</td>
                        <td className="px-3 py-1.5 text-right">{row.in_tokens}</td>
                        <td className="px-3 py-1.5 text-right">{row.out_tokens}</td>
                        <td className="px-3 py-1.5 text-right">${row.cost_usd.toFixed(4)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </section>

      {error && <p className="text-sm text-red-400">{error}</p>}
      {success && <p className="text-sm text-green-400">{success}</p>}
      {testOut && (
        <p className={`text-sm ${testOut.startsWith('OK') ? 'text-green-400' : 'text-red-400'}`}>{testOut}</p>
      )}

      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={onTest}
          disabled={testing || saving}
          className="inline-flex items-center gap-2 bg-neutral-800 text-gray-200 px-4 py-2 rounded hover:bg-neutral-700 text-sm disabled:opacity-60"
        >
          {testing ? 'Testing…' : 'Test connection'}
        </button>
        <button
          type="submit"
          disabled={saving}
          className="ks-primary-btn inline-flex items-center gap-2 bg-white text-black px-4 py-2 rounded hover:bg-gray-200 text-sm disabled:opacity-60"
        >
          {saving ? 'Saving…' : 'Save'}
        </button>
      </div>
    </form>
  );
};

export default AIConfigCard;
