import React, { useEffect, useRef } from 'react';
import { usePlayer } from '../../hooks/usePlayer';
import LoadingLines from '../UILoader';
import 'shaka-player/dist/controls.css';

interface VideoFrameProps {
  streamUrl: string;
  /** All validated backup URLs for this channel (from ChannelFinal.sources[]). */
  sources?: string[];
}

/**
 * Video frame.
 *
 * The player hook receives the ref *objects* (not `.current`), so initialization
 * is decoupled from render order and synthetic `isReady` flags. The stream is
 * loaded by an effect keyed on `[streamUrl, playerReady]`, which reliably fires
 * both when the URL arrives late and when the URL is already present on mount
 * but the player has not yet initialized.
 *
 * `sources` is passed through to `usePlayer` so `autoRecover` can cycle through
 * backup URLs on failure instead of retrying the same dead stream.
 */
export const VideoFrame: React.FC<VideoFrameProps> = ({ streamUrl, sources }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Build the full source list: primary URL first, then backups (deduplicated).
  const allSources = sources && sources.length > 0
    ? [streamUrl, ...sources.filter(u => u !== streamUrl)]
    : [streamUrl];

  const { isBuffering, error, setStream, playerReady } = usePlayer(videoRef, containerRef, allSources);

  // Load the stream when the URL changes OR when the player finishes
  // initializing for a URL that was already present.
  useEffect(() => {
    if (streamUrl && playerReady) {
      setStream(streamUrl);
    }
  }, [streamUrl, setStream, playerReady]);

  return (
    <div
      id="video-player-container"
      ref={containerRef}
      className="relative w-full h-full bg-black flex items-center justify-center overflow-hidden shaka-video-container"
    >
      <video
        ref={videoRef}
        autoPlay
        controls={false}
        disablePictureInPicture={false}
        crossOrigin="anonymous"
        className="w-full h-full"
      />

      {isBuffering && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/40 pointer-events-none z-[100]">
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
