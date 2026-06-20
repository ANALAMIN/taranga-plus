import React, { useRef, useEffect } from 'react';
import { Search, ArrowLeft, X } from 'lucide-react';
import ThemeSwitch from '../ThemeSwitch';
import { AppSettings } from '../../types';

interface TopbarProps {
  searchQuery: string;
  onSearchChange: (query: string) => void;
  inPlayerState: boolean;
  onBackClick?: () => void;
  channelName?: string;
  theme: AppSettings['theme'];
  onThemeChange: (theme: AppSettings['theme']) => void;
}

export const Topbar: React.FC<TopbarProps> = ({
  searchQuery,
  onSearchChange,
  inPlayerState,
  onBackClick,
  channelName,
  theme,
  onThemeChange,
}) => {
  const searchRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: PointerEvent) => {
      if (searchRef.current && e.target instanceof Node && !searchRef.current.contains(e.target)) {
        const input = searchRef.current.querySelector('input');
        if (input) input.blur();
      }
    };
    document.addEventListener('pointerdown', handleClickOutside, true);
    return () => document.removeEventListener('pointerdown', handleClickOutside, true);
  }, []);
  return (
    <header
      className="h-[64px] pl-8 pr-[200px] bg-black/40 backdrop-blur-2xl border-b border-white/[0.04] flex items-center justify-between sticky top-0 z-40 transform-gpu shadow-sm"
      style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
    >
      {/* Left: Logo or Back */}
      <div className="flex items-center gap-4">
        {inPlayerState ? (
          <button
            onClick={onBackClick}
            className="p-2.5 -ml-2 text-[var(--color-text-secondary)] hover:text-white hover:bg-white/10 rounded-full transition-all duration-300"
          >
            <ArrowLeft size={22} strokeWidth={1.5} />
          </button>
        ) : (
          <div className="font-ui font-bold text-2xl tracking-tighter flex items-center gap-3" style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}>
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className="text-[var(--color-accent)]" style={{ filter: 'drop-shadow(0 0 12px rgba(var(--color-accent-rgb), 0.6))' }}>
              <path d="M12 4V20M4 8H20M12 20C15 20 18 19 20 18" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <span className="bg-gradient-to-r from-white to-white/60 bg-clip-text text-transparent">Taranga+</span>
          </div>
        )}

        {inPlayerState && channelName && (
          <h1 className="text-lg font-medium font-bengali text-white/90 line-clamp-1 tracking-wide">{channelName?.replace(/\s*\(\d+p\)/gi, '')}</h1>
        )}
      </div>

      {/* Center: Search */}
      {!inPlayerState && (
        <div className="absolute left-1/2 -translate-x-1/2 w-full max-w-[440px] px-4" ref={searchRef} style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
          <div className="relative group flex items-center w-full">
            <div className="absolute inset-0 bg-gradient-to-r from-[var(--color-accent)]/20 via-transparent to-[var(--color-accent)]/20 opacity-0 group-focus-within:opacity-100 rounded-xl blur-xl transition-all duration-700 max-w-[90%] mx-auto" />
            <div className="absolute inset-0 bg-[#1C1C1E]/60 group-hover:bg-[#1C1C1E]/80 group-focus-within:bg-[#2C2C2E]/90 rounded-xl transition-colors duration-300 backdrop-blur-md shadow-inner" />
            <Search className="absolute left-4 text-white/40 group-focus-within:text-[var(--color-accent)] transition-colors duration-300 z-10" size={16} strokeWidth={2} />
            <input
              type="text"
              placeholder="Discover something new..."
              value={searchQuery}
              onChange={(e) => onSearchChange(e.target.value)}
              className="w-full relative z-10 bg-transparent border border-white/5 text-white text-[13px] sm:text-sm rounded-xl py-2 pl-10 pr-12 outline-none focus:border-[var(--color-accent)]/30 transition-all duration-300 placeholder:text-white/30 font-ui"
            />
            {!searchQuery && (
              <div className="absolute right-4 z-10 text-[10px] font-mono text-white/30 bg-white/5 border border-white/10 px-1.5 py-0.5 rounded-md opacity-100 group-focus-within:opacity-0 transition-opacity duration-300 pointer-events-none">
                ⌘K
              </div>
            )}
            {searchQuery && (
              <button
                onClick={() => onSearchChange('')}
                className="absolute right-3.5 z-10 p-1 rounded-md text-white/40 hover:text-white hover:bg-white/20 transition-colors"
                aria-label="Clear search"
              >
                <X size={14} strokeWidth={2} />
              </button>
            )}
          </div>
        </div>
      )}

      {/* Right: Theme Switch */}
      <div className="flex items-center mr-6" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
        <ThemeSwitch
          checked={theme === 'dark'}
          onChange={(isDark) => onThemeChange(isDark ? 'dark' : 'light')}
        />
      </div>
    </header>
  );
};
