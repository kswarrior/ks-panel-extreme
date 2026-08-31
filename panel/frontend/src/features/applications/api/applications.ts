import client from '@/shared/api/client';
import type {
  Application,
  ApplicationConfigField,
  ApplicationUpsertPayload,
  ApplicationActivateConflict,
  ApplicationPermissionReq,
  ApplicationRun,
  ApplicationRunRequest,
} from '@/features/applications/types/application';

// Re-export types for convenience
export type {
  Application,
  ApplicationConfigField,
  ApplicationActivateConflict,
  ApplicationPermissionReq,
  ApplicationRun,
  ApplicationRunRequest,
};

export interface GrantDecision {
  capability: string;
  granted: boolean;
}

// Admin Applications API — operates on /api/applications, gated by
// MANAGE_APPLICATIONS on the backend. Mirrors the mods API exactly.

export async function listApplications(): Promise<Application[]> {
  const res = await client.get<Application[]>('/api/applications/');
  return res.data;
}

export async function getApplication(id: number): Promise<Application> {
  const res = await client.get<Application>(`/api/applications/${id}`);
  return res.data;
}

export async function createApplication(payload: ApplicationUpsertPayload): Promise<Application> {
  const res = await client.post<Application>('/api/applications/', payload);
  return res.data;
}

export async function uploadApplicationFile(
  manifestFile: File,
  specFile?: File,
): Promise<Application> {
  const form = new FormData();
  form.append('manifest', manifestFile);
  if (specFile) form.append('spec', specFile);
  const res = await client.post<Application>('/api/applications/', form, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return res.data;
}

export async function updateApplication(
  id: number,
  payload: Pick<ApplicationUpsertPayload, 'name' | 'category' | 'version' | 'description' | 'icon' | 'runtime' | 'entrypoint' | 'config_schema'> &
    Partial<Pick<ApplicationUpsertPayload, 'files'>>,
): Promise<Application> {
  const res = await client.put<Application>(`/api/applications/${id}`, payload);
  return res.data;
}

export async function installApplicationFromUrl(url: string): Promise<Application> {
  const res = await client.post<Application>(
    '/api/applications/url',
    { url },
    { headers: { 'Content-Type': 'application/json' } },
  );
  return res.data;
}

export async function deleteApplication(id: number): Promise<void> {
  await client.delete(`/api/applications/${id}`);
}

export async function setApplicationGrants(
  id: number,
  grants: GrantDecision[],
): Promise<void> {
  await client.put(`/api/applications/${id}/grants`, { grants });
}

export async function activateApplication(
  id: number,
): Promise<void | ApplicationActivateConflict> {
  try {
    await client.post(`/api/applications/${id}/activate`);
    return;
  } catch (e: any) {
    if (e?.response?.status === 409) {
      return e.response.data as ApplicationActivateConflict;
    }
    throw e;
  }
}

export async function deactivateApplication(id: number): Promise<void> {
  await client.post(`/api/applications/${id}/deactivate`);
}

export async function updateApplicationEnv(
  id: number,
  env: Record<string, string>
): Promise<void> {
  await client.post(`/api/applications/${id}/env`, { env });
}

// Executes the application's script once on the chosen target and returns
// the completed run row (status/output/exit_code). Rejects with an Axios
// error whose `.response.data` is the plain-text backend reason. Runs are
// synchronous and may legally take up to timeout_sec (5–1800s), so the 15s
// client default is explicitly lifted for THIS call only (timeout: 0 = no
// client-side abort) — same pattern as switchDatabaseEngine in admin.ts.
export async function runApplication(
  id: number,
  req: ApplicationRunRequest,
): Promise<ApplicationRun> {
  const res = await client.post<ApplicationRun>(`/api/applications/${id}/run`, req, {
    timeout: 0,
  });
  return res.data;
}

// Recent run history for one application, newest first.
export async function listApplicationRuns(id: number, limit = 25): Promise<ApplicationRun[]> {
  const res = await client.get<ApplicationRun[]>(`/api/applications/${id}/runs?limit=${limit}`);
  return res.data;
}
