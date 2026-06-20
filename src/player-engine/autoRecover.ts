import shaka from 'shaka-player/dist/shaka-player.ui';

/**
 * Silent multi-URL stream recovery system (spec §6.3).
 *
 * On a CRITICAL Shaka error:
 *   1. Try the next URL in `sources[]` (the backup routes validated in Tier 1).
 *   2. Only after all sources are exhausted does it call `onErrorFallback`.
 *   3. On successful load from a backup, resets the source pointer to 0 so future
 *      failures cycle from the beginning again.
 *
 * The caller passes the full `sources` array (from ChannelFinal.sources). The
 * primary `streamUrl` should also be the first entry in `sources[]` (the validator
 * produces them this way, sorted by latency). If `sources` is empty the behavior
 * degrades gracefully to the previous single-URL retry pattern.
 */
export function setupAutoRecovery(
  player: shaka.Player,
  sources: string[],
  onErrorFallback?: () => void
): () => void {
  // Keep a mutable cursor so each error attempt advances to the next source.
  let sourceIndex = 0;
  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  let recovering = false;

  const errorHandler = (event: Event | CustomEvent) => {
    const customEvent = event as CustomEvent<shaka.extern.Error>;
    const error = customEvent.detail;
    if (!error) return;

    if (error.severity !== shaka.util.Error.Severity.CRITICAL) return;
    if (recovering) return; // debounce — don't stack retries

    console.warn(`[Taranga+] Stream failure. Code: ${error.code}`);

    // Advance to the next source (wraps back on exhaustion).
    sourceIndex = (sourceIndex + 1) % Math.max(sources.length, 1);
    const nextUrl = sources[sourceIndex] ?? sources[0];

    if (!nextUrl) {
      console.error('[Taranga+] No sources available for recovery.');
      onErrorFallback?.();
      return;
    }

    // If we've cycled all the way back to the beginning, all sources failed.
    const exhausted = sources.length > 1 && sourceIndex === 0;
    if (exhausted) {
      console.error('[Taranga+] All sources exhausted — surfacing error to user.');
      onErrorFallback?.();
      return;
    }

    recovering = true;
    console.log(`[Taranga+] Trying source ${sourceIndex + 1}/${sources.length}: ${nextUrl}`);

    timeoutId = setTimeout(async () => {
      try {
        await player.load(nextUrl);
        console.log('[Taranga+] Recovery succeeded.');
        // Reset index so next failure cycles from scratch.
        sourceIndex = 0;
      } catch (e) {
        console.error('[Taranga+] Recovery load failed:', e);
        // Let the next error event drive the next attempt.
      } finally {
        recovering = false;
      }
    }, 1500); // short delay — enough for transient drops to clear
  };

  player.addEventListener('error', errorHandler);

  return () => {
    player.removeEventListener('error', errorHandler);
    if (timeoutId) {
      clearTimeout(timeoutId);
      timeoutId = null;
    }
    recovering = false;
    sourceIndex = 0;
  };
}
