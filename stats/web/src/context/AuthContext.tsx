import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

interface MeResponse {
  authenticated?: boolean;
  configured?: boolean;
  username?: string;
}

interface AuthContextValue {
  username: string | null;
  isAdmin: boolean;
  loading: boolean;
  configured: boolean;
  login: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  invalidate: () => void;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [username, setUsername] = useState<string | null>(null);
  const [configured, setConfigured] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch('/api/auth/me', {
          credentials: 'include',
          cache: 'no-store',
        });
        if (!res.ok) throw new Error(`http ${res.status}`);
        const data = (await res.json()) as MeResponse;
        if (cancelled) return;
        setConfigured(Boolean(data.configured));
        setUsername(data.authenticated && data.username ? data.username : null);
      } catch {
        if (cancelled) return;
        setConfigured(false);
        setUsername(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  const login = useCallback(async (user: string, password: string) => {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: user, password }),
    });

    if (res.status === 401) throw new Error('Invalid username or password.');
    if (res.status === 503) throw new Error('Admin login is not configured.');
    if (!res.ok) throw new Error(`Login failed (${res.status}).`);

    const data = (await res.json().catch(() => ({}))) as { username?: string };
    setConfigured(true);
    setUsername(data.username || user);
  }, []);

  const logout = useCallback(async () => {
    try {
      await fetch('/api/auth/logout', {
        method: 'POST',
        credentials: 'include',
      });
    } finally {
      setUsername(null);
    }
  }, []);

  const invalidate = useCallback(() => setUsername(null), []);

  const value = useMemo<AuthContextValue>(
    () => ({
      username,
      isAdmin: Boolean(username),
      loading,
      configured,
      login,
      logout,
      invalidate,
    }),
    [username, loading, configured, login, logout, invalidate]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
