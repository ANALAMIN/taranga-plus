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

const NARROW_MAX = 760;
const MEDIUM_MAX = 1100;

export function deriveTier(width: number): LayoutTier {
  if (width < NARROW_MAX) return 'narrow';
  if (width < MEDIUM_MAX) return 'medium';
  return 'wide';
}

function detectSnapped(width: number, isMaximized: boolean): boolean {
  if (isMaximized) return false;
  const screenW = typeof screen !== 'undefined' ? screen.availWidth : 0;
  if (!screenW) return false;
  return width < screenW * 0.6;
}

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
      setState({ width, height, isMaximized, isSnapped: detectSnapped(width, isMaximized), tier: deriveTier(width) });
    };

    const schedule = (width: number, height: number, isMaximized: boolean) => {
      if (raf) cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => apply(width, height, isMaximized));
    };

    const onResize = () => schedule(window.innerWidth, window.innerHeight, false);
    window.addEventListener('resize', onResize);
    apply(window.innerWidth, window.innerHeight, false);

    return () => {
      cancelled = true;
      if (raf) cancelAnimationFrame(raf);
      window.removeEventListener('resize', onResize);
    };
  }, []);

  return state;
}
