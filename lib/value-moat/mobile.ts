/** TEST 11 — Home / history / rerun / Memory / deliverable stay operable on phones. */

export const MIN_TOUCH_TARGET_PX = 44;

export const MOBILE_REQUIRED_SURFACES = [
  "home",
  "history",
  "rerun",
  "memory_notice",
  "deliverable",
] as const;

export function hasMobileSafeAreaClass(className: string): boolean {
  return (
    className.includes("safe-area-inset") ||
    className.includes("env(safe-area-inset")
  );
}

export function hasTouchTargetClass(className: string): boolean {
  return (
    className.includes("min-h-[var(--touch-target)]") ||
    className.includes("min-h-13") ||
    className.includes("min-h-11")
  );
}
