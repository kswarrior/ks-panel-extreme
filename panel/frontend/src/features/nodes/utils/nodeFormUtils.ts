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
  // Flat scalar schema only — emit TOML directly (no dep): `key = value`
  // lines, strings double-quoted via JSON.stringify (valid TOML basic
  // strings for this value domain). Key order matches the edge's config.Load.
  const lines: string[] = ['# ksedge edge config (TOML) — place next to the ksedge binary'];
  const str = (v: unknown): string => JSON.stringify(String(v ?? ''));
  lines.push(`uuid = ${str('auto-generated-by-panel')}`);
  lines.push(`name = ${str(name)}`);
  lines.push(`panel_url = ${str(origin)}`);
  lines.push(`token = ${str(token)}`);
  lines.push(`listen_port = ${Number(port) || 4040}`);
  lines.push(`heartbeat_interval = 60`);
  lines.push(`use_tls_upstream = ${upstreamTls ? 'true' : 'false'}`);
  lines.push(`skip_verify = ${Boolean(form.skip_tls_verify) ? 'true' : 'false'}`);
  const instancesDir = form.instances_dir.trim();
  if (instancesDir) {
    lines.push(`instances_dir = ${str(instancesDir)}`);
  }
  lines.push(`connection_mode = ${str(m)}`);
  return lines.join('\n') + '\n';
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
cat > config.toml <<'EOF'
${buildEdgeConfig(form.name, form.use_tls, token, port, form)}
EOF
./ksedge launch &`;
}

// panelOrigin is the base URL embedded in the generated bootstrap commands.
// Mirrors buildEdgeConfig: the operator's own origin is what the edge dials.
function panelOrigin(): string {
  return typeof window !== 'undefined' ? window.location.origin : 'http://localhost:5050';
}

// buildConfigFetchCmd is the "edge already installed" one-liner: the edge
// dials the panel over WSS with the one-time config token, receives its
// generated config.toml and writes it next to the binary. No copy/paste of
// the config file (and its edge token) needed.
export function buildConfigFetchCmd(configToken: string): string {
  return `./ksedge config --panel '${panelOrigin()}' --config-token '${configToken}'`;
}

// buildInstallConfigCmd downloads the ksedge release, then runs the same
// one-time-token config fetch, then starts the edge in the background. One
// paste on a fresh host fully provisions it.
export function buildInstallConfigCmd(configToken: string): string {
  return `curl -L -o ksedge '${KSEDGE_URL}' && chmod +x ksedge && ./ksedge config --panel '${panelOrigin()}' --config-token '${configToken}' && (./ksedge launch &)`;
}

// KSEDGE_URL re-exported from types for backwards compat (prefer import from types/nodeForm).
export { KSEDGE_URL };