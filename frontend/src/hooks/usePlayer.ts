import { useState, useEffect, useRef, useCallback } from 'react';

export function usePlayer(
  videoRef: React.RefObject<HTMLVideoElement | null>,
  _containerRef?: React.RefObject<HTMLElement | null>,
  _sources?: string[]
) {
  const [playerReady, setPlayerReady] = useState<boolean>(false);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [isBuffering, setIsBuffering] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [bufferHealth, setBufferHealth] = useState<number>(0);

  const loadingRef = useRef(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Mark ready once the video element exists
  useEffect(() => {
    if (videoRef.current && !playerReady) {
      setPlayerReady(true);
    }
  }, [videoRef, playerReady]);

  const setStream = useCallback(async (url: string) => {
    const v = videoRef.current;
    if (!v || loadingRef.current) return;

    loadingRef.current = true;
    setError(null);
    setIsBuffering(true);

    // Clear previous source
    v.removeAttribute('src');
    v.load();

    // Clear stale buffer interval
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }

    try {
      v.src = url;
      await v.play();

      setIsPlaying(true);

      // Track buffer health
      intervalRef.current = setInterval(() => {
        if (v.buffered.length > 0) {
          const current = v.currentTime;
          const end = v.buffered.end(v.buffered.length - 1);
          setBufferHealth(end - current);
        }
      }, 1000);
    } catch (err: unknown) {
      const msg = (err as Error)?.message || '';
      if (msg.includes('abort')) {
        // User navigated away during load – ignore
        return;
      }
      setError(msg.includes('not supported') ? 'Format not supported' : 'Channel unavailable');
      setIsPlaying(false);
    } finally {
      setIsBuffering(false);
      loadingRef.current = false;
    }
  }, []);

  const play = useCallback(() => {
    const v = videoRef.current;
    if (v) {
      v.play();
      setIsPlaying(true);
    }
  }, [videoRef]);

  const pause = useCallback(() => {
    const v = videoRef.current;
    if (v) {
      v.pause();
      setIsPlaying(false);
    }
  }, [videoRef]);

  return {
    player: null,
    playerReady,
    isPlaying,
    isBuffering,
    error,
    currentQuality: 'Auto',
    bufferHealth,
    play,
    pause,
    setStream,
  };
}
