/**
 * Centralized, typed keys for the `app_settings` IDB store.
 *
 * Using a literal-union map instead of free-form `string` keys means a typo in
 * a setting name is a compile error, not a silent second storage slot. It also
 * documents every setting the app actually persists.
 *
 * The `AppSettingsKeyMap` interface doubles as the per-key type map referenced
 * by `localDb.getSetting<T>` callers — prefer `getSetting<K>(k)` so the value
 * type is inferred, rather than asserting an arbitrary `T`.
 */
export const SETTING_KEYS = {
  favorites: 'favorites',
  theme: 'theme',
  accentColor: 'accentColor',
} as const;

export type AppSettingsKey = keyof typeof SETTING_KEYS;

export interface AppSettingsKeyMap {
  favorites: string[];
  theme: 'dark' | 'light' | 'system';
  accentColor: string;
}
