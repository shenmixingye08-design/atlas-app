/**
 * Safe View Transition helpers. Never remount App Router trees.
 * Falls back to a no-op when the API or reduced-motion is unavailable.
 */

export function prefersReducedMotion(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch {
    return false;
  }
}

export function supportsViewTransition(): boolean {
  return (
    typeof document !== "undefined" &&
    typeof document.startViewTransition === "function"
  );
}

/**
 * Run `update` inside a native view transition when it is safe.
 * `update` must not remount form state; it should only trigger navigation.
 */
export function startAppViewTransition(update: () => void): void {
  if (prefersReducedMotion() || !supportsViewTransition()) {
    update();
    return;
  }
  try {
    document.startViewTransition(() => {
      update();
    });
  } catch {
    update();
  }
}
