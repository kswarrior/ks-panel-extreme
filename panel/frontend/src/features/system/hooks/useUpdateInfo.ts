import { useCallback, useEffect, useState } from 'react';
import { getUpdateInfo } from '@/shared/api/admin';
import type { UpdateInfoResponse } from '@/features/system/types/system';

export function useUpdateInfo(): {
  info: UpdateInfoResponse | null;
  infoErr: string;
  infoLoading: boolean;
  reload: () => Promise<UpdateInfoResponse>;
} {
  const [info, setInfo] = useState<UpdateInfoResponse | null>(null);
  const [infoErr, setInfoErr] = useState('');
  const [infoLoading, setInfoLoading] = useState(true);

  const load = useCallback(async (): Promise<UpdateInfoResponse> => {
    try {
      setInfoErr('');
      const i = await getUpdateInfo();
      setInfo(i);
      return i;
    } catch (e: unknown) {
      const err = e as { response?: { data?: string }; message?: string } | null;
      setInfoErr(err?.response?.data || err?.message || 'Failed to load update info');
      throw e;
    } finally {
      setInfoLoading(false);
    }
  }, []);

  useEffect(() => {
    let mounted = true;
    const runLoad = async () => {
      try {
        await load();
      } catch {
        // Prevent unhandled rejection from crashing React
      }
    };
    runLoad();
    return () => { mounted = false; };
  }, [load]);

  return { info, infoErr, infoLoading, reload: load };
}