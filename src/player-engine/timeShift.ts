import shaka from 'shaka-player/dist/shaka-player.ui';

/**
 * Time-shifted buffer cushion configuration for live stream stability.
 * Ensures smooth playback near the live edge with configurable thresholds.
 *
 * Tuning rationale (spec §6.2):
 *   rebufferingGoal 0.5→2.0  — ride through short network drops instead of
 *                               triggering a rebuffer event on every micro-gap
 *   bufferingGoal  40→30     — faster initial fill on cold start
 *   bufferBehind   30→60     — more past-buffer headroom for network spikes
 *   safeInSeconds  60→30     — stay closer to the live edge
 */
export function applyTimeShiftBuffer(player: shaka.Player): void {
  player.configure({
    streaming: {
      safeInSeconds: 30,         // was 60 — closer to live edge
      bufferingGoal: 30,         // was 40 — faster initial fill
      rebufferingGoal: 2.0,      // was 0.5 — ride through short drops
      bufferBehind: 60,          // was 30 — more headroom for spike recovery
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
