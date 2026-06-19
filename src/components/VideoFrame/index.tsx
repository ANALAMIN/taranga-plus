import React, { useEffect, useRef, useState } from 'react';
import { usePlayer } from '../../hooks/usePlayer';
import { UILoader } from '../UILoader';
import 'shaka-player/dist/controls.css'; // Add default Shaka UI styling

interface VideoFrameProps {
  streamUrl: string;
}

/**
 * The main video player container.
 */
export const VideoFrame: React.FC<VideoFrameProps> = ({ streamUrl }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [isReady, setIsReady] = useState(false);
  
  // We use isReady to ensure containerRef.current is populated before passing to the hook
  useEffect(() => {
    setIsReady(true);
  }, []);

  const { isPlaying, isBuffering, setStream } = usePlayer(
    isReady ? videoRef.current : null, 
    isReady ? containerRef.current : null
  );

  useEffect(() => {
    if (streamUrl && isReady) {
      setStream(streamUrl);
    }
  }, [streamUrl, setStream, isReady]);

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
        className="w-full h-full"
      />

      {isBuffering && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/40 pointer-events-none z-[100]">
          <UILoader />
        </div>
      )}
    </div>
  );
};

