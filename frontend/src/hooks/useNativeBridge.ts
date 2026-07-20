type BackendProxy = {
  updateMediaState: (isPlaying: boolean, title: string) => Promise<void>;
  setKeepScreenOn: (keepOn: boolean) => Promise<void>;
  togglePiP: () => Promise<void>;
  isNativeAvailable: () => Promise<boolean>;
  isNativePlaying: () => Promise<boolean>;
  playNative: (url: string, referer: string | null, userAgent: string | null) => Promise<void>;
  stopNative: () => Promise<void>;
  pauseNative: () => Promise<void>;
  resumeNative: () => Promise<void>;
  setNativeVolume: (volume: number) => Promise<void>;
  getNativeVolume: () => Promise<number>;
  toggleNativeMute: () => Promise<void>;
  isNativeMuted: () => Promise<boolean>;
};

function getBackend(): BackendProxy | null {
  try {
    const hostObjects = (window as unknown as {
      chrome?: { webview?: { hostObjects?: { backend?: BackendProxy } } };
    }).chrome?.webview?.hostObjects;
    return hostObjects?.backend ?? null;
  } catch {
    return null;
  }
}

export function useNativeBridge() {
  const backend = getBackend();
  const isNative = backend !== null;

  async function updateMediaState(playing: boolean, title: string) {
    if (!backend) return;
    try { await backend.updateMediaState(playing, title); } catch { }
  }

  async function setKeepScreenOn(keepOn: boolean) {
    if (!backend) return;
    try { await backend.setKeepScreenOn(keepOn); } catch { }
  }

  async function togglePiP() {
    if (!backend) return;
    try { await backend.togglePiP(); } catch { }
  }

  async function isNativeAvailable(): Promise<boolean> {
    if (!backend) return false;
    try { return await backend.isNativeAvailable(); } catch { return false; }
  }

  async function isNativePlaying(): Promise<boolean> {
    if (!backend) return false;
    try { return await backend.isNativePlaying(); } catch { return false; }
  }

  async function playNative(url: string, referer?: string, userAgent?: string) {
    if (!backend) return;
    try { await backend.playNative(url, referer || null, userAgent || null); } catch { }
  }

  async function stopNative() {
    if (!backend) return;
    try { await backend.stopNative(); } catch { }
  }

  async function pauseNative() {
    if (!backend) return;
    try { await backend.pauseNative(); } catch { }
  }

  async function resumeNative() {
    if (!backend) return;
    try { await backend.resumeNative(); } catch { }
  }

  async function setNativeVolume(volume: number) {
    if (!backend) return;
    try { await backend.setNativeVolume(volume); } catch { }
  }

  async function getNativeVolume(): Promise<number> {
    if (!backend) return 100;
    try { return await backend.getNativeVolume(); } catch { return 100; }
  }

  async function toggleNativeMute() {
    if (!backend) return;
    try { await backend.toggleNativeMute(); } catch { }
  }

  async function isNativeMuted(): Promise<boolean> {
    if (!backend) return false;
    try { return await backend.isNativeMuted(); } catch { return false; }
  }

  return {
    isNative,
    updateMediaState,
    setKeepScreenOn,
    togglePiP,
    isNativeAvailable,
    isNativePlaying,
    playNative,
    stopNative,
    pauseNative,
    resumeNative,
    setNativeVolume,
    getNativeVolume,
    toggleNativeMute,
    isNativeMuted,
  };
}
