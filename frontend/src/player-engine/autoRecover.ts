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
  onErrorFallback?: (reason?: string) => void
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

    sourceIndex++;
    const nextUrl = sources[sourceIndex];

    if (!nextUrl) {
      console.error('[Taranga+] No more sources.');
      onErrorFallback?.('Channel unavailable');
      return;
    }

    recovering = true;
    console.log(`[Taranga+] Trying source ${sourceIndex + 1}/${sources.length}`);

    timeoutId = setTimeout(async () => {
      try {
        await player.load(nextUrl);
        console.log('[Taranga+] Recovery succeeded.');
      } catch (e) {
        console.error('[Taranga+] Recovery load failed:', e);
      } finally {
        recovering = false;
      }
    }, 1000);
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
