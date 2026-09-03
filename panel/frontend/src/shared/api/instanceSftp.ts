import client from '@/shared/api/client';

export interface SFTPInfo {
  enabled: boolean;
  username: string;
  host: string;
  port: number;
  root: string;
  uri: string;
  has_password: boolean;
  // Present ONLY on the enable/rotate response (minted once). GET never
  // returns it — reveal goes through the audited secrets endpoint.
  password?: string;
  edge_error?: string;
  edge_warning?: string;
  port_warning?: string;
}

const base = (id: number) => `/api/instances/${id}/sftp`;

export async function getSFTP(instanceId: number): Promise<SFTPInfo> {
  const res = await client.get<SFTPInfo>(base(instanceId));
  return res.data;
}

export async function enableSFTP(instanceId: number): Promise<SFTPInfo> {
  const res = await client.post<SFTPInfo>(`${base(instanceId)}/enable`);
  return res.data;
}

export async function rotateSFTP(instanceId: number): Promise<SFTPInfo> {
  const res = await client.post<SFTPInfo>(`${base(instanceId)}/rotate`);
  return res.data;
}

export async function disableSFTP(instanceId: number): Promise<{ ok: boolean }> {
  const res = await client.post<{ ok: boolean }>(`${base(instanceId)}/disable`);
  return res.data;
}

export async function revealSFTPPassword(instanceId: number): Promise<string> {
  // Audited SFTP reveal (INSTANCES_EDIT, no "env" page dependency — the
  // generic secrets reveal is page-guarded behind "env", which SFTP
  // instances need not import).
  const res = await client.get<SFTPInfo>(`${base(instanceId)}?reveal=1`);
  if (res.data && typeof res.data.password === 'string' && res.data.password !== '') {
    return res.data.password;
  }
  throw new Error('Password not returned (missing INSTANCES_EDIT?)');
}
