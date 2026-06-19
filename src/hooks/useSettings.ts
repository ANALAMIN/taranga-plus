import { useState, useEffect } from 'react';
import { localDb } from '../services/localDb';
import { AppSettings } from '../types';

export function useSettings() {
  const [theme, setTheme] = useState<AppSettings['theme']>('dark');
  const [accentColor, setAccentColor] = useState<AppSettings['accentColor']>('#e50914');

  const hexToRgb = (hex: string) => {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result
      ? `${parseInt(result[1], 16)}, ${parseInt(result[2], 16)}, ${parseInt(result[3], 16)}`
      : "229, 9, 20";
  };

  useEffect(() => {
    const loadSettings = async () => {
      const savedTheme = await localDb.getSetting<AppSettings['theme']>('theme');
      if (savedTheme) {
        setTheme(savedTheme);
      }
      
      const savedAccentColor = await localDb.getSetting<AppSettings['accentColor']>('accentColor');
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
    await localDb.saveSetting('theme', newTheme);
  };

  const updateAccentColor = async (color: AppSettings['accentColor']) => {
    setAccentColor(color);
    applyAccentColor(color);
    await localDb.saveSetting('accentColor', color);
  };

  return {
    theme,
    setTheme: updateTheme,
    accentColor,
    setAccentColor: updateAccentColor
  };
}
