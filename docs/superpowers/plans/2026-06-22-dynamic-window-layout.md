# Dynamic Window-Aware Layout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the existing Taranga+ UI rebalance itself dynamically for every native window state (resize, maximize/restore, Windows Snap Layouts, Aero Snap) without changing the visual design.

**Architecture:** A new `useWindowState` hook reads real window geometry from the Tauri backend (`@tauri-apps/api/window`), with a safe browser fallback. The hook feeds a `WindowLayoutContext` that exposes a three-tier layout classification (`narrow` / `medium` / `wide`). `App.tsx` and `Topbar` consume the tier to pick layout classes dynamically instead of relying on Tailwind `lg`/`xl` media queries, which misclassify snapped-half windows.

**Tech Stack:** React 19, TypeScript, `@tauri-apps/api` v2, Tailwind CSS v4. No test framework is configured; verification is `tsc --noEmit` plus the manual matrix defined in the spec.

**Spec:** `docs/superpowers/specs/2026-06-22-dynamic-window-layout-design.md`

---

## File Structure

- **Create:** `src/hooks/useWindowState.ts` — the Tauri-backed window-state hook (geometry + tier derivation + browser fallback).
- **Create:** `src/context/WindowLayoutContext.tsx` — context + provider + `useWindowLayout()` consumer; resolves the tier string from raw geometry.
- **Modify:** `src/App.tsx` — wrap tree in `<WindowLayoutProvider>`; replace `lg:`/`xl:` breakpoint classes on the player/grid split with tier-driven classes.
- **Modify:** `src/components/Topbar/index.tsx` — tier-driven right padding; tier-driven search `max-w`; narrow-tier compact search toggle button.

No changes to `tauri.conf.json`, `ChannelGrid`, `LiquidGlassSidebar`, `VideoFrame`, or styling tokens.

---

## Task 1: `useWindowState` hook

**Files:**
- Create: `src/hooks/useWindowState.ts`

- [ ] **Step 1: Write the hook with tier derivation and Tauri/browser fallback**

Create `src/hooks/useWindowState.ts` with this exact content:

```ts
import { useEffect, useState } from 'react';

export type LayoutTier = 'narrow' | 'medium' | 'wide';

export interface WindowState {
  width: number;
  height: number;
  isMaximized: boolean;
  isSnapped: boolean;
}

export interface WindowLayoutState extends WindowState {
  tier: LayoutTier;
}

const NARROW_MAX = 760;   // below this -> narrow
const MEDIUM_MAX = 1100;  // 760..1099 -> medium, >=1100 -> wide

/**
 * Classify a window width into a layout tier.
 * Exported separately so the context (and tests) can reuse it.
 */
export function deriveTier(width: number): LayoutTier {
  if (width < NARROW_MAX) return 'narrow';
  if (width < MEDIUM_MAX) return 'medium';
  return 'wide';
}

/**
 * Heuristic: a window is "snapped" when it is not maximized and occupies
 * less than 60% of the screen's available width. This only influences which
 * tier we pick — and the tier falls back gracefully if the heuristic is wrong.
 */
function detectSnapped(width: number, isMaximized: boolean): boolean {
  if (isMaximized) return false;
  const screenW = typeof screen !== 'undefined' ? screen.availWidth : 0;
  if (!screenW) return false;
  return width < screenW * 0.6;
}

/**
 * Reactive window state sourced from the Tauri backend when available,
 * with a safe fallback to the browser `resize` listener for `vite dev` / web.
 *
 * All Tauri calls are wrapped so this never throws in a plain browser tab.
 */
export function useWindowState(): WindowLayoutState {
  const [state, setState] = useState<WindowLayoutState>(() => ({
    width: typeof window !== 'undefined' ? window.innerWidth : 1280,
    height: typeof window !== 'undefined' ? window.innerHeight : 720,
    isMaximized: false,
    isSnapped: false,
    tier: deriveTier(typeof window !== 'undefined' ? window.innerWidth : 1280),
  }));

  useEffect(() => {
    let raf = 0;
    let cancelled = false;

    const apply = (width: number, height: number, isMaximized: boolean) => {
      if (cancelled) return;
      setState({
        width,
        height,
        isMaximized,
        isSnapped: detectSnapped(width, isMaximized),
        tier: deriveTier(width),
      });
    };

    // Throttle DOM-triggered updates to one per frame.
    const schedule = (width: number, height: number, isMaximized: boolean) => {
      if (raf) cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => apply(width, height, isMaximized));
    };

    let unlistenResized: (() => void) | undefined;
    let browserFallback = false;

    (async () => {
      try {
        // Dynamic import so the bundle never hard-depends on Tauri in a browser.
        const { getCurrentWindow } = await import('@tauri-apps/api/window');
        const win = getCurrentWindow();

        // Initial read. innerSize() returns physical pixels; convert to CSS px.
        const size = await win.innerSize();
        const dpr = window.devicePixelRatio || 1;
        const maximized = await win.isMaximized();
        apply(size.width / dpr, size.height / dpr, maximized);

        const onResized = async () => {
          const s = await win.innerSize();
          const d = window.devicePixelRatio || 1;
          const m = await win.isMaximized();
          schedule(s.width / d, s.height / d, m);
        };

        const unlisten = await win.onResized(onResized);
        unlistenResized = () => unlisten();
      } catch {
        // Not running under Tauri (e.g. `npm run dev:web`). Use the browser path.
        browserFallback = true;
      }

      if (browserFallback) {
        const onResize = () => schedule(window.innerWidth, window.innerHeight, false);
        window.addEventListener('resize', onResize);
        unlistenResized = () => window.removeEventListener('resize', onResize);
        apply(window.innerWidth, window.innerHeight, false);
      }
    })();

    return () => {
      cancelled = true;
      if (raf) cancelAnimationFrame(raf);
      unlistenResized?.();
    };
  }, []);

  return state;
}
```

- [ ] **Step 2: Type-check**

Run: `npm run lint`
Expected: PASS, no new errors. (If `import('@tauri-apps/api/window')` is flagged, confirm `@tauri-apps/api` is present in `package.json` — it is, `^2.11.1`.)

- [ ] **Step 3: Commit**

```bash
git add src/hooks/useWindowState.ts
git commit -m "feat(window): add useWindowState hook with Tauri + browser fallback"
```

---

## Task 2: `WindowLayoutContext`

**Files:**
- Create: `src/context/WindowLayoutContext.tsx`

- [ ] **Step 1: Create the context, provider, and consumer hook**

Create `src/context/WindowLayoutContext.tsx` with this exact content:

```tsx
import React, { createContext, useContext } from 'react';
import { useWindowState, WindowLayoutState, LayoutTier } from '../hooks/useWindowState';

const Ctx = createContext<WindowLayoutState>({
  width: 1280,
  height: 720,
  isMaximized: false,
  isSnapped: false,
  tier: 'wide',
});

export interface WindowLayoutProviderProps {
  children: React.ReactNode;
}

/**
 * Wraps the app and exposes the current window layout tier + raw geometry.
 * Defaults to a safe `wide` tier for any consumer rendered outside the provider.
 */
export const WindowLayoutProvider: React.FC<WindowLayoutProviderProps> = ({ children }) => {
  const state = useWindowState();
  return <Ctx.Provider value={state}>{children}</Ctx.Provider>;
};

/**
 * Read the current window layout tier. Must be used within <WindowLayoutProvider>.
 */
export function useWindowLayout(): WindowLayoutState {
  return useContext(Ctx);
}

export type { LayoutTier };
```

- [ ] **Step 2: Type-check**

Run: `npm run lint`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/context/WindowLayoutContext.tsx
git commit -m "feat(window): add WindowLayoutContext provider + consumer"
```

---

## Task 3: Wire provider into `App.tsx` and convert player/grid split to tier-driven

**Files:**
- Modify: `src/App.tsx` (whole file — replace imports and the layout-split section)

- [ ] **Step 1: Add imports and wrap the tree in the provider**

At the top of `src/App.tsx`, add to the import block:

```tsx
import { WindowLayoutProvider, useWindowLayout } from './context/WindowLayoutContext';
```

The current `App` component returns the full tree directly. Wrap it so the provider sits at the root. Split the existing `App` body into an inner component that can call the hook:

Replace the top of the file (lines 1–14) imports and the `export default function App() {` line with:

```tsx
import React, { useState, useEffect } from 'react';
import { Topbar } from './components/Topbar';
import { LiquidGlassSidebar } from './components/ui/LiquidGlassSidebar';
import { ChannelGrid } from './components/ChannelGrid';
import { VideoFrame } from './components/VideoFrame';
import { ErrorBoundary } from './components/ErrorBoundary';
import { useChannels } from './hooks/useChannels';
import { useFavorites } from './hooks/useFavorites';
import { useSettings } from './hooks/useSettings';
import { Category, ChannelFinal } from './types';
import { registerLogoCacheWorker, prefetchLogos } from './workers/logoCache';
import { X, Heart } from 'lucide-react';
import { WindowLayoutProvider, useWindowLayout } from './context/WindowLayoutContext';

export default function App() {
  return (
    <ErrorBoundary>
      <WindowLayoutProvider>
        <AppShell />
      </WindowLayoutProvider>
    </ErrorBoundary>
  );
}

function AppShell() {
```

The rest of the body that was inside `App()` (the `useChannels`/`useFavorites`/`useSettings` calls, state, effects, and the JSX tree down to the final closing `</div>`) now lives inside `AppShell()`. Keep it all unchanged except the edits below.

- [ ] **Step 2: Read the tier inside `AppShell`**

Inside `AppShell`, immediately after the `inPlayerState` derivation (currently line 33), add:

```tsx
  const { tier } = useWindowLayout();
  const splitHorizontal = tier !== 'narrow'; // medium + wide go side by side
```

- [ ] **Step 3: Convert the player/grid container to tier-driven classes**

Current `<main>` tag (currently around line 54):

```tsx
        <main className={`flex-1 relative overflow-hidden flex ${inPlayerState ? 'flex-col lg:flex-row' : 'flex-col'} bg-[var(--color-bg-base)] isolate`}>
```

Replace with (uses `splitHorizontal` instead of `lg:flex-row`):

```tsx
        <main className={`flex-1 relative overflow-hidden flex ${inPlayerState && splitHorizontal ? 'flex-row' : 'flex-col'} bg-[var(--color-bg-base)] isolate`}>
```

- [ ] **Step 4: Convert the player section to tier-driven flex + width**

Current player section `<div>` (currently around line 58–60):

```tsx
            <div
              className="flex-1 lg:flex-[2.5] xl:flex-[3] w-full shrink-0 flex flex-col relative z-20 bg-black/60 shadow-[0_8px_32px_rgba(0,0,0,0.5)] border-b lg:border-b-0 lg:border-r border-white/10 h-[55vh] lg:h-full overflow-hidden"
            >
```

Replace with tier-driven flex-grow + width + borders:

```tsx
            <div
              className={`${tier === 'wide' ? 'flex-[3]' : tier === 'medium' ? 'flex-1' : 'w-full'} shrink-0 flex flex-col relative z-20 bg-black/60 shadow-[0_8px_32px_rgba(0,0,0,0.5)] border-b ${splitHorizontal ? 'lg:border-b-0 border-r' : ''} border-white/10 ${tier === 'narrow' ? 'h-[55vh]' : 'h-full'} overflow-hidden`}
            >
```

- [ ] **Step 5: Convert the channel grid wrapper to tier-driven width**

Current grid wrapper `<div>` (currently around line 124):

```tsx
          <div className={`${inPlayerState ? 'w-full lg:w-[320px] xl:w-[380px] shrink-0 h-[45vh] lg:h-full border-t lg:border-t-0 border-white/5 bg-black/20' : 'flex-1'} overflow-hidden relative flex flex-col`}>
```

Replace with:

```tsx
          <div className={`${inPlayerState ? `${tier === 'wide' ? 'w-[380px]' : tier === 'medium' ? 'w-[300px]' : 'w-full'} shrink-0 ${tier === 'narrow' ? 'h-[45vh]' : 'h-full'} border-t ${splitHorizontal ? 'border-t-0' : ''} border-white/5 bg-black/20` : 'flex-1'} overflow-hidden relative flex flex-col`}>
```

- [ ] **Step 6: Type-check**

Run: `npm run lint`
Expected: PASS.

- [ ] **Step 7: Manual smoke test (browser dev)**

Run: `npm run dev:web`, open `http://localhost:1420`.

Resize the browser window through the thresholds and confirm:
- Narrow (< 760px): player and grid stack vertically (grid below player).
- Medium (760–1099px): player left, grid right at ~300px width.
- Wide (≥ 1100px): player left at `flex-[3]`, grid right at 380px — visually identical to today.

- [ ] **Step 8: Commit**

```bash
git add src/App.tsx
git commit -m "feat(window): drive player/grid split from window tier instead of lg/xl"
```

---

## Task 4: Make `Topbar` tier-aware

**Files:**
- Modify: `src/components/Topbar/index.tsx`

- [ ] **Step 1: Add the layout import and read the tier**

In `src/components/Topbar/index.tsx`, add to the top imports:

```tsx
import { useWindowLayout } from '../../context/WindowLayoutContext';
```

Inside the component, after the existing state/refs (after the `debounceRef` declaration block), add:

```tsx
  const { tier } = useWindowLayout();
  const [searchOpen, setSearchOpen] = useState(false);
```

- [ ] **Step 2: Make the right padding + search `max-w` tier-driven**

Current `<header>` tag (line 78):

```tsx
    <header
      className="h-[64px] pl-8 pr-[200px] bg-black/60 border-b border-white/[0.04] flex items-center justify-between sticky top-0 z-40 shadow-sm"
    >
```

Replace with tier-driven right padding (`140px` matches the real Windows 11 caption-button footprint; the old `200px` was over-generous):

```tsx
    <header
      className="h-[64px] pl-8 pr-[140px] bg-black/60 border-b border-white/[0.04] flex items-center justify-between sticky top-0 z-40 shadow-sm"
    >
```

The centered search `<div>` currently has `max-w-[440px]` (line 105):

```tsx
        <div className="absolute left-1/2 -translate-x-1/2 w-full max-w-[440px] px-4" ref={searchRef}>
```

Replace with tier-driven max-width:

```tsx
        <div className={`absolute left-1/2 -translate-x-1/2 w-full px-4 ${tier === 'wide' ? 'max-w-[440px]' : tier === 'medium' ? 'max-w-[320px]' : 'hidden'}`} ref={searchRef}>
```

- [ ] **Step 3: Add the narrow-tier compact search toggle**

Right before the "Right: Theme Switch" block (current line 135), insert a compact search button that shows only in the narrow tier. Find:

```tsx
      {/* Right: Theme Switch */}
      <div className="flex items-center mr-6">
        <ThemeSwitch
          checked={theme === 'dark'}
          onChange={(isDark) => onThemeChange(isDark ? 'dark' : 'light')}
        />
      </div>
```

Replace with:

```tsx
      {/* Right: Compact search toggle (narrow only) + Theme Switch */}
      <div className="flex items-center gap-2 mr-6">
        {tier === 'narrow' && (
          <button
            onClick={() => setSearchOpen(v => !v)}
            className="p-2.5 text-[var(--color-text-secondary)] hover:text-white hover:bg-white/10 rounded-full transition-all duration-300"
            aria-label="Toggle search"
          >
            <Search size={20} strokeWidth={1.5} />
          </button>
        )}
        <ThemeSwitch
          checked={theme === 'dark'}
          onChange={(isDark) => onThemeChange(isDark ? 'dark' : 'light')}
        />
      </div>
```

- [ ] **Step 4: Add the narrow-tier expanded search overlay**

Immediately after the closing `</div>` of the centered search block (which ends the `{!inPlayerState && (...)}` block, currently line 133), and before the "Right: ..." block, add the narrow-tier expanded search panel:

```tsx
      {/* Narrow-tier expanded search panel */}
      {tier === 'narrow' && searchOpen && !inPlayerState && (
        <div className="absolute top-[64px] left-0 right-0 px-4 py-3 bg-black/80 border-b border-white/[0.04] z-50" ref={searchRef}>
          <div className="relative group flex items-center w-full">
            <div className="absolute inset-0 bg-[#1C1C1E] group-hover:bg-[#222226] group-focus-within:bg-[#2C2C2E] rounded-xl transition-colors duration-200 shadow-inner" />
            <Search className="absolute left-4 text-white/40 group-focus-within:text-[var(--color-accent)] transition-colors duration-200 z-10" size={16} strokeWidth={2} />
            <input
              type="text"
              aria-label="Search channels"
              placeholder="Discover something new..."
              value={localQuery}
              onChange={(e) => handleChange(e.target.value)}
              className="w-full relative z-10 bg-transparent border border-white/5 text-white text-[13px] sm:text-sm rounded-xl py-2 pl-10 pr-12 outline-none focus:border-[var(--color-accent)]/30 transition-colors duration-200 placeholder:text-white/30 font-ui"
            />
            {localQuery && (
              <button
                onClick={() => handleChange('')}
                className="absolute right-3.5 z-10 p-1 rounded-md text-white/40 hover:text-white hover:bg-white/20 transition-colors"
                aria-label="Clear search"
              >
                <X size={14} strokeWidth={2} />
              </button>
            )}
          </div>
        </div>
      )}
```

- [ ] **Step 5: Type-check**

Run: `npm run lint`
Expected: PASS.

- [ ] **Step 6: Manual smoke test (browser dev)**

Run: `npm run dev:web`, open `http://localhost:1420`.

- Drag the browser narrower than 760px: centered search disappears; a search icon button appears next to the theme switch; clicking it drops down the search panel; closing it restores the header.
- 760–1099px: centered search at `max-w-[320px]`.
- ≥ 1100px: centered search at `max-w-[440px]`, identical to today.
- Confirm the logo on the left and the theme switch on the right never overlap the search bar at any width.

- [ ] **Step 7: Commit**

```bash
git add src/components/Topbar/index.tsx
git commit -m "feat(window): tier-aware Topbar padding + narrow-tier compact search"
```

---

## Task 5: Full manual verification under Tauri

**Files:** none (verification only)

- [ ] **Step 1: Build and run the Tauri app**

Run: `npm run dev` (launches Tauri dev with the web view).

- [ ] **Step 2: Run the spec's verification matrix**

Confirm each case against the spec's "Manual verification matrix":

| Window state | Expected |
|---|---|
| Maximized (1280+ screen) | Identical to today's layout (player left `flex-[3]`, grid right 380px, search 440px). |
| Restored to ~1000px | Side-by-side player+grid, grid ~300px, search ~320px. |
| Snapped left/right half (~640–720px) | Side-by-side player+grid with grid ~300px; no overlap with native caption buttons; search fits without touching logo/theme switch. |
| Dragged to narrow (< 760px) | Narrow tier: stacked layout, compact search toggle button. |
| Rapid resize drag | No layout jank; updates throttled to one per frame. |
| `npm run dev:web` in a browser | App runs; layout adapts via the browser fallback path. |

For the snap test on Windows 11: hover the native Maximize button to open Snap Layouts and pick a half/quarter; also test Win+LeftArrow / Win+RightArrow and edge-drag Aero Snap. For each, confirm the UI rebalances without overflow or overlap.

- [ ] **Step 3: Confirm native behaviors intact**

Confirm the native titlebar still shows Minimize/Maximize/Close and that Windows 11 Snap Layouts still appears on Maximize hover (these must work unchanged because `decorations: true` is untouched).

- [ ] **Step 4: Final type-check**

Run: `npm run lint`
Expected: PASS, no errors.

- [ ] **Step 5: Commit any final tweaks, if needed**

If Step 2 surfaced any tweaks, commit them with a clear message. If no tweaks were needed, nothing to commit — the feature is complete.

---

## Self-Review Notes

- **Spec coverage:** Every spec section maps to a task — `useWindowState` hook (Task 1), context (Task 2), `App.tsx` tier-driven split (Task 3), `Topbar` tier-driven padding + narrow search (Task 4), verification matrix (Task 5). The browser-fallback requirement, throttle-via-rAF, and dynamic Tauri import are all in Task 1.
- **Type consistency:** `LayoutTier`, `WindowLayoutState`, `WindowState` defined in Task 1 and re-exported/used consistently in Tasks 2–4. `useWindowLayout()` and `WindowLayoutProvider` defined in Task 2 and consumed in Tasks 3–4.
- **No test framework:** TDD step is replaced by `tsc --noEmit` + the manual matrix explicitly defined in the spec, since `package.json` has no test runner. This is called out in the plan header so the executor doesn't expect a failing-test-first flow.
