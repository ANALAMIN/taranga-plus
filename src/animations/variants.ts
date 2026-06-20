/**
 * PURPOSE: All Framer Motion animation variants in ONE place.
 * This ensures consistent animations across all components.
 */

import type { Variants } from 'motion';

export const DURATION = {
  micro:   0.12,
  fast:    0.20,
  normal:  0.30,
  slow:    0.45,
  xslow:   0.60,
} as const;

export const EASE = {
  out:       [0.0, 0.0, 0.2, 1.0],
  in:        [0.4, 0.0, 1.0, 1.0],
  inOut:     [0.4, 0.0, 0.2, 1.0],
  spring:    { type: 'spring', stiffness: 400, damping: 30 },
} as const;

export const fadeIn: Variants = {
  hidden:  { opacity: 0 },
  visible: { opacity: 1, transition: { duration: DURATION.fast, ease: EASE.out } },
  exit:    { opacity: 0, transition: { duration: DURATION.micro, ease: EASE.in } },
};

export const slideInRight: Variants = {
  hidden:  { x: 360, opacity: 0 },
  visible: { x: 0,   opacity: 1, transition: { duration: DURATION.slow, ease: EASE.out } },
  exit:    { x: 360, opacity: 0, transition: { duration: DURATION.normal, ease: EASE.in } },
};

export const slideInLeft: Variants = {
  hidden:  { x: -220, opacity: 0 },
  visible: { x: 0,    opacity: 1, transition: { duration: DURATION.normal, ease: EASE.out } },
  exit:    { x: -220, opacity: 0, transition: { duration: DURATION.fast, ease: EASE.in } },
};

export const scaleUp: Variants = {
  hidden:  { scale: 0.96, opacity: 0 },
  visible: { scale: 1.00, opacity: 1, transition: { duration: DURATION.fast, ease: EASE.out } },
  exit:    { scale: 0.96, opacity: 0, transition: { duration: DURATION.micro, ease: EASE.in } },
};

export const staggerContainer: Variants = {
  hidden:  { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.025,
      delayChildren:   0.05,
    },
  },
};

export const cardItem: Variants = {
  hidden:  { opacity: 0, y: 12, scale: 0.97 },
  visible: {
    opacity: 1, y: 0, scale: 1,
    transition: { duration: DURATION.fast, ease: EASE.out },
  },
};

export const cardHover = {
  scale: 1.04,
  y: -4,
  transition: EASE.spring,
};

export const cardTap = {
  scale: 0.98,
  transition: { duration: DURATION.micro, ease: EASE.inOut },
};

export const controlsOverlay: Variants = {
  hidden:  { opacity: 0 },
  visible: { opacity: 1, transition: { duration: DURATION.fast, ease: EASE.out } },
  exit:    { opacity: 0, transition: { duration: DURATION.slow, ease: EASE.in } },
};
