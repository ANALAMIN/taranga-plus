import { useState, useEffect, useRef, useCallback } from 'react';
import Hls, { ErrorData, ErrorTypes, LevelSwitchedData } from 'hls.js';
import { createHlsInstance } from '../player-engine/hlsCore';
import { friendlyStreamError } from '../utils/streamErrors';
import { useNativeBridge } from './useNativeBridge';
import { getNetworkConfig } from '../player-engine/customFilters';

type PlayerMode = 'native' | 'hlsjs' | 'idle';

export function usePlayer(
  videoRef: React.RefObject<HTMLVideoElement | null>,
  containerRef?: React.RefObject<HTMLElement | null>,
  sources: string[] = [],
  channelTitle: string = 'Taranga+'
) {
  const [mode, setMode] = useState<PlayerMode>('idle');
  const [playerReady, setPlayerReady] = useState<boolean>(false);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [isBuffering, setIsBuffering] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [currentQuality, setCurrentQuality] = useState<string>('Auto');
  const [currentLevelIndex, setCurrentLevelIndex] = useState<number>(-1);
  const [levels, setLevels] = useState<{ height: number; width: number; bitrate: number; name: string }[]>([]);
  const [bufferHealth, setBufferHealth] = useState<number>(0);

  const bridge = useNativeBridge();
  const channelTitleRef = useRef(channelTitle);
  useEffect(() => { channelTitleRef.current = channelTitle; }, [channelTitle]);

  const hlsRef = useRef<Hls | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const sourcesRef = useRef<string[]>(sources);
  const loadingRef = useRef(false);
  const useNativeRef = useRef(false);

  const setStreamError = useCallback((msg: string | null) => {
    setError(msg);
    if (msg !== null) {
      setIsBuffering(false);
      setBufferHealth(0);
    }
  }, []);

  useEffect(() => { sourcesRef.current = sources; }, [sources]);

  const destroyHls = useCallback(() => {
    const hls = hlsRef.current;
    if (hls) {
      try { hls.destroy(); } catch { }
      hlsRef.current = null;
    }
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  useEffect(() => {
    if (useNativeRef.current) return;

    const videoElement = videoRef.current;
    if (!videoElement) return;

    let hls: Hls | null = null;

    hls = createHlsInstance(videoElement);
    hlsRef.current = hls;
    setPlayerReady(true);
    setMode('hlsjs');

    hls.on(Hls.Events.MANIFEST_PARSED, () => {
      const h = hlsRef.current;
      if (h && h.levels) {
        setLevels(h.levels.map((l: { height: number; width: number; bitrate: number }) => ({
          height: l.height,
          width: l.width,
          bitrate: l.bitrate,
          name: l.height ? `${l.height}p` : `${Math.round(l.bitrate / 1000)}k`,
        })));
      }
      const v = videoRef.current;
      if (v && v.paused) {
        v.play().catch(e => console.warn('[Taranga+] Autoplay:', e));
      }
    });

    hls.on(Hls.Events.LEVEL_SWITCHED, (_event: string, data: LevelSwitchedData) => {
      setCurrentLevelIndex(data.level);
      const h = hlsRef.current;
      if (!h) return;
      const level = h.levels[data.level];
      setCurrentQuality(level?.height ? `${level.height}p` : 'Auto');
    });

    hls.on(Hls.Events.BUFFER_APPENDED, () => setIsBuffering(false));
    hls.on(Hls.Events.FRAG_BUFFERED, () => setIsBuffering(false));

    hls.on(Hls.Events.ERROR, (_event: string, data: ErrorData) => {
      if (data.fatal) setIsBuffering(true);
    });

    intervalRef.current = setInterval(() => {
      const v = videoRef.current;
      if (v && v.buffered.length > 0) {
        const end = v.buffered.end(v.buffered.length - 1);
        setBufferHealth(end - v.currentTime);
      }
    }, 1000);

    return () => {
      destroyHls();
    };
  }, [videoRef, destroyHls]);

  const loadWithHls = useCallback((url: string, hls: Hls): Promise<void> => {
    return new Promise((resolve, reject) => {
      const onError = (_event: string, data: ErrorData) => {
        if (data.fatal) {
          hls.off(Hls.Events.MANIFEST_PARSED, onParsed);
          hls.off(Hls.Events.ERROR, onError);
          reject(data);
        }
      };
      const onParsed = () => {
        hls.off(Hls.Events.MANIFEST_PARSED, onParsed);
        hls.off(Hls.Events.ERROR, onError);
        resolve();
      };
      hls.on(Hls.Events.MANIFEST_PARSED, onParsed);
      hls.on(Hls.Events.ERROR, onError);
      hls.loadSource(url);
    });
  }, []);

  const playNative = useCallback(async (url: string): Promise<void> => {
    const v = videoRef.current;
    if (!v) throw new Error('No video element');
    v.muted = true;
    v.src = url;
    await v.play();
    setTimeout(() => { if (v) v.muted = false; }, 1000);
  }, []);

  const setStream = useCallback(async (url: string) => {
    if (loadingRef.current) return;
    loadingRef.current = true;
    setStreamError(null);
    useNativeRef.current = false;

    const nativeAvail = await bridge.isNativeAvailable();
    if (nativeAvail) {
      useNativeRef.current = true;
      setMode('native');
      setPlayerReady(true);

      try {
        const netConfig = getNetworkConfig();
        await bridge.playNative(url, netConfig.referer, netConfig.userAgent);
        setIsPlaying(true);
        setIsBuffering(false);
        bridge.updateMediaState(true, channelTitleRef.current);
        bridge.setKeepScreenOn(true);
        containerRef?.current?.classList.remove('native-fallback');
        loadingRef.current = false;
        return;
      } catch {
        console.warn('[Taranga+] Native playback failed, falling back to hls.js');
        useNativeRef.current = false;
      }
    }

    setMode('hlsjs');
    destroyHls();

    const allUrls = [url, ...sourcesRef.current.filter(u => u !== url)];
    let lastError: unknown = null;

    for (let i = 0; i < allUrls.length; i++) {
      const currentUrl = allUrls[i];
      console.info(`[Taranga+] hls.js attempt ${i + 1}/${allUrls.length}: ${currentUrl}`);

      const hls = createHlsInstance(videoRef.current!);
      hlsRef.current = hls;
      setPlayerReady(true);

      try {
        await loadWithHls(currentUrl, hls);

        hls.on(Hls.Events.BUFFER_APPENDED, () => setIsBuffering(false));
        hls.on(Hls.Events.FRAG_BUFFERED, () => setIsBuffering(false));

        hls.on(Hls.Events.LEVEL_SWITCHED, (_event: string, data: LevelSwitchedData) => {
          const h = hlsRef.current;
          if (!h) return;
          const level = h.levels[data.level];
          setCurrentQuality(level?.height ? `${level.height}p` : 'Auto');
        });

        hls.on(Hls.Events.ERROR, (_event: string, data: ErrorData) => {
          if (!hlsRef.current) return;
          if (data.fatal) {
            if (data.type === ErrorTypes.MEDIA_ERROR) {
              try { hls.recoverMediaError(); } catch { }
            } else if (data.type === ErrorTypes.NETWORK_ERROR) {
              try { hls.startLoad(); } catch { }
            }
            setIsBuffering(true);
          }
        });

        const v = videoRef.current;
        if (v && v.paused) {
          v.play().catch(e => console.warn('[Taranga+] Autoplay:', e));
        }

        setIsPlaying(true);
        bridge.updateMediaState(true, channelTitleRef.current);
        bridge.setKeepScreenOn(true);
        setIsBuffering(false);
        loadingRef.current = false;
        return;
      } catch (err) {
        lastError = err;
        console.warn(`[Taranga+] hls.js failed for ${currentUrl}`);
        hls.destroy();
        hlsRef.current = null;
        setPlayerReady(false);

        try {
          await playNative(currentUrl);
          containerRef?.current?.classList.add('native-fallback');
          setIsPlaying(true);
          bridge.updateMediaState(true, channelTitleRef.current);
          bridge.setKeepScreenOn(true);
          loadingRef.current = false;
          return;
        } catch {
          containerRef?.current?.classList.remove('native-fallback');
        }
      }
    }

    console.error('[Taranga+] All sources exhausted.');
    setStreamError(friendlyStreamError(lastError));
    loadingRef.current = false;
  }, [videoRef, containerRef, destroyHls, loadWithHls, playNative, bridge, setStreamError]);

  const setLevel = useCallback((index: number) => {
    const hls = hlsRef.current;
    if (!hls) return;
    hls.currentLevel = index;
  }, []);

  const play = useCallback(async () => {
    if (useNativeRef.current) {
      await bridge.resumeNative();
    } else {
      videoRef.current?.play().catch(() => {});
    }
    setIsPlaying(true);
    bridge.updateMediaState(true, channelTitleRef.current);
    bridge.setKeepScreenOn(true);
  }, [videoRef, bridge]);

  const pause = useCallback(async () => {
    if (useNativeRef.current) {
      await bridge.pauseNative();
    } else {
      videoRef.current?.pause();
    }
    setIsPlaying(false);
    bridge.updateMediaState(false, channelTitleRef.current);
    bridge.setKeepScreenOn(false);
  }, [videoRef, bridge]);

  return {
    mode,
    playerReady,
    isPlaying,
    isBuffering,
    error,
    currentQuality,
    currentLevelIndex,
    levels,
    bufferHealth,
    play,
    pause,
    setLevel,
    setStream,
  };
}
