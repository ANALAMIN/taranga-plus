import shaka from 'shaka-player/dist/shaka-player.ui';

/**
 * Silent stream recovery system.
 * Listens for Shaka's error events. On CRITICAL errors:
 *   1. Wait 2 seconds silently
 *   2. Reload the same stream URL automatically
 *   3. Try up to 3 times before showing error UI (or failing silently)
 */
export function setupAutoRecovery(player: shaka.Player, streamUrl: string, onErrorFallback?: () => void): () => void {
  let retryCount = 0;
  const MAX_RETRIES = 3;
  let timeoutId: ReturnType<typeof setTimeout> | null = null;

  const errorHandler = (event: Event | CustomEvent) => {
    const customEvent = event as CustomEvent<shaka.extern.Error>;
    const error = customEvent.detail;
    
    if (!error) return;

    if (error.severity === shaka.util.Error.Severity.CRITICAL) {
      console.warn(`[Taranga+] Stream failure detected. Code: ${error.code}`);

      if (retryCount < MAX_RETRIES) {
        retryCount++;
        console.log(`[Taranga+] Attempting silent recovery (${retryCount}/${MAX_RETRIES}) in 2 seconds...`);

        timeoutId = setTimeout(async () => {
          try {
            await player.load(streamUrl);
            console.log('[Taranga+] Stream recovered successfully.');
            retryCount = 0;
          } catch (e) {
            console.error('[Taranga+] Silent recovery failed: ', e);
          }
        }, 2000);

      } else {
        console.error('[Taranga+] Stream unrecoverable after max retries.');
        if (onErrorFallback) {
          onErrorFallback();
        }
      }
    }
  };

  player.addEventListener('error', errorHandler);

  return () => {
    player.removeEventListener('error', errorHandler);
    if (timeoutId) {
      clearTimeout(timeoutId);
      timeoutId = null;
    }
  };
}
