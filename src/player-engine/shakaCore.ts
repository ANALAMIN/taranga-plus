import shaka from 'shaka-player/dist/shaka-player.ui';
import { applyTimeShiftBuffer } from './timeShift';
import { configureAbr } from './abrManager';
import { registerNetworkFilters } from './customFilters';

/**
 * Initializes and configures the Google Shaka Player instance.
 * Attaches it to the <video> HTML element.
 */
let polyfillsInstalled = false;

export async function initShakaPlayer(videoElement: HTMLVideoElement, videoContainer?: HTMLElement): Promise<shaka.Player> {
  if (!polyfillsInstalled) {
    shaka.polyfill.installAll();
    polyfillsInstalled = true;
  }

  if (!shaka.Player.isBrowserSupported()) {
    console.error('Browser not supported!');
    throw new Error('Browser does not support Shaka Player');
  }

  // Instantiate the player
  const player = new shaka.Player();
  await player.attach(videoElement);

  if (videoContainer) {
    const ui = new shaka.ui.Overlay(player, videoContainer, videoElement);
    ui.configure({
      controlPanelElements: ['play_pause', 'mute', 'volume', 'time_and_duration', 'spacer', 'quality', 'picture_in_picture', 'fullscreen'],
      addSeekBar: true,
      addBigPlayButton: true
    });
  }

  // Apply the custom configuration defined in our blueprint
  applyTimeShiftBuffer(player);
  configureAbr(player);
  registerNetworkFilters(player);

  return player;
}
