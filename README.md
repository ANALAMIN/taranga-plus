# Taranga+ (তরঙ্গ+)

A Bangla-first live TV streaming desktop app. Browse, search and favorite channels across sports, movies, music, entertainment, kids and documentary categories, with adaptive-bitrate HLS/DASH playback powered by Shaka Player.

Built as a **Tauri 2** desktop app (Windows NSIS installer; WebView2 runtime). A **GitHub Actions** workflow validates channels and commits the curated catalog directly to `data/channels.json`.

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│  Tauri Renderer (src/) — React 19                          │
│  React 19 + Tailwind v4 (animations stripped for speed)    │
│  └─ Shaka Player engine (src/player-engine/)                │
└───────────────┬─────────────────────────────────────────────┘
                │ invoke() — @tauri-apps/api/core
┌───────────────▼─────────────────────────────────────────────┐
│  Tauri Main (src-tauri/src/) — Rust                         │
│  fetch_channels command (reqwest, 5s timeout)               │
└───────────────┬─────────────────────────────────────────────┘
                │ fetch channels.json
                ▼
          raw.githubusercontent.com
          (ANALAMIN/taranga-plus/master/data/channels.json)
```

### Key data flow
1. A **GitHub Actions** workflow (`.github/workflows/validate-channels.yml`) runs every 30 minutes, fetches upstream M3U sources, validates each stream, merges + dedups them, and commits `data/channels.json` to master.
2. The **Tauri app** fetches the catalog via `invoke('fetch_channels')` (runs in the Rust backend, no CORS); browser/web fallback fetches directly from GitHub raw.

---

## Local development

**Prerequisites:** Node.js 20+, npm, Rust (https://rustup.rs), MSVC build tools.

```bash
# 1. Install dependencies
npm install

# 2. Start the Tauri dev server (Rust + Vite hot reload)
npm run dev
```

Tauri spawns the Vite dev server on `http://localhost:1420` (configured in `vite.config.ts` and `src-tauri/tauri.conf.json`).

---

## Build & distribute

```bash
# Type-check the renderer
npm run lint            # tsc --noEmit

# Produce the Windows NSIS installer
npm run dist:win
```

Output lands in `src-tauri/target/release/bundle/nsis/`.

---

## Project layout

```
src/                  Tauri renderer (React UI)
  components/         ChannelGrid, ChannelCard, VideoFrame, Topbar, ...
  hooks/              useChannels, usePlayer, useFavorites, ...
  player-engine/      Shaka init, ABR config, request filters, auto-recovery
  services/           apiClient, localDb (IndexedDB), settingsKeys
  styles/             globals.css, fonts.css
  workers/            logoCache (service worker + prefetch)
src-tauri/            Rust backend (Tauri main + fetch_channels command)
data/                 channels.json (the curated catalog)
.github/              CI: channel validation workflow + script
```

---

## Configuration

| Variable | Where | Purpose |
|---|---|---|
| `GITHUB_RAW_URL` | env (Rust) | Override the `channels.json` source the Tauri backend fetches |

---

## Tech stack

- **Desktop:** Tauri 2 (Rust backend, WebView2), NSIS bundler
- **UI:** React 19, Tailwind CSS v4 (heavy animations removed for performance)
- **Player:** Shaka Player 5 (HLS/DASH, ABR)
- **Persistence:** IndexedDB (idb) — favorites, watch history, logo cache
