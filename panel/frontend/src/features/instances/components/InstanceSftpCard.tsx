import React, { useCallback, useEffect, useState } from 'react';
import {
  getSFTP,
  enableSFTP,
  rotateSFTP,
  disableSFTP,
  revealSFTPPassword,
  SFTPInfo,
} from '@/shared/api/instanceSftp';
import { useAuthStore } from '@/shared/stores/authStore';
import { PermissionKey } from '@/shared/types/permissions';
import { hasPermissionAny } from '@/shared/types/permissions';
import { useConfirm } from '@/shared/stores/confirmStore';

function toast(msg: string, type: 'success' | 'error' | 'info' = 'info') {
  window.dispatchEvent(new CustomEvent('ks-toast', { detail: { message: msg, type } }));
}

function copyText(t: string) {
  const done = () => toast('Copied to clipboard', 'success');
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(t).then(done, () => toast('Copy failed', 'error'));
    return;
  }
  try {
    const ta = document.createElement('textarea');
    ta.value = t;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    document.body.removeChild(ta);
    done();
  } catch {
    toast('Copy failed', 'error');
  }
}

interface Props {
  instanceId: number;
}

const InstanceSftpCard: React.FC<Props> = ({ instanceId }) => {
  const permissions = useAuthStore((s) => s.permissions);
  const canEdit = hasPermissionAny(permissions, PermissionKey.INSTANCES_EDIT, PermissionKey.MANAGE_INSTANCES);
  const confirm = useConfirm();

  const [info, setInfo] = useState<SFTPInfo | null>(null);
  const [notProvisioned, setNotProvisioned] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  const load = useCallback(async () => {
    if (!instanceId) return;
    setLoading(true);
    setError('');
    try {
      const data = await getSFTP(instanceId);
      setInfo(data);
      setNotProvisioned(false);
      // Freshly-minted passwords arrive inline on enable/rotate only.
      // A plain GET is masked, so keep any already-revealed value.
      if (data.password) {
        setPassword(data.password);
        setShowPassword(true);
      }
    } catch (e: any) {
      const status = e?.response?.status;
      if (status === 404) {
        setInfo(null);
        setNotProvisioned(true);
        setPassword('');
        setShowPassword(false);
      } else {
        setError(e?.response?.data?.error || e?.message || 'Failed to load SFTP status');
      }
    } finally {
      setLoading(false);
    }
  }, [instanceId]);

  useEffect(() => {
    load();
  }, [load]);

  const handleEnable = async () => {
    setBusy(true);
    setError('');
    try {
      const data = await enableSFTP(instanceId);
      setInfo(data);
      setNotProvisioned(false);
      if (data.password) {
        setPassword(data.password);
        setShowPassword(true);
      }
      toast(data.edge_error ? 'SFTP vaulted but edge provision failed — rotate to retry' : 'SFTP enabled', data.edge_error ? 'error' : 'success');
      if (data.port_warning) toast(String(data.port_warning), 'info');
    } catch (e: any) {
      const msg = e?.response?.data || e?.message || 'Failed to enable SFTP';
      setError(typeof msg === 'string' ? msg : JSON.stringify(msg));
      toast(typeof msg === 'string' ? msg : 'Failed to enable SFTP', 'error');
    } finally {
      setBusy(false);
    }
  };

  const handleRotate = async () => {
    const ok = await confirm({
      title: 'Rotate SFTP password?',
      message: 'The current password stops working immediately. Update FileZilla / WinSCP with the new one.',
      confirmLabel: 'Rotate',
      tone: 'default',
    });
    if (!ok) return;
    setBusy(true);
    setError('');
    try {
      const data = await rotateSFTP(instanceId);
      setInfo(data);
      if (data.password) {
        setPassword(data.password);
        setShowPassword(true);
      }
      toast(data.edge_error ? 'Password rotated in vault but edge re-provision failed — rotate again' : 'SFTP password rotated', data.edge_error ? 'error' : 'success');
    } catch (e: any) {
      const msg = e?.response?.data || e?.message || 'Failed to rotate SFTP password';
      setError(typeof msg === 'string' ? msg : JSON.stringify(msg));
      toast(typeof msg === 'string' ? msg : 'Failed to rotate SFTP password', 'error');
    } finally {
      setBusy(false);
    }
  };

  const handleDisable = async () => {
    const ok = await confirm({
      title: 'Disable SFTP?',
      message: 'Removes the SFTP identity from the edge and deletes the vaulted password. This cannot be undone.',
      confirmLabel: 'Disable',
      tone: 'danger',
    });
    if (!ok) return;
    setBusy(true);
    setError('');
    try {
      await disableSFTP(instanceId);
      setInfo(null);
      setNotProvisioned(true);
      setPassword('');
      setShowPassword(false);
      toast('SFTP disabled', 'success');
    } catch (e: any) {
      const msg = e?.response?.data || e?.message || 'Failed to disable SFTP';
      setError(typeof msg === 'string' ? msg : JSON.stringify(msg));
      toast(typeof msg === 'string' ? msg : 'Failed to disable SFTP', 'error');
    } finally {
      setBusy(false);
    }
  };

  const handleReveal = async () => {
    setBusy(true);
    setError('');
    try {
      const value = await revealSFTPPassword(instanceId);
      setPassword(value);
      setShowPassword(true);
    } catch (e: any) {
      const msg = e?.response?.data?.error || e?.message || 'Failed to reveal password';
      setError(typeof msg === 'string' ? msg : JSON.stringify(msg));
      toast('Failed to reveal password', 'error');
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return (
      <div className="glass-card rounded-xl p-6 animate-pulse">
        <div className="h-5 w-1/3 bg-neutral-800 rounded" />
      </div>
    );
  }

  if (notProvisioned || !info) {
    return (
      <div className="glass-card rounded-xl p-6 space-y-3">
        <h2 className="text-xl font-semibold" style={{ color: 'var(--ks-heading)' }}>SFTP access</h2>
        {error && (
          <div className="ks-card" style={{ borderColor: 'var(--ks-bad-line)', color: 'var(--ks-bad)', fontSize: 12 }}>{error}</div>
        )}
        <p className="text-sm text-gray-400">This instance has no SFTP credentials yet.</p>
        {canEdit ? (
          <button
            type="button"
            onClick={handleEnable}
            disabled={busy}
            className="px-3 py-1.5 rounded-md text-sm bg-white text-black hover:bg-gray-200 disabled:opacity-50"
          >
            {busy ? 'Enabling…' : 'Enable SFTP'}
          </button>
        ) : (
          <p className="text-xs text-gray-500">You need INSTANCES_EDIT permission to enable SFTP.</p>
        )}
      </div>
    );
  }

  const cliCmd = `sftp -P ${info.port} ${info.username}@${info.host}`;

  return (
    <div className="space-y-4">
      <div className="glass-card rounded-xl p-6 space-y-4">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <h2 className="text-xl font-semibold" style={{ color: 'var(--ks-heading)' }}>SFTP access</h2>
          {!info.enabled && (
            <span className="ks-badge" style={{ color: 'var(--ks-bad)' }}>Suspended — auth blocked</span>
          )}
        </div>

        {error && (
          <div className="ks-card" style={{ borderColor: 'var(--ks-bad-line)', color: 'var(--ks-bad)', fontSize: 12 }}>{error}</div>
        )}
        {info.edge_error && (
          <div className="ks-card" style={{ borderColor: 'var(--ks-bad-line)', color: 'var(--ks-bad)', fontSize: 12 }}>
            Edge provision failed: {String(info.edge_error)}. Rotate to retry.
          </div>
        )}

        <p className="text-sm text-gray-400">
          Connect with FileZilla, WinSCP or <code className="text-gray-200">{cliCmd}</code>
        </p>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <tbody>
              <tr className="border-b border-white/5">
                <td className="px-4 py-2 text-gray-400 w-32">Host</td>
                <td className="px-4 py-2 font-mono text-white">{info.host}</td>
              </tr>
              <tr className="border-b border-white/5">
                <td className="px-4 py-2 text-gray-400">Port</td>
                <td className="px-4 py-2 font-mono text-white">{info.port}</td>
              </tr>
              <tr className="border-b border-white/5">
                <td className="px-4 py-2 text-gray-400">Username</td>
                <td className="px-4 py-2 font-mono text-white">{info.username}</td>
              </tr>
              <tr className="border-b border-white/5">
                <td className="px-4 py-2 text-gray-400">Password</td>
                <td className="px-4 py-2 font-mono text-white">
                  {showPassword && password ? (
                    <span>{password}</span>
                  ) : (
                    <span className="text-gray-500">•••• (vaulted — use Reveal)</span>
                  )}
                </td>
              </tr>
              <tr>
                <td className="px-4 py-2 text-gray-400">URI</td>
                <td className="px-4 py-2 font-mono text-gray-300 break-all">{info.uri}</td>
              </tr>
            </tbody>
          </table>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {showPassword && password ? (
            <button type="button" onClick={() => setShowPassword(false)} className="px-3 py-1.5 rounded-md text-sm border border-white/10 bg-white/5 text-white">Hide</button>
          ) : (
            <button type="button" onClick={handleReveal} disabled={busy} className="px-3 py-1.5 rounded-md text-sm border border-white/10 bg-white/5 text-white disabled:opacity-50">Reveal password</button>
          )}
          {showPassword && password && (
            <button type="button" onClick={() => copyText(password)} className="px-3 py-1.5 rounded-md text-sm border border-white/10 bg-white/5 text-white">Copy password</button>
          )}
          <button type="button" onClick={() => copyText(info.uri)} className="px-3 py-1.5 rounded-md text-sm border border-white/10 bg-white/5 text-white">Copy URI</button>
          <button type="button" onClick={() => copyText(cliCmd)} className="px-3 py-1.5 rounded-md text-sm border border-white/10 bg-white/5 text-white">Copy CLI</button>
          {canEdit && (
            <>
              <button type="button" onClick={handleRotate} disabled={busy} className="px-3 py-1.5 rounded-md text-sm border border-white/10 bg-white/5 text-white disabled:opacity-50">Rotate</button>
              <button type="button" onClick={handleDisable} disabled={busy} className="px-3 py-1.5 rounded-md text-sm bg-red-800 text-white hover:bg-red-700 disabled:opacity-50">Disable</button>
            </>
          )}
        </div>
        {!canEdit && (
          <p className="text-xs text-gray-500">You need INSTANCES_EDIT permission to rotate or disable SFTP.</p>
        )}
      </div>

      <div className="glass-card rounded-xl p-6 space-y-2">
        <h3 className="text-sm font-semibold" style={{ color: 'var(--ks-heading)' }}>Client hints</h3>
        <p className="text-xs text-gray-400">FileZilla: File → Site Manager → SFTP, host + port + user + password.</p>
        <p className="text-xs text-gray-400">WinSCP: New Session → SFTP, same fields.</p>
        <p className="text-xs text-gray-400">CLI: <code className="text-gray-200">{cliCmd}</code></p>
      </div>
    </div>
  );
};

export default InstanceSftpCard;
