/**
 * Lite is a decoration profile, never a Reduced Motion substitute.
 *
 * Do not treat Android User-Agent, typical phone widths, or 4-core / 4GB
 * devices as lite. Reduced Motion is read separately by MotionProvider.
 * Lite may drop blur, huge shadows, spark count, and sheen — core
 * translate + scale stay on.
 */

export type MotionMode = "full" | "lite" | "reduced";

export function detectMotionLite(): boolean {
  if (typeof window === "undefined") return false;

  const nav = navigator as Navigator & {
    connection?: { saveData?: boolean; effectiveType?: string };
    deviceMemory?: number;
  };

  if (nav.connection?.saveData) return true;
  const type = nav.connection?.effectiveType;
  if (type === "2g" || type === "slow-2g") return true;

  const cores = nav.hardwareConcurrency;
  const memory = nav.deviceMemory;
  const extremelyLowCores =
    typeof cores === "number" && cores > 0 && cores <= 2;
  const extremelyLowMemory =
    typeof memory === "number" && memory > 0 && memory <= 2;

  return extremelyLowCores && extremelyLowMemory;
}

export function resolveMotionMode(
  lite: boolean,
  reduce: boolean,
): MotionMode {
  if (reduce) return "reduced";
  if (lite) return "lite";
  return "full";
}

export const MOTION_LITE_CLASS = "motion-lite";
export const MOTION_MODE_ATTR = "data-motion-mode";
