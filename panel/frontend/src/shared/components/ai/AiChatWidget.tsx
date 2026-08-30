import React, { useEffect, useRef, useState, useMemo } from 'react';
import { useAuthStore } from '@/shared/stores/authStore';
import { PermissionKey, hasPermissionAny } from '@/shared/types/permissions';
import { getAiConfig, updateAiConfig, sendAiChat, type AiConfig, type AiProvider, type AiChatMessage } from '@/shared/api/ai';

// AiChatWidget — floating bottom-right assistant (cycle SVG bot icon + drop-up chat panel).
// Permission-aware:
//   - AI_CHAT_USE (or MANAGE_AI_CHAT)  → can chat
//   - AI_CHAT_MANAGE (or MANAGE_AI_CHAT) → can configure providers, model ids, system prompt
// Header right cluster: [Clear SVG] [Model dropdown] [Settings gear] [Close]
//   - Model dropdown (left of settings) shows searchable list of providers/models in a row-aligned dropdown.
//   - Clear SVG sits at top-left of model dropdown toggle and clears chat history.
//   - Settings toggle replaces the entire panel content with settings (no chat visible).

const BotIcon: React.FC<{ size?: number; className?: string }> = ({ size = 28, className = '' }) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.8"
    strokeLinecap="round"
    strokeLinejoin="round"
    width={size}
    height={size}
    className={className}
    aria-hidden="true"
  >
    <rect x="3" y="7" width="18" height="11" rx="3" />
    <line x1="12" y1="3" x2="12" y2="7" />
    <circle cx="12" cy="3" r="1.5" fill="currentColor" stroke="none" />
    <circle cx="9" cy="12" r="1.2" fill="currentColor" stroke="none" />
    <circle cx="15" cy="12" r="1.2" fill="currentColor" stroke="none" />
    <path d="M9 16c1.2 1 2.8 1 4 0" />
    <path d="M8 18v1a2 2 0 0 0 2 2h4a2 2 0 0 0 2-2v-1" opacity="0.6" />
  </svg>
);

const AiChatWidget: React.FC = () => {
  const permissions = useAuthStore((s) => s.permissions);
  const user = useAuthStore((s) => s.user);
  const canUse = hasPermissionAny(permissions, PermissionKey.MANAGE_AI_CHAT, PermissionKey.AI_CHAT_USE, PermissionKey.AI_CHAT_MANAGE);
  const canManage = hasPermissionAny(permissions, PermissionKey.MANAGE_AI_CHAT, PermissionKey.AI_CHAT_MANAGE);

  const [open, setOpen] = useState(false);
  const [showConfig, setShowConfig] = useState(false);
  const [showModelDropdown, setShowModelDropdown] = useState(false);
  const [modelSearch, setModelSearch] = useState('');
  const [cfg, setCfg] = useState<AiConfig | null>(null);
  const [cfgLoading, setCfgLoading] = useState(false);
  const [cfgSaving, setCfgSaving] = useState(false);
  const [cfgError, setCfgError] = useState<string | null>(null);

  const [messages, setMessages] = useState<AiChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [chatError, setChatError] = useState<string | null>(null);
  const [selectedProvider, setSelectedProvider] = useState<string>('');
  const [selectedModel, setSelectedModel] = useState<string>('');

  const [sysPromptDraft, setSysPromptDraft] = useState('');
  const [providersDraft, setProvidersDraft] = useState<AiProvider[]>([]);

  const scrollRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const modelToggleRef = useRef<HTMLButtonElement>(null);
  const modelDropdownRef = useRef<HTMLDivElement>(null);

  // Close on outside click / escape
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (showModelDropdown) setShowModelDropdown(false);
        else if (showConfig) setShowConfig(false);
        else setOpen(false);
      }
    };
    const onClick = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        const toggle = document.getElementById('ks-ai-toggle');
        if (toggle && toggle.contains(e.target as Node)) return;
        setOpen(false);
        setShowModelDropdown(false);
      }
      // close model dropdown when clicking outside it but inside panel
      if (showModelDropdown && modelDropdownRef.current && !modelDropdownRef.current.contains(e.target as Node) && modelToggleRef.current && !modelToggleRef.current.contains(e.target as Node)) {
        setShowModelDropdown(false);
      }
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onClick);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onClick);
    };
  }, [open, showModelDropdown, showConfig]);

  // Fetch config when opening
  useEffect(() => {
    if (!open) return;
    if (!user) return;
    let cancelled = false;
    setCfgLoading(true);
    setCfgError(null);
    getAiConfig()
      .then((c) => {
        if (cancelled) return;
        setCfg(c);
        setSysPromptDraft(c.system_prompt || '');
        setProvidersDraft(c.providers || []);
        if (c.providers && c.providers.length > 0) {
          const enabled = c.providers.filter((p) => p.enabled);
          const list = enabled.length > 0 ? enabled : c.providers;
          const defProv = c.default_provider && list.find((p) => p.id === c.default_provider) ? c.default_provider : list[0].id;
          setSelectedProvider((prev) => prev || defProv);
          const prov = list.find((p) => p.id === defProv) || list[0];
          if (prov && prov.models.length > 0) {
            const defModel = c.default_model && prov.models.includes(c.default_model) ? c.default_model : prov.models[0];
            setSelectedModel((prev) => prev || defModel);
          }
        }
      })
      .catch((e: any) => {
        if (cancelled) return;
        const msg = e?.response?.data?.error || e?.message || 'Failed to load AI config';
        setCfgError(typeof msg === 'string' ? msg : JSON.stringify(msg));
      })
      .finally(() => {
        if (!cancelled) setCfgLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, user]);

  useEffect(() => {
    if (!cfg || !selectedProvider) return;
    const prov = cfg.providers.find((p) => p.id === selectedProvider);
    if (!prov) return;
    if (prov.models.length > 0 && !prov.models.includes(selectedModel)) {
      setSelectedModel(prov.models[0]);
    }
  }, [selectedProvider, cfg, selectedModel]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, sending]);

  const handleSend = async () => {
    const text = input.trim();
    if (!text || sending) return;
    if (!canUse) {
      setChatError('You do not have permission to use AI chat (needs AI_CHAT_USE).');
      return;
    }
    if (!selectedProvider || !selectedModel) {
      setChatError('Select a provider and model first.');
      return;
    }
    const userMsg: AiChatMessage = { role: 'user', content: text };
    const newHistory = [...messages, userMsg];
    setMessages(newHistory);
    setInput('');
    setSending(true);
    setChatError(null);
    try {
      const res = await sendAiChat({
        provider_id: selectedProvider,
        model: selectedModel,
        messages: newHistory,
      });
      setMessages((prev) => [...prev, { role: 'assistant', content: res.reply }]);
    } catch (e: any) {
      const msg = e?.response?.data?.error || e?.message || 'Chat failed';
      setChatError(typeof msg === 'string' ? msg : JSON.stringify(msg));
    } finally {
      setSending(false);
    }
  };

  const handleSaveConfig = async () => {
    if (!canManage) return;
    setCfgSaving(true);
    setCfgError(null);
    try {
      const payload: AiConfig = {
        system_prompt: sysPromptDraft,
        providers: providersDraft,
        default_provider: selectedProvider,
        default_model: selectedModel,
      };
      const saved = await updateAiConfig(payload);
      setCfg(saved);
      setProvidersDraft(saved.providers || []);
      setSysPromptDraft(saved.system_prompt || '');
      setCfgError(null);
    } catch (e: any) {
      const msg = e?.response?.data?.error || e?.message || 'Failed to save config';
      setCfgError(typeof msg === 'string' ? msg : JSON.stringify(msg));
    } finally {
      setCfgSaving(false);
    }
  };

  const addProvider = () => {
    const idx = providersDraft.length + 1;
    setProvidersDraft((prev) => [
      ...prev,
      {
        id: `provider-${idx}`,
        name: `Provider ${idx}`,
        type: 'openai',
        base_url: 'https://api.openai.com/v1',
        api_key: '',
        models: ['gpt-4o-mini'],
        enabled: true,
      },
    ]);
  };

  const updateProvider = (idx: number, patch: Partial<AiProvider>) => {
    setProvidersDraft((prev) => prev.map((p, i) => (i === idx ? { ...p, ...patch } : p)));
  };

  const removeProvider = (idx: number) => {
    setProvidersDraft((prev) => prev.filter((_, i) => i !== idx));
  };

  if (!user) return null;

  const hasProviders = cfg ? cfg.providers.length > 0 : false;
  const enabledProviders = cfg ? cfg.providers.filter((p) => p.enabled) : [];
  const canChat = canUse && hasProviders && enabledProviders.length > 0;

  // Filtered providers for searchable dropdown
  const filteredProviders = useMemo(() => {
    if (!cfg) return [];
    const q = modelSearch.trim().toLowerCase();
    if (!q) return cfg.providers;
    return cfg.providers.filter((p) => {
      if (p.id.toLowerCase().includes(q) || p.name.toLowerCase().includes(q) || p.base_url.toLowerCase().includes(q)) return true;
      return p.models.some((m) => m.toLowerCase().includes(q));
    });
  }, [cfg, modelSearch]);

  const selectedProviderObj = cfg?.providers.find((p) => p.id === selectedProvider) || null;
  const modelLabel = selectedProvider && selectedModel ? `${selectedProvider} / ${selectedModel}` : selectedProvider || 'Select model';

  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col items-end gap-3 pointer-events-none">
      <div
        ref={panelRef}
        className={`pointer-events-auto w-[min(92vw,380px)] max-h-[min(72dvh,560px)] flex flex-col rounded-2xl border border-white/15 bg-[#0f0f12]/95 backdrop-blur-xl shadow-2xl overflow-hidden transition-all duration-200 origin-bottom-right ${
          open ? 'opacity-100 translate-y-0 scale-100' : 'opacity-0 translate-y-3 scale-95 pointer-events-none'
        }`}
        role="dialog"
        aria-label="AI Assistant"
        aria-hidden={!open}
      >
        {/* Header — left title, right: [Clear][Model dropdown][Settings][Close] */}
        <div className="flex items-center justify-between px-3 py-2.5 border-b border-white/10 bg-white/[0.04] gap-2">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-7 h-7 rounded-full bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center text-white shrink-0">
              <BotIcon size={16} />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-white leading-none truncate">AI Assistant</p>
              <p className="text-[11px] text-gray-400 truncate">
                {showConfig ? 'Settings' : canManage ? 'Manage & chat' : canUse ? 'Chat' : 'No access'}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            {/* Clear SVG — top left of model dropdown toggle (leftmost in right cluster) */}
            {!showConfig && messages.length > 0 && canUse && (
              <button
                type="button"
                onClick={() => setMessages([])}
                aria-label="Clear chat"
                title="Clear chat"
                className="w-8 h-8 rounded-lg flex items-center justify-center text-gray-300 hover:bg-white/10 hover:text-white transition-colors"
              >
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
                  <polyline points="3 6 5 6 21 6" />
                  <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                  <line x1="10" y1="11" x2="10" y2="17" />
                  <line x1="14" y1="11" x2="14" y2="17" />
                </svg>
              </button>
            )}

            {/* Model dropdown — left of settings icon, searchable */}
            {!showConfig && canUse && (
              <div className="relative">
                <button
                  ref={modelToggleRef}
                  type="button"
                  onClick={() => setShowModelDropdown((v) => !v)}
                  aria-label="Select model"
                  aria-expanded={showModelDropdown}
                  className={`max-w-[148px] inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs font-medium transition-colors truncate ${
                    showModelDropdown ? 'bg-white/15 text-white border-white/20' : 'bg-white/5 text-gray-200 border-white/10 hover:bg-white/10 hover:text-white'
                  }`}
                  title={modelLabel}
                >
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-3.5 h-3.5 shrink-0">
                    <rect x="2" y="7" width="20" height="10" rx="2" />
                    <path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                    <circle cx="9" cy="12" r="1" fill="currentColor" stroke="none" />
                    <circle cx="15" cy="12" r="1" fill="currentColor" stroke="none" />
                  </svg>
                  <span className="truncate">{cfgLoading ? 'Loading…' : modelLabel}</span>
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={`w-3 h-3 shrink-0 transition-transform ${showModelDropdown ? 'rotate-180' : ''}`}>
                    <polyline points="6 9 12 15 18 9" />
                  </svg>
                </button>

                {/* Searchable provider/model dropdown — row inline */}
                {showModelDropdown && (
                  <div
                    ref={modelDropdownRef}
                    className="absolute right-0 top-full mt-2 w-80 max-w-[92vw] rounded-xl border border-white/15 bg-[#0f0f12] shadow-2xl overflow-hidden z-20"
                  >
                    {/* Search bar — row inline */}
                    <div className="p-2 border-b border-white/10 bg-white/[0.03]">
                      <div className="flex items-center gap-2">
                        <div className="relative flex-1">
                          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400">
                            <circle cx="11" cy="11" r="7" />
                            <line x1="16.5" y1="16.5" x2="21" y2="21" />
                          </svg>
                          <input
                            autoFocus
                            value={modelSearch}
                            onChange={(e) => setModelSearch(e.target.value)}
                            placeholder="Search providers or models…"
                            className="w-full pl-8 pr-3 py-1.5 rounded-lg bg-[#0a0a0c] border border-white/10 text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-indigo-500/30"
                          />
                        </div>
                        {modelSearch && (
                          <button
                            type="button"
                            onClick={() => setModelSearch('')}
                            className="text-xs px-2 py-1 rounded-md bg-white/5 hover:bg-white/10 text-gray-300 border border-white/10"
                          >
                            Clear
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Providers list — row aligned */}
                    <div className="max-h-72 overflow-auto p-2 space-y-2">
                      {cfgLoading ? (
                        <p className="text-xs text-gray-400 px-2 py-3">Loading…</p>
                      ) : filteredProviders.length === 0 ? (
                        <p className="text-xs text-gray-400 px-2 py-3">No providers match “{modelSearch}”.</p>
                      ) : (
                        filteredProviders.map((p) => (
                          <div key={p.id} className="rounded-lg border border-white/10 bg-white/[0.03] p-2.5">
                            <div className="flex items-center justify-between gap-2">
                              <div className="min-w-0">
                                <p className="text-sm font-medium text-white truncate">{p.name}</p>
                                <p className="text-[11px] text-gray-400 truncate">{p.id} · {p.type} · {p.enabled ? 'enabled' : 'disabled'}</p>
                              </div>
                              {!p.enabled && <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-300 border border-amber-500/20">disabled</span>}
                            </div>
                            {p.base_url && <p className="text-[11px] text-gray-500 truncate mt-1">{p.base_url}</p>}
                            <div className="mt-2 flex flex-wrap gap-1.5">
                              {p.models.length === 0 ? (
                                <span className="text-xs text-gray-500">No models</span>
                              ) : (
                                p.models.map((m) => {
                                  const active = p.id === selectedProvider && m === selectedModel;
                                  return (
                                    <button
                                      key={m}
                                      type="button"
                                      onClick={() => {
                                        setSelectedProvider(p.id);
                                        setSelectedModel(m);
                                        setShowModelDropdown(false);
                                        setModelSearch('');
                                      }}
                                      className={`text-xs px-2 py-1 rounded-md border transition-colors ${
                                        active ? 'bg-indigo-600 text-white border-indigo-500' : 'bg-white/5 text-gray-200 border-white/10 hover:bg-white/10 hover:text-white'
                                      }`}
                                      title={`${p.id} / ${m}`}
                                    >
                                      {m}
                                    </button>
                                  );
                                })
                              )}
                            </div>
                            {/* Quick select provider row */}
                            <button
                              type="button"
                              onClick={() => {
                                setSelectedProvider(p.id);
                                if (p.models.length > 0 && !p.models.includes(selectedModel)) setSelectedModel(p.models[0]);
                                setShowModelDropdown(false);
                                setModelSearch('');
                              }}
                              className="mt-2 text-[11px] text-indigo-300 hover:text-indigo-200"
                            >
                              Use provider →
                            </button>
                          </div>
                        ))
                      )}
                    </div>

                    {/* Footer hint */}
                    <div className="px-3 py-2 border-t border-white/10 bg-black/20 text-[11px] text-gray-400 flex items-center justify-between">
                      <span>{cfg ? `${cfg.providers.length} providers` : ''}</span>
                      <button type="button" onClick={() => setShowModelDropdown(false)} className="text-gray-300 hover:text-white">Close</button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {canManage && (
              <button
                type="button"
                onClick={() => {
                  setShowConfig((v) => !v);
                  setShowModelDropdown(false);
                }}
                aria-label={showConfig ? 'Close settings' : 'Open AI settings'}
                className={`w-8 h-8 rounded-lg flex items-center justify-center transition-colors ${showConfig ? 'bg-white/15 text-white' : 'text-gray-300 hover:bg-white/10 hover:text-white'}`}
                title="Providers / models / system prompt"
              >
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
                  <path d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z" />
                  <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06A1.65 1.65 0 0 0 15 19.4a1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.6 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.6a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9c0 .44.18.86.51 1.11.33.25.74.34 1.13.25H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
                </svg>
              </button>
            )}
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                setShowModelDropdown(false);
              }}
              aria-label="Close chat"
              className="w-8 h-8 rounded-lg flex items-center justify-center text-gray-300 hover:bg-white/10 hover:text-white transition-colors"
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>
        </div>

        {/* Body — either full settings or chat */}
        {showConfig && canManage ? (
          <div className="flex-1 overflow-auto px-4 py-3 space-y-3 bg-[#0a0a0c]/40">
            <p className="text-xs font-semibold tracking-wide uppercase text-indigo-200">Providers · Models · System Prompt</p>
            {cfgLoading ? (
              <p className="text-xs text-gray-400">Loading config…</p>
            ) : (
              <>
                <div>
                  <label className="block text-xs font-medium text-gray-200 mb-1">System prompt</label>
                  <textarea
                    value={sysPromptDraft}
                    onChange={(e) => setSysPromptDraft(e.target.value)}
                    rows={3}
                    placeholder="You are a helpful assistant for KS Panel."
                    className="w-full rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/40 focus:border-indigo-500/40 resize-y"
                  />
                  <p className="text-[11px] text-gray-500 mt-1">Injected as the system message for every chat turn.</p>
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-medium text-gray-200">Providers ({providersDraft.length})</label>
                    <button type="button" onClick={addProvider} className="text-xs px-2 py-1 rounded-md bg-indigo-600 hover:bg-indigo-500 text-white transition-colors">
                      + Add provider
                    </button>
                  </div>
                  {providersDraft.length === 0 ? (
                    <p className="text-xs text-gray-400 border border-dashed border-white/15 rounded-lg px-3 py-2">No providers yet. Add one to enable chat.</p>
                  ) : (
                    <div className="space-y-2">
                      {providersDraft.map((p, idx) => (
                        <div key={idx} className="rounded-xl border border-white/10 bg-white/[0.04] p-3 space-y-2">
                          <div className="grid grid-cols-2 gap-2">
                            <div>
                              <label className="block text-[11px] text-gray-400 mb-1">ID</label>
                              <input value={p.id} onChange={(e) => updateProvider(idx, { id: e.target.value })} placeholder="openai" className="w-full rounded-md bg-[#0a0a0c] border border-white/10 px-2 py-1.5 text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-indigo-500/30" />
                            </div>
                            <div>
                              <label className="block text-[11px] text-gray-400 mb-1">Name</label>
                              <input value={p.name} onChange={(e) => updateProvider(idx, { name: e.target.value })} placeholder="OpenAI" className="w-full rounded-md bg-[#0a0a0c] border border-white/10 px-2 py-1.5 text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-indigo-500/30" />
                            </div>
                          </div>
                          <div className="grid grid-cols-2 gap-2">
                            <div>
                              <label className="block text-[11px] text-gray-400 mb-1">Type</label>
                              <select value={p.type} onChange={(e) => updateProvider(idx, { type: e.target.value })} className="w-full rounded-md bg-[#0a0a0c] border border-white/10 px-2 py-1.5 text-sm text-white focus:outline-none focus:ring-1 focus:ring-indigo-500/30">
                                <option value="openai">openai</option>
                                <option value="anthropic">anthropic</option>
                                <option value="openai-compatible">openai-compatible</option>
                                <option value="custom">custom</option>
                              </select>
                            </div>
                            <div className="flex items-end gap-2">
                              <label className="flex items-center gap-2 text-xs text-gray-200 cursor-pointer pb-2">
                                <input type="checkbox" checked={!!p.enabled} onChange={(e) => updateProvider(idx, { enabled: e.target.checked })} className="accent-indigo-500" />
                                Enabled
                              </label>
                              <button type="button" onClick={() => removeProvider(idx)} className="ml-auto text-xs px-2 py-1 rounded-md bg-white/5 hover:bg-red-500/15 text-red-300 border border-white/10 hover:border-red-500/20 transition-colors">
                                Remove
                              </button>
                            </div>
                          </div>
                          <div>
                            <label className="block text-[11px] text-gray-400 mb-1">Base URL</label>
                            <input value={p.base_url} onChange={(e) => updateProvider(idx, { base_url: e.target.value })} placeholder="https://api.openai.com/v1" className="w-full rounded-md bg-[#0a0a0c] border border-white/10 px-2 py-1.5 text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-indigo-500/30" />
                          </div>
                          <div>
                            <label className="block text-[11px] text-gray-400 mb-1">API key</label>
                            <input value={p.api_key} onChange={(e) => updateProvider(idx, { api_key: e.target.value })} placeholder={p.api_key === '*' ? '(masked — enter new key to replace)' : 'sk-...'} type="password" className="w-full rounded-md bg-[#0a0a0c] border border-white/10 px-2 py-1.5 text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-indigo-500/30" />
                            {p.api_key === '*' && <p className="text-[11px] text-amber-300/80 mt-1">Stored key is masked as "*". Leave as "*" to keep it, or type a new key to replace.</p>}
                          </div>
                          <div>
                            <label className="block text-[11px] text-gray-400 mb-1">Models (comma-separated IDs)</label>
                            <input value={p.models.join(', ')} onChange={(e) => updateProvider(idx, { models: e.target.value.split(',').map((s) => s.trim()).filter(Boolean) })} placeholder="gpt-4o, gpt-4o-mini, gpt-3.5-turbo" className="w-full rounded-md bg-[#0a0a0c] border border-white/10 px-2 py-1.5 text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-indigo-500/30" />
                            <p className="text-[11px] text-gray-500 mt-1">IDs must match the provider's catalog (e.g. openai: gpt-4o).</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="flex items-center gap-2 pt-1">
                  <button type="button" onClick={handleSaveConfig} disabled={cfgSaving} className="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium text-white transition-colors">
                    {cfgSaving ? 'Saving…' : 'Save config'}
                  </button>
                  <button type="button" onClick={() => setShowConfig(false)} className="px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-sm text-gray-200 border border-white/10 transition-colors">
                    Back to chat
                  </button>
                  {cfgError && <span className="text-xs text-red-300">{cfgError}</span>}
                </div>
              </>
            )}
          </div>
        ) : !canUse ? (
          <div className="px-4 py-4">
            <div className="rounded-xl border border-amber-400/20 bg-amber-500/10 px-4 py-3">
              <p className="text-sm font-medium text-amber-200">No permission to use AI chat</p>
              <p className="text-xs text-amber-100/70 mt-1">
                Your role doesn't have <code className="px-1 py-0.5 rounded bg-white/10 text-amber-100">AI_CHAT_USE</code> (or <code className="px-1 py-0.5 rounded bg-white/10 text-amber-100">MANAGE_AI_CHAT</code>). Ask an admin to grant it in Roles → AI Chat → VIEW.
              </p>
            </div>
          </div>
        ) : (
          <>
            {!hasProviders && !cfgLoading && canManage && (
              <div className="mx-4 mt-3 rounded-lg border border-indigo-400/20 bg-indigo-500/10 px-3 py-2">
                <p className="text-xs text-indigo-100">No AI provider configured yet.</p>
                <p className="text-xs text-indigo-200/70 mt-1">Open the gear to add a provider, set model IDs and the system prompt.</p>
              </div>
            )}
            {!hasProviders && !cfgLoading && !canManage && (
              <div className="mx-4 mt-3 rounded-lg border border-amber-400/20 bg-amber-500/10 px-3 py-2">
                <p className="text-xs text-amber-100">No AI provider is configured yet.</p>
                <p className="text-xs text-amber-100/70 mt-1">An admin with <code className="px-1 py-0.5 rounded bg-white/10">AI_CHAT_MANAGE</code> needs to add a provider and model.</p>
              </div>
            )}

            <div ref={scrollRef} className="flex-1 overflow-auto px-4 py-3 space-y-3 min-h-[180px] max-h-[320px] bg-[#0a0a0c]/40">
              {messages.length === 0 ? (
                <div className="text-center py-8">
                  <div className="inline-flex items-center justify-center w-10 h-10 rounded-full bg-indigo-500/15 text-indigo-300 mb-3">
                    <BotIcon size={20} />
                  </div>
                  <p className="text-sm text-white font-medium">How can I help you today?</p>
                  <p className="text-xs text-gray-400 mt-1 max-w-[260px] mx-auto">Ask about instances, templates, nodes or anything else. {canManage ? 'You can also configure providers/models/prompt via the gear.' : ''}</p>
                </div>
              ) : (
                messages.map((m, i) => (
                  <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                    <div className={`max-w-[78%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed whitespace-pre-wrap break-words ${m.role === 'user' ? 'bg-indigo-600 text-white rounded-br-sm' : 'bg-white/10 text-gray-100 border border-white/10 rounded-bl-sm'}`}>{m.content}</div>
                  </div>
                ))
              )}
              {sending && (
                <div className="flex justify-start">
                  <div className="bg-white/10 border border-white/10 rounded-2xl rounded-bl-sm px-3.5 py-2.5 flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-gray-400 animate-bounce [animation-delay:-0.3s]" />
                    <span className="w-1.5 h-1.5 rounded-full bg-gray-400 animate-bounce [animation-delay:-0.15s]" />
                    <span className="w-1.5 h-1.5 rounded-full bg-gray-400 animate-bounce" />
                  </div>
                </div>
              )}
            </div>

            {chatError && <div className="mx-4 mb-2 rounded-lg border border-red-400/20 bg-red-500/10 px-3 py-2 text-xs text-red-200">{chatError}</div>}
            {cfgError && <div className="mx-4 mb-2 rounded-lg border border-red-400/20 bg-red-500/10 px-3 py-2 text-xs text-red-200">{cfgError}</div>}

            <div className="p-3 border-t border-white/10 bg-white/[0.03] flex items-end gap-2">
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleSend();
                  }
                }}
                placeholder={canChat ? 'Ask anything… (Shift+Enter for newline)' : 'Select a provider & model to chat'}
                disabled={!canChat || sending}
                rows={1}
                className="flex-1 min-h-[42px] max-h-[96px] rounded-xl bg-[#0a0a0c] border border-white/10 px-3 py-2.5 text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-500/30 resize-none disabled:opacity-50 disabled:cursor-not-allowed"
              />
              <button type="button" onClick={handleSend} disabled={!canChat || sending || !input.trim()} aria-label="Send message" className="shrink-0 w-[42px] h-[42px] rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed text-white flex items-center justify-center transition-colors">
                {sending ? (
                  <svg className="w-4 h-4 animate-spin" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                ) : (
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
                    <line x1="22" y1="2" x2="11" y2="13" />
                    <polygon points="22 2 15 22 11 13 2 9 22 2" />
                  </svg>
                )}
              </button>
            </div>
          </>
        )}
      </div>

      <button
        id="ks-ai-toggle"
        type="button"
        onClick={() => {
          setOpen((v) => !v);
          if (open) {
            setShowModelDropdown(false);
          }
        }}
        aria-label={open ? 'Close AI assistant' : 'Open AI assistant'}
        aria-expanded={open}
        className="pointer-events-auto relative flex items-center justify-center w-14 h-14 rounded-full bg-gradient-to-br from-indigo-600 to-violet-600 text-white shadow-[0_8px_24px_rgba(79,70,229,0.45)] hover:shadow-[0_10px_28px_rgba(79,70,229,0.55)] hover:scale-[1.03] active:scale-[0.97] transition-all duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 focus-visible:ring-offset-2 focus-visible:ring-offset-[#0f0f12] border border-white/10"
      >
        {!open && <span className="absolute inset-0 rounded-full bg-indigo-500/20 animate-ping [animation-duration:2.2s]" aria-hidden="true" />}
        <span className={`transition-transform duration-200 ${open ? 'rotate-90 scale-90' : 'rotate-0 scale-100'}`}>
          {open ? (
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-6 h-6">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          ) : (
            <BotIcon size={26} />
          )}
        </span>
        {!canUse && !open && <span className="absolute -top-0.5 -right-0.5 w-3 h-3 rounded-full bg-amber-400 border-2 border-[#0f0f12]" aria-hidden="true" />}
      </button>
    </div>
  );
};

export default AiChatWidget;
