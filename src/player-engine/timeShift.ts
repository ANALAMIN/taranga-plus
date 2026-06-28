import shaka from 'shaka-player/dist/shaka-player.ui';

export function applyTimeShiftBuffer(player: shaka.Player): void {
  player.configure({
    streaming: {
      bufferingGoal: 60,
      rebufferingGoal: 2,
      bufferBehind: 120,
      stallEnabled: true,
      stallThreshold: 3,
      retryParameters: {
        maxAttempts: 3,
        baseDelay: 500,
        backoffFactor: 1.5,
        fuzzFactor: 0.5,
        timeout: 10000
      }
    }
  });
}
