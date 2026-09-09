import client from '@/shared/api/client';

// Native Files API for the built-in Files page (pure builtin — not an
// instance-pages system page). Thin typed wrapper over the panel's
// /api/instances/:id/files bridges, which proxy to the owning edge.
// Auth + permission gates run server-side; errors normalize to Error.

export interface FileEntry {
  name: string;
  size: number;
  mode: string;
  is_dir: boolean;
  mod_time: number;
}

export interface FileStat {
  name: string;
  size: number;
  mode: string;
  is_dir: boolean;
  mod_time: number;
}

export function filesError(e: unknown, fallback: string): Error {
  const d: unknown = (e as any)?.response?.data;
  const msg =
    typeof d === 'string'
      ? d
      : d && typeof (d as any).error === 'string'
        ? (d as any).error
        : (e as any)?.message || fallback;
  const text = String(msg || fallback);
  // Upstream proxies answer outages with HTML error pages — collapse those
  // (and oversized bodies) to a readable line instead of kilobytes of markup.
  if (/^\s*</.test(text) || text.length > 300) return new Error(fallback);
  return new Error(text);
}

function q(path: string): string {
  return `?op=list&path=${encodeURIComponent(path)}`;
}

export async function listFiles(instanceId: number, dir: string): Promise<FileEntry[]> {
  try {
    const res = await client.get(`/api/instances/${instanceId}/files${q(dir)}`);
    const data: any = res.data;
    const raw = Array.isArray(data?.entries) ? data.entries : [];
    return raw
      .filter((e: any) => e && typeof e.name === 'string')
      .map((e: any) => ({
        name: String(e.name),
        size: Number(e.size) || 0,
        mode: typeof e.mode === 'string' ? e.mode : '',
        is_dir: !!e.is_dir,
        mod_time: Number(e.mod_time) || 0,
      }));
  } catch (e) {
    throw filesError(e, 'Failed to list files');
  }
}

export async function statPath(instanceId: number, path: string): Promise<FileStat> {
  try {
    const res = await client.get(
      `/api/instances/${instanceId}/files?op=stat&path=${encodeURIComponent(path)}`,
    );
    const d: any = res.data;
    return {
      name: String(d?.name ?? ''),
      size: Number(d?.size) || 0,
      mode: typeof d?.mode === 'string' ? d.mode : '',
      is_dir: !!d?.is_dir,
      mod_time: Number(d?.mod_time) || 0,
    };
  } catch (e) {
    throw filesError(e, 'Failed to stat path');
  }
}

// readFileText fetches a file's raw content. The endpoint streams bytes;
// axios may JSON-parse bodies that happen to be valid JSON, so non-strings
// are stringified back (a file containing `123` stays `123`).
export async function readFileText(instanceId: number, path: string): Promise<string> {
  try {
    const res = await client.get(
      `/api/instances/${instanceId}/files/read?path=${encodeURIComponent(path)}`,
      { timeout: 60000 },
    );
    const d: unknown = res.data;
    if (typeof d === 'string') return d;
    if (d === null || d === undefined) return '';
    return typeof d === 'object' ? JSON.stringify(d) : String(d);
  } catch (e) {
    throw filesError(e, 'Failed to read file');
  }
}

export async function downloadFile(instanceId: number, path: string): Promise<void> {
  const name = String(path).split('/').pop() || 'download';
  try {
    const res = await client.get(
      `/api/instances/${instanceId}/files/read?path=${encodeURIComponent(path)}`,
      { responseType: 'blob', timeout: 600000 },
    );
    const url = URL.createObjectURL(res.data as Blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 4000);
  } catch (e) {
    throw filesError(e, 'Download failed');
  }
}

export async function writeFile(instanceId: number, path: string, text: string): Promise<void> {
  try {
    await client.post(
      `/api/instances/${instanceId}/files?op=write&path=${encodeURIComponent(path)}`,
      text,
      { headers: { 'Content-Type': 'text/plain' }, timeout: 60000 },
    );
  } catch (e) {
    throw filesError(e, 'Failed to write file');
  }
}

export async function makeDir(instanceId: number, path: string): Promise<void> {
  try {
    await client.post(
      `/api/instances/${instanceId}/files?op=mkdir&path=${encodeURIComponent(path)}`,
    );
  } catch (e) {
    throw filesError(e, 'Failed to create folder');
  }
}

export async function deletePath(instanceId: number, path: string): Promise<void> {
  try {
    await client.delete(
      `/api/instances/${instanceId}/files?op=delete&path=${encodeURIComponent(path)}`,
    );
  } catch (e) {
    throw filesError(e, 'Failed to delete');
  }
}

export async function renamePath(instanceId: number, from: string, to: string): Promise<void> {
  try {
    await client.post(
      `/api/instances/${instanceId}/files?op=rename&path=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,
    );
  } catch (e) {
    throw filesError(e, 'Failed to rename');
  }
}

export async function copyPath(instanceId: number, from: string, to: string): Promise<void> {
  try {
    await client.post(
      `/api/instances/${instanceId}/files?op=copy&path=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,
    );
  } catch (e) {
    throw filesError(e, 'Failed to copy');
  }
}

export async function chmodPath(instanceId: number, path: string, mode: string): Promise<void> {
  try {
    await client.post(
      `/api/instances/${instanceId}/files?op=chmod&path=${encodeURIComponent(path)}&mode=${encodeURIComponent(mode)}`,
    );
  } catch (e) {
    throw filesError(e, 'Failed to change permissions');
  }
}

export interface ArchiveResult {
  ok: boolean;
  path: string;
  count: number;
}

// archivePaths compresses `names` (basenames relative to `dir`) into the
// archive at `destArchive` (must end with .zip or .tar.gz). Pass an empty
// names list to archive the whole directory.
export async function archivePaths(
  instanceId: number,
  dir: string,
  names: string[],
  destArchive: string,
): Promise<ArchiveResult> {
  try {
    const res = await client.post(
      `/api/instances/${instanceId}/files?op=archive&path=${encodeURIComponent(dir)}&to=${encodeURIComponent(destArchive)}`,
      { names },
      { timeout: 600000 },
    );
    const d: any = res.data;
    return { ok: true, path: String(d?.path ?? destArchive), count: Number(d?.count ?? names.length) || 0 };
  } catch (e) {
    throw filesError(e, 'Failed to create archive');
  }
}

export async function extractArchive(instanceId: number, archivePath: string, destDir?: string): Promise<void> {
  try {
    const qs =
      `/api/instances/${instanceId}/files?op=extract&path=${encodeURIComponent(archivePath)}` +
      (destDir ? `&to=${encodeURIComponent(destDir)}` : '');
    await client.post(qs, null, { timeout: 600000 });
  } catch (e) {
    throw filesError(e, 'Failed to extract archive');
  }
}

export interface SearchHit {
  path: string; // rel path from the search root, e.g. "world/level.dat"
  name: string;
  is_dir: boolean;
  size: number;
  mod_time: number;
}

export async function searchFiles(
  instanceId: number,
  dir: string,
  query: string,
  limit = 100,
): Promise<{ entries: SearchHit[]; truncated: boolean }> {
  try {
    const res = await client.get(
      `/api/instances/${instanceId}/files?op=search&path=${encodeURIComponent(dir)}&q=${encodeURIComponent(query)}&limit=${limit}`,
      { timeout: 60000 },
    );
    const data: any = res.data;
    const raw = Array.isArray(data?.entries) ? data.entries : [];
    return {
      entries: raw
        .filter((e: any) => e && typeof e.name === 'string')
        .map((e: any) => ({
          path: String(e.path ?? e.name),
          name: String(e.name),
          is_dir: !!e.is_dir,
          size: Number(e.size) || 0,
          mod_time: Number(e.mod_time) || 0,
        })),
      truncated: !!data?.truncated,
    };
  } catch (e) {
    throw filesError(e, 'Search failed');
  }
}

// fetchFileBlob returns raw bytes for previews (images, text snippets).
// Unlike readFileText it never reinterprets binary as UTF-8.
export async function fetchFileBlob(instanceId: number, path: string): Promise<Blob> {
  try {
    const res = await client.get(
      `/api/instances/${instanceId}/files/read?path=${encodeURIComponent(path)}`,
      { responseType: 'blob', timeout: 600000 },
    );
    return res.data as Blob;
  } catch (e) {
    throw filesError(e, 'Failed to fetch file');
  }
}

// uploadFile streams raw bytes; targetPath is the FULL destination file
// path (that is what the edge writes). Long timeout for large files.
export async function uploadFile(
  instanceId: number,
  targetPath: string,
  file: Blob,
  onProgress?: (pct: number) => void,
): Promise<void> {
  try {
    await client.post(
      `/api/instances/${instanceId}/files?op=upload&path=${encodeURIComponent(targetPath)}`,
      file,
      {
        headers: { 'Content-Type': 'application/octet-stream' },
        timeout: 600000,
        onUploadProgress: (ev) => {
          if (!onProgress || !ev.total) return;
          onProgress(Math.min(99, Math.round((ev.loaded / ev.total) * 100)));
        },
      },
    );
    onProgress?.(100);
  } catch (e) {
    throw filesError(e, 'Upload failed');
  }
}

export async function uploadFromUrl(instanceId: number, dir: string, url: string): Promise<void> {
  try {
    await client.post(
      `/api/instances/${instanceId}/files/url`,
      { url, path: dir.endsWith('/') ? dir : `${dir}/` },
      { timeout: 600000 },
    );
  } catch (e) {
    throw filesError(e, 'Upload from URL failed');
  }
}

// joinPath joins a directory and an entry name without double slashes.
export function joinPath(base: string, name: string): string {
  if (!base) return `/${name}`;
  return base.endsWith('/') ? `${base}${name}` : `${base}/${name}`;
}

// validEntryName rejects path separators and dot segments for create/rename.
export function entryNameError(name: string): string {
  if (!name) return 'Name is required';
  if (name.includes('/')) return 'Name cannot contain /';
  if (name === '.' || name === '..') return 'Name cannot be . or ..';
  return '';
}

// classify mirrors the old file-manager icon rules closely enough for icon
// + colour choices. Binary-ish kinds are download-only (never opened in
// the text editor).
export type FileKind = 'folder' | 'image' | 'code' | 'text' | 'archive' | 'binary';

export function classifyEntry(e: Pick<FileEntry, 'name' | 'is_dir'>): FileKind {
  if (e.is_dir) return 'folder';
  const m = String(e.name).toLowerCase().match(/\.([a-z0-9]+)$/);
  const ext = m ? m[1] : '';
  if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'ico', 'bmp'].includes(ext)) return 'image';
  if (
    ['js', 'ts', 'tsx', 'jsx', 'json', 'yml', 'yaml', 'toml', 'ini', 'conf', 'cfg', 'sh', 'bash', 'py', 'rb', 'go', 'rs', 'java', 'kt', 'c', 'cpp', 'h', 'hpp', 'cs', 'php', 'html', 'css', 'scss', 'xml', 'sql', 'lua', 'pl'].includes(ext)
  ) {
    return 'code';
  }
  if (['md', 'txt', 'log', 'properties'].includes(ext)) return 'text';
  if (['zip', 'tar', 'gz', 'jar', '7z', 'rar'].includes(ext)) return 'archive';
  return 'binary';
}

export function formatBytes(n: number | null | undefined): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return '—';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let v = n;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${i >= 3 ? v.toFixed(1) : Math.round(v)} ${units[i]}`;
}
