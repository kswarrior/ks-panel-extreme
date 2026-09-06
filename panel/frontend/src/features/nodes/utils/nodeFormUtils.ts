// NodeForm utilities - extracted from NodeForm.tsx

import type { ConnectionMode, Form } from '../types/nodeForm';
import { KSEDGE_URL } from '../types/nodeForm';

export function buildEdgeConfig(
  name: string,
  useTls: boolean,
  token: string,
  port: string,
  form: Form
): string {
  const origin = typeof window !== 'undefined' ? window.location.origin : 'http://localhost:5050';
  const m: ConnectionMode = (form.connection_mode as ConnectionMode) || 'direct';
  // use_tls_upstream describes edge→panel TLS (panel_url scheme), not the
  // panel→edge UseTLS flag. Derive it from the origin so an https panel
  // yields true even when the edge itself is plain http.
  const upstreamTls = origin.trim().toLowerCase().startsWith('https');
  void useTls;
  const cfg: Record<string, any> = {
    uuid: 'auto-generated-by-panel',
    name,
    panel_url: origin,
    token,
    listen_port: Number(port) || 4040,
    heartbeat_interval: 60,
    use_tls_upstream: upstreamTls,
    skip_verify: Boolean(form.skip_tls_verify),
    connection_mode: m,
  };
  const instancesDir = form.instances_dir.trim();
  if (instancesDir) {
    cfg.instances_dir = instancesDir;
  }
  return JSON.stringify(cfg, null, 2);
}

export function buildBootstrapCmd(form: Form, token: string, port: string): string {
  const dir = form.install_dir.trim() || './localnode/ksedge';
  // Quote for single-quote shell contexts: a ' in the path would otherwise
  // break out of the quoting and corrupt (or inject into) the snippet.
  const qdir = dir.replace(/'/g, `'\\''`);
  return `mkdir -p '${qdir}'
cd '${qdir}'
curl -L -o ksedge '${KSEDGE_URL}'
chmod +x ksedge
cat > config.json <<'EOF'
${buildEdgeConfig(form.name, form.use_tls, token, port, form)}
EOF
./ksedge launch &`;
}

// KSEDGE_URL re-exported from types for backwards compat (prefer import from types/nodeForm).
export { KSEDGE_URL };