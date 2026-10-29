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
import { fetchPanels, UnauthorizedError } from '../lib/api';
import type { Panel } from '../lib/types';
import { useAuth } from './AuthContext';

interface PanelsContextValue {
  panels: Panel[];
  loading: boolean;
  error: string | null;
  lastUpdated: Date | null;
  refresh: () => void;
}

const PanelsContext = createContext<PanelsContextValue | undefined>(undefined);

export function PanelsProvider({ children }: { children: ReactNode }) {
  const { isAdmin, loading: authLoading, invalidate } = useAuth();
  const [panels, setPanels] = useState<Panel[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const inFlight = useRef(false);

  const load = useCallback(async () => {
    if (!isAdmin || inFlight.current) return;
    inFlight.current = true;
    try {
      const next = await fetchPanels();
      setPanels(next);
      setError(null);
      setLastUpdated(new Date());
    } catch (err) {
      if (err instanceof UnauthorizedError) {
        setPanels([]);
        setLastUpdated(null);
        setError(null);
        invalidate();
        return;
      }
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      inFlight.current = false;
      setLoading(false);
    }
  }, [isAdmin, invalidate]);

  useEffect(() => {
    if (authLoading) return;
    if (!isAdmin) {
      setPanels([]);
      setError(null);
      setLastUpdated(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    void load();
    const timer = window.setInterval(() => {
      void load();
    }, 5000);
    return () => window.clearInterval(timer);
  }, [authLoading, isAdmin, load]);

  const value = useMemo<PanelsContextValue>(
    () => ({ panels, loading, error, lastUpdated, refresh: () => void load() }),
    [panels, loading, error, lastUpdated, load]
  );

  return <PanelsContext.Provider value={value}>{children}</PanelsContext.Provider>;
}

export function usePanels(): PanelsContextValue {
  const ctx = useContext(PanelsContext);
  if (!ctx) throw new Error('usePanels must be used inside PanelsProvider');
  return ctx;
}
