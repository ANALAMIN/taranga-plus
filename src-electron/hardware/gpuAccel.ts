import { app } from 'electron';

export function setupGpuAcceleration(): void {
  app.commandLine.appendSwitch('enable-gpu-rasterization');
  app.commandLine.appendSwitch('enable-zero-copy');
  // GPU blocklist is respected by default for stability
  app.commandLine.appendSwitch('enable-features', 'VaapiVideoDecoder,VaapiVideoEncoder');
}
