import React from 'react';
import { Sun, Moon } from 'lucide-react';

/**
 * Day/night theme toggle, rewritten in Tailwind to match the rest of the app.
 *
 * Previously this was a 199-line styled-components blob — the ONLY use of
 * styled-components in the codebase, which pulled in a runtime CSS-in-JS engine
 * (~12 KB) for a single component and duplicated the accent color as a magic
 * literal. This version reuses the app's existing CSS variables
 * (--color-accent) and keeps the same `checked` / `onChange` contract the
 * Topbar depends on.
 *
 * Visual concept: a sliding pill with a sun (light) on the left and a moon
 * (dark) on the right; the thumb slides toward the active side.
 */
interface ThemeSwitchProps {
  checked: boolean; // true = dark
  onChange: (checked: boolean) => void;
}

const Switch: React.FC<ThemeSwitchProps> = ({ checked, onChange }) => {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={checked ? 'Switch to light theme' : 'Switch to dark theme'}
      onClick={() => onChange(!checked)}
      className="group relative flex items-center gap-1 h-[34px] w-[72px] rounded-full border border-white/[0.06] bg-[#1A1A1A] px-1 shadow-[0_1px_2px_rgba(255,255,255,0.06),0_2px_4px_rgba(0,0,0,0.4)] transition-colors duration-300 outline-none hover:border-white/15 focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]/50"
    >
      {/* Track icons: sun on the left, moon on the right. The active side
          lights up in the accent color so the current theme is readable at a
          glance without relying on thumb position alone. */}
      <Sun
        size={14}
        strokeWidth={2}
        className={
          checked
            ? 'text-white/25 transition-colors duration-300'
            : 'text-[var(--color-accent)] transition-colors duration-300'
        }
      />
      <Moon
        size={14}
        strokeWidth={2}
        className={
          checked
            ? 'text-[var(--color-accent)] transition-colors duration-300'
            : 'text-white/25 transition-colors duration-300'
        }
      />

      {/* Sliding thumb. Translates right when dark (checked). */}
      <span
        className={`pointer-events-none absolute top-1/2 left-1 h-[26px] w-[26px] -translate-y-1/2 rounded-full bg-[#C4C9D1] shadow-[0_1px_2px_rgba(0,0,0,0.3)] transition-transform duration-300 ease-[cubic-bezier(0,0.02,0.35,1.17)] ${
          checked ? 'translate-x-[36px]' : 'translate-x-0'
        }`}
      />
    </button>
  );
};

export default Switch;
