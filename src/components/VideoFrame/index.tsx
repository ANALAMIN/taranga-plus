import React, { useEffect, useRef, useState } from 'react';
import { usePlayer } from '../../hooks/usePlayer';
import LoadingLines from '../UILoader';
import 'shaka-player/dist/controls.css';

interface VideoFrameProps {
  streamUrl: string;
  sources?: string[];
  onClose?: () => void;
}

interface BackendApi {
  PlayStream: (url: string) => void;
  StopPlayback: () => void;
  PausePlayback: () => void;
  ResumePlayback: () => void;
  SetVolume: (level: number) => void;
}

function getBackend(): BackendApi | undefined {
  try {
    return (window as any).chrome?.webview?.hostObjects?.backend;
  } catch { return undefined; }
}

export const VideoFrame: React.FC<VideoFrameProps> = ({ streamUrl, sources, onClose }) => {
  const backend = getBackend();
  const isNative = Boolean(backend);

  if (isNative) {
    return <NativePlayer streamUrl={streamUrl} onClose={onClose} backend={backend!} />;
  }

  return <ShakaPlayer streamUrl={streamUrl} sources={sources} />;
};

function NativePlayer({ streamUrl, onClose, backend }: { streamUrl: string; onClose?: () => void; backend: BackendApi }) {
  const [volume, setVolume] = useState(1);

  useEffect(() => {
    backend.PlayStream(streamUrl);
    return () => { try { backend.StopPlayback(); } catch {} };
  }, [streamUrl, backend]);

  const handleVolume = (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = parseFloat(e.target.value);
    setVolume(v);
    backend.SetVolume(v);
  };

  return (
    <div className="relative w-full h-full bg-black flex items-center justify-center">
      <div className="text-center text-white/50 text-sm">
        <div className="text-4xl mb-2 opacity-30">▶</div>
        <p className="text-xs uppercase tracking-wider">Native hardware playback</p>
      </div>

      <div className="absolute bottom-4 left-4 right-4 flex items-center justify-between gap-3 z-10">
        {onClose && (
          <button onClick={onClose} className="bg-white/10 hover:bg-white/20 text-white text-xs px-3 py-1.5 rounded-lg border border-white/10 transition-colors">
            ← Browse
          </button>
        )}
        <div className="flex items-center gap-2 ml-auto">
          <span className="text-white/40 text-xs">Vol</span>
          <input type="range" min="0" max="1" step="0.05" value={volume} onChange={handleVolume} className="w-20 accent-white/60" />
        </div>
      </div>
    </div>
  );
}

function ShakaPlayer({ streamUrl, sources }: { streamUrl: string; sources?: string[] }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const allSources = sources && sources.length > 0
    ? [streamUrl, ...sources.filter(u => u !== streamUrl)]
    : [streamUrl];

  const { isBuffering, error, setStream, playerReady } = usePlayer(videoRef, containerRef, allSources);

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
}
