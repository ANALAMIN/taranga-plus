import type { HlsConfig } from 'hls.js';

export const PLAYER_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) ' +
  'AppleWebKit/537.36 (KHTML, like Gecko) ' +
  'Chrome/125.0.0.0 Safari/537.36';

export const HLS_CONFIG: Partial<HlsConfig> = {
  workerPath: null,
  enableWorker: true,
  lowLatencyMode: true,
  autoStartLoad: true,
  startPosition: -1,
  startLevel: 1,
  initialLiveManifestSize: 1,

  liveSyncDurationCount: 3,
  liveMaxLatencyDurationCount: 5,
  maxLiveSyncPlaybackRate: 1.5,
  liveSyncOnStallIncrease: 0.5,

  maxBufferLength: 10,
  maxBufferSize: 30 * 1000 * 1000,
  maxMaxBufferLength: 30,
  backBufferLength: 15,
  frontBufferFlushThreshold: Infinity,
  liveDurationInfinity: true,

  startFragPrefetch: true,
  startOnSegmentBoundary: true,
  testBandwidth: false,

  abrEwmaDefaultEstimate: 500_000,
  abrEwmaFastLive: 3,
  abrEwmaSlowLive: 9,
  abrBandWidthFactor: 0.85,
  abrBandWidthUpFactor: 0.85,
  abrMaxWithRealBitrate: true,
  maxStarvationDelay: 2,
  maxLoadingDelay: 2,

  fragLoadingTimeOut: 5000,
  fragLoadingMaxRetry: 3,
  fragLoadingRetryDelay: 500,
  fragLoadingMaxRetryTimeout: 8000,

  manifestLoadingTimeOut: 8000,
  manifestLoadingMaxRetry: 4,
  manifestLoadingRetryDelay: 300,
  manifestLoadingMaxRetryTimeout: 10000,

  levelLoadingTimeOut: 5000,
  levelLoadingMaxRetry: 3,
  levelLoadingRetryDelay: 500,
  levelLoadingMaxRetryTimeout: 8000,

  nudgeOffset: 0.3,
  nudgeMaxRetry: 5,
  nudgeOnVideoHole: true,
  highBufferWatchdogPeriod: 2,
  detectStallWithCurrentTimeMs: 1000,

  appendErrorMaxRetry: 3,

  enableSoftwareAES: false,
  ignoreDevicePixelRatio: false,
  preferManagedMediaSource: true,
  preserveManualLevelOnError: true,
  ignorePlaylistParsingErrors: true,
  useMediaCapabilities: true,
  progressive: false,
};
