import { useState, useEffect, useRef, useCallback } from 'react';
import shaka from 'shaka-player/dist/shaka-player.ui';
import { initShakaPlayer } from '../player-engine/shakaCore';
import { setupAutoRecovery } from '../player-engine/autoRecover';
import { friendlyShakaError } from '../utils/shakaErrors';
import { useNativeBridge } from './useNativeBridge';

/**
 * Player hook.
 *
 * Accepts the ref *objects* (not `.current`) so initialization always sees the
 * populated DOM node regardless of render order, and so the effect's identity
 * is stable across renders instead of changing on every commit.
 *
 * `sources` is the full list of validated backup URLs for the active channel
 * (from ChannelFinal.sources[]). It is forwarded to `setupAutoRecovery` so
 * that on a CRITICAL error the player cycles through alternates instead of
 * repeatedly reloading the same dead URL.
 *
 * `playerReady` is a boolean that flips true once Shaka has initialized; callers
 * can key a load effect on it so a `streamUrl` present on mount is reliably
 * loaded (the original race fired `setStream` before the player existed).
 */
export function usePlayer(
  videoRef: React.RefObject<HTMLVideoElement | null>,
  containerRef?: React.RefObject<HTMLElement | null>,
  sources: string[] = [],
  channelTitle: string = 'Taranga+'
) {
  const [player, setPlayer] = useState<shaka.Player | null>(null);
  const [playerReady, setPlayerReady] = useState<boolean>(false);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [isBuffering, setIsBuffering] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [currentQuality, setCurrentQuality] = useState<string>('Auto');
  const [bufferHealth, setBufferHealth] = useState<number>(0);

  const { updateMediaState, setKeepScreenOn } = useNativeBridge();
  const channelTitleRef = useRef(channelTitle);
  useEffect(() => { channelTitleRef.current = channelTitle; }, [channelTitle]);

  const cleanupRecoveryRef = useRef<(() => void) | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // Mirror player in a ref so setStream/load can run before React re-renders.
  const playerRef = useRef<shaka.Player | null>(null);
  // Keep sources in a ref so the recovery callback always has the latest list
  // without needing to be re-registered on every sources prop change.
  const sourcesRef = useRef<string[]>(sources);

  // When an error occurs, always clear buffering state so the loading
  // spinner doesn't stay stuck on screen forever.
  const setStreamError = useCallback((msg: string | null) => {
    setError(msg);
    if (msg !== null) {
      setIsBuffering(false);
      setBufferHealth(0);
    }
  }, []);
  useEffect(() => { sourcesRef.current = sources; }, [sources]);

  useEffect(() => {
    const videoElement = videoRef.current;
    if (!videoElement) return;

    let cancelled = false;
    let shakaPlayer: shaka.Player | null = null;
    let shakaUI: shaka.ui.Overlay | null = null;

    initShakaPlayer(videoElement, containerRef?.current || undefined)
      .then(({ player: p, ui }) => {
        // Component unmounted (or effect re-ran) before init resolved.
        if (cancelled) {
          if (ui) ui.destroy();
          p.destroy();
          return;
        }
        shakaPlayer = p;
        shakaUI = ui;
        playerRef.current = p;
        setPlayer(p);
        setPlayerReady(true);

        p.addEventListener('buffering', (event: Event & { buffering?: boolean }) => {
          setIsBuffering(Boolean(event.buffering));
        });

        p.addEventListener('adaptation', () => {
          const variants = p.getVariantTracks();
          const active = variants.find(v => v.active);
          if (active) {
             setCurrentQuality(active.height ? `${active.height}p` : 'Auto');
          }
        });

        intervalRef.current = setInterval(() => {
           if (videoElement.buffered.length > 0) {
              const current = videoElement.currentTime;
              const end = videoElement.buffered.end(videoElement.buffered.length - 1);
              const queued = end - current;
              setBufferHealth(queued);
           }
        }, 1000);
      })
      .catch(err => {
        console.error('Failed to init Shaka: ', err);
      });

    return () => {
      cancelled = true;
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      if (shakaUI) {
        shakaUI.destroy();
      }
      if (shakaPlayer) {
        shakaPlayer.destroy();
      }
      if (cleanupRecoveryRef.current) {
        cleanupRecoveryRef.current();
      }
      playerRef.current = null;
    };
  }, [videoRef, containerRef]);

  const loadingRef = useRef(false);

  const setStream = useCallback(async (url: string) => {
    const activePlayer = playerRef.current;
    if (!activePlayer || loadingRef.current) return;

    loadingRef.current = true;
    setStreamError(null);

    if (cleanupRecoveryRef.current) {
      cleanupRecoveryRef.current();
      cleanupRecoveryRef.current = null;
    }

    const allUrls = [url, ...sourcesRef.current.filter(u => u !== url)];
    let lastError: unknown = null;

    for (let i = 0; i < allUrls.length; i++) {
      try {
        await activePlayer.load(allUrls[i]);
        setIsPlaying(true);
        updateMediaState(true, channelTitleRef.current);
        setKeepScreenOn(true);

        const remainingSources = allUrls.slice(i + 1);
        if (remainingSources.length > 0) {
          cleanupRecoveryRef.current = setupAutoRecovery(
            activePlayer,
            remainingSources,
            (reason) => setStreamError(reason ?? null)
          );
        }
        loadingRef.current = false;
        return;
      } catch (err) {
        lastError = err;
        console.warn(`[Taranga+] Source ${i + 1}/${allUrls.length} failed: ${allUrls[i]}`);
      }
    }

    console.error('[Taranga+] All sources exhausted.');
    setStreamError(friendlyShakaError(lastError));
    loadingRef.current = false;
  }, []);

  const play = useCallback(() => {
    const v = videoRef.current;
    if (v && playerRef.current) {
      v.play();
      setIsPlaying(true);
      updateMediaState(true, channelTitleRef.current);
      setKeepScreenOn(true);
    }
  }, [videoRef, updateMediaState, setKeepScreenOn]);

  const pause = useCallback(() => {
    const v = videoRef.current;
    if (v && playerRef.current) {
      v.pause();
      setIsPlaying(false);
      updateMediaState(false, channelTitleRef.current);
      setKeepScreenOn(false);
    }
  }, [videoRef, updateMediaState, setKeepScreenOn]);

  return {
    player,
    playerReady,
    isPlaying,
    isBuffering,
    error,
    currentQuality,
    bufferHealth,
    play,
    pause,
    setStream,
  };
}
