import shaka from 'shaka-player/dist/shaka-player.ui';

export function configureAbr(player: shaka.Player): void {
  player.configure({
    abr: {
      enabled: true,
      switchInterval: 3,
      bandwidthUpgradeTarget: 0.85,
      bandwidthDowngradeTarget: 0.95,
      restrictToElementSize: false,
    },
  });
}

export function applyDynamicBuffer(player: shaka.Player): void {
  player.addEventListener('manifestparsed', () => {
    const manifest = player.getManifest();
    const seg = Math.max((manifest as any)?.minBufferTime ?? 4, 2);

    const variants = player.getVariantTracks();
    if (variants && variants.length > 0) {
      variants.sort((a, b) => b.bandwidth - a.bandwidth);
      player.selectVariantTrack(variants[0], true);
      player.configure({ abr: { enabled: true } });
    }

    player.configure({
      streaming: {
        bufferingGoal:    120,
        rebufferingGoal:  2,
        bufferBehind:     120,
        stallThreshold:   1,
        stallEnabled:     true,
        liveSync: {
          targetLatency:          seg * 3,
          targetLatencyTolerance: seg,
          playbackRate:           1.0,
        },
        safeSeekOffset: Math.max(seg, 2),
      },
    });

    console.log(
      `[Taranga+] Dynamic buffer — seg=${seg}s | Dynamic all-available download strategy enabled`
    );
  });
}
