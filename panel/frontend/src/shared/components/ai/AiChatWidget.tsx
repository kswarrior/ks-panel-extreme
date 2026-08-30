import React, { useCallback, useEffect, useLayoutEffect, useRef, useState, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { useAuthStore } from '@/shared/stores/authStore';
import { PermissionKey, hasPermissionAny } from '@/shared/types/permissions';
import { getAiConfig, updateAiConfig, sendAiChatStream, type AiConfig, type AiProvider, type AiChatMessage } from '@/shared/api/ai';

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
  const [retryInfo, setRetryInfo] = useState<string | null>(null);
  const [selectedProvider, setSelectedProvider] = useState<string>('');
  const [selectedModel, setSelectedModel] = useState<string>('');

  const [sysPromptDraft, setSysPromptDraft] = useState('');
  const [providersDraft, setProvidersDraft] = useState<AiProvider[]>([]);

  const scrollRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const modelToggleRef = useRef<HTMLButtonElement | null>(null);
  const modelDropdownRef = useRef<HTMLDivElement | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const [panelPos, setPanelPos] = useState<{ left: number; top: number; width: number } | null>(null);
  const [modelPos, setModelPos] = useState<{ left: number; top: number; width: number } | null>(null);

  // Place panel like notification but drop-up (above trigger) — portal fixed
  const placePanel = useCallback(() => {
    const el = triggerRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const w = 380;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    // Horizontal: align right edge with trigger's right, keep 8px margin
    let left = r.right - w;
    if (left < 8) left = 8;
    if (left + w > vw - 8) left = vw - w - 8;
    // Vertical: drop-up above trigger, 12px gap — panel now taller (640 max) so estimate higher
    const estH = panelRef.current ? panelRef.current.getBoundingClientRect().height : 600;
    const gap = 12;
    let top = r.top - estH - gap;
    // Flip below if not enough space above and more space below (mobile landscape)
    const spaceAbove = r.top;
    const spaceBelow = vh - r.bottom;
    if (top < 8 && spaceBelow > spaceAbove) {
      top = r.bottom + gap;
    }
    // Clamp to viewport
    if (top < 8) top = 8;
    if (top + estH > vh - 8) top = Math.max(8, vh - estH - 8);
    setPanelPos({ left, top, width: w });
  }, []);

  const placeModelDropdown = useCallback(() => {
    const el = modelToggleRef.current;
    const panelEl = panelRef.current;
    if (!el || !panelEl) return;
    const r = el.getBoundingClientRect();
    const panelR = panelEl.getBoundingClientRect();
    const w = 320;
    // Dropdown below toggle, aligned to panel's right edge or toggle's left
    let left = r.left;
    // Keep within panel
    if (left + w > panelR.right - 8) left = panelR.right - w - 8;
    if (left < panelR.left + 8) left = panelR.left + 8;
    // Clamp to viewport
    if (left < 8) left = 8;
    if (left + w > window.innerWidth - 8) left = window.innerWidth - w - 8;
    const top = r.bottom + 6;
    // If dropdown would overflow viewport bottom, flip above toggle
    const vh = window.innerHeight;
    if (top + 280 > vh - 8) {
      const flippedTop = r.top - 280 - 6;
      setModelPos({ left, top: Math.max(8, flippedTop), width: w });
    } else {
      setModelPos({ left, top, width: w });
    }
  }, []);

  useLayoutEffect(() => {
    if (!open) return;
    placePanel();
  }, [open, placePanel, showConfig]);

  useEffect(() => {
    if (!open) return;
    const onResize = () => {
      placePanel();
      if (showModelDropdown) placeModelDropdown();
    };
    const onScroll = () => {
      placePanel();
      if (showModelDropdown) placeModelDropdown();
    };
    window.addEventListener('resize', onResize);
    window.addEventListener('scroll', onScroll, true);
    return () => {
      window.removeEventListener('resize', onResize);
      window.removeEventListener('scroll', onScroll, true);
    };
  }, [open, showModelDropdown, placePanel, placeModelDropdown]);

  useLayoutEffect(() => {
    if (!showModelDropdown) return;
    placeModelDropdown();
  }, [showModelDropdown, placeModelDropdown, modelSearch]);

  // Escape closes in order: model dropdown -> config -> panel
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (showModelDropdown) setShowModelDropdown(false);
        else if (showConfig) setShowConfig(false);
        else setOpen(false);
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
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
        // If user lacks permission, the GET is 403 — don't surface as error when we already show permission banner
        if (e?.response?.status === 403 && !canUse) return;
        const msg = e?.response?.data?.error || e?.message || 'Failed to load AI config';
        setCfgError(typeof msg === 'string' ? msg : JSON.stringify(msg));
      })
      .finally(() => {
        if (!cancelled) setCfgLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, user, canUse]);

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
  }, [messages, sending, open, showConfig]);

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
    // Optimistically add user + placeholder assistant for streaming
    setMessages([...newHistory, { role: 'assistant', content: '' }]);
    setInput('');
    setSending(true);
    setChatError(null);
    setRetryInfo(null);

    const controller = new AbortController();
    abortRef.current = controller;
    let streamed = '';
    let success = false;
    const maxAttempts = 25;
    const delayMs = 5000;
    let attempt = 0;

    while (attempt <= maxAttempts && !success) {
      try {
        if (attempt > 0) {
          setRetryInfo(`Retrying… ${attempt}/${maxAttempts}`);
        }
        // Reset streamed placeholder for each attempt
        streamed = '';
        setMessages((prev) => {
          const base = prev.slice(0, newHistory.length);
          // keep placeholder assistant
          const hasPlaceholder = prev.length > newHistory.length && prev[prev.length - 1].role === 'assistant';
          if (hasPlaceholder) return [...base, { role: 'assistant', content: '' }];
          return [...base, { role: 'assistant', content: '' }];
        });

        await sendAiChatStream(
          {
            provider_id: selectedProvider,
            model: selectedModel,
            messages: newHistory,
          },
          (delta) => {
            streamed += delta;
            setMessages((prev) => {
              const base = prev.slice(0, newHistory.length);
              return [...base, { role: 'assistant', content: streamed }];
            });
          },
          { signal: controller.signal, maxRetries: 0, retryDelayMs: delayMs }
        );
        success = true;
        setRetryInfo(null);
        // Clean up empty placeholder if no content streamed (should not happen)
        setMessages((prev) => {
          const last = prev[prev.length - 1];
          if (last?.role === 'assistant' && !last.content.trim()) {
            return prev.slice(0, -1);
          }
          return prev;
        });
      } catch (e: any) {
        if (e?.name === 'AbortError') {
          setRetryInfo(null);
          break;
        }
        const status: number | undefined = e?.response?.status ?? e?.status;
        const isClientError = status === 400 || status === 401 || status === 403 || status === 404;
        if (isClientError) {
          const msg = e?.response?.data?.error || e?.message || 'Chat failed';
          setChatError(typeof msg === 'string' ? msg : JSON.stringify(msg));
          // Remove placeholder assistant
          setMessages((prev) => {
            const last = prev[prev.length - 1];
            if (last?.role === 'assistant' && !last.content.trim()) return prev.slice(0, -1);
            return prev;
          });
          break;
        }
        attempt += 1;
        if (attempt > maxAttempts) {
          const msg = e?.message || 'Chat failed after retries';
          setChatError(`${msg} (tried ${maxAttempts} times, giving up)`);
          setMessages((prev) => {
            const last = prev[prev.length - 1];
            if (last?.role === 'assistant' && !last.content.trim()) return prev.slice(0, -1);
            return prev;
          });
          break;
        }
        setRetryInfo(`Retrying… ${attempt}/${maxAttempts} in 5s`);
        // Wait 5s before next attempt, abortable
        try {
          await new Promise<void>((resolve, reject) => {
            const t = setTimeout(resolve, delayMs);
            controller.signal.addEventListener('abort', () => {
              clearTimeout(t);
              reject(new DOMException('Aborted', 'AbortError'));
            }, { once: true });
          });
        } catch {
          break;
        }
        if (controller.signal.aborted) break;
      }
    }
    setSending(false);
    abortRef.current = null;
    setRetryInfo(null);
  };

  // Abort stream on unmount or when panel closes
  useEffect(() => {
    if (!open && abortRef.current) {
      abortRef.current.abort();
      abortRef.current = null;
      setSending(false);
    }
  }, [open]);

  const handleSaveConfig = async () => {
    if (!canManage) return;
    setCfgSaving(true);
    setCfgError(null);
    try {
      // Ensure no duplicate ids
      const seen = new Set<string>();
      for (const p of providersDraft) {
        const id = (p.id || '').trim();
        if (!id) throw new Error('Each provider needs an id');
        if (seen.has(id)) throw new Error(`Duplicate provider id "${id}"`);
        seen.add(id);
      }
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
      setShowConfig(false);
    } catch (e: any) {
      const msg = e?.response?.data?.error || e?.message || 'Failed to save config';
      setCfgError(typeof msg === 'string' ? msg : JSON.stringify(msg));
    } finally {
      setCfgSaving(false);
    }
  };

  const addProvider = () => {
    // Use timestamp to avoid duplicate ids after deletions
    const uniq = Date.now().toString(36).slice(-4);
    setProvidersDraft((prev) => [
      ...prev,
      {
        id: `provider-${uniq}`,
        name: `Provider ${prev.length + 1}`,
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
    setProvidersDraft((prev) => {
      const next = prev.filter((_, i) => i !== idx);
      // If removed provider was selected, clear selection
      const removed = prev[idx];
      if (removed && removed.id === selectedProvider) {
        if (next.length > 0) {
          const first = next.find((p) => p.enabled) || next[0];
          setSelectedProvider(first.id);
          if (first.models.length > 0) setSelectedModel(first.models[0]);
          else setSelectedModel('');
        } else {
          setSelectedProvider('');
          setSelectedModel('');
        }
      }
      return next;
    });
  };

  if (!user) return null;

  const hasProviders = cfg ? cfg.providers.length > 0 : false;
  const enabledProviders = cfg ? cfg.providers.filter((p) => p.enabled) : [];
  const canChat = canUse && hasProviders && enabledProviders.length > 0;

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

  // Panel style: fixed near trigger, drop-up — like notification bell portal
  const panelStyle: React.CSSProperties = panelPos
    ? {
        position: 'fixed',
        left: panelPos.left,
        top: panelPos.top,
        width: panelPos.width,
        maxWidth: '92vw',
        zIndex: 2147483640,
      }
    : {
        position: 'fixed',
        right: 16,
        bottom: 80,
        width: 380,
        maxWidth: '92vw',
        zIndex: 2147483640,
      };

  return (
    <>
      {/* Fixed cycle toggle — bottom right, always visible when authenticated */}
      <button
        ref={triggerRef}
        id="ks-ai-toggle"
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={open ? 'Close AI assistant' : 'Open AI assistant'}
        aria-expanded={open}
        aria-haspopup="dialog"
        className="fixed bottom-4 right-4 z-40 flex items-center justify-center w-14 h-14 rounded-full bg-gradient-to-br from-indigo-600 to-violet-600 text-white shadow-[0_8px_24px_rgba(79,70,229,0.45)] hover:shadow-[0_10px_28px_rgba(79,70,229,0.55)] hover:scale-[1.03] active:scale-[0.97] transition-all duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 focus-visible:ring-offset-2 focus-visible:ring-offset-[#0f0f12] border border-white/10 touch-manipulation"
        style={{ WebkitTapHighlightColor: 'transparent' }}
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

      {open &&
        typeof document !== 'undefined' &&
        createPortal(
          <>
            {/* Scrim — like notification dropdown: closes on outside tap/click */}
            <div
              onClick={() => {
                setOpen(false);
                setShowModelDropdown(false);
              }}
              onTouchStart={() => {
                setOpen(false);
                setShowModelDropdown(false);
              }}
              onContextMenu={(e) => {
                e.preventDefault();
                setOpen(false);
                setShowModelDropdown(false);
              }}
              style={{ position: 'fixed', inset: 0, zIndex: 2147483639 }}
              aria-hidden="true"
            />
            {/* Panel — portal, fixed, theme-aware glass */}
            <div
              ref={panelRef}
              role="dialog"
              aria-label="AI Assistant"
              aria-modal="true"
              style={panelStyle}
              className="flex flex-col rounded-2xl border border-white/15 bg-[#0f0f12]/95 backdrop-blur-xl shadow-2xl overflow-hidden animate-slide-up max-h-[min(78dvh,640px)] min-h-[480px] touch-manipulation"
              onClick={(e) => e.stopPropagation()}
              onTouchStart={(e) => e.stopPropagation()}
            >
              {/* Header — left title, right: [Clear][Model dropdown][Settings][Close] */}
              <div className="flex items-center justify-between px-3 py-2.5 border-b border-white/10 bg-white/[0.04] gap-2 shrink-0">
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
                  {/* Clear SVG — top left of model dropdown toggle */}
                  {!showConfig && messages.length > 0 && canUse && (
                    <button
                      type="button"
                      onClick={() => setMessages([])}
                      aria-label="Clear chat"
                      title="Clear chat"
                      className="w-8 h-8 rounded-lg flex items-center justify-center text-gray-300 hover:bg-white/10 hover:text-white active:bg-white/15 transition-colors touch-manipulation"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
                        <polyline points="3 6 5 6 21 6" />
                        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                        <line x1="10" y1="11" x2="10" y2="17" />
                        <line x1="14" y1="11" x2="14" y2="17" />
                      </svg>
                    </button>
                  )}

                  {/* Model dropdown — left of settings icon, searchable, row-inline */}
                  {!showConfig && canUse && (
                    <div className="relative">
                      <button
                        ref={modelToggleRef}
                        type="button"
                        onClick={() => setShowModelDropdown((v) => !v)}
                        aria-label="Select model"
                        aria-expanded={showModelDropdown}
                        aria-haspopup="listbox"
                        className={`max-w-[148px] inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs font-medium transition-colors truncate touch-manipulation ${
                          showModelDropdown ? 'bg-white/15 text-white border-white/20' : 'bg-white/5 text-gray-200 border-white/10 hover:bg-white/10 hover:text-white active:bg-white/15'
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
                      aria-pressed={showConfig}
                      className={`w-8 h-8 rounded-lg flex items-center justify-center transition-colors touch-manipulation ${showConfig ? 'bg-white/15 text-white' : 'text-gray-300 hover:bg-white/10 hover:text-white active:bg-white/15'}`}
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
                    className="w-8 h-8 rounded-lg flex items-center justify-center text-gray-300 hover:bg-white/10 hover:text-white active:bg-white/15 transition-colors touch-manipulation"
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
                <div className="flex-1 overflow-auto px-4 py-3 space-y-3 bg-[#0a0a0c]/40 overscroll-contain touch-pan-y">
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
                          <button type="button" onClick={addProvider} className="text-xs px-2 py-1 rounded-md bg-indigo-600 hover:bg-indigo-500 active:bg-indigo-700 text-white transition-colors touch-manipulation">
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
                                    <label className="flex items-center gap-2 text-xs text-gray-200 cursor-pointer pb-2 touch-manipulation">
                                      <input type="checkbox" checked={!!p.enabled} onChange={(e) => updateProvider(idx, { enabled: e.target.checked })} className="accent-indigo-500" />
                                      Enabled
                                    </label>
                                    <button type="button" onClick={() => removeProvider(idx)} className="ml-auto text-xs px-2 py-1 rounded-md bg-white/5 hover:bg-red-500/15 active:bg-red-500/25 text-red-300 border border-white/10 hover:border-red-500/20 transition-colors touch-manipulation">
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

                      <div className="flex items-center gap-2 pt-1 flex-wrap">
                        <button type="button" onClick={handleSaveConfig} disabled={cfgSaving} className="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 active:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium text-white transition-colors touch-manipulation">
                          {cfgSaving ? 'Saving…' : 'Save config'}
                        </button>
                        <button type="button" onClick={() => setShowConfig(false)} className="px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 active:bg-white/15 text-sm text-gray-200 border border-white/10 transition-colors touch-manipulation">
                          Back to chat
                        </button>
                        {cfgError && <span className="text-xs text-red-300">{cfgError}</span>}
                      </div>
                    </>
                  )}
                </div>
              ) : !canUse ? (
                <div className="flex-1 flex items-center justify-center px-4 py-8">
                  <div className="rounded-xl border border-amber-400/20 bg-amber-500/10 px-4 py-3 w-full">
                    <p className="text-sm font-medium text-amber-200">No permission to use AI chat</p>
                    <p className="text-xs text-amber-100/70 mt-1">
                      Your role doesn't have <code className="px-1 py-0.5 rounded bg-white/10 text-amber-100">AI_CHAT_USE</code> (or <code className="px-1 py-0.5 rounded bg-white/10 text-amber-100">MANAGE_AI_CHAT</code>). Ask an admin to grant it in Roles → AI Chat → VIEW.
                    </p>
                  </div>
                </div>
              ) : (
                <>
                  {!hasProviders && !cfgLoading && canManage && (
                    <div className="mx-4 mt-3 rounded-lg border border-indigo-400/20 bg-indigo-500/10 px-3 py-2 shrink-0">
                      <p className="text-xs text-indigo-100">No AI provider configured yet.</p>
                      <p className="text-xs text-indigo-200/70 mt-1">Open the gear to add a provider, set model IDs and the system prompt.</p>
                    </div>
                  )}
                  {!hasProviders && !cfgLoading && !canManage && (
                    <div className="mx-4 mt-3 rounded-lg border border-amber-400/20 bg-amber-500/10 px-3 py-2 shrink-0">
                      <p className="text-xs text-amber-100">No AI provider is configured yet.</p>
                      <p className="text-xs text-amber-100/70 mt-1">An admin with <code className="px-1 py-0.5 rounded bg-white/10">AI_CHAT_MANAGE</code> needs to add a provider and model.</p>
                    </div>
                  )}

                  <div ref={scrollRef} className="flex-1 overflow-auto px-4 py-3 space-y-3 min-h-[320px] max-h-[440px] bg-[#0a0a0c]/40 overscroll-contain touch-pan-y">
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

                  {chatError && <div className="mx-4 mb-2 rounded-lg border border-red-400/20 bg-red-500/10 px-3 py-2 text-xs text-red-200 shrink-0">{chatError}</div>}
                  {cfgError && <div className="mx-4 mb-2 rounded-lg border border-red-400/20 bg-red-500/10 px-3 py-2 text-xs text-red-200 shrink-0">{cfgError}</div>}

                  <div className="p-3 border-t border-white/10 bg-white/[0.03] flex items-end gap-2 shrink-0">
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
                    <button type="button" onClick={handleSend} disabled={!canChat || sending || !input.trim()} aria-label="Send message" className="shrink-0 w-[42px] h-[42px] rounded-xl bg-indigo-600 hover:bg-indigo-500 active:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed text-white flex items-center justify-center transition-colors touch-manipulation">
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

            {/* Model dropdown portal — row-aligned searchable, like notification */}
            {showModelDropdown && !showConfig && canUse && modelPos && typeof document !== 'undefined' && createPortal(
              <>
                <div
                  onClick={() => setShowModelDropdown(false)}
                  onTouchStart={() => setShowModelDropdown(false)}
                  style={{ position: 'fixed', inset: 0, zIndex: 2147483641 }}
                  aria-hidden="true"
                />
                <div
                  ref={modelDropdownRef}
                  role="listbox"
                  aria-label="Select model"
                  style={{
                    position: 'fixed',
                    left: modelPos.left,
                    top: modelPos.top,
                    width: modelPos.width,
                    maxWidth: '92vw',
                    zIndex: 2147483642,
                  }}
                  className="rounded-xl border border-white/15 bg-[#0f0f12] shadow-2xl overflow-hidden animate-slide-up flex flex-col max-h-[320px]"
                  onClick={(e) => e.stopPropagation()}
                  onTouchStart={(e) => e.stopPropagation()}
                >
                  <div className="p-2 border-b border-white/10 bg-white/[0.03] shrink-0">
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
                        <button type="button" onClick={() => setModelSearch('')} className="text-xs px-2 py-1 rounded-md bg-white/5 hover:bg-white/10 active:bg-white/15 text-gray-300 border border-white/10 touch-manipulation">
                          Clear
                        </button>
                      )}
                    </div>
                  </div>
                  <div className="flex-1 overflow-auto p-2 space-y-2 overscroll-contain touch-pan-y">
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
                                    className={`text-xs px-2 py-1 rounded-md border transition-colors touch-manipulation ${active ? 'bg-indigo-600 text-white border-indigo-500' : 'bg-white/5 text-gray-200 border-white/10 hover:bg-white/10 hover:text-white active:bg-white/15'}`}
                                    title={`${p.id} / ${m}`}
                                  >
                                    {m}
                                  </button>
                                );
                              })
                            )}
                          </div>
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedProvider(p.id);
                              if (p.models.length > 0 && !p.models.includes(selectedModel)) setSelectedModel(p.models[0]);
                              setShowModelDropdown(false);
                              setModelSearch('');
                            }}
                            className="mt-2 text-[11px] text-indigo-300 hover:text-indigo-200 active:text-indigo-400 touch-manipulation"
                          >
                            Use provider →
                          </button>
                        </div>
                      ))
                    )}
                  </div>
                  <div className="px-3 py-2 border-t border-white/10 bg-black/20 text-[11px] text-gray-400 flex items-center justify-between shrink-0">
                    <span>{cfg ? `${cfg.providers.length} providers` : ''}</span>
                    <button type="button" onClick={() => setShowModelDropdown(false)} className="text-gray-300 hover:text-white active:text-white touch-manipulation">Close</button>
                  </div>
                </div>
              </>,
              document.body
            )}
          </>,
          document.body
        )}
    </>
  );
};

export default AiChatWidget;
