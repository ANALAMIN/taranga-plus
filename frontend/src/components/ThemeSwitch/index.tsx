import React from 'react';

interface ThemeSwitchProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
}

/**
 * Lightweight theme toggle. No animation library — pure CSS transitions keep
 * the switch smooth without the per-frame cost of Framer Motion.
 */
const ThemeSwitch: React.FC<ThemeSwitchProps> = ({ checked, onChange }) => {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={checked ? 'Switch to light theme' : 'Switch to dark theme'}
      onClick={() => onChange(!checked)}
      className="group relative h-[36px] w-[72px] rounded-full overflow-hidden outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]/50"
    >
      {/* Track gradient — warm sky ↔ cosmic night */}
      <span
        className={`absolute inset-0 rounded-full transition-all duration-500 ease-in-out ${
          checked
            ? 'bg-gradient-to-r from-[#0a0e27] via-[#1a1a3e] to-[#0d0d2b]'
            : 'bg-gradient-to-r from-[#87CEEB] via-[#FFD700] to-[#FF8C00]'
        }`}
      />

      {/* Sun icon — visible in light mode */}
      <svg
        width="20"
        height="20"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="absolute left-[10px] top-1/2 -translate-y-1/2 transition-opacity duration-300"
        style={{ color: checked ? 'rgba(255,255,255,0.2)' : '#FFD700', opacity: checked ? 0.3 : 1 }}
      >
        <circle cx="12" cy="12" r="5" />
        {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => (
          <line
            key={i}
            x1="12"
            y1="1"
            x2="12"
            y2="3"
            style={{ transformOrigin: '12px 12px', transform: `rotate(${i * 45}deg)`, opacity: checked ? 0 : 1 }}
          />
        ))}
      </svg>

      {/* Moon icon — visible in dark mode */}
      <svg
        width="20"
        height="20"
        viewBox="0 0 24 24"
        fill="currentColor"
        stroke="none"
        className="absolute right-[10px] top-1/2 -translate-y-1/2 transition-opacity duration-300"
        style={{ color: checked ? '#E8E8FF' : 'rgba(255,255,255,0.15)', opacity: checked ? 1 : 0.3 }}
      >
        <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
      </svg>

      {/* Sliding thumb */}
      <span
        className="pointer-events-none absolute top-1/2 h-[28px] w-[28px] -translate-y-1/2 rounded-full shadow-lg z-10 transition-[left] duration-300 ease-out"
        style={{
          left: checked ? '40px' : '4px',
          background: checked
            ? 'linear-gradient(135deg, #3a3a5c, #1a1a3e)'
            : 'linear-gradient(135deg, #FFE566, #FFB800)',
          boxShadow: checked
            ? '0 2px 8px rgba(0,0,0,0.4), inset 0 1px 1px rgba(255,255,255,0.1)'
            : '0 2px 8px rgba(255,200,0,0.3), inset 0 1px 1px rgba(255,255,255,0.4)',
        }}
      >
        <span
          className="absolute inset-[3px] rounded-full"
          style={{
            background: checked
              ? 'radial-gradient(circle at 35% 30%, rgba(200,200,255,0.15), transparent 70%)'
              : 'radial-gradient(circle at 35% 30%, rgba(255,255,255,0.3), transparent 70%)',
          }}
        />
      </span>

      {/* Hover ring */}
      <span className="absolute inset-0 rounded-full ring-1 ring-inset ring-white/0 group-hover:ring-white/10 transition-all duration-200" />
    </button>
  );
};

export default ThemeSwitch;
