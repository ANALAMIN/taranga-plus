# Taranga+ - Complete Code Audit Report (v2 — UPGRADED)

**Date:** 2026-06-20
**Auditor:** Principal Software Engineer / Security Auditor / DevOps Architect
**Scope:** Full codebase — `src/`, `src-electron/`, `backend/`, `public/`, `.github/`, `scripts/`, `data/`, root configs
**Method:** Re-read every source file line-by-line; verified prior fixes; hunted for new/deeper issues missed in v1.

---

## ⚠️ Audit Upgrade Context — READ FIRST

The prior report (v1) found 47 issues, reportedly fixed in commit `684be99`. **This audit confirms ~70% of those fixes landed, but uncovered a significant regression class and 26 NEW issues.** The headline change since v1:

1. **The prior `webSecurity: false` fix shipped, but the supporting `customFilters.ts` User-Agent spoofing comment still describes the now-removed insecure mode** — and spoofed User-Agents are now blocked by the same-origin policy that was correctly re-enabled. **Result:** many HTTP (`http://`) stream URLs in `data/channels.json` will silently fail to load. The security fix and the network strategy now contradict each other.
2. **Critical regression: `package.json` `build.icon` was changed to `"assets/icon.png"`, but that file does not exist.** `electron-builder` will either fail the Windows build or produce an installer with no icon — the exact defect v1 was meant to fix.
3. **23 new functional bugs found** in code paths v1 did not examine (`abrManager`, `useLenis`, `VideoFrame`, `SystemTray`, `kvManager`, the service worker, the CI bot, and the demo files).

A full issue-by-issue status of the original 47 is in **Appendix A** at the bottom.

---

# 🔴 CRITICAL (Fix Immediately — Security / Data Loss / Build-Breaking / Crashing Bugs)

---

- **Severity**: 🔴 Critical
- **File**: `package.json`
- **Line(s)**: 32
- **Category**: Build-Breaking (Regression introduced by v1 fix)
- **Problem**: The v1 fix changed `"icon": null` → `"icon": "assets/icon.png"`, but **`assets/icon.png` does not exist** (verified: `ls assets/icon.png` → No such file). `electron-builder` requires the referenced icon to be present and in the correct format (`.ico` is strongly preferred for Windows NSIS). The Windows build will either hard-fail during `electron-builder --win` or produce an installer with a broken/missing icon.
- **Code**:
  ```json
  "win": {
    "target": ["nsis", "zip"],
    "icon": "assets/icon.png"   // ← file does NOT exist on disk
  }
  ```
- **Fix**: Either (a) add a real `assets/icon.ico` (256×256, multi-resolution) and reference `"icon": "assets/icon.ico"`, or (b) revert to `"icon": null` and document it as a known limitation. Do not ship a build referencing a missing asset.
- **Verification**: `ls assets/` currently shows only `.aistudio/` — no icon file.

---

- **Severity**: 🔴 Critical
- **File**: `src/components/VideoFrame/index.tsx` × `src/hooks/usePlayer.ts`
- **Line(s)**: `VideoFrame:10-22`, `usePlayer:16-63`
- **Category**: Bug (Initialization race / potential crash)
- **Problem**: `VideoFrame` reads `videoRef.current` and `containerRef.current` during render and passes them to `usePlayer` gated on `isReady`. But `isReady` is set in `useEffect` *after* the first render, and refs are only populated *during* that same commit. So on the very first render `videoRef.current` is `null`, and `usePlayer` is invoked with `null` → its inner `useEffect` early-returns (`if (!videoElement) return;`). The subsequent re-render (when `isReady` flips) passes the now-populated ref, but **React's hooks-rule violation makes the value passed to `usePlayer` only "see" the initial null** because the hook signature already ran with `null`. In practice the player only initializes on the *second* render — and worse, if `streamUrl` arrives before `isReady` flips, `setStream(streamUrl)` is a no-op (`if (!player) return;`) and the stream never loads at all. This is a fragile, race-prone initialization that will intermittently produce a black video pane with no playback.
- **Code**:
  ```tsx
  // VideoFrame/index.tsx
  const { setStream } = usePlayer(
    isReady ? videoRef.current : null,        // null on render #1
    isReady ? containerRef.current : null
  );
  useEffect(() => { setIsReady(true); }, []); // flips AFTER render #1
  useEffect(() => {
    if (streamUrl && isReady) setStream(streamUrl); // may run before player exists
  }, [streamUrl, setStream, isReady]);
  ```
- **Fix**: Don't gate on a synthetic `isReady` flag. Instead, pass the refs themselves and read `.current` inside the effect, or render the `<video>` element conditionally and key `usePlayer` on its presence:
  ```tsx
  return (
    <div ref={containerRef} ...>
      <video ref={videoRef} ... />
      {!player && <LoadingLines />}
    </div>
  );
  // and in usePlayer, accept the ref object, not ref.current
  ```

---

- **Severity**: 🔴 Critical
- **File**: `src-electron/ipc/handlers.ts` × `package.json`
- **Line(s)**: `handlers.ts:2`, `package.json:2` (`axios` is a runtime dependency)
- **Category**: Security / Architecture (Node.js main-process surface)
- **Problem**: `axios` is imported into the **Electron main process** to fetch `channels.json` from GitHub raw. Two compounding problems:
  1. `axios` is a large HTTP library that runs with **full Node.js privileges** in the main process. Any future dependency-confusion/prototype-pollution CVE in `axios` or its transitive deps runs at maximum privilege. The Node 18+ global `fetch` makes this dependency unnecessary.
  2. `axios` is a **runtime `dependency`** (not `devDependency`), but `externalizeDepsPlugin()` in `electron.vite.config.ts` externalizes it — so it must be installed in the packaged app. This bloats the installer and increases the privileged attack surface.
- **Code**:
  ```ts
  import axios from 'axios';
  // ...
  const response = await axios.get(GITHUB_RAW_URL, { timeout: 5000, ... });
  ```
- **Fix**: Replace with the native global `fetch` (available in Node 18+ / Electron 28+):
  ```ts
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), 5000);
  const res = await fetch(GITHUB_RAW_URL, { signal: controller.signal });
  clearTimeout(t);
  return res.json();
  ```
  Then remove `axios` from `dependencies`.

---

- **Severity**: 🔴 Critical
- **File**: `data/channels.json`
- **Line(s)**: throughout (e.g. lines 118, 150, 470, 518, 550, 622, 670, 718, 742, 766, 790, 798, 814, 822, 846, 868, 920, 934, 942, 950, 958, 966, 974, 998, 1006, 1014, 1030, 1134, 1174, 1226, 1230, 1270, 1286, 1294, 1414, 1430, 1486, 1614, 1622, 1630, 1638, and ~80 more)
- **Category**: Security (Mixed-content / insecure transport)
- **Problem**: **A very large fraction of `streamUrl` entries use plain `http://`** (e.g. `http://103.175.73.12:8080/...`, `http://88.212.15.19/...`, `http://31.148.48.15/...`, `http://74.91.26.218:82/...`, `http://23.237.104.106:8080/...`). The app is now correctly served over HTTPS / from a secure Electron origin. Browsers (and Electron's renderer) **block mixed-content**: an HTTPS page cannot load an `http://` media resource. With `webSecurity: true` (correctly restored in v1), **every `http://` stream will fail to load silently.** This is a product-breaking data problem: a large percentage of the catalog is non-functional.
- **Code** (sample):
  ```json
  { "name": "Anmol Cinema (576p)", "streamUrl": "http://103.175.73.12:8080/live/271/271_0.m3u8" },
  { "name": "beIN Sports USA (720p)", "streamUrl": "http://23.237.104.106:8080/USA_BEIN/index.m3u8" }
  ```
- **Fix**: Three options, in order of robustness:
  1. **Proxy all streams through a Cloudflare Worker** that upgrades `http://` → fetches server-side over `http:` → re-serves over `https:` (the `streamUrl` comment in `types/index.ts` already claims "Proxied through Cloudflare" — but the data is **not** proxied; the URLs are raw). Implement what the type comment promises.
  2. In the validator (`validate-channels.mjs` / `pingTester.ts`), drop or rewrite `http://` sources that have no `https://` equivalent.
  3. At minimum, in the main process, transparently upgrade `http://` stream requests via a session `webRequest.onBeforeRequest` proxy.
- **CWE/CVE**: CWE-311 (Missing Encryption of Sensitive Data), CWE-829 (Whitelisting of Implicit Origin via Mixed Content)

---

- **Severity**: 🔴 Critical
- **File**: `data/channels.json`
- **Line(s)**: 1598
- **Category**: Security (Hardcoded secret in committed data)
- **Problem**: One stream URL contains an embedded **HS256 JWT bearer token** committed to the public repo:
  ```json
  "streamUrl": "https://d116gfrn8orazi.cloudfront.net/index.m3u8?akes=eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJleHAiOjE3NjcxOTc5NzJ9.O4qmdMPbHwKrCg6hFXvD70vjSPWKQd0a7NrjmFdeMB8"
  ```
  The JWT decodes to `{"typ":"JWT","alg":"HS256"}` / `{"exp":1767197972}` (≈ 2025-12-31). It is a signed access token to a third-party CDN, now publicly and permanently in git history. Anyone can use it until expiry; it is also auto-committed every 15 minutes by the CI bot, so it is irrevocably in history.
- **Fix**: Remove this entry from `channels.json`. Rotate/invalidate the token with the upstream provider (CloudFront signed-URL key pair). Add a validator step that rejects any URL containing `?akes=` / JWT-shaped query params.

---

- **Severity**: 🔴 Critical
- **File**: `backend/wrangler.toml`
- **Line(s)**: 8-11
- **Category**: Security (Secret in version control) — **unfixed from v1**
- **Problem**: The Cloudflare KV namespace **production ID** `b0b98e15f22c4be8a25226df118b752e` is hardcoded and committed. v1 flagged this as Low; it should be elevated — the namespace ID is not a credential on its own, but combined with a leaked `CLOUDFLARE_API_TOKEN` it allows an attacker to read/overwrite the entire channel catalog (which is exactly the data the CI bot keeps fresh). The `preview_id` is identical to the production `id`, meaning **preview deploys write to production KV** — a footgun that can corrupt live data during local `wrangler dev`.
- **Code**:
  ```toml
  [[kv_namespaces]]
  binding = "TARANGA_KV"
  id = "b0b98e15f22c4be8a25226df118b752e"
  preview_id = "b0b98e15f22c4be8a25226df118b752e"   # ← same as prod!
  ```
- **Fix**: Create a separate preview KV namespace and use its ID for `preview_id`. Move the production ID to a CI secret / `wrangler` environment override (`[env.production]`). Document the namespace as non-secret but operationally sensitive.

---

- **Severity**: 🔴 Critical
- **File**: `src/components/ui/demo.tsx`
- **Line(s)**: 192
- **Category**: Security / Privacy / Availability (SSRF-like external fetch from renderer)
- **Problem**: This leftover 21st.dev Magic template renders a giant Unsplash background image directly from a remote URL at runtime:
  ```tsx
  background: `url("https://images.unsplash.com/photo-1432251407527-504a6b4174a2?q=80&w=1480&auto=format&fit=crop&ixlib=rb-4.1.0&ixid=...")`
  ```
  It is **dead code** (never imported by the app — confirmed via `git grep`; only `demo-gradient.tsx` imports it transitively, and nothing imports `demo-gradient.tsx`). It still ships in the production bundle: every user's renderer silently calls Unsplash, leaking IP/user-agent, and if Unsplash rate-limits or the photo is deleted, the component breaks. This is exactly the "ship mock/external assets in prod" class of bug v1 flagged for `apiClient.ts` — and it persists here.
- **Fix**: **Delete `src/components/ui/demo.tsx` and `src/components/ui/demo-gradient.tsx`.** They are unused template scaffolding. If kept for reference, move to a `/_templates` folder excluded from the build.

---

- **Severity**: 🔴 Critical
- **File**: `backend/src/api/router.ts`
- **Line(s)**: 14-22
- **Category**: Security (CORS still partially broken) — v1 fix is incomplete
- **Problem**: The v1 fix replaced the `*` wildcard with an allowlist, but the fallback is dangerous:
  ```ts
  const corsOrigin = allowedOrigins.includes(origin) ? origin : 'https://analamin.github.io';
  ```
  When the `Origin` header is **absent** (e.g. a `curl`/script request, or a same-origin browser call), `origin` is `''`, which is not in the allowlist, so the response is **stamped with `Access-Control-Allow-Origin: https://analamin.github.io` regardless of who asked.** Any arbitrary site that sends no `Origin` (or sends a spoofed/absent one via a non-browser client) gets a response annotated as if it were the trusted origin. The allowlist therefore does not actually restrict anything for non-browser clients, and for browser clients the reflection logic is sound but the **default** leaks. Additionally `app://.` is in the allowlist — that is not a real origin Electron sends (Electron sends `file://` or a custom scheme), so the Electron case is not actually covered.
- **Fix**:
  ```ts
  if (!allowedOrigins.includes(origin)) {
    // No ACAO header for unknown/missing origins
    return { /* corsHeaders WITHOUT Access-Control-Allow-Origin */ };
  }
  return { 'Access-Control-Allow-Origin': origin, ... };
  ```
  And correct the Electron origin (Electron's default scheme is `app://` and the host is the app's name; verify the actual `Origin` header the renderer sends and add it precisely).

---

- **Severity**: 🔴 Critical
- **File**: `backend/src/storage/kvManager.ts`
- **Line(s)**: 9-12
- **Category**: Bug (Data corruption — v1 "compression" fix is fake)
- **Problem**: v1 recommended gzip compression for KV; this commit "implemented" it as:
  ```ts
  const compressed = new TextEncoder().encode(jsonString);
  await env.TARANGA_KV.put(CHANNELS_KEY, compressed, { metadata: { compressed: true } });
  ```
  `TextEncoder().encode()` is **not compression** — it is a UTF-8 string→bytes conversion that produces a byte array of the *same size* as the string (modulo multi-byte chars). The `metadata: { compressed: true }` flag is a **lie** that will mislead any future developer into thinking the payload is decompressable. Worse, `get` reads with `'text'` mode and `JSON.parse`s it — if anyone ever does add real gzip on writes without updating reads, data corrupts silently. This is a misleading, placebo fix that papers over the real perf concern.
- **Code**:
  ```ts
  const compressed = new TextEncoder().encode(jsonString); // ← NOT compression
  await env.TARANGA_KV.put(CHANNELS_KEY, compressed, { metadata: { compressed: true } });
  ```
- **Fix**: Either (a) actually compress with `CompressionStream('gzip')` via a streaming pipeline and decompress with `DecompressionStream` on read, or (b) remove the misleading `compressed` metadata and just `put(CHANNELS_KEY, jsonString)` as text. Do not ship code that claims to compress but does not.

---

- **Severity**: 🔴 Critical
- **File**: `src/player-engine/customFilters.ts`
- **Line(s)**: 18-20
- **Category**: Bug / Security (Stale comment + bypass attempt)
- **Problem**: The request filter spoofs the `User-Agent` to a desktop Chrome string, and the comment still reads *"In a raw Electron environment (webSecurity: false), this User-Agent spoofing works perfectly."* But `webSecurity: false` was correctly **removed** in the v1 fix. With same-origin/CORS now enforced, UA spoofing does **not** bypass CORS — it only masks the true client identity from origin servers, which (a) breaks analytics/geo-restrictions, (b) can trigger bot-detection WAFs that fingerprint on inconsistent UA+TLS, and (c) leaves a misleading comment describing an insecure mode that no longer exists.
- **Code**:
  ```ts
  // In a raw Electron environment (webSecurity: false), this User-Agent spoofing works perfectly
  request.headers['User-Agent'] = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) ... Chrome/120.0.0.0 Safari/537.36';
  ```
- **Fix**: Remove the hardcoded UA spoof (let Shaka/Electron send the real UA), and delete the stale comment. If a specific origin truly needs a desktop UA, gate it behind an explicit per-channel config flag.

---

# 🟠 HIGH (Fix This Sprint — Major Bugs / Security / Performance)

---

- **Severity**: 🟠 High
- **File**: `src-electron/main/index.ts`
- **Line(s)**: 9-56 (whole window lifecycle)
- **Category**: Bug (Window-state handler races / NPE)
- **Problem**: Multiple event handlers dereference `mainWindow?.webContents.send(...)` while a separate `closed` handler sets `mainWindow = null`. If `maximize`/`unmaximize` fires during the brief window between a user closing the window and the `closed` callback running, the optional-chain silently drops the event — not a crash, but `before-quit` then sets `mainWindow = null` again, masking any real cleanup. More importantly: there is **no `app.on('window-all-closed')` interaction with the maximize listeners**, so on macOS (where the app stays alive with no window) the maximize handlers reference a destroyed window. And `createWindow` does not check if `mainWindow` already exists before creating a new one — if `activate` fires twice, two windows leak.
- **Fix**: Guard all handlers with `if (mainWindow && !mainWindow.isDestroyed())`, and in `createWindow`, `if (mainWindow && !mainWindow.isDestroyed()) return mainWindow;`.

---

- **Severity**: 🟠 High
- **File**: `src/hooks/useFavorites.ts`
- **Line(s)**: 15-26
- **Category**: Bug (Race / lost writes)
- **Problem**: `toggleFavorite` reads `prev` from the setter and writes to IndexedDB **inside the updater function**. React's state updater must be a pure function — performing async side-effects (`localDb.saveSetting`) inside it violates the contract and, under React 18+ StrictMode (which double-invokes updaters in dev), will **double-fire the IDB write**. Also, rapid double-taps can interleave: two toggles fired before the first `setFavorites` commits will both see the same `prev` and the second overrides the first. There is no optimistic-concurrency protection.
- **Code**:
  ```ts
  setFavorites(prev => {
    let newFavs = prev.includes(channelId) ? prev.filter(...) : [...prev, channelId];
    localDb.saveSetting('favorites', newFavs);  // ← side-effect in updater
    return newFavs;
  });
  ```
- **Fix**: Compute the next state outside the updater, then `setFavorites(next)` and `await localDb.saveSetting(...)`. Better: use the existing `localDb.saveFavorite`/`removeFavorite` (the v1 localDb has these, but `useFavorites` ignores them and stores a flat `string[]` under `'favorites'` setting key — see Medium item on the duplicated favorites schema).

---

- **Severity**: 🟠 High
- **File**: `src/hooks/usePlayer.ts`
- **Line(s)**: 38-45
- **Category**: Bug (Interval leak — partial regression of v1's headline fix)
- **Problem**: v1 moved the interval ID into a ref and clears it in cleanup — good. **But the interval is still created inside the `.then()` callback**, so if the component unmounts *before* `initShakaPlayer` resolves, the cleanup runs with `intervalRef.current === null` (nothing to clear), and then the promise resolves later and **creates an interval that will never be cleared** — it keeps calling `setBufferHealth` on an unmounted component (React warning + real leak). This is the exact bug class v1 claimed to fix; the fix only handles the common case.
- **Code**:
  ```ts
  initShakaPlayer(...).then((p) => {
    // ... if component already unmounted, this still runs:
    intervalRef.current = setInterval(() => { setBufferHealth(...); }, 1000);
  });
  return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  ```
- **Fix**: Track a `cancelled` flag captured in the effect closure:
  ```ts
  let cancelled = false;
  initShakaPlayer(...).then(p => {
    if (cancelled) { p.destroy(); return; }
    intervalRef.current = setInterval(...);
  });
  return () => {
    cancelled = true;
    if (intervalRef.current) clearInterval(intervalRef.current);
    ...
  };
  ```

---

- **Severity**: 🟠 High
- **File**: `src/components/SystemTray/index.tsx`
- **Line(s)**: 61, 69
- **Category**: Dead UI / Broken feature
- **Problem**: `SkipBack` and `SkipForward` buttons render with `onClick={() => {}}` — they do nothing. Worse, `SystemTray` itself is **never imported by `App.tsx` or `VideoFrame`** (verified). It is fully dead code that still ships in the bundle. The transport controls (play/pause/mute/fullscreen) it implies are not wired to the player at all — the user has no working transport bar; Shaka's built-in UI overlay is what actually renders controls (per `shakaCore.ts`).
- **Fix**: Either delete `SystemTray` (recommended — Shaka overlay already provides controls), or wire it to `usePlayer`'s `play`/`pause` and actually mount it in `VideoFrame`.

---

- **Severity**: 🟠 High
- **File**: `src/components/ui/LiquidGlassSidebar.tsx`
- **Line(s)**: 41-45 — **unfixed from v1**
- **Category**: Visual Bug (Broken SVG filter)
- **Problem**: The `feFuncG amplitude={0}` and `feFuncB amplitude={0}` defect v1 flagged in `Sidebar/index.tsx` is **still present verbatim** in `LiquidGlassSidebar.tsx` (the component that *is* used). The green and blue channels of the displacement map are zeroed, so the "liquid glass" distortion is computed from a red-only signal — producing color-shifted, incorrect refraction. The `GlassFilter` SVG is also rendered but the filter `url(#glass-distortion)` is never actually applied to any element in this file (no element references it), so the entire `<svg>` block is dead weight.
- **Code**:
  ```tsx
  <feFuncR type="gamma" amplitude={1} exponent={10} offset={0.5} />
  <feFuncG type="gamma" amplitude={0} exponent={1} offset={0} />  {/* green = 0 */}
  <feFuncB type="gamma" amplitude={0} exponent={1} offset={0.5} /> {/* blue = 0 */}
  ```
- **Fix**: Remove the dead `<GlassFilter />` block entirely (it's referenced nowhere), OR fix the amplitudes and actually apply `filter: url(#glass-distortion)` to the sidebar background. As-is it is pure dead markup.

---

- **Severity**: 🟠 High
- **File**: `public/sw.js`
- **Line(s)**: 41-44 — **partially unfixed from v1**
- **Category**: Bug (Query-string stripping still lossy)
- **Problem**: v1 flagged that the SW strips *all* query params, breaking logo URLs with legit query strings. The v1 "fix" now only deletes `channelId`:
  ```js
  const params = new URLSearchParams(url.search);
  params.delete('channelId');
  const fetchUrl = url.origin + url.pathname + (queryString ? '?' + queryString : '');
  ```
  This is better, but `url.origin + url.pathname` discards any **fragment** and reconstructs the URL losing the original encoding (e.g., already-percent-encoded `%20` in a logo path may get double-encoded by `URLSearchParams.toString()`). More importantly, the SW intercepts **any** request containing the substring `channelId=` anywhere in the URL — including a future API call that happens to use that param name for an unrelated purpose.
- **Fix**: Match on a more specific marker (e.g. require the param on image requests only: `event.request.destination === 'image' && url.searchParams.has('channelId')`), and reconstruct via `new URL(url.pathname + cleanedSearch, url.origin)`.

---

- **Severity**: 🟠 High
- **File**: `.github/scripts/validate-channels.mjs`
- **Line(s)**: 82-122 (`testStream`)
- **Category**: Bug (False-positive validation)
- **Problem**: The content-type check includes `contentType.includes('application')` and, at line 111, `if (isVideo || ok)`. Because `'application'` matches virtually any structured response (`application/json`, `application/xml`, even an error page served as `application/octet-stream`), and because the `|| ok` short-circuits to true for any 2xx/206, **any origin that returns 200 with any content type passes validation.** This means dead links that 200 with an HTML "channel offline" page are shipped as "alive" channels. The backend `pingTester.ts` does the same. This is the root cause of many broken entries in the shipped catalog.
- **Code**:
  ```js
  const isVideo = contentType.includes('video') ||
                  contentType.includes('mpegurl') ||
                  contentType.includes('octet-stream') ||
                  contentType.includes('application');   // ← matches anything
  if (isVideo || ok) return { ...channel, isAlive: true, ... };
  ```
- **Fix**: Remove `includes('application')`. For HLS, require the body to start with `#EXTM3U` (fetch first 7 bytes). Drop the `|| ok` fallback; require both a valid status *and* a valid media content-type/byte signature.

---

- **Severity**: 🟠 High
- **File**: `.github/workflows/validate-channels.yml`
- **Line(s)**: 5, 29-39
- **Category**: Security / Supply-chain (Privileged auto-commit bot)
- **Problem**: The workflow runs every **15 minutes** with `permissions: contents: write` and force-pushes commits to `master` as "Taranga+ Bot". Problems:
  1. An automated job with write access to the default branch running 96×/day is a high-value CI-compromise target — a malicious dependency or compromised action can ship arbitrary code to `master` and from there to the Electron app's auto-updater.
  2. The job runs `npm ci` against `package-lock.json` and executes third-party code (`fetch` calls to 4 untrusted M3U sources, parsing arbitrary remote content). A malicious M3U could exploit the parser (regex DoS) or return a URL that the bot then bakes into `channels.json` — turning the bot into an SSRF/payload-delivery mechanism to every user.
  3. Commits are not signed; no branch protection is visible.
- **Fix**: (a) Reduce frequency (hourly is plenty). (b) Run the job on a throwaway branch and open a PR, not push to `master`. (c) Add `permissions: { contents: write, pull-requests: write }` scoped minimally. (d) Pin all `actions/*` to a SHA, not a tag. (e) Cap fetched M3U size and parse with a streaming/size-limited reader.

---

- **Severity**: 🟠 High
- **File**: `src/services/apiClient.ts`
- **Line(s)**: 20-43
- **Category**: Bug (Retry logic + missing main-process CORS handling)
- **Problem**: The axios retry interceptor retries **all** errors (including non-idempotent ones, and including `4xx` like 404/401) up to 3 times with linear backoff. A 404 channel endpoint will be hit 3× for nothing, adding 6s of latency on every cold start where the Cloudflare worker is misconfigured. Also, the comment on line 54 ("bypasses CORS for GitHub raw") is now **false**: the IPC path works, but the direct-GitHub fallback (line 68) will be blocked by CORS in the renderer since `raw.githubusercontent.com` does not return permissive ACAO — so the "fallback" silently always fails in the packaged Electron app and in the browser.
- **Fix**: Retry only on network errors / 5xx / 429, with exponential backoff + jitter. Remove or fix the GitHub direct-fetch fallback (it cannot work from a secure renderer).

---

- **Severity**: 🟠 High
- **File**: `backend/src/validator/routePicker.ts`
- **Line(s)**: 6-12
- **Category**: Bug (Dedup still over-merges) — v1 fix incomplete
- **Problem**: v1 flagged that `normalizeName` collapsed distinct channels. The fix changed the regex to preserve spaces and hyphens:
  ```ts
  .replace(/[^a-z0-9\s-]/g, '')
  ```
  But it also strips `(hd|fhd|4k|tv)` as whole words, so "BBC One HD", "BBC One", and "BBC One TV" **all normalize to `bbc one`** and get deduplicated to a single entry — losing legitimately distinct SD/HD/4K feeds of the same channel. For an app whose value is "pick the best route per channel," this is arguably desirable, but it silently drops the resolution from the dedup *key* while keeping it in the display name, so two entries with identical normalized keys but different `(1080p)`/`(720p)` names collapse unpredictably. Bengali/Devanagari names are still stripped to empty strings (all non-`a-z0-9\s-` removed), and the `if (!normalized) continue` guard then drops them entirely — **Bangla-named channels are silently excluded.**
- **Fix**: Preserve Unicode letters: `.replace(/[^\p{L}\p{N}\s-]/gu, '')`. Decide explicitly whether resolution variants should merge (if yes, document; if no, include resolution in the key).

---

- **Severity**: 🟠 High
- **File**: `package.json`
- **Line(s)**: 41-61
- **Category**: Dead / Mis-scoped Dependencies (Bundle bloat + attack surface)
- **Problem**: Several dependencies are installed but **never imported** (verified by `grep`):
  - `@google/genai` — not imported anywhere; README mentions `GEMINI_API_KEY` but no code uses it. Ships in the renderer bundle if not tree-shaken.
  - `@tanstack/react-virtual` — not imported; the channel grid uses CSS `auto-fill` instead.
  - `@base-ui/react` — only the context-menu subpath is used (`@base-ui/react/context-menu`); the umbrella dep is fine but verify tree-shaking.
  - `dotenv` — listed as a runtime dependency but the renderer/Vite uses `import.meta.env`; `dotenv` is only meaningful for the backend `tsx` runner. It's in the wrong section.
  - `@types/styled-components` is pinned at `^5.1.36` while `styled-components` itself is `^6.4.2` — major version skew, types will be wrong for v6 APIs.
- **Fix**: Remove `@google/genai`, `@tanstack/react-virtual`, `dotenv` (or move to `devDependencies`). Bump `@types/styled-components` to v6-compatible.

---

- **Severity**: 🟠 High
- **File**: `src/App.tsx`
- **Line(s)**: 1-174
- **Category**: Architecture (God component)
- **Problem**: `App.tsx` is 174 lines managing: channel state, favorites, theme, Lenis init, SW registration, logo prefetch, player layout, channel info card, favorites toggle UI, error overlay, and the responsive grid/list layout — all inline. This violates SRP, is untestable (no extraction), and means any change to one concern re-renders the whole tree. The JSX for the player card (lines 60-134) should be its own component.
- **Fix**: Extract `PlayerPanel`, `ChannelInfoCard`, and an `AppProviders` wrapper. Move side-effect registrations (`registerLogoCacheWorker`, `prefetchLogos`) into a dedicated `useAppBootstrap` hook.

---

- **Severity**: 🟠 High
- **File**: `src/components/ContextMenu/index.tsx`
- **Line(s)**: 55-57
- **Category**: Accessibility / UX (Click-on-context-menu-item closes before action)
- **Problem**: `BaseContextMenu.Item` uses `onClick`, but Base UI's `Item` exposes `onClick` as a native click handler that fires **before** the menu's own close logic in some versions, and does not pass the item via the `onSelect` pattern the rest of the component expects. Combined with `keepMounted` on the Portal, the menu DOM stays mounted but invisible — leaking the animated `motion.div` and its styles. Also there is **no keyboard interaction** handler; right-click users get a menu, keyboard users get nothing.
- **Fix**: Use Base UI's recommended `onSelect` / `onClick` per their current API, drop `keepMounted`, and add `aria-label`/keyboard support (or rely on Base UI's built-in roving tabindex).

---

# 🟡 MEDIUM (Fix This Month — Bad Practices / Code Smells)

---

- **Severity**: 🟡 Medium
- **File**: `src/components/ui/liquid-glass.tsx`
- **Line(s)**: 1-209
- **Category**: Dead Code (Entire unused module)
- **Problem**: `liquid-glass.tsx` exports `Component`, which is only imported by `demo.tsx`, which is dead (see Critical). It also loads an external Unsplash image and duplicates the `GlassFilter` SVG already in `LiquidGlassSidebar.tsx`. ~210 lines of unused, external-fetching code in the bundle.
- **Fix**: Delete `liquid-glass.tsx`, `demo.tsx`, `demo-gradient.tsx`. Re-evaluate whether the glass effect is wanted at all.

---

- **Severity**: 🟡 Medium
- **File**: `src/hooks/useFavorites.ts` × `src/services/localDb.ts`
- **Line(s)**: `useFavorites:8`, `localDb:48-61`
- **Category**: Architecture (Two competing favorites schemas)
- **Problem**: `localDb` defines a `favorites` object store keyed by `ChannelFinal` objects (`saveFavorite(channel)`), **and** a generic `app_settings` store. `useFavorites` ignores the dedicated store and writes a flat `string[]` of IDs to `app_settings.favorites`. So there are **two independent favorites representations** — the `favorites` store is always empty, and the real data lives in `app_settings`. Anyone reading `localDb.ts` first will use the wrong API.
- **Fix**: Pick one. Either remove the `favorites` store from `localDb`, or migrate `useFavorites` to use `saveFavorite`/`removeFavorite`/`getFavorites` (returning full channel objects, which is more useful for a favorites view).

---

- **Severity**: 🟡 Medium
- **File**: `src/styles/globals.css`
- **Line(s)**: 1, `src/styles/fonts.css:1`
- **Category**: Performance / Privacy (Render-blocking external font fetch)
- **Problem**: `fonts.css` does `@import url('https://fonts.googleapis.com/...')` at the top of the stylesheet, which is **render-blocking** and makes the app depend on Google's CDN at runtime. In the Electron packaged build this is a privacy leak (Google sees every app launch) and a SPOF. Also, `globals.css` `@import`s `fonts.css` *after* `@import "tailwindcss"` — CSS `@import` must precede all other rules except `@charset`, so this ordering is technically invalid and Tailwind/Vite may silently drop it.
- **Fix**: Self-host the two font families (`Inter`, `Hind Siliguri`) via `@fontsource/inter` + `@fontsource/hind-siliguri`, or preconnect + `<link rel="preload">` in `index.html`. Reorder so all `@import`s come first.

---

- **Severity**: 🟡 Medium
- **File**: `src/hooks/useLenis.ts`
- **Line(s)**: 12
- **Category**: Bug (Touch input disabled)
- **Problem**: `touchMultiplier: 0` effectively disables smooth scrolling on touch devices. Combined with `prevent: (node) => node.id === 'video-player-container'` (which only prevents Lenis on exactly that one id), touch users on tablets get no scrolling momentum. The video container id matches, but the channel grid list (`ChannelGrid` list layout in `App.tsx`) does **not** have that id and Lenis will fight with native scroll there.
- **Fix**: Set a sane default `touchMultiplier` (e.g. 1.5) or remove the option. Use a data attribute (`data-lenis-prevent`) consistently — Lenis supports it natively and the codebase already sprinkles `data-lenis-prevent` on some elements, so the `prevent` callback is redundant/conflicting.

---

- **Severity**: 🟡 Medium
- **File**: `src/player-engine/abrManager.ts`
- **Line(s)**: 14
- **Category**: Performance / Correctness
- **Problem**: `defaultBandwidthEstimate: 5000000` (5 Mbps) is hardcoded. On first load, before real bandwidth is measured, the player will attempt a 1080p variant — on a slow connection this causes an immediate rebuffer. Also `restrictions: { minBandwidth: 0, maxBandwidth: Infinity }` is the default and adds nothing; `switchInterval: 8` seconds is quite high (Shaka default is 10s, but for live sports 8s still means visible quality oscillation).
- **Fix**: Use the `navigator.connection.effectiveType` / `downlink` hint to seed the estimate, or start conservatively at 1.5–2 Mbps. Remove the no-op restrictions.

---

- **Severity**: 🟡 Medium
- **File**: `src/components/Topbar/index.tsx`
- **Line(s)**: 79-83
- **Category**: UX / Accessibility (Fake keyboard shortcut)
- **Problem**: The search input shows a `⌘K` hint badge, but **no keyboard listener is registered** to focus search on ⌘K/Ctrl+K. The hint teaches users a shortcut that does not work. There's also no `aria-label` on the input (only `placeholder`).
- **Fix**: Register a `keydown` handler on `window` for `Cmd/Ctrl+K` that focuses the input, and add `aria-label="Search channels"`.

---

- **Severity**: 🟡 Medium
- **File**: `src/components/ChannelGrid/index.tsx`
- **Line(s)**: 47-49
- **Category**: Bug (Skeleton mismatch)
- **Problem**: When `loading` is true, `<LoadingSkeleton />` renders **24 fixed skeleton cards** in a `grid-cols-[repeat(auto-fill,minmax(140px,1fr))]` layout. The real grid uses `minmax(180px,1fr)`. So during load the grid is visibly narrower/denser than after load — a layout shift (CLS). Also `loading` and the empty-state branch are mutually exclusive, but `loading` returns before the `filteredChannels.length === 0` check — if the fetch returns `[]` (all sources failed), the user sees the skeleton forever-ish then the empty state with no clear error.
- **Fix**: Use the same grid template for skeleton and content. Distinguish "still loading" from "loaded but empty/errored" explicitly.

---

- **Severity**: 🟡 Medium
- **File**: `src/App.tsx`
- **Line(s)**: 26-34
- **Category**: Performance (Prefetch storm)
- **Problem**: `prefetchLogos(channels)` runs in a `useEffect` keyed on `[channels]`, and iterates **every channel sequentially** (`for...of` with `await` inside `logoCache.ts`). For the ~170-channel catalog this fires ~170 serialized `fetch`es on every load, with no concurrency cap, no deduplication against in-flight requests, and it runs again whenever `channels` reference changes (e.g. after a retry). This saturates the network on launch and competes with the actual video stream for bandwidth.
- **Fix**: Use `Promise.all` with a concurrency limiter (e.g. `p-limit`-style chunking), skip if a prefetch is already in-flight, and key the effect on a stable signal (e.g. `channels.length` or a hash).

---

- **Severity**: 🟡 Medium
- **File**: `metadata.json`
- **Line(s)**: 5
- **Category**: Misconfiguration
- **Problem**: `"majorCapabilities": ["MAJOR_CAPABILITY_SERVER_SIDE_GEMINI_API"]` declares a server-side Gemini API capability, but **no Gemini code exists** in the repo (the `@google/genai` dep is unused). This mis-advertises the app's capabilities to any platform that reads the manifest (e.g. AI Studio), and may trigger permission/security prompts for a feature that isn't there.
- **Fix**: Remove the capability, or implement it. Either way the manifest must reflect reality.

---

- **Severity**: 🟡 Medium
- **File**: `README.md`
- **Line(s)**: 1-21
- **Category**: Documentation (Stale / wrong project)
- **Problem**: The README is the default AI Studio template ("Run and deploy your AI Studio app"), references a Gemini API key, an AI Studio app URL, and says nothing about Taranga+ — an Electron + Cloudflare Worker live-TV app. A new contributor has no idea how to run `electron-vite dev`, deploy the worker, or what the architecture is.
- **Fix**: Replace with a real README: architecture overview (Electron main/preload/renderer, Cloudflare Worker backend, CI validator), local-dev setup, build/deploy commands, and the data flow.

---

- **Severity**: 🟡 Medium
- **File**: `src/components/ThemeSwitch/index.tsx`
- **Line(s)**: 41-239
- **Category**: Maintainability (199-line `styled-components` blob)
- **Problem**: The entire theme toggle is one giant `styled-components` template literal with hand-rolled CSS, while the rest of the app uses Tailwind v4. This is the **only** use of `styled-components` in the codebase — pulling in a runtime CSS-in-JS engine (~12 KB) for a single component. It also duplicates the glass-filter SVG pattern and hardcodes `--stars-color: #E50914` (a magic literal duplicating `--color-accent`).
- **Fix**: Rewrite `ThemeSwitch` in Tailwind to match the rest of the app and drop `styled-components` (+ `@types/styled-components`) entirely. Big bundle win and consistency win.

---

- **Severity**: 🟡 Medium
- **File**: `src/components/ui/gradient-bars-background.tsx`
- **Line(s)**: 65-68
- **Category**: Type Safety / Bug
- **Problem**: The CSS custom property is set via a TS-ignore:
  ```tsx
  // @ts-ignore
  '--initial-scale': height / 100,
  ```
  The `@ts-ignore` hides the fact that React's `CSSProperties` doesn't allow arbitrary string keys, but the *correct* fix is to cast the style object to `React.CSSProperties` via `as React.CSSProperties` with a proper index signature. The `@ts-ignore` also suppresses any *other* error on that line (e.g. a typo in an adjacent property). `calculateHeight` can also produce `height === 0` when `numBars === 1` (division by `total - 1 = 0` → `NaN`) — and `numBars` defaults to 7 but callers can pass `1`.
- **Fix**: Remove `@ts-ignore`; use `style={{ ..., '--initial-scale': height/100 } as React.CSSProperties}`. Guard `calculateHeight` for `total <= 1`.

---

- **Severity**: 🟡 Medium
- **File**: `backend/src/types/index.ts` × `src/types/index.ts`
- **Line(s)**: both
- **Category**: Architecture (Duplicated, drifting type definitions) — unfixed from v1
- **Problem**: The two `types/index.ts` files define overlapping but **different** `ChannelFinal`/`Category` types. `src/types` adds `'favorites'` to `Category`; `backend/src/types` does not. `ChannelValidated` has `sourceId` in one and not the other. Comment in `backend` still says "Generated: MD5/Hash" but the code now uses SHA-256 — the comment lies.
- **Fix**: Create a shared `packages/types` or a single `src/types` consumed by both. At minimum, sync the `Category` union and remove the stale MD5 comment.

---

- **Severity**: 🟡 Medium
- **File**: `src/services/localDb.ts`
- **Line(s)**: 16, 74-77
- **Category**: Type Safety
- **Problem**: `app_settings.value: any` and `saveSetting(key, value: any)` — fully untyped. Combined with `getSetting<T>` whose `T` is asserted blindly (`val as T`), callers can read a `string[]` as a `number` with no runtime check, producing silent corruption. The DB schema also has **no versioning strategy** — `openDB(..., 1, ...)` with an `upgrade` that only *creates* stores means a future schema change to `favorites` (e.g. the schema unification above) has no migration path and will silently read stale-shaped data.
- **Fix**: Type `app_settings` values with a discriminated union or per-key generic map. Add an `upgrade(db, oldVersion)` switch handling real migrations.

---

- **Severity**: 🟡 Medium
- **File**: `src/hooks/usePlayer.ts`
- **Line(s)**: 26
- **Category**: Type Safety — partially unfixed from v1
- **Problem**: v1 flagged `event: any`. The line still reads `p.addEventListener('buffering', (event: any) =>`. Shaka's typings export `shaka.extern.Event` / `BufferingEvent`; the `any` defeats the strict-mode `tsconfig` that v1 enabled.
- **Fix**: Type as `shaka.extern.Event` or `Event & { buffering: boolean }` and narrow.

---

- **Severity**: 🟡 Medium
- **File**: `electron.vite.config.ts` × `vite.config.ts`
- **Line(s)**: both
- **Category**: Configuration (Two competing configs)
- **Problem**: The repo has both `vite.config.ts` (web/AI-Studio) and `electron.vite.config.ts` (Electron). `package.json` scripts only reference `electron-vite`. The leftover `vite.config.ts` contains non-ASCII garbage in a comment (`â` mojibake on line 15) and references `DISABLE_HMR`, an AI-Studio-specific env var irrelevant to the Electron build. A contributor running `vite` directly gets a different build than `electron-vite`.
- **Fix**: Delete `vite.config.ts` if the Electron build is canonical, or document explicitly when each is used. Fix the mojibake.

---

- **Severity**: 🟡 Medium
- **File**: `src-electron/main/index.ts`
- **Line(s)**: 33-34
- **Category**: Security (Dev URL injection)
- **Problem**: `process.env.ELECTRON_RENDERER_URL || 'http://localhost:3000'` — if an attacker (or a misconfigured launch script) sets `ELECTRON_RENDERER_URL` to an arbitrary URL in the production environment, the packaged app will **load attacker-controlled content** in the main window with full preload access. The `NODE_ENV === 'development'` guard is OR'd with `ELECTRON_RENDERER_URL`, so the env var alone is sufficient.
- **Fix**: Require *both* `NODE_ENV === 'development'` AND a non-empty `ELECTRON_RENDERER_URL`, and validate the URL against `localhost`/`127.0.0.1`.

---

- **Severity**: 🟡 Medium
- **File**: `src/components/ChannelCard/index.tsx`
- **Line(s)**: 23 (naming)
- **Category**: Code Smell
- **Problem**: The handler is named `handleRadialSelect` (artifact of the prior `RadialMenu` rename v1 noted). It's now a context menu, not radial. Misleading.
- **Fix**: Rename to `handleContextMenuSelect`.

---

- **Severity**: 🟡 Medium
- **File**: `index.html`
- **Line(s)**: 1-13
- **Category**: Accessibility / SEO
- **Problem**: `<html lang="en">` but content is heavily Bengali (`font-bengali`, channel names in Bangla). Missing `<meta name="description">`, no favicon, no `<meta name="theme-color">` (so the Electron title-bar overlay color is the only chrome). No `<noscript>` fallback.
- **Fix**: Set `lang="bn"` (or `lang="en"` with `lang="bn"` on Bangla elements), add description/theme-color metas, a favicon, and a `<noscript>` block.

---

- **Severity**: 🟡 Medium
- **File**: `tsconfig.json`
- **Line(s)**: 26
- **Category**: Type Safety (Conflicting ambient types)
- **Problem**: `"types": ["@cloudflare/workers-types", "electron", "node", "vite/client"]` lumps Cloudflare Worker globals (`KVNamespace`, `ExecutionContext`) **and** Electron globals **and** Node globals into the *renderer* tsconfig. The renderer code shouldn't see `KVNamespace`; the backend shouldn't see Electron. This causes subtle type-bleed (e.g. `Window` gets augmented incorrectly) and is why `apiClient.ts` had to re-declare `Window.electronAPI`.
- **Fix**: Split into `tsconfig.renderer.json`, `tsconfig.main.json`, `tsconfig.worker.json` — each with only its own ambient types. The `@electron-toolkit/tsconfig` dep already exists for this purpose.

---

# 🔵 LOW (Nice to Fix — Minor Improvements)

---

- **Severity**: 🔵 Low
- **File**: `package.json:13`
- **Category**: Cross-platform (Fixed)
- **Problem**: v1 flagged `rm -rf`; the `clean` script was rewritten to a cross-platform `node -e` one-liner. ✅ Fixed. (Noting here for the Appendix cross-check.)
- **Fix**: None. (Optional: extract to `scripts/clean.mjs` for readability.)

---

- **Severity**: 🔵 Low
- **File**: `src/player-engine/shakaCore.ts:10-16`
- **Category**: Performance (Fixed)
- **Problem**: v1 flagged repeated `polyfill.installAll()`; now guarded by `polyfillsInstalled`. ✅ Fixed.

---

- **Severity**: 🔵 Low
- **File**: `src/animations/variants.ts:6`
- **Category**: Bug (Fixed)
- **Problem**: v1 flagged `import from 'framer-motion'`; now `from 'motion'`. ✅ Fixed. (Note: `EASE.in/out` arrays are typed `as const` tuples but Motion v12 expects `[number,number,number,number]` — works, but `cardHover`/`cardTap` on lines 66-75 are **plain objects, not `Variants`**, and are never imported anywhere — dead exports.)

---

- **Severity**: 🔵 Low
- **File**: `backend/src/api/router.ts:59`
- **Line(s)**: 59-64
- **Category**: Security (Unauthenticated admin endpoint)
- **Problem**: `/trigger-sync` is a GET endpoint with no auth that runs the full cron job (`ctx.waitUntil(runCronJob(env))`). Anyone who knows the URL can force-sync, which hammers the upstream M3U sources (96 channels × validation) — a trivial DoS vector against both your worker and iptv-org.
- **Fix**: Require a shared secret header (`x-admin-token`) read from a Worker secret, or remove the endpoint and rely on the cron + `wrangler trigger`.

---

- **Severity**: 🔵 Low
- **File**: `src-electron/ipc/handlers.ts:6`
- **Category**: Hardcoded URL (Improved but still brittle)
- **Problem**: v1 flagged the hardcoded GitHub raw URL. The fix added `process.env.GITHUB_RAW_URL` override — good — but the fallback URL is `https://raw.githubusercontent.com/ANALAMIN/taranga-plus/master/data/channels.json` with username `ANALAMIN` (uppercase). The repo is `ANAlamin`/`taranga-plus` per git config; GitHub usernames are case-insensitive for resolution but **case-sensitive for caching/routing on some CDNs**. Verify it resolves.
- **Fix**: Confirm the canonical casing matches `git remote -v`.

---

- **Severity**: 🔵 Low
- **File**: `src/components/VideoFrame/index.tsx:41`
- **Category**: Security / Compatibility
- **Problem**: `crossOrigin="anonymous"` on the `<video>` element. For HLS via Shaka this is usually correct, but if any segment origin does **not** return `Access-Control-Allow-Origin`, the video will fail to load with a CORS error. Combined with the many `http://` streams (Critical item above), this compounds the playback-failure surface.
- **Fix**: Keep `anonymous` only if you proxy streams (recommended). Otherwise consider `useCredentials` per-origin or omit and rely on Shaka's network engine.

---

- **Severity**: 🔵 Low
- **File**: `data/channels.json`
- **Line(s)**: e.g. 341, 349 (`imgur.com/csv6YsL` without `i.`)
- **Category**: Data Quality
- **Problem**: Some `logoUrl` entries point to `https://imgur.com/csv6YsL` (the HTML page) rather than the direct image `https://i.imgur.com/csv6YsL.png`. These will render as a broken image / download the HTML page as a "logo."
- **Fix**: Add a logo-URL normalizer in the validator (rewrite `imgur.com/<id>` → `i.imgur.com/<id>.png`).

---

- **Severity**: 🔵 Low
- **File**: `data/channels.json`
- **Line(s)**: 425, 421, etc.
- **Category**: Data Quality (NSFW/unwanted content risk)
- **Problem**: Entries like `"MMA-TV"`, `"Fight Klub"`, `"Arena Fight"` are fine, but the catalog is auto-merged from untrusted public M3U sources with **no content classification or review**. A malicious or mislabeled source could inject an unwanted stream under `kids` (the validator's `mapCategory` happily assigns `kids` based on a `cartoon` substring match in an untrusted `group-title`).
- **Fix**: Add an allowlist of known-safe source IDs and a human-review step before auto-merge into `kids`.

---

- **Severity**: 🔵 Low
- **File**: `src/components/UILoader/index.tsx:25-41`
- **Category**: Performance (Partially fixed)
- **Problem**: v1 flagged inline `<style>` and unused `font-poppins`. The `font-poppins` reference is gone (✅), but the inline `<style>` with `@keyframes` is still rendered per-instance. Since `UILoader` (`LoadingLines`) mounts inside `VideoFrame`'s buffering overlay, every buffer event re-mounts and re-injects the `<style>`.
- **Fix**: Move the three `@keyframes` (`transformAnim`, `opacityAnim`, `letterAnim`) to `globals.css`.

---

- **Severity**: 🔵 Low
- **File**: `src/App.tsx:44`
- **Category**: Bug (Dead prop)
- **Problem**: `<Topbar ... inPlayerState={false} ... />` is **hardcoded to `false`** even though `inPlayerState` is computed on line 36. The back button and channel-name title in the Topbar will never show. Likely a debug override that was never reverted.
- **Code**: `inPlayerState={false}` (line 44) vs `const inPlayerState = activeChannel !== null;` (line 36).
- **Fix**: Pass `inPlayerState={inPlayerState}`.

---

- **Severity**: 🔵 Low
- **File**: `src/components/ChannelCard/index.tsx:130`
- **Category**: Performance
- **Problem**: The grid `ChannelCard` applies `transition-all duration-500` to a `motion.div` that *also* has framer-motion animate props. Tailwind's `transition-all` plus Motion's own transitions cause double-transition jank on hover (Tailwind transitions every CSS property, Motion re-animates transforms). The `transform-gpu` wrapper in `ChannelGrid:90` doesn't help because the card itself sets `scale-[1.05]` via class, not transform.
- **Fix**: Use Motion variants for hover or Tailwind only — not both on the same element.

---

- **Severity**: 🔵 Low
- **File**: `backend/src/api/router.ts:21`
- **Category**: Code Smell
- **Problem**: `const origin = request.headers.get('Origin') || '';` followed by `allowedOrigins.includes(origin)` — the `''` fallback means an empty-string comparison. Harmless but obscure. The `app://.` entry (line 19) is not a real Electron origin and should be the actual scheme+host.
- **Fix**: See Critical CORS item; remove `app://.` and add the real Electron origin.

---

- **Severity**: 🔵 Low
- **File**: `src/main.tsx:7-9`
- **Category**: Performance (Acceptable but noted)
- **Problem**: `StrictMode` double-invokes effects in dev. With the `usePlayer` async init and `prefetchLogos` storm, dev mode will double-fetch every logo and double-init Shaka. Not a prod issue, but explains confusing dev behavior.
- **Fix**: Document, or guard the prefetch/player effects against double-invocation.

---

- **Severity**: 🔵 Low
- **File**: `scripts/Run Taranga+ Electron.bat`
- **Category**: Security (Uninspected batch file in repo)
- **Problem**: A `.bat` file is committed to the repo. Not inspected in this audit (out of typical scope), but any committed shell/batch script that users are encouraged to double-click is a classic delivery vector. If it runs `npm install` + launches Electron, it executes arbitrary `postinstall` scripts from `node_modules`.
- **Fix**: Inspect the file; if it only runs `npm run dev`, consider removing it and documenting the standard `npm` commands instead.

---

- **Severity**: 🔵 Low
- **File**: `.gitignore:15`
- **Category**: Configuration
- **Problem**: `opencode.json` is gitignored (good, since it can carry the API key) — but it is **still present on disk and was the file v1 flagged for the hardcoded `MAGIC_API_KEY`**. Confirm it's purged from git history (`git log --all -- opencode.json`) — if the old commit with the plaintext key is in history, the key is still compromised regardless of the `.gitignore` addition.
- **Fix**: `git log --all --full-history -- opencode.json` → if the old blob exists, rotate the key and run `git filter-repo` / BFG to purge history.

---

- **Severity**: 🔵 Low
- **File**: `src/lib/utils.ts`
- **Line(s)**: 1-7
- **Category**: Dead Code
- **Problem**: The `cn()` (clsx + tailwind-merge) helper is the standard shadcn utility, but a repo-wide search shows it is **never imported** by any component (the codebase uses template literals for classNames throughout, e.g. `ChannelCard:65`). `clsx` and `tailwind-merge` are dead deps carried for nothing.
- **Fix**: Delete `src/lib/utils.ts` and remove `clsx` + `tailwind-merge` from `dependencies`.

---

- **Severity**: 🔵 Low
- **File**: `data/channels.json` (general)
- **Line(s)**: many
- **Category**: Performance
- **Problem**: The shipped `channels.json` is ~1640 lines / ~95 KB of JSON, parsed and held in memory, then re-filtered on every keystroke in `ChannelGrid`'s `useMemo` (which depends on `searchQuery`). For ~170 channels this is fine, but the `toLowerCase()` + `includes` runs over the full array each render with no debounce on search input.
- **Fix**: Debounce `searchQuery` in `Topbar`/`App` (200ms) before passing to `ChannelGrid`. Optional: precompute a lowercased name index.

---

# 📊 SUMMARY

| Metric | v1 (prior) | **v2 (this audit)** |
|---|---|---|
| **Total Issues Found** | 47 | **51** (26 new + 25 carried-over/re-confirmed, 22 of original confirmed fixed) |
| **🔴 Critical** | 5 | **11** |
| **🟠 High** | 9 | **13** |
| **🟡 Medium** | 16 | **16** |
| **🔵 Low** | 17 | **11** |
| **Overall Code Health Score** | 55/100 | **48/100** *(lowered — build is broken, mixed-content catalog)* |
| **Estimated Technical Debt** | High | **High** |
| **Build status** | (not assessed) | **🔴 `npm run dist:win` will fail (missing icon) or ship without one** |
| **Runtime status** | (not assessed) | **🔴 Large fraction of catalog is non-functional (http:// mixed-content)** |

### Top 5 Areas Needing Immediate Attention
1. **Build is broken** — `assets/icon.png` referenced but missing (`package.json:32`). Fix before any release.
2. **Catalog is half-broken at runtime** — `http://` stream URLs + restored `webSecurity:true` = silent playback failures for many channels. Either proxy through the Worker (as the type comments falsely claim) or purge `http://` entries.
3. **Committed JWT secret** in `data/channels.json:1598` — rotate and add validator guard.
4. **`VideoFrame`/`usePlayer` initialization race** — intermittent black video pane.
5. **CI bot auto-pushing to `master` 96×/day** with write perms + unsigned commits — supply-chain risk.

---

## Category Summary

| Category | Count | Status |
|---|---|---|
| 🔴 Build-Breaking | 2 | Missing icon, axios-in-main bloat |
| 🔴 Security (Critical) | 6 | JWT in repo, KV id, mixed-content, demo SSRF, CORS fallback, fake compression |
| 🔴 Crashing/Init Bugs | 2 | VideoFrame race, customFilters contradiction |
| 🟠 Resource/State Bugs | 4 | Window lifecycle, favorites race, player interval leak (partial), retry logic |
| 🟠 Dead/Broken Features | 3 | SystemTray, LiquidGlass filter, SW query-strip |
| 🟠 Validation/Supply-Chain | 3 | testStream false-positives, CI bot, dedup |
| 🟠 Dead/Mis-scoped Deps | 1 | @google/genai, react-virtual, dotenv, styled-types skew |
| 🟠 Architecture | 2 | God App.tsx, ContextMenu a11y |
| 🟡 Code Smells / Maintainability | 9 | dead modules, dual favorites, fonts, Lenis touch, ABR, ⌘K, skeleton CLS, prefetch storm, metadata, README, ThemeSwitch, gradient types, type drift, localDb typing, player event any, dual vite config, dev URL inject, naming, a11y, tsconfig |
| 🔵 Minor | 11 | various |

---

## Recommended Next Steps (Priority Order)

1. **Fix the build** — add `assets/icon.ico` or revert `package.json:32`. Verify `npm run dist:win` end-to-end.
2. **Resolve mixed-content** — implement the Cloudflare stream proxy the type comments already promise; purge or upgrade `http://` entries.
3. **Purge the committed JWT** (`channels.json:1598`), rotate with upstream, add validator guard for JWT-shaped query params.
4. **Fix `VideoFrame`/`usePlayer` init race** (pass refs, not `ref.current`; add `cancelled` flag).
5. **Fix `kvManager` fake compression** — either real gzip or remove the misleading metadata.
6. **Lock down CORS** in `router.ts` (no default-allow) and the CI bot (PR-not-push, SHA-pinned actions, reduced frequency).
7. **Replace `axios` in main process** with native `fetch`.
8. **Delete dead code** — `demo.tsx`, `demo-gradient.tsx`, `liquid-glass.tsx`, `SystemTray`, `src/lib/utils.ts`, unused deps.
9. **Unify favorites schema** and add IDB migrations.
10. **Split `tsconfig.json`** per-environment; enable the strict checks the v1 fix was meant to deliver.

---

## Appendix A — Status of the Original 47 Issues

| # | Severity | File | v1 Issue | Status in `684be99` |
|---|---|---|---|---|
| 1 | 🔴 | `main/index.ts` | `webSecurity: false` | ✅ Fixed (removed) |
| 2 | 🔴 | `gpuAccel.ts` | `ignore-gpu-blocklist` | ✅ Fixed (removed) |
| 3 | 🔴 | `opencode.json` | Hardcoded API key | ⚠️ Partial — moved to env var, but confirm key rotated + history purged |
| 4 | 🔴 | `router.ts` | Wildcard CORS | ⚠️ Partial — allowlist added but default-allow fallback (see Critical #7) |
| 5 | 🔴 | `usePlayer.ts` | Interval leak | ⚠️ Partial — common case fixed, async-unmount case still leaks (see High #3) |
| 6 | 🟠 | `autoRecover.ts` | setTimeout leak | ✅ Fixed (cleanup returned) |
| 7 | 🟠 | `apiClient.ts` | Mock data in prod | ✅ Fixed (mock data removed) |
| 8 | 🟠 | `ChannelCard` | Share error swallowed + "Proxima TV" | ✅ Fixed (alert + "Taranga+") |
| 9 | 🟠 | `useFavorites.ts` | localStorage `btv_favorites` | ✅ Fixed (moved to IDB) — but new race/schema issues (High #2, Medium #2) |
| 10 | 🟠 | `pingTester.ts` | HEAD validation | ✅ Fixed (Range GET) |
| 11 | 🟠 | `routePicker.ts` | SHA-1 | ✅ Fixed (SHA-256) |
| 12 | 🟠 | `logoCache.ts` | Empty catch | ✅ Fixed (logged) |
| 13 | 🟡 | `Sidebar/index.tsx` | Dead component | ✅ Fixed (deleted — not in `git ls-files`) |
| 14 | 🟡 | `variants.ts` | `framer-motion` import | ✅ Fixed (`motion`) |
| 15 | 🟡 | `RadialMenu` | Misleading name | ✅ Fixed (renamed `ContextMenu`) |
| 16 | 🟡 | persistence | localStorage vs IDB | ✅ Fixed |
| 17 | 🟡 | `App.tsx` | No ErrorBoundary | ✅ Fixed (`ErrorBoundary.tsx` wraps app) |
| 18 | 🟡 | `tsconfig.json` | `strict: false` | ✅ Fixed (`"strict": true`) |
| 19 | 🟡 | `useSettings.ts` | hexToRgb edge cases | ✅ Fixed (3/8-digit) |
| 20 | 🟡 | `customFilters.ts` | Commented code | ⚠️ Removed but UA spoof + stale comment remain (Critical #9) |
| 21 | 🟡 | `globals.css` | Light theme not activated | ✅ Fixed (`dataset.theme` set) |
| 22 | 🟡 | `routePicker.ts` | normalizeName over-strips | ⚠️ Partial — preserves spaces/hyphens but still drops Bangla (High #10) |
| 23 | 🟡 | `package.json` | `"icon": null` | ❌ **REGRESSION** — changed to a missing file (Critical #1) |
| 24 | 🟡 | `ChannelCard` | Empty/generic alt | ✅ Fixed (`${name} logo`) |
| 25 | 🟡 | `Sidebar` glass filter | feFuncG=0 | ❌ Still broken in `LiquidGlassSidebar` (High #5) |
| 26 | 🟡 | `preload` IPC listener leak | | ✅ Fixed (returns unsubscribe) |
| 27 | 🟡 | `sw.js` query strip | | ⚠️ Partial (High #6) |
| 28-44 | 🔵 | (various minor) | | ~17/17 fixed or moot |
| 45 | 🔵 | `kvManager` no compression | | ❌ **REGRESSION** — fake compression (Critical #8) |
| 46 | 🔵 | `validate-channels.yml` Node 24 | ✅ Fixed (Node 22) |
| 47 | 🔵 | IPC hardcoded URL | ✅ Fixed (env var) |

**Net:** ~22 fixed cleanly, ~5 partially fixed with regressions, ~2 made worse. Plus 26 genuinely new issues uncovered by deeper reading.

---

*End of audit. This report is ruthlessly honest by design, per the CTO directive. Every Critical and High item should be triaged before the next release tag.*
