# Taranga+ (তরঙ্গ+)

A Bangla-first live TV streaming desktop app. Browse, search and favorite channels across sports, movies, music, entertainment, kids and documentary categories, with adaptive-bitrate HLS/DASH playback powered by Shaka Player.

Built as an **Electron** desktop app (Windows NSIS installer) with a **Cloudflare Worker** backend that aggregates, validates and serves a curated channel catalog.

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│  Electron Renderer (src/)                                   │
│  React 19 + Tailwind v4 + Motion + Lenis smooth scroll     │
│  └─ Shaka Player engine (src/player-engine/)                │
└───────────────┬─────────────────────────────────────────────┘
                │ contextBridge (src-electron/preload/)
┌───────────────▼─────────────────────────────────────────────┐
│  Electron Main (src-electron/main/)                         │
│  Window lifecycle, IPC handlers (native fetch, no axios)    │
└───────────────┬─────────────────────────────────────────────┘
                │ fetch channels.json
                ▼
┌─────────────────────────────────────────────────────────────┐
│  Cloudflare Worker (backend/)                               │
│  ─ GET /channels     → KV-backed catalog (TARANGA_KV)       │
│  ─ GET /proxy/stream → HTTPS proxy for http:// HLS sources  │
│  ─ GET /trigger-sync → cron refresh (admin-token gated)     │
│  ─ scheduled cron    → hourly validation + merge            │
└─────────────────────────────────────────────────────────────┘
```

### Key data flow
1. A **GitHub Actions** workflow (`.github/workflows/validate-channels.yml`) runs hourly, fetches upstream M3U sources, validates each stream (real HLS `#EXTM3U` byte check, not just HTTP 200), merges + dedups them, and commits `data/channels.json` via a PR.
2. The **Worker cron** pulls the latest `channels.json`, stores it in Cloudflare KV, and serves it at `/channels`.
3. The **Electron app** fetches the catalog — primary path is IPC through the main process (bypasses renderer CORS); browser/web fallback is the Worker `/channels` endpoint.
4. At playback time the renderer rewrites `http://` stream URLs to route through the Worker `/proxy/stream` endpoint so they load under `webSecurity: true` (no mixed-content block).

---

## Local development

**Prerequisites:** Node.js 20+, npm.

```bash
# 1. Install dependencies
npm install

# 2. Start the Electron + Vite dev server (hot reload)
npm run dev
```

The dev server loads the renderer from `http://localhost:5173` (or whatever `ELECTRON_RENDERER_URL` is set to — validated against loopback only, so a stray env var cannot inject attacker content into the packaged build).

### Backend (optional, for local Worker dev)
```bash
cd backend
npm install
npx wrangler kv namespace create TARANGA_KV          # production
npx wrangler kv namespace create TARANGA_KV_PREVIEW  # dev/preview (separate!)
# Paste both namespace IDs into backend/wrangler.toml
npx wrangler dev   # serves on http://localhost:8787
```

Set `VITE_CLOUDFLARE_URL` in `.env.local` to point the renderer at your local Worker.

---

## Build & distribute

```bash
# Type-check the whole project (renderer + main + worker types)
npm run lint            # tsc --noEmit

# Build renderer + main + preload bundles
npm run build

# Produce the Windows NSIS installer + portable zip
npm run dist:win
```

Output lands in `release/`.

---

## Project layout

```
src/                  Electron renderer (React UI)
  components/         ChannelGrid, ChannelCard, VideoFrame, Topbar, ...
  hooks/              useChannels, usePlayer, useFavorites, useLenis, ...
  player-engine/      Shaka init, ABR config, request filters, auto-recovery
  services/           apiClient, localDb (IndexedDB), settingsKeys
  styles/             globals.css, fonts.css
  workers/            logoCache (service worker + prefetch)
src-electron/         main process + preload (contextBridge)
backend/              Cloudflare Worker (router, KV, validator, cron)
data/                 channels.json (the curated catalog)
.github/              CI: channel validation workflow + script
```

---

## Configuration

| Variable | Where | Purpose |
|---|---|---|
| `VITE_CLOUDFLARE_URL` | `.env.local` | Worker base URL for the renderer (default `http://localhost:8787`) |
| `ELECTRON_RENDERER_URL` | env | Dev server URL (validated against loopback) |
| `GITHUB_RAW_URL` | env | Override the `channels.json` source the main process fetches |
| `ADMIN_TOKEN` | Worker secret | Gates the `/trigger-sync` endpoint |
| `CLOUDFLARE_API_TOKEN` | CI secret | Used by the validator workflow to write KV |

---

## Tech stack

- **Desktop:** Electron 42, electron-vite, electron-builder (NSIS)
- **UI:** React 19, Tailwind CSS v4, Motion (Framer Motion), Lenis
- **Player:** Shaka Player 5 (HLS/DASH, ABR)
- **Backend:** Cloudflare Workers, KV
- **Persistence:** IndexedDB (idb) — favorites, watch history, logo cache
