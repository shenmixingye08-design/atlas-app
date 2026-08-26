/**
 * Lightweight motion profile for 360–390px Android and constrained devices.
 * Visual language stays the same; bloom blur, sparkles, and list layout
 * animation are dropped.
 */

export function detectMotionLite(): boolean {
  if (typeof window === "undefined") return false;

  try {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      return true;
    }
    if (window.matchMedia("(prefers-reduced-transparency: reduce)").matches) {
      return true;
    }
  } catch {
    /* matchMedia can throw in odd webviews */
  }

  const nav = navigator as Navigator & {
    connection?: { saveData?: boolean; effectiveType?: string };
    deviceMemory?: number;
  };
  if (nav.connection?.saveData) return true;
  const type = nav.connection?.effectiveType;
  if (type === "2g" || type === "slow-2g") return true;

  const narrow = window.innerWidth > 0 && window.innerWidth <= 390;
  const lowCores =
    typeof nav.hardwareConcurrency === "number" &&
    nav.hardwareConcurrency > 0 &&
    nav.hardwareConcurrency <= 4;
  const lowMemory =
    typeof nav.deviceMemory === "number" && nav.deviceMemory > 0 && nav.deviceMemory <= 4;

  return narrow && (lowCores || lowMemory);
}

export const MOTION_LITE_CLASS = "motion-lite";
