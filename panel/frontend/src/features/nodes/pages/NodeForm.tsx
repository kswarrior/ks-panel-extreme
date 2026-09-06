import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { createNode, updateNode, listNodes, probeNode, setupLocalNode, listNodeWssChannels } from '@/shared/api/admin';
import type { Node, CreateNodeResult, ProbeResult, SetupLocalResult } from '@/shared/types/node';
import FormPage from '@/shared/components/forms/FormPage';
import { PageActionsPill, PILL_TAB_STYLE } from '@/shared/components/ui/PageActionsPill';
import PageTabsPill from '@/shared/components/ui/PageTabsPill';
import GlassCard from '@/shared/components/ui/Card';
import GlassField, { glassFieldClass } from '@/shared/components/ui/Field';
import GlassModal from '@/shared/components/ui/Modal';
import ToggleRow from '@/shared/components/ui/ToggleRow';
import LocationField from '@/shared/components/forms/LocationField/LocationField';
import FormSkeleton from '@/shared/components/ui/FormSkeleton';
import type { ConnectionMode, Form, NodeFormTabId, WssChannel, WssTask, WssTransport } from '../types/nodeForm';
import { emptyForm, KSEDGE_URL, ALL_KINDS, NODEFORM_TABS, isLocalMode, isTunnelMode, isDualMode, WSS_TASKS, WSS_TRANSPORTS } from '../types/nodeForm';
import { buildEdgeConfig, buildBootstrapCmd } from '../utils/nodeFormUtils';
import { NODE_ICONS, NODE_COLORS, NodeIcon, isCustomNodeIconSvg } from '../utils/nodeIcons';

// Display names for the preset colour dropdown (keys match NODE_COLORS).
const NODE_COLOR_NAMES: Record<string, string> = {
  '#34d399': 'Emerald',
  '#38bdf8': 'Sky',
  '#60a5fa': 'Blue',
  '#a78bfa': 'Violet',
  '#f472b6': 'Pink',
  '#f87171': 'Red',
  '#fbbf24': 'Amber',
  '#fb923c': 'Orange',
  '#a3e635': 'Lime',
  '#2dd4bf': 'Teal',
};

const HEX_RE = /^#[0-9a-fA-F]{6}$/;

// Per-tab icon + desktop hint, mirroring the template form's tab style.
// Hints render only on desktop (hidden lg:block at the call site).
const NODE_TAB_META: Record<NodeFormTabId, { hint: string; icon: React.ReactNode }> = {
  general: {
    hint: 'Name, address, icon & connection',
    icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4"><circle cx="12" cy="12" r="10" /><path d="M12 16v-4" /><path d="M12 8h.01" /></svg>,
  },
  health: {
    hint: 'Probe interval, timeout & retries',
    icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4"><path d="M22 12h-4l-3 9L9 3l-3 9H2" /></svg>,
  },
  limits: {
    hint: 'Instance kinds & resource caps',
    icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4"><path d="M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3" /><path d="M1 14h6M9 8h6M17 16h6" /></svg>,
  },
  location: {
    hint: 'Category & site label',
    icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" /><circle cx="12" cy="10" r="3" /></svg>,
  },
};

// isValidPortStr reports whether p is a decimal port number in 1..65535.
const isValidPortStr = (p: string): boolean => {
  const t = p.trim();
  if (!/^\d{1,5}$/.test(t)) return false;
  const n = parseInt(t, 10);
  return n >= 1 && n <= 65535;
};

// validateRemoteAddress mirrors the panel server's address rules client-side
// so bad connection input is caught before it ever leaves the form:
//   host:port | bare host (Cloudflare-tunnel) | [ipv6][:port]
// rejecting embedded schemes, whitespace and out-of-range ports.
const validateRemoteAddress = (raw: string): string => {
  const a = raw.trim();
  if (!a) return 'Address is required for remote nodes';
  if (/^https?:\/\//i.test(a)) return 'Address must not include a scheme (drop http(s)://)';
  if (/\s/.test(a)) return 'Address must not contain whitespace';
  if (a.startsWith('[')) {
    const m = /^\[[^\]]+\](?::(\d{1,5}))?$/.exec(a);
    if (!m) return 'IPv6 addresses use the [host] or [host]:port form';
    if (m[1] !== undefined && !isValidPortStr(m[1])) return 'Port must be a number between 1 and 65535';
    return '';
  }
  const idx = a.lastIndexOf(':');
  if (idx >= 0) {
    if (!a.slice(0, idx).trim()) return 'Host is required before ":"';
    if (!isValidPortStr(a.slice(idx + 1))) return 'Port must be a number between 1 and 65535';
  }
  return '';
};

const NodeForm: React.FC = () => {
  const { id } = useParams<{ id?: string }>();
  const editing = !!id;
  const navigate = useNavigate();

  const [form, setForm] = useState<Form>(emptyForm);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [tokenInfo, setTokenInfo] = useState<{
    token: string;
    title: string;
    configJson?: string;
    bootstrapCmd?: string;
    isLocalhost?: boolean;
    isTunnel?: boolean;
    isDual?: boolean;
    port?: string;
    nodeProbe?: ProbeResult | null;
  } | null>(null);
  const [probing, setProbing] = useState(false);
  const [settingUp, setSettingUp] = useState(false);
  const [setupInfo, setSetupInfo] = useState<{
    running: boolean;
    log: string;
    probe?: ProbeResult | null;
    error?: string;
    done: boolean;
  } | null>(null);
  const [tab, setTab] = useState<NodeFormTabId>('general');
  // Dropdown overrides for the Icon / Colour pickers. Null means "auto":
  // the select follows the loaded form value (preset key, Custom when a
  // custom SVG / non-preset hex is stored, Default when empty).
  const [iconChoice, setIconChoice] = useState<string | null>(null);
  const [colorChoice, setColorChoice] = useState<string | null>(null);
  // Every registered node — powers the client-side (name, label) duplicate
  // pre-check so the operator sees the clash before the server's 409.
  const [allNodes, setAllNodes] = useState<Node[]>([]);
  // Named WSS channels (the WSS box rows). One catch-all row is pre-added
  // so a fresh WSS/both form already has a working channel.
  const [wssChannels, setWssChannels] = useState<WssChannel[]>([
    { key: 'temp-0', name: 'wss-1', task: 'all', transport: 'auto', fallback: true },
  ]);
  const [wssSeq, setWssSeq] = useState(1);

  // addWssChannel appends a blank row (top-right Add button in the WSS box).
  const addWssChannel = () => {
    const n = wssSeq;
    setWssSeq(n + 1);
    setWssChannels((prev) => [
      ...prev,
      { key: `temp-${n}`, name: `wss-${n + 1}`, task: 'all', transport: 'auto', fallback: true },
    ]);
  };

  // updateWssChannel patches one row by key.
  const updateWssChannel = (key: string, patch: Partial<WssChannel>) => {
    setWssChannels((prev) => prev.map((c) => (c.key === key ? { ...c, ...patch } : c)));
  };

  // removeWssChannel drops one row (per-row remove button).
  const removeWssChannel = (key: string) => {
    setWssChannels((prev) => prev.filter((c) => c.key !== key));
  };

  // modeTab derives the 3-tab selection from the stored connection mode.
  const modeTab: 'direct' | 'wss' | 'both' = isDualMode(form.connection_mode)
    ? 'both'
    : isTunnelMode(form.connection_mode)
    ? 'wss'
    : 'direct';

  // setModeTab switches transport family while preserving the Local toggle.
  const setModeTab = (t: 'direct' | 'wss' | 'both') => {
    setForm((f) => {
      const local = isLocalMode(f.connection_mode);
      if (t === 'direct') return { ...f, connection_mode: local ? 'local_port' : 'direct' };
      if (t === 'wss') return { ...f, connection_mode: local ? 'local_wss' : 'reverse_tunnel' };
      return { ...f, connection_mode: local ? 'local_both' : 'both' };
    });
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        // Fetched in both modes: the duplicate-pair pre-check needs the
        // existing fleet even when creating a fresh node.
        const nodes = await listNodes();
        if (!cancelled) setAllNodes(nodes);
        if (editing) {
          const n = nodes.find((x) => x.id === Number(id));
          if (n) {
            const stored = (n as any).connection_mode as ConnectionMode | undefined;
            let connectionMode: ConnectionMode = stored || 'direct';
            let port = '4040';
            let address = n.address || '';
            // Back-compat: legacy rows without connection_mode infer from address.
            if (!stored) {
              const isLocal = n.address.startsWith('127.0.0.1:') || n.address.startsWith('localhost:');
              if (isLocal) {
                connectionMode = 'local_port';
                port = n.address.split(':').pop() || '4040';
                address = '';
              } else if (n.address === 'tunnel' || n.address === '') {
                connectionMode = 'reverse_tunnel';
                address = '';
              }
            } else if (isLocalMode(connectionMode)) {
              port = n.address.split(':').pop() || '4040';
              address = '';
            } else if (connectionMode === 'reverse_tunnel') {
              address = '';
              port = '4040';
            } else if (connectionMode === 'both') {
              // Remote dual keeps a real address (never the tunnel sentinel).
              if (address === 'tunnel') address = '';
              port = '4040';
            }
            setForm({
              name: n.name,
              connection_mode: connectionMode,
              port: port || '4040',
              address: address,
              use_tls: n.use_tls,
              health_enabled: n.health_enabled !== false,
              health_interval: String(n.health_interval || 60),
              health_timeout: String(n.health_timeout || 4),
              health_retries: String(n.health_retries || 3),
              skip_tls_verify: !!n.skip_tls_verify,
              notes: n.notes || '',
              install_dir: n.install_dir || './localnode/',
              allowed_kinds: n.allowed_kinds || '',
              alloc_mem_mib: String(n.alloc_mem_mib || 0),
              mem_overcommit_pct: String(n.mem_overcommit_pct || 0),
              alloc_disk_mib: String(n.alloc_disk_mib || 0),
              disk_overcommit_pct: String(n.disk_overcommit_pct || 0),
              instances_dir: n.instances_dir || '/var/lib/kspanel/instances',
              category: n.category || '',
              location_country: n.location_country || '',
              location_node: n.location_node || '',
              icon: n.icon || '',
              color: n.color || '',
            });
            // Load the WSS box rows for tunnel-capable modes.
            try {
              const rows = await listNodeWssChannels(Number(id));
              if (!cancelled) {
                if (rows.length > 0) {
                  setWssChannels(rows.map((r) => ({
                    key: `saved-${r.id}`,
                    id: r.id,
                    name: r.name,
                    task: (r.task as WssTask) || 'all',
                    transport: (r.transport as WssTransport) || 'auto',
                    fallback: r.fallback !== false,
                  })));
                  setWssSeq(rows.length);
                } else if (isTunnelMode(connectionMode)) {
                  // Tunnel mode with no saved rows: keep the pre-added
                  // catch-all so the box is never empty.
                  setWssChannels([{ key: 'temp-0', name: 'wss-1', task: 'all', transport: 'auto', fallback: true }]);
                  setWssSeq(1);
                } else {
                  setWssChannels([]);
                }
              }
            } catch {
              // Channels table may predate migration 062 on first rollout —
              // keep the local default instead of failing the whole form.
            }
          } else {
            setError('Node not found');
          }
        }
      } catch (e: any) {
        if (!cancelled) setError(e?.response?.data || 'Failed to load node');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [id, editing]);

  const effectiveAddress = useMemo(() => {
    if (isLocalMode(form.connection_mode)) return `127.0.0.1:${form.port || '4040'}`;
    if (form.connection_mode === 'reverse_tunnel') return 'tunnel';
    return form.address.trim();
  }, [form.connection_mode, form.port, form.address]);

  const dialPreview = useMemo(() => {
    const m = form.connection_mode;
    if (m === 'reverse_tunnel') return 'WSS tunnel — edge dials panel (no direct dial)';
    if (m === 'local_wss') return `WSS tunnel preferred, fallback to http://127.0.0.1:${form.port || '4040'}`;
    if (m === 'local_both') return `Port + WSS per task — http://127.0.0.1:${form.port || '4040'} + tunnel (see WSS channels)`;
    if (m === 'both') {
      const addr = form.address.trim();
      const scheme = form.use_tls ? 'https' : 'http';
      if (!addr) return 'Port + WSS per task — <edge-host>:<port> + tunnel (see WSS channels)';
      return `${scheme}://${addr} + WSS tunnel (per-task routing)`;
    }
    if (isLocalMode(m)) return `${form.use_tls ? 'https' : 'http'}://127.0.0.1:${form.port || '4040'}`;
    const scheme = form.use_tls ? 'https' : 'http';
    const addr = form.address.trim();
    if (!addr) return `${scheme}://<edge-host>:<port>`;
    const bareHost = !addr.includes(':') && addr.trim() !== '';
    return `${scheme}://${addr}${bareHost ? '  (default port)' : ''}`;
  }, [form.connection_mode, form.address, form.port, form.use_tls]);

  const allowedKindsSet = useMemo(
    () => new Set(form.allowed_kinds.split(',').map((s) => s.trim().toLowerCase()).filter(Boolean)),
    [form.allowed_kinds],
  );

  const toggleKind = (key: string) => {
    const next = new Set(allowedKindsSet);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    const ordered = ALL_KINDS.map((k) => k.key).filter((k) => next.has(k));
    setForm((f) => ({ ...f, allowed_kinds: ordered.join(', ') }));
  };

  const advancedPayload = () => ({
    connection_mode: form.connection_mode,
    // WSS box rows ride the same payload (replace-all). Omitted for pure
    // port modes so legacy callers and direct nodes stay untouched.
    ...(isTunnelMode(form.connection_mode)
      ? {
          wss_channels: wssChannels.map((c) => ({
            name: c.name.trim(),
            task: c.task,
            transport: c.transport,
            fallback: c.fallback,
          })),
        }
      : {}),
    health_enabled: form.health_enabled,
    health_interval: Math.max(1, parseInt(form.health_interval, 10) || 60),
    health_timeout: Math.max(1, parseInt(form.health_timeout, 10) || 4),
    health_retries: Math.max(1, parseInt(form.health_retries, 10) || 3),
    skip_tls_verify: form.skip_tls_verify,
    notes: form.notes.trim(),
    install_dir: isLocalMode(form.connection_mode) ? form.install_dir.trim() : '',
    allowed_kinds: form.allowed_kinds.trim(),
    alloc_mem_mib: Math.max(0, parseInt(form.alloc_mem_mib, 10) || 0),
    mem_overcommit_pct: Math.max(0, parseInt(form.mem_overcommit_pct, 10) || 0),
    alloc_disk_mib: Math.max(0, parseInt(form.alloc_disk_mib, 10) || 0),
    disk_overcommit_pct: Math.max(0, parseInt(form.disk_overcommit_pct, 10) || 0),
    instances_dir: form.instances_dir.trim(),
    category: form.category.trim(),
    location_country: form.location_country.trim().toUpperCase(),
    location_node: form.location_node.trim(),
    icon: form.icon,
    color: form.color.toUpperCase(),
  });

  // duplicatePairError implements the panel's composite uniqueness rule
  // client-side: two nodes may share a name, and two may share a label,
  // but no two nodes may share BOTH (compared trimmed + case-insensitive,
  // exactly like the server). The node being edited is skipped.
  const duplicatePairError = (): string => {
    const name = form.name.trim().toLowerCase();
    const label = form.location_node.trim().toLowerCase();
    const clash = allNodes.find((n) =>
      !(editing && n.id === Number(id)) &&
      n.name.trim().toLowerCase() === name &&
      (n.location_node || '').trim().toLowerCase() === label,
    );
    if (!clash) return '';
    return `Node "${clash.name}" (label: ${clash.location_node ? `"${clash.location_node}"` : 'none'}) already uses this exact name+label pair — change the name or pick another node label.`;
  };

  // validateWssChannels mirrors the server's channel rules client-side:
  // every row needs a name (≤100), task/transport from the fixed lists, and
  // a per-node unique name (trimmed, case-insensitive).
  const validateWssChannels = (): string => {
    if (!isTunnelMode(form.connection_mode)) return '';
    const seen = new Set<string>();
    for (const c of wssChannels) {
      if (!c.name.trim()) return 'Every WSS channel needs a name';
      if (c.name.trim().length > 100) return `WSS channel "${c.name.trim()}" must be 100 characters or fewer`;
      if (!WSS_TASKS.some((t) => t.value === c.task)) return `WSS channel "${c.name.trim()}" has an invalid task`;
      if (!WSS_TRANSPORTS.some((t) => t.value === c.transport)) return `WSS channel "${c.name.trim()}" has an invalid transport`;
      const key = c.name.trim().toLowerCase();
      if (seen.has(key)) return `Duplicate WSS channel name "${c.name.trim()}" — names must be unique per node`;
      seen.add(key);
    }
    return '';
  };

  // validateForm runs every connection-safety rule before either submit
  // path talks to the API. Returns an error message or '' when acceptable.
  const validateForm = (): string => {
    if (!form.name.trim()) return 'Name is required';
    if (form.name.length > 100) return 'Name must be 100 characters or fewer';
    if (form.location_node.trim().length > 100) return 'Node label must be 100 characters or fewer';
    if (form.connection_mode === 'direct' || form.connection_mode === 'both') {
      const addrErr = validateRemoteAddress(form.address);
      if (addrErr) return addrErr;
    } else if (form.connection_mode === 'reverse_tunnel') {
      // No address required — edge dials panel via WSS. Name uniqueness still checked.
    } else if (isLocalMode(form.connection_mode)) {
      if (!isValidPortStr(form.port)) return 'Port must be a number between 1 and 65535';
    }
    const wssErr = validateWssChannels();
    if (wssErr) return wssErr;
    // Icon & colour mirror the server's display rules client-side.
    if (form.icon && !NODE_ICONS.some((ic) => ic.key === form.icon)) {
      const t = form.icon.trim();
      if (!isCustomNodeIconSvg(t)) return 'Custom icon must be a full <svg>...</svg> block';
      if (t.length > 5000) return 'Custom icon is too large (max 5000 characters)';
      if (!t.toLowerCase().includes('</svg>')) return 'Custom icon must be a full <svg>...</svg> block';
      if (t.toLowerCase().includes('<script')) return 'Custom icon must not contain <script>';
    }
    if (form.color && !HEX_RE.test(form.color.trim())) return 'Color must be a #rrggbb hex value';
    return duplicatePairError();
  };

  // Icon dropdown state — 'custom' shows the paste box, '' is Default,
  // otherwise the preset key. Auto-follows the stored value until the
  // operator touches the dropdown.
  const iconSelectValue =
    iconChoice ?? (isCustomNodeIconSvg(form.icon) ? 'custom' : form.icon);
  const showCustomIcon = iconSelectValue === 'custom';
  const onIconSelect = (v: string) => {
    setIconChoice(v);
    if (v !== 'custom') setForm((f) => ({ ...f, icon: v }));
    else setForm((f) => (isCustomNodeIconSvg(f.icon) ? f : { ...f, icon: '' }));
  };

  // Colour dropdown state — same shape: 'custom' shows picker + hex
  // input, '' is Default, otherwise a preset hex (case-insensitive).
  const presetColorMatch =
    NODE_COLORS.find((c) => c.toLowerCase() === form.color.trim().toLowerCase()) ?? null;
  const colorSelectValue =
    colorChoice ??
    (form.color.trim() === '' ? '' : presetColorMatch ?? 'custom');
  const showCustomColor = colorSelectValue === 'custom';
  const onColorSelect = (v: string) => {
    setColorChoice(v);
    if (v !== 'custom') setForm((f) => ({ ...f, color: v }));
  };
  const colorOk = form.color.trim() === '' || HEX_RE.test(form.color.trim());

  const submitAndSetup = async () => {
    if (!isLocalMode(form.connection_mode)) {
      setError('Create & setup is only available for local edge modes');
      return;
    }
    const vErr = validateForm();
    if (vErr) {
      setError(vErr);
      return;
    }
    setSaving(true);
    setError('');
    setSettingUp(true);
    setSetupInfo({ running: true, log: 'Registering node…', done: false });
    try {
      const res: CreateNodeResult = await createNode({
        name: form.name,
        address: effectiveAddress,
        use_tls: form.use_tls,
        ...advancedPayload(),
      });
      setSetupInfo({ running: true, log: 'Node registered. Installing and launching ksedge…', done: false });
      let setupRes: SetupLocalResult;
      try {
        setupRes = await setupLocalNode(res.id);
      } catch (e: any) {
        const data = e?.response?.data;
        // Backend on mirror failure returns {error, log}; surface log in the modal's "Setup log" pane.
        const errLog = typeof data === 'object' && data && typeof (data as any).log === 'string' ? (data as any).log : '';
        const errMsg = typeof data === 'string' ? data : typeof data === 'object' && data && (data as any).error ? String((data as any).error) : JSON.stringify(data || e?.message || 'setup failed');
        setSetupInfo({
          running: false,
          done: true,
          log: errLog || 'Setup failed.',
          error: errMsg,
          probe: null,
        });
        return;
      }
      setSetupInfo({
        running: false,
        done: true,
        log: setupRes.log || 'Setup complete.',
        probe: setupRes.probe || null,
        error: setupRes.ok ? undefined : (setupRes.message || 'setup did not complete'),
      });
    } catch (e: any) {
      setError(typeof e?.response?.data === 'string' ? e?.response?.data : 'Failed to save node');
    } finally {
      setSaving(false);
      setSettingUp(false);
    }
  };

  const submit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    const vErr = validateForm();
    if (vErr) {
      setError(vErr);
      return;
    }
    setSaving(true);
    setError('');
    try {
      if (editing) {
        await updateNode(Number(id), {
          name: form.name,
          address: effectiveAddress,
          use_tls: form.use_tls,
          ...advancedPayload(),
        });
        navigate('/nodes');
      } else {
        const useTLS = form.use_tls;
        const res: CreateNodeResult = await createNode({
          name: form.name,
          address: effectiveAddress,
          use_tls: useTLS,
          ...advancedPayload(),
        });
        setProbing(true);
        let probeRes: ProbeResult | null = null;
        try {
          probeRes = await probeNode(res.id);
        } catch {
          probeRes = null;
        } finally {
          setProbing(false);
        }
        const isLocal = isLocalMode(form.connection_mode);
        const isTunnel = isTunnelMode(form.connection_mode);
        const isDual = isDualMode(form.connection_mode);
        setTokenInfo({
          token: res.token,
          title: isLocal
            ? 'Local node provisioned — bootstrap command below'
            : isDual
            ? 'Dual-transport node provisioned — edge dials via WSS and panel dials the address'
            : isTunnel
            ? 'Reverse tunnel node provisioned — edge will dial via WSS'
            : 'Node token (copy now)',
          configJson: buildEdgeConfig(
            form.name,
            useTLS,
            res.token,
            form.port,
            form
          ),
          bootstrapCmd: isLocal
            ? buildBootstrapCmd(form, res.token, form.port)
            : undefined,
          isLocalhost: isLocal,
          isTunnel: isTunnel,
          isDual: isDual,
          port: form.port,
          nodeProbe: probeRes,
        });
      }
    } catch (e: any) {
      setError(e?.response?.data || 'Failed to save node');
    } finally {
      setSaving(false);
    }
  };

  const closeTokenModal = () => {
    setTokenInfo(null);
    navigate('/nodes');
  };

  const copyText = async (text: string) => {
    try { await navigator.clipboard.writeText(text); } catch { /* ignore */ }
  };

  if (loading) {
    return (
      <FormPage
        crumbs={[{ label: 'Nodes', to: '/nodes' }, { label: editing ? 'Edit Node' : 'New Node' }]}
        hideHeader
      >
        <FormSkeleton fields={5} />
      </FormPage>
    );
  }

  const showSetupAction = !editing && isLocalMode(form.connection_mode);

  return (
    <>
      {/* Top-right actions — fixed like the phone tab bar (same ks-tab
          style), always visible no matter how far the form is scrolled.
          Footer Cancel/Create removed; everything lives here.
          Padding is shrunk via the theme's own vars (--ks-card-padding /
          --ks-tab-px/py/font): the theme paints .ks-card/.ks-tab padding
          with !important, so Tailwind px/py classes alone can never win —
          overriding the var value scoped to this pill does. */}
      <PageActionsPill>
          <button
            type="button"
            onClick={() => navigate('/nodes')}
            title="Cancel and back to Nodes"
            aria-label="Cancel and back to Nodes"
            className="ks-tab shrink-0 px-3 py-1.5 rounded text-sm text-center transition"
            style={PILL_TAB_STYLE}
          >
            Cancel
          </button>
          {showSetupAction && (
            <button
              type="button"
              onClick={submitAndSetup}
              disabled={saving || settingUp}
              title="Register this localhost node and automatically install + launch ksedge on this host"
              className="ks-tab shrink-0 px-3 py-1.5 rounded text-sm text-center transition disabled:opacity-60"
              style={PILL_TAB_STYLE}
            >
              {settingUp ? 'Setting up…' : 'Create & setup'}
            </button>
          )}
          <button
            type="button"
            onClick={() => submit()}
            disabled={saving}
            title={editing ? 'Save node' : 'Create node'}
            className="ks-tab ks-tab-active shrink-0 px-3 py-1.5 rounded text-sm text-center transition disabled:opacity-60"
            style={PILL_TAB_STYLE}
          >
            {saving ? 'Saving…' : editing ? 'Save' : 'Create'}
          </button>
      </PageActionsPill>
      <FormPage
        crumbs={[{ label: 'Nodes', to: '/nodes' }, { label: editing ? 'Edit Node' : 'New Node' }]}
        onSubmit={submit}
        maxWidth="max-w-4xl"
        hideHeader
      >
      <div className="grid grid-cols-1 lg:grid-cols-[220px_1fr] gap-4">
        {/* Desktop tabs — vertical on the left like the template form.
            Sticky so they stay visible while the form scrolls. */}
        <GlassCard className="hidden lg:block lg:sticky lg:top-4 self-start">
          <nav aria-label="Node form sections" className="flex lg:flex-col gap-1">
            {NODEFORM_TABS.map((t) => (
              <button
                key={t.id}
                type="button"
                role="tab"
                aria-selected={tab === t.id}
                onClick={() => setTab(t.id)}
                className={`ks-tab w-full flex items-center gap-2 transition text-left ${
                  tab === t.id ? 'ks-tab-active' : ''
                }`}
              >
                <span className="inline-flex items-center shrink-0">{NODE_TAB_META[t.id].icon}</span>
                <span className="flex flex-col min-w-0">
                  <span>{t.label}</span>
                  <span
                    className={`text-[10px] hidden lg:block ${tab === t.id ? 'opacity-70' : 'text-gray-500'}`}
                    style={tab === t.id ? { color: 'var(--ks-tab-active-text, #000000)' } : undefined}
                  >
                    {NODE_TAB_META[t.id].hint}
                  </span>
                </span>
              </button>
            ))}
          </nav>
        </GlassCard>
        <div className="space-y-4 min-w-0">
          {tab === 'general' && (
          <>
          <div className="space-y-3">
            <div className="flex items-start gap-3">
              <div className="flex flex-col items-center gap-1 shrink-0" title="Card preview">
                <span
                  className="w-12 h-12 rounded-lg flex items-center justify-center border bg-white/[0.05] border-white/10"
                  style={colorOk && form.color.trim() ? { color: form.color.trim() } : undefined}
                  aria-hidden="true"
                >
                  {form.icon ? (
                    <NodeIcon icon={form.icon} className="w-6 h-6" />
                  ) : (
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-6 h-6"><path d="M22 12h-4l-3 9L9 3l-3 9H2" /></svg>
                  )}
                </span>
                <span className="text-[11px] text-gray-500 max-w-[4.5rem] truncate">{form.name.trim() || 'Node name'}</span>
              </div>
              <div className="flex-1 min-w-0 space-y-3">
                <div>
                  <span className="block text-sm font-medium text-gray-200 mb-1">Icon</span>
                  <div className="flex gap-2 overflow-x-auto scrollbar-hide pb-1 -mx-0.5 px-0.5">
                    <button
                      type="button"
                      onClick={() => onIconSelect('')}
                      title="Default"
                      className={`shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg border transition-colors ${iconSelectValue === '' ? 'border-sky-400/60 bg-sky-500/15' : 'border-white/10 bg-white/5 hover:border-white/20'}`}
                    >
                      <span className="text-xs text-gray-300">Default</span>
                    </button>
                    {NODE_ICONS.map((ic) => (
                      <button
                        key={ic.key}
                        type="button"
                        onClick={() => onIconSelect(ic.key)}
                        title={ic.label}
                        className={`shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg border transition-colors ${iconSelectValue === ic.key ? 'border-sky-400/60 bg-sky-500/15' : 'border-white/10 bg-white/5 hover:border-white/20'}`}
                      >
                        <NodeIcon icon={ic.key} className="w-4 h-4 text-gray-200" />
                        <span className="text-xs text-gray-300">{ic.label}</span>
                      </button>
                    ))}
                    <button
                      type="button"
                      onClick={() => onIconSelect('custom')}
                      title="Custom SVG"
                      className={`shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg border transition-colors ${iconSelectValue === 'custom' ? 'border-sky-400/60 bg-sky-500/15' : 'border-white/10 bg-white/5 hover:border-white/20'}`}
                    >
                      <span className="text-xs text-gray-300">Custom</span>
                    </button>
                  </div>
                </div>
                <div>
                  <span className="block text-sm font-medium text-gray-200 mb-1">Colour</span>
                  <div className="flex gap-2 overflow-x-auto scrollbar-hide pb-1 -mx-0.5 px-0.5">
                    <button
                      type="button"
                      onClick={() => onColorSelect('')}
                      title="Default"
                      className={`shrink-0 px-3 py-1.5 rounded-lg border text-xs transition-colors ${colorSelectValue === '' ? 'border-sky-400/60 bg-sky-500/15 text-white' : 'border-white/10 bg-white/5 text-gray-300 hover:border-white/20'}`}
                    >
                      Default
                    </button>
                    {NODE_COLORS.map((c) => (
                      <button
                        key={c}
                        type="button"
                        onClick={() => onColorSelect(c)}
                        title={`${NODE_COLOR_NAMES[c.toLowerCase()] ?? c} (${c.toUpperCase()})`}
                        className={`shrink-0 w-8 h-8 rounded-lg border transition-transform ${colorSelectValue === c ? 'border-white scale-105' : 'border-white/10 hover:border-white/30'}`}
                        style={{ backgroundColor: c }}
                      >
                        {colorSelectValue === c && (
                          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" className="w-5 h-5 m-auto"><polyline points="20 6 9 17 4 12" /></svg>
                        )}
                      </button>
                    ))}
                    <button
                      type="button"
                      onClick={() => onColorSelect('custom')}
                      title="Custom colour"
                      className={`shrink-0 px-3 py-1.5 rounded-lg border text-xs transition-colors ${colorSelectValue === 'custom' ? 'border-sky-400/60 bg-sky-500/15 text-white' : 'border-white/10 bg-white/5 text-gray-300 hover:border-white/20'}`}
                    >
                      Custom
                    </button>
                  </div>
                </div>
              </div>
            </div>
            {showCustomIcon && (
              <div>
                <label htmlFor="node_icon_custom" className="block text-sm font-medium text-gray-200 mb-1">Custom SVG</label>
                <textarea
                  id="node_icon_custom"
                  rows={3}
                  value={isCustomNodeIconSvg(form.icon) ? form.icon : ''}
                  onChange={(e) => setForm((f) => ({ ...f, icon: e.target.value }))}
                  placeholder="Paste full <svg>...</svg> markup"
                  className="w-full bg-black/30 text-white placeholder-gray-500 border border-white/10 rounded-md px-3 py-2 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-white/60 focus:border-white/40 transition-colors"
                />
              </div>
            )}
            {showCustomColor && (
              <div>
                <span className="block text-sm font-medium text-gray-200 mb-1">Custom colour</span>
                <div className="flex flex-wrap items-center gap-2">
                  <input
                    type="color"
                    value={HEX_RE.test(form.color.trim()) ? form.color.trim() : '#34d399'}
                    onChange={(e) => setForm((f) => ({ ...f, color: e.target.value.toUpperCase() }))}
                    className="h-9 w-12 cursor-pointer rounded border border-white/10 bg-transparent p-0.5"
                    aria-label="Custom colour picker"
                  />
                  <input
                    type="text"
                    value={form.color}
                    onChange={(e) => setForm((f) => ({ ...f, color: e.target.value }))}
                    placeholder="#rrggbb"
                    spellCheck={false}
                    autoComplete="off"
                    className="flex-1 min-w-[8rem] bg-black/30 text-white placeholder-gray-500 border border-white/10 rounded-md px-3 py-2 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-white/60 focus:border-white/40 transition-colors"
                  />
                </div>
                {!colorOk && <p className="text-xs text-red-400 mt-1">Color must be a #rrggbb hex value</p>}
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <GlassField label="Name" htmlFor="name">
              <input
                id="name"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder={isLocalMode(form.connection_mode) ? 'local-edge' : form.connection_mode === 'reverse_tunnel' || form.connection_mode === 'local_wss' ? 'tunnel-edge' : 'us-east-edge'}
                required
              />
            </GlassField>

            <GlassField
              label="Node label"
              htmlFor="node_label"
            >
              <input
                id="node_label"
                value={form.location_node}
                onChange={(e) => setForm({ ...form, location_node: e.target.value })}
                placeholder="e.g. rack-a3"
                autoComplete="off"
              />
            </GlassField>
          </div>

          <div>
            <span className="block text-sm font-medium text-gray-200 mb-1">Connection mode</span>
            <div className="flex gap-1 p-1 rounded-md border border-white/10 bg-black/30 max-w-[480px]" role="tablist" aria-label="Connection mode">
              <button
                type="button"
                role="tab"
                aria-selected={modeTab === 'direct'}
                onClick={() => setModeTab('direct')}
                className={`ks-tab flex-1 px-3 py-1.5 rounded text-sm flex items-center justify-center gap-1.5 ${modeTab === 'direct' ? 'ks-tab-active' : ''}`}
              >
                Direct
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={modeTab === 'wss'}
                onClick={() => setModeTab('wss')}
                className={`ks-tab flex-1 px-3 py-1.5 rounded text-sm flex items-center justify-center gap-1.5 ${modeTab === 'wss' ? 'ks-tab-active' : ''}`}
              >
                WSS
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={modeTab === 'both'}
                onClick={() => setModeTab('both')}
                className={`ks-tab flex-1 px-3 py-1.5 rounded text-sm flex items-center justify-center gap-1.5 ${modeTab === 'both' ? 'ks-tab-active' : ''}`}
              >
                Both
              </button>
            </div>
            <p className="text-xs text-gray-500 mt-1">
              {modeTab === 'both'
                ? 'Both transports alive — per-task WSS channels below pick port vs WSS, with emergency fallback on overload/disconnect.'
                : isTunnelMode(form.connection_mode)
                ? 'Edge dials panel via WSS tunnel.'
                : 'Panel dials edge directly.'}
            </p>
          </div>

          <ToggleRow
            id="local_edge"
            label="Local edge"
            description="Edge runs on this panel host via 127.0.0.1"
            checked={isLocalMode(form.connection_mode)}
            onChange={(v) => setForm((f) => {
              const t: 'direct' | 'wss' | 'both' = isDualMode(f.connection_mode) ? 'both' : isTunnelMode(f.connection_mode) ? 'wss' : 'direct';
              if (t === 'direct') return { ...f, connection_mode: v ? 'local_port' : 'direct' };
              if (t === 'wss') return { ...f, connection_mode: v ? 'local_wss' : 'reverse_tunnel' };
              return { ...f, connection_mode: v ? 'local_both' : 'both' };
            })}
          />

          {(form.connection_mode === 'direct' || form.connection_mode === 'both') && (
            <>
              <GlassField
                label="Edge address"
                htmlFor="address"
                hint={form.connection_mode === 'both'
                  ? 'Panel dials this AND the edge opens a WSS tunnel. host:port (edge.example.com:4040). No http(s):// prefix. Per-task channels below choose port vs WSS.'
                  : 'Panel dials this. host:port (edge.example.com:4040 / 57.6.8.1:3853) OR bare hostname (ftdeycef.com — Cloudflare tunnel). No http(s):// prefix. Panel stores edge URL, edge stores panel URL (bidirectional).'}
              >
                <input
                  id="address"
                  value={form.address}
                  onChange={(e) => setForm({ ...form, address: e.target.value })}
                  placeholder="edge.example.com:4040 or ftdeycef.com"
                  required
                />
              </GlassField>
              <ToggleRow
                id="use_tls"
                label="TLS (https)"
                description="Panel will dial https://edge"
                checked={form.use_tls}
                onChange={(v) => setForm({ ...form, use_tls: v, skip_tls_verify: v ? form.skip_tls_verify : false })}
              />
              <div className={!form.use_tls ? 'opacity-40 pointer-events-none select-none' : undefined} aria-disabled={!form.use_tls}>
                <ToggleRow
                  id="skip_tls_verify"
                  label="Skip TLS verification"
                  description="Only applies when TLS is on — self-signed edge"
                  checked={form.skip_tls_verify}
                  onChange={(v) => setForm({ ...form, skip_tls_verify: v })}
                />
              </div>
            </>
          )}

          {isLocalMode(form.connection_mode) && (
            <GlassField
              label="Edge listen port"
              htmlFor="port"
              hint={form.connection_mode === 'local_wss'
                ? 'ksedge will listen on 127.0.0.1:<port> and also connect back via WSS tunnel. Panel can dial via tunnel or http.'
                : form.connection_mode === 'local_both'
                ? 'ksedge will listen on 127.0.0.1:<port> AND connect back via WSS tunnel. Per-task channels below pick port vs WSS.'
                : 'ksedge will listen on 127.0.0.1:<port>. The panel dials this address.'}
            >
              <input
                id="port"
                type="number"
                min="1"
                max="65535"
                value={form.port}
                onChange={(e) => setForm({ ...form, port: e.target.value })}
                placeholder="4040"
                required
              />
            </GlassField>
          )}

          {isLocalMode(form.connection_mode) && (
            <GlassField
              label="Local edge install location"
              htmlFor="install_dir"
              hint="Where 'Create & setup' and the bootstrap snippet write ksedge + config + log. Default ./localnode/ksedge/. A custom path lets you place the edge on a dedicated disk."
            >
              <input
                id="install_dir"
                value={form.install_dir}
                onChange={(e) => setForm({ ...form, install_dir: e.target.value })}
                placeholder="./localnode/"
              />
            </GlassField>
          )}

          {isTunnelMode(form.connection_mode) && (
            <div className="ks-card ks-form-card rounded-md p-3 space-y-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm text-gray-200 font-medium">WSS channels</p>
                  <p className="text-xs text-gray-500">
                    {isDualMode(form.connection_mode)
                      ? 'Each row handles one task over its preferred transport (port vs WSS). Rows sharing a task divide its data. Task "all" handles everything unless a specific task overrides it.'
                      : 'Each row handles one task over the WSS tunnel. Task "all" handles everything. Rows sharing a task divide its data.'}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={addWssChannel}
                  title="Add a WSS channel"
                  className="shrink-0 inline-flex items-center gap-1.5 bg-white text-black text-xs px-2.5 py-1.5 rounded hover:bg-gray-200"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="w-3.5 h-3.5"><path d="M12 5v14M5 12h14" /></svg>
                  Add
                </button>
              </div>
              {wssChannels.length === 0 && (
                <p className="text-xs text-gray-500">No channels yet — click Add to create one (task "all" handles everything).</p>
              )}
              <div className="space-y-2">
                {wssChannels.map((c) => (
                  <div key={c.key} className="rounded-md border border-white/10 bg-black/30 p-2.5 space-y-2">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <div>
                        <label className="block text-xs font-medium text-gray-300 mb-1">Name</label>
                        <input
                          value={c.name}
                          onChange={(e) => updateWssChannel(c.key, { name: e.target.value })}
                          placeholder="wss-1"
                          autoComplete="off"
                          className="w-full bg-black/30 text-white placeholder-gray-500 border border-white/10 rounded-md px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-white/60 focus:border-white/40 transition-colors"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-300 mb-1">Task</label>
                        <select
                          value={c.task}
                          onChange={(e) => updateWssChannel(c.key, { task: e.target.value as WssTask })}
                          className="w-full bg-black/30 text-white border border-white/10 rounded-md px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-white/60 focus:border-white/40 transition-colors"
                        >
                          {WSS_TASKS.map((t) => (
                            <option key={t.value} value={t.value} title={t.hint}>{t.label}</option>
                          ))}
                        </select>
                      </div>
                    </div>
                    {isDualMode(form.connection_mode) && (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        <div>
                          <label className="block text-xs font-medium text-gray-300 mb-1">Use</label>
                          <select
                            value={c.transport}
                            onChange={(e) => updateWssChannel(c.key, { transport: e.target.value as WssTransport })}
                            className="w-full bg-black/30 text-white border border-white/10 rounded-md px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-white/60 focus:border-white/40 transition-colors"
                          >
                            {WSS_TRANSPORTS.map((t) => (
                              <option key={t.value} value={t.value} title={t.hint}>{t.label}</option>
                            ))}
                          </select>
                        </div>
                        <div className="flex items-end justify-between gap-2">
                          <div className="min-w-0">
                            <p className="text-xs font-medium text-gray-300">Emergency fallback</p>
                            <p className="text-[11px] text-gray-500">Other transport on overload/disconnect</p>
                          </div>
                          <button
                            type="button"
                            onClick={() => updateWssChannel(c.key, { fallback: !c.fallback })}
                            className={`relative w-11 h-6 rounded-full transition shrink-0 ${c.fallback ? 'bg-emerald-600' : 'bg-neutral-700'}`}
                            aria-pressed={c.fallback}
                            aria-label={`Emergency fallback for ${c.name || 'channel'}`}
                          >
                            <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full transition ${c.fallback ? 'translate-x-5' : ''}`} />
                          </button>
                        </div>
                      </div>
                    )}
                    <div className="flex justify-end">
                      <button
                        type="button"
                        onClick={() => removeWssChannel(c.key)}
                        title={`Remove ${c.name || 'channel'}`}
                        className="inline-flex items-center gap-1.5 border border-red-900/50 text-red-300 text-xs px-2.5 py-1.5 rounded hover:bg-red-900/20"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="w-3.5 h-3.5"><path d="M3 6h18M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2m3 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" /></svg>
                        Remove
                      </button>
                    </div>
                  </div>
                ))}
              </div>
              <p className="text-[11px] text-gray-500">
                Files channels carry file-manager transfers; Node channels carry resources/uptime; Instance channels carry deploy / delete / edit / start / stop.
              </p>
            </div>
          )}
          </>
          )}

          {tab === 'health' && (
          <>
          <div className="ks-card ks-form-card rounded-md space-y-3">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm text-gray-200 font-medium">Health check</p>
                <p className="text-xs text-gray-500">Panel actively dials the edge's /health on a schedule, instead of relying on the push heartbeat alone.</p>
              </div>
              <button
                type="button"
                onClick={() => setForm((f) => ({ ...f, health_enabled: !f.health_enabled }))}
                className={`relative w-11 h-6 rounded-full transition shrink-0 ${form.health_enabled ? 'bg-emerald-600' : 'bg-neutral-700'}`}
                aria-pressed={form.health_enabled}
                aria-label="Toggle health check"
              >
                <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full transition ${form.health_enabled ? 'translate-x-5' : ''}`} />
              </button>
            </div>
            {form.health_enabled && (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <GlassField label="Interval (sec)" htmlFor="health_interval">
                  <input
                    id="health_interval"
                    type="number"
                    min="1"
                    value={form.health_interval}
                    onChange={(e) => setForm({ ...form, health_interval: e.target.value })}
                  />
                </GlassField>
                <GlassField label="Timeout (sec)" htmlFor="health_timeout">
                  <input
                    id="health_timeout"
                    type="number"
                    min="1"
                    value={form.health_timeout}
                    onChange={(e) => setForm({ ...form, health_timeout: e.target.value })}
                  />
                </GlassField>
                <GlassField label="Retries → down" htmlFor="health_retries">
                  <input
                    id="health_retries"
                    type="number"
                    min="1"
                    value={form.health_retries}
                    onChange={(e) => setForm({ ...form, health_retries: e.target.value })}
                  />
                </GlassField>
              </div>
            )}
          </div>
          </>
          )}

          {tab === 'limits' && (
          <>
          <div className="ks-card ks-form-card rounded-md space-y-2">
            <div>
              <p className="text-sm text-gray-200 font-medium">Allowed instance kinds</p>
              <p className="text-xs text-gray-500">When chosen, the panel refuses to deploy any template kind not on this list to the edge. Leave all unchecked for no restriction.</p>
            </div>
            <div className="space-y-3 pt-1">
              {ALL_KINDS.map((k) => (
                <ToggleRow
                  key={k.key}
                  id={`kind-${k.key}`}
                  label={k.label}
                  description={`Allow ${k.label} instances on this edge`}
                  checked={allowedKindsSet.has(k.key)}
                  onChange={() => toggleKind(k.key)}
                />
              ))}
            </div>
          </div>

          <div className="ks-card ks-form-card rounded-md space-y-3">
            <div>
              <p className="text-sm text-gray-200 font-medium">Resource allocation</p>
              <p className="text-xs text-gray-500">Panel-side caps the panel enforces before deploying instances to this edge. Leave a cap at 0 (or the over-allocation at 0) to skip the check for that resource.</p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <GlassField label="Total Memory (MiB)" htmlFor="alloc_mem_mib" hint="Cap on committed memory across all instances on this edge. 0 = inherit the live telemetry reported by ksedge.">
                <input
                  id="alloc_mem_mib"
                  type="number"
                  min="0"
                  value={form.alloc_mem_mib}
                  onChange={(e) => setForm({ ...form, alloc_mem_mib: e.target.value })}
                  placeholder="0"
                />
              </GlassField>
              <GlassField label="Memory Over-Allocation (%)" htmlFor="mem_overcommit_pct" hint="Allowed over-subscription vs the memory cap. e.g. 150 lets the panel deploy up to 1.5x the cap. 0 = strict.">
                <input
                  id="mem_overcommit_pct"
                  type="number"
                  min="0"
                  value={form.mem_overcommit_pct}
                  onChange={(e) => setForm({ ...form, mem_overcommit_pct: e.target.value })}
                  placeholder="0"
                />
              </GlassField>
              <GlassField label="Total Disk Space (MiB)" htmlFor="alloc_disk_mib" hint="Cap on disk footprint across all instances. 0 = inherit the live telemetry.">
                <input
                  id="alloc_disk_mib"
                  type="number"
                  min="0"
                  value={form.alloc_disk_mib}
                  onChange={(e) => setForm({ ...form, alloc_disk_mib: e.target.value })}
                  placeholder="0"
                />
              </GlassField>
              <GlassField label="Disk Over-Allocation (%)" htmlFor="disk_overcommit_pct" hint="Allowed over-subscription vs the disk cap. e.g. 150 = up to 1.5x the cap. 0 = strict.">
                <input
                  id="disk_overcommit_pct"
                  type="number"
                  min="0"
                  value={form.disk_overcommit_pct}
                  onChange={(e) => setForm({ ...form, disk_overcommit_pct: e.target.value })}
                  placeholder="0"
                />
              </GlassField>
            </div>
            <GlassField label="Daemon Instance File Directory" htmlFor="instances_dir" hint="Where the daemon keeps per-instance working files (logs, mounts, sockets). Forwarded to ksedge via config.json. Default /var/lib/kspanel/instances. Use ./instances for a path relative to the edge binary directory (./ = edge location).">
              <input
                id="instances_dir"
                value={form.instances_dir}
                onChange={(e) => setForm({ ...form, instances_dir: e.target.value })}
                placeholder="/var/lib/kspanel/instances"
              />
            </GlassField>
          </div>
          </>
          )}

          {tab === 'location' && (
          <>
          <div className="ks-card ks-form-card rounded-md space-y-3">
            <div>
              <p className="text-sm text-gray-200 font-medium">Categorisation & location</p>
              <p className="text-xs text-gray-500">
                Group this edge on the Nodes page so it sorts visually alongside its peers. Free-form values; leave blank for none.
              </p>
            </div>
            <div className="mb-3">
              <label htmlFor="category" className="block text-sm font-medium text-gray-200 mb-1">Category</label>
              <p className="text-xs text-gray-400 mb-2">Free-text bucket: "production", "staging", "dev", "tenant-acme", …</p>
              <div className="flex flex-wrap gap-2 mb-1.5">
                {['production', 'staging', 'dev', 'homelab'].map((c) => (
                  <button
                    type="button"
                    key={c}
                    onClick={() => setForm((f) => ({ ...f, category: c }))}
                    className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs border transition ${form.category.toLowerCase() === c ? 'border-white/30 bg-white/10 text-white' : 'border-white/10 bg-white/[0.02] text-gray-400 hover:bg-white/5'}`}
                  >
                    {c}
                  </button>
                ))}
              </div>
              <input
                id="category"
                value={form.category}
                onChange={(e) => setForm({ ...form, category: e.target.value })}
                placeholder="e.g. tenant-acme"
                autoComplete="off"
                className={glassFieldClass}
              />
            </div>
            {/* The site/node label now lives in the General tab under Name
                so it reads as node identity, not geography. */}
            <LocationField
              country={form.location_country}
              onCountryChange={(v) => setForm((f) => ({ ...f, location_country: v }))}
            />
          </div>
          </>
          )}

          {tab === 'general' && (
          <>
          <GlassField label="Notes" htmlFor="notes" hint="Free-text description shown on the node card. Use it to record region, owner, or a maintenance note.">
            <textarea
              id="notes"
              rows={3}
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              placeholder="e.g. Production edge in us-east-1, owned by infra team"
            />
          </GlassField>

          <div className="text-xs text-gray-500 font-mono">
            Panel will dial: <span className="text-gray-300">{dialPreview}</span>
          </div>
          </>
          )}

            {error && <p className="text-sm text-red-400">{error}</p>}
        </div>
      </div>
      {/* Phone tabs — bottom pill with the same `>` / `<` toggle + auto-off
          system as the actions pill (PageTabsPill). */}
      <PageTabsPill ariaLabel="Node form sections" spacer={false} activeLabel={NODEFORM_TABS.find((t) => t.id === tab)?.label}>
        {NODEFORM_TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => setTab(t.id)}
            className={`ks-tab shrink-0 flex-1 px-3 py-1.5 rounded text-sm text-center transition flex items-center justify-center gap-1.5 ${tab === t.id ? 'ks-tab-active' : ''}`}
          >
            <span className="inline-flex items-center shrink-0">{NODE_TAB_META[t.id].icon}</span>
            {t.label}
          </button>
        ))}
      </PageTabsPill>
      </FormPage>
      {/* Spacer — reserves scroll room so the fixed bottom pill never
          covers trailing form content. */}
      <div aria-hidden="true" className="h-24 lg:hidden" />

      {tokenInfo && (
        <GlassModal open={true} onClose={closeTokenModal} title={tokenInfo.title} maxWidth="max-w-2xl">
          {(tokenInfo.nodeProbe || probing) && (
            <div className={`mb-3 flex items-center gap-2 p-3 rounded-md border text-sm ${probing ? 'border-sky-700/40 bg-sky-900/20 text-sky-200' : tokenInfo.nodeProbe?.reachable === 'yes' ? (tokenInfo.nodeProbe?.name && tokenInfo.nodeProbe.name !== form.name ? 'border-amber-700/40 bg-amber-900/20 text-amber-200' : 'border-emerald-700/40 bg-emerald-900/20 text-emerald-200') : 'border-amber-700/40 bg-amber-900/20 text-amber-200'}`}>
              {probing ? (
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4 shrink-0 animate-spin"><path d="M21 12a9 9 0 1 1-6.219-8.56" /> </svg>
              ) : tokenInfo.nodeProbe?.reachable === 'yes' ? (
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4 shrink-0"><path d="M5 13l4 4L19 7" /> </svg>
              ) : (
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4 shrink-0"><circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" /> </svg>
              )}
              <span>
                {probing
                  ? 'Probing edge…'
                  : tokenInfo.nodeProbe?.reachable === 'yes'
                  ? (tokenInfo.nodeProbe?.name && tokenInfo.nodeProbe.name !== form.name
                      ? `Port already hosts a ksedge named "${tokenInfo.nodeProbe.name}" — port conflict!`
                      : 'Edge already answering on this port — it responded to our health probe.')
                  : tokenInfo.isLocalhost
                  ? 'Edge not reachable yet — that\'s expected, run the bootstrap command below and click Recheck on the Nodes page.'
                  : tokenInfo.isTunnel
                  ? `Tunnel not connected yet — ${tokenInfo.nodeProbe?.note || 'edge has not opened WSS tunnel to panel. Start ksedge with correct panel_url.'}`
                  : `Edge not reachable yet — ${tokenInfo.nodeProbe?.note || 'nothing answered on this address:port. Install ksedge and run ./ksedge launch.'}`}
              </span>
            </div>
          )}
          {!tokenInfo.isLocalhost && !tokenInfo.isTunnel && (
            <>
              <p className="text-sm text-gray-300">Copy this token now — you won't see it again.</p>
              <div className="flex items-center gap-2 mt-2">
                <code className="flex-1 bg-black border border-white/10 rounded-md px-3 py-2 text-sm text-white break-all">
                  {tokenInfo.token}
                </code>
                <button
                  onClick={() => copyText(tokenInfo.token)}
                  className="ks-primary-btn shrink-0 inline-flex items-center gap-2 bg-white text-black text-sm px-3 py-2 rounded hover:bg-gray-200"
                >
                  Copy
                </button>
              </div>
            </>
          )}

          {tokenInfo.isTunnel && !tokenInfo.isLocalhost && (
            <>
              <div className="flex items-center gap-3 p-3 bg-sky-900/20 border border-sky-700/40 rounded-md mb-3">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="w-5 h-5 text-sky-300 shrink-0">
                  <path d="M12 2a10 10 0 0 1 10 10M12 2a10 10 0 0 0-10 10M12 22a10 10 0 0 0 10-10M12 22a10 10 0 0 1-10-10" />
                  <path d="M8 12h8M12 8v8" />
                </svg>
                <p className="text-sm text-sky-200">
                  {tokenInfo.isDual
                    ? <>Dual-transport node registered. Edge needs <code>panel_url</code> + <code>token</code> (opens the WSS tunnel) AND the panel dials the address directly. Per-task WSS channels decide port vs WSS, with emergency fallback.</>
                    : <>Reverse tunnel node registered. Edge only needs <code>panel_url</code> + <code>token</code>. It will dial <code>wss://panel/api/edge/tunnel</code> and tunnel all RPCs. No address to store on panel.</>}
                </p>
              </div>
              <div className="mt-3">
                <p className="text-sm text-gray-300 mb-1">{tokenInfo.isDual ? 'Config JSON for ksedge (port + WSS tunnel):' : 'Config JSON for ksedge (WSS tunnel):'}</p>
                <pre className="bg-black border border-white/10 rounded-md px-3 py-2 text-xs text-gray-200 overflow-x-auto max-h-60">
                  {tokenInfo.configJson}
                </pre>
              </div>
            </>
          )}

          {tokenInfo.isLocalhost && (
            <>
              <div className="flex items-center gap-3 p-3 bg-emerald-900/20 border border-emerald-700/40 rounded-md mb-3">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="w-5 h-5 text-emerald-300 shrink-0">
                  <path d="M5 13l4 4L19 7" />
                 </svg>
                <p className="text-sm text-emerald-200">
                  Node registered. Run the bootstrap command below once — it writes into <code>{form.install_dir.trim() || './localnode/ksedge'}</code>, downloads ksedge from GitHub (ks-panel-edge), writes the config and starts the edge.
                </p>
              </div>
              <div className="flex items-center justify-between gap-2 mb-3">
                <p className="text-sm text-gray-300">Bootstrap command</p>
                <div className="flex gap-2">
                  <button
                    onClick={() => copyText(tokenInfo.bootstrapCmd || '')}
                    className="ks-primary-btn inline-flex items-center gap-1.5 bg-white text-black text-xs px-2.5 py-1.5 rounded hover:bg-gray-200"
                  >
                    Copy
                  </button>
                  <a
                    href={KSEDGE_URL}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1.5 border border-white/10 text-gray-200 text-xs px-2.5 py-1.5 rounded hover:bg-white/10"
                  >
                    Direct download
                  </a>
                </div>
              </div>
              <pre className="bg-black border border-white/10 rounded-md px-3 py-2 text-xs text-gray-200 overflow-x-auto max-h-60 overflow-y-auto">
{tokenInfo.bootstrapCmd}
              </pre>
              {tokenInfo.configJson && (
                <div className="mt-3">
                  <p className="text-sm text-gray-300 mb-1">Config JSON (also via WSS tunnel if local_wss / local_both):</p>
                  <pre className="bg-black border border-white/10 rounded-md px-3 py-2 text-xs text-gray-200 overflow-x-auto max-h-60">
                    {tokenInfo.configJson}
                  </pre>
                </div>
              )}
            </>
          )}

          {tokenInfo.configJson && !tokenInfo.isLocalhost && !tokenInfo.isTunnel && (
            <div className="mt-3">
              <p className="text-sm text-gray-300 mb-1">Config JSON for ksedge:</p>
              <pre className="bg-black border border-white/10 rounded-md px-3 py-2 text-xs text-gray-200 overflow-x-auto max-h-60">
                {tokenInfo.configJson}
              </pre>
            </div>
          )}
        </GlassModal>
      )}

      {setupInfo && (
        <GlassModal
          open={true}
          onClose={() => { setSetupInfo(null); if (setupInfo.done) navigate('/nodes'); }}
          title={setupInfo.running ? 'Setting up local edge…' : setupInfo.error ? 'Setup failed' : 'Local edge ready'}
          maxWidth="max-w-2xl"
        >
          {setupInfo.running && (
            <div className="mb-3 flex items-center gap-2 text-sm text-sky-200">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4 shrink-0 animate-spin"><path d="M21 12a9 9 0 1 1-6.219-8.56" /> </svg>
              Installing and launching ksedge on this host…
            </div>
          )}

          {!setupInfo.running && setupInfo.error && (
            <div className="mb-3 flex items-center gap-2 p-3 rounded-md border border-red-700/40 bg-red-900/20 text-red-200 text-sm">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4 shrink-0"><circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" /> </svg>
              <span className="break-all">{setupInfo.error}</span>
            </div>
          )}

          {!setupInfo.running && !setupInfo.error && setupInfo.probe?.reachable === 'yes' && (
            <div className="mb-3 flex items-center gap-2 p-3 rounded-md border border-emerald-700/40 bg-emerald-900/20 text-emerald-200 text-sm">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4 shrink-0"><path d="M5 13l4 4L19 7" /> </svg>
              Edge answered the probe — it's up and running on 127.0.0.1:{form.port}.
            </div>
          )}

          {!setupInfo.running && !setupInfo.error && setupInfo.probe && setupInfo.probe.reachable !== 'yes' && (
            <div className="mb-3 flex items-center gap-2 p-3 rounded-md border border-amber-700/40 bg-amber-900/20 text-amber-200 text-sm">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4 shrink-0"><circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" /> </svg>
              ksedge was launched but didn't answer yet — {setupInfo.probe.note || 'try Recheck on the Nodes page in a moment'}.
            </div>
          )}

          <div className="mt-2">
            <p className="text-sm text-gray-300 mb-1">Setup log</p>
            <pre className="bg-black border border-white/10 rounded-md px-3 py-2 text-xs text-gray-200 overflow-x-auto max-h-60 overflow-y-auto whitespace-pre-wrap">
{setupInfo.log}
            </pre>
          </div>

          {setupInfo.done && (
            <div className="flex justify-end gap-2 mt-4">
              <button
                onClick={() => { setSetupInfo(null); navigate('/nodes'); }}
                className="ks-primary-btn inline-flex items-center gap-2 bg-white text-black text-sm px-3 py-1.5 rounded hover:bg-gray-200"
              >
                Go to Nodes
              </button>
            </div>
          )}
        </GlassModal>
      )}
    </>
  );
};

export default NodeForm;
