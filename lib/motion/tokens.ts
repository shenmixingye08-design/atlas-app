/**
 * Shared motion tokens for MINERVOT.
 * Visual timing only — do not use these values to fake progress or job status.
 *
 * Strength target: elegant, but anyone can see that something moved.
 * Lite may drop blur / sparks / sheen. Core translate + scale stay on.
 */

export const MOTION_MS = {
  tap: 140,
  base: 240,
  page: 280,
  modal: 300,
  backdrop: 180,
  stagger: 70,
  number: 200,
  complete: 960,
} as const;

export const MOTION_EASE_OUT = [0.25, 0.1, 0.25, 1] as const;

/** Soft settle without a visible bounce. */
export const MOTION_SPRING_SOFT = {
  type: "spring" as const,
  stiffness: 380,
  damping: 34,
  mass: 0.72,
};

/** Short press-in, spring back. */
export const MOTION_SPRING_TAP = {
  type: "spring" as const,
  stiffness: 560,
  damping: 28,
  mass: 0.55,
};

export const MOTION_SCALE = {
  tap: 0.96,
  tapCard: 0.97,
  tapNav: 0.94,
  page: 0.985,
  home: 0.98,
  card: 0.97,
  cardExit: 0.96,
  complete: 0.96,
  modal: 0.98,
  navIcon: 1.12,
} as const;

export const MOTION_Y = {
  page: 16,
  pageLite: 12,
  home: 18,
  card: 20,
  modal: 32,
  complete: 24,
  navLabel: -3,
} as const;

/** First N list items may stagger; the rest appear immediately. */
export const MOTION_STAGGER_CAP = 8;

export const MOTION_TRANSITION = {
  tap: MOTION_SPRING_TAP,
  base: { duration: MOTION_MS.base / 1000, ease: MOTION_EASE_OUT },
  page: { duration: MOTION_MS.page / 1000, ease: MOTION_EASE_OUT },
  backdrop: { duration: MOTION_MS.backdrop / 1000, ease: MOTION_EASE_OUT },
  modal: MOTION_SPRING_SOFT,
  nav: MOTION_SPRING_SOFT,
  progress: { duration: 0.26, ease: MOTION_EASE_OUT },
  number: { duration: MOTION_MS.number / 1000, ease: MOTION_EASE_OUT },
  complete: { duration: MOTION_MS.complete / 1000, ease: MOTION_EASE_OUT },
} as const;

export const MOTION_PLAY_KEYS = {
  homeIntro: "atlas.motion.home-intro",
  todayIntro: "atlas.motion.today-intro",
  settingsIntro: "atlas.motion.settings-intro",
  completePrefix: "atlas.motion.complete:",
} as const;

export const MOTION_REDUCED = {
  duration: 0.01,
  ease: "linear" as const,
};

/** Minimum page travel on lite — never drop to opacity-only. */
export function pageTravelY(lite: boolean): number {
  return lite ? Math.max(MOTION_Y.pageLite, 10) : MOTION_Y.page;
}
