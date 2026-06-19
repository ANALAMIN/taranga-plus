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

  const errorHandler = (event: Event | CustomEvent) => {
    // Cast to access detail properly in TS
    const customEvent = event as CustomEvent<shaka.extern.Error>;
    const error = customEvent.detail;
    
    if (!error) return;

    // Only auto-recover on CRITICAL severity errors
    if (error.severity === shaka.util.Error.Severity.CRITICAL) {
      console.warn(`[Taranga+] Stream failure detected. Code: ${error.code}`);

      if (retryCount < MAX_RETRIES) {
        retryCount++;
        console.log(`[Taranga+] Attempting silent recovery (${retryCount}/${MAX_RETRIES}) in 2 seconds...`);

        // 1. Wait 2 seconds silently
        setTimeout(async () => {
          try {
            // 2. Reload the same stream URL automatically
            await player.load(streamUrl);
            console.log('[Taranga+] Stream recovered successfully.');
            retryCount = 0; // Reset on success
          } catch (e) {
            console.error('[Taranga+] Silent recovery failed: ', e);
            // This will trigger another error event naturally, looping up to MAX_RETRIES
          }
        }, 2000);

      } else {
        console.error('[Taranga+] Stream unrecoverable after max retries.');
        // Notify the UI to show an error if a fallback is provided
        if (onErrorFallback) {
          onErrorFallback();
        }
      }
    }
  };

  // Listen to shaka.util.Error events
  player.addEventListener('error', errorHandler);

  // Return a cleanup function
  return () => {
    player.removeEventListener('error', errorHandler);
  };
}
