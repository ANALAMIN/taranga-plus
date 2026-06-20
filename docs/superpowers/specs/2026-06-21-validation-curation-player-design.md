# Taranga+ Premium — Validation, Curation & Player Engine Overhaul

**Date:** 2026-06-21
**Status:** Approved (awaiting implementation plan)
**Goal:** Turn Taranga+ into a zero-cost, premium-feel Windows IPTV app where every shown channel is guaranteed to play, playback never buffers, and the catalog covers BD/Hindi/English/Urdu across all categories (incl. foreign movies, music, sports, and Discovery/NatGeo documentaries).

---

## 1. Honest Constraints (read before building)

These are verified facts, not promises:

| Claim | Reality |
|---|---|
| "12,000–13,000 channels" | False. Current `channels.json` has **205**. The 4 sources in use yield ~4,000 raw, ~200 survive. |
| "Premium pay-TV free" (Star Sports live, IPL, Hotstar exclusive) | **Impossible free.** These are paid-only. Any free source is pirated and dies within days. |
| Toffee (Banglalink) as a source | **Verified dead.** `Gtajisan/Toffee-Auto-Update-Playlist` cookies expired Jan 2024; all channels return **403**. Reviving needs a live Toffee session + token refresh — reverse-engineering work, deferred to a later phase. |
| BDIX sources (digijadoo.net etc.) | Work **only from BD IPs**. GitHub Actions runners are in the US, so BDIX channels time out from the validator. Verified: 5/6 BDIX test channels timed out from US; 1 global-CDN channel (Sony Ten 1) passed. |
| Discovery / NatGeo premium feeds | Paid. Only FTA variants exist free. |
| "Zero buffering always" | Achievable for the catalog that passes validation, via ABR tuning + preload + multi-URL fallback. Not achievable for a channel that is genuinely down. |

**Legal:** BDIX pirate IPTV (digijadoo et al.) likely infringes copyright. This spec provides technical integration only; legal liability rests with the operator.

---

## 2. Architecture — Two-Tier Hybrid Validation

Because BDIX is BD-only and GitHub is US-only, no single validator can cover everything for free. The solution splits the work:

```
┌───────────────────────────────────────────────────────────────────┐
│  TIER 1 — GitHub Actions (US runner) · every 30 min               │
│  ─────────────────────────────────────────────────────────────    │
│  Sources: iptv-org (all categories) + Free-TV/IPTV (FAST)        │
│           + BDIX global-CDN subset (akamai/cloudfront/jio/zee5)   │
│  Test:    segment-level (download one real .ts) + retry 3x        │
│           + smart BD filter (country metadata)                    │
│  Output:  data/channels.json → PR → master (manual merge)         │
│  Guarantees: every international channel in the catalog plays.    │
├───────────────────────────────────────────────────────────────────┤
│  TIER 2 — Electron app (BD IP) · integrated into prefetch         │
│  ─────────────────────────────────────────────────────────────    │
│  Sources: BDIX BD-only subset (digijadoo + raw BD IPs)            │
│  Test:    no separate step — liveness is a byproduct of the       │
│           preload pipeline (same prefetch used for instant        │
│           channel switching). Runs off-thread, on-demand.         │
│  Output:  dead BDIX channels silently removed; alternates from    │
│           sources[] used as fallback. User never sees validation. │
│  Guarantees: BDIX channels that work from BD show up; dead ones   │
│              never reach a click. Catalog renders instantly.      │
└───────────────────────────────────────────────────────────────────┘
```

**Why this honors "no app validation":** the user rejected UX-destroying validation (blocking spinners, "validating 1000 channels" waits, freezes). Tier 2 has **none** of that — it is structurally identical to prefetch-for-instant-switching, a premium feature, not a tax. See §7 for the full design.

---

## 3. Data Model Changes

The `ChannelFinal` type gains fields the new logic needs. The frontend `src/types/index.ts` and backend `src/types/index.ts` both change (hand-aligned until a shared package exists).

```ts
export type Category =
  | 'all' | 'favorites' | 'sports' | 'movies' | 'music'
  | 'entertainment' | 'kids' | 'documentary';

export type Language = 'bn' | 'hi' | 'en' | 'ur' | 'other';
export type Tier = 'global' | 'bdix';   // which validation tier owns it

export interface ChannelFinal {
  id: string;             // SHA-256(normalized name) first 16 hex
  name: string;
  logoUrl: string;
  streamUrl: string;      // raw upstream; renderer rewrites http:// via proxy
  category: Category;
  latencyMs: number;
  language: Language;     // NEW — drives language filter
  tier: Tier;             // NEW — global (Tier-1) or bdix (Tier-2)
  sources: string[];      // NEW — alternate working URLs (multi-URL fallback)
  lastValidated: string;  // NEW — ISO timestamp of last passing test
}
```

**Migration:** existing `channels.json` rows lack the new fields. The Tier-1 script back-fills them on first run (`language` inferred from name/country, `tier='global'`, `sources=[streamUrl]`). No breaking change to the player.

---

## 4. Source Curation (Phase 1)

### 4.1 Source registry

Replace the hardcoded 4-source array with a versioned registry. Each source declares its **tier** (global/bdix) so the validator routes it correctly.

```
GLOBAL (Tier 1, validated by GitHub):
  iptv-org/countries/bd.m3u
  iptv-org/countries/in.m3u
  iptv-org/categories/sports.m3u
  iptv-org/categories/movies.m3u
  iptv-org/categories/documentary.m3u
  iptv-org/categories/music.m3u
  iptv-org/categories/kids.m3u
  iptv-org/categories/entertainment.m3u
  Free-TV/IPTV/playlist.m3u8            (Pluto/Plex/Samsung FAST — curated, legal)
  Doordarshan official streams          (DD National/News/Sports — legal FTA)

BDIX (Tier 2, validated in-app):
  Shadmanislam/bdiptv "BD IPTV.m3u"     (1,031 channels; verified fetchable)
  → split at runtime: global-CDN hosts → also feed Tier 1;
                      BD-only hosts (digijadoo, raw 103.x IPs) → Tier 2 only
```

### 4.2 Host classification

A static rule tags each stream URL as `global` or `bdix`:

- **global:** hostname matches known global CDNs (`*.akamaized.net`, `*.cloudfront.net`, `*.akamaihd.net`, `jio.ril.com`, `z5amshls.akamaized.net`, public iptv-org hosts, Free-TV hosts)
- **bdix:** everything else — `digijadoo.net`, `kitv.live`, raw `103.x`/`45.x`/`182.x` BDISP IPs, `jagobd.com`, etc.

Global-tagged BDIX URLs are *also* validated in Tier 1 (best of both). BD-only URLs are validated only in Tier 2.

### 4.3 Language filter

Allowed: `bn`, `hi`, `en`, `ur`. **Dropped:** Tamil, Telugu, Malayalam, Kannada, Punjabi, Marathi, and other regional Indian languages.

Detection (in priority order):
1. `tvg-language` M3U attribute when present.
2. Channel-name heuristics: Bengali Unicode range `\u0980-\u09FF` → `bn`; Tamil `\u0B80-\u0BFF` / Telugu `\u0C00-\u0C7F` / Malayalam `\u0D00-\u0D7F` → rejected.
3. Latin-script name keywords: DD/Doordarshan → `hi`; BBC/CNN/Sky/RT/Al Jazeera/France24 → `en`; Geo/ARY/Hum/PTV → `ur`; rest → `en` default for global, `bn` default for bdix.

### 4.4 Category mapping (tightened)

Current `mapCategory` is loose. New rules, in order:
- sports, movie/cinema/film, music/gaan, kid/child/cartoon/duronto, doc/nature/discovery/natgeo/geo/wild, entertain/general/natore, news/bangla→`all`.
- Explicit Discovery/NatGeo keywords → `documentary` (not `all`), to populate the currently empty documentary category.

---

## 5. Tier-1 Validation Engine (Phase 2 — the core rewrite)

Rewrites `.github/scripts/validate-channels.mjs`. Structure stays a single Node ESM script so GitHub Actions needs no build step.

### 5.1 Per-channel test pipeline

For each candidate channel, run in order; fail any → mark dead:

1. **Secret URL rejection** (keep current `looksLikeSecretUrl`).
2. **HTTP probe** — `GET` with `Range: bytes=0-1023`, 4 s timeout, browser UA.
3. **Status gate** — accept `2xx` or `206` only.
4. **Content-type gate** — require one of `mpegurl`, `x-mpegurl`, `apple`, `video/`, `octet-stream`, `dash`, `xml`. (Current.)
5. **Manifest magic** — for HLS, body must start with `#EXTM3U`. (Current.)
6. **NEW — Segment integrity test.** Parse the manifest. If it is a master playlist (multiple variants), resolve the **lowest-bandwidth variant's** media playlist (deterministic, cheapest to fetch). From that media playlist, take the **first** segment URL and fetch it with `Range: bytes=0-65535`. Accept only if the segment returns `2xx`/`206` with a media content-type. This is the single biggest accuracy improvement: it catches "manifest alive, video dead" — the root cause of dead catalog entries.
7. **NEW — Retry ×3 with exponential backoff** (400 ms × 2^n, jittered) on transient failures (network/timeout/5xx). A channel must fail *all* attempts to be marked dead. Kills flaky false-negatives.
8. **Latency** — wall-clock of the final passing attempt.

### 5.2 Smart BD filter

To cut US-validates-but-BD-blocks channels before they reach the user:

- Drop iptv-org channels whose `tvg-country` is a non-SAARC, non-target state with no global CDN and no BDIX mirror (e.g., US-only local affiliates, pure-EU regional channels).
- Keep anything on a global CDN regardless of declared country (CDNs aren't geo-bound to the declared country).
- This is heuristic and conservative: when uncertain, keep the channel and let Tier 2 / player fallback handle it.

### 5.3 Multi-URL deduplication

`pickBestRoutes` changes from "keep one fastest URL per name" to "keep **all** passing URLs per name, sorted by latency." The primary `streamUrl` is the fastest; the rest populate `sources[]` for player fallback (see §6.3). One name → one catalog entry, but N backup routes.

### 5.4 Concurrency & cadence

- Batch size stays 50 (memory-safe), but the segment test adds load — raise per-batch timeout budget.
- Workflow cron: `0 * * * *` → `*/30 * * * *` (twice hourly). A single run may take several minutes; that's acceptable per the user ("time is not a concern, quality is").
- PR-based delivery unchanged (no direct master push).

### 5.5 Output & reporting

- `data/channels.json` with the new fields.
- Workflow summary prints: raw count → secret-rejected → dead (by reason) → alive → final after dedup, so the PR diff is auditable.

---

## 6. Player Engine Upgrade (Phase 3)

### 6.1 Root-cause of current buffering

From reading `abrManager.ts`, `timeShift.ts`, `autoRecover.ts`, `usePlayer.ts`:

| Cause | Detail |
|---|---|
| `rebufferingGoal: 0.5s` | Too aggressive — any micro-drop triggers rebuffer instead of riding through buffered data. |
| `bufferingGoal: 40s` | Large goal on a cold start over a slow link causes a long initial fill. |
| `switchInterval: 8s` | Fine, but ABR can still thrash on spiky networks. |
| Bandwidth seed from Network Info API | A wrong hint jumps straight to 1080p and rebuffers. |
| No preload | Every channel switch is a cold load. |
| Single-URL recovery | `autoRecover` reloads the *same* dead URL 3× instead of trying an alternate route. |

### 6.2 Buffer & ABR retune

New `timeShift.ts` / `abrManager.ts` values:

```
streaming:
  rebufferingGoal: 2.0      // was 0.5 — ride through short drops
  bufferingGoal: 30         // was 40 — faster initial fill
  bufferBehind: 60          // was 30 — keep more past buffer for seek-back
  safeInSeconds: 30         // was 60 — stay nearer the live edge
  stallThreshold: 1
abr:
  switchInterval: 10        // was 8 — less thrash
  bandwidthUpgradeTarget: 0.85
  bandwidthDowngradeTarget: 0.95
  defaultBandwidthEstimate: 1_000_000   // 1 Mbps conservative cold start
```

Also: cap initial variant by `connection.effectiveType` — never start above 480p on `2g`/`slow-2g`.

### 6.3 Multi-URL fallback (uses `sources[]`)

`autoRecover.ts` rewrite: on CRITICAL error, instead of reloading the same URL, try the **next** entry in `channel.sources[]`. Only after all sources are exhausted does it surface the error UI. Silent to the user.

### 6.4 Channel preload pipeline (also drives BDIX health — see §7)

New `preloadManager.ts`: when a channel is focused/hovered or is near the viewport, warm its manifest into Shaka's prefetch cache so the actual switch is near-instant. Bounded to **2 concurrent preloads** to protect bandwidth.

For BDIX channels (`tier:'bdix'`), the prefetch result doubles as the silent liveness check described in §7 — a single fetch serves both purposes (instant-switch + health). No separate probe loop exists.

### 6.5 Network-change adaptation

Listen to `navigator.connection` `change` events; on a detected up/down shift, re-seed the ABR bandwidth estimate so the player re-selects quality instead of stalling.

### 6.6 No theme / day-night changes

Per user instruction: the existing theme and the day/night toggle are **untouched**.

---

## 7. BDIX Handling — Prefetch-Integrated Health Check (Phase 2.5)

BDIX channels cannot be validated by the US GitHub runner (BD-only servers). Instead of a separate, visible "validation" step (which the user rejected as janky UX), BDIX liveness is handled as a **byproduct of the preload pipeline** — the same mechanism premium apps (Netflix, YouTube) use for instant seek. There is no separate validation code path the user ever encounters.

### 7.1 Architecture

```
GitHub (Tier 1) → data/channels.json:  global channels  (validated, guaranteed)
                                       + BDIX channels   (included unvalidated,
                                                          tagged tier:'bdix')

App launch:
  1. Catalog renders INSTANTLY with all channels (global + bdix).
     No spinner, no waiting.
  2. preloadManager runs in a Web Worker, off the main thread.
  3. As the user scrolls/hovers, each BDIX channel's manifest is prefetched
     (this already happens for instant switching — §6.4).
  4. The prefetch result doubles as a silent health check:
        - 2xx + #EXTM3U  → healthy (stays in catalog)
        - fail / dead    → silently removed from the visible list,
                           OR demoted behind a working source[] alternate
  5. The user never observes this — only ever sees channels that respond.
```

### 7.2 Why this satisfies "no app validation"

The user's objection was to UX-destroying validation: blocking spinners, "validating 1000 channels... 30s" waits, freezes. This design has **none of that**:
- Catalog shows instantly on launch (Tier-1 channels render immediately).
- Health checks happen **off-thread** (Web Worker) and **on-demand** (only for channels near the viewport), never as a bulk upfront pass.
- No channel is ever blocked from display pending a check; BDIX channels appear immediately and are *removed* only if proven dead during prefetch.
- This is structurally identical to prefetch-for-instant-switching — a feature, not a tax.

### 7.3 Failure handling (graceful, multi-layered)

Even if a BDIX channel slips through dead (e.g. user clicks before prefetch completes), the player degrades gracefully instead of showing a hard error:
1. **Multi-URL fallback** (§6.3): try the next URL in `channel.sources[]`. digijadoo channels usually have alternates.
2. Only if *all* sources fail: a soft "channel temporarily unavailable" state with a one-tap retry — never a crash or a blank frozen screen.

### 7.4 Per-channel Host header

BDIX channels on digijadoo may require a `Host` header to resolve correctly. The request-filter seam already stubbed in `customFilters.ts` now has its first concrete use: inject `Host` (and only `Host`) for known BDIX hosts. No UA spoofing, no other header games.

### 7.5 Local cache

Prefetch/health results cached in `localDb` keyed by channel id, TTL 30 min, so re-scrolling doesn't re-hit the network. Refresh invalidates.

---

## 8. Catalog Delivery (Phase 4 — minor)

`apiClient.ts` path stays (IPC → Worker → GitHub raw fallback). Changes:
- Pass `lastValidated` through so the UI can show a "catalog age" hint in settings (not a blocker).
- The Worker `/channels` endpoint serves the merged Tier-1 catalog as today; BDIX merge happens client-side in-app.

---

## 9. Implementation Phases & Order

```
Phase 1 — Source Curation
  1.1 Source registry + tier tagging
  1.2 Host classifier (global vs bdix)
  1.3 Language filter (bn/hi/en/ur; drop Tamil etc.)
  1.4 Tightened category mapping (Discovery→documentary)
  1.5 Data-model migration (new ChannelFinal fields, back-fill)

Phase 2 — Tier-1 Validation Engine
  2.1 Segment integrity test
  2.2 Retry ×3 + backoff
  2.3 Smart BD filter
  2.4 Multi-URL dedup (sources[])
  2.5 30-min cadence
  2.6 Reporting summary in workflow

Phase 2.5 — BDIX Health via Prefetch (no separate probe)
  2.7 preloadManager drives BDIX liveness (merged into §6.4, not a loop)
  2.8 Silent removal of dead BDIX channels from the visible list
  2.9 Per-channel Host-header injection for digijadoo
  2.10 localDb cache of health results (30 min TTL)

Phase 3 — Player Engine
  3.1 Buffer/ABR retune
  3.2 Multi-URL fallback in autoRecover
  3.3 Preload pipeline
  3.4 Network-change adaptation

Phase 4 — Catalog Delivery (minor)
  4.1 lastValidated passthrough + settings hint
```

Build order is deliberate: curation → validation → app probe → player → delivery. Bad sources can't be validated well; a great player over a dead catalog still looks broken.

---

## 10. Out of Scope (explicitly deferred)

- **Toffee integration** — needs a live-session authenticator + token refresh. Separate later phase if the user still wants it after seeing the BDIX result.
- **BD VPS / self-hosted runner** — zero-cost mandate rules it out for now; design degrades gracefully (BDIX handled by Tier 2).
- **Theme / day-night toggle / UI redesign** — frozen by user instruction.
- **Shared types package** — keep hand-aligned `src/types` ↔ `backend/src/types`; refactor later.
- **Premium pay-TV** (Star Sports live, IPL, Hotstar exclusive) — not achievable free; out of scope forever unless a paid source is introduced.

---

## 11. Success Criteria

1. Every channel in the rendered catalog plays a real video segment on first click (segment-level validation).
2. Catalog grows from 205 toward **300–500 reliably-working** channels across all categories, with a non-empty `documentary` set.
3. Language filter excludes Tamil/Telugu/Malayalam; catalog is bn/hi/en/ur only.
4. BDIX channels that work from BD appear; dead ones are silently removed during prefetch (no user-visible validation, no spinners, catalog renders instantly).
5. Measurable buffering reduction on channel switch and on network spikes (preload + ABR retune + multi-URL fallback).
6. Validation cadence is 30 min; delivery remains PR-based, never direct master push.
7. Zero recurring cost.
