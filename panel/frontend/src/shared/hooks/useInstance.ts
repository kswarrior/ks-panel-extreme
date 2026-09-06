import { useCallback, useEffect, useState } from 'react';
import { listInstances } from '@/shared/api/admin';
import { listMyInstances } from '@/features/auth/api/me';
import { useAuthStore } from '@/shared/stores/authStore';
import { PermissionKey } from '@/shared/types/permissions';
import type { Instance } from '@/features/instances/types/instance';

// Parse a template/instance "spec"/"config" JSON blob into a plain map. The
// spec is opaque to the panel, so callers that only want a couple of known
// keys (env, ports, mounts, limits…) read off this helper without each
// subpage re-implementing JSON.parse + try/catch.
export function parseConfig(raw?: string): any {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed;
    }
  } catch (e) {
    console.error('Error parsing config:', e);
  }
  return {};
}

interface StringPair { key: string; value: string }

export function toPairs(m: any): StringPair[] {
  if (!m || typeof m !== 'object') return [];
  if (Array.isArray(m)) {
    return m
      .map((it) => {
        if (Array.isArray(it) && it.length >= 2) return { key: String(it[0]), value: String(it[1]) };
        if (it && typeof it === 'object') return { key: String(it.key ?? it.name ?? ''), value: String(it.value ?? it.path ?? '') };
        return null;
      })
      .filter(Boolean) as StringPair[];
  }
  return Object.entries(m).map(([key, val]) => ({ key, value: String(val) }));
}

export interface PortMapping { host: string; container: string; protocol: string }
export function toPorts(v: any): PortMapping[] {
  if (!Array.isArray(v)) return [];
  return v.map((p: any) => {
    if (Array.isArray(p) && p.length >= 2) {
      return { host: String(p[0]), container: String(p[1]), protocol: String(p[2] ?? 'tcp') };
    }
    if (p && typeof p === 'object') {
      return {
        host: String(p.host ?? p.host_port ?? ''),
        container: String(p.container ?? p.container_port ?? p.target ?? ''),
        protocol: String(p.protocol ?? 'tcp'),
      };
    }
    if (typeof p === 'string') {
      // "8080:80/tcp" form
      const m = p.match(/^([^:]+):([^:/]+)(?:\/(\w+))?$/);
      if (m) return { host: m[1], container: m[2], protocol: m[3] ?? 'tcp' };
    }
    return null;
  }).filter(Boolean) as PortMapping[];
}

export interface MountBinding { host: string; container: string; mode?: string }
export function toMounts(v: any): MountBinding[] {
  if (!Array.isArray(v)) return [];
  return v.map((m: any) => {
    if (Array.isArray(m) && m.length >= 2) return { host: String(m[0]), container: String(m[1]), mode: m[2] ? String(m[2]) : undefined };
    if (typeof m === 'string') {
      const parts = m.split(':');
      if (parts.length >= 2) return { host: parts[0], container: parts[1], mode: parts[2] };
    }
    if (m && typeof m === 'object') {
      return { host: String(m.host ?? m.source ?? ''), container: String(m.container ?? m.target ?? m.destination ?? ''), mode: m.mode ? String(m.mode) : undefined };
    }
    return null;
  }).filter(Boolean) as MountBinding[];
}

export interface ParsedConfig {
  raw: Record<string, any>;
  image: string;
  ports: PortMapping[];
  mounts: MountBinding[];
  env: StringPair[];
  limits: StringPair[];
  command: string[];
  install: string[];
  restart: string;
  category: string;
  type: string;
}

export function extractConfig(cfg: Record<string, any>): ParsedConfig {
  return {
    raw: cfg,
    image: typeof cfg.image === 'string' ? cfg.image : '',
    ports: toPorts(cfg.ports),
    mounts: toMounts(cfg.mounts ?? cfg.volumes),
    env: toPairs(cfg.env),
    // Docker nests resource limits under `limits`; kvm / multipass put
    // `cpus` / `memory` / `disk` at the spec root. Merge both shapes so the
    // Settings page lists every declared reservation regardless of driver.
    limits: (() => {
      const pairs = toPairs(cfg.limits);
      const have = new Set(pairs.map((p) => p.key));
      for (const k of ['cpus', 'cpu', 'memory', 'mem', 'ram', 'disk', 'disk_size', 'storage']) {
        if (cfg[k] != null && cfg[k] !== '' && !have.has(k)) {
          pairs.push({ key: k, value: String(cfg[k]) });
        }
      }
      const adv = cfg.advanced ?? {};
      for (const [prefix, keys] of [
        ['kvm', ['vcpus']],
        ['multipass', ['cpus', 'memory', 'mem_mb', 'disk', 'disk_mb']],
        ['lxd', ['limits_cpu_allowance']],
      ] as [string, string[]][]) {
        const sub: Record<string, any> = typeof adv === 'object' && adv !== null && !Array.isArray(adv) ? adv[prefix] ?? {} : {};
        for (const k of keys) {
          if (sub[k] != null && sub[k] !== '' && !have.has(k)) {
            pairs.push({ key: k, value: String(sub[k]) });
            have.add(k);
          }
        }
      }
      return pairs;
    })(),
    command: Array.isArray(cfg.command) ? cfg.command.map(String) : (typeof cfg.command === 'string' ? [cfg.command] : []),
    install: Array.isArray(cfg.install) ? cfg.install.map(String) : [],
    restart: typeof cfg.restart === 'string' ? cfg.restart : '',
    category: typeof cfg.category === 'string' ? cfg.category : '',
    type: typeof cfg.type === 'string' ? cfg.type : '',
  };
}

// useInstance resolves one instance by id. Non-admins fetch via the
// self-service endpoint so non-owners can't peek at instances they don't
// have access to.
export function useInstance(id: number) {
  const permissions = useAuthStore((s) => s.permissions);
  const canManage = permissions.includes(PermissionKey.MANAGE_INSTANCES);
  const [instance, setInstance] = useState<Instance | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async (silent = false) => {
    if (!silent) {
      setLoading(true);
      setError('');
    }
    try {
      const list = canManage ? await listInstances() : await listMyInstances();
      const found = list.find((i) => i.id === id);
      // A succeeded list load that omits this id means genuinely
      // deleted/not-visible: clear even on silent ticks so a deleted
      // instance surfaces instead of going stale forever. Transport
      // errors below keep preserving the previous instance.
      if (!found) setError('Instance not found.');
      setInstance(found || null);
    } catch (e: any) {
      if (!silent) setError(typeof e?.response?.data === 'string' ? e.response.data : e?.message || 'Failed to load instance');
      if (!silent) setInstance(null);
    } finally {
      if (!silent) setLoading(false);
    }
  }, [id, canManage]);

  useEffect(() => {
    load();
  }, [load]);

  // While the instance is mid-deploy ("creating") or running its install
  // workflow ("installing"), poll silently so pages that show install
  // progress (e.g. the home page's InstallBanner) update live after the
  // operator lands here straight from the deploy form. Silent = no skeleton
  // flash; polling stops as soon as the row leaves those statuses.
  const workflowInFlight =
    !!instance && (instance.status === 'creating' || instance.status === 'installing');
  useEffect(() => {
    if (!workflowInFlight) return;
    const t = window.setInterval(() => { void load(true); }, 3000);
    return () => window.clearInterval(t);
  }, [workflowInFlight, load]);

  return { instance, loading, error, reload: load };
}
