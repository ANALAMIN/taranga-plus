import { useState, useEffect, useCallback } from 'react';
import { ChannelFinal, Category } from '../types';
import { getChannels } from '../services/apiClient';
import { localDb } from '../services/localDb';
import { applyStreamProxy } from '../services/streamProxy';

export function useChannels() {
  const [channels, setChannels] = useState<ChannelFinal[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const fetchAndSetChannels = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // Fetch the catalog, then rewrite http:// stream URLs to route through the
      // Worker /proxy/stream endpoint so they load under webSecurity:true (no
      // mixed-content block). https:// sources pass through untouched.
      const data = applyStreamProxy(await getChannels());
      setChannels(data);
    } catch (err: unknown) {
      console.error(err);
      setError(err instanceof Error ? err.message : 'Failed to fetch channels');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAndSetChannels();
  }, [fetchAndSetChannels]);

  return {
    channels,
    loading,
    error,
    refresh: fetchAndSetChannels,
  };
}
