import React, { useEffect, useRef, useState } from 'react';
import { usePlayer } from '../../hooks/usePlayer';
import LoadingLines from '../UILoader';
import 'shaka-player/dist/controls.css';

interface VideoFrameProps {
  streamUrl: string;
  sources?: string[];
  channelName?: string;
  channelLogo?: string;
}

function pad(n: number): string {
  return n < 10 ? `0${n}` : `${n}`;
}

export const VideoFrame: React.FC<VideoFrameProps> = ({ streamUrl, sources, channelName, channelLogo }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const allSources = sources && sources.length > 0
    ? [streamUrl, ...sources.filter(u => u !== streamUrl)]
    : [streamUrl];

  const { isBuffering, error, setStream, playerReady } = usePlayer(videoRef, containerRef, allSources);

  const [showBuffering, setShowBuffering] = useState(false);
  const bufferingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Starting overlay: visible until stream first plays or error fires
  const [starting, setStarting] = useState(true);
  const startedRef = useRef(false);
  const [fakeSec, setFakeSec] = useState(0);

  useEffect(() => {
    if (!startedRef.current && playerReady && !isBuffering && streamUrl) {
      startedRef.current = true;
      const t = setTimeout(() => setStarting(false), 400);
      return () => clearTimeout(t);
    }
  }, [playerReady, isBuffering, streamUrl]);

  useEffect(() => {
    if (error) setStarting(false);
  }, [error]);

  useEffect(() => {
    if (!starting) return;
    const interval = setInterval(() => setFakeSec(s => s + 1), 1000);
    return () => clearInterval(interval);
  }, [starting]);

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

  const mins = Math.floor(fakeSec / 60);
  const secs = fakeSec % 60;

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

      {starting && (
        <div className="absolute inset-0 z-[99] flex flex-col items-center justify-center gap-4 bg-black transition-opacity duration-500">
          {channelLogo ? (
            <div className="w-16 h-16 md:w-20 md:h-20 rounded-full bg-white/5 border border-white/10 flex items-center justify-center p-3 shadow-inner">
              <img src={channelLogo} alt="" className="w-full h-full object-contain" />
            </div>
          ) : (
            <div className="w-16 h-16 md:w-20 md:h-20 rounded-full bg-white/5 border border-white/10 flex items-center justify-center">
              <span className="text-white/60 text-2xl font-bold">{channelName?.charAt(0)}</span>
            </div>
          )}
          {channelName && (
            <span className="text-white/80 text-sm font-medium tracking-wide">{channelName}</span>
          )}
          <div className="text-white/40 text-xs tabular-nums tracking-widest">
            {pad(mins)}:{pad(secs)}
          </div>
          <div className="mt-1">
            <svg className="animate-spin h-4 w-4 text-white/30" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
          </div>
        </div>
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
