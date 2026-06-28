import { useState, useEffect, useRef, useCallback } from 'react';
import { ChannelFinal } from '../types';
import { getChannels } from '../services/apiClient';
import { localDb } from '../services/localDb';

function getLatestTimestamp(channels: ChannelFinal[]): number {
  let max = 0;
  for (const ch of channels) {
    const t = new Date(ch.lastValidated).getTime();
    if (t > max) max = t;
  }
  return max;
}

export function useChannels() {
  const [channels, setChannels] = useState<ChannelFinal[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const loadedRef = useRef(false);

  useEffect(() => {
    if (loadedRef.current) return;
    loadedRef.current = true;

    let cancelled = false;

    (async () => {
      // 1. Load from IndexedDB cache instantly
      const cached = await localDb.getCachedChannels();
      if (cached && cached.length > 0 && !cancelled) {
        setChannels(cached);
        setLoading(false);
      }

      try {
        // 2. Fetch latest from GitHub in background
        const fresh = await getChannels();
        if (cancelled) return;

        // 3. Compare timestamps — only update if newer
        const freshTs = getLatestTimestamp(fresh);
        const cachedTs = cached ? getLatestTimestamp(cached) : 0;

        if (freshTs > cachedTs) {
          await localDb.cacheChannels(fresh);
          setChannels(fresh);
        } else if (!cached || cached.length === 0) {
          setChannels(fresh);
        }
      } catch (err: unknown) {
        console.error(err);
        if (!cached || cached.length === 0) {
          setError(err instanceof Error ? err.message : 'Failed to fetch channels');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, []);

  return {
    channels,
    loading,
    error,
    refresh: useCallback(async () => {
      setError(null);
      try {
        const fresh = await getChannels();
        await localDb.cacheChannels(fresh);
        setChannels(fresh);
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : 'Failed to fetch channels');
      }
    }, []),
  };
}
