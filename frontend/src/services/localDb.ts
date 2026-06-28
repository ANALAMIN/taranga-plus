import { openDB, DBSchema, IDBPDatabase } from 'idb';
import { AppSettingsKeyMap } from './settingsKeys';
import { ChannelFinal } from '../types';

/**
 * IndexedDB schema for Taranga+.
 *
 * Favorites live in `app_settings` under the `favorites` key as a `string[]`
 * of channel IDs (see useFavorites.ts). There is intentionally no separate
 * `favorites` object store — a previous version defined one and never used it,
 * leaving two competing representations. `app_settings` is canonical.
 */
interface TarangaDB extends DBSchema {
  watch_history: {
    key: string;
    value: { channelId: string; timestamp: number };
  };
  app_settings: {
    key: string;
    value: unknown;
  };
  logo_cache: {
    key: string;
    value: Blob;
  };
}

const DB_NAME = 'taranga_plus_db';
const DB_VERSION = 2;

let dbPromise: Promise<IDBPDatabase<TarangaDB>> | null = null;

async function initDB() {
  if (!dbPromise) {
    dbPromise = openDB<TarangaDB>(DB_NAME, DB_VERSION, {
      /**
       * Versioned migrations. v1 → v2 drops the unused `favorites` object store
       * (see interface note). Each case only runs the delta for its version so
       * existing users upgrade cleanly; new installs run all cases in order.
       */
      upgrade(db, oldVersion) {
        // v1: initial stores.
        if (oldVersion < 1) {
          if (!db.objectStoreNames.contains('watch_history')) {
            db.createObjectStore('watch_history', { keyPath: 'channelId' });
          }
          if (!db.objectStoreNames.contains('app_settings')) {
            db.createObjectStore('app_settings');
          }
          if (!db.objectStoreNames.contains('logo_cache')) {
            db.createObjectStore('logo_cache');
          }
        }
        // v2: remove the vestigial `favorites` object store (never populated;
        // favorites are stored in app_settings.favorites). Guarded so a fresh
        // install (which never created it) is a no-op. Cast: the store existed
        // in the v1 schema but is intentionally absent from the v2 schema type.
        if (oldVersion < 2) {
          const legacyDb = db as IDBPDatabase;
          if (legacyDb.objectStoreNames.contains('favorites')) {
            legacyDb.deleteObjectStore('favorites');
          }
        }
      },
    });
  }
  return dbPromise;
}

/**
 * Public surface of the persistence layer. The typed overloads let callers
 * `getSetting('favorites')` infer `string[]` (or any other key declared in
 * AppSettingsKeyMap), while a dynamic-key caller can still pass `string` and
 * request an explicit `T`. Declaring overloads on an interface (not inline in
 * the object literal) is the only place TypeScript allows signature-only
 * declarations.
 */
export interface LocalDb {
  saveWatchHistory(channelId: string): Promise<void>;

  /**
   * Read a setting. Prefer the typed overload (`getSetting('favorites')`) so
   * the return type is inferred from AppSettingsKeyMap; the generic `string`
   * overload is retained for callers that compute keys dynamically.
   */
  getSetting<K extends keyof AppSettingsKeyMap>(key: K): Promise<AppSettingsKeyMap[K] | null>;
  getSetting<T>(key: string): Promise<T | null>;

  saveSetting<K extends keyof AppSettingsKeyMap>(key: K, value: AppSettingsKeyMap[K]): Promise<void>;
  saveSetting(key: string, value: unknown): Promise<void>;

  cacheLogo(channelId: string, blob: Blob): Promise<void>;
  getCachedLogo(channelId: string): Promise<Blob | undefined>;

  cacheChannels(channels: ChannelFinal[]): Promise<void>;
  getCachedChannels(): Promise<ChannelFinal[] | null>;
}

export const localDb: LocalDb = {
  async saveWatchHistory(channelId: string) {
    const db = await initDB();
    await db.put('watch_history', { channelId, timestamp: Date.now() });
  },

  async getSetting(key: string) {
    const db = await initDB();
    const val = await db.get('app_settings', key);
    return val ?? null;
  },

  async saveSetting(key: string, value: unknown) {
    const db = await initDB();
    await db.put('app_settings', value, key);
  },

  async cacheLogo(channelId: string, blob: Blob) {
    const db = await initDB();
    await db.put('logo_cache', blob, `logo_${channelId}`);
  },

  async getCachedLogo(channelId: string) {
    const db = await initDB();
    return db.get('logo_cache', `logo_${channelId}`);
  },

  async cacheChannels(channels: ChannelFinal[]) {
    const db = await initDB();
    await db.put('app_settings', JSON.stringify(channels), 'channels_cache');
  },

  async getCachedChannels(): Promise<ChannelFinal[] | null> {
    const db = await initDB();
    const raw = await db.get('app_settings', 'channels_cache');
    if (!raw) return null;
    try { return JSON.parse(raw as string) as ChannelFinal[]; } catch { return null; }
  },
};
