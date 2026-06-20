import React, { memo } from 'react';
import { motion } from 'motion/react';
import { Play, Heart, Share2 } from 'lucide-react';
import { ChannelFinal } from '../../types';
import { ContextMenu, MenuItem } from '../ContextMenu';

interface ChannelCardProps {
  channel: ChannelFinal;
  isActive: boolean;
  index: number;
  onClick: (channel: ChannelFinal) => void;
  layout?: 'grid' | 'list';
  isFavorite?: boolean;
  onToggleFavorite?: (id: string) => void;
}

/**
 * Individual channel card component.
 * Liquid Glass UI & Premium Magic Hover styling (Realism aesthetics).
 */
export const ChannelCard = memo(function ChannelCard({ channel, isActive, index, onClick, layout = 'grid', isFavorite, onToggleFavorite }: ChannelCardProps) {
  
  const handleRadialSelect = (item: MenuItem) => {
    switch (item.id) {
      case 'play':
        onClick(channel);
        break;
      case 'favorite':
        if (onToggleFavorite) onToggleFavorite(channel.id);
        break;
      case 'share':
        if (navigator.share) {
          navigator.share({
            title: channel.name,
            text: `Watch ${channel.name.replace(/\s*\(\d+p\)/gi, '')} on Taranga+!`,
            url: window.location.href,
          }).catch(() => {
            alert('Sharing failed. Please try again.');
          });
        } else {
          navigator.clipboard.writeText(window.location.href).then(() => {
            alert('Link copied to clipboard!');
          }).catch(() => {
            alert('Failed to copy link.');
          });
        }
        break;
    }
  };

  const menuItems: MenuItem[] = [
    { id: 'play', label: 'Play', icon: Play },
    { id: 'favorite', label: isFavorite ? 'Unfave' : 'Favorite', icon: Heart },
    { id: 'share', label: 'Share', icon: Share2 },
  ];

  if (layout === 'list') {
    return (
      <ContextMenu menuItems={menuItems} onSelect={handleRadialSelect}>
      <motion.div
        onClick={() => onClick(channel)}
        initial={{ opacity: 0, x: 20 }}
        animate={{ opacity: 1, x: 0 }}
        whileTap={{ scale: 0.98 }}
        className={`group relative flex items-center gap-3 p-2.5 rounded-[12px] cursor-pointer transition-all duration-300 w-full ${
          isActive 
            ? 'bg-white/10 ring-1 ring-white/20 shadow-[0_0_20px_rgba(255,255,255,0.05)]' 
            : 'bg-white/5 ring-1 ring-white/10 hover:bg-white/10'
        }`}
      >
        {isActive && (
          <>
            <div className="absolute inset-0 rounded-[12px] z-0 pointer-events-none"
              style={{
                background: 'linear-gradient(135deg, #ff0000, #ffffff, #ff0000)',
                backgroundSize: '200% 200%',
                animation: 'glowMove 2s ease-in-out infinite',
                opacity: 0.3,
              }}
            />
            <div className="absolute -inset-[3px] rounded-[15px] z-0 pointer-events-none"
              style={{
                background: 'rgba(255, 0, 0, 0.1)',
                filter: 'blur(8px)',
                animation: 'glowPulse 2s ease-in-out infinite',
              }}
            />
          </>
        )}
        {/* Thumbnail Area */}
        <div className="w-[100px] aspect-[16/10] shrink-0 rounded-[8px] bg-[radial-gradient(circle_at_center,_#333,_#111)] flex items-center justify-center p-2 border border-white/5 shadow-inner overflow-hidden relative">
           {channel.logoUrl ? (
             <img 
               src={channel.logoUrl} 
               alt={`${channel.name} logo`}
               className="w-full h-full object-contain shrink-0 drop-shadow-md z-10"
               loading="lazy"
               decoding="async"
             />
           ) : (
             <span className="text-white/60 font-bold font-bengali text-xs z-10">{channel.name.charAt(0)}</span>
           )}
           {/* Subtle glow */}
           {isActive && <div className="absolute inset-0 bg-[var(--color-accent)]/20 z-0 blur-md" />}
        </div>

        {/* Text Area */}
        <div className="flex-1 min-w-0 pr-2">
          <h3 className={`font-bengali text-sm font-semibold truncate ${isActive ? 'text-white' : 'text-white/80 group-hover:text-white transition-colors'}`}>
            {channel.name.replace(/\s*\(\d+p\)/gi, '')}
          </h3>
          <p className="text-[10px] text-white/40 uppercase tracking-widest mt-1 truncate">
            {channel.category}
          </p>
        </div>
        
      </motion.div>
      </ContextMenu>
    );
  }

  return (
    <ContextMenu menuItems={menuItems} onSelect={handleRadialSelect}>
    <motion.div
      onClick={() => onClick(channel)}
      initial={{ opacity: 0, scale: 0.95, y: 10 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      whileTap={{ scale: 0.96 }}
      className={`group relative p-[2px] rounded-[16px] cursor-pointer transition-all duration-500 w-full aspect-[16/10] mx-auto ${
        isActive ? 'scale-[1.05] z-10' : ''
      }`}
      style={{
        background: 'radial-gradient(circle 120px at 80% -10%, #ffffff, #181b1b)'
      }}
    >
      {/* Glow behind button */}
      <div className={`absolute top-0 right-0 w-[65%] h-[60%] rounded-[120px] transition-all duration-500 ease-out -z-10 ${isActive ? 'shadow-[0_0_40px_#ffffff60]' : 'shadow-[0_0_20px_#ffffff38] group-hover:shadow-[0_0_40px_#ffffff60]'}`} />

      {/* Bottom-left theme blob */}
      <div 
        className={`absolute bottom-0 left-0 h-[60%] rounded-[17px] transition-all duration-500 ease-out ${isActive ? 'w-[60%]' : 'w-[40%] group-hover:w-[70%]'}`} 
        style={{
          background: 'radial-gradient(circle 80px at 0% 100%, var(--color-accent), rgba(var(--color-accent-rgb), 0.3), transparent)',
          boxShadow: isActive ? '-4px 1px 45px rgba(var(--color-accent-rgb), 0.4)' : '-2px 9px 40px rgba(var(--color-accent-rgb), 0.25)'
        }}
      />

      {/* Inner content (Card Canvas) */}
      <div className={`relative w-full h-full flex flex-col items-center justify-center rounded-[14px] text-white bg-[radial-gradient(circle_120px_at_80%_-50%,_#777777,_#0f1111)] z-10 transition-transform duration-500 ${isActive ? 'scale-105' : 'group-hover:scale-105'} overflow-hidden`}>
        
        {isActive && (
          <div className="absolute inset-0 rounded-[14px] z-0 pointer-events-none"
            style={{
              background: 'linear-gradient(135deg, #ff0000, #ffffff, #ff0000)',
              backgroundSize: '200% 200%',
              animation: 'glowMove 2s ease-in-out infinite',
              opacity: 0.15,
            }}
          />
        )}

        {/* Channel Logo */}
        {channel.logoUrl ? (
          <img 
            src={channel.logoUrl} 
            alt={`${channel.name} logo`}
            className={`w-[65%] h-[65%] object-contain transition-all duration-500 ${isActive ? 'drop-shadow-[0_0_15px_rgba(255,255,255,0.6)] scale-110' : 'opacity-90 group-hover:opacity-100 group-hover:scale-110 drop-shadow-lg'} z-20`}
            loading={index < 20 ? 'eager' : 'lazy'}
            decoding="async"
          />
        ) : (
          <div className="text-center font-bengali text-sm font-medium text-white/80 px-2 line-clamp-2 z-20 drop-shadow-md">
            {channel.name.replace(/\s*\(\d+p\)/gi, '')}
          </div>
        )}

        {/* Bottom gradient overlay for polish */}
        {!isActive && (
          <div className="absolute inset-0 z-10 bg-gradient-to-t from-black/60 via-black/0 to-black/0 opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none" />
        )}

        {/* Inner glow layer matching realism style */}
        <div className="absolute inset-0 rounded-[14px] z-[-1]" 
          style={{
            background: 'radial-gradient(circle 80px at 0% 100%, rgba(var(--color-accent-rgb), 0.15), rgba(var(--color-accent-rgb), 0.05), transparent)'
          }}
        />
      </div>

    </motion.div>
    </ContextMenu>
  );
});

