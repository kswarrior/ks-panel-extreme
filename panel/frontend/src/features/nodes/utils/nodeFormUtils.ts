// NodeForm utilities - extracted from NodeForm.tsx

import type { ConnectionMode, Form } from '../types/nodeForm';

export function buildEdgeConfig(
  name: string,
  useTls: boolean,
  token: string,
  port: string,
  form: Form
): string {
  const origin = typeof window !== 'undefined' ? window.location.origin : 'http://localhost:5050';
  const m: ConnectionMode = (form.connection_mode as ConnectionMode) || 'direct';
  const cfg: Record<string, any> = {
    uuid: 'auto-generated-by-panel',
    name,
    panel_url: origin,
    token,
    listen_port: Number(port) || 4040,
    heartbeat_interval: 60,
    use_tls_upstream: useTls,
    skip_verify: false,
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
  return `mkdir -p '${dir}'
cd '${dir}'
curl -L -o ksedge '${KSEDGE_URL}'
chmod +x ksedge
cat > config.json <<'EOF'
${buildEdgeConfig(form.name, form.use_tls, token, port, form)}
EOF
./ksedge launch &`;
}

export const KSEDGE_URL =
  'https://github.com/kswarrior/ks-panel-extreme/releases/download/ks-release-32876373128-a36954f895a6/ksedge';