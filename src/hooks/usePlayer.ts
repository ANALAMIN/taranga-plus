import { useState, useEffect, useRef, useCallback } from 'react';
import shaka from 'shaka-player/dist/shaka-player.ui';
import { initShakaPlayer } from '../player-engine/shakaCore';
import { setupAutoRecovery } from '../player-engine/autoRecover';
import { watchNetworkChanges } from '../player-engine/abrManager';

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
  sources: string[] = []
) {
  const [player, setPlayer] = useState<shaka.Player | null>(null);
  const [playerReady, setPlayerReady] = useState<boolean>(false);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [isBuffering, setIsBuffering] = useState<boolean>(false);
  const [currentQuality, setCurrentQuality] = useState<string>('Auto');
  const [bufferHealth, setBufferHealth] = useState<number>(0);

  const cleanupRecoveryRef = useRef<(() => void) | null>(null);
  const cleanupNetworkRef = useRef<(() => void) | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // Mirror player in a ref so setStream/load can run before React re-renders.
  const playerRef = useRef<shaka.Player | null>(null);
  // Keep sources in a ref so the recovery callback always has the latest list
  // without needing to be re-registered on every sources prop change.
  const sourcesRef = useRef<string[]>(sources);
  useEffect(() => { sourcesRef.current = sources; }, [sources]);

  useEffect(() => {
    const videoElement = videoRef.current;
    if (!videoElement) return;

    let cancelled = false;
    let shakaPlayer: shaka.Player | null = null;

    initShakaPlayer(videoElement, containerRef?.current || undefined)
      .then((p) => {
        // Component unmounted (or effect re-ran) before init resolved.
        if (cancelled) {
          p.destroy();
          return;
        }
        shakaPlayer = p;
        playerRef.current = p;
        setPlayer(p);
        setPlayerReady(true);

        // Start watching for network-type changes (2G/3G/4G/WiFi) and
        // re-seed ABR estimate so quality re-selects immediately.
        cleanupNetworkRef.current = watchNetworkChanges(p);

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
      if (cleanupNetworkRef.current) {
        cleanupNetworkRef.current();
        cleanupNetworkRef.current = null;
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

  const setStream = useCallback(async (url: string) => {
    // Prefer the ref so setStream works immediately after init resolves,
    // before the `player` state has propagated through a re-render.
    const activePlayer = playerRef.current ?? player;
    if (!activePlayer) return;

    try {
      if (cleanupRecoveryRef.current) {
        cleanupRecoveryRef.current();
        cleanupRecoveryRef.current = null;
      }

      await activePlayer.load(url);
      setIsPlaying(true);

      // Register multi-URL recovery using the current sources list.
      // Use sourcesRef so the closure always reflects the latest sources
      // even if the prop updates between renders.
      cleanupRecoveryRef.current = setupAutoRecovery(activePlayer, sourcesRef.current);
    } catch (err) {
      console.error('Failed to load stream:', err);
    }
  }, [player]);

  const play = useCallback(() => {
    const v = videoRef.current;
    if (v && (playerRef.current ?? player)) {
      v.play();
      setIsPlaying(true);
    }
  }, [videoRef, player]);

  const pause = useCallback(() => {
    const v = videoRef.current;
    if (v && (playerRef.current ?? player)) {
      v.pause();
      setIsPlaying(false);
    }
  }, [videoRef, player]);

  return {
    player,
    playerReady,
    isPlaying,
    isBuffering,
    currentQuality,
    bufferHealth,
    play,
    pause,
    setStream,
  };
}
