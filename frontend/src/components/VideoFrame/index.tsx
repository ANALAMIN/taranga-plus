import React, { useEffect, useRef, useState } from 'react';
import { usePlayer } from '../../hooks/usePlayer';
import { useNativeBridge } from '../../hooks/useNativeBridge';
import { setStreamNetworkingConfig, StreamNetworkingConfig } from '../../player-engine/customFilters';
import { PlayerControls } from '../PlayerControls';
import LoadingLines from '../UILoader';

interface VideoFrameProps {
  streamUrl: string;
  sources?: string[];
  channelTitle?: string;
  networkConfig?: StreamNetworkingConfig;
}

export const VideoFrame: React.FC<VideoFrameProps> = ({ streamUrl, sources, channelTitle = 'Taranga+', networkConfig }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const allSources = sources && sources.length > 0
    ? [streamUrl, ...sources.filter(u => u !== streamUrl)]
    : [streamUrl];

  const {
    mode, isPlaying, isBuffering, error, playerReady,
    levels, currentLevelIndex,
    play, pause, setLevel, setStream,
  } = usePlayer(videoRef, containerRef, allSources, channelTitle);
  const { isNative } = useNativeBridge();
  const isNativeMode = mode === 'native';

  useEffect(() => {
    if (isNativeMode) {
      document.body.classList.add('native-mode');
    } else {
      document.body.classList.remove('native-mode');
    }
    return () => document.body.classList.remove('native-mode');
  }, [isNativeMode]);

  useEffect(() => {
    if (streamUrl && playerReady) {
      if (networkConfig) {
        setStreamNetworkingConfig(networkConfig);
      } else {
        setStreamNetworkingConfig({});
      }
      setStream(streamUrl);
    }
  }, [streamUrl, setStream, playerReady, networkConfig]);

  return (
    <div
      id="video-player-container"
      ref={containerRef}
      className={`relative w-full h-full flex items-center justify-center overflow-hidden ${isNativeMode ? 'bg-transparent' : 'bg-black'}`}
      onContextMenu={(e) => e.preventDefault()}
    >
      {!isNativeMode && (
        <video
          ref={videoRef}
          autoPlay
          controls={false}
          disablePictureInPicture={false}
          crossOrigin="anonymous"
          className="w-full h-full"
        />
      )}

      {playerReady && (
        <PlayerControls
          videoRef={videoRef}
          isPlaying={isPlaying}
          isBuffering={isBuffering}
          isNativeMode={isNativeMode}
          levels={levels}
          currentLevelIndex={currentLevelIndex}
          onPlay={play}
          onPause={pause}
          onLevelChange={setLevel}
        />
      )}

      {isBuffering && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/40 z-[100]">
          <LoadingLines />
        </div>
      )}

      {error && (
        <div className="absolute bottom-4 left-4 right-4 z-[100]">
          <div className="bg-red-900/80 text-red-100 text-sm px-4 py-2 rounded-md text-center">
            {error}
          </div>
        </div>
      )}
    </div>
  );
};
