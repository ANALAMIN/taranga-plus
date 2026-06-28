# Dynamic Window-Aware Layout for Taranga+

**Date:** 2026-06-22
**Status:** Approved
**Scope:** Make the existing UI respond correctly to native window state changes (resize, maximize/restore, Windows Snap Layouts / Aero Snap) without altering the visual design.

---

## Goal

The native Windows titlebar stays (`decorations: true`), so all native behaviors — close/minimize/maximize, Windows 11 Snap Layouts, Aero Snap (half/quater via edge-drag), Win+Arrow — keep working. The React UI beneath it must rebalance itself dynamically for every resulting window size, never overflow, never overlap, never break layout.

**Non-goal:** Do not change the visual design, colors, fonts, or component appearance. Do not remove the native titlebar. Do not add custom window-control buttons.

## Problem Inventory (current code)

1. **`Topbar` hardcoded right padding** — `pr-[200px]` (Topbar/index.tsx:78). At narrow widths the centered search (absolutely positioned at `left-1/2 -translate-x-1/2`, width up to `440px`) collides with the logo on the left and the theme switch on the right.
2. **`App.tsx` uses Tailwind `lg`/`xl` breakpoints** (1024px / 1280px) for the player-vs-grid split (`flex-col lg:flex-row`, `lg:flex-[2.5] xl:flex-[3]`). A snapped-to-half window is ~640–720px wide — below `lg` — so the desktop split layout never engages in snap views; the player and grid stack vertically even though a side-by-side split would fit.
3. **No window-state source of truth.** There is no React state reflecting the *actual* window dimensions or maximize state. Tailwind media queries measure the *viewport*, which is the full CSS viewport — generally correct, but they cannot express "this is a snapped half" or react to maximize transitions explicitly. We want explicit, Tauri-backed window dimensions so the layout is driven by real window geometry, not assumptions.
4. **`ChannelGrid`** uses `minmax(180px,1fr)` — already self-collapsing, fine. No change needed.
5. **`LiquidGlassSidebar`** is fixed `w-[120px]` — fine. No change needed.

## Design

### Component: `useWindowState` hook

New file: `src/hooks/useWindowState.ts`

Listens to the Tauri backend window events and exposes a single reactive state object:

```ts
interface WindowState {
  width: number;        // current inner width in CSS px
  height: number;       // current inner height in CSS px
  isMaximized: boolean; // true when maximized
  isSnapped: boolean;   // heuristic: maximized === false AND width < ~screen*0.6
}
```

Implementation:

- `getCurrentWindow()` from `@tauri-apps/api/window`.
- On mount: query `window.innerSize()` (via `getCurrentWindow().innerSize()` → `PhysicalSize` → divide by `devicePixelRatio`) for the initial value, and `getCurrentWindow().isMaximized()`.
- Subscribe to `onResized()` and `onScaleChanged()`; update `width`/`height`.
- Subscribe to `onResized` → recompute `isSnapped` using `screen.availWidth` (CSS) as the reference. A window is treated as "snapped" when it is not maximized and its width is below 60% of the screen's available width. This is a heuristic — it only affects whether we pick a compact breakpoint, and degrades safely (defaults to desktop layout) if the heuristic is wrong.
- Guard all Tauri calls so the same code runs in `vite dev` (browser) without crashing: if `getCurrentWindow()` APIs throw or the runtime is not Tauri, fall back to `window.innerWidth`/`resize` listener and `isMaximized = false`.

### Layout tiers (driven by `width`)

| Tier | Window width | What happens |
|---|---|---|
| **narrow** | `< 760px` | Topbar search collapses to an icon; logo + icon-only search + theme switch. Player and channel grid stack vertically. |
| **medium** | `760–1099px` (covers snapped-half on most displays) | Full search bar but narrower (`max-w-[320px]`). Player and channel grid **side by side** with the grid at `~300px` fixed width. |
| **wide** | `≥ 1100px` | Current desktop layout exactly: search `max-w-[440px]`, player `flex-[3]`, grid `~380px`. |

The numeric thresholds come from: minimum snap-half width (~640px on a 1280-wide screen) lands in "medium", giving a proper side-by-side layout when snapped — which is the bug we are fixing. On a maximized window the width is well into "wide", so maximized looks exactly as it does today.

### Changes per component

**`App.tsx`**
- Read `const win = useWindowState()`.
- Derive `layoutTier = win.width < 760 ? 'narrow' : win.width < 1100 ? 'medium' : 'wide'`.
- Replace the `lg:` / `xl:` breakpoint classes on the player/grid split with explicit conditional classes keyed on `layoutTier`:
  - Container: `layoutTier === 'narrow' ? 'flex-col' : 'flex-row'`.
  - Player: narrow = full width stacked, medium = `flex-[1]`, wide = `flex-[3]`.
  - Grid: narrow = `w-full h-[45vh]`, medium = `w-[300px]`, wide = `w-[380px]`.
- Player height on narrow stays the current `h-[55vh]` for the mobile-like stack.
- No visual change at wide tier — same proportions as today.

**`Topbar` (Topbar/index.tsx)**
- Add optional `layoutTier` prop (or read from a context — see below).
- Replace `pr-[200px]` with dynamic right padding:
  - wide → keep enough room for the native controls (~`pr-[140px]` measured against the native caption buttons; `200px` is over-generous, `140px` is the real footprint on Windows 11).
  - medium → `pr-[140px]` still (native controls are always present with `decorations:true`).
  - narrow → hide the centered search; render a compact search-toggle button next to the theme switch instead, `pr-[140px]`.
- Search `max-w` becomes tier-dependent: wide `440px`, medium `320px`.
- All other styling (colors, typography, hover states, logo SVG) untouched.

**`ChannelGrid`, `LiquidGlassSidebar`, `VideoFrame`** — no changes.

### State delivery

To avoid prop-drilling `layoutTier` through several layers, add a tiny context: `src/context/WindowLayoutContext.tsx` exposing `{ tier, width, height, isMaximized }`. `App` wraps the tree in `<WindowLayoutProvider>`; `Topbar` and any future component consumes `useWindowLayout()`. This keeps the API surface small and avoids touching every component signature.

### Robustness / fallback

- Hook must be safe in plain browser (`npm run dev:web`). All Tauri calls wrapped in try/catch; on failure it falls back to `window.innerWidth` + `resize` listener and `isMaximized=false`. This keeps web dev working and lets the layout still adapt in a browser tab.
- Resize events are throttled via `requestAnimationFrame` to avoid layout thrash during a drag-resize.

### Testing approach

No unit-test framework is configured (`test` script is a no-op). Verification is manual against the checklist below, plus a `tsc --noEmit` type check to ensure no regressions.

**Manual verification matrix:**

| Window state | Expected |
|---|---|
| Maximized (1280+ wide screen) | Identical to today's layout. |
| Restored to ~1000px | Side-by-side player+grid, search ~320px. |
| Snapped left/right half (~640–720px) | Side-by-side player+grid with grid ~300px; no overlap with native controls; search fits without touching logo/theme switch. |
| Dragged very small (≤ 760px, above minWidth 800 not reachable, but if minWidth lowered) | Narrow tier: stacked layout, compact search toggle. |
| Rapid resize drag | No layout jank; throttled updates. |
| `npm run dev:web` in a browser | App runs; layout still adapts to browser window size via the fallback path. |

## Files touched

- **New:** `src/hooks/useWindowState.ts`
- **New:** `src/context/WindowLayoutContext.tsx`
- **Edit:** `src/App.tsx` (consume context, tier-driven classes)
- **Edit:** `src/components/Topbar/index.tsx` (tier-driven padding + narrow-tier compact search)
- **No change:** `tauri.conf.json`, `ChannelGrid`, `LiquidGlassSidebar`, `VideoFrame`, any styling tokens.

## Out of scope

- Custom titlebar / window controls.
- Remembering window size across launches (`tauri-plugin-window-state`) — separate feature.
- Snap-zone visual previews.
