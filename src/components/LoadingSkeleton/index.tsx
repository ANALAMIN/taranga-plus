import React from 'react';

/**
 * Shimmer loading skeleton for channel grid.
 * Shown while channels are being fetched from Cloudflare.
 */
export const LoadingSkeleton: React.FC = () => {
  // Initial fill for a 1080p screen viewport
  const skeletons = Array.from({ length: 24 });

  return (
    <div className="grid grid-cols-[repeat(auto-fill,minmax(140px,1fr))] gap-4 p-6 overflow-hidden">
      {skeletons.map((_, i) => (
        <div 
          key={i} 
          className="skeleton"
          style={{ aspectRatio: '16/10', minWidth: '120px', maxWidth: '180px' }}
        />
      ))}
    </div>
  );
};
