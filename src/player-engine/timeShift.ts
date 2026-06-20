import shaka from 'shaka-player/dist/shaka-player.ui';

/**
 * Time-shifted buffer cushion configuration for live stream stability.
 * Ensures smooth playback near the live edge with configurable thresholds.
 */
export function applyTimeShiftBuffer(player: shaka.Player): void {
  player.configure({
    streaming: {
      safeInSeconds: 60,         // 60 seconds behind live edge
      bufferingGoal: 40,         // pre-fetch 40s ahead into RAM
      rebufferingGoal: 0.5,      // resume after 0.5s of data
      bufferBehind: 30,          // keep 30s of past buffer
      stallEnabled: true,
      stallThreshold: 1,         // detect stall after 1 second
      retryParameters: {
        maxAttempts: 5,
        baseDelay: 1000,
        backoffFactor: 2,
        fuzzFactor: 0.5,
        timeout: 30000
      }
    }
  });
}
