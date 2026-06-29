import shaka from 'shaka-player/dist/shaka-player.ui';

export function applyTimeShiftBuffer(player: shaka.Player): void {
  const fastRetry = {
    maxAttempts:   2,
    baseDelay:     1000,
    backoffFactor: 1.5,
    fuzzFactor:    0.5,
    timeout:       5_000,
  };

  player.configure({
    manifest: {
      retryParameters: fastRetry,
    },
    streaming: {
      stallEnabled: true,
      retryParameters: fastRetry,
    },
  });
}
