/**
 * Shared motion tokens for MINERVOT.
 * Visual timing only — do not use these values to fake progress or job status.
 */

export const MOTION_MS = {
  tap: 140,
  base: 220,
  page: 240,
  modal: 280,
  backdrop: 200,
  stagger: 45,
  number: 200,
  complete: 580,
} as const;

export const MOTION_EASE_OUT = [0.25, 0.1, 0.25, 1] as const;

/** Soft settle without a visible bounce. */
export const MOTION_SPRING_SOFT = {
  type: "spring" as const,
  stiffness: 380,
  damping: 34,
  mass: 0.72,
};

export const MOTION_SCALE = {
  tap: 0.978,
  tapCard: 0.985,
} as const;

export const MOTION_Y = {
  page: 6,
  card: 8,
  modal: 16,
  complete: 10,
} as const;

/** First N list items may stagger; the rest appear immediately. */
export const MOTION_STAGGER_CAP = 8;

export const MOTION_TRANSITION = {
  tap: { duration: MOTION_MS.tap / 1000, ease: MOTION_EASE_OUT },
  base: { duration: MOTION_MS.base / 1000, ease: MOTION_EASE_OUT },
  page: { duration: MOTION_MS.page / 1000, ease: MOTION_EASE_OUT },
  backdrop: { duration: MOTION_MS.backdrop / 1000, ease: MOTION_EASE_OUT },
  modal: MOTION_SPRING_SOFT,
  nav: { duration: MOTION_MS.base / 1000, ease: MOTION_EASE_OUT },
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
