import { useState, useEffect, useRef, useCallback } from 'react';
import shaka from 'shaka-player/dist/shaka-player.ui';
import { initShakaPlayer } from '../player-engine/shakaCore';
import { setupAutoRecovery } from '../player-engine/autoRecover';

export function usePlayer(videoElement: HTMLVideoElement | null, containerElement?: HTMLElement | null) {
  const [player, setPlayer] = useState<shaka.Player | null>(null);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [isBuffering, setIsBuffering] = useState<boolean>(false);
  const [currentQuality, setCurrentQuality] = useState<string>('Auto');
  const [bufferHealth, setBufferHealth] = useState<number>(0);
  
  const cleanupRecoveryRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    if (!videoElement) return;

    let shakaPlayer: shaka.Player | null = null;
    
    initShakaPlayer(videoElement, containerElement || undefined)
      .then((p) => {
        shakaPlayer = p;
        setPlayer(p);

        p.addEventListener('buffering', (event: any) => {
          setIsBuffering(event.buffering);
        });

        p.addEventListener('adaptation', () => {
          const variants = p.getVariantTracks();
          const active = variants.find(v => v.active);
          if (active) {
             setCurrentQuality(active.height ? `${active.height}p` : 'Auto');
          }
        });

        // Simple loop to poll buffer health (for UI purely)
        const intervalId = setInterval(() => {
           if (videoElement.buffered.length > 0) {
              const current = videoElement.currentTime;
              const end = videoElement.buffered.end(videoElement.buffered.length - 1);
              // Calculate buffer in seconds
              const queued = end - current;
              setBufferHealth(queued);
           }
        }, 1000);

        return () => clearInterval(intervalId);
      })
      .catch(err => {
        console.error('Failed to init Shaka: ', err);
      });

    return () => {
      if (shakaPlayer) {
        shakaPlayer.destroy();
      }
      if (cleanupRecoveryRef.current) {
        cleanupRecoveryRef.current();
      }
    };
  }, [videoElement, containerElement]);

  const setStream = useCallback(async (url: string) => {
    if (!player) return;

    try {
      if (cleanupRecoveryRef.current) {
        cleanupRecoveryRef.current();
        cleanupRecoveryRef.current = null;
      }

      await player.load(url);
      setIsPlaying(true);
      
      cleanupRecoveryRef.current = setupAutoRecovery(player, url);
    } catch (err) {
      console.error('Failed to load stream:', err);
    }
  }, [player]);

  const play = useCallback(() => {
    if (videoElement && player) {
      videoElement.play();
      setIsPlaying(true);
    }
  }, [videoElement, player]);

  const pause = useCallback(() => {
    if (videoElement && player) {
      videoElement.pause();
      setIsPlaying(false);
    }
  }, [videoElement, player]);

  return {
    isPlaying,
    isBuffering,
    currentQuality,
    bufferHealth,
    play,
    pause,
    setStream,
  };
}
