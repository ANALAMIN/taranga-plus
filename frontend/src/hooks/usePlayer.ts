import { useState, useEffect, useRef, useCallback } from 'react';

export function usePlayer(
  videoRef: React.RefObject<HTMLVideoElement | null>,
  _containerRef?: React.RefObject<HTMLElement | null>,
  sources: string[] = []
) {
  const [playerReady, setPlayerReady] = useState<boolean>(false);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [isBuffering, setIsBuffering] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [bufferHealth, setBufferHealth] = useState<number>(0);

  const loadingRef = useRef(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const sourcesRef = useRef<string[]>(sources);
  useEffect(() => { sourcesRef.current = sources; }, [sources]);

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

    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }

    const allUrls = [url, ...sourcesRef.current.filter(u => u !== url)];
    let lastError: unknown = null;

    for (let i = 0; i < allUrls.length; i++) {
      v.removeAttribute('src');
      v.load();

      try {
        v.src = allUrls[i];
        await v.play();

        setIsPlaying(true);
        intervalRef.current = setInterval(() => {
          if (v.buffered.length > 0) {
            const current = v.currentTime;
            const end = v.buffered.end(v.buffered.length - 1);
            setBufferHealth(end - current);
          }
        }, 1000);

        loadingRef.current = false;
        setIsBuffering(false);
        return;
      } catch (err) {
        lastError = err;
        console.warn(`[Taranga+] Source ${i + 1}/${allUrls.length} failed: ${allUrls[i]}`);
      }
    }

    const msg = (lastError as Error)?.message || '';
    if (msg.includes('abort')) return;
    setError(msg.includes('not supported') ? 'Format not supported' : 'Channel unavailable');
    setIsPlaying(false);
    setIsBuffering(false);
    loadingRef.current = false;
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
