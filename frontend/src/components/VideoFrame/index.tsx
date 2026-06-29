import React, { useEffect, useRef, useState } from 'react';
import { usePlayer } from '../../hooks/usePlayer';
import { useNativeBridge } from '../../hooks/useNativeBridge';
import LoadingLines from '../UILoader';
import { PictureInPicture2 } from 'lucide-react';
import 'shaka-player/dist/controls.css';

interface VideoFrameProps {
  streamUrl: string;
  sources?: string[];
  channelTitle?: string;
}

export const VideoFrame: React.FC<VideoFrameProps> = ({ streamUrl, sources, channelTitle = 'Taranga+' }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const allSources = sources && sources.length > 0
    ? [streamUrl, ...sources.filter(u => u !== streamUrl)]
    : [streamUrl];

  const { isBuffering, error, setStream, playerReady } = usePlayer(videoRef, containerRef, allSources, channelTitle);
  const { isNative, togglePiP } = useNativeBridge();

  const [showBuffering, setShowBuffering] = useState(false);
  const bufferingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (isBuffering) {
      bufferingTimer.current = setTimeout(() => setShowBuffering(true), 2000);
    } else {
      if (bufferingTimer.current) clearTimeout(bufferingTimer.current);
      setShowBuffering(false);
    }
    return () => { if (bufferingTimer.current) clearTimeout(bufferingTimer.current); };
  }, [isBuffering]);

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

      {/* Native PiP button — only visible inside the WPF app */}
      {isNative && (
        <button
          onClick={togglePiP}
          title="Picture in Picture (Native)"
          className="absolute top-3 left-3 z-[110] bg-black/60 hover:bg-black/90 text-white p-1.5 rounded-lg border border-white/15 transition-all duration-200 backdrop-blur-sm shadow-lg"
        >
          <PictureInPicture2 size={16} strokeWidth={2} />
        </button>
      )}

      {showBuffering && (
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
