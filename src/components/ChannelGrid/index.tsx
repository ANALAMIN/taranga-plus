import React, { useMemo } from 'react';
import { motion } from 'motion/react';
import { ChannelFinal, Category } from '../../types';
import { ChannelCard } from '../ChannelCard';
import { LoadingSkeleton } from '../LoadingSkeleton';
import { staggerContainer, fadeIn } from '../../animations/variants';
import { InteractiveGradientBackground } from '../InteractiveGradientBackground';

interface ChannelGridProps {
  channels: ChannelFinal[];
  loading: boolean;
  activeCategory: Category;
  searchQuery: string;
  activeChannel: ChannelFinal | null;
  onChannelSelect: (channel: ChannelFinal) => void;
  layout?: 'grid' | 'list';
  favorites: string[];
  onToggleFavorite: (id: string) => void;
}

/**
 * Main grid of channel cards.
 */
export const ChannelGrid: React.FC<ChannelGridProps> = ({ 
  channels, 
  loading, 
  activeCategory, 
  searchQuery, 
  activeChannel,
  onChannelSelect,
  layout = 'grid',
  favorites,
  onToggleFavorite
}) => {

  const filteredChannels = useMemo(() => {
    return channels.filter(c => {
      const isFav = favorites.includes(c.id);
      const matchCat = activeCategory === 'favorites' 
        ? isFav
        : activeCategory === 'all' || c.category === activeCategory;
      const matchSearch = c.name.toLowerCase().includes(searchQuery.toLowerCase());
      return matchCat && matchSearch;
    });
  }, [channels, activeCategory, searchQuery, favorites]);

  if (loading) {
    return <LoadingSkeleton />;
  }

  if (filteredChannels.length === 0) {
    return (
      <motion.div 
        variants={fadeIn}
        initial="hidden"
        animate="visible"
        className="flex flex-col items-center justify-center h-full text-[var(--color-muted)] font-bengali p-6"
      >
        <p className="text-lg">No channels found for the selected category or search query.</p>
      </motion.div>
    );
  }

  return (
    <InteractiveGradientBackground>
      <div className={`p-4 md:p-6 h-full overflow-y-auto channel-grid-container relative z-10 w-full`}>
        <motion.div 
          variants={staggerContainer}
          initial="hidden"
          animate="visible"
          className={layout === 'list' 
            ? "flex flex-col gap-3 md:gap-4 pb-20" 
            : "grid grid-cols-[repeat(auto-fill,minmax(180px,1fr))] gap-5 pb-20"
          }
        >
          {filteredChannels.map((channel, idx) => (
            <motion.div key={channel.id} variants={fadeIn} className="transform-gpu">
              <ChannelCard 
                channel={channel} 
                isActive={activeChannel?.id === channel.id}
                index={idx}
                onClick={onChannelSelect}
                layout={layout}
                isFavorite={favorites.includes(channel.id)}
                onToggleFavorite={onToggleFavorite}
              />
            </motion.div>
          ))}
        </motion.div>
      </div>
    </InteractiveGradientBackground>
  );
};
