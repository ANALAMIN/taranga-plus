import shaka from 'shaka-player/dist/shaka-player.ui';

/**
 * THE MOST CRITICAL FILE IN THE PROJECT.
 * Contains the Time-Shifted Buffer Cushion config.
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
