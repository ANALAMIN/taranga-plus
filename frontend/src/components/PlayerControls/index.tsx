import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Play, Pause, Volume2, VolumeX, Maximize, Minimize } from 'lucide-react';

interface PlayerControlsProps {
  videoRef: React.RefObject<HTMLVideoElement | null>;
  isPlaying: boolean;
  isBuffering: boolean;
  isNativeMode: boolean;
  levels: { height: number; width: number; bitrate: number; name: string }[];
  currentLevelIndex: number;
  onPlay: () => void;
  onPause: () => void;
  onLevelChange: (index: number) => void;
  onSeek?: (time: number) => void;
  onVolumeChange?: (vol: number) => void;
  onMuteToggle?: () => void;
}

function formatTime(seconds: number): string {
  if (!isFinite(seconds) || seconds < 0) return '0:00';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${m}:${String(s).padStart(2, '0')}`;
}

export const PlayerControls: React.FC<PlayerControlsProps> = ({
  videoRef, isPlaying, isBuffering, isNativeMode,
  levels, currentLevelIndex, onPlay, onPause, onLevelChange,
}) => {
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);
  const [muted, setMuted] = useState(false);
  const [showVolumeSlider, setShowVolumeSlider] = useState(false);
  const [showQualityMenu, setShowQualityMenu] = useState(false);
  const [showControls, setShowControls] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [bufferedEnd, setBufferedEnd] = useState(0);

  const controlsTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const seekingRef = useRef(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const video = videoRef.current;

  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;

    const onTimeUpdate = () => { if (!seekingRef.current) setCurrentTime(v.currentTime); };
    const onDurationChange = () => setDuration(v.duration || 0);
    const onVolumeChangeEv = () => { setVolume(v.volume); setMuted(v.muted); };
    const onProgress = () => {
      if (v.buffered.length > 0) {
        setBufferedEnd(v.buffered.end(v.buffered.length - 1));
      }
    };
    const onPlayEv = () => setCurrentTime(v.currentTime);
    const onLoaded = () => setDuration(v.duration || 0);

    v.addEventListener('timeupdate', onTimeUpdate);
    v.addEventListener('durationchange', onDurationChange);
    v.addEventListener('volumechange', onVolumeChangeEv);
    v.addEventListener('progress', onProgress);
    v.addEventListener('play', onPlayEv);
    v.addEventListener('loadedmetadata', onLoaded);

    setDuration(v.duration || 0);
    setVolume(v.volume);
    setMuted(v.muted);

    return () => {
      v.removeEventListener('timeupdate', onTimeUpdate);
      v.removeEventListener('durationchange', onDurationChange);
      v.removeEventListener('volumechange', onVolumeChangeEv);
      v.removeEventListener('progress', onProgress);
      v.removeEventListener('play', onPlayEv);
      v.removeEventListener('loadedmetadata', onLoaded);
    };
  }, [videoRef]);

  useEffect(() => {
    const onFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener('fullscreenchange', onFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', onFullscreenChange);
  }, []);

  const resetControlsTimer = useCallback(() => {
    setShowControls(true);
    setShowQualityMenu(false);
    setShowVolumeSlider(false);
    if (controlsTimer.current) clearTimeout(controlsTimer.current);
    controlsTimer.current = setTimeout(() => {
      if (!seekingRef.current) setShowControls(false);
    }, 3000);
  }, []);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const onMouseMove = () => resetControlsTimer();
    container.addEventListener('mousemove', onMouseMove);
    container.addEventListener('mouseenter', () => setShowControls(true));
    return () => {
      container.removeEventListener('mousemove', onMouseMove);
      container.removeEventListener('mouseenter', () => setShowControls(true));
      if (controlsTimer.current) clearTimeout(controlsTimer.current);
    };
  }, [resetControlsTimer]);

  useEffect(() => {
    resetControlsTimer();
  }, [isPlaying, resetControlsTimer]);

  const handleSeek = (e: React.MouseEvent<HTMLDivElement>) => {
    const v = videoRef.current;
    if (!v || !duration) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const pos = (e.clientX - rect.left) / rect.width;
    v.currentTime = pos * duration;
    setCurrentTime(v.currentTime);
  };

  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = videoRef.current;
    if (!v) return;
    const val = parseFloat(e.target.value);
    v.volume = val;
    v.muted = val === 0;
    setVolume(val);
    setMuted(val === 0);
  };

  const toggleMute = () => {
    const v = videoRef.current;
    if (!v) return;
    v.muted = !v.muted;
    setMuted(v.muted);
  };

  const toggleFullscreen = () => {
    const container = containerRef.current?.closest('#video-player-container') as HTMLElement;
    if (!container) return;
    if (!document.fullscreenElement) {
      container.requestFullscreen();
    } else {
      document.exitFullscreen();
    }
  };

  const progressPct = duration > 0 ? (currentTime / duration) * 100 : 0;
  const bufferedPct = duration > 0 ? (bufferedEnd / duration) * 100 : 0;

  return (
    <div
      ref={containerRef}
      className={`absolute inset-0 z-50 flex flex-col justify-end transition-opacity duration-300 ${
        showControls ? 'opacity-100' : 'opacity-0 pointer-events-none'
      }`}
    >
      <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent pointer-events-none" />

      {!isPlaying && !isBuffering && (
        <button
          onClick={onPlay}
          className="absolute inset-0 flex items-center justify-center z-10 cursor-pointer"
        >
          <div className="w-20 h-20 rounded-full bg-white/20 backdrop-blur-md flex items-center justify-center hover:bg-white/30 transition-all">
            <Play size={40} className="text-white fill-white ml-2" />
          </div>
        </button>
      )}

      <div className="relative z-20 px-4 pb-3 space-y-2">
        <div
          className="relative h-1.5 group cursor-pointer"
          onMouseDown={handleSeek}
        >
          <div className="absolute inset-0 rounded-full bg-white/20" />
          <div
            className="absolute inset-y-0 left-0 rounded-full bg-white/40"
            style={{ width: `${bufferedPct}%` }}
          />
          <div
            className="absolute inset-y-0 left-0 rounded-full bg-red-600 group-hover:bg-red-500 transition-colors"
            style={{ width: `${progressPct}%` }}
          >
            <div className="absolute right-0 top-1/2 -translate-y-1/2 w-3.5 h-3.5 rounded-full bg-white opacity-0 group-hover:opacity-100 transition-opacity shadow-lg" />
          </div>
        </div>

        <div className="flex items-center gap-2 text-white text-sm">
          <button onClick={isPlaying ? onPause : onPlay} className="p-1 hover:text-white/80 cursor-pointer">
            {isPlaying ? <Pause size={20} fill="white" /> : <Play size={20} fill="white" />}
          </button>

          <span className="text-xs font-medium tabular-nums min-w-[90px]">
            {formatTime(currentTime)} / {formatTime(duration)}
          </span>

          <div className="flex-1" />

          <div
            className="relative flex items-center"
            onMouseEnter={() => setShowVolumeSlider(true)}
            onMouseLeave={() => setShowVolumeSlider(false)}
          >
            <button onClick={toggleMute} className="p-1 hover:text-white/80 cursor-pointer">
              {muted || volume === 0 ? <VolumeX size={18} /> : <Volume2 size={18} />}
            </button>
              {showVolumeSlider && (
                <div className="flex items-center ml-1">
                  <div className="relative w-20 h-1 bg-white/20 rounded-full">
                    <div
                      className="absolute inset-y-0 left-0 bg-white rounded-full"
                      style={{ width: `${(muted ? 0 : volume) * 100}%` }}
                    />
                    <input
                      type="range"
                      min={0}
                      max={1}
                      step={0.05}
                      value={muted ? 0 : volume}
                      onChange={handleVolumeChange}
                      className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                    />
                  </div>
                </div>
              )}
          </div>

          {levels.length > 1 && (
            <div className="relative">
              <button
                onClick={() => setShowQualityMenu(!showQualityMenu)}
                className="p-1 hover:text-white/80 cursor-pointer text-xs font-medium"
              >
                {currentLevelIndex === -1 ? 'Auto' : levels[currentLevelIndex]?.name || 'Auto'}
              </button>
              {showQualityMenu && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setShowQualityMenu(false)} />
                  <div className="absolute bottom-full right-0 mb-2 bg-black/90 backdrop-blur-md rounded-lg overflow-hidden z-50 min-w-[120px] shadow-xl border border-white/10">
                    <button
                      onClick={() => { onLevelChange(-1); setShowQualityMenu(false); }}
                      className={`w-full text-left px-3 py-1.5 text-xs hover:bg-white/10 cursor-pointer ${
                        currentLevelIndex === -1 ? 'text-red-500' : 'text-white/80'
                      }`}
                    >
                      Auto
                    </button>
                    {levels.map((l, i) => (
                      <button
                        key={i}
                        onClick={() => { onLevelChange(i); setShowQualityMenu(false); }}
                        className={`w-full text-left px-3 py-1.5 text-xs hover:bg-white/10 cursor-pointer ${
                          currentLevelIndex === i ? 'text-red-500' : 'text-white/80'
                        }`}
                      >
                        {l.name}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
          )}

          <button
            onClick={toggleFullscreen}
            className="p-1 hover:text-white/80 cursor-pointer"
          >
            {isFullscreen ? <Minimize size={18} /> : <Maximize size={18} />}
          </button>
        </div>
      </div>
    </div>
  );
};
