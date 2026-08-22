import client from '@/shared/api/client';
import type {
  Mod,
  ModUpsertPayload,
  ModActivateConflict,
  PermissionRequest,
  SlotRegistryResponse,
} from '@/features/mods/types/mod';

// Admin Mods API — operates on the /api/mods collection, gated by
// MANAGE_MODS on the backend (requirePermission middleware). The session is
// carried by the HttpOnly cookie, so no extra headers.
//
// Mods install INACTIVE; activation only succeeds after the admin explicitly
// approves every requested capability (setModGrants), so the grant + activate
// cycle is always admin-driven.

// extractApiErrorMessage normalises an axios error's response body into a
// human-readable string. The backend handlers in this package return a MIX of
// plain-text bodies (via http.Error) and small JSON envelopes (via
// writeJSONStatus writing {"error": "..."} / {"message": "..."}). Without
// normalising, the JSON envelopes would render in the UI as the literal
// string "[object Object]" (caught once on the URL-install error path where
// the 502 fallback uses a JSON envelope). The union here covers both shapes
// so callers can keep the simple `setError(extractApiErrorMessage(e, "…"))`
// pattern regardless of which handler produced the refusal.
export function extractApiErrorMessage(e: any, fallback: string): string {
  const data = e?.response?.data;
  if (typeof data === 'string' && data.trim()) return data;
  if (data && typeof data === 'object') {
    const msg = data.error ?? data.message ?? data.detail;
    if (typeof msg === 'string' && msg.trim()) return msg;
    // Last resort: surface the JSON so the admin can paste it into a bug
    // report rather than seeing "[object Object]".
    try {
      const json = JSON.stringify(data);
      if (json && json !== '{}') return json;
    } catch {
      /* fall through */
    }
  }
  if (typeof e?.message === 'string' && e.message.trim()) return e.message;
  return fallback;
}

// GrantDecision is one (capability -> approved) decision the admin sends when
// approving. capability must be one the mod actually requested; the backend
// skips unknown caps (an empty list means "deny all / leave pending").
export interface GrantDecision {
  capability: string;
  granted: boolean;
}

export async function listMods(): Promise<Mod[]> {
  const res = await client.get<Mod[]>('/api/mods/');
  return res.data;
}

export async function getMod(id: number): Promise<Mod> {
  const res = await client.get<Mod>(`/api/mods/${id}`);
  return res.data;
}

// Create a mod from a hand-authored manifest (JSON body). The backend parses
// the manifest, validates the requested capabilities against the well-known
// set, and seeds the mod_permissions rows in the pending (granted=false) state.
export async function createMod(payload: ModUpsertPayload): Promise<Mod> {
  const res = await client.post<Mod>('/api/mods/', payload);
  return res.data;
}

// Upload a .kspm mod package (zip archive bundling the manifest + frontend /
// backend / page assets). Multipart so the panel reads the zip bytes without
// the SPA having to base64 them; the server finds manifest.json inside the zip,
// validates the requested capabilities, stores the .kspm on disk, and installs
// the mod inactive — mirroring the SettingsLogo upload path.
export async function uploadModPackage(packageFile: File): Promise<Mod> {
  const form = new FormData();
  form.append('package', packageFile);
  const res = await client.post<Mod>('/api/mods/', form, {
    headers: { 'Content-Type': 'multipart/form-data' },
    responseType: 'json',
  });
  return res.data;
}

// Download a mod's .kspm package zip. Returns the blob so the SPA can trigger a
// browser save-as with the mod's slug as the filename. Mods installed from a
// zip serve the original bytes; Studio/URL/JSON mods are synthesised server-side
// from their manifest + spec so every mod is downloadable.
export async function downloadMod(id: number): Promise<Blob> {
  const res = await client.get<Blob>(`/api/mods/${id}/download`, {
    responseType: 'blob',
  });
  return res.data;
}

// Editable fields only: name / version / description / spec. The requested
// permission set is NOT mutable here — re-declaring capabilities is a
// re-upload, otherwise the grant contract would silently change under the
// admin.
export async function updateMod(
  id: number,
  payload: Pick<ModUpsertPayload, 'name' | 'version' | 'description' | 'spec'>,
): Promise<Mod> {
  const res = await client.put<Mod>(`/api/mods/${id}`, payload);
  return res.data;
}

// Install a mod by fetching its manifest from a URL. The server-side handler
// SSRF-guards the fetch (public IPs only, DNS-pinned, size/time capped),
// parses the body, and reuses the same CreateMod path the file uploader uses.
// Resolves with the new (inactive) mod; rejects with a 4xx/5xx + a useful
// message on fetch / parse / duplicate-slug failures.
export async function installModFromUrl(url: string): Promise<Mod> {
  const res = await client.post<Mod>(
    '/api/mods/url',
    { url },
    { headers: { 'Content-Type': 'application/json' } },
  );
  return res.data;
}

// Save a mod that was authored in the Mod Studio (no-code builder or raw
// JSON editor). The Studio emits a fully-formed manifest the same way
// uploadModPackage's JSON path does, so we send it through the standard create
// route — the X-KS-Source header tags the row with source='studio' for the
// install provenance UI. The server wraps the manifest into a .kspm package on
// disk so the Studio-built mod is still downloadable. Falls back to
// application/json if the caller didn't supply an explicit source.
export async function createModFromStudio(
  manifest: Record<string, any>,
  source: 'studio' | 'json' = 'studio',
): Promise<Mod> {
  const res = await client.post<Mod>(
    '/api/mods/',
    manifest,
    { headers: { 'Content-Type': 'application/json', 'X-KS-Source': source } },
  );
  return res.data;
}

export async function deleteMod(id: number): Promise<void> {
  await client.delete(`/api/mods/${id}`);
}

// Approve / deny each requested capability. The backend stores only
// capabilities the mod actually requested and skips the rest (an empty list
// means "deny all / leave pending"). Activation refuses to flip until every
// requested cap has granted = true.
export async function setModGrants(
  id: number,
  grants: GrantDecision[],
): Promise<void> {
  await client.put(`/api/mods/${id}/grants`, { grants });
}

// Activate a mod. Resolves `void` on success. On a 409 (permissions still
// pending) it resolves the refusal body instead of throwing, so the caller can
// drive the grant modal inline. Any non-409 error still throws.
export async function activateMod(
  id: number,
): Promise<void | ModActivateConflict> {
  try {
    await client.post(`/api/mods/${id}/activate`);
    return;
  } catch (e: any) {
    if (e?.response?.status === 409) {
      return e.response.data as ModActivateConflict;
    }
    throw e;
  }
}

export async function deactivateMod(id: number): Promise<void> {
  await client.post(`/api/mods/${id}/deactivate`);
}

// ---------------------------------------------------------------------------
// Mod Engine v2 slot registry.
// ---------------------------------------------------------------------------

// Fetch the union of every active mod's declared UI slots plus the runtime
// mode (noop vs goja). The React <Slot /> component calls this once and caches
// so mounting injection points across the layout costs a single round-trip.
export async function fetchSlots(): Promise<SlotRegistryResponse> {
  const res = await client.get<SlotRegistryResponse>('/api/mods/v1/slots');
  return res.data;
}
