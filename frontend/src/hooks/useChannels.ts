import { useState, useEffect, useCallback } from 'react';
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

async function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve((reader.result as string).split(',')[1]);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

async function resolveCachedLogos(channels: ChannelFinal[]): Promise<ChannelFinal[]> {
  const resolved = channels.map(ch => ({ ...ch }));
  await Promise.all(resolved.map(async (ch) => {
    if (ch.logoUrl && !ch.logoUrl.startsWith('data:')) {
      try {
        const blob = await localDb.getCachedLogo(ch.id);
        if (blob) {
          const base64 = await blobToBase64(blob);
          ch.logoUrl = `data:${blob.type};base64,${base64}`;
        }
      } catch {}
    }
  }));
  return resolved;
}

async function cacheHttpLogos(channels: ChannelFinal[]): Promise<void> {
  const httpChannels = channels.filter(c => c.logoUrl && !c.logoUrl.startsWith('data:'));
  if (httpChannels.length === 0) return;

  let changed = false;
  for (let i = 0; i < httpChannels.length; i += 6) {
    await Promise.all(httpChannels.slice(i, i + 6).map(async (ch) => {
      try {
        const existing = await localDb.getCachedLogo(ch.id);
        if (existing) {
          const base64 = await blobToBase64(existing);
          ch.logoUrl = `data:${existing.type};base64,${base64}`;
          changed = true;
          return;
        }
        const resp = await fetch(ch.logoUrl, { signal: AbortSignal.timeout(5000) });
        if (!resp.ok) return;
        const blob = await resp.blob();
        const base64 = await blobToBase64(blob);
        ch.logoUrl = `data:${blob.type};base64,${base64}`;
        await localDb.cacheLogo(ch.id, blob);
        changed = true;
      } catch {}
    }));
  }

  if (changed) await localDb.cacheChannels(channels);
}

export function useChannels() {
  const [channels, setChannels] = useState<ChannelFinal[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      const cached = await localDb.getCachedChannels();
      if (cancelled) return;

      if (cached && cached.length > 0) {
        const withLogos = await resolveCachedLogos(cached);
        if (cancelled) return;
        setChannels(withLogos);
        setLoading(false);
      }

      try {
        const fresh = await getChannels();
        if (cancelled) return;

        const freshTs = getLatestTimestamp(fresh);
        const cachedTs = cached ? getLatestTimestamp(cached) : 0;

        if (freshTs > cachedTs) {
          // Resolve any already-cached logos from IDB for instant display,
          // then cache remaining HTTP logos in background.
          const withLogos = await resolveCachedLogos(fresh);
          if (cancelled) return;
          cacheHttpLogos(fresh).then(() => {
            if (!cancelled) setChannels([...fresh]);
          });
          setChannels(withLogos);
        } else if (!cached || cached.length === 0) {
          const withLogos = await resolveCachedLogos(fresh);
          if (cancelled) return;
          setChannels(withLogos);
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
