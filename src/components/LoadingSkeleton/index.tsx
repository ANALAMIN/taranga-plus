import React from 'react';

/**
 * Shimmer loading skeleton for channel grid.
 * Shown while channels are being fetched from Cloudflare.
 *
 * The grid template / gap / aspect ratio deliberately mirror the real card
 * grid in ChannelGrid so the layout doesn't visibly shift (CLS) when the
 * channels resolve.
 */
export const LoadingSkeleton: React.FC = () => {
  const skeletons = Array.from({ length: 24 });

  return (
    <div data-lenis-prevent="true" className="p-4 md:p-6 h-full overflow-y-auto overflow-hidden w-full">
      <div className="grid grid-cols-[repeat(auto-fill,minmax(180px,1fr))] gap-5 pb-20">
        {skeletons.map((_, i) => (
          <div
            key={i}
            className="skeleton aspect-[16/10] rounded-[16px]"
          />
        ))}
      </div>
    </div>
  );
};
