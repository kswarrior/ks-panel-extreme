import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { createNode, updateNode, listNodes, probeNode, setupLocalNode } from '@/shared/api/admin';
import type { Node, CreateNodeResult, ProbeResult, SetupLocalResult } from '@/shared/types/node';
import FormPage from '@/shared/components/forms/FormPage';
import GlassField, { glassFieldClass } from '@/shared/components/ui/Field';
import GlassModal from '@/shared/components/ui/Modal';
import LocationField from '@/shared/components/forms/LocationField/LocationField';
import type { Form, NodeFormTabId } from '../types/nodeForm';
import { emptyForm, KSEDGE_URL, ALL_KINDS, NODEFORM_TABS } from '../types/nodeForm';
import { buildEdgeConfig, buildBootstrapCmd } from '../utils/nodeFormUtils';

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

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        if (editing) {
          const nodes = await listNodes();
          const n = nodes.find((x) => x.id === Number(id));
          if (n) {
            const isLocal =
              n.address.startsWith('127.0.0.1:') || n.address.startsWith('localhost:');
            const port = isLocal ? n.address.split(':').pop() || '4040' : '';
            setForm({
              name: n.name,
              is_localhost: isLocal,
              port: port || '4040',
              address: isLocal ? '' : n.address,
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
              instances_dir: n.instances_dir || './instances',
              category: n.category || '',
              location_country: n.location_country || '',
              location_node: n.location_node || '',
            });
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
    if (form.is_localhost) return `127.0.0.1:${form.port || '4040'}`;
    return form.address.trim();
  }, [form.is_localhost, form.port, form.address]);

  const dialPreview = useMemo(() => {
    const scheme = form.use_tls ? 'https' : 'http';
    if (form.is_localhost) return `${scheme}://${effectiveAddress}`;
    const bareHost = !form.address.includes(':') && form.address.trim() !== '';
    return `${scheme}://${effectiveAddress}${bareHost ? '  (default port)' : ''}`;
  }, [form.is_localhost, form.address, effectiveAddress, form.use_tls]);

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
    health_enabled: form.health_enabled,
    health_interval: Math.max(1, parseInt(form.health_interval, 10) || 60),
    health_timeout: Math.max(1, parseInt(form.health_timeout, 10) || 4),
    health_retries: Math.max(1, parseInt(form.health_retries, 10) || 3),
    skip_tls_verify: form.skip_tls_verify,
    notes: form.notes.trim(),
    install_dir: form.is_localhost ? form.install_dir.trim() : '',
    allowed_kinds: form.allowed_kinds.trim(),
    alloc_mem_mib: Math.max(0, parseInt(form.alloc_mem_mib, 10) || 0),
    mem_overcommit_pct: Math.max(0, parseInt(form.mem_overcommit_pct, 10) || 0),
    alloc_disk_mib: Math.max(0, parseInt(form.alloc_disk_mib, 10) || 0),
    disk_overcommit_pct: Math.max(0, parseInt(form.disk_overcommit_pct, 10) || 0),
    instances_dir: form.instances_dir.trim(),
    category: form.category.trim(),
    location_country: form.location_country.trim().toUpperCase(),
    location_node: form.location_node.trim(),
  });

  const submitAndSetup = async () => {
    if (!form.name.trim()) {
      setError('Name is required');
      return;
    }
    if (!form.is_localhost) {
      setError('Create & setup is only available for localhost nodes');
      return;
    }
    if (!form.port.trim()) {
      setError('Port is required for a localhost node');
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
        setSetupInfo({
          running: false,
          done: true,
          log: 'Setup failed.',
          error: typeof e?.response?.data === 'string' ? e.response.data : JSON.stringify(e?.response?.data || e?.message || 'setup failed'),
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

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) {
      setError('Name is required');
      return;
    }
    if (!form.is_localhost && !form.address.trim()) {
      setError('Address is required for remote nodes');
      return;
    }
    if (form.is_localhost && !form.port.trim()) {
      setError('Port is required for a localhost node');
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
        const res: CreateNodeResult = await createNode({
          name: form.name,
          address: effectiveAddress,
          use_tls: form.use_tls,
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
        setTokenInfo({
          token: res.token,
          title: form.is_localhost
            ? 'Local node provisioned — bootstrap command below'
            : 'Node token (copy now)',
          configJson: buildEdgeConfig(
            form.name,
            form.use_tls,
            res.token,
            form.port,
            form
          ),
          bootstrapCmd: form.is_localhost
            ? buildBootstrapCmd(form, res.token, form.port)
            : undefined,
          isLocalhost: form.is_localhost,
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
        saving={false}
        submitLabel="Save"
      >
        <p className="text-white/60 text-sm">Loading…</p>
      </FormPage>
    );
  }

  return (
    <>
      <FormPage
        crumbs={[{ label: 'Nodes', to: '/nodes' }, { label: editing ? 'Edit Node' : 'New Node' }]}
        saving={saving}
        submitLabel={editing ? 'Save' : 'Create'}
        onSubmit={submit}
        secondaryActions={!editing && form.is_localhost ? (
          <button
            type="button"
            onClick={submitAndSetup}
            disabled={saving}
            title="Register this localhost node and automatically install + launch ksedge on this host"
            className="inline-flex items-center gap-2 bg-emerald-600 text-white px-4 py-2 text-sm rounded hover:bg-emerald-500 disabled:opacity-60 transition-colors"
          >
            {settingUp ? (
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4 animate-spin"><path d="M21 12a9 9 0 1 1-6.219-8.56" /> </svg>
            ) : (
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4"><path d="M5 3v4M3 5h4M6 17v4M4 19h4M13 3l2.5 5.5L21 11l-5.5 2.5L13 19l-2.5-5.5L5 11l5.5-2.5L13 3z" /> </svg>
            )}
            Create & setup
          </button>
        ) : undefined}
      >
        <div className="space-y-4">
          <div className="inline-flex flex-wrap gap-1 rounded-lg bg-neutral-900/60 border border-white/10 p-1">
            {NODEFORM_TABS.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setTab(t.id)}
                className={`ks-tab transition-colors ${tab === t.id ? 'ks-tab-active' : ''}`}
              >
                {t.label}
              </button>
            ))}
          </div>

          {tab === 'general' && (
          <>
          <div className="flex items-center justify-between gap-3 p-3 border border-white/10 rounded-md bg-black/20">
            <div className="min-w-0">
              <p className="text-sm text-gray-200 font-medium">Localhost edge</p>
              <p className="text-xs text-gray-500">
                On: run ksedge on this panel host (auto <code>127.0.0.1:&#123;port&#125;</code>). Download from HuggingFace.
                Off: connect to a remote edge host.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setForm((f) => ({ ...f, is_localhost: !f.is_localhost }))}
              className={`relative w-11 h-6 rounded-full transition shrink-0 ${form.is_localhost ? 'bg-emerald-600' : 'bg-neutral-700'}`}
              aria-pressed={form.is_localhost}
              aria-label="Toggle localhost mode"
            >
              <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full transition ${form.is_localhost ? 'translate-x-5' : ''}`} />
            </button>
          </div>

          <GlassField label="Name" htmlFor="name">
            <input
              id="name"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder={form.is_localhost ? 'local-edge' : 'us-east-edge'}
              required
            />
          </GlassField>

          {form.is_localhost ? (
            <GlassField
              label="Edge listen port"
              htmlFor="port"
              hint="ksedge will listen on 127.0.0.1:<port>. The panel dials this address."
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
          ) : (
            <>
              <GlassField
                label="Address"
                htmlFor="address"
                hint="Anything the panel can dial: host:port (edge.example.com:4040 / 57.6.8.1:3853) OR a bare hostname (ftdeycef.com — useful for Cloudflare tunnels; the scheme default port is used). No http(s):// prefix."
              >
                <input
                  id="address"
                  value={form.address}
                  onChange={(e) => setForm({ ...form, address: e.target.value })}
                  placeholder="edge.example.com:4040 or ftdeycef.com"
                  required
                />
              </GlassField>
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={form.use_tls}
                  onChange={(e) => setForm({ ...form, use_tls: e.target.checked })}
                  className="h-4 w-4 rounded border-white/10 bg-black/30 focus:ring-white"
                />
                <span className="text-sm text-gray-300">Use TLS (HTTPS)</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={form.skip_tls_verify}
                  onChange={(e) => setForm({ ...form, skip_tls_verify: e.target.checked })}
                  className="h-4 w-4 rounded border-white/10 bg-black/30 focus:ring-white"
                />
                <span className="text-sm text-gray-300">Skip TLS certificate verification (self-signed edge)</span>
              </label>
            </>
          )}

          {form.is_localhost && (
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
          </>
          )}

          {tab === 'health' && (
          <>
          <div className="rounded-md border border-white/10 bg-black/20 p-3 space-y-3">
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
          <div className="rounded-md border border-white/10 bg-black/20 p-3 space-y-2">
            <div>
              <p className="text-sm text-gray-200 font-medium">Allowed instance kinds</p>
              <p className="text-xs text-gray-500">When chosen, the panel refuses to deploy any template kind not on this list to the edge. Leave all unchecked for no restriction.</p>
            </div>
            <div className="flex flex-wrap gap-2 pt-1">
              {ALL_KINDS.map((k) => {
                const on = allowedKindsSet.has(k.key);
                return (
                  <button
                    type="button"
                    key={k.key}
                    onClick={() => toggleKind(k.key)}
                    className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm border transition ${on ? 'border-white/30 bg-white/10 text-white' : 'border-white/10 bg-white/[0.02] text-gray-400 hover:bg-white/5'}`}
                  >
                    <span
                      className="w-2.5 h-2.5 rounded-full"
                      style={{ backgroundColor: on ? k.color : '#4b5563' }}
                    />
                    {k.label}
                    {on && (
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" className="w-3.5 h-3.5"><path d="M5 13l4 4L19 7" /> </svg>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="rounded-md border border-white/10 bg-black/20 p-3 space-y-3">
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
            <GlassField label="Daemon Instance File Directory" htmlFor="instances_dir" hint="Where the daemon keeps per-instance working files (logs, mounts, sockets). Forwarded to ksedge via config.json. Default ./instances.">
              <input
                id="instances_dir"
                value={form.instances_dir}
                onChange={(e) => setForm({ ...form, instances_dir: e.target.value })}
                placeholder="./instances"
              />
            </GlassField>
          </div>
          </>
          )}

          {tab === 'location' && (
          <>
          <div className="rounded-md border border-white/10 bg-black/20 p-3 space-y-3">
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
            <LocationField
              country={form.location_country}
              onCountryChange={(v) => setForm((f) => ({ ...f, location_country: v }))}
              node={form.location_node}
              onNodeChange={(v) => setForm((f) => ({ ...f, location_node: v }))}
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
      </FormPage>

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
                  : `Edge not reachable yet — ${tokenInfo.nodeProbe?.note || 'nothing answered on this address:port. Install ksedge and run ./ksedge launch.'}`}
              </span>
            </div>
          )}
          {!tokenInfo.isLocalhost && (
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

          {tokenInfo.isLocalhost && (
            <>
              <div className="flex items-center gap-3 p-3 bg-emerald-900/20 border border-emerald-700/40 rounded-md mb-3">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="w-5 h-5 text-emerald-300 shrink-0">
                  <path d="M5 13l4 4L19 7" />
                 </svg>
                <p className="text-sm text-emerald-200">
                  Node registered. Run the bootstrap command below once — it writes into <code>{form.install_dir.trim() || './localnode/ksedge'}</code>, downloads ksedge from HuggingFace, writes the config and starts the edge.
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
            </>
          )}

          {tokenInfo.configJson && !tokenInfo.isLocalhost && (
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
              <svg xmlns="http://www.w3.org/2000.svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4 shrink-0"><circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" /> </svg>
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