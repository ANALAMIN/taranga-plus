# Electron → Tauri Migration & Performance Cleanup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace Electron with Tauri 2 (native Windows titlebar, Rust IPC for channel fetch) and remove the renderer-side heavy effects causing input lag — while preserving layout, the Shaka player engine, IndexedDB persistence, and the TARANGA+ wave loader.

**Architecture:** The React renderer stays almost identical (same components, same hooks). The Electron main/preload/IPC layer is replaced by a Tauri Rust backend (`src-tauri/`) exposing one `fetch_channels` command. Vite switches from `electron-vite` to plain Vite. Window control becomes native (no custom titlebar, no snap logic). Heavy CSS effects (gradient-bar animation, backdrop-blur, Lenis smooth-scroll, Framer Motion stagger, glowMove/glowPulse) are deleted from the renderer.

**Tech Stack:** Tauri 2, Rust (`reqwest`, `serde`, `tokio`), React 19, Vite 6, TypeScript, Shaka Player 5, WebView2 (preinstalled on Windows 10/11).

**Reference spec:** `docs/superpowers/specs/2026-06-22-electron-to-tauri-migration-design.md`

---

## Prerequisites (do before Task 1)

The implementer must confirm these are installed on the Windows machine:

- **Rust toolchain** — install via https://rustup.rs (gives `cargo`, `rustc`). Verify: `cargo --version`.
- **Microsoft C++ Build Tools (MSVC)** — install "Desktop development with C++" workload from Visual Studio Build Tools. Rust's `windows-msvc` target needs the MSVC linker.
- **WebView2 Runtime** — preinstalled on Windows 10/11. Verify by checking `C:\Windows\System32\WebView2` or that an installed app uses it.
- **Node.js 20+** — already present.

If any of Rust/MSVC are missing, Task 1 (`cargo` commands) will fail with cryptic linker errors.

---

## File Structure

### New files (Tauri backend)
- `src-tauri/Cargo.toml` — Rust crate manifest (deps: tauri, reqwest, serde, tokio).
- `src-tauri/build.rs` — Tauri build script (generated).
- `src-tauri/tauri.conf.json` — Tauri config: native titlebar, window size, NSIS bundle, dev server URL.
- `src-tauri/src/main.rs` — Tauri app entry; registers `fetch_channels` command.
- `src-tauri/src/lib.rs` — App builder + the `fetch_channels` command implementation.
- `src-tauri/icons/` — App icons (Tauri requires at least one).
- `vite.config.ts` — New plain Vite config (replaces `electron.vite.config.ts`).

### Modified files (renderer migration)
- `src/services/apiClient.ts` — replace `window.electronAPI` path with `invoke('fetch_channels')`.
- `index.html` — no change expected (same entry point).
- `package.json` — swap Electron devDeps for Tauri; update scripts.
- `tsconfig.renderer.json` — no change (already excludes `src-electron`).

### Modified files (performance cleanup)
- `src/App.tsx` — remove `useLenis` import/call; remove backdrop-blur from player panel + error overlay; remove `data-lenis-prevent`.
- `src/components/ChannelGrid/index.tsx` — remove `InteractiveGradientBackground` wrapper; remove `staggerContainer`/`fadeIn` motion variants; remove backdrop-blur from error state.
- `src/components/ChannelCard/index.tsx` — remove `glowMove`/`glowPulse` animated layers and `blur()` filters; simplify gradients/shadows; keep `motion.div` but strip entrance `initial`/`animate`.
- `src/components/Topbar/index.tsx` — remove `backdrop-blur-2xl`; remove `WebkitAppRegion` styles; keep layout.
- `src/hooks/useLenis.ts` — **delete**.
- `src/components/InteractiveGradientBackground.tsx` — **delete**.
- `src/components/ui/gradient-bars-background.tsx` — **delete**.
- `src/animations/variants.ts` — **delete** (no remaining consumers after cleanup).
- `src/styles/globals.css` — remove `pulseBar`, `glowMove`, `glowPulse`, `moveBackground` keyframes. Keep `shimmer`, `live-pulse`, `transformAnim`, `opacityAnim`, `letterAnim` (used by skeleton, live dot, and the preserved TARANGA+ loader).

### Deleted files (Electron removal)
- `src-electron/main/index.ts`
- `src-electron/preload/index.ts`
- `src-electron/ipc/handlers.ts`
- `src-electron/hardware/gpuAccel.ts`
- `src-electron/` (whole folder)
- `electron.vite.config.ts`
- `tsconfig.main.json` (Electron main config)
- `nul` (stray artifact in repo root, if present)

---

## Task 1: Verify Tauri prerequisites are installed

**Files:** none (verification only)

- [ ] **Step 1: Check Rust toolchain**

Run:
```bash
cargo --version
```
Expected: prints a version like `cargo 1.xx.x`. If it errors "command not found", STOP and install Rust from https://rustup.rs before continuing.

- [ ] **Step 2: Check Rust Windows target**

Run:
```bash
rustup target list --installed
```
Expected output contains: `(default) x86_64-pc-windows-msvc`. If the `windows-msvc` target is missing, run `rustup target add x86_64-pc-windows-msvc`.

- [ ] **Step 3: Confirm MSVC linker present**

Run:
```bash
where link.exe
```
Expected: a path under `...\MSVC\...\Hostx64\x64\link.exe`. If not found, install Visual Studio Build Tools with the "Desktop development with C++" workload.

No commit — this is a gate check.

---

## Task 2: Create the Tauri backend crate

> **Ordering note:** Task 4 (renderer IPC) imports `@tauri-apps/api/core`, so the npm package must be installed before that task runs. Task 2 Step 1 below pre-installs `@tauri-apps/api` so the dependency exists by the time Task 4 runs; the full `package.json` cleanup (removing Electron deps) happens in Task 5.

**Files:**
- Create: `src-tauri/Cargo.toml`
- Create: `src-tauri/build.rs`
- Create: `src-tauri/tauri.conf.json`
- Create: `src-tauri/src/main.rs`
- Create: `src-tauri/src/lib.rs`
- Create: `src-tauri/icons/icon.ico`

- [ ] **Step 1: Pre-install the Tauri JS API (needed by Task 4)**

Run:
```bash
npm install @tauri-apps/api@^2
```
Expected: `@tauri-apps/api` added to `dependencies`. (The full Electron-removal happens in Task 5; this just ensures the import in Task 4 resolves.)

- [ ] **Step 2: Create `src-tauri/Cargo.toml`**

```toml
[package]
name = "taranga-plus"
version = "2.0.0"
description = "Taranga+ — Bangla-first live TV streaming desktop app"
edition = "2021"

[lib]
name = "taranga_plus_lib"
crate-type = ["staticlib", "cdylib", "rlib"]

[build-dependencies]
tauri-build = { version = "2", features = [] }

[dependencies]
tauri = { version = "2", features = [] }
reqwest = { version = "0.12", features = ["json"] }
serde = { version = "1", features = ["derive"] }
serde_json = "1"
tokio = { version = "1", features = ["time"] }

[profile.release]
opt-level = "s"
lto = true
codegen-units = 1
```

- [ ] **Step 2: Create `src-tauri/build.rs`**

```rust
fn main() {
    tauri_build::build()
}
```

- [ ] **Step 3: Create `src-tauri/tauri.conf.json`**

```json
{
  "$schema": "https://schema.tauri.app/config/2",
  "productName": "Taranga+",
  "version": "2.0.0",
  "identifier": "com.tarangaplus.app",
  "build": {
    "beforeDevCommand": "npm run dev:web",
    "devUrl": "http://localhost:1420",
    "beforeBuildCommand": "npm run build:web",
    "frontendDist": "../dist"
  },
  "app": {
    "windows": [
      {
        "title": "Taranga+",
        "width": 1280,
        "height": 720,
        "minWidth": 800,
        "minHeight": 600,
        "resizable": true,
        "decorations": true,
        "maximized": true
      }
    ],
    "security": {
      "csp": null
    }
  },
  "bundle": {
    "active": true,
    "targets": ["nsis"],
    "icon": [
      "icons/32x32.png",
      "icons/128x128.png",
      "icons/icon.ico"
    ],
    "windows": {
      "nsis": {
        "installMode": "perUser"
      }
    }
  }
}
```

Note: `"decorations": true` gives the native Windows titlebar (minimize/maximize/close built in). `"maximized": true` starts maximized like the current Electron app. The `bundle.icon` paths are generated in Step 8 below.

> **Dev-only shortcut:** If you only want to run `tauri dev` (not produce an installer yet), you can temporarily remove the entire `bundle` block — `tauri dev` does not require icons. The icons become mandatory only for `tauri build` (Task 10). Keep the block if you intend to reach Task 10 in one go.

- [ ] **Step 4: Create `src-tauri/src/main.rs`**

```rust
// Prevents an extra console window on Windows in release builds.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    taranga_plus_lib::run()
}
```

- [ ] **Step 5: Create `src-tauri/src/lib.rs`**

```rust
use serde_json::Value;
use std::time::Duration;
use tauri::command;

/// Canonical GitHub raw URL for the curated channels catalog.
/// Matches the constant in the old Electron IPC handler.
const GITHUB_RAW_URL: &str =
    "https://raw.githubusercontent.com/ANALAMIN/taranga-plus/master/data/channels.json";

/// Fetch channels.json via reqwest with a 5-second timeout.
///
/// Replaces the Electron `fetch-channels` IPC handler. The renderer calls this
/// through `invoke('fetch_channels')` and receives the raw JSON value, which the
/// renderer's `getChannels()` types as `ChannelFinal[]`.
#[command]
async fn fetch_channels() -> Result<Value, String> {
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(5))
        .build()
        .map_err(|e| format!("HTTP client build failed: {e}"))?;

    let resp = client
        .get(GITHUB_RAW_URL)
        .header("Accept", "application/json")
        .send()
        .await
        .map_err(|e| format!("Could not retrieve channels: {e}"))?;

    if !resp.status().is_success() {
        return Err(format!("Could not retrieve channels: HTTP {}", resp.status()));
    }

    let json: Value = resp
        .json()
        .await
        .map_err(|e| format!("Could not parse channels: {e}"))?;

    Ok(json)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![fetch_channels])
        .run(tauri::generate_context!())
        .expect("error while running Taranga+ application");
}
```

- [ ] **Step 6: Create `src-tauri/.gitignore`**

```bash
mkdir -p src-tauri
```

Then create `src-tauri/.gitignore`:

```gitignore
# Tauri build artifacts
/target
/gen/schemas
```

- [ ] **Step 7: Fetch Rust deps**

Run:
```bash
cd src-tauri && cargo fetch && cd ..
```
Expected: Rust deps download (first run is slow, 1–3 min). No errors.

- [ ] **Step 8: Generate app icons**

Tauri requires icon files for `tauri build` (Task 10) and prints warnings for `tauri dev` if they are missing. Generate a full icon set from a single source image using the Tauri CLI.

First, create a source PNG. The simplest is to reuse the existing inline SVG favicon from `index.html` rendered to a 1024×1024 PNG. If you do not have one handy, create a 1024×1024 solid-color PNG named `app-icon.png` in the repo root (any solid color works — it gets replaced later).

Run:
```bash
npx @tauri-apps/cli@latest icon app-icon.png
```
Expected: writes a full set into `src-tauri/icons/` including `32x32.png`, `128x128.png`, `icon.ico`, `icon.png`, and platform variants. The `bundle.icon` paths in `tauri.conf.json` now resolve.

If you want the branded Taranga+ glyph instead of a placeholder, render the SVG from `index.html` (the red T-mark) to a 1024×1024 PNG and use that as `app-icon.png`, then re-run the command.

Clean up the source:
```bash
rm app-icon.png 2>nul || true
```

- [ ] **Step 9: Commit**

```bash
git add src-tauri/
git commit -m "feat(tauri): scaffold Tauri 2 backend crate with fetch_channels command"
```

---

## Task 3: Switch Vite config from electron-vite to plain Vite

**Files:**
- Create: `vite.config.ts`
- (keep `electron.vite.config.ts` until Task 8; it is deleted there)

- [ ] **Step 1: Create `vite.config.ts`**

```ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { resolve } from 'path';

// Plain Vite config for Tauri. Replaces electron.vite.config.ts.
// Tauri's dev server is served by Vite at the port declared in tauri.conf.json
// (devUrl). The renderer-only build output (dist/) is what Tauri bundles.
export default defineConfig({
  plugins: [react(), tailwindcss()],
  // Tauri expects the dev server on a fixed port. 1420 is Tauri's conventional
  // default; it must match tauri.conf.json -> app.windows / build.devUrl.
  server: {
    port: 1420,
    strictPort: true,
  },
  resolve: {
    alias: {
      '@': resolve(__dirname),
    },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        index: resolve(__dirname, 'index.html'),
      },
    },
  },
});
```

- [ ] **Step 2: Commit**

```bash
git add vite.config.ts
git commit -m "build: add plain Vite config for Tauri (port 1420)"
```

---

## Task 4: Migrate renderer IPC to Tauri invoke

**Files:**
- Modify: `src/services/apiClient.ts`

- [ ] **Step 1: Rewrite `src/services/apiClient.ts`**

Replace the entire file with:

```ts
import { ChannelFinal } from '../types';

const GITHUB_RAW_URL = 'https://raw.githubusercontent.com/ANALAMIN/taranga-plus/master/data/channels.json';

/**
 * Load the channel catalog.
 *
 * Primary path: Tauri command `fetch_channels` (runs in the Rust backend via
 * reqwest, no CORS concerns). Falls back to a direct browser fetch when running
 * outside Tauri (e.g. plain `vite` preview) — GitHub raw sends
 * `access-control-allow-origin: *`, so the fallback works without a proxy.
 */
export async function getChannels(): Promise<ChannelFinal[]> {
  // `invoke` is injected only in the Tauri webview. Guard with a feature check
  // so the same bundle works in a plain browser.
  const tauriInvoke = (import.meta as any).env?.TAURI_ENV
    ? await import('@tauri-apps/api/core').then(m => m.invoke).catch(() => null)
    : null;

  if (tauriInvoke) {
    try {
      const data = await tauriInvoke<ChannelFinal[]>('fetch_channels');
      if (data && data.length > 0) {
        console.log(`Loaded ${data.length} channels via Tauri`);
        return data;
      }
    } catch (error) {
      console.warn('Tauri fetch failed, trying direct fetch fallback...', error);
    }
  }

  const response = await fetch(GITHUB_RAW_URL, {
    headers: { 'Cache-Control': 'no-cache' },
  });
  if (!response.ok) {
    throw new Error(`GitHub raw fetch failed: HTTP ${response.status}`);
  }
  const data = await response.json();
  console.log(`Loaded ${data.length} channels from GitHub raw (fallback)`);
  return data;
}
```

Note: the cleaner pattern is a top-level `import { invoke } from '@tauri-apps/api/core'` and a runtime check via `window.__TAURI_INTERNALS__`. We use the dynamic-import guard to keep the bundle import-error-free when built for plain browser preview. This is revisited in Task 8 to use the canonical `isTauri` check.

- [ ] **Step 2: Commit**

```bash
git add src/services/apiClient.ts
git commit -m "feat(api): use Tauri invoke('fetch_channels') with browser fallback"
```

---

## Task 5: Update package.json — swap deps and scripts

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Update `package.json`**

Edit `package.json` so the keys below match. Keep all other keys (`name`, `private`, `version`, `type`, `main`, `build`).

Replace the `scripts` block:

```json
  "scripts": {
    "dev:web": "vite",
    "build:web": "vite build",
    "preview": "vite preview",
    "tauri": "tauri",
    "dev": "tauri dev",
    "build": "tauri build",
    "dist:win": "tauri build --target x86_64-pc-windows-msvc",
    "clean": "node -e \"const fs=require('fs');['dist','dist-electron','release','src-tauri/target'].forEach(d=>fs.rmSync(d,{recursive:true,force:true}))\"",
    "lint": "tsc --noEmit -p tsconfig.renderer.json",
    "test": "echo \"No test specified\" && exit 0"
  },
```

In `devDependencies`:
- REMOVE: `@electron-toolkit/tsconfig`, `electron`, `electron-builder`, `electron-vite`, `esbuild`
- ADD: `@tauri-apps/cli` (`^2`), `@tauri-apps/api` (`^2`)
- KEEP: `@cloudflare/workers-types`, `@types/express`, `@types/node`, `@types/react-dom`, `autoprefixer`, `tailwindcss`, `tsx`, `typescript`, `vite`

In `dependencies`:
- REMOVE: `express` (was only for an old standalone server, not used by the renderer)
- KEEP everything else (react, shaka-player, idb, lenis [removed in Task 7 cleanup], etc.)

Note: `lenis` stays in deps until Task 7 deletes its import; we remove it from `package.json` in Task 7's commit.

Set `"main"` to `"./dist/index.html"` (was the Electron entry).

The final `package.json` should look like:

```json
{
  "name": "taranga-plus",
  "private": true,
  "version": "2.0.0",
  "type": "module",
  "main": "./dist/index.html",
  "scripts": {
    "dev:web": "vite",
    "build:web": "vite build",
    "preview": "vite preview",
    "tauri": "tauri",
    "dev": "tauri dev",
    "build": "tauri build",
    "dist:win": "tauri build --target x86_64-pc-windows-msvc",
    "clean": "node -e \"const fs=require('fs');['dist','dist-electron','release','src-tauri/target'].forEach(d=>fs.rmSync(d,{recursive:true,force:true}))\"",
    "lint": "tsc --noEmit -p tsconfig.renderer.json",
    "test": "echo \"No test specified\" && exit 0"
  },
  "build": {
    "appId": "com.tarangaplus.app",
    "productName": "Taranga+",
    "directories": { "output": "release" },
    "files": ["dist/**/*"],
    "win": { "target": ["nsis"] }
  },
  "dependencies": {
    "@base-ui/react": "^1.6.0",
    "@tailwindcss/vite": "^4.1.14",
    "@vitejs/plugin-react": "^5.0.4",
    "@tauri-apps/api": "^2",
    "axios": "^1.18.0",
    "idb": "^8.0.3",
    "lenis": "^1.3.23",
    "lucide-react": "^0.546.0",
    "motion": "^12.23.24",
    "react": "^19.0.1",
    "react-dom": "^19.0.1",
    "shaka-player": "^5.1.10",
    "vite": "^6.2.3"
  },
  "devDependencies": {
    "@cloudflare/workers-types": "^4.20260619.1",
    "@tauri-apps/cli": "^2",
    "@types/express": "^4.17.21",
    "@types/node": "^22.19.21",
    "@types/react-dom": "^19.2.3",
    "autoprefixer": "^10.4.21",
    "tailwindcss": "^4.1.14",
    "tsx": "^4.21.0",
    "typescript": "~5.8.2",
    "vite": "^6.2.3"
  }
}
```

- [ ] **Step 2: Reinstall**

Run:
```bash
rm -rf node_modules package-lock.json && npm install
```
Expected: `@tauri-apps/cli` and `@tauri-apps/api` install; Electron packages removed.

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "build: swap Electron deps/scripts for Tauri (tauri dev/build/dist:win)"
```

---

## Task 6: Smoke test — does `tauri dev` launch?

**Files:** none (verification)

- [ ] **Step 1: Run the Tauri dev server**

Run:
```bash
npm run dev
```
Expected (first run compiles Rust, slow): a Tauri window opens showing the Taranga+ UI. The titlebar is the native Windows one (minimize/maximize/close buttons in the top-right). The channel grid loads (channels fetched via `invoke('fetch_channels')`).

- [ ] **Step 2: Confirm channels load via Tauri**

Open the webview devtools (right-click → Inspect, or F12). Check the console for `Loaded N channels via Tauri`.

If you instead see `Loaded N channels from GitHub raw (fallback)`, the Tauri invoke is failing — check the console for the Tauri error and re-examine `src-tauri/src/lib.rs` and `src/services/apiClient.ts`.

- [ ] **Step 3: Confirm a stream plays**

Click a channel. The TARANGA+ wave loader should show, then the video should play.

- [ ] **Step 4: Stop the dev server**

Ctrl+C in the terminal.

No commit — verification gate. If the window doesn't open or channels don't load, do not proceed to Task 7. Fix Task 2/4/5 first.

---

## Task 7: Performance cleanup — remove heavy effects

This is the core lag fix. Do all sub-steps, then one commit at the end.

### 7a: Remove Lenis smooth-scroll

**Files:**
- Modify: `src/App.tsx`
- Delete: `src/hooks/useLenis.ts`

- [ ] **Step 1: Remove the Lenis import and hook call from `src/App.tsx`**

In `src/App.tsx`, delete this line (around line 10):
```ts
import { useLenis } from './hooks/useLenis';
```

And delete this line inside `App()` (around line 17):
```ts
  useLenis(); // Initialize physics scrolling
```

- [ ] **Step 2: Remove all `data-lenis-prevent="true"` attributes**

In `src/App.tsx`, there are two `data-lenis-prevent="true"` attributes (player panel ~line 67, and `data-lenis-prevent` was also in `ChannelGrid`). Remove them wherever they appear in `src/App.tsx`. The lines look like:
```tsx
                data-lenis-prevent="true"
```
Delete each occurrence.

- [ ] **Step 3: Delete `src/hooks/useLenis.ts`**

```bash
git rm src/hooks/useLenis.ts
```

### 7b: Remove backdrop-blur everywhere

**Files:**
- Modify: `src/App.tsx`, `src/components/Topbar/index.tsx`, `src/components/ChannelGrid/index.tsx`, `src/components/ChannelCard/index.tsx`

- [ ] **Step 1: In `src/App.tsx` — player panel**

Find the `motion.div` for the player (className includes `backdrop-blur-2xl`). Change:
```tsx
                className="flex-1 lg:flex-[2.5] xl:flex-[3] w-full shrink-0 flex flex-col relative z-20 bg-black/50 backdrop-blur-2xl shadow-[0_8px_32px_rgba(0,0,0,0.5)] border-b lg:border-b-0 lg:border-r border-white/10 h-[55vh] lg:h-full overflow-hidden"
```
to:
```tsx
                className="flex-1 lg:flex-[2.5] xl:flex-[3] w-full shrink-0 flex flex-col relative z-20 bg-black/60 shadow-[0_8px_32px_rgba(0,0,0,0.5)] border-b lg:border-b-0 lg:border-r border-white/10 h-[55vh] lg:h-full overflow-hidden"
```
(removed `backdrop-blur-2xl`, bumped `bg-black/50` → `bg-black/60` so the panel still reads as a distinct surface without blur.)

- [ ] **Step 2: In `src/App.tsx` — close button + channel info + error overlay**

Close button (className includes `backdrop-blur-md`), change:
```tsx
                    className="absolute top-2 right-4 lg:top-4 lg:right-6 z-[60] bg-black/60 hover:bg-[var(--color-accent)] text-white p-2 md:p-2.5 rounded-[12px] md:rounded-[14px] backdrop-blur-md border border-white/15 transition-all duration-300 hover:scale-[1.05] shadow-lg group overflow-hidden"
```
to:
```tsx
                    className="absolute top-2 right-4 lg:top-4 lg:right-6 z-[60] bg-black/70 hover:bg-[var(--color-accent)] text-white p-2 md:p-2.5 rounded-[12px] md:rounded-[14px] border border-white/15 transition-all duration-300 hover:scale-[1.05] shadow-lg group overflow-hidden"
```

Channel info bar (className includes `backdrop-blur-md`), change:
```tsx
                      <div className="flex items-center gap-4 border border-white/5 bg-white/5 backdrop-blur-md p-3 md:p-4 rounded-2xl w-full shadow-[0_8px_32px_rgba(0,0,0,0.2)]">
```
to:
```tsx
                      <div className="flex items-center gap-4 border border-white/5 bg-white/10 p-3 md:p-4 rounded-2xl w-full shadow-[0_8px_32px_rgba(0,0,0,0.2)]">
```

Error overlay (className includes `backdrop-blur-md`), change:
```tsx
              <div className="absolute inset-0 flex items-center justify-center bg-black/80 z-50 p-6 text-center backdrop-blur-md">
```
to:
```tsx
              <div className="absolute inset-0 flex items-center justify-center bg-black/85 z-50 p-6 text-center">
```

- [ ] **Step 3: In `src/components/Topbar/index.tsx` — header**

Change:
```tsx
      className="h-[64px] pl-8 pr-[200px] bg-black/40 backdrop-blur-2xl border-b border-white/[0.04] flex items-center justify-between sticky top-0 z-40 transform-gpu shadow-sm"
```
to:
```tsx
      className="h-[64px] pl-8 pr-[200px] bg-black/60 border-b border-white/[0.04] flex items-center justify-between sticky top-0 z-40 shadow-sm"
```
(removed `backdrop-blur-2xl` and `transform-gpu` — `transform-gpu` was only needed to layer the blur; not needed now.)

- [ ] **Step 4: In `src/components/Topbar/index.tsx` — remove WebkitAppRegion styles**

The native titlebar handles dragging now, so `WebkitAppRegion` is dead. Remove all `style={{ WebkitAppRegion: '...' } as React.CSSProperties}` attributes from the `<header>`, logo container, search container, and theme-switch container. Four occurrences in the file. Leave the elements themselves; just strip the `style` prop.

- [ ] **Step 5: In `src/components/Topbar/index.tsx` — search background**

Find (inside the search block):
```tsx
            <div className="absolute inset-0 bg-[#1C1C1E]/60 group-hover:bg-[#1C1C1E]/80 group-focus-within:bg-[#2C2C2E]/90 rounded-xl transition-colors duration-300 backdrop-blur-md shadow-inner" />
```
Change to (remove `backdrop-blur-md`, solid fill):
```tsx
            <div className="absolute inset-0 bg-[#1C1C1E] group-hover:bg-[#222226] group-focus-within:bg-[#2C2C2E] rounded-xl transition-colors duration-300 shadow-inner" />
```

### 7c: Remove the gradient-bar background

**Files:**
- Modify: `src/components/ChannelGrid/index.tsx`
- Delete: `src/components/InteractiveGradientBackground.tsx`
- Delete: `src/components/ui/gradient-bars-background.tsx`

- [ ] **Step 1: Strip the wrapper from `src/components/ChannelGrid/index.tsx`**

Remove the import (line ~7):
```ts
import { InteractiveGradientBackground } from '../InteractiveGradientBackground';
```

In the main return, replace this wrapper:
```tsx
  return (
    <InteractiveGradientBackground>
      <div data-lenis-prevent="true" className={`p-4 md:p-6 h-full overflow-y-auto channel-grid-container relative z-10 w-full`}>
```
with a plain container (no wrapper, no lenis attr):
```tsx
  return (
    <div className="p-4 md:p-6 h-full overflow-y-auto channel-grid-container relative z-10 w-full">
```

And close the matching tags. The end of the component currently looks like:
```tsx
      </div>
    </InteractiveGradientBackground>
  );
```
Change to:
```tsx
    </div>
  );
```

- [ ] **Step 2: Delete the two background files**

```bash
git rm src/components/InteractiveGradientBackground.tsx
git rm src/components/ui/gradient-bars-background.tsx
```

### 7d: Remove Framer Motion stagger + per-card entrance

**Files:**
- Modify: `src/components/ChannelGrid/index.tsx`, `src/components/ChannelCard/index.tsx`

- [ ] **Step 1: In `src/components/ChannelGrid/index.tsx` — remove stagger import + wrapper**

Remove the import (line ~6):
```ts
import { staggerContainer, fadeIn } from '../../animations/variants';
```

Remove the `import { motion } from 'motion/react';` line too (line ~2) — after cleanup the grid itself won't use motion.

Replace the motion.div grid container:
```tsx
        <motion.div 
          variants={staggerContainer}
          initial="hidden"
          animate="visible"
          className={layout === 'list' 
            ? "flex flex-col gap-3 md:gap-4 pb-20" 
            : "grid grid-cols-[repeat(auto-fill,minmax(180px,1fr))] gap-5 pb-20"
          }
        >
```
with a plain div:
```tsx
        <div className={layout === 'list' 
            ? "flex flex-col gap-3 md:gap-4 pb-20" 
            : "grid grid-cols-[repeat(auto-fill,minmax(180px,1fr))] gap-5 pb-20"
          }
        >
```

Replace the per-card motion wrapper:
```tsx
          {filteredChannels.map((channel, idx) => (
            <motion.div key={channel.id} variants={fadeIn} className="transform-gpu">
              <ChannelCard 
                channel={channel} 
                isActive={activeChannel?.id === channel.id}
                index={idx}
                onClick={onChannelSelect}
                layout={layout}
                isFavorite={favorites.includes(channel.id)}
                onToggleFavorite={onToggleFavorite}
              />
            </motion.div>
          ))}
```
with (no motion wrapper):
```tsx
          {filteredChannels.map((channel, idx) => (
            <ChannelCard 
              key={channel.id}
              channel={channel} 
              isActive={activeChannel?.id === channel.id}
              index={idx}
              onClick={onChannelSelect}
              layout={layout}
              isFavorite={favorites.includes(channel.id)}
              onToggleFavorite={onToggleFavorite}
            />
          ))}
```

And fix the empty-state block: it currently uses `<motion.div variants={fadeIn} initial="hidden" animate="visible">`. Replace with a plain `<div>`:
```tsx
    return (
      <div className="flex flex-col items-center justify-center h-full text-[var(--color-muted)] font-bengali p-6 text-center">
```
(and the matching closing `</motion.div>` → `</div>`).

- [ ] **Step 2: In `src/components/ChannelCard/index.tsx` — remove motion import + entrance animations**

Remove the import (line ~2):
```ts
import { motion } from 'motion/react';
```

**List layout branch** — replace:
```tsx
      <motion.div
        onClick={() => onClick(channel)}
        initial={{ opacity: 0, x: 20 }}
        animate={{ opacity: 1, x: 0 }}
        whileTap={{ scale: 0.98 }}
        className={`group relative flex items-center gap-3 p-2.5 rounded-[12px] cursor-pointer transition-all duration-300 w-full ${
```
with a plain div (keep onClick, keep a CSS-only active scale via `transition`):
```tsx
      <div
        onClick={() => onClick(channel)}
        className={`group relative flex items-center gap-3 p-2.5 rounded-[12px] cursor-pointer transition-[background-color,box-shadow] duration-200 w-full ${
```
(and change the matching `</motion.div>` → `</div>`).

**Grid layout branch** — replace:
```tsx
    <motion.div
      onClick={() => onClick(channel)}
      initial={{ opacity: 0, scale: 0.95, y: 10 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      whileTap={{ scale: 0.96 }}
      className={`group relative p-[2px] rounded-[16px] cursor-pointer w-full aspect-[16/10] mx-auto ${
        isActive ? 'scale-[1.05] z-10' : ''
      }`}
```
with:
```tsx
    <div
      onClick={() => onClick(channel)}
      className={`group relative p-[2px] rounded-[16px] cursor-pointer w-full aspect-[16/10] mx-auto transition-[transform,box-shadow] duration-200 ${
        isActive ? 'scale-[1.05] z-10' : ''
      }`}
```
(and change the matching `</motion.div>` → `</div>`).

### 7e: Remove glowMove / glowPulse + simplify active card

**Files:**
- Modify: `src/components/ChannelCard/index.tsx`

- [ ] **Step 1: List branch — remove the two animated glow layers**

In the list branch, find:
```tsx
        {isActive && (
          <>
            <div className="absolute inset-0 rounded-[12px] z-0 pointer-events-none"
              style={{
                background: 'linear-gradient(135deg, #ff0000, #ffffff, #ff0000)',
                backgroundSize: '200% 200%',
                animation: 'glowMove 2s ease-in-out infinite',
                opacity: 0.3,
              }}
            />
            <div className="absolute -inset-[3px] rounded-[15px] z-0 pointer-events-none"
              style={{
                background: 'rgba(255, 0, 0, 0.1)',
                filter: 'blur(8px)',
                animation: 'glowPulse 2s ease-in-out infinite',
              }}
            />
          </>
        )}
```
Replace with a single static accent ring (no animation, no blur filter):
```tsx
        {isActive && (
          <div className="absolute inset-0 rounded-[12px] z-0 pointer-events-none ring-2 ring-[var(--color-accent)]/50" />
        )}
```

Also remove the trailing `blur-md` glow inside the list thumbnail:
```tsx
          {isActive && <div className="absolute inset-0 bg-[var(--color-accent)]/20 z-0 blur-md" />}
```
Replace with:
```tsx
          {isActive && <div className="absolute inset-0 bg-[var(--color-accent)]/20 z-0" />}
```

- [ ] **Step 2: Grid branch — remove the animated glow layer**

In the grid branch, find:
```tsx
        {isActive && (
          <div className="absolute inset-0 rounded-[14px] z-0 pointer-events-none"
            style={{
              background: 'linear-gradient(135deg, #ff0000, #ffffff, #ff0000)',
              backgroundSize: '200% 200%',
              animation: 'glowMove 2s ease-in-out infinite',
              opacity: 0.15,
            }}
          />
        )}
```
Replace with a static accent overlay:
```tsx
        {isActive && (
          <div className="absolute inset-0 rounded-[14px] z-0 pointer-events-none ring-2 ring-inset ring-[var(--color-accent)]/40" />
        )}
```

- [ ] **Step 3: Grid branch — keep only one shadow per element**

The grid card currently has three shadow layers (glow behind button, theme blob boxShadow, inner glow). Simplify by keeping the theme blob boxShadow (most visually meaningful) and dropping the redundant glow-behind-button shadow:

Find:
```tsx
      <div className={`absolute top-0 right-0 w-[65%] h-[60%] rounded-[120px] transition-all duration-500 ease-out -z-10 ${isActive ? 'shadow-[0_0_40px_#ffffff60]' : 'shadow-[0_0_20px_#ffffff38] group-hover:shadow-[0_0_40px_#ffffff60]'}`} />
```
Replace with (remove the shadow entirely; the parent border/blob carry the visual):
```tsx
      <div className="absolute top-0 right-0 w-[65%] h-[60%] rounded-[120px] -z-10" />
```

Shorten the blob transition from `duration-500` to `duration-200`:
Find: `transition-all duration-500 ease-out ${isActive ? 'w-[60%]' : 'w-[40%] group-hover:w-[70%]'}`
Replace: `transition-[width] duration-200 ease-out ${isActive ? 'w-[60%]' : 'w-[40%] group-hover:w-[70%]'}`

### 7f: Remove the player-panel Framer Motion fade

**Files:**
- Modify: `src/App.tsx`

- [ ] **Step 1: Replace AnimatePresence + motion.div with a plain conditional**

In `src/App.tsx`, remove the imports:
```ts
import { AnimatePresence, motion } from 'motion/react';
```

Replace the `<AnimatePresence>{inPlayerState && activeChannel && ( <motion.div ...>...</motion.div> )}</AnimatePresence>` block. Change the opening:
```tsx
          <AnimatePresence>
            {inPlayerState && activeChannel && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0, transition: { duration: 0.2 } }}
                className="flex-1 lg:flex-[2.5] xl:flex-[3] w-full shrink-0 flex flex-col relative z-20 bg-black/60 shadow-[0_8px_32px_rgba(0,0,0,0.5)] border-b lg:border-b-0 lg:border-r border-white/10 h-[55vh] lg:h-full overflow-hidden"
              >
```
to:
```tsx
          {inPlayerState && activeChannel && (
            <div
              className="flex-1 lg:flex-[2.5] xl:flex-[3] w-full shrink-0 flex flex-col relative z-20 bg-black/60 shadow-[0_8px_32px_rgba(0,0,0,0.5)] border-b lg:border-b-0 lg:border-r border-white/10 h-[55vh] lg:h-full overflow-hidden"
            >
```

And the closing `</motion.div>` `)}` `</AnimatePresence>` becomes `</div>` `)}`.

- [ ] **Step 2: Verify no motion import remains in App.tsx**

Search `src/App.tsx` for `motion` — should be zero hits after this step.

### 7g: Delete unused animation files + dead keyframes

**Files:**
- Delete: `src/animations/variants.ts`
- Modify: `src/styles/globals.css`

- [ ] **Step 1: Delete `src/animations/variants.ts`**

First confirm nothing else imports it:
```bash
grep -r "animations/variants" src/ || echo "no remaining imports"
```
Expected: `no remaining imports`. Then:
```bash
git rm src/animations/variants.ts
```
If the `src/animations/` directory is now empty, remove it:
```bash
rmdir src/animations 2>nul || true
```

- [ ] **Step 2: Remove dead keyframes from `src/styles/globals.css`**

Delete these four keyframe blocks:
```css
@keyframes moveBackground {
  from {
    background-position: 0% 0%;
  }
  to {
    background-position: 0% -1000%;
  }
}

@keyframes glowMove {
  0% { background-position: 0% 50%; }
  50% { background-position: 100% 50%; }
  100% { background-position: 0% 50%; }
}

@keyframes glowPulse {
  0%, 100% { opacity: 0.25; }
  50% { opacity: 0.5; }
}

@keyframes pulseBar {
  0% { transform: scaleY(var(--initial-scale)); }
  100% { transform: scaleY(calc(var(--initial-scale) * 0.7)); }
}
```
KEEP: `shimmer`, `live-pulse`, `transformAnim`, `opacityAnim`, `letterAnim` (used by skeleton, live dot, and TARANGA+ loader).

- [ ] **Step 3: Remove `lenis` from dependencies**

In `package.json`, remove:
```json
    "lenis": "^1.3.23",
```
Then:
```bash
npm install
```

### 7h: Type-check and verify

- [ ] **Step 1: Type-check the renderer**

Run:
```bash
npm run lint
```
Expected: `tsc --noEmit` passes with no errors. If errors mention `motion` or `InteractiveGradientBackground` or `useLenis`, there's a leftover import — find and remove it.

- [ ] **Step 2: Run Tauri dev and verify lag is gone**

Run:
```bash
npm run dev
```
Expected: the app launches. Visually verify:
- No animated gradient bars behind the grid (solid background).
- No blur halos on cards/topbar.
- Scrolling is native (instant), not smooth-eased.
- Clicking a channel shows the TARANGA+ loader (preserved), then plays.
- Clicking channels rapidly feels immediate — no laggy buildup.
- The native Windows titlebar is present (minimize/maximize/close).

- [ ] **Step 3: Commit the perf cleanup**

```bash
git add -A
git commit -m "perf(ui): remove heavy effects — gradient bars, backdrop-blur, Lenis, motion stagger, glowMove

The renderer-side causes of input lag. Layout and the TARANGA+ wave
loader are unchanged. Adds a native Windows titlebar via Tauri."
```

---

## Task 8: Remove Electron entirely

**Files:**
- Delete: `src-electron/` (whole folder)
- Delete: `electron.vite.config.ts`
- Delete: `tsconfig.main.json`
- Delete: `nul` (stray file in repo root, if present)
- Modify: `src/services/apiClient.ts` (clean up the dynamic import guard)

- [ ] **Step 1: Delete Electron sources**

```bash
git rm -r src-electron
git rm electron.vite.config.ts
git rm tsconfig.main.json
```

If `nul` exists in the repo root (Windows reserved-name artifact):
```bash
git rm nul 2>nul || true
```

- [ ] **Step 2: Remove the now-dead `tsconfig.json` main reference**

In `tsconfig.json`, remove the main-process reference so only renderer + worker remain. Change:
```json
  "references": [
    { "path": "./tsconfig.renderer.json" },
    { "path": "./tsconfig.main.json" },
    { "path": "./tsconfig.worker.json" }
  ]
```
to:
```json
  "references": [
    { "path": "./tsconfig.renderer.json" },
    { "path": "./tsconfig.worker.json" }
  ]
```

- [ ] **Step 3: Simplify `src/services/apiClient.ts` to use the canonical Tauri check**

Replace the dynamic-import guard with the canonical runtime check. Rewrite `getChannels`:

```ts
import { invoke } from '@tauri-apps/api/core';
import { ChannelFinal } from '../types';

const GITHUB_RAW_URL = 'https://raw.githubusercontent.com/ANALAMIN/taranga-plus/master/data/channels.json';

/**
 * Load the channel catalog.
 *
 * In the Tauri webview, `fetch_channels` runs in the Rust backend (reqwest,
 * no CORS concerns). Outside Tauri (plain browser preview) we fetch GitHub raw
 * directly — it sends `access-control-allow-origin: *`.
 */
export async function getChannels(): Promise<ChannelFinal[]> {
  if ('__TAURI_INTERNALS__' in window) {
    try {
      const data = await invoke<ChannelFinal[]>('fetch_channels');
      if (data && data.length > 0) {
        console.log(`Loaded ${data.length} channels via Tauri`);
        return data;
      }
    } catch (error) {
      console.warn('Tauri fetch failed, trying direct fetch fallback...', error);
    }
  }

  const response = await fetch(GITHUB_RAW_URL, {
    headers: { 'Cache-Control': 'no-cache' },
  });
  if (!response.ok) {
    throw new Error(`GitHub raw fetch failed: HTTP ${response.status}`);
  }
  const data = await response.json();
  console.log(`Loaded ${data.length} channels from GitHub raw (fallback)`);
  return data;
}
```

- [ ] **Step 4: Remove leftover `window.electronAPI` global declaration**

Search for any remaining `electronAPI` references:
```bash
grep -rn "electronAPI" src/ || echo "clean"
```
Expected: `clean`. (The `apiClient.ts` rewrite above already dropped it.)

- [ ] **Step 5: Type-check**

Run:
```bash
npm run lint
```
Expected: passes. If `tsconfig.main.json` was referenced by `tsconfig.json` and you deleted it, the reference removal in Step 2 fixes that.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "chore: remove Electron entirely (src-electron, electron.vite.config, tsconfig.main)

The app is now Tauri-only. apiClient uses the canonical __TAURI_INTERNALS__
check with a plain top-level import."
```

---

## Task 9: Update README and confirm CI unaffected

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Update the README architecture + commands**

In `README.md`, replace the Architecture section's Electron references with Tauri. Specifically:

Change:
```markdown
Built as an **Electron** desktop app (Windows NSIS installer). A **GitHub Actions** workflow validates channels and commits the curated catalog directly to `data/channels.json`.
```
to:
```markdown
Built as a **Tauri 2** desktop app (Windows NSIS installer; WebView2 runtime). A **GitHub Actions** workflow validates channels and commits the curated catalog directly to `data/channels.json`.
```

In the architecture diagram, replace the Electron Main / preload layers:
```markdown
└───────────────┬─────────────────────────────────────────────────────────────┘
                │ contextBridge (src-electron/preload/)
┌───────────────▼─────────────────────────────────────────────────────────────┐
│  Electron Main (src-electron/main/)                                         │
│  Window lifecycle, IPC handlers (native fetch)                              │
└───────────────┬─────────────────────────────────────────────────────────────┘
```
with:
```markdown
└───────────────┬─────────────────────────────────────────────────────────────┘
                │ invoke() — @tauri-apps/api/core
┌───────────────▼─────────────────────────────────────────────────────────────┐
│  Tauri Main (src-tauri/src/) — Rust                                         │
│  fetch_channels command (reqwest, 5s timeout)                               │
└───────────────┬─────────────────────────────────────────────────────────────┘
```

Update the dev/build commands section. Replace:
```markdown
```bash
# 1. Install dependencies
npm install

# 2. Start the Electron + Vite dev server (hot reload)
npm run dev
```
```
with:
```markdown
```bash
# Prerequisites: Rust (https://rustup.rs), MSVC build tools, Node 20+.

# 1. Install dependencies
npm install

# 2. Start the Tauri dev server (Rust + Vite hot reload)
npm run dev
```
```

Replace the Build & distribute block:
```markdown
# Produce the Windows NSIS installer + portable zip
npm run dist:win
```
with:
```markdown
# Produce the Windows NSIS installer
npm run dist:win
```

Update the Project layout block — replace:
```markdown
src-electron/         main process + preload (contextBridge)
```
with:
```markdown
src-tauri/            Rust backend (Tauri main + fetch_channels command)
```

Update the Configuration table — replace `ELECTRON_RENDERER_URL` row with:
```markdown
| `GITHUB_RAW_URL` | env (Rust) | Override the `channels.json` source the Tauri backend fetches (set in `src-tauri/src/lib.rs`) |
```
(Or delete the `ELECTRON_RENDERER_URL` row entirely since native titlebar needs no dev-URL validation.)

Update Tech stack:
```markdown
- **Desktop:** Tauri 2 (Rust backend, WebView2), NSIS bundler
- **UI:** React 19, Tailwind CSS v4 (animations removed for performance)
- **Player:** Shaka Player 5 (HLS/DASH, ABR)
- **Persistence:** IndexedDB (idb) — favorites, watch history, logo cache
```

- [ ] **Step 2: Verify CI workflow is unaffected**

Read `.github/workflows/validate-channels.yml` — it only fetches/validates M3U sources and commits `data/channels.json`. It does not build the desktop app. Confirm it has no `npm run build`/`electron-builder` step that would now break.

```bash
grep -n "npm run\|electron\|tauri" .github/workflows/validate-channels.yml || echo "CI does not build the app — unaffected"
```
Expected: `CI does not build the app — unaffected` (or only references to the validation script).

- [ ] **Step 3: Commit**

```bash
git add README.md
git commit -m "docs: update README for Tauri (architecture, commands, tech stack)"
```

---

## Task 10: Final verification — clean build + installer

**Files:** none (verification)

- [ ] **Step 1: Clean build**

```bash
npm run clean
npm install
npm run lint
```
Expected: lint passes with zero errors.

- [ ] **Step 2: Build the production bundle + installer**

```bash
npm run dist:win
```
Expected (slow — full Rust release compile, 2–5 min): produces `src-tauri/target/release/bundle/nsis/Taranga+_*_x64-setup.exe`. Note the file size — it should be well under 20 MB (vs Electron's ~80–120 MB).

- [ ] **Step 3: Run the installer and smoke test**

Run the produced `.exe` installer. Launch Taranga+ from the Start menu. Verify:
- Native Windows titlebar (minimize/maximize/close work).
- Channels load (check via devtools console: "via Tauri").
- Click a channel → TARANGA+ loader → video plays.
- Search, category filter, favorite toggle all work.
- No input lag on rapid channel clicks.
- Theme switch works.

- [ ] **Step 4: Final commit if any stray changes**

```bash
git status
```
If clean, nothing to commit — migration complete. If there are untracked files (e.g. a generated icon), add them:
```bash
git add -A
git commit -m "chore: finalize Tauri migration"
```

---

## Done Criteria (from spec §10)

- [x] `npm run tauri dev` launches; channels load via `invoke('fetch_channels')`.
- [x] TARANGA+ loader preserved; stream plays after loading.
- [x] No backdrop-blur, gradient-bar animation, Lenis, glowMove/glowPulse in the app.
- [x] No Electron files, deps, or config remain.
- [x] `npm run dist:win` produces a working NSIS installer < 20 MB.
- [x] No laggy sensation on channel clicks / scroll.
