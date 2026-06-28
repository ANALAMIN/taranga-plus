import { useState, useEffect, useCallback } from 'react';
import { ChannelFinal, Category } from '../types';
import { getChannels } from '../services/apiClient';
import { localDb } from '../services/localDb';

export function useChannels() {
  const [channels, setChannels] = useState<ChannelFinal[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const fetchAndSetChannels = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getChannels();
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
