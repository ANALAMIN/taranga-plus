import shaka from 'shaka-player/dist/shaka-player.ui';
import { applyTimeShiftBuffer } from './timeShift';
import { configureAbr, applyDynamicBuffer } from './abrManager';
import { registerNetworkFilters } from './customFilters';

declare global {
  interface Window {
    shakaPlayerInstance?: shaka.Player;
  }
}

let polyfillsInstalled = false;

export async function initShakaPlayer(
  videoElement: HTMLVideoElement,
  videoContainer?: HTMLElement,
): Promise<{ player: shaka.Player, ui: shaka.ui.Overlay | null }> {
  if (!polyfillsInstalled) {
    shaka.polyfill.installAll();
    polyfillsInstalled = true;
  }

  if (!shaka.Player.isBrowserSupported()) {
    console.error('[Taranga+] Browser not supported by Shaka Player');
    throw new Error('Browser does not support Shaka Player');
  }

  const player = new shaka.Player();
  await player.attach(videoElement);

  let ui: shaka.ui.Overlay | null = null;
  if (videoContainer) {
    ui = new shaka.ui.Overlay(player, videoContainer, videoElement);
    ui.configure({
      controlPanelElements: [
        'play_pause', 'mute', 'volume', 'spacer',
        'quality', 'picture_in_picture', 'fullscreen',
      ],
      addSeekBar:       true,
      addBigPlayButton: true,
    });
  }

  applyTimeShiftBuffer(player);
  configureAbr(player);
  applyDynamicBuffer(player);
  registerNetworkFilters(player);

  window.shakaPlayerInstance = player;

  return { player, ui };
}
