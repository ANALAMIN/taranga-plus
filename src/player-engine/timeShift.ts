import shaka from 'shaka-player/dist/shaka-player.ui';

/**
 * Ultra low-latency streaming config for live TV.
 * Channels are pre-validated (stream confirmed alive with video content),
 * so we optimise for instant start and stay close to the live edge.
 */
export function applyTimeShiftBuffer(player: shaka.Player): void {
  player.configure({
    streaming: {
      safeInSeconds: 5,           // stay very close to live edge
      bufferingGoal: 2,           // minimal buffer — instant channel switch
      rebufferingGoal: 0.5,       // recover from micro-gaps instantly
      bufferBehind: 30,           // keep 30s behind for short seeks
      stallEnabled: true,
      stallThreshold: 0.5,        // detect stalling in 500ms
      retryParameters: {
        maxAttempts: 3,
        baseDelay: 500,           // fast retry on network blip
        backoffFactor: 1.5,
        fuzzFactor: 0.5,
        timeout: 10000
      }
    }
  });
}
