import type { Transition, Variants } from "framer-motion";

/**
 * Shared motion language — DECISIONS.md D-24.
 *
 * Every animated component pulls from here so timing feels like one product
 * rather than a collection of independently-tuned widgets.
 */

export const EASE_LUXE = [0.22, 1, 0.36, 1] as const;
export const EASE_SPRING = [0.34, 1.56, 0.64, 1] as const;

export const DURATION = {
  micro: 0.15,
  fast: 0.2,
  base: 0.3,
  slow: 0.4,
  page: 0.5,
} as const;

export const spring = {
  soft: { type: "spring", stiffness: 260, damping: 30 },
  snappy: { type: "spring", stiffness: 420, damping: 34 },
  bouncy: { type: "spring", stiffness: 500, damping: 22 },
} satisfies Record<string, Transition>;

export const ease = {
  micro: { duration: DURATION.micro, ease: EASE_LUXE },
  fast: { duration: DURATION.fast, ease: EASE_LUXE },
  base: { duration: DURATION.base, ease: EASE_LUXE },
  slow: { duration: DURATION.slow, ease: EASE_LUXE },
} satisfies Record<string, Transition>;

/* ---------- Common variants ---------- */

export const fadeUp: Variants = {
  hidden: { opacity: 0, y: 14 },
  show: { opacity: 1, y: 0, transition: ease.slow },
};

export const fadeIn: Variants = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: ease.base },
};

export const popIn: Variants = {
  hidden: { opacity: 0, scale: 0.9 },
  show: { opacity: 1, scale: 1, transition: spring.bouncy },
};

export const slideUpSheet: Variants = {
  hidden: { y: "100%" },
  show: { y: 0, transition: spring.snappy },
  exit: { y: "100%", transition: ease.fast },
};

export const staggerParent = (stagger = 0.06): Variants => ({
  hidden: {},
  show: { transition: { staggerChildren: stagger } },
});

/* ---------- Haptics ---------- */

type HapticKind = "tap" | "success" | "warning" | "error" | "select";

const PATTERNS: Record<HapticKind, number | number[]> = {
  tap: 8,
  select: 5,
  success: [12, 40, 12],
  warning: [10, 60, 10, 60, 10],
  error: [30, 50, 30],
};

/**
 * Fires device vibration where supported. Silently no-ops everywhere else —
 * never gate functionality on this.
 */
export function haptic(kind: HapticKind = "tap") {
  if (typeof navigator === "undefined") return;
  if (typeof navigator.vibrate !== "function") return;
  if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
  try {
    navigator.vibrate(PATTERNS[kind]);
  } catch {
    /* vibration blocked by permissions policy */
  }
}
