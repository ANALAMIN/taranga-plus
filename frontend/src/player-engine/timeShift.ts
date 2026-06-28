import shaka from 'shaka-player/dist/shaka-player.ui';

export function applyTimeShiftBuffer(player: shaka.Player): void {
  player.configure({
    streaming: {
      bufferingGoal: 15,
      rebufferingGoal: 2,
      bufferBehind: 60,
      stallEnabled: true,
      stallThreshold: 2,
      stallSkip: 0.1,
      liveSync: true,
      liveSyncPlaybackRate: 0.95,
      liveSyncMinPlaybackRate: 0.9,
      liveSyncMaxPlaybackRate: 1.1,
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
