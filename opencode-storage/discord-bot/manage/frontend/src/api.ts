const base = '';

async function req(path: string, opts: RequestInit = {}) {
  const res = await fetch(base + path, opts);
  const text = await res.text();
  try { return JSON.parse(text); } catch { return text as any; }
}

export const api = {
  status: () => req('/api/status'),
  bot: {
    start: () => req('/api/bot/start', { method: 'POST' }),
    stop: () => req('/api/bot/stop', { method: 'POST' }),
    restart: () => req('/api/bot/restart', { method: 'POST' }),
  },
  logs: {
    get: (lines=500) => req(`/api/logs?lines=${lines}`),
    clear: () => req('/api/logs/clear', { method: 'POST' }),
    download: () => window.open('/api/logs/download', '_blank'),
  },
  files: {
    list: (path='') => req(`/api/files?path=${encodeURIComponent(path)}`),
    read: (path: string) => req(`/api/files/read?path=${encodeURIComponent(path)}`),
    write: (path: string, content: string) => req('/api/files/write', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ path, content })}),
    mkdir: (path: string) => req('/api/files/mkdir', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ path })}),
    create: (path: string, isDir=false) => req('/api/files/create', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ path, isDir })}),
    del: (path: string) => req('/api/files/delete', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ path })}),
    rename: (from: string, to: string) => req('/api/files/rename', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ from, to })}),
    download: (path: string) => window.open(`/api/files/download?path=${encodeURIComponent(path)}`,'_blank'),
    upload: async (targetPath: string, files: FileList) => {
      const fd = new FormData();
      Array.from(files).forEach(f=> fd.append('files', f));
      const res = await fetch(`/api/files/upload?path=${encodeURIComponent(targetPath)}`, { method:'POST', body: fd });
      return res.json();
    }
  },
  db: {
    list: () => req('/api/db/list'),
    tables: (db: string) => req(`/api/db/tables?db=${encodeURIComponent(db)}`),
    schema: (db: string, table: string) => req(`/api/db/schema?db=${encodeURIComponent(db)}&table=${encodeURIComponent(table)}`),
    rows: (db: string, table: string, page=1, limit=50, search='') => req(`/api/db/rows?db=${encodeURIComponent(db)}&table=${encodeURIComponent(table)}&page=${page}&limit=${limit}&search=${encodeURIComponent(search)}`),
    query: (db: string, sql: string) => req('/api/db/query', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ db, sql })}),
  },
  git: {
    info: () => req('/api/git/info'),
    update: (url: string, branch?: string, subPath?: string, fileRoot?: string, deleteAll?: boolean) => req('/api/git/update', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ url, branch, subPath, fileRoot, deleteAll })}),
  }
};
