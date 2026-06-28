import React, { useState, useEffect } from 'react';
import { Topbar } from './components/Topbar';
import { LiquidGlassSidebar } from './components/ui/LiquidGlassSidebar';
import { ChannelGrid } from './components/ChannelGrid';
import { VideoFrame } from './components/VideoFrame';
import { ErrorBoundary } from './components/ErrorBoundary';
import { useChannels } from './hooks/useChannels';
import { useFavorites } from './hooks/useFavorites';
import { useSettings } from './hooks/useSettings';
import { Category, ChannelFinal } from './types';
import { registerLogoCacheWorker, prefetchLogos } from './workers/logoCache';
import { X, Heart } from 'lucide-react';
import { WindowLayoutProvider, useWindowLayout } from './context/WindowLayoutContext';

export default function App() {
  return (
    <ErrorBoundary>
      <WindowLayoutProvider>
        <AppShell />
      </WindowLayoutProvider>
    </ErrorBoundary>
  );
}

function AppShell() {
  const { channels, loading, error } = useChannels();
  const { favorites, toggleFavorite } = useFavorites();
  const { theme, setTheme } = useSettings();

  const [activeCategory, setActiveCategory] = useState<Category>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [activeChannel, setActiveChannel] = useState<ChannelFinal | null>(null);

  useEffect(() => {
    registerLogoCacheWorker();
  }, []);

  useEffect(() => {
    if (channels.length > 0) {
      prefetchLogos(channels);
    }
  }, [channels]);

  const inPlayerState = activeChannel !== null;
  const { tier } = useWindowLayout();
  const splitHorizontal = tier !== 'narrow'; // medium + wide go side by side

  return (
    <div className="h-screen flex flex-col bg-[var(--color-bg-base)] text-[var(--color-text-primary)] overflow-hidden font-ui">
      <Topbar
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        inPlayerState={inPlayerState}
        onBackClick={() => setActiveChannel(null)}
        channelName={activeChannel?.name}
        theme={theme}
        onThemeChange={setTheme}
      />

      <div className="flex-1 flex overflow-hidden relative">
        <LiquidGlassSidebar
          activeCategory={activeCategory}
          onCategorySelect={setActiveCategory}
        />

        <main className={`flex-1 relative overflow-hidden flex ${inPlayerState && splitHorizontal ? 'flex-row' : 'flex-col'} bg-[var(--color-bg-base)] isolate`}>

          {/* Cinema / Player Section (Left Side in Desktop) */}
          {inPlayerState && activeChannel && (
            <div
              className={`${tier === 'wide' ? 'flex-[3]' : tier === 'medium' ? 'flex-1' : 'w-full'} shrink-0 flex flex-col relative z-20 bg-black/60 shadow-[0_8px_32px_rgba(0,0,0,0.5)] border-b ${splitHorizontal ? 'lg:border-b-0 border-r' : ''} border-white/10 ${tier === 'narrow' ? 'h-[55vh]' : 'h-full'} overflow-hidden`}
            >
              <div className="flex-1 w-full max-w-[1200px] mx-auto p-4 md:p-6 relative flex flex-col justify-center">
                {/* Close Button */}
                <button
                  onClick={() => setActiveChannel(null)}
                  className="absolute top-2 right-4 lg:top-4 lg:right-6 z-[60] bg-black/70 hover:bg-[var(--color-accent)] text-white p-2 md:p-2.5 rounded-[12px] md:rounded-[14px] border border-white/15 transition-colors duration-200 shadow-lg"
                  title="Close Player"
                >
                  <X size={20} strokeWidth={2} />
                </button>

                {/* Player Container 16:9 */}
                <div
                  className="w-full aspect-video rounded-[12px] md:rounded-[16px] overflow-hidden relative isolate bg-black mt-10 lg:mt-0"
                  style={{
                    boxShadow: '0 24px 48px rgba(0,0,0,0.7)'
                  }}
                >
                  <div
                    className="absolute inset-0 pointer-events-none z-30 rounded-[12px] md:rounded-[16px] border opacity-80"
                    style={{
                      borderColor: 'rgba(var(--color-accent-rgb), 0.4)'
                    }}
                  />
                  <VideoFrame streamUrl={activeChannel.streamUrl} sources={activeChannel.sources} />
                </div>

                {/* Channel Info Below Video */}
                <div className="mt-4 md:mt-5 flex items-center justify-between px-1 md:px-2">
                  <div className="flex items-center gap-4 border border-white/5 bg-white/10 p-3 md:p-4 rounded-2xl w-full shadow-[0_8px_32px_rgba(0,0,0,0.2)]">
                    {activeChannel.logoUrl ? (
                      <div className="w-12 h-12 md:w-14 md:h-14 rounded-[10px] md:rounded-xl bg-white/5 border border-white/10 flex items-center justify-center p-2 shadow-inner shrink-0 leading-none">
                        <img src={activeChannel.logoUrl} alt={`${activeChannel.name} logo`} className="w-full h-full object-contain" />
                      </div>
                    ) : (
                      <div className="w-12 h-12 md:w-14 md:h-14 rounded-[10px] md:rounded-xl bg-white/5 border border-white/10 flex items-center justify-center p-2 shadow-inner shrink-0 leading-none">
                        <div className="w-full h-full bg-[var(--color-accent)]/20 rounded-[8px] flex items-center justify-center">
                          <span className="text-white/80 font-bold text-lg">{activeChannel.name.charAt(0)}</span>
                        </div>
                      </div>
                    )}
                    <div className="flex-1">
                      <h2 className="text-lg md:text-2xl font-bold font-bengali text-white/95 leading-none">{activeChannel.name.replace(/\s*\(\d+p\)/gi, '')}</h2>
                      <p className="text-[11px] md:text-xs text-white/50 uppercase tracking-wider font-semibold mt-1 flex items-center gap-2">
                        {activeChannel.category} Channel
                      </p>
                    </div>
                    <button
                      onClick={() => toggleFavorite(activeChannel.id)}
                      className={`p-3 shrink-0 rounded-full transition-colors duration-200 outline-none ${favorites.includes(activeChannel.id)
                          ? 'text-[var(--color-accent)] bg-[var(--color-accent)]/10 border border-[var(--color-accent)]/20'
                          : 'text-white/30 hover:text-white hover:bg-white/10 border border-transparent'
                        }`}
                      title={favorites.includes(activeChannel.id) ? "Remove from Favorites" : "Add to Favorites"}
                    >
                      <Heart size={20} strokeWidth={favorites.includes(activeChannel.id) ? 3 : 2} fill={favorites.includes(activeChannel.id) ? "currentColor" : "none"} />
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Channel Grid Section (Right Side in Desktop when playing) */}
          <div className={`${inPlayerState ? `${tier === 'wide' ? 'w-[380px]' : tier === 'medium' ? 'w-[300px]' : 'w-full'} shrink-0 ${tier === 'narrow' ? 'h-[45vh]' : 'h-full'} border-t ${splitHorizontal ? 'border-t-0' : ''} border-white/5 bg-black/20` : 'flex-1'} overflow-hidden relative flex flex-col`}>
            <ChannelGrid
              channels={channels}
              loading={loading}
              activeCategory={activeCategory}
              searchQuery={searchQuery}
              activeChannel={activeChannel}
              onChannelSelect={setActiveChannel}
              layout={inPlayerState ? 'list' : 'grid'}
              favorites={favorites}
              onToggleFavorite={toggleFavorite}
            />

            {error && !loading && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/85 z-50 p-6 text-center">
                <div className="bg-[var(--color-bg-surface)] p-8 rounded-2xl max-w-md border border-white/10 shadow-[0_16px_40px_rgba(0,0,0,0.5)]">
                  <h2 className="text-xl font-bold text-white mb-2 font-ui">Connection Error</h2>
                  <p className="text-[var(--color-text-secondary)] text-sm mb-6 font-ui">{error}</p>
                  <button
                    onClick={() => window.location.reload()}
                    className="px-6 py-2.5 bg-white/10 hover:bg-white/20 border border-white/10 text-white rounded-xl transition-colors duration-200 font-medium text-sm font-ui outline-none"
                  >
                    Retry Connection
                  </button>
                </div>
              </div>
            )}
          </div>

        </main>
      </div>

    </div>
  );
}
