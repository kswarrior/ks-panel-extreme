import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { fetchOverview, type OverviewStats } from '../lib/api';

interface OverviewContextValue {
  overview: OverviewStats | null;
  loading: boolean;
  error: string | null;
  lastUpdated: Date | null;
  refresh: () => void;
}

const OverviewContext = createContext<OverviewContextValue | undefined>(undefined);

export function OverviewProvider({ children }: { children: ReactNode }) {
  const [overview, setOverview] = useState<OverviewStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const inFlight = useRef(false);

  const load = useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    try {
      const next = await fetchOverview();
      setOverview(next);
      setError(null);
      setLastUpdated(new Date());
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      inFlight.current = false;
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    const timer = window.setInterval(() => {
      void load();
    }, 5000);
    return () => window.clearInterval(timer);
  }, [load]);

  const value = useMemo<OverviewContextValue>(
    () => ({ overview, loading, error, lastUpdated, refresh: () => void load() }),
    [overview, loading, error, lastUpdated, load]
  );

  return <OverviewContext.Provider value={value}>{children}</OverviewContext.Provider>;
}

export function useOverview(): OverviewContextValue {
  const ctx = useContext(OverviewContext);
  if (!ctx) throw new Error('useOverview must be used inside OverviewProvider');
  return ctx;
}
