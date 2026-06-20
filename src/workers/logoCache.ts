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
 * Manually force a prefetch of all logos into IDB so they're instantly available.
 */
export async function prefetchLogos(channels: { id: string; logoUrl: string }[]): Promise<void> {
  for (const channel of channels) {
    if (!channel.logoUrl) continue;
    
    try {
      // Check if we already have it in IndexedDB directly
      const existing = await localDb.getCachedLogo(channel.id);
      if (existing) continue; 
      
      const response = await fetch(channel.logoUrl, { cache: 'no-store' });
      if (response.ok) {
        const blob = await response.blob();
        await localDb.cacheLogo(channel.id, blob);
      }
    } catch (e) {
      console.warn(`[Taranga+] Logo prefetch failed for ${channel.id}:`, e);
    }
  }
}
