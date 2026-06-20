# Validation Engine Overhaul — Phase 1 & 2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the 4-source, manifest-only validator with a multi-source, segment-level, retrying, multi-URL-deduplicating Tier-1 validation engine that runs twice hourly on GitHub Actions and ships a richer `channels.json`.

**Architecture:** Rewrite `.github/scripts/validate-channels.mjs` into a modular Node ESM script. Pure functions (no I/O) live in `.github/scripts/lib/*.mjs` so they are unit-testable with Node's built-in test runner (`node:test`). The GitHub Actions workflow `cron` changes to twice-hourly. Data-model types in `src/types/index.ts` and `backend/src/types/index.ts` gain `language`, `tier`, `sources`, `lastValidated` fields (hand-aligned). This plan covers Phase 1 (Source Curation) and Phase 2 (Tier-1 Validation) only — Phase 2.5 (BDIX prefetch) and Phase 3 (Player) are separate plans.

**Tech Stack:** Node 22 ESM, `node:test` + `node:assert` (built-in, no deps), GitHub Actions, TypeScript (types only). The validator script is plain JS so Actions needs no build step.

**Spec:** `docs/superpowers/specs/2026-06-21-validation-curation-player-design.md` — this plan implements §3 (data model), §4 (curation), §5 (Tier-1 engine).

---

## File Structure

**New files (validator — plain `.mjs`, no build):**
- `.github/scripts/validate-channels.mjs` — entry point; orchestrates fetch → filter → validate → dedup → write. (Rewrite of existing.)
- `.github/scripts/lib/sources.mjs` — source registry (the global/bdix source list) + host classifier (`classifyHost`).
- `.github/scripts/lib/language.mjs` — language detection (`detectLanguage`) + accept/reject filter.
- `.github/scripts/lib/category.mjs` — `mapCategory` (tightened, Discovery→documentary).
- `.github/scripts/lib/m3u.mjs` — `parseM3U(content, sourceId)` returning `ChannelRaw[]`.
- `.github/scripts/lib/segmentTest.mjs` — HLS manifest/segment resolution + integrity test.
- `.github/scripts/lib/secrets.mjs` — `looksLikeSecretUrl` (moved out of the monolith).
- `.github/scripts/lib/dedupe.mjs` — `pickBestRoutes` (multi-URL: one entry, `sources[]` sorted by latency).
- `.github/scripts/lib/report.mjs` — builds the workflow summary string.

**New files (tests):**
- `.github/scripts/lib/__tests__/sources.test.mjs`
- `.github/scripts/lib/__tests__/language.test.mjs`
- `.github/scripts/lib/__tests__/category.test.mjs`
- `.github/scripts/lib/__tests__/m3u.test.mjs`
- `.github/scripts/lib/__tests__/segmentTest.test.mjs`
- `.github/scripts/lib/__tests__/secrets.test.mjs`
- `.github/scripts/lib/__tests__/dedupe.test.mjs`

**Modified files:**
- `src/types/index.ts` — add `Language`, `Tier`, new `ChannelFinal` fields.
- `backend/src/types/index.ts` — mirror the above (hand-aligned per spec §3).
- `.github/workflows/validate-channels.yml` — cron `0 * * * *` → `*/30 * * * *`; add a test step.
- `package.json` — add `"test": "node --test .github/scripts/lib/__tests__/"` script.

**Deleted:** none. The old monolithic functions in `validate-channels.mjs` are replaced module-by-module.

---

## Task 1: Data model — add new types (frontend)

This task is pure type changes. No runtime code depends on the new fields yet (they're optional on read), so nothing breaks. Tests for the validator (plain JS) don't need these types, but the catalog ships them, so we define them first.

**Files:**
- Modify: `src/types/index.ts`

- [ ] **Step 1: Add the new type unions and extend `ChannelFinal`**

Open `src/types/index.ts`. After the existing `Category` type, add:

```ts
export type Language = 'bn' | 'hi' | 'en' | 'ur' | 'other';
export type Tier = 'global' | 'bdix';   // which validation tier owns it
```

Replace the existing `ChannelFinal` interface with:

```ts
export interface ChannelFinal {
  id: string;             // SHA-256(normalized name) first 16 hex
  name: string;
  logoUrl: string;
  // As stored, this is the raw upstream URL. At playback time the renderer
  // rewrites http:// sources to route through the Worker /proxy/stream endpoint
  // to avoid mixed-content blocks under webSecurity:true.
  streamUrl: string;
  category: Category;
  latencyMs: number;
  language: Language;     // NEW — drives language filter (bn/hi/en/ur)
  tier: Tier;             // NEW — 'global' = Tier-1 validated, 'bdix' = app-side
  sources: string[];      // NEW — alternate working URLs (multi-URL fallback)
  lastValidated: string;  // NEW — ISO timestamp of last passing test
}
```

- [ ] **Step 2: Verify the renderer still type-checks**

Run: `npm run lint`
Expected: PASS (existing code reads `ChannelFinal` but doesn't reference the new fields yet — they're additions, not removals).

If lint fails because some code accesses a removed field, it means a field was renamed, not added — re-check the diff and fix the consumer. Expected here: no failures.

- [ ] **Step 3: Commit**

```bash
git add src/types/index.ts
git commit -m "feat(types): add language/tier/sources/lastValidated to ChannelFinal (frontend)"
```

---

## Task 2: Data model — mirror to backend types

Keep the two type modules hand-aligned (spec §3 notes a shared package is future work).

**Files:**
- Modify: `backend/src/types/index.ts`

- [ ] **Step 1: Apply the same additions to the backend mirror**

Open `backend/src/types/index.ts`. After its existing `Category` type, add the same unions:

```ts
export type Language = 'bn' | 'hi' | 'en' | 'ur' | 'other';
export type Tier = 'global' | 'bdix';
```

Replace its `ChannelFinal` interface with the same shape as the frontend (same field list, same comments trimmed to the backend's style). The backend's `ChannelRaw` already has `sourceId`; leave it as-is.

- [ ] **Step 2: Verify backend type-checks**

Run: `npx tsc --noEmit -p backend/tsconfig.json` (if a backend tsconfig exists) OR `npm run lint`
Expected: PASS.

If there is no backend tsconfig and `npm run lint` doesn't cover it, skip this verification but note it — the backend types are consumed by the Cloudflare Worker which is built separately; the change is additive.

- [ ] **Step 3: Commit**

```bash
git add backend/src/types/index.ts
git commit -m "feat(types): mirror new ChannelFinal fields in backend types"
```

---

## Task 3: Set up the test runner

Add a `test` script so TDD steps have a command to run. Node's built-in `node:test` needs no dependency.

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Add the test script**

In `package.json`, inside `"scripts"`, add:

```json
"test": "node --test .github/scripts/lib/__tests__/"
```

Place it after the `"lint"` entry. Do not change any other script.

- [ ] **Step 2: Verify the runner works with an empty directory**

Create the directory so the glob isn't empty, with a placeholder test:

```bash
mkdir -p .github/scripts/lib/__tests__
```

Create `.github/scripts/lib/__tests__/_smoke.test.mjs`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';

test('smoke: node:test runner is wired up', () => {
  assert.equal(1 + 1, 2);
});
```

Run: `npm test`
Expected: 1 test passing, 0 failing.

- [ ] **Step 3: Commit**

```bash
git add package.json .github/scripts/lib/__tests__/_smoke.test.mjs
git commit -m "chore: add node:test runner with smoke test"
```

---

## Task 4: M3U parser module (extract + TDD)

Extract `parseM3U` from the monolith into a pure, testable module. Behavior matches the existing parser; we're just isolating it.

**Files:**
- Create: `.github/scripts/lib/m3u.mjs`
- Test: `.github/scripts/lib/__tests__/m3u.test.mjs`

- [ ] **Step 1: Write the failing test**

Create `.github/scripts/lib/__tests__/m3u.test.mjs`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseM3U } from '../m3u.mjs';

const SAMPLE = `#EXTM3U
#EXTINF:-1 tvg-logo="https://img/x.png" group-title="Sports",Sony Ten 1
http://example.com/sony.m3u8
#EXTINF:-1 tvg-logo="https://img/y.png" group-title="News",Somoy TV
https://cdn.example.com/somoy.m3u8
#EXTINF:-1 tvg-language="ben" tvg-country="BD",ATN News
http://bdix/113.m3u8
`;

test('parseM3U extracts name, url, logo, category, language, country', () => {
  const channels = parseM3U(SAMPLE, 'src1');
  assert.equal(channels.length, 3);

  assert.deepEqual(channels[0], {
    sourceId: 'src1',
    logo: 'https://img/x.png',
    category: 'Sports',
    language: undefined,
    country: undefined,
    name: 'Sony Ten 1',
    url: 'http://example.com/sony.m3u8',
  });

  assert.equal(channels[2].language, 'ben');
  assert.equal(channels[2].country, 'BD');
  assert.equal(channels[2].name, 'ATN News');
});

test('parseM3U skips URL lines without a preceding EXTINF', () => {
  const noExtInf = '#EXTM3U\nhttp://orphan.m3u8\n';
  assert.deepEqual(parseM3U(noExtInf, 's'), []);
});

test('parseM3U handles missing logo and category gracefully', () => {
  const minimal = '#EXTINF:-1,Bare Channel\nhttp://x/y.m3u8\n';
  const [ch] = parseM3U(minimal, 's');
  assert.equal(ch.logo, undefined);
  assert.equal(ch.category, undefined);
  assert.equal(ch.name, 'Bare Channel');
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test`
Expected: FAIL — `Cannot find module '.../m3u.mjs'`.

- [ ] **Step 3: Implement `parseM3U`**

Create `.github/scripts/lib/m3u.mjs`:

```js
/**
 * Parse an M3U playlist into ChannelRaw objects.
 *
 * Supports tvg-logo, group-title, tvg-language, tvg-country attributes. A
 * stream URL must follow a #EXTINF line to be included (orphan URLs are
 * dropped). Uses regex on each EXTINF line (cheap, no full M3U parser dep).
 *
 * @param {string} content
 * @param {string} sourceId
 * @returns {Array<{sourceId:string, logo?:string, category?:string, language?:string, country?:string, name:string, url:string}>}
 */
export function parseM3U(content, sourceId) {
  const lines = content.split('\n');
  const channels = [];
  let current = null;

  for (const raw of lines) {
    const line = raw.trim();
    if (line.startsWith('#EXTINF:')) {
      current = { sourceId };
      const logoMatch = line.match(/tvg-logo="([^"]+)"/);
      if (logoMatch) current.logo = logoMatch[1];
      const groupMatch = line.match(/group-title="([^"]+)"/);
      if (groupMatch) current.category = groupMatch[1];
      const langMatch = line.match(/tvg-language="([^"]+)"/);
      if (langMatch) current.language = langMatch[1];
      const countryMatch = line.match(/tvg-country="([^"]+)"/);
      if (countryMatch) current.country = countryMatch[1];
      const nameIdx = line.lastIndexOf(',');
      if (nameIdx !== -1) current.name = line.substring(nameIdx + 1).trim();
    } else if (line.startsWith('http') && current?.name) {
      current.url = line;
      channels.push(current);
      current = null;
    }
  }
  return channels;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test`
Expected: all m3u tests PASS (plus the smoke test).

- [ ] **Step 5: Commit**

```bash
git add .github/scripts/lib/m3u.mjs .github/scripts/lib/__tests__/m3u.test.mjs
git commit -m "feat(validator): extract parseM3U into testable module"
```

---

## Task 5: Secrets filter module (extract + TDD)

Move `looksLikeSecretUrl` out of the monolith unchanged, with tests covering the documented patterns.

**Files:**
- Create: `.github/scripts/lib/secrets.mjs`
- Test: `.github/scripts/lib/__tests__/secrets.test.mjs`

- [ ] **Step 1: Write the failing test**

Create `.github/scripts/lib/__tests__/secrets.test.mjs`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { looksLikeSecretUrl } from '../secrets.mjs';

test('rejects JWT-shaped query value', () => {
  const url = 'https://cdn.example.com/s.m3u8?token=eyJhbGciOi.eyJzdWIiOiIx.SflKxwRJ';
  assert.equal(looksLikeSecretUrl(url), true);
});

test('rejects akes/token/key/sig query keys', () => {
  assert.equal(looksLikeSecretUrl('https://x/s.m3u8?akes=abc'), true);
  assert.equal(looksLikeSecretUrl('https://x/s.m3u8?mytoken=abc'), true);
  assert.equal(looksLikeSecretUrl('https://x/s.m3u8?apikey=abc'), true);
  assert.equal(looksLikeSecretUrl('https://x/s.m3u8?sig=abc'), true);
});

test('allows a clean URL with no secrets', () => {
  assert.equal(looksLikeSecretUrl('https://cdn.example.com/sony.m3u8'), false);
  assert.equal(looksLikeSecretUrl('http://103.205.133.14:8080/live/1.m3u8'), false);
});

test('allows non-secret query params', () => {
  assert.equal(looksLikeSecretUrl('https://x/s.m3u8?quality=720p&cdn=us'), false);
});

test('returns false on invalid URL strings', () => {
  assert.equal(looksLikeSecretUrl('not-a-url'), false);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test`
Expected: FAIL — `Cannot find module '.../secrets.mjs'`.

- [ ] **Step 3: Implement `looksLikeSecretUrl`**

Create `.github/scripts/lib/secrets.mjs`:

```js
/**
 * Reject URLs that carry committed secrets in the query string. Catches the
 * `?akes=` (JWT bearer) pattern and JWT-shaped query values generally, so a
 * leaked signed token can never be baked back into the catalog. Never silently
 * strip — reject, so the source of the leak surfaces during validation.
 *
 * @param {string} url
 * @returns {boolean}
 */
export function looksLikeSecretUrl(url) {
  try {
    const u = new URL(url);
    for (const [key, value] of u.searchParams.entries()) {
      const lk = key.toLowerCase();
      if (lk === 'akes' || lk.includes('token') || lk.includes('key') || lk.includes('sig')) {
        return true;
      }
      // Three base64url chunks separated by dots = JWT (eyJ...).eyJ....
      if (/^eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(value)) {
        return true;
      }
    }
    return false;
  } catch {
    return false;
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test`
Expected: all secrets tests PASS.

- [ ] **Step 5: Commit**

```bash
git add .github/scripts/lib/secrets.mjs .github/scripts/lib/__tests__/secrets.test.mjs
git commit -m "feat(validator): extract looksLikeSecretUrl into testable module"
```

---

## Task 6: Language detection module (extract + TDD)

Spec §4.3: allowed `bn`, `hi`, `en`, `ur`; drop Tamil/Telugu/Malayalam/Kannada/Punjabi/Marathi.

**Files:**
- Create: `.github/scripts/lib/language.mjs`
- Test: `.github/scripts/lib/__tests__/language.test.mjs`

- [ ] **Step 1: Write the failing test**

Create `.github/scripts/lib/__tests__/language.test.mjs`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { detectLanguage, isLanguageAllowed } from '../language.mjs';

test('tvg-language attribute wins when present', () => {
  assert.equal(detectLanguage({ language: 'ben', name: 'Foo' }), 'bn');
  assert.equal(detectLanguage({ language: 'hin', name: 'Foo' }), 'hi');
  assert.equal(detectLanguage({ language: 'eng', name: 'Foo' }), 'en');
  assert.equal(detectLanguage({ language: 'urd', name: 'Foo' }), 'ur');
});

test('tvg-language attribute with multi-value prefers first allowed', () => {
  assert.equal(detectLanguage({ language: 'ben;eng', name: 'ATN' }), 'bn');
});

test('Bengali Unicode name → bn', () => {
  assert.equal(detectLanguage({ name: 'এটিএন নিউজ' }), 'bn');
});

test('Tamil Unicode name → rejected language', () => {
  // Tamil U+0B80-U+0BFF
  assert.equal(detectLanguage({ name: 'சன் டிவி' }), 'tam');
});

test('Telugu/Malayalam Unicode names → rejected', () => {
  assert.equal(detectLanguage({ name: 'జెమిని' }), 'tel'); // Telugu U+0C00-U+0C7F
  assert.equal(detectLanguage({ name: 'ഏഷ്യനെറ്റ്' }), 'mal'); // Malayalam U+0D00-U+0D7F
});

test('Latin keywords map correctly', () => {
  assert.equal(detectLanguage({ name: 'DD National' }), 'hi');
  assert.equal(detectLanguage({ name: 'BBC World News' }), 'en');
  assert.equal(detectLanguage({ name: 'Geo News' }), 'ur');
  assert.equal(detectLanguage({ name: 'ARY Digital' }), 'ur');
});

test('isLanguageAllowed keeps bn/hi/en/ur, drops others', () => {
  assert.equal(isLanguageAllowed('bn'), true);
  assert.equal(isLanguageAllowed('hi'), true);
  assert.equal(isLanguageAllowed('en'), true);
  assert.equal(isLanguageAllowed('ur'), true);
  assert.equal(isLanguageAllowed('tam'), false);
  assert.equal(isLanguageAllowed('tel'), false);
  assert.equal(isLanguageAllowed('mal'), false);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement language detection**

Create `.github/scripts/lib/language.mjs`:

```js
/**
 * Language detection and filtering (spec §4.3).
 *
 * Allowed in catalog: bn, hi, en, ur. Dropped: Tamil, Telugu, Malayalam,
 * Kannada, Punjabi, Marathi, and other regional Indian languages.
 */

// M3U tvg-language codes (often ISO 639-2/3) → our short codes.
// Non-identifier keys MUST be quoted.
const LANG_CODE = {
  ben: 'bn', 'ben_(bangla)': 'bn', bang: 'bn', bengali: 'bn',
  hin: 'hi', hindi: 'hi',
  eng: 'en', english: 'en',
  urd: 'ur', urdu: 'ur',
};

// Unicode block → rejected-language code. These are the ones we DROP.
const REJECTED_BLOCKS = [
  ['\u0B80', '\u0BFF', 'tam'], // Tamil
  ['\u0C00', '\u0C7F', 'tel'], // Telugu
  ['\u0D00', '\u0D7F', 'mal'], // Malayalam
  ['\u0C80', '\u0CFF', 'kan'], // Kannada
  ['\u0A00', '\u0A7F', 'pan'], // Punjabi (Gurmukhi)
  ['\u0900', '\u097F', null],  // Devanagari → not rejected (Hindi/Marathi both use it; resolved by keyword)
];

// Bengali block kept (allowed).
const BENGALI_RANGE = ['\u0980', '\u09FF'];

function inRange(ch, lo, hi) {
  return ch >= lo && ch <= hi;
}

/**
 * @param {{language?: string, name: string}} channel
 * @returns {string} short code: 'bn'|'hi'|'en'|'ur' for kept langs,
 *                   or a rejected code ('tam','tel','mal','kan','pan').
 */
export function detectLanguage({ language, name }) {
  // 1. tvg-language attribute (highest priority).
  if (language) {
    const first = language.split(/[;,/]/)[0].trim().toLowerCase();
    if (LANG_CODE[first]) return LANG_CODE[first];
  }

  // 2. Rejected Unicode blocks (Tamil/Telugu/Malayalam/Kannada/Punjabi).
  for (const ch of name) {
    for (const [lo, hi, code] of REJECTED_BLOCKS) {
      if (code && inRange(ch, lo, hi)) return code; // rejected
    }
    // Bengali Unicode → bn (but keep scanning in case of mixed scripts).
    if (inRange(ch, BENGALI_RANGE[0], BENGALI_RANGE[1])) return 'bn';
  }

  // 3. Latin-script keyword heuristics.
  const n = name.toLowerCase();
  if (/\b(dd|doordarshan)\b/.test(n)) return 'hi';
  if (/\b(bbc|cnn|sky|al jazeera|france24|rt news|dw|abc|nbc|cbs)\b/.test(n)) return 'en';
  if (/\b(geo|ary|hum|ptv|express|dunya|samaa)\b/.test(n)) return 'ur';

  // 4. Default: 'en' is the safe fallback (won't be dropped).
  return 'en';
}

const ALLOWED = new Set(['bn', 'hi', 'en', 'ur']);

export function isLanguageAllowed(code) {
  return ALLOWED.has(code);
}
```

The `ben_(bangla)` key is already quoted in the source above (it's not a valid bare JS identifier), so no fix is needed at implementation time.

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test`
Expected: all language tests PASS.

If the `ben_(bangla)` key causes a syntax error, ensure it is quoted (`'ben_(bangla)': 'bn'`) — it already is in the source above. Re-run until green.

- [ ] **Step 5: Commit**

```bash
git add .github/scripts/lib/language.mjs .github/scripts/lib/__tests__/language.test.mjs
git commit -m "feat(validator): language detection + bn/hi/en/ur filter"
```

---

## Task 7: Category mapping module (tightened + TDD)

Spec §4.4: Discovery/NatGeo keywords → `documentary` (not `all`).

**Files:**
- Create: `.github/scripts/lib/category.mjs`
- Test: `.github/scripts/lib/__tests__/category.test.mjs`

- [ ] **Step 1: Write the failing test**

Create `.github/scripts/lib/__tests__/category.test.mjs`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mapCategory } from '../category.mjs';

test('sports source is always sports', () => {
  assert.equal(mapCategory(undefined, 'iptv-org-sports'), 'sports');
});

test('group-title with sport → sports', () => {
  assert.equal(mapCategory('Sports', 'src'), 'sports');
});

test('Discovery / NatGeo keywords → documentary', () => {
  assert.equal(mapCategory('Entertainment', 'src', 'Discovery Channel'), 'documentary');
  assert.equal(mapCategory('Entertainment', 'src', 'NatGeo Wild'), 'documentary');
  assert.equal(mapCategory(undefined, 'src', 'National Geographic HD'), 'documentary');
  assert.equal(mapCategory(undefined, 'src', 'Animal Planet'), 'documentary');
});

test('movie/cinema/film → movies', () => {
  assert.equal(mapCategory('Movies', 'src', 'HBO'), 'movies');
  assert.equal(mapCategory('Cinema', 'src', 'Sony Pix'), 'movies');
});

test('music/gaan → music', () => {
  assert.equal(mapCategory('Music', 'src', 'MTV'), 'music');
  assert.equal(mapCategory(undefined, 'src', 'Gaan Bangla'), 'music');
});

test('kids keywords → kids', () => {
  assert.equal(mapCategory('Kids', 'src', 'Cartoon Network'), 'kids');
  assert.equal(mapCategory(undefined, 'src', 'Duronto TV'), 'kids');
});

test('entertainment/general → entertainment', () => {
  assert.equal(mapCategory('Entertainment', 'src', 'Star Plus'), 'entertainment');
});

test('news/bangla with no other signal → all', () => {
  assert.equal(mapCategory('News', 'src', 'Somoy News'), 'all');
});

test('unknown → all', () => {
  assert.equal(mapCategory(undefined, 'src', 'Mystery Channel'), 'all');
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `mapCategory`**

Create `.github/scripts/lib/category.mjs`:

```js
/**
 * Map a raw channel to one of our Category values (spec §4.4).
 *
 * Order matters: documentary keywords are checked BEFORE the generic group
 * so Discovery/NatGeo land in `documentary` even if the upstream group-title
 * says "Entertainment".
 *
 * @param {string|undefined} rawCategory  group-title from M3U
 * @param {string} sourceId
 * @param {string} name  channel display name
 * @returns {'all'|'sports'|'movies'|'music'|'entertainment'|'kids'|'documentary'}
 */
export function mapCategory(rawCategory, sourceId, name) {
  if (sourceId === 'iptv-org-sports') return 'sports';

  const n = (name || '').toLowerCase();

  // Documentary keywords take precedence (populate an otherwise empty bucket).
  if (/(discovery|natgeo|national geographic|animal planet|wild|nature|science|docu)/.test(n)) {
    return 'documentary';
  }

  if (!rawCategory) {
    // Name-only heuristics when no group-title.
    if (/(movie|cinema|film)/.test(n)) return 'movies';
    if (/(music|gaan)/.test(n)) return 'music';
    if (/(kid|child|cartoon|duronto)/.test(n)) return 'kids';
    if (/(entertain|general)/.test(n)) return 'entertainment';
    return 'all';
  }

  const c = rawCategory.toLowerCase();
  if (c.includes('sport')) return 'sports';
  if (c.includes('movie') || c.includes('cinema') || c.includes('film')) return 'movies';
  if (c.includes('music') || c.includes('gaan')) return 'music';
  if (c.includes('kid') || c.includes('child') || c.includes('cartoon')) return 'kids';
  if (c.includes('entertain') || c.includes('general')) return 'entertainment';
  // News and anything else → all.
  return 'all';
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test`
Expected: all category tests PASS.

- [ ] **Step 5: Commit**

```bash
git add .github/scripts/lib/category.mjs .github/scripts/lib/__tests__/category.test.mjs
git commit -m "feat(validator): tightened category mapping, Discovery/NatGeo → documentary"
```

---

## Task 8: Sources registry + host classifier (extract + TDD)

Spec §4.1 (sources) + §4.2 (host classification: global vs bdix).

**Note on Doordarshan:** spec §4.1 lists "Doordarshan official streams" as a source. In practice DD National / DD News / DD Sports are already inside iptv-org's `in.m3u` (which is in our global registry), so no separate DD source is needed — it would only duplicate. We rely on the iptv-org India playlist for FTA DD channels.

**Files:**
- Create: `.github/scripts/lib/sources.mjs`
- Test: `.github/scripts/lib/__tests__/sources.test.mjs`

- [ ] **Step 1: Write the failing test**

Create `.github/scripts/lib/__tests__/sources.test.mjs`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { classifyHost, SOURCES } from '../sources.mjs';

test('global CDN hosts classify as global', () => {
  assert.equal(classifyHost('https://z5amshls.akamaized.net/x.m3u8'), 'global');
  assert.equal(classifyHost('https://d1fi19tywmn14b.cloudfront.net/x.m3u8'), 'global');
  assert.equal(classifyHost('https://nicls1-lh.akamaihd.net/x.m3u8'), 'global');
  assert.equal(classifyHost('https://jiocgehub.jio.ril.com/x.m3u8'), 'global');
  assert.equal(classifyHost('https://iptv-org.github.io/x.m3u'), 'global');
});

test('BDIX hosts classify as bdix', () => {
  assert.equal(classifyHost('http://itpolly.iptv.digijadoo.net/x.m3u8'), 'bdix');
  assert.equal(classifyHost('http://iptv.kitv.live/x.m3u8'), 'bdix');
  assert.equal(classifyHost('http://appcdn.jagobd.com/x.m3u8'), 'bdix');
  assert.equal(classifyHost('http://103.205.133.14:8080/x.m3u8'), 'bdix');
});

test('unknown public domain defaults to global (conservative — let validation decide)', () => {
  assert.equal(classifyHost('https://some-unknown-cdn.com/x.m3u8'), 'global');
});

test('SOURCES registry has both global and bdix entries with ids+urls', () => {
  assert.ok(SOURCES.length >= 8, 'expected at least 8 sources');
  for (const s of SOURCES) {
    assert.ok(s.id, 'source missing id');
    assert.ok(s.url, `source ${s.id} missing url`);
    assert.ok(s.tier === 'global' || s.tier === 'bdix', `source ${s.id} bad tier`);
  }
  const globalCount = SOURCES.filter(s => s.tier === 'global').length;
  const bdixCount = SOURCES.filter(s => s.tier === 'bdix').length;
  assert.ok(globalCount >= 7, 'expected ≥7 global sources');
  assert.ok(bdixCount >= 1, 'expected ≥1 bdix source');
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the registry + classifier**

Create `.github/scripts/lib/sources.mjs`:

```js
/**
 * Source registry (spec §4.1) and host classifier (spec §4.2).
 *
 * Each source declares a `tier`:
 *   - 'global': validated by the US GitHub runner (Tier 1).
 *   - 'bdix':   BD-only; included UNVALIDATED in the catalog and health-checked
 *               in-app via the prefetch pipeline (Phase 2.5). The runner still
 *               fetches the playlist so we can split global-CDN URLs out of it
 *               for Tier-1 validation.
 */

export const SOURCES = [
  // ── GLOBAL (Tier 1) ──────────────────────────────────────────────
  { id: 'iptv-org-bd',           tier: 'global', url: 'https://iptv-org.github.io/iptv/countries/bd.m3u' },
  { id: 'iptv-org-india',        tier: 'global', url: 'https://iptv-org.github.io/iptv/countries/in.m3u' },
  { id: 'iptv-org-sports',       tier: 'global', url: 'https://iptv-org.github.io/iptv/categories/sports.m3u' },
  { id: 'iptv-org-movies',       tier: 'global', url: 'https://iptv-org.github.io/iptv/categories/movies.m3u' },
  { id: 'iptv-org-documentary',  tier: 'global', url: 'https://iptv-org.github.io/iptv/categories/documentary.m3u' },
  { id: 'iptv-org-music',        tier: 'global', url: 'https://iptv-org.github.io/iptv/categories/music.m3u' },
  { id: 'iptv-org-kids',         tier: 'global', url: 'https://iptv-org.github.io/iptv/categories/kids.m3u' },
  { id: 'free-tv',               tier: 'global', url: 'https://raw.githubusercontent.com/Free-TV/IPTV/master/playlists/playlist.m3u8' },

  // ── BDIX (Tier 2; playlist fetched by runner, global-CDN URLs split to Tier 1) ──
  { id: 'shadmanislam-bdiptv',   tier: 'bdix', url: 'https://raw.githubusercontent.com/Shadmanislam/bdiptv/master/BD%20IPTV.m3u' },
];

// Hostnames known to be on global CDNs (reachable from anywhere).
const GLOBAL_HOST_PATTERNS = [
  /\.akamaized\.net$/i,
  /\.akamaihd\.net$/i,
  /\.cloudfront\.net$/i,
  /\.llnwi\.net$/i,           // Limelight
  /^jiocgehub\.jio\.ril\.com$/i,
  /^iptv-org\.github\.io$/i,
  /^raw\.githubusercontent\.com$/i,
  /\.google\.com$/i,          // dai.google.com etc.
  /\.pluto\.tv$/i,
];

// Hostnames known to be BD-only (BDIX / BD ISP IPs).
const BDIX_HOST_PATTERNS = [
  /digijadoo\.net$/i,
  /kitv\.live$/i,
  /jagobd\.com$/i,
  /colorsbd\.com$/i,
  /telelivebd\.com$/i,
];

// BDIX-looking raw IP ranges (BD ISP blocks). Conservative: only the
// well-known BDIX prefixes.
const BDIX_IP_PATTERNS = [
  /^103\./,   // APNIC, heavy BD ISP use
  /^45\.(249|126|58)\./,
  /^182\.48\./,
  /^43\.231\./,
  /^210\.210\./,
];

/**
 * @param {string} url
 * @returns {'global'|'bdix'}
 */
export function classifyHost(url) {
  let host;
  try {
    host = new URL(url).hostname;
  } catch {
    return 'global'; // unparseable → let validation decide
  }

  for (const re of BDIX_HOST_PATTERNS) {
    if (re.test(host)) return 'bdix';
  }
  for (const re of BDIX_IP_PATTERNS) {
    if (re.test(host)) return 'bdix';
  }
  for (const re of GLOBAL_HOST_PATTERNS) {
    if (re.test(host)) return 'global';
  }
  // Unknown public domain → global (let the validator test it; if it's
  // actually BD-only it'll time out and be dropped, which is correct for
  // Tier 1).
  return 'global';
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test`
Expected: all sources tests PASS.

- [ ] **Step 5: Commit**

```bash
git add .github/scripts/lib/sources.mjs .github/scripts/lib/__tests__/sources.test.mjs
git commit -m "feat(validator): source registry + global/bdix host classifier"
```

---

## Task 9: Segment integrity test (extract + TDD)

Spec §5.1 step 6: the core accuracy improvement. Parse manifest, resolve lowest-bandwidth variant's media playlist, fetch first segment.

**Files:**
- Create: `.github/scripts/lib/segmentTest.mjs`
- Test: `.github/scripts/lib/__tests__/segmentTest.test.mjs`

This module has two parts: a **pure** `resolveSegmentUrl(manifestText, baseUrl)` function (fully testable with fixtures), and a **fetching** `testSegment(url, fetcher)` function (testable by injecting a fake fetcher).

- [ ] **Step 1: Write the failing test (pure resolver)**

Create `.github/scripts/lib/__tests__/segmentTest.test.mjs`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveSegmentUrl } from '../segmentTest.mjs';

const MASTER = `#EXTM3U
#EXT-X-STREAM-INF:BANDWIDTH=3000000,RESOLUTION=1280x720
720p.m3u8
#EXT-X-STREAM-INF:BANDWIDTH=800000,RESOLUTION=640x360
360p.m3u8
#EXT-X-STREAM-INF:BANDWIDTH=1500000,RESOLUTION=854x480
480p.m3u8
`;

const MEDIA = `#EXTM3U
#EXT-X-TARGETDURATION:6
#EXTINF:6.0,
segment_1.ts
#EXTINF:6.0,
segment_2.ts
#EXT-X-ENDLIST
`;

test('master playlist: picks lowest-bandwidth variant', () => {
  const seg = resolveSegmentUrl(MASTER, 'https://cdn.example.com/live/master.m3u8');
  assert.equal(seg, 'https://cdn.example.com/live/360p.m3u8');
});

test('media playlist: returns first segment URL', () => {
  const seg = resolveSegmentUrl(MEDIA, 'https://cdn.example.com/live/360p.m3u8');
  assert.equal(seg, 'https://cdn.example.com/live/segment_1.ts');
});

test('media playlist with absolute segment URL passes through', () => {
  const media = '#EXTM3U\n#EXTINF:6.0,\nhttps://other.cdn/seg.ts\n';
  const seg = resolveSegmentUrl(media, 'https://cdn.example.com/x.m3u8');
  assert.equal(seg, 'https://other.cdn/seg.ts');
});

test('non-M3U3 content returns null', () => {
  assert.equal(resolveSegmentUrl('<html>not a playlist</html>', 'https://x/'), null);
  assert.equal(resolveSegmentUrl('', 'https://x/'), null);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the pure resolver**

Create `.github/scripts/lib/segmentTest.mjs`:

```js
/**
 * Segment integrity test (spec §5.1 step 6).
 *
 * `resolveSegmentUrl` is pure and fully unit-tested. `testSegment` performs
 * the network fetch and is testable via an injected fetcher.
 */

const MEDIA_SEG_RE = /^#EXTINF:.*,\s*$/m;

/**
 * Given a manifest body and its base URL, return the URL of the segment to
 * actually fetch for the integrity test.
 *
 * - If the manifest is a master playlist (has #EXT-X-STREAM-INF), resolve the
 *   LOWEST-bandwidth variant URL (deterministic, cheapest).
 *   NOTE: that variant URL is a *media playlist*, not a segment. The caller
 *   must fetch it and call resolveSegmentUrl again. This function returns the
 *   next URL to fetch; if it's a media playlist the caller recurses once.
 * - If the manifest is a media playlist, return the first #EXTINF segment URL.
 * - Returns null if the content is not a valid playlist.
 *
 * @param {string} manifest
 * @param {string} baseUrl
 * @returns {string|null}
 */
export function resolveSegmentUrl(manifest, baseUrl) {
  if (!manifest || !manifest.trimStart().startsWith('#EXTM3U')) return null;

  // Master playlist?
  if (manifest.includes('#EXT-X-STREAM-INF')) {
    const lines = manifest.split('\n');
    let best = null; // {bandwidth, url}
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (line.startsWith('#EXT-X-STREAM-INF:')) {
        const bwMatch = line.match(/BANDWIDTH=(\d+)/);
        const bandwidth = bwMatch ? parseInt(bwMatch[1], 10) : Infinity;
        // The next non-empty, non-comment line is the variant URL.
        const next = (lines[i + 1] || '').trim();
        if (next && !next.startsWith('#')) {
          if (!best || bandwidth < best.bandwidth) {
            best = { bandwidth, url: next };
          }
        }
      }
    }
    return best ? resolveUrl(best.url, baseUrl) : null;
  }

  // Media playlist: first segment after an #EXTINF.
  const lines = manifest.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (line.startsWith('#EXTINF')) {
      const next = (lines[i + 1] || '').trim();
      if (next && !next.startsWith('#')) {
        return resolveUrl(next, baseUrl);
      }
    }
  }
  return null;
}

/** Resolve a possibly-relative URL against a base. Returns null on bad input. */
function resolveUrl(maybeRelative, base) {
  try {
    return new URL(maybeRelative, base).href;
  } catch {
    return null;
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test`
Expected: all resolver tests PASS.

- [ ] **Step 5: Write the fetching test with an injected fake fetcher**

Append to `.github/scripts/lib/__tests__/segmentTest.test.mjs`:

```js
import { testSegment } from '../segmentTest.mjs';

// A fetcher that returns scripted responses per-URL. Lets us drive the
// master→media→segment chain without the network.
function makeFakeFetcher(routes) {
  return async (url, opts) => {
    const r = routes[url];
    if (!r) {
      const err = new Error('not found: ' + url);
      err.status = 404;
      throw err;
    }
    return {
      ok: (r.status >= 200 && r.status < 300) || r.status === 206,
      status: r.status,
      headers: { get: (k) => (k.toLowerCase() === 'content-type' ? r.contentType : null) },
      text: async () => r.body,
    };
  };
}

test('testSegment: happy path through master→media→segment', async () => {
  const master = 'https://cdn/live.m3u8';
  const media = 'https://cdn/360p.m3u8';
  const seg = 'https://cdn/seg1.ts';
  const fetcher = makeFakeFetcher({
    [master]: { status: 200, contentType: 'application/vnd.apple.mpegurl', body: MASTER },
    [media]: { status: 200, contentType: 'application/vnd.apple.mpegurl', body: MEDIA },
    [seg]:    { status: 206, contentType: 'video/mp2t', body: '\x00\x00\x01' },
  });
  const result = await testSegment(master, fetcher);
  assert.equal(result.ok, true);
  assert.ok(result.latencyMs >= 0);
});

test('testSegment: dead segment (404) fails', async () => {
  const media = 'https://cdn/x.m3u8';
  const fetcher = makeFakeFetcher({
    [media]: { status: 200, contentType: 'application/vnd.apple.mpegurl', body: MEDIA },
    // segment_1.ts → not in routes → 404
  });
  const result = await testSegment(media, fetcher);
  assert.equal(result.ok, false);
  assert.match(result.reason, /segment/i);
});

test('testSegment: manifest 403 fails fast', async () => {
  const fetcher = makeFakeFetcher({
    'https://cdn/x.m3u8': { status: 403, contentType: 'text/html', body: 'forbidden' },
  });
  const result = await testSegment('https://cdn/x.m3u8', fetcher);
  assert.equal(result.ok, false);
  assert.match(result.reason, /status/i);
});
```

- [ ] **Step 6: Run to verify the new tests fail (module doesn't export testSegment yet)**

Run: `npm test`
Expected: resolver tests PASS; the three `testSegment` tests FAIL (not exported).

- [ ] **Step 7: Implement `testSegment`**

Append to `.github/scripts/lib/segmentTest.mjs`:

```js
const BROWSER_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
const SEGMENT_TIMEOUT_MS = 4000;

const MEDIA_CONTENT_TYPES = ['mpegurl', 'x-mpegurl', 'apple', 'video/', 'octet-stream', 'dash', 'xml'];

/**
 * Fetch the manifest, then if it's a master playlist recurse one level into
 * the lowest-bandwidth media playlist, then fetch the first segment and verify
 * it returns media bytes.
 *
 * @param {string} manifestUrl
 * @param {(url: string, opts?: object) => Promise<{ok, status, headers:{get}, text}>} [fetcher]
 *        Defaults to global fetch. Injected in tests.
 * @returns {Promise<{ok: boolean, latencyMs: number, reason?: string}>}
 */
export async function testSegment(manifestUrl, fetcher = globalThis.fetch) {
  const start = Date.now();

  // Fetch the manifest.
  let res;
  try {
    res = await fetcher(manifestUrl, {
      method: 'GET',
      headers: { 'User-Agent': BROWSER_UA, 'Range': 'bytes=0-4095' },
      signal: AbortSignal.timeout(SEGMENT_TIMEOUT_MS),
    });
  } catch (e) {
    return { ok: false, latencyMs: Date.now() - start, reason: `manifest fetch error: ${e.message}` };
  }

  if (!res.ok) {
    return { ok: false, latencyMs: Date.now() - start, reason: `manifest status ${res.status}` };
  }

  const manifestBody = await res.text();
  let segmentUrl = resolveSegmentUrl(manifestBody, manifestUrl);

  // Master playlist → segmentUrl is a media-playlist URL; fetch it once more.
  if (manifestBody.includes('#EXT-X-STREAM-INF') && segmentUrl) {
    let mediaRes;
    try {
      mediaRes = await fetcher(segmentUrl, {
        method: 'GET',
        headers: { 'User-Agent': BROWSER_UA, 'Range': 'bytes=0-4095' },
        signal: AbortSignal.timeout(SEGMENT_TIMEOUT_MS),
      });
    } catch (e) {
      return { ok: false, latencyMs: Date.now() - start, reason: `media playlist fetch error: ${e.message}` };
    }
    if (!mediaRes.ok) {
      return { ok: false, latencyMs: Date.now() - start, reason: `media playlist status ${mediaRes.status}` };
    }
    const mediaBody = await mediaRes.text();
    segmentUrl = resolveSegmentUrl(mediaBody, segmentUrl);
  }

  if (!segmentUrl) {
    return { ok: false, latencyMs: Date.now() - start, reason: 'no segment URL resolvable' };
  }

  // Fetch the segment itself.
  let segRes;
  try {
    segRes = await fetcher(segmentUrl, {
      method: 'GET',
      headers: { 'User-Agent': BROWSER_UA, 'Range': 'bytes=0-65535' },
      signal: AbortSignal.timeout(SEGMENT_TIMEOUT_MS),
    });
  } catch (e) {
    return { ok: false, latencyMs: Date.now() - start, reason: `segment fetch error: ${e.message}` };
  }

  if (!segRes.ok) {
    return { ok: false, latencyMs: Date.now() - start, reason: `segment status ${segRes.status}` };
  }
  const ct = (segRes.headers.get('content-type') || '').toLowerCase();
  const isMedia = MEDIA_CONTENT_TYPES.some((t) => ct.includes(t));
  if (!isMedia) {
    return { ok: false, latencyMs: Date.now() - start, reason: `segment content-type ${ct || '(none)'}` };
  }

  return { ok: true, latencyMs: Date.now() - start };
}
```

- [ ] **Step 8: Run all tests to verify they pass**

Run: `npm test`
Expected: ALL tests PASS (resolver + the three testSegment cases).

- [ ] **Step 9: Commit**

```bash
git add .github/scripts/lib/segmentTest.mjs .github/scripts/lib/__tests__/segmentTest.test.mjs
git commit -m "feat(validator): segment integrity test (master→lowest-variant→first segment)"
```

---

## Task 10: Multi-URL deduplication (extract + TDD)

Spec §5.3: one entry per normalized name, `sources[]` = all passing URLs sorted by latency, `streamUrl` = fastest.

**Files:**
- Create: `.github/scripts/lib/dedupe.mjs`
- Test: `.github/scripts/lib/__tests__/dedupe.test.mjs`

- [ ] **Step 1: Write the failing test**

Create `.github/scripts/lib/__tests__/dedupe.test.mjs`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeName, pickBestRoutes } from '../dedupe.mjs';

test('normalizeName lowercases and strips HD/FHD/4K/TV tags', () => {
  assert.equal(normalizeName('Sony Ten 1 HD'), 'sony 1');
  assert.equal(normalizeName('STAR PLUS FHD'), 'star plus');
  assert.equal(normalizeName('ATN News 4K TV'), 'atn news');
});

test('normalizeName preserves Bengali Unicode', () => {
  assert.equal(normalizeName('এটিএন নিউজ'), 'এটিএন নিউজ');
});

test('pickBestRoutes: one entry per name, sources sorted by latency', () => {
  const validated = [
    { name: 'Sony Ten 1', url: 'https://a/s.m3u8', latencyMs: 500, language: 'en', tier: 'global', sourceId: 's1', category: 'sports', logo: 'l1' },
    { name: 'Sony Ten 1 HD', url: 'https://b/s.m3u8', latencyMs: 200, language: 'en', tier: 'global', sourceId: 's2', category: 'sports', logo: 'l2' },
    { name: 'Sony Ten 1', url: 'https://c/s.m3u8', latencyMs: 800, language: 'en', tier: 'global', sourceId: 's3', category: 'sports', logo: 'l3' },
  ];
  const result = pickBestRoutes(validated);
  assert.equal(result.length, 1);
  const [entry] = result;
  assert.equal(entry.name, 'Sony Ten 1');         // fastest source's display name kept
  assert.equal(entry.streamUrl, 'https://b/s.m3u8'); // fastest URL is primary
  assert.deepEqual(entry.sources, ['https://b/s.m3u8', 'https://a/s.m3u8', 'https://c/s.m3u8']);
  assert.equal(entry.latencyMs, 200);             // primary's latency
});

test('pickBestRoutes: dedupes identical URLs across sources', () => {
  const validated = [
    { name: 'GTV', url: 'https://x/g.m3u8', latencyMs: 300, language: 'bn', tier: 'global', sourceId: 's1', category: 'sports', logo: '' },
    { name: 'GTV', url: 'https://x/g.m3u8', latencyMs: 300, language: 'bn', tier: 'global', sourceId: 's2', category: 'sports', logo: '' },
  ];
  const [entry] = pickBestRoutes(validated);
  assert.deepEqual(entry.sources, ['https://x/g.m3u8']); // no duplicate
});

test('pickBestRoutes: stamps lastValidated as ISO string', () => {
  const validated = [{ name: 'BBC', url: 'https://b/m.m3u8', latencyMs: 100, language: 'en', tier: 'global', sourceId: 's', category: 'all', logo: '' }];
  const [entry] = pickBestRoutes(validated);
  assert.equal(typeof entry.lastValidated, 'string');
  assert.ok(!isNaN(Date.parse(entry.lastValidated)), 'lastValidated is a valid date');
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement dedupe**

Create `.github/scripts/lib/dedupe.mjs`:

```js
import { mapCategory } from './category.mjs';

/**
 * Normalize a channel name for deduplication (spec §5.3, §4.3).
 * Preserve Unicode letters (\p{L}) and numbers (\p{N}) so Bengali / Hindi
 * names are not collapsed to empty strings.
 */
export function normalizeName(name) {
  return name
    .toLowerCase()
    .replace(/\b(hd|fhd|4k|tv)\b/g, '')
    .replace(/[^\p{L}\p{N}\s-]/gu, '')
    .replace(/\s+/g, ' ')
    .trim();
}

async function sha256Hex16(input) {
  const buf = new TextEncoder().encode(input);
  const hash = await crypto.subtle.digest('SHA-256', buf);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
    .substring(0, 16);
}

/**
 * Deduplicate validated channels: one entry per normalized name, with ALL
 * passing URLs kept in `sources[]` sorted by latency (fastest first).
 * `streamUrl` is the fastest URL.
 *
 * @param {Array} validated  each has {name, url, latencyMs, language, tier, sourceId, category, logo}
 * @param {() => string} [nowIso]  injectable clock for tests
 * @returns {Promise<Array>} final ChannelFinal-shaped entries
 */
export async function pickBestRoutes(validated, nowIso = () => new Date().toISOString()) {
  const groups = new Map();

  for (const ch of validated) {
    const norm = normalizeName(ch.name);
    if (!norm) continue;
    if (!groups.has(norm)) groups.set(norm, []);
    groups.get(norm).push(ch);
  }

  const final = [];
  for (const [norm, group] of groups.entries()) {
    // Sort each group by latency (fastest first), dedupe identical URLs.
    const byLatency = [...group].sort((a, b) => a.latencyMs - b.latencyMs);
    const seen = new Set();
    const sources = [];
    for (const ch of byLatency) {
      if (!seen.has(ch.url)) {
        seen.add(ch.url);
        sources.push(ch.url);
      }
    }
    const primary = byLatency[0];
    const id = await sha256Hex16(norm);

    final.push({
      id,
      name: primary.name,
      logoUrl: primary.logo || '',
      streamUrl: primary.url,
      category: mapCategory(primary.category, primary.sourceId, primary.name),
      latencyMs: primary.latencyMs,
      language: primary.language,
      tier: primary.tier,
      sources,
      lastValidated: nowIso(),
    });
  }

  return final.sort((a, b) => a.name.localeCompare(b.name));
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test`
Expected: all dedupe tests PASS.

- [ ] **Step 5: Commit**

```bash
git add .github/scripts/lib/dedupe.mjs .github/scripts/lib/__tests__/dedupe.test.mjs
git commit -m "feat(validator): multi-URL dedup — sources[] sorted by latency"
```

---

## Task 11: Smart BD filter (TDD)

Spec §5.2: drop iptv-org channels whose `tvg-country` is a non-target state with no global CDN.

**Files:**
- Create: `.github/scripts/lib/bdFilter.mjs`
- Test: `.github/scripts/lib/__tests__/bdFilter.test.mjs`

- [ ] **Step 1: Write the failing test**

Create `.github/scripts/lib/__tests__/bdFilter.test.mjs`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isLikelyGeoBlockedFromBd } from '../bdFilter.mjs';

test('global-CDN channels are kept regardless of declared country', () => {
  assert.equal(isLikelyGeoBlockedFromBd({ url: 'https://x.akamaihd.net/s.m3u8', country: 'US' }), false);
  assert.equal(isLikelyGeoBlockedFromBd({ url: 'https://d.cloudfront.net/s.m3u8', country: 'FR' }), false);
});

test('BD/IN/SAARC countries are kept', () => {
  assert.equal(isLikelyGeoBlockedFromBd({ url: 'http://103.1.2.3/s.m3u8', country: 'BD' }), false);
  assert.equal(isLikelyGeoBlockedFromBd({ url: 'http://x/s.m3u8', country: 'IN' }), false);
  assert.equal(isLikelyGeoBlockedFromBd({ url: 'http://x/s.m3u8', country: 'PK' }), false);
});

test('unknown non-target country on non-CDN host → blocked', () => {
  assert.equal(isLikelyGeoBlockedFromBd({ url: 'http://some-us-local-affiliate.com/s.m3u8', country: 'US' }), true);
  assert.equal(isLikelyGeoBlockedFromBd({ url: 'http://eu-regional.tv/s.m3u8', country: 'DE' }), true);
});

test('missing country → kept (conservative)', () => {
  assert.equal(isLikelyGeoBlockedFromBd({ url: 'http://x/s.m3u8', country: undefined }), false);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the filter**

Create `.github/scripts/lib/bdFilter.mjs`:

```js
import { classifyHost } from './sources.mjs';

// Countries whose channels we keep (target audience + SAARC + Urdu markets).
const KEEP_COUNTRIES = new Set(['BD', 'IN', 'PK', 'LK', 'NP', 'BT', 'MV', 'AF', 'AE', 'SA', 'GB', 'US']);

/**
 * Heuristic: would this channel likely be geo-blocked when viewed from BD?
 *
 * Rules (spec §5.2):
 *   - global-CDN host  → never blocked (CDNs don't bind to the declared country)
 *   - declared country in our keep set → not blocked
 *   - declared country NOT in keep set AND non-CDN host → likely blocked
 *   - missing country → keep (conservative; let validation/Tier-2 decide)
 *
 * @param {{url: string, country?: string}} channel
 * @returns {boolean} true = drop it (likely BD-blocked)
 */
export function isLikelyGeoBlockedFromBd({ url, country }) {
  if (classifyHost(url) === 'global') return false;
  if (!country) return false; // conservative
  return !KEEP_COUNTRIES.has(country.toUpperCase());
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test`
Expected: all bdFilter tests PASS.

- [ ] **Step 5: Commit**

```bash
git add .github/scripts/lib/bdFilter.mjs .github/scripts/lib/__tests__/bdFilter.test.mjs
git commit -m "feat(validator): smart BD geo-block filter (conservative)"
```

---

## Task 12: Report builder (extract + TDD)

Spec §5.5: workflow summary string for the PR.

**Files:**
- Create: `.github/scripts/lib/report.mjs`
- Test: `.github/scripts/lib/__tests__/report.test.mjs`

- [ ] **Step 1: Write the failing test**

Create `.github/scripts/lib/__tests__/report.test.mjs`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildReport } from '../report.mjs';

test('buildReport renders counts and per-reason dead breakdown', () => {
  const stats = {
    raw: 4000,
    secretRejected: 5,
    languageRejected: 300,
    geoFiltered: 200,
    dead: { 'segment status 404': 150, 'manifest status 403': 80, 'timeout': 40 },
    alive: 3225,
    final: 280,
  };
  const out = buildReport(stats);
  assert.match(out, /Raw: 4000/);
  assert.match(out, /Secret URLs rejected: 5/);
  assert.match(out, /Language-filtered: 300/);
  assert.match(out, /Geo-filtered: 200/);
  assert.match(out, /Alive: 3225/);
  assert.match(out, /Final after dedup: 280/);
  assert.match(out, /segment status 404.*150/);
  assert.match(out, /timeout.*40/);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the report**

Create `.github/scripts/lib/report.mjs`:

```js
/**
 * Build the human-readable validation summary printed to the workflow log
 * (and visible in the PR body context).
 *
 * @param {{raw:number, secretRejected:number, languageRejected:number, geoFiltered:number, dead:Object<string,number>, alive:number, final:number}} stats
 * @returns {string}
 */
export function buildReport(stats) {
  const deadLines = Object.entries(stats.dead || {})
    .sort((a, b) => b[1] - a[1])
    .map(([reason, n]) => `    ${reason}: ${n}`)
    .join('\n');

  return [
    'Validation Report',
    '─────────────────',
    `Raw channels:            ${stats.raw}`,
    `Secret URLs rejected:    ${stats.secretRejected}`,
    `Language-filtered:       ${stats.languageRejected}`,
    `Geo-filtered:            ${stats.geoFiltered}`,
    `Dead:`,
    deadLines,
    `Alive:                   ${stats.alive}`,
    `Final after dedup:       ${stats.final}`,
  ].filter(Boolean).join('\n');
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test`
Expected: all report tests PASS.

- [ ] **Step 5: Commit**

```bash
git add .github/scripts/lib/report.mjs .github/scripts/lib/__tests__/report.test.mjs
git commit -m "feat(validator): validation report builder"
```

---

## Task 13: Wire the modules into the orchestrator + retry loop

Rewrite `.github/scripts/validate-channels.mjs` to use all the modules, add the retry×3 wrapper around `testSegment`, and add language/geo/secret filtering. This is the integration task — it's verified by the existing GitHub Actions run, not a unit test (it's I/O).

**Files:**
- Modify: `.github/scripts/validate-channels.mjs` (full rewrite)

- [ ] **Step 1: Rewrite the orchestrator**

Replace the entire contents of `.github/scripts/validate-channels.mjs` with:

```js
#!/usr/bin/env node
/**
 * Taranga+ Tier-1 Channel Validation
 * Runs on GitHub Actions twice hourly.
 *
 * Pipeline: fetch sources → parse → filter (secret/lang/geo) → validate
 * (segment-level, retry×3) → multi-URL dedup → write channels.json.
 */

import { writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { SOURCES, classifyHost } from './lib/sources.mjs';
import { parseM3U } from './lib/m3u.mjs';
import { looksLikeSecretUrl } from './lib/secrets.mjs';
import { detectLanguage, isLanguageAllowed } from './lib/language.mjs';
import { isLikelyGeoBlockedFromBd } from './lib/bdFilter.mjs';
import { testSegment } from './lib/segmentTest.mjs';
import { pickBestRoutes } from './lib/dedupe.mjs';
import { buildReport } from './lib/report.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..', '..');
const BATCH_SIZE = 50;
const MAX_RETRIES = 3;

function normalizeLogoUrl(logo) {
  if (!logo) return '';
  return logo.replace(/^https?:\/\/imgur\.com\/([A-Za-z0-9]+)\/?$/, 'https://i.imgur.com/$1.png');
}

async function fetchAllSources() {
  const results = await Promise.all(
    SOURCES.map(async (src) => {
      try {
        console.log(`  Fetching: ${src.id} ...`);
        const res = await fetch(src.url, {
          signal: AbortSignal.timeout(20000),
          headers: { 'User-Agent': 'Mozilla/5.0 TarangaPlus/2.0' },
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const text = await res.text();
        const parsed = parseM3U(text, src.id);
        console.log(`  ✓ ${src.id}: ${parsed.length} channels parsed`);
        return parsed;
      } catch (e) {
        console.error(`  ✗ ${src.id} failed: ${e.message}`);
        return [];
      }
    })
  );
  return results.flat();
}

/** testSegment with retry×3 on transient failures. */
async function testWithRetry(url) {
  let last;
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    last = await testSegment(url);
    if (last.ok) return last;
    // Only retry on transient-looking reasons (network/timeout/5xx). Status
    // 403/404 etc. won't change, so fail fast.
    if (/status (40[039]|41[0-5]|42[0-9])/.test(last.reason || '')) return last;
    const base = 400 * Math.pow(2, attempt - 1);
    await new Promise((r) => setTimeout(r, base + Math.floor(Math.random() * base)));
  }
  return last;
}

async function main() {
  console.log('═══════════════════════════════════════');
  console.log('  Taranga+ Tier-1 Validation');
  console.log('═══════════════════════════════════════\n');

  const start = Date.now();

  console.log('📡 Fetching sources...');
  const raw = await fetchAllSources();
  console.log(`\n  Total raw: ${raw.length} channels\n`);

  const stats = { raw: raw.length, secretRejected: 0, languageRejected: 0, geoFiltered: 0, dead: {}, alive: 0, final: 0 };

  // ── Filter stage ──────────────────────────────────────────────
  const candidates = [];
  for (const ch of raw) {
    if (looksLikeSecretUrl(ch.url)) { stats.secretRejected++; continue; }
    const lang = detectLanguage(ch);
    if (!isLanguageAllowed(lang)) { stats.languageRejected++; continue; }
    // Geo filter applies only to Tier-1 (global) channels. BDIX channels
    // are included unvalidated here and health-checked in-app (Phase 2.5).
    const tier = classifyHost(ch.url);
    if (tier === 'global' && isLikelyGeoBlockedFromBd(ch)) { stats.geoFiltered++; continue; }
    candidates.push({ ...ch, language: lang, tier });
  }

  console.log(`🔍 Validating ${candidates.length} candidates (segment-level, retry×${MAX_RETRIES})...`);

  // Split: only global-tier candidates are network-validated here. BDIX
  // candidates are passed through unvalidated (Tier-2 handles them in-app).
  const toValidate = candidates.filter((c) => c.tier === 'global');
  const bdixPassThrough = candidates.filter((c) => c.tier === 'bdix');

  const alive = [];
  for (let i = 0; i < toValidate.length; i += BATCH_SIZE) {
    const batch = toValidate.slice(i, i + BATCH_SIZE);
    console.log(`  Batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(toValidate.length / BATCH_SIZE)} (${batch.length})...`);
    const results = await Promise.all(batch.map(async (ch) => {
      const r = await testWithRetry(ch.url);
      if (!r.ok) {
        const key = r.reason || 'unknown';
        stats.dead[key] = (stats.dead[key] || 0) + 1;
        return null;
      }
      return { ...ch, latencyMs: r.latencyMs };
    }));
    for (const r of results) if (r) alive.push(r);
    console.log(`    alive so far: ${alive.length}`);
  }

  // BDIX pass-through: keep all (unvalidated); in-app prefetch will prune.
  for (const ch of bdixPassThrough) {
    alive.push({ ...ch, latencyMs: 0 });
  }

  stats.alive = alive.length;
  console.log(`\n🧹 Deduplicating (multi-URL)...`);
  const final = await pickBestRoutes(alive);
  stats.final = final.length;

  console.log('\n' + buildReport(stats));

  const outPath = join(ROOT, 'data', 'channels.json');
  writeFileSync(outPath, JSON.stringify(final, null, 2));

  const elapsed = ((Date.now() - start) / 1000).toFixed(1);
  console.log(`\n✅ Saved ${final.length} channels to data/channels.json (${elapsed}s)`);
  console.log('═══════════════════════════════════════');
}

main().catch((e) => {
  console.error('❌ Fatal:', e);
  process.exit(1);
});
```

- [ ] **Step 2: Verify lint still passes (types unchanged in this step)**

Run: `npm run lint`
Expected: PASS.

- [ ] **Step 3: Smoke-test the orchestrator locally with a dry fetch**

Run a quick local smoke (this hits the network, may take ~1–2 min):

Run: `node .github/scripts/validate-channels.mjs`
Expected: prints the report and writes `data/channels.json`. The BDIX channels will mostly time out (US/your IP) — that's expected; they're passed through. Global channels should validate. The script must exit 0.

If a module import fails, fix the path. If `data/` doesn't exist, create it first (`mkdir data`).

- [ ] **Step 4: Commit**

```bash
git add .github/scripts/validate-channels.mjs data/channels.json
git commit -m "feat(validator): modular orchestrator with segment test + retry + filters"
```

---

## Task 14: Update the workflow — 30-min cadence + test gate

Spec §5.4: cron `0 * * * *` → `*/30 * * * *`. Also run the test suite in CI before validating, so a broken module never reaches the schedule.

**Files:**
- Modify: `.github/workflows/validate-channels.yml`

- [ ] **Step 1: Update the workflow**

In `.github/workflows/validate-channels.yml`, change the schedule and add a test step.

Change the `on.schedule` block:

```yaml
on:
  schedule:
    # Twice hourly. A single run may take several minutes — quality over speed.
    - cron: '*/30 * * * *'
  workflow_dispatch:
```

After the `Install dependencies` step (the `npm ci` step) and before the `Run channel validation` step, add a test step:

```yaml
      - name: Run unit tests
        run: npm test
```

Leave the PR/checkout/commit steps unchanged.

- [ ] **Step 2: Verify the YAML is valid**

Run: `node -e "const y=require('fs').readFileSync('.github/workflows/validate-channels.yml','utf8'); console.log('lines:', y.split(String.fromCharCode(10)).length); console.log('has */30:', y.includes('*/30 * * * *')); console.log('has npm test step:', y.includes('npm test'));"`
Expected: prints non-zero line count, `has */30: true`, `has npm test step: true`.

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/validate-channels.yml
git commit -m "ci(validator): twice-hourly cadence + unit-test gate before validation"
```

---

## Task 15: Final verification — full test run + dry validate

End-to-end sanity before declaring the plan phase done.

- [ ] **Step 1: Run the full test suite**

Run: `npm test`
Expected: ALL tests PASS (smoke + m3u + secrets + language + category + sources + segmentTest + dedupe + bdFilter + report). Count should be ≥ 30 tests.

- [ ] **Step 2: Run lint**

Run: `npm run lint`
Expected: PASS (no type errors in the renderer/backend type changes).

- [ ] **Step 3: Run a full local validation dry run**

Run: `node .github/scripts/validate-channels.mjs`
Expected: completes, exits 0, `data/channels.json` is valid JSON with the new fields. Spot-check one entry:

Run: `node -e "const d=require('./data/channels.json'); const c=d.find(x=>x.tier==='global'); console.log(c && Object.keys(c).join(','));"`
Expected: prints a field list including `language,tier,sources,lastValidated`.

- [ ] **Step 4: Commit (if the dry run regenerated channels.json with the new schema)**

```bash
git add data/channels.json
git commit -m "chore: regenerate channels.json with new schema (dry validation run)"
```

If there are no schema-visible changes (e.g. dedup produced identical entries), skip the commit.

---

## Done criteria for Phase 1 & 2

- [ ] All unit tests pass (`npm test`).
- [ ] `npm run lint` passes.
- [ ] `.github/scripts/validate-channels.mjs` runs to completion locally and writes a schema-correct `channels.json`.
- [ ] `data/channels.json` entries include `language`, `tier`, `sources[]`, `lastValidated`.
- [ ] Workflow runs twice hourly and gates on `npm test`.
- [ ] No references to removed functions remain in the validator script.

Phase 2.5 (BDIX prefetch health), Phase 3 (player engine), and Phase 4 (catalog delivery) are covered by separate plans.

---

## Notes for the implementer

- **No `dist/` build needed for the validator.** It runs as plain ESM via `node`. The `.mjs` extension is what makes it a module; no `package.json` `"type"` change is needed at that path.
- **The `LANG_CODE` key `ben_(bangla)` in Task 6 is quoted in the plan source** — it is not a valid bare JS identifier. Copy it verbatim.
- **Segment test against BDIX channels from the US will time out.** That's why BDIX channels are *passed through* (not validated) in the orchestrator — Tier 2 (in-app prefetch) owns their health. Do not "fix" this by raising the timeout.
- **Do not delete the old monolith's helper functions until the module they moved to is committed.** Each task ends with a commit so the tree is always valid.
- **`crypto.subtle` is available in Node 22 globally** (used by `sha256Hex16` in dedupe). No polyfill needed.
