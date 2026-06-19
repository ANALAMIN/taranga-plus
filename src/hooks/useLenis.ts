import { useEffect } from 'react';
import Lenis from 'lenis';
import 'lenis/dist/lenis.css';

export function useLenis(): void {
  useEffect(() => {
    const lenis = new Lenis({
      duration: 0.7, // Snappier response
      easing: (t: number) => 1 - Math.pow(1 - t, 4),
      orientation: 'vertical',
      smoothWheel: true,
      touchMultiplier: 0,
      prevent: (node: Element) => node.id === 'video-player-container',
    });

    function raf(time: number): void {
      lenis.raf(time);
      requestAnimationFrame(raf);
    }

    const rafId = requestAnimationFrame(raf);

    return () => {
      cancelAnimationFrame(rafId);
      lenis.destroy();
    };
  }, []);
}
