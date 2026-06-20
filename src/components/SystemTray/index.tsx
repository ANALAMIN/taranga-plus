import React from 'react';
import { motion } from 'motion/react';
import { Play, Pause, Volume2, VolumeX, Maximize, Minimize, SkipBack, SkipForward } from 'lucide-react';

interface SystemTrayProps {
  isPlaying: boolean;
  onPlayPause: () => void;
  isFullscreen: boolean;
  onFullscreenToggle: () => void;
  isMuted: boolean;
  onMuteToggle: () => void;
  visible?: boolean;
}

const DockButton: React.FC<{
  icon: React.ElementType;
  label: string;
  onClick: () => void;
  active?: boolean;
  size?: number;
}> = ({ icon: Icon, label, onClick, active, size = 18 }) => (
  <motion.button
    whileHover={{ scale: 1.12, y: -2 }}
    whileTap={{ scale: 0.92 }}
    onClick={onClick}
    className={`relative group p-2.5 rounded-[10px] transition-colors duration-200 ${
      active
        ? 'text-[var(--color-accent)] bg-[var(--color-accent)]/10'
        : 'text-white/50 hover:text-white hover:bg-white/[0.08]'
    }`}
    title={label}
  >
    <Icon size={size} strokeWidth={1.5} />
    <span className="absolute -top-8 left-1/2 -translate-x-1/2 px-2 py-1 rounded-md text-[10px] font-medium bg-[var(--color-bg-elevated)] text-white/70 border border-white/[0.06] opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none shadow-lg">
      {label}
    </span>
  </motion.button>
);

export const SystemTray: React.FC<SystemTrayProps> = ({
  isPlaying,
  onPlayPause,
  isFullscreen,
  onFullscreenToggle,
  isMuted,
  onMuteToggle,
  visible = true,
}) => {
  if (!visible) return null;

  return (
    <motion.div
      initial={{ y: 20, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      exit={{ y: 20, opacity: 0 }}
      transition={{ type: 'spring', stiffness: 300, damping: 25 }}
      className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50"
      style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
    >
      <div className="flex items-center gap-0.5 px-3 py-1.5 rounded-[14px] border border-white/[0.08] bg-[var(--color-bg-surface)]/80 backdrop-blur-2xl shadow-[0_8px_32px_rgba(0,0,0,0.5)]">
        <DockButton icon={SkipBack} label="Previous" onClick={() => {}} size={16} />
        <DockButton
          icon={isPlaying ? Pause : Play}
          label={isPlaying ? 'Pause' : 'Play'}
          onClick={onPlayPause}
          active={isPlaying}
          size={20}
        />
        <DockButton icon={SkipForward} label="Next" onClick={() => {}} size={16} />

        <div className="w-px h-5 bg-white/[0.08] mx-1.5" />

        <DockButton
          icon={isMuted ? VolumeX : Volume2}
          label={isMuted ? 'Unmute' : 'Mute'}
          onClick={onMuteToggle}
          active={isMuted}
          size={16}
        />
        <DockButton
          icon={isFullscreen ? Minimize : Maximize}
          label={isFullscreen ? 'Exit Fullscreen' : 'Fullscreen'}
          onClick={onFullscreenToggle}
          size={16}
        />
      </div>
    </motion.div>
  );
};
