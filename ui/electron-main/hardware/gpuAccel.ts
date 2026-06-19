import { app } from 'electron';

/**
 * Enables GPU hardware-accelerated video decoding in Electron's Chromium engine.
 * This is crucial for smooth 4K playback at 0% CPU usage.
 */
export function setupGpuAcceleration(): void {
  // Enables rasterization using the GPU.
  app.commandLine.appendSwitch('enable-gpu-rasterization');

  // Enables zero-copy video capture. Memory for video isn't copied between formats.
  app.commandLine.appendSwitch('enable-zero-copy');

  // Ignore GPU blocklist to enforce acceleration even on older cards
  app.commandLine.appendSwitch('ignore-gpu-blocklist');

  // Enable hardware-accelerated video decoding explicitly
  app.commandLine.appendSwitch('enable-features', 'VaapiVideoDecoder,VaapiVideoEncoder');
}
