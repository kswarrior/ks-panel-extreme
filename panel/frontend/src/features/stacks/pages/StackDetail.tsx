import React, { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import GlassCard from '@/shared/components/ui/Card';
import ErrorState from '@/shared/components/ui/ErrorState';
import GlassModal from '@/shared/components/ui/Modal';
import CardMenu from '@/shared/components/ui/CardMenu/CardMenu';
import { PageActionsPill } from '@/shared/components/ui/PageActionsPill';
import { CardIconTile } from '@/shared/components/ui/IconColorPicker';
import IconColorPicker from '@/shared/components/ui/IconColorPicker';
import {
  getStack,
  activateStack,
  deactivateStack,
  startStackOp,
  getStackOp,
  stopStackOp,
  deleteStack,
  updateStack,
  stackAppUrl,
  rotateStackToken,
  probeStack,
  getStackPairing,
  extractStackApiError,
} from '@/features/stacks/api/stacks';
import type { StackOpJob, StackOpName } from '@/features/stacks/api/stacks';
import type { StackPairing, StackProbeResult } from '@/shared/types/stack';
import { Stack, stackSourceMeta, STACK_CATEGORIES } from '@/shared/types/stack';
import StackOpModal from '@/features/stacks/components/StackOpModal';
import { useConfirm } from '@/shared/stores/confirmStore';

function formatDate(iso: string): string {
  if (!iso) return '—';
  const d = new Date(iso);
  // Go zero time (0001-01-01) is a valid Date with year 1 — treat as missing.
  if (isNaN(d.getTime()) || d.getFullYear() <= 1) return '—';
  return d.toLocaleString();
}

function relativeTime(iso: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime()) || d.getFullYear() <= 1) return '';
  const diff = Date.now() - d.getTime();
  const s = Math.floor(diff / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const days = Math.floor(h / 24);
  if (days < 30) return `${days}d ago`;
  return `${Math.floor(days / 30)}mo ago`;
}

// manifestObj reads the stack's stored manifest (raw pass-through JSON the
// Studio form wrote: location, install/launch workflows, tokens, panel
// permissions). Tolerates stringified payloads from hand-posted manifests.
function manifestObj(s: Stack): Record<string, any> {
  const m = s.manifest as any;
  if (!m) return {};
  if (typeof m === 'string') {
    try { return JSON.parse(m) as Record<string, any>; } catch { return {}; }
  }
  return m as Record<string, any>;
}

function stepLabel(s: any, i: number): string {
  if (!s || typeof s !== 'object') return `step ${i + 1}`;
  return s.action || s.command || s.url || s.path || (typeof s.content === 'string' && s.content.slice(0, 30)) || `step ${i + 1}`;
}

// StackDetail — one stack, laid out like the template detail page: themed
// header + stat grid, info sections (location / workflows / permissions),
// the proxy + pairing editors.
const StackDetail: React.FC = () => {
  const { id = '' } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const confirm = useConfirm();
  const [stack, setStack] = useState<Stack | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [toggling, setToggling] = useState(false);
  const [notice, setNotice] = useState('');
  // Operation console: the running/finished job + modal visibility. Closing
  // the modal only hides it — polling continues until the job terminates.
  const [opJob, setOpJob] = useState<StackOpJob | null>(null);
  const [opOpen, setOpOpen] = useState(false);
  const [opStopping, setOpStopping] = useState(false);
  const opBusy = opJob?.status === 'running';
  const [copied, setCopied] = useState('');
  // App proxy (externally-run Go app): two independent servings of the
  // same app — floated at /<root> behind the panel session, and/or on a
  // dedicated panel-opened port rendered at /. The toggles below derive
  // from the inputs (root set = path on, port set = port on); switching a
  // toggle off persists cleared settings for that mode immediately.
  const [proxyPort, setProxyPort] = useState('');
  const [proxyRoot, setProxyRoot] = useState('');
  const [proxySaving, setProxySaving] = useState(false);
  // Node-style remote pairing: the app may run on another host (address
  // set) or the same host (empty = loopback via the proxy port above).
  const [remoteAddress, setRemoteAddress] = useState('');
  const [remoteUseTls, setRemoteUseTls] = useState(false);
  const [remoteSkipVerify, setRemoteSkipVerify] = useState(false);
  // Dedicated serve port (panel-opened, renders the app at /).
  const [servePort, setServePort] = useState('');
  const [serveAuth, setServeAuth] = useState(true);
  const [serveSaving, setServeSaving] = useState(false);
  // Pairing snippet + Verify verdict (fetched on demand; the token is
  // shown only here and never stored client-side).
  const [pairing, setPairing] = useState<StackPairing | null>(null);
  const [pairingOpen, setPairingOpen] = useState(false);
  const [pairingLoading, setPairingLoading] = useState(false);
  const [rotating, setRotating] = useState(false);
  const [probing, setProbing] = useState(false);
  const [probeResult, setProbeResult] = useState<StackProbeResult | null>(null);
  // Edit modal (name/version/category/description + icon/colour theme).
  const [editOpen, setEditOpen] = useState(false);
  const [editName, setEditName] = useState('');
  const [editVersion, setEditVersion] = useState('');
  const [editCategory, setEditCategory] = useState('dashboard');
  const [editDesc, setEditDesc] = useState('');
  const [editIcon, setEditIcon] = useState('');
  const [editColor, setEditColor] = useState('');
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const s = await getStack(Number(id));
      setStack(s);
      setProxyPort(s.proxy_port ? String(s.proxy_port) : '');
      setProxyRoot(s.proxy_root_url || '');
      setRemoteAddress(s.remote_address || '');
      setRemoteUseTls(!!s.remote_use_tls);
      setRemoteSkipVerify(!!s.remote_skip_verify);
      setServePort(s.serve_port ? String(s.serve_port) : '');
      setServeAuth(s.serve_auth !== false);
      setPairing(null);
      setPairingOpen(false);
      setProbeResult(null);
    } catch (e) {
      setError(extractStackApiError(e, 'Failed to load stack.'));
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  // Poll a running operation job; on terminal state reload the stack and
  // surface the outcome. Keeps running while the console is dismissed.
  const opJobId = opJob?.job_id;
  const opRunning = opJob?.status === 'running';
  useEffect(() => {
    if (!opJobId || !opRunning || !opJob) return;
    let cancelled = false;
    const op = opJob.op;
    const finishDoneMessage =
      op === 'launch'
        ? `Launched.`
        : op === 'install'
          ? `Installed — package rebuilt from manifest.`
          : `Reinstalled — approve the pending grants, then launch.`;
    const t = window.setInterval(async () => {
      try {
        const fresh = await getStackOp(opJob.stack_id, opJobId);
        if (cancelled) return;
        setOpJob(fresh);
        if (fresh.status !== 'running') {
          await load();
          if (cancelled) return;
          if (fresh.status === 'done') flashNotice(finishDoneMessage);
          else if (fresh.status === 'cancelled') flashNotice(`${op} stopped — partial effects stand.`);
          else {
            setError(fresh.error || `${op} failed.`);
          }
        }
      } catch {
        if (cancelled) return;
        // Job vanished (e.g. panel restarted and dropped the registry).
        setOpJob((prev) => (prev && prev.status === 'running' ? { ...prev, status: 'error' as const, error: 'Lost track of the job.' } : prev));
      }
    }, 600);
    return () => { cancelled = true; window.clearInterval(t); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opJobId, opRunning, load]);

  const back = () => navigate('/stacks');

  const copy = async (text: string, key: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(key);
      setTimeout(() => setCopied(''), 1500);
    } catch {}
  };

  if (loading) {
    return (
      <div className="space-y-4 animate-pulse">
        <div className="h-8 w-40 bg-white/5 rounded" />
        <div className="h-40 bg-white/5 rounded-xl" />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[1, 2, 3, 4].map((i) => <div key={i} className="h-20 bg-white/5 rounded-xl" />)}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <button onClick={back} className="ks-btn-header ks-icon-btn" aria-label="Back to Stacks list">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-5 h-5"><polyline points="15 18 9 12 15 6" /></svg>
          </button>
          <h2 className="text-xl font-semibold text-white">Stack Detail</h2>
        </div>
        <ErrorState
          variant="error"
          title="Failed to load stack"
          description={error}
          retryLabel="Retry"
          onRetry={() => void load()}
          backLabel="Back"
          onBack={back}
        />
      </div>
    );
  }

  if (!stack) {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <button onClick={back} className="ks-btn-header ks-icon-btn" aria-label="Back">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-5 h-5"><polyline points="15 18 9 12 15 6" /></svg>
          </button>
          <h2 className="text-xl font-semibold text-white">Stack Detail</h2>
        </div>
        <ErrorState
          variant="not-found"
          title="Stack not found"
          backLabel="Back to stacks"
          onBack={back}
        />
      </div>
    );
  }

  const m = manifestObj(stack);
  const src = stackSourceMeta(stack.source);
  const locationType: string = m.locationType || 'host';
  const installType: string = m.installType || 'docker';
  const installImage: string = String(m.installImage || m.image || '');
  const installSteps: any[] = Array.isArray(m.installSteps) ? m.installSteps : Array.isArray(m.install) ? m.install : [];
  const launchSteps: any[] = Array.isArray(m.launchSteps) ? m.launchSteps : Array.isArray(m.launch) ? m.launch : [];
  const launchTokens: any[] = Array.isArray(m.launchTokens) ? m.launchTokens : [];
  const panelPermissions: string[] = Array.isArray(m.panelPermissions) ? m.panelPermissions : [];
  const remoteProtocol: string = m.remoteProtocol || 'wss';
  const remoteHost: string = String(m.remoteHost || '');
  const remotePort: string = String(m.remotePort || '');
  const remoteUrl: string = String(m.remoteUrl || '');
  const prettyManifest = (() => {
    try { return JSON.stringify(m, null, 2); } catch { return '{}'; }
  })();

  const locationSummary = locationType === 'outside'
    ? remoteProtocol === 'wss'
      ? `${remoteHost || '—'}${remotePort ? `:${remotePort}` : ''}`
      : (remoteUrl || '—')
    : installType === 'docker'
      ? (installImage || stack.runtime || 'docker')
      : `${stack.runtime || 'host'}${stack.entrypoint ? ` · ${stack.entrypoint}` : ''}`;

  const flashNotice = (msg: string) => {
    setNotice(msg);
    window.setTimeout(() => setNotice((cur) => (cur === msg ? '' : cur)), 6000);
  };

  const toggle = async () => {
    setToggling(true);
    try {
      if (stack.active) {
        await deactivateStack(stack.id);
      } else {
        const res = await activateStack(stack.id) as any;
        if (res?.pending) {
          setError(res.message || `${res.pending} grants still pending`);
          return;
        }
      }
      await load();
    } catch (e) {
      setError(extractStackApiError(e, 'Toggle failed.'));
    } finally {
      setToggling(false);
    }
  };

  // startOp launches an install/launch/reinstall job and opens the
  // operation console. A 409 means one is already running — attach to it.
  const startOp = async (op: StackOpName) => {
    if (!stack) return;
    if (opJob && opJob.status === 'running') {
      setOpOpen(true);
      return;
    }
    setError('');
    try {
      const job = await startStackOp(stack.id, op);
      setOpJob(job);
      setOpOpen(true);
    } catch (e: any) {
      const data = e?.response?.data;
      if (e?.response?.status === 409 && data?.job) {
        setOpJob(data.job as StackOpJob);
        setOpOpen(true);
        flashNotice('An operation is already running — attached to it.');
        return;
      }
      setError(extractStackApiError(e, `Failed to start ${op}.`));
    }
  };

  const stopOp = async () => {
    if (!opJob || !stack) return;
    setOpStopping(true);
    try {
      const updated = await stopStackOp(stack.id, opJob.job_id);
      setOpJob(updated);
    } catch (e) {
      setError(extractStackApiError(e, 'Failed to stop operation.'));
    } finally {
      setOpStopping(false);
    }
  };

  const launch = () => {
    if (!stack || stack.active) return;
    void startOp('launch');
  };

  // Install re-materializes the package + data dir from the stored
  // manifest. Non-destructive: grants and active state are kept.
  const doInstall = () => {
    void startOp('install');
  };

  // Reinstall resets to a fresh install: deactivates, resets every grant
  // to pending, rebuilds the package. Files and data are kept.
  const doReinstall = async () => {
    if (!stack) return;
    const ok = await confirm({
      title: `Reinstall ${stack.name}?`,
      message: 'Deactivates the stack, resets all capability grants to pending, and rebuilds the package. Files and data are kept.',
      confirmLabel: 'Reinstall',
      tone: 'warning',
    });
    if (!ok) return;
    void startOp('reinstall');
  };

  // Connection overlay the backend overwrites as a whole: every save
  // sends both servings (path mount + dedicated port), so editing one
  // never silently clears the other.
  const connectionFields = () => ({
    proxyPort: proxyPort.trim() === '' ? 0 : Number(proxyPort),
    proxyRootUrl: proxyRoot.trim().toLowerCase(),
    remoteAddress: remoteAddress.trim(),
    remoteUseTls: remoteUseTls,
    remoteSkipVerify: remoteSkipVerify,
    servePort: servePort.trim() === '' ? 0 : Number(servePort),
    serveAuth: serveAuth,
  });

  const syncConnection = (s: Stack) => {
    setStack(s);
    setProxyPort(s.proxy_port ? String(s.proxy_port) : '');
    setProxyRoot(s.proxy_root_url || '');
    setRemoteAddress(s.remote_address || '');
    setRemoteUseTls(!!s.remote_use_tls);
    setRemoteSkipVerify(!!s.remote_skip_verify);
    setServePort(s.serve_port ? String(s.serve_port) : '');
    setServeAuth(s.serve_auth !== false);
  };

  const persistConnection = async (patch: Partial<ReturnType<typeof connectionFields>>, action: string) => {
    if (!stack) return;
    try {
      const s = await updateStack(stack.id, {
        name: stack.name,
        category: stack.category,
        version: stack.version,
        description: stack.description || '',
        icon: stack.icon || '',
        color: stack.color || '',
        spec: stack.spec || {},
        ...connectionFields(),
        ...patch,
      });
      syncConnection(s);
      if (action === 'serve') {
        flashNotice(!s.serve_port ? 'Serve port off.' : s.serve_listening ? `Serving on :${s.serve_port}/.` : 'Port saved but not listening (bind failed — panel log has the reason).');
      } else {
        flashNotice(action);
      }
    } catch (e) {
      setError(extractStackApiError(e, 'Failed to save connection.'));
    }
  };

  // Toggle state derives from the inputs: a root segment means the path
  // mount is on, a port number means the dedicated port is on.
  const pathOn = proxyRoot.trim() !== '';
  const portOn = servePort.trim() !== '' && servePort.trim() !== '0';

  const togglePath = async (on: boolean) => {
    if (!stack) return;
    if (on) {
      // Reveal the options with a sensible default root; nothing is
      // saved until Save connection.
      if (!proxyRoot.trim() && stack.slug) setProxyRoot(stack.slug);
      return;
    }
    // Off clears the mount now. The loopback port / remote address stay
    // only as the serve port's upstream feed; with the port off too the
    // whole dial config is wiped.
    const keepUpstream = portOn;
    setProxySaving(true);
    setError('');
    try {
      await persistConnection({
        proxyRootUrl: '',
        proxyPort: keepUpstream ? connectionFields().proxyPort : 0,
        remoteAddress: keepUpstream ? connectionFields().remoteAddress : '',
      }, 'Path mount off — settings cleared.');
    } finally {
      setProxySaving(false);
    }
  };

  const toggleServe = async (on: boolean) => {
    if (!stack) return;
    if (on) {
      // Reveal the options with the conventional default port and the
      // login gate on (fail closed); nothing binds until Save port.
      if (!servePort.trim() || servePort.trim() === '0') setServePort('6901');
      setServeAuth(true);
      return;
    }
    // Off stops the listener now (serveAuth resets to the fail-closed
    // default); the path mount is untouched.
    setServeSaving(true);
    setError('');
    try {
      await persistConnection({ servePort: 0, serveAuth: true }, 'serve');
    } finally {
      setServeSaving(false);
    }
  };

  const saveProxy = async () => {
    if (!stack) return;
    const port = proxyPort.trim() === '' ? 0 : Number(proxyPort);
    if (!Number.isInteger(port) || port < 0 || port > 65535) {
      setError('Proxy port must be empty (off) or 1-65535.');
      return;
    }
    const root = proxyRoot.trim().toLowerCase();
    if (root && !/^[a-z0-9][a-z0-9-]{0,31}$/.test(root)) {
      setError('Proxy root URL must be lowercase letters, digits and hyphens (max 32).');
      return;
    }
    const addr = remoteAddress.trim();
    if (addr) {
      if (/\s/.test(addr) || /^https?:\/\//i.test(addr)) {
        setError('Remote address must be host:port or bare host, without a scheme or spaces.');
        return;
      }
      if (!root && !portOn) {
        setError('A remote stack needs a proxy root URL to float at /<root>/ (or a serve port to feed).');
        return;
      }
    } else if ((root && port === 0) || (!root && port !== 0 && !portOn)) {
      setError('Proxy port and root URL must be set together (or both empty to disable).');
      return;
    }
    setProxySaving(true);
    setError('');
    try {
      await persistConnection({ proxyPort: port, proxyRootUrl: root, remoteAddress: addr }, 'Connection saved.');
    } finally {
      setProxySaving(false);
    }
  };

  const saveServe = async () => {
    if (!stack) return;
    const port = servePort.trim() === '' ? 0 : Number(servePort);
    if (!Number.isInteger(port) || port < 1 || port > 65535) {
      setError('Serve port must be 1-65535.');
      return;
    }
    const hasUpstream = (proxyPort.trim() !== '' && proxyPort.trim() !== '0') || remoteAddress.trim() !== '';
    if (!hasUpstream) {
      setError('Serve port needs an app to serve: set a loopback port or a remote address first.');
      return;
    }
    setServeSaving(true);
    setError('');
    try {
      await persistConnection({ servePort: port, serveAuth: serveAuth }, 'serve');
    } finally {
      setServeSaving(false);
    }
  };

  // Verify actively dials the stack app's /health (node-style probe).
  const verify = async () => {
    if (!stack) return;
    setProbing(true);
    setError('');
    try {
      const res = await probeStack(stack.id);
      setProbeResult(res);
      flashNotice(res.reachable === 'yes' ? 'Stack app is reachable.' : `Stack app unreachable${res.note ? ` — ${res.note}` : ''}.`);
    } catch (e) {
      setError(extractStackApiError(e, 'Verify failed.'));
    } finally {
      setProbing(false);
    }
  };

  // ShowPairing fetches the app config snippet (panel_url + token + slug).
  // The token is displayed only here and never stored client-side.
  const showPairing = async () => {
    if (!stack) return;
    setPairingLoading(true);
    setError('');
    try {
      const p = await getStackPairing(stack.id);
      setPairing(p);
      setPairingOpen(true);
    } catch (e) {
      setError(extractStackApiError(e, 'Failed to load pairing snippet.'));
    } finally {
      setPairingLoading(false);
    }
  };

  // Rotate reissues the pairing token (the old one stops working at once)
  // and opens the snippet so the operator can paste the new token.
  const rotate = async () => {
    if (!stack) return;
    const ok = await confirm({
      title: `Rotate pairing token?`,
      message: 'The current token stops working immediately. The stack app must be updated with the new token.',
      confirmLabel: 'Rotate',
      tone: 'warning',
    });
    if (!ok) return;
    setRotating(true);
    setError('');
    try {
      await rotateStackToken(stack.id);
      await load();
      await showPairing();
      flashNotice('New pairing token issued — update the stack app config.');
    } catch (e) {
      setError(extractStackApiError(e, 'Failed to rotate token.'));
    } finally {
      setRotating(false);
    }
  };

  const openEdit = () => {
    if (!stack) return;
    setEditName(stack.name);
    setEditVersion(stack.version);
    setEditCategory(stack.category || 'dashboard');
    setEditDesc(stack.description || '');
    setEditIcon(stack.icon || '');
    setEditColor(stack.color || '');
    setEditError('');
    setEditOpen(true);
  };

  const saveEdit = async () => {
    if (!stack) return;
    if (!editName.trim()) { setEditError('Name is required.'); return; }
    setEditSaving(true);
    setEditError('');
    try {
      // Forward the current connection fields: the backend overwrites the
      // whole row, so omitting them would silently clear the proxy/remote
      // mount on every name edit.
      await updateStack(stack.id, {
        name: editName.trim(),
        category: editCategory,
        version: editVersion,
        description: editDesc,
        icon: editIcon,
        color: editColor,
        proxyPort: proxyPort.trim() === '' ? 0 : Number(proxyPort),
        proxyRootUrl: proxyRoot.trim().toLowerCase(),
        remoteAddress: remoteAddress.trim(),
        remoteUseTls: remoteUseTls,
        remoteSkipVerify: remoteSkipVerify,
      });
      setEditOpen(false);
      await load();
    } catch (e) {
      setEditError(extractStackApiError(e, 'Failed to save.'));
    } finally {
      setEditSaving(false);
    }
  };

  const remove = async (wipe: boolean) => {    const ok = await confirm({
      title: wipe ? `Delete ${stack.name} + wipe data?` : `Delete ${stack.name}?`,
      message: wipe ? 'Package, workdir AND data dir are removed.' : 'Package and workdir are removed. Data dir is kept.',
      confirmLabel: 'Delete',
      tone: 'danger',
    });
    if (!ok) return;
    try {
      await deleteStack(stack.id, wipe);
      navigate('/stacks');
    } catch (e) {
      setError(extractStackApiError(e, 'Delete failed.'));
    }
  };

  const appUrl = stackAppUrl(stack);

  return (
    <div className="space-y-4">
      {/* Fixed top-right actions pill — back + title live in the app header
          ("Stacks / Detail"). The menu portals its dropdown, so it is safe
          inside the fixed container. */}
      <PageActionsPill>
        <CardMenu
          ariaLabel={`Actions for stack ${stack.name}`}
          items={[
            ...(appUrl ? [{ key: 'open', label: 'Open', tone: 'default' as const }] : []),
            { key: 'launch', label: opBusy ? 'Operation running…' : toggling ? '…' : stack.active ? 'Stop' : 'Launch', tone: stack.active ? 'danger' as const : 'default' as const },
            { key: 'edit', label: 'Edit', tone: 'default' as const },
            { key: 'install', label: opBusy && opJob?.op === 'install' ? 'Installing…' : 'Install', tone: 'default' as const },
            { key: 'reinstall', label: opBusy && opJob?.op === 'reinstall' ? 'Reinstalling…' : 'Reinstall', tone: 'default' as const },
            { key: 'copyId', label: copied === 'id' ? 'Copied!' : 'Copy ID', tone: 'default' as const },
            { key: 'copyManifest', label: copied === 'manifest' ? 'Copied!' : 'Copy manifest', tone: 'default' as const },
            { key: 'delete', label: 'Delete', tone: 'danger' as const },
          ]}
          onSelect={(k) => {
            if (k === 'open') navigate(`/stacks/${stack.slug}/`);
            if (k === 'launch') {
              if (opBusy) { setOpOpen(true); return; }
              void (stack.active ? toggle() : launch());
            }
            if (k === 'edit') openEdit();
            if (k === 'install') void doInstall();
            if (k === 'reinstall') void doReinstall();
            if (k === 'copyId') void copy(String(stack.id), 'id');
            if (k === 'copyManifest') void copy(prettyManifest, 'manifest');
            if (k === 'delete') void remove(false);
          }}
        />
      </PageActionsPill>
      <p className="text-xs text-gray-500 truncate">ID {stack.id} · {stack.source || 'file'} · {relativeTime(stack.created_at)}</p>

      {error && (
        <div className="text-xs text-red-300 border border-red-700/40 rounded px-3 py-2 bg-red-900/20">
          {error}
        </div>
      )}
      {notice && (
        <div className="text-xs text-emerald-300 border border-emerald-700/40 rounded px-3 py-2 bg-emerald-900/20">
          {notice}
        </div>
      )}
      {opJob && !opOpen && (
        <button
          type="button"
          onClick={() => setOpOpen(true)}
          className="flex items-center gap-2 text-xs text-sky-200 border border-sky-700/40 rounded px-3 py-2 bg-sky-900/20 hover:bg-sky-900/40 text-left"
        >
          {opJob.status === 'running' && (
            <span className="w-3 h-3 rounded-full border-2 border-sky-400 border-t-transparent animate-spin shrink-0" aria-hidden="true" />
          )}
          <span className="truncate">
            {opJob.op} {opJob.status} — view console →
          </span>
        </button>
      )}

      <GlassCard className="ks-stat-card p-4">
        <div className="flex items-start gap-3 min-w-0">
          <CardIconTile
            icon={stack.icon || ''}
            color={stack.color || ''}
            size="lg"
            fallback={<span aria-hidden="true" className="text-2xl">📦</span>}
          />
          <div className="flex-1 min-w-0">
            <h2 className="text-xl font-semibold text-white truncate flex items-center gap-2 flex-wrap">
              {stack.name}
              <span className="font-mono text-xs text-gray-400">v{stack.version}</span>
              {stack.active
                ? <span className="text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded-md border bg-emerald-900/30 border-emerald-700/30 text-emerald-200">Active</span>
                : <span className="text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded-md border bg-white/5 border-white/10 text-gray-300">Inactive</span>}
              {src && src.key !== 'file' ? <span className={`text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded-md border ${src.badge}`}>{src.label}</span> : null}
            </h2>
            <p className="text-[11px] text-gray-500 font-mono mt-1 truncate">
              {stack.slug} · {stack.category} · {locationType === 'outside' ? `outside · ${remoteProtocol}` : installType === 'docker' ? 'host · docker' : `host · ${stack.runtime || 'process'}`}
            </p>
            {stack.description && <p className="text-sm text-gray-300 mt-1 leading-relaxed whitespace-pre-wrap break-words">{stack.description}</p>}
            <div className="flex flex-wrap gap-1.5 mt-2">
              <span className="text-[10px] px-2 py-0.5 rounded-md border border-gray-700/60 text-gray-300" title="spa = full bundle in iframe, simple = panel-rendered markdown/html/blocks">
                pages: {stack.page_style}
              </span>
              <span className="text-[10px] px-2 py-0.5 rounded-md border border-gray-700/60 text-gray-300" title="panel = inherits panel theme, custom = own theme.css, none = unthemed">
                theme: {stack.theme_mode}
              </span>
              {stack.color && (
                <span className="inline-flex items-center gap-1.5 text-[10px] px-2 py-0.5 rounded-md border border-white/10 text-gray-300">
                  <span className="w-3 h-3 rounded" style={{ backgroundColor: stack.color }} />
                  {stack.color}
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="rounded-lg border border-white/5 bg-white/[0.02] p-2.5">
            <h4 className="text-[10px] uppercase tracking-wide text-gray-500">Created</h4>
            <p className="text-xs text-white mt-1" title={formatDate(stack.created_at)}>{formatDate(stack.created_at)}</p>
            <p className="text-[11px] text-gray-500">{relativeTime(stack.created_at)}</p>
          </div>
          <div className="rounded-lg border border-white/5 bg-white/[0.02] p-2.5">
            <h4 className="text-[10px] uppercase tracking-wide text-gray-500">Updated</h4>
            <p className="text-xs text-white mt-1" title={formatDate(stack.updated_at)}>{formatDate(stack.updated_at)}</p>
            <p className="text-[11px] text-gray-500">{relativeTime(stack.updated_at)}</p>
          </div>
          <div className="rounded-lg border border-white/5 bg-white/[0.02] p-2.5">
            <h4 className="text-[10px] uppercase tracking-wide text-gray-500">Permissions</h4>
            <p className="text-lg font-semibold text-white leading-none mt-1">{stack.permissions.length}</p>
            <p className="text-[11px] text-gray-500">
              {stack.pending > 0 ? <span className="text-amber-300">{stack.pending} pending approval</span> : 'all granted'}
              {panelPermissions.length > 0 && ` · ${panelPermissions.length} panel keys`}
            </p>
          </div>
          <div className="rounded-lg border border-white/5 bg-white/[0.02] p-2.5">
            <h4 className="text-[10px] uppercase tracking-wide text-gray-500">Workflows</h4>
            <p className="text-xs text-white mt-1 truncate">{installSteps.length} install · {launchSteps.length} launch</p>
            <p className="text-[11px] text-gray-500">{launchTokens.length} ask-at-launch token{launchTokens.length === 1 ? '' : 's'}</p>
          </div>
        </div>

        <div className="mt-3 flex gap-2 flex-wrap">
          {stack.active ? (
            <>
              <Link to={`/stacks/${stack.slug}/`} className="px-3 py-1.5 text-xs rounded-md bg-emerald-600 text-white hover:bg-emerald-500">Open</Link>
              <button type="button" onClick={() => void toggle()} disabled={toggling || opBusy} className="px-3 py-1.5 text-xs rounded-md border border-white/10 bg-white/5 hover:bg-white/10 text-white disabled:opacity-50">Stop</button>
            </>
          ) : (
            <button
              type="button"
              onClick={() => void launch()}
              disabled={toggling || opBusy}
              className="px-3 py-1.5 text-xs rounded-md bg-white text-black hover:bg-gray-200 disabled:opacity-50"
            >
              {opBusy && opJob?.op === 'launch' ? 'Launching…' : toggling ? 'Launching…' : 'Launch'}
            </button>
          )}
          <button type="button" onClick={() => void doInstall()} disabled={opBusy} className="px-3 py-1.5 text-xs rounded-md border border-white/10 bg-white/5 hover:bg-white/10 text-white disabled:opacity-50">
            {opBusy && opJob?.op === 'install' ? 'Installing…' : 'Install'}
          </button>
          <button type="button" onClick={() => void doReinstall()} disabled={opBusy} className="px-3 py-1.5 text-xs rounded-md border border-amber-700/40 bg-amber-900/20 hover:bg-amber-900/40 text-amber-200 disabled:opacity-50">
            {opBusy && opJob?.op === 'reinstall' ? 'Reinstalling…' : 'Reinstall'}
          </button>
        </div>
      </GlassCard>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <GlassCard className="p-3">
          <h4 className="text-xs uppercase tracking-wide text-gray-500 mb-2">Location</h4>
          <div className="space-y-1.5 text-sm">
            <div className="flex justify-between gap-2">
              <span className="text-gray-400">Type</span>
              <span className="text-white font-mono text-xs">
                {locationType === 'outside'
                  ? <span className="text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded bg-violet-900/40 border border-violet-700/40 text-violet-200">outside</span>
                  : <span className="text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded bg-sky-900/40 border border-sky-700/40 text-sky-200">host</span>}
              </span>
            </div>
            {locationType === 'outside' ? (
              <>
                <div className="flex justify-between gap-2"><span className="text-gray-400">Protocol</span><span className="text-white font-mono text-xs uppercase">{remoteProtocol}</span></div>
                <div>
                  <p className="text-[11px] uppercase tracking-wide text-gray-500">{remoteProtocol === 'wss' ? 'Remote host' : 'Remote URL'}</p>
                  <p className="text-xs text-gray-200 font-mono break-all rounded-lg border border-white/5 bg-black/20 px-3 py-2 mt-1">{locationSummary}</p>
                </div>
              </>
            ) : (
              <>
                <div className="flex justify-between gap-2"><span className="text-gray-400">Runs as</span><span className="text-white font-mono text-xs">{installType === 'docker' ? 'docker' : `host · ${stack.runtime || '—'}`}</span></div>
                <div>
                  <p className="text-[11px] uppercase tracking-wide text-gray-500">{installType === 'docker' ? 'Image' : 'Entrypoint'}</p>
                  <p className="text-xs text-gray-200 font-mono break-all rounded-lg border border-white/5 bg-black/20 px-3 py-2 mt-1">{locationSummary}</p>
                </div>
              </>
            )}
            {stack.owner_name && (
              <div className="flex justify-between gap-2"><span className="text-gray-400">Owner</span><span className="text-white text-xs">{stack.owner_name}</span></div>
            )}
          </div>
        </GlassCard>

        <GlassCard className="p-3">
          <h4 className="text-xs uppercase tracking-wide text-gray-500 mb-2">Install & Launch</h4>
          <div className="space-y-2 text-sm">
            <div>
              <p className="text-[11px] uppercase tracking-wide text-gray-500">Install steps · {installSteps.length}</p>
              {installSteps.length === 0 ? <p className="text-xs text-gray-500">No install workflow</p> : (
                <ol className="mt-1 space-y-1 max-h-24 overflow-auto pr-1">
                  {installSteps.map((s: any, i: number) => (
                    <li key={i} className="text-xs text-gray-300 truncate"><span className="text-gray-500 mr-1">{i + 1}.</span>{stepLabel(s, i)}</li>
                  ))}
                </ol>
              )}
            </div>
            <div>
              <p className="text-[11px] uppercase tracking-wide text-gray-500">Launch steps · {launchSteps.length}</p>
              {launchSteps.length === 0 ? <p className="text-xs text-gray-500">No launch workflow</p> : (
                <ol className="mt-1 space-y-1 max-h-24 overflow-auto pr-1">
                  {launchSteps.map((s: any, i: number) => (
                    <li key={i} className="text-xs text-gray-300 truncate"><span className="text-gray-500 mr-1">{i + 1}.</span>{stepLabel(s, i)}</li>
                  ))}
                </ol>
              )}
            </div>
            <div>
              <p className="text-[11px] uppercase tracking-wide text-gray-500">Ask-at-launch tokens · {launchTokens.length}</p>
              {launchTokens.length === 0 ? <p className="text-xs text-gray-500">Nothing asked at launch</p> : (
                <ul className="mt-1 space-y-1 max-h-24 overflow-auto pr-1">
                  {launchTokens.map((t: any, i: number) => (
                    <li key={i} className="flex items-center gap-2 text-xs">
                      <code className="font-mono text-sky-200 truncate">${t.name || `TOKEN_${i}`}</code>
                      {t.required && <span className="text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded bg-red-900/40 border border-red-700/30 text-red-200 shrink-0">required</span>}
                      {t.secret && <span className="text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded bg-amber-900/40 border border-amber-700/30 text-amber-200 shrink-0">secret</span>}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </GlassCard>

        <GlassCard className="p-3">
          <h4 className="text-xs uppercase tracking-wide text-gray-500 mb-2">Panel permissions · {panelPermissions.length}</h4>
          {panelPermissions.length === 0 ? <p className="text-xs text-gray-500">No panel permission keys requested</p> : (
            <ul className="mt-1 flex flex-wrap gap-1 max-h-40 overflow-auto pr-1">
              {panelPermissions.slice(0, 24).map((k) => (
                <li key={k} className="text-[10px] px-1.5 py-0.5 rounded border border-white/10 bg-white/5 text-gray-300 font-mono">{k}</li>
              ))}
              {panelPermissions.length > 24 && (
                <li className="text-[10px] px-1.5 py-0.5 rounded border border-white/10 text-gray-500">+{panelPermissions.length - 24} more</li>
              )}
            </ul>
          )}
        </GlassCard>
      </div>

      <GlassCard>
        <h2 className="text-sm font-medium text-gray-200 mb-1">App proxy</h2>
        <p className="text-xs text-gray-500 mb-3">
          Float an externally-run Go app (a complete program you run yourself, e.g. a dashboard on{' '}
          <code className="font-mono">127.0.0.1:6600</code> or another host like{' '}
          <code className="font-mono">10.0.0.9:7700</code>) at <code className="font-mono">/&lt;root&gt;/</code> behind
          the panel session — no API key needed, the app sees you via <code className="font-mono">X-Panel-User-*</code> headers.
          Works while the stack is active.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-w-lg">
          <label className="block">
            <span className="text-xs text-gray-400">Loopback port (empty = off, optional for remote)</span>
            <input
              value={proxyPort}
              onChange={(e) => setProxyPort(e.target.value.replace(/[^0-9]/g, '').slice(0, 5))}
              placeholder="6600"
              inputMode="numeric"
              className="block w-full mt-1 bg-black/30 border border-white/10 rounded-md text-sm text-white px-3 py-1.5 font-mono focus:outline-none focus:border-white/40"
            />
          </label>
          <label className="block">
            <span className="text-xs text-gray-400">Root URL segment</span>
            <div className="flex items-center gap-1.5 mt-1">
              <span className="text-sm text-gray-500 font-mono">/</span>
              <input
                value={proxyRoot}
                onChange={(e) => setProxyRoot(e.target.value.toLowerCase())}
                placeholder="dash"
                spellCheck={false}
                autoComplete="off"
                className="block w-full bg-black/30 border border-white/10 rounded-md text-sm text-white px-3 py-1.5 font-mono focus:outline-none focus:border-white/40"
              />
            </div>
          </label>
          <label className="block sm:col-span-2">
            <span className="text-xs text-gray-400">Remote address — another host, node-style (empty = same host via loopback port)</span>
            <input
              value={remoteAddress}
              onChange={(e) => setRemoteAddress(e.target.value)}
              placeholder="10.0.0.9:7700"
              spellCheck={false}
              autoComplete="off"
              className="block w-full mt-1 bg-black/30 border border-white/10 rounded-md text-sm text-white px-3 py-1.5 font-mono focus:outline-none focus:border-white/40"
            />
          </label>
        </div>
        {remoteAddress.trim() ? (
          <div className="flex gap-4 mt-2 max-w-lg">
            <label className="flex items-center gap-2 text-xs text-gray-300">
              <input type="checkbox" checked={remoteUseTls} onChange={(e) => setRemoteUseTls(e.target.checked)} className="w-4 h-4 accent-emerald-500" />
              Use TLS (https)
            </label>
            <label className="flex items-center gap-2 text-xs text-gray-300">
              <input type="checkbox" checked={remoteSkipVerify} onChange={(e) => setRemoteSkipVerify(e.target.checked)} className="w-4 h-4 accent-emerald-500" />
              Skip TLS verify (self-signed)
            </label>
          </div>
        ) : null}
        <div className="flex gap-2 mt-3 flex-wrap">
          <button type="button" onClick={() => void saveProxy()} disabled={proxySaving} className="text-xs px-3 py-1.5 rounded-lg bg-sky-600 hover:bg-sky-500 text-white disabled:opacity-50">
            {proxySaving ? 'Saving…' : 'Save connection'}
          </button>
          <button type="button" onClick={() => void verify()} disabled={probing} className="text-xs px-3 py-1.5 rounded-lg border border-white/10 bg-white/5 hover:bg-white/10 text-gray-200 disabled:opacity-50">
            {probing ? 'Verifying…' : 'Verify'}
          </button>
          {appUrl ? (
            <a href={appUrl} className="text-xs px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white">
              Open app at {appUrl}
            </a>
          ) : null}
        </div>
        {probeResult ? (
          <p className={`mt-2 text-xs font-mono ${probeResult.reachable === 'yes' ? 'text-emerald-300' : 'text-red-300'}`}>
            {probeResult.reachable === 'yes' ? '● reachable' : `● unreachable${probeResult.note ? ` — ${probeResult.note}` : ''}`}
          </p>
        ) : null}
      </GlassCard>

      <GlassCard>
        <div className="flex items-center gap-2 mb-1">
          <h2 className="text-sm font-medium text-gray-200">Remote pairing (node-style)</h2>
          <span className={`text-[11px] px-2 py-0.5 rounded-full border font-mono ${stack.status === 'up' ? 'bg-emerald-900/40 text-emerald-200 border-emerald-700/50' : 'bg-white/5 text-gray-400 border-white/10'}`}>
            {stack.status === 'up' ? '● up' : '○ down'}
          </span>
          {stack.token_prefix ? (
            <span className="text-[11px] px-2 py-0.5 rounded-full border font-mono bg-white/5 text-gray-400 border-white/10" title="Pairing token prefix">
              {stack.token_prefix}…
            </span>
          ) : null}
        </div>
        <p className="text-xs text-gray-500 mb-3">
          The stack app connects with a pairing token — no API key to create. It heartbeats{' '}
          <code className="font-mono">POST /api/stacks/heartbeat</code> with the token
          {stack.last_seen_at ? <> (last seen {relativeTime(stack.last_seen_at)})</> : ' (never connected yet)'}; Verify dials its{' '}
          <code className="font-mono">/health</code> like the node probe. With the granted capabilities it may call the token API
          (<code className="font-mono">/api/stacks/token/me|instances|metrics</code>).
        </p>
        <div className="flex gap-2 flex-wrap">
          <button type="button" onClick={() => void showPairing()} disabled={pairingLoading} className="text-xs px-3 py-1.5 rounded-lg bg-sky-600 hover:bg-sky-500 text-white disabled:opacity-50">
            {pairingLoading ? 'Loading…' : pairingOpen ? 'Reload pairing snippet' : 'Show pairing snippet'}
          </button>
          <button type="button" onClick={() => void rotate()} disabled={rotating} className="text-xs px-3 py-1.5 rounded-lg border border-white/10 bg-white/5 hover:bg-white/10 text-gray-200 disabled:opacity-50">
            {rotating ? 'Rotating…' : 'Rotate token'}
          </button>
        </div>
        {pairingOpen && pairing ? (
          <div className="mt-3 space-y-2">
            <div className="flex items-center gap-2">
              <span className="text-[11px] uppercase tracking-wide text-gray-500">App config — paste into the stack app</span>
              <button onClick={() => void copy(pairing.config, 'pairing')} className="ml-auto px-2.5 py-1 text-xs rounded-md border border-white/10 bg-white/5 hover:bg-white/10 text-white">{copied === 'pairing' ? 'Copied!' : 'Copy config'}</button>
            </div>
            <pre className="rounded-lg border border-white/5 bg-black/30 p-3 text-[11px] font-mono text-gray-200 whitespace-pre-wrap break-all">{pairing.config}</pre>
            <p className="text-[11px] text-amber-300/80">Treat the token like a password — rotating invalidates the old one immediately.</p>
          </div>
        ) : null}
      </GlassCard>

      <GlassModal
        open={editOpen}
        onClose={() => setEditOpen(false)}
        title={`Edit — ${stack.name}`}
        maxWidth="max-w-lg"
        footer={
          <>
            <button onClick={() => setEditOpen(false)} className="px-3 py-1.5 rounded text-sm border border-white/10 text-gray-300 hover:bg-white/10">Cancel</button>
            <button onClick={() => void saveEdit()} disabled={editSaving} className="ks-primary-btn px-3 py-1.5 rounded text-sm bg-white text-black hover:bg-gray-200 disabled:opacity-50">
              {editSaving ? 'Saving…' : 'Save'}
            </button>
          </>
        }
      >
        <label className="block">
          <span className="text-xs text-gray-400">Name</span>
          <input value={editName} onChange={(e) => setEditName(e.target.value)} className="block w-full mt-1 bg-black/30 border border-white/10 rounded-md text-sm text-white px-3 py-1.5 focus:outline-none focus:border-white/40" />
        </label>
        <div className="grid grid-cols-2 gap-2">
          <label className="block">
            <span className="text-xs text-gray-400">Version</span>
            <input value={editVersion} onChange={(e) => setEditVersion(e.target.value)} className="block w-full mt-1 bg-black/30 border border-white/10 rounded-md text-sm text-white px-3 py-1.5 focus:outline-none focus:border-white/40" />
          </label>
          <label className="block">
            <span className="text-xs text-gray-400">Category</span>
            <select value={editCategory} onChange={(e) => setEditCategory(e.target.value)} className="block w-full mt-1 bg-black/30 border border-white/10 rounded-md text-sm text-gray-200 px-2 py-1.5 focus:outline-none focus:border-white/40">
              {STACK_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </label>
        </div>
        <label className="block">
          <span className="text-xs text-gray-400">Description</span>
          <textarea value={editDesc} onChange={(e) => setEditDesc(e.target.value)} rows={3} className="block w-full mt-1 bg-black/30 border border-white/10 rounded-md text-sm text-white px-3 py-1.5 focus:outline-none focus:border-white/40" />
        </label>
        <div>
          <span className="block text-xs text-gray-400 mb-1">Icon & colour (card theme)</span>
          <IconColorPicker icon={editIcon} color={editColor} onIconChange={setEditIcon} onColorChange={setEditColor} previewName={editName} />
        </div>
        {editError && <p className="text-red-400 text-xs">{editError}</p>}
        <p className="text-[11px] text-gray-500">Theme mode / page style are set at install (manifest) — edit files or reinstall to change them.</p>
      </GlassModal>

      <GlassCard>
        <h2 className="text-sm font-medium text-red-200 mb-2">Danger zone</h2>
        <div className="flex gap-1.5 flex-wrap">
          <button type="button" onClick={() => void remove(false)} className="text-xs px-3 py-1.5 rounded-lg bg-red-900/40 hover:bg-red-800/40 text-red-200">Delete (keep data)</button>
          <button type="button" onClick={() => void remove(true)} className="text-xs px-3 py-1.5 rounded-lg bg-red-900/60 hover:bg-red-800/60 text-red-100">Delete + wipe data</button>
          <button type="button" onClick={() => navigate('/stacks')} className="ml-auto text-xs px-3 py-1.5 rounded-lg border border-white/10 bg-white/5 hover:bg-white/10 text-gray-300">Back to stacks</button>
        </div>
      </GlassCard>

      <div className="flex gap-2 flex-wrap">
        {stack.active && appUrl ? (
          <Link to={`/stacks/${stack.slug}/`} className="px-4 py-2 text-sm rounded-lg bg-emerald-600 text-white hover:bg-emerald-500">Open stack</Link>
        ) : (
          <button onClick={() => void (stack.active ? toggle() : launch())} disabled={toggling} className="px-4 py-2 text-sm rounded-lg bg-white text-black hover:bg-gray-200 disabled:opacity-50">{toggling ? '…' : stack.active ? 'Stop' : 'Launch'}</button>
        )}
        <button onClick={() => void doInstall()} disabled={opBusy} className="px-4 py-2 text-sm rounded-lg border border-white/10 bg-white/5 hover:bg-white/10 text-white disabled:opacity-50">{opBusy && opJob?.op === 'install' ? 'Installing…' : 'Install'}</button>
        <button onClick={() => void doReinstall()} disabled={opBusy} className="px-4 py-2 text-sm rounded-lg border border-amber-700/40 bg-amber-900/20 hover:bg-amber-900/40 text-amber-200 disabled:opacity-50">{opBusy && opJob?.op === 'reinstall' ? 'Reinstalling…' : 'Reinstall'}</button>
        <button onClick={back} className="ml-auto px-4 py-2 text-sm rounded-lg border border-white/10 bg-white/5 hover:bg-white/10 text-gray-300">Back to stacks</button>
      </div>

      {opOpen && opJob && (
        <StackOpModal
          job={opJob}
          stackName={stack.name}
          stopping={opStopping}
          onStop={() => void stopOp()}
          onDismiss={() => setOpOpen(false)}
        />
      )}
    </div>
  );
};

export default StackDetail;
