import { useState, useEffect } from 'react';

export function useFavorites() {
  const [favorites, setFavorites] = useState<string[]>([]);

  useEffect(() => {
    const saved = localStorage.getItem('btv_favorites');
    if (saved) {
      try {
        setFavorites(JSON.parse(saved));
      } catch (e) {
        console.error(e);
      }
    }
  }, []);

  const toggleFavorite = (channelId: string) => {
    setFavorites(prev => {
      let newFavs;
      if (prev.includes(channelId)) {
        newFavs = prev.filter(id => id !== channelId);
      } else {
        newFavs = [...prev, channelId];
      }
      localStorage.setItem('btv_favorites', JSON.stringify(newFavs));
      return newFavs;
    });
  };

  return { favorites, toggleFavorite };
}
