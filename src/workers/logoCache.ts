import { localDb } from '../services/localDb';

/**
 * Service Worker registration and logo caching logic.
 * ON FIRST LAUNCH:
 *   1. Register Service Worker (sw.js in public/)
 *   2. The Service Worker will intercept logo requests and use IndexedDB.
 */
export async function registerLogoCacheWorker(): Promise<void> {
  if ('serviceWorker' in navigator) {
    try {
      const registration = await navigator.serviceWorker.register('/sw.js');
      console.log('Logo Cache ServiceWorker registered successfully with scope: ', registration.scope);
    } catch (err) {
      console.error('Logo Cache ServiceWorker registration failed: ', err);
    }
  }
}

/**
 * Concurrency cap for logo prefetching. Without a limit the original code fired
 * ~170 serialized `fetch`es; this lets a bounded pool of requests run in
 * parallel so the catalog warms quickly without saturating the network and
 * competing with the active video stream for bandwidth.
 */
const PREFETCH_CONCURRENCY = 6;

async function prefetchOne(channel: { id: string; logoUrl: string }): Promise<void> {
  if (!channel.logoUrl) return;
  try {
    // Skip work we've already done so a re-run (e.g. after a retry changes the
    // channels reference) is a cheap no-op.
    const existing = await localDb.getCachedLogo(channel.id);
    if (existing) return;

    const response = await fetch(channel.logoUrl, { cache: 'no-store' });
    if (response.ok) {
      const blob = await response.blob();
      await localDb.cacheLogo(channel.id, blob);
    }
  } catch (e) {
    console.warn(`[Taranga+] Logo prefetch failed for ${channel.id}:`, e);
  }
}

/**
 * Manually force a prefetch of all logos into IDB so they're instantly available.
 * Runs with a bounded concurrency pool (see PREFETCH_CONCURRENCY).
 */
export async function prefetchLogos(channels: { id: string; logoUrl: string }[]): Promise<void> {
  const queue = [...channels];
  const workers = Array.from({ length: Math.min(PREFETCH_CONCURRENCY, queue.length) }, async () => {
    while (queue.length > 0) {
      const channel = queue.shift();
      if (channel) await prefetchOne(channel);
    }
  });
  await Promise.all(workers);
}
