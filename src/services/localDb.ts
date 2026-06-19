import { openDB, DBSchema, IDBPDatabase } from 'idb';
import { ChannelFinal, AppSettings } from '../types';

interface TarangaDB extends DBSchema {
  favorites: {
    key: string;
    value: ChannelFinal;
  };
  watch_history: {
    key: string;
    value: { channelId: string; timestamp: number };
  };
  app_settings: {
    key: string;
    value: any;
  };
  logo_cache: {
    key: string;
    value: Blob;
  };
}

let dbPromise: Promise<IDBPDatabase<TarangaDB>> | null = null;

async function initDB() {
  if (!dbPromise) {
    dbPromise = openDB<TarangaDB>('taranga_plus_db', 1, {
      upgrade(db) {
        if (!db.objectStoreNames.contains('favorites')) {
          db.createObjectStore('favorites', { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains('watch_history')) {
          db.createObjectStore('watch_history', { keyPath: 'channelId' });
        }
        if (!db.objectStoreNames.contains('app_settings')) {
          db.createObjectStore('app_settings');
        }
        if (!db.objectStoreNames.contains('logo_cache')) {
          db.createObjectStore('logo_cache');
        }
      },
    });
  }
  return dbPromise;
}

export const localDb = {
  async saveFavorite(channel: ChannelFinal): Promise<void> {
    const db = await initDB();
    await db.put('favorites', channel);
  },
  
  async removeFavorite(channelId: string): Promise<void> {
    const db = await initDB();
    await db.delete('favorites', channelId);
  },
  
  async getFavorites(): Promise<ChannelFinal[]> {
    const db = await initDB();
    return db.getAll('favorites');
  },
  
  async saveWatchHistory(channelId: string): Promise<void> {
    const db = await initDB();
    await db.put('watch_history', { channelId, timestamp: Date.now() });
  },
  
  async getSetting<T>(key: string): Promise<T | null> {
    const db = await initDB();
    const val = await db.get('app_settings', key);
    return (val as T) ?? null;
  },
  
  async saveSetting(key: string, value: any): Promise<void> {
    const db = await initDB();
    await db.put('app_settings', value, key);
  },
  
  async cacheLogo(channelId: string, blob: Blob): Promise<void> {
    const db = await initDB();
    await db.put('logo_cache', blob, `logo_${channelId}`);
  },
  
  async getCachedLogo(channelId: string): Promise<Blob | undefined> {
    const db = await initDB();
    return db.get('logo_cache', `logo_${channelId}`);
  }
};
