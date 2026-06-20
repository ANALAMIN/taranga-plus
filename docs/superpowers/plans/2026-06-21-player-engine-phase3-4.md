# Player Engine & Catalog Delivery — Phase 3 & 4 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Overhaul the player engine to eliminate buffering issues through ABR retuning, multi-URL fallback, network adaptation, and a preload pipeline that doubles as the BDIX health checker. Complete the feature by passing the `lastValidated` timestamp to the UI.

**Architecture:** Modifies Shaka Player configuration and auto-recovery logic in `src/hooks/player-engine/`. Adds a new `preloadManager.ts` to prefetch channels on demand. `apiClient.ts` is updated to expose `lastValidated`.

**Spec:** `docs/superpowers/specs/2026-06-21-validation-curation-player-design.md` — this plan implements Phase 3 (Player Engine) and Phase 4 (Catalog Delivery).

---

## File Structure

**New files:**
- `src/hooks/player-engine/preloadManager.ts` — handles manifest prefetching and BDIX health checks.
- `src/services/localDb.ts` — simple indexedDB/localStorage wrapper for caching BDIX health results (if not already existing).

**Modified files:**
- `src/hooks/player-engine/timeShift.ts` — update buffer settings.
- `src/hooks/player-engine/abrManager.ts` — update ABR settings and network adaptations.
- `src/hooks/player-engine/autoRecover.ts` — implement multi-URL fallback.
- `src/hooks/player-engine/customFilters.ts` — inject `Host` header for BDIX hosts.
- `src/hooks/usePlayer.ts` — integrate new network adaptation events.
- `src/api/apiClient.ts` — pass `lastValidated` timestamp to frontend.
- `src/store/index.ts` (or relevant store) — handle `lastValidated` in state.

---

## Task 1: Buffer and ABR Retuning

Spec §6.2: Adjust aggressive rebuffering goals and add safe initial bandwidth estimates to prevent cold-start stalling.

**Files:**
- Modify: `src/hooks/player-engine/timeShift.ts`
- Modify: `src/hooks/player-engine/abrManager.ts`

- [ ] **Step 1: Update Buffer Configuration**

In `src/hooks/player-engine/timeShift.ts` (or where Shaka config is initialized), update `streaming` configuration:
```js
streaming: {
  rebufferingGoal: 2.0,      // was 0.5 — ride through short drops
  bufferingGoal: 30,         // was 40 — faster initial fill
  bufferBehind: 60,          // was 30 — keep more past buffer for seek-back
  safeSeekOffset: 30,        // (or safeInSeconds depending on Shaka version) was 60
  stallThreshold: 1
}
```

- [ ] **Step 2: Update ABR Configuration**

In `src/hooks/player-engine/abrManager.ts`:
```js
abr: {
  switchInterval: 10,        // was 8 — less thrash
  bandwidthUpgradeTarget: 0.85,
  bandwidthDowngradeTarget: 0.95,
  defaultBandwidthEstimate: 1000000   // 1 Mbps conservative cold start
}
```

- [ ] **Step 3: Cap initial variant by connection type**

If possible, in `abrManager.ts` or initialization, detect `navigator.connection.effectiveType`. If it's `'2g'` or `'slow-2g'`, restrict the initial variant to 480p or below by setting `defaultBandwidthEstimate` lower (e.g. `500000`).

- [ ] **Step 4: Commit**

```bash
git add src/hooks/player-engine/
git commit -m "feat(player): retune buffer and ABR to prevent micro-stalls"
```

---

## Task 2: Multi-URL Fallback in autoRecover

Spec §6.3: When a critical error occurs, do not reload the same dead URL. Try the next alternate URL in `channel.sources[]`.

**Files:**
- Modify: `src/hooks/player-engine/autoRecover.ts`
- Modify: `src/hooks/usePlayer.ts`

- [ ] **Step 1: Update `setupAutoRecovery` signature**

Modify `setupAutoRecovery` to accept an array of sources instead of a single string URL, or accept the full `ChannelFinal` object. 
```ts
export function setupAutoRecovery(player: shaka.Player, sources: string[]) { ... }
```

- [ ] **Step 2: Implement Fallback Logic**

In `autoRecover.ts`, track the `currentSourceIndex`. On an error event (like HTTP 403, 404, or timeout), increment the index. If `index < sources.length`, call `player.load(sources[index])`. If exhausted, trigger the error UI or stop.

- [ ] **Step 3: Wire in `usePlayer.ts`**

Update `usePlayer.ts`'s `setStream` function to accept the `channel` object or `sources[]` instead of just a URL string:
```ts
const setStream = useCallback(async (channel: ChannelFinal) => {
  // Use channel.sources[0] for the initial load
  // Pass channel.sources to setupAutoRecovery
});
```
Update all consumers of `setStream` (e.g., `useChannels.ts` or `Player` components) to pass the entire channel object.

- [ ] **Step 4: Commit**

```bash
git add src/hooks/player-engine/autoRecover.ts src/hooks/usePlayer.ts
git commit -m "feat(player): implement multi-URL fallback on stream error"
```

---

## Task 3: BDIX Host Header Injection

Spec §7.4: Inject `Host` headers for known BDIX domains via custom request filters.

**Files:**
- Modify: `src/hooks/player-engine/customFilters.ts`

- [ ] **Step 1: Implement Request Filter**

In `customFilters.ts`, add a Shaka request filter that intercepts manifest and segment requests.
```ts
player.getNetworkingEngine()?.registerRequestFilter((type, request) => {
  try {
    const url = new URL(request.uris[0]);
    if (url.hostname.includes('digijadoo.net')) {
      request.headers['Host'] = url.hostname;
    }
  } catch (e) {}
});
```

- [ ] **Step 2: Commit**

```bash
git add src/hooks/player-engine/customFilters.ts
git commit -m "feat(player): inject Host header for digijadoo BDIX streams"
```

---

## Task 4: Preload Manager & BDIX Health Check

Spec §6.4 & §7: Pre-fetch manifests for instant switching. For BDIX channels, this acts as the silent health check.

**Files:**
- Create: `src/hooks/player-engine/preloadManager.ts`
- Modify: Component where channels are listed (e.g., Channel List component)

- [ ] **Step 1: Create `preloadManager.ts`**

Implement a manager that queues channel preloads with a concurrency limit of 2.
Use `shaka.offline.Storage` or `fetch` for manifests.
```ts
export class PreloadManager {
  static queue: ChannelFinal[] = [];
  static active = 0;
  
  static push(channel: ChannelFinal) {
    // Add to queue, start processing if active < 2
    // If successful and channel.tier === 'bdix', cache result as healthy
    // If failed, cache result as dead
  }
}
```

- [ ] **Step 2: Local Cache for Health Results**

Implement caching (e.g., `localStorage` or IndexedDB wrapper) with a 30-min TTL so we don't re-probe already-checked BDIX channels.

- [ ] **Step 3: Integrate into UI**

In the channel list UI, trigger `PreloadManager.push(channel)` on mouse hover (`onMouseEnter`) or when a channel enters the viewport (IntersectionObserver).
For BDIX channels marked "dead" in the cache, optionally hide them or grey them out visually without showing spinners.

- [ ] **Step 4: Commit**

```bash
git add src/hooks/player-engine/preloadManager.ts
git commit -m "feat(player): add preload pipeline and silent BDIX health check"
```

---

## Task 5: Network Change Adaptation

Spec §6.5: Listen to `navigator.connection` and trigger ABR adjustments when network conditions shift.

**Files:**
- Modify: `src/hooks/usePlayer.ts`

- [ ] **Step 1: Add Event Listener**

In `usePlayer.ts`'s `useEffect`, check if `navigator.connection` exists. If so, add a `'change'` event listener.
```ts
if ('connection' in navigator) {
  const conn = navigator.connection as any;
  conn.addEventListener('change', handleNetworkChange);
}
```

- [ ] **Step 2: Handle Change**

In `handleNetworkChange`, if `effectiveType` downgrades (e.g., `'4g'` -> `'2g'`), use `player.configure` to update `defaultBandwidthEstimate` to a lower value and call `player.getVariantTracks()` to re-evaluate the active track to prevent stalling.

- [ ] **Step 3: Commit**

```bash
git add src/hooks/usePlayer.ts
git commit -m "feat(player): adapt ABR on navigator.connection changes"
```

---

## Task 6: Catalog Delivery — Expose `lastValidated`

Spec §8: Pass `lastValidated` from the GitHub-generated `channels.json` to the UI so users can see the catalog's freshness.

**Files:**
- Modify: `src/api/apiClient.ts`
- Modify: Settings component

- [ ] **Step 1: Expose Metadata**

Ensure `apiClient.ts` (or the IPC endpoint) parses the new `lastValidated` field from `channels.json`. Since we added `lastValidated` to `ChannelFinal` in Phase 1, it should automatically map if the JSON is parsed directly. If there is a root metadata object in `channels.json`, map it to state.

- [ ] **Step 2: Display in UI**

In the app's Settings menu or bottom bar, display "Last updated: [Time ago]". Use `date-fns` or standard `Intl.DateTimeFormat` to format `lastValidated`.

- [ ] **Step 3: Commit**

```bash
git add src/api/apiClient.ts
git commit -m "feat(catalog): expose lastValidated timestamp to UI"
```

---

## Done criteria for Phase 3 & 4

- [ ] Player correctly falls back to alternate URLs on error.
- [ ] BDIX channels load without CORS issues (due to Host header injection where applicable).
- [ ] Preload pipeline caches manifest and prevents UI freezing.
- [ ] Network downgrade correctly re-seeds the bandwidth estimate.
- [ ] "Last updated" time is visible in the Settings UI.
- [ ] No regressions in channel loading speed or video quality for stable connections.
