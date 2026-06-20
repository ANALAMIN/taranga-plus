import React from 'react';
import { motion } from 'motion/react';

interface ThemeSwitchProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
}

const rays = Array.from({ length: 8 });

const stars = [
  { top: 22, left: 48, size: 3, delay: 0 },
  { top: 14, left: 56, size: 2, delay: 0.1 },
  { top: 28, left: 62, size: 2.5, delay: 0.2 },
  { top: 10, left: 52, size: 1.5, delay: 0.15 },
  { top: 32, left: 54, size: 1.8, delay: 0.25 },
  { top: 18, left: 66, size: 1.2, delay: 0.3 },
];

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
        className={`absolute inset-0 rounded-full transition-all duration-700 ease-in-out ${
          checked
            ? 'bg-gradient-to-r from-[#0a0e27] via-[#1a1a3e] to-[#0d0d2b]'
            : 'bg-gradient-to-r from-[#87CEEB] via-[#FFD700] to-[#FF8C00]'
        }`}
      />

      {/* Inner glow */}
      <span
        className={`absolute inset-0 rounded-full transition-opacity duration-700 ${
          checked ? 'opacity-40' : 'opacity-20'
        }`}
        style={{
          background: checked
            ? 'radial-gradient(ellipse at 30% 120%, rgba(100,100,255,0.3), transparent 70%)'
            : 'radial-gradient(ellipse at 70% 120%, rgba(255,200,50,0.3), transparent 70%)',
        }}
      />

      {/* Sun icon — visible in light mode */}
      <span className="absolute inset-0 flex items-center justify-center">
        <motion.svg
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="absolute left-[10px]"
          style={{ color: checked ? 'rgba(255,255,255,0.2)' : '#FFD700' }}
          animate={checked ? { rotate: 0, scale: 0.6, opacity: 0.3 } : { rotate: 360, scale: 1, opacity: 1 }}
          transition={{ duration: 0.8, ease: 'easeInOut' }}
        >
          <circle cx="12" cy="12" r="5" />
          {rays.map((_, i) => (
            <motion.line
              key={i}
              x1="12"
              y1="1"
              x2="12"
              y2="3"
              animate={checked ? { opacity: 0 } : { opacity: [1, 0.4, 1] }}
              transition={{
                duration: 1.5,
                repeat: Infinity,
                delay: i * 0.15,
                ease: 'easeInOut',
              }}
              style={{ transformOrigin: '12px 12px', transform: `rotate(${i * 45}deg)` }}
            />
          ))}
        </motion.svg>
      </span>

      {/* Moon & stars — visible in dark mode */}
      <span className="absolute inset-0 flex items-center justify-center">
        {/* Moon glow */}
        <motion.span
          className="absolute right-[10px] rounded-full"
          style={{ width: 28, height: 28 }}
          animate={
            checked
              ? { opacity: [0.3, 0.6, 0.3], scale: [0.9, 1.1, 0.9] }
              : { opacity: 0, scale: 0.5 }
          }
          transition={{
            duration: 3,
            repeat: Infinity,
            ease: 'easeInOut',
          }}
        >
          <span
            className="absolute inset-0 rounded-full"
            style={{
              background: 'radial-gradient(circle, rgba(200,200,255,0.2), transparent 70%)',
            }}
          />
        </motion.span>

        <motion.svg
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="currentColor"
          stroke="none"
          className="absolute right-[10px]"
          style={{ color: checked ? '#E8E8FF' : 'rgba(255,255,255,0.15)' }}
          animate={checked ? { scale: 1, opacity: 1 } : { scale: 0.6, opacity: 0.3 }}
          transition={{ duration: 0.8, ease: 'easeInOut' }}
        >
          <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
        </motion.svg>

        {/* Stars */}
        {stars.map((star, i) => (
          <motion.span
            key={i}
            className="absolute rounded-full bg-white"
            style={{
              width: star.size,
              height: star.size,
              top: `${star.top}%`,
              left: `${star.left}%`,
            }}
            animate={
              checked
                ? { opacity: [0, 1, 0.3, 0.8, 1], scale: [0, 1.2, 0.8, 1] }
                : { opacity: 0, scale: 0 }
            }
            transition={{
              duration: 0.5,
              delay: star.delay,
              ease: 'easeOut',
            }}
          />
        ))}
      </span>

      {/* Sliding thumb */}
      <motion.span
        className="pointer-events-none absolute top-1/2 h-[28px] w-[28px] -translate-y-1/2 rounded-full shadow-lg z-10"
        animate={{
          x: checked ? 40 : 4,
          scale: 1,
        }}
        transition={{
          type: 'spring',
          stiffness: 500,
          damping: 30,
          mass: 1,
        }}
        style={{
          background: checked
            ? 'linear-gradient(135deg, #3a3a5c, #1a1a3e)'
            : 'linear-gradient(135deg, #FFE566, #FFB800)',
          boxShadow: checked
            ? '0 2px 8px rgba(0,0,0,0.4), inset 0 1px 1px rgba(255,255,255,0.1)'
            : `0 2px 8px rgba(255,200,0,0.3), inset 0 1px 1px rgba(255,255,255,0.4)`,
        }}
      >
        {/* Thumb inner glow */}
        <span
          className="absolute inset-[3px] rounded-full"
          style={{
            background: checked
              ? 'radial-gradient(circle at 35% 30%, rgba(200,200,255,0.15), transparent 70%)'
              : 'radial-gradient(circle at 35% 30%, rgba(255,255,255,0.3), transparent 70%)',
          }}
        />
      </motion.span>

      {/* Hover ring */}
      <span className="absolute inset-0 rounded-full ring-1 ring-inset ring-white/0 group-hover:ring-white/10 transition-all duration-300" />
    </button>
  );
};

export default ThemeSwitch;
