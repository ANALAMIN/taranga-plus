import type Hls from 'hls.js';

export function setupAutoRecovery(
  _hls: Hls,
  _remainingSources: string[],
  _onErrorFallback?: (reason?: string) => void
): () => void {
  return () => {};
}
