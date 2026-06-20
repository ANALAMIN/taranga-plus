import { useState, useEffect, useCallback, useRef } from 'react';
import { localDb } from '../services/localDb';
import { SETTING_KEYS } from '../services/settingsKeys';

/**
 * Favorites hook.
 *
 * The favorites list is persisted as a flat `string[]` of channel IDs under
 * the `app_settings` store (key `favorites`). This is the canonical schema —
 * the `favorites` object store in localDb is intentionally unused (see
 * localDb.ts). ID arrays are enough for the current UI; a future favorites
 * view can hydrate full channel objects from the channel list by ID.
 *
 * A previous version performed the IndexedDB write INSIDE the
 * `setFavorites(prev => ...)` updater. That violates the "updater must be
 * pure" contract (StrictMode double-invokes updaters → double IDB writes) and
 * allowed two rapid toggles to interleave and lose data. Instead we mirror the
 * current favorites in a ref, compute the next array synchronously, persist
 * it, then commit it with a plain `setFavorites(next)`.
 */
export function useFavorites() {
  const [favorites, setFavorites] = useState<string[]>([]);
  const favoritesRef = useRef<string[]>([]);

  // Keep the ref in sync so toggleFavorite always reads the latest value
  // without depending on stale state in its closure.
  useEffect(() => {
    favoritesRef.current = favorites;
  }, [favorites]);

  useEffect(() => {
    let cancelled = false;
    localDb.getSetting<string[]>(SETTING_KEYS.favorites).then(saved => {
      if (!cancelled && Array.isArray(saved)) {
        setFavorites(saved);
      }
    });
    return () => { cancelled = true; };
  }, []);

  const toggleFavorite = useCallback(async (channelId: string) => {
    const prev = favoritesRef.current;
    const next = prev.includes(channelId)
      ? prev.filter(id => id !== channelId)
      : [...prev, channelId];
    favoritesRef.current = next; // optimistic, so back-to-back toggles don't read stale state
    setFavorites(next);
    try {
      await localDb.saveSetting(SETTING_KEYS.favorites, next);
    } catch (err) {
      // Revert on failure so UI matches storage.
      favoritesRef.current = prev;
      setFavorites(prev);
      console.error('Failed to persist favorites:', err);
    }
  }, []);

  return { favorites, toggleFavorite };
}
