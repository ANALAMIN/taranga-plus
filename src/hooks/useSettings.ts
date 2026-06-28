import { useState, useEffect } from 'react';
import { localDb } from '../services/localDb';
import { AppSettings } from '../types';
import { SETTING_KEYS } from '../services/settingsKeys';

export function useSettings() {
  const [theme, setTheme] = useState<AppSettings['theme']>('dark');
  const [accentColor, setAccentColor] = useState<AppSettings['accentColor']>('#e50914');

  const hexToRgb = (hex: string) => {
    let h = hex.replace('#', '');
    if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
    if (h.length === 8) h = h.slice(0, 6);
    const result = /^([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(h);
    return result
      ? `${parseInt(result[1], 16)}, ${parseInt(result[2], 16)}, ${parseInt(result[3], 16)}`
      : "229, 9, 20";
  };

  useEffect(() => {
    const loadSettings = async () => {
      const savedTheme = await localDb.getSetting(SETTING_KEYS.theme);
      if (savedTheme) {
        setTheme(savedTheme);
      }

      const savedAccentColor = await localDb.getSetting(SETTING_KEYS.accentColor);
      if (savedAccentColor) {
        setAccentColor(savedAccentColor);
        applyAccentColor(savedAccentColor);
      } else {
        applyAccentColor('#e50914');
      }
    };
    loadSettings();
  }, []);

  const applyAccentColor = (color: string) => {
    const root = document.documentElement;
    root.style.setProperty('--color-accent', color);
    root.style.setProperty('--color-accent-rgb', hexToRgb(color));
  };

  const updateTheme = async (newTheme: AppSettings['theme']) => {
    setTheme(newTheme);
    document.documentElement.dataset.theme = newTheme;
    await localDb.saveSetting(SETTING_KEYS.theme, newTheme);
  };

  const updateAccentColor = async (color: AppSettings['accentColor']) => {
    setAccentColor(color);
    applyAccentColor(color);
    await localDb.saveSetting(SETTING_KEYS.accentColor, color);
  };

  return {
    theme,
    setTheme: updateTheme,
    accentColor,
    setAccentColor: updateAccentColor
  };
}
