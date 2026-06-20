import { useState, useEffect, useCallback } from 'react';
import { localDb } from '../services/localDb';

export function useFavorites() {
  const [favorites, setFavorites] = useState<string[]>([]);

  useEffect(() => {
    localDb.getSetting<string[]>('favorites').then(saved => {
      if (saved) {
        setFavorites(saved);
      }
    });
  }, []);

  const toggleFavorite = useCallback(async (channelId: string) => {
    setFavorites(prev => {
      let newFavs;
      if (prev.includes(channelId)) {
        newFavs = prev.filter(id => id !== channelId);
      } else {
        newFavs = [...prev, channelId];
      }
      localDb.saveSetting('favorites', newFavs);
      return newFavs;
    });
  }, []);

  return { favorites, toggleFavorite };
}
