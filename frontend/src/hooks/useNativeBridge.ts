/**
 * useNativeBridge.ts
 *
 * A single, clean hook for communicating with the C# WPF backend via
 * WebView2's host object bridge. Gracefully no-ops in a normal browser
 * (i.e. when window.chrome.webview is not available) so the app still
 * works during development with `npm run dev`.
 *
 * Exposed functions:
 *  - updateMediaState(isPlaying, title) → Updates Windows 11 Media Flyout
 *  - setKeepScreenOn(keepOn)            → Prevents PC sleep during playback
 *  - togglePiP()                        → Native Always-On-Top mini window
 */

type BackendProxy = {
  updateMediaState: (isPlaying: boolean, title: string) => Promise<void>;
  setKeepScreenOn: (keepOn: boolean) => Promise<void>;
  togglePiP: () => Promise<void>;
};

function getBackend(): BackendProxy | null {
  try {
    // WebView2 exposes host objects on window.chrome.webview.hostObjects
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

  /**
   * Call when play/pause state changes or a new channel starts.
   * This updates the Windows 11 Volume/Media flyout with channel info.
   */
  async function updateMediaState(isPlaying: boolean, title: string) {
    if (!backend) return;
    try {
      await backend.updateMediaState(isPlaying, title);
    } catch (e) {
      console.warn('[NativeBridge] updateMediaState failed:', e);
    }
  }

  /**
   * Call with `true` when video starts playing, `false` when it stops.
   * Prevents the PC from going to sleep or turning off the screen.
   */
  async function setKeepScreenOn(keepOn: boolean) {
    if (!backend) return;
    try {
      await backend.setKeepScreenOn(keepOn);
    } catch (e) {
      console.warn('[NativeBridge] setKeepScreenOn failed:', e);
    }
  }

  /**
   * Toggles native Windows PiP (Always-On-Top mini window).
   * The C# backend handles resize + Topmost toggle.
   */
  async function togglePiP() {
    if (!backend) return;
    try {
      await backend.togglePiP();
    } catch (e) {
      console.warn('[NativeBridge] togglePiP failed:', e);
    }
  }

  return {
    isNative,
    updateMediaState,
    setKeepScreenOn,
    togglePiP,
  };
}
