import React, { memo } from 'react';
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
  
  const handleContextMenuSelect = (item: MenuItem) => {
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
      <ContextMenu menuItems={menuItems} onSelect={handleContextMenuSelect}>
      <div
        onClick={() => onClick(channel)}
        className={`group relative flex items-center gap-3 p-2.5 rounded-[12px] cursor-pointer transition-colors duration-200 w-full ${
          isActive
            ? 'bg-white/10 ring-1 ring-[var(--color-accent)]/50'
            : 'bg-white/5 ring-1 ring-white/10 hover:bg-white/10'
        }`}
      >
        {isActive && (
          <div className="absolute inset-0 rounded-[12px] z-0 pointer-events-none ring-2 ring-[var(--color-accent)]/50" />
        )}
        {/* Thumbnail Area */}
        <div className="w-[100px] aspect-[16/10] shrink-0 rounded-[8px] bg-[radial-gradient(circle_at_center,_#333,_#111)] flex items-center justify-center p-2 border border-white/5 shadow-inner overflow-hidden relative">
           {channel.logoUrl ? (
             <img
               src={channel.logoUrl}
               alt={`${channel.name} logo`}
               className="w-full h-full object-contain shrink-0 z-10"
               loading="lazy"
               decoding="async"
             />
           ) : (
            <span className="text-white/60 font-bold font-bengali text-xs z-10">{channel.name.charAt(0)}</span>
           )}
           {isActive && <div className="absolute inset-0 bg-[var(--color-accent)]/20 z-0" />}
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

      </div>
      </ContextMenu>
    );
  }

  return (
    <ContextMenu menuItems={menuItems} onSelect={handleContextMenuSelect}>
    <div
      onClick={() => onClick(channel)}
      className={`group relative p-[2px] rounded-[16px] cursor-pointer w-full aspect-[16/10] mx-auto transition-transform duration-200 ${
        isActive ? 'scale-[1.05] z-10 ring-2 ring-[var(--color-accent)]/40' : ''
      }`}
      style={{
        background: 'radial-gradient(circle 120px at 80% -10%, #ffffff, #181b1b)'
      }}
    >
      {/* Inner content (Card Canvas) */}
      <div className={`relative w-full h-full flex flex-col items-center justify-center rounded-[14px] text-white bg-[radial-gradient(circle_120px_at_80%_-50%,_#777777,_#0f1111)] z-10 overflow-hidden`}>

        {/* Channel Logo */}
        {channel.logoUrl ? (
          <img
            src={channel.logoUrl}
            alt={`${channel.name} logo`}
            className={`w-[65%] h-[65%] object-contain transition-opacity duration-200 ${isActive ? 'opacity-100' : 'opacity-90 group-hover:opacity-100'} z-20`}
            loading={index < 20 ? 'eager' : 'lazy'}
            decoding="async"
          />
        ) : (
          <div className="text-center font-bengali text-sm font-medium text-white/80 px-2 line-clamp-2 z-20">
            {channel.name.replace(/\s*\(\d+p\)/gi, '')}
          </div>
        )}

        {/* Bottom gradient overlay for polish */}
        {!isActive && (
          <div className="absolute inset-0 z-10 bg-gradient-to-t from-black/60 via-black/0 to-black/0 opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none" />
        )}
      </div>

    </div>
    </ContextMenu>
  );
});

