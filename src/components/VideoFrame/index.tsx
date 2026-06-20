import React, { useEffect, useRef } from 'react';
import { usePlayer } from '../../hooks/usePlayer';
import LoadingLines from '../UILoader';
import 'shaka-player/dist/controls.css';

interface VideoFrameProps {
  streamUrl: string;
}

/**
 * Video frame.
 *
 * The player hook receives the ref *objects* (not `.current`), so initialization
 * is decoupled from render order and synthetic `isReady` flags. The stream is
 * loaded by an effect keyed on `[streamUrl, playerReady]`, which reliably fires
 * both when the URL arrives late and when the URL is already present on mount
 * but the player has not yet initialized.
 */
export const VideoFrame: React.FC<VideoFrameProps> = ({ streamUrl }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const { isBuffering, setStream, playerReady } = usePlayer(videoRef, containerRef);

  // Load the stream when the URL changes OR when the player finishes
  // initializing for an URL that was already present.
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
        // anonymous COEP is required for Shaka HLS over XHR; origins that lack
        // ACAO headers must be proxied server-side (see Cloudflare stream proxy).
        crossOrigin="anonymous"
        className="w-full h-full"
      />

      {isBuffering && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/40 pointer-events-none z-[100]">
          <LoadingLines />
        </div>
      )}
    </div>
  );
};
