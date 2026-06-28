# Electron → Tauri Migration & Performance Cleanup Design

**Date:** 2026-06-22
**Status:** Approved (awaiting spec review)
**Author:** Brainstorming session (user + ZCode)

---

## 1. Problem Statement

The Taranga+ desktop app currently runs on Electron 42. Two issues drive this migration:

1. **Heavy footprint.** Electron bundles a full Chromium + Node runtime (~80–120MB), making the installer and resident memory far larger than necessary for an app whose backend work is trivial (one HTTP fetch + window control).
2. **Severe UI lag.** The user reports a heavily "laggy" experience on channel clicks and general interaction. Root-cause analysis shows the lag comes from the **renderer**, not Electron itself — so a framework swap alone will not fix it. The animations/effects must be removed.

The goal is a **fast and stable** Windows app with no perceivable input lag.

## 2. Non-Goals

- Cross-platform (macOS/Linux) builds. Windows remains the only target.
- Feature additions. This is a like-for-like migration plus perf cleanup.
- Changing the visual **layout** — sidebar, grid, player position, topbar all keep their current structure. Only heavy visual *effects* are removed.
- Removing the TARANGA+ wave loader (`UILoader`) — this is brand identity and stays.

## 3. Scope Summary

### Will change
- App framework: Electron 42 → **Tauri 2** (Rust backend, WebView2 frontend).
- Window chrome: custom frameless + custom controls → **native Windows titlebar**.
- Window snap (left/right/quarter) custom logic → **removed**; rely on native Win+Arrow.
- Renderer heavy effects removed (see §5).

### Will NOT change
- Layout, component structure, routing.
- Shaka Player engine, ABR, auto-recovery.
- IndexedDB persistence (favorites, history, logo cache).
- The TARANGA+ wave loading animation (`UILoader`) shown during buffering.
- Search, favorites, theme switch, categories.

## 4. Architecture (Target)

```
┌─────────────────────────────────────────────────────────────┐
│  Tauri Renderer (src/) — React 19 (unchanged UI structure)  │
│  ┌─ Shaka Player engine (src/player-engine/)                │
│  └─ Clean UI: no heavy effects, native scroll               │
└───────────────┬─────────────────────────────────────────────┘
                │ invoke() — @tauri-apps/api/core
┌───────────────▼─────────────────────────────────────────────┐
│  Tauri Main (src-tauri/src/) — Rust                         │
│  ┌─ #[tauri::command] fetch_channels() → reqwest fetch      │
│  └─ tauri.conf.json — native titlebar, NSIS installer       │
└───────────────┬─────────────────────────────────────────────┘
                │ HTTP fetch (timeout-bounded)
                ▼
          raw.githubusercontent.com
          (ANALAMIN/taranga-plus/master/data/channels.json)
```

### IPC contract
| Electron (current) | Tauri (target) |
|---|---|
| `window.electronAPI.fetchChannels()` → IPC `fetch-channels` | `invoke('fetch_channels')` |
| `window-minimize` / `window-maximize` / `window-close` IPC | Removed — native titlebar handles it |
| `window-snap` IPC | Removed — native Win+Arrow |
| `window-maximize-state` event | Removed — native titlebar handles it |
| `contextBridge` preload | Removed — `@tauri-apps/api` used directly |

## 5. Lag Root-Cause → Fix Mapping

| # | Lag source | Current location | Fix |
|---|---|---|---|
| 1 | 11 always-animating gradient bars (`pulseBar` infinite animation, full-screen) | `InteractiveGradientBackground.tsx`, `gradient-bars-background.tsx`, `pulseBar` keyframe | **Remove entirely.** Replace with a static solid/gradient background behind the grid. |
| 2 | `backdrop-blur-2xl` / `backdrop-blur-md` in ~6–7 places (topbar, player panel, cards, search, error overlay) | `Topbar`, `App.tsx`, `ChannelCard`, `ChannelGrid` empty/error states | **Remove all `backdrop-blur*`.** Replace with solid translucent `bg-black/40`-style fills. |
| 3 | Lenis smooth-scroll (perpetual `requestAnimationFrame` loop + easing per frame) | `useLenis.ts`, `useLenis()` call in `App.tsx` | **Remove Lenis.** Use native browser scrolling. Delete `useLenis.ts` and the hook call. Remove `lenis` dependency. |
| 4 | Framer Motion `staggerContainer` + per-card `fadeIn` variant across ~170 cards | `ChannelGrid/index.tsx`, `animations/variants.ts` | **Remove stagger + per-card entrance animation.** Cards render instantly. Keep only minimal, cheap transitions where they aid clarity (e.g. a single opacity fade on the player panel mount). |
| 5 | Active channel `glowMove` + `glowPulse` infinite keyframes + `blur(8px)` filter on the glow layer | `ChannelCard/index.tsx` lines ~81–87 (list), ~152–160 (grid) | **Remove `glowMove`/`glowPulse` animated layers + `filter: blur()`.** Indicate active state with a static ring/border + accent tint. |
| 6 | Per-card multiple `radial-gradient` backgrounds + heavy `box-shadow` layers | `ChannelCard/index.tsx`, `LiquidGlassSidebar.tsx` | **Simplify** to one gradient + one shadow per element. |
| 🛡️ | TARANGA+ wave loader | `UILoader/index.tsx` | **Unchanged.** Only runs during buffering; not a sustained cost. |

### Supporting cleanups
- Remove unused keyframes from `globals.css` after removal: `pulseBar`, `glowMove`, `glowPulse`, `moveBackground` (if unused).
- Keep `letterAnim`, `transformAnim`, `opacityAnim` (used by the preserved `UILoader`).
- Remove `data-lenis-prevent` attributes (no longer needed once Lenis is gone).

## 6. Electron → Tauri Component Mapping

| Electron component | Tauri equivalent |
|---|---|
| `src-electron/main/index.ts` (window lifecycle, `BrowserWindow`) | `src-tauri/src/main.rs` + `tauri.conf.json` |
| `src-electron/preload/index.ts` (`contextBridge.exposeInMainWorld`) | Not needed — `@tauri-apps/api` imported directly in renderer |
| `src-electron/ipc/handlers.ts` → `fetch-channels` | `#[tauri::command] async fn fetch_channels()` in `src-tauri/src/main.rs`, registered via `tauri::generate_handler!` |
| `src-electron/ipc/handlers.ts` → window min/max/close/snap | Removed (native titlebar) |
| `src-electron/hardware/gpuAccel.ts` (VAAPI switches) | Removed — WebView2 handles GPU decode natively |
| `electron.vite.config.ts` | Plain `vite.config.ts` |
| `electron`, `electron-vite`, `electron-builder`, `@electron-toolkit/tsconfig` devDeps | `@tauri-apps/cli`, `@tauri-apps/api` (dev + runtime), Rust toolchain |
| `WebkitAppRegion: drag/no-drag` styles | Removed (native titlebar) |

### Renderer `apiClient.ts` change
Current logic tries `window.electronAPI?.fetchChannels()` then falls back to direct `fetch()`. After migration:
- Primary path: `await invoke('fetch_channels')` (Tauri).
- Fallback (web/preview): direct `fetch(GITHUB_RAW_URL)` retained — GitHub raw already sends `access-control-allow-origin: *`.
- The `window.electronAPI` declaration is removed.

## 7. Implementation Order (Option A — "Golden Path")

The user's explicit instruction: *"first detach, then write with Tauri, when you see it's stable, then remove Electron."* This is executed as parallel/gradual migration:

1. **Add Tauri shell** — `src-tauri/` (Rust crate), `tauri.conf.json` with native titlebar + NSIS target, `fetch_channels` command, new `vite.config.ts`. Electron remains untouched and runnable.
2. **Migrate renderer IPC** — `apiClient.ts` uses `invoke('fetch_channels')`, keep direct-fetch fallback. App loads channels correctly under Tauri.
3. **UI performance cleanup** — remove effects per §5 (framework-independent; works under both Electron and Tauri).
4. **Verify** — run `npm run tauri dev`; confirm channels load, player works, no input lag.
5. **Remove Electron** — delete `src-electron/`, `electron.vite.config.ts`, electron devDeps from `package.json`, dead keyframes/CSS.
6. **CI/scripts update** — update `package.json` scripts (`dev`/`build`/`dist:win` → Tauri equivalents), verify `.github/workflows` unaffected (it only touches `data/channels.json`).

## 8. Prerequisites

- Node.js 20+ (present).
- **Rust toolchain** — `rustup` + `cargo`. Must be installed.
- **Microsoft C++ Build Tools (MSVC)** — required for Rust to compile on Windows.
- WebView2 Runtime — pre-installed on Windows 10/11 (no action needed).

## 9. Risks & Mitigations

| Risk | Mitigation |
|---|---|
| First `cargo build` is slow (downloads + compiles deps) | Expected; subsequent builds are incremental and fast. Warn the user. |
| `navigator.share` may behave differently under WebView2 | Keep the existing clipboard-write fallback (already present). |
| Removing backdrop-blur changes the visual "premium" feel | Acceptable per user decision; layout preserved, only effects removed. |
| `useLenis` removal changes scroll feel | Intentional — native scroll is snappier, which is the goal. |
| Shaka Player under WebView2 | Shaka targets standard browser APIs; WebView2 (Chromium-based) is compatible. Verify during step 4. |
| Removing per-card animations may show a "flash" of all cards at once | Acceptable; instant render is the desired snappy behavior. |

## 10. Verification Criteria

Migration is complete when:
- `npm run tauri dev` launches the app; channels load via `invoke('fetch_channels')`.
- Clicking a channel loads the stream with the TARANGA+ loader, then plays.
- No `backdrop-blur`, no gradient-bar animation, no Lenis, no glowMove/glowPulse in the running app.
- No Electron files, deps, or config remain.
- `npm run dist:win` produces a working NSIS installer significantly smaller than the prior Electron build.
- Subjective: channel clicks and scrolling feel immediate, no "laggy" sensation.
