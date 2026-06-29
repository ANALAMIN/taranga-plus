import shaka from 'shaka-player/dist/shaka-player.ui';

export function setupAutoRecovery(
  player: shaka.Player,
  sources: string[],
  onErrorFallback?: (reason?: string) => void
): () => void {
  let sourceIndex = 0;
  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  let recovering = false;

  const errorHandler = (event: Event | CustomEvent) => {
    const customEvent = event as CustomEvent<shaka.extern.Error>;
    const error = customEvent.detail;
    if (!error) return;

    if (error.severity !== shaka.util.Error.Severity.CRITICAL) return;
    if (recovering) return;

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
    }, 500);
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
