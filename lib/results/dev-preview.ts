"use client";

/**
 * DEV-ONLY bridge so `/dev/results-flow-preview` can prove the REAL
 * `/results/<notificationId>` route renders a 成果物 without a Clerk login.
 *
 * The results data API requires auth, so a logged-out dev browser gets 401. In
 * that case (dev only) the results page reads this seeded notification→target
 * map from localStorage and resolves the exact project from the client cache —
 * exercising the same components production uses. No-op / ignored in production.
 */
export type DevResultTarget = { targetType: string; targetId: string };

const DEV_RESULT_TARGETS_KEY = "atlas_dev_result_targets";

function isDev(): boolean {
  return process.env.NODE_ENV !== "production";
}

export function seedDevResultTarget(
  notificationId: string,
  target: DevResultTarget,
): void {
  if (!isDev()) return;
  try {
    const raw = window.localStorage.getItem(DEV_RESULT_TARGETS_KEY);
    const map = (raw ? JSON.parse(raw) : {}) as Record<string, DevResultTarget>;
    map[notificationId] = target;
    window.localStorage.setItem(DEV_RESULT_TARGETS_KEY, JSON.stringify(map));
  } catch {
    // best-effort; dev-only
  }
}

export function readDevResultTarget(
  notificationId: string,
): DevResultTarget | null {
  if (!isDev()) return null;
  try {
    const raw = window.localStorage.getItem(DEV_RESULT_TARGETS_KEY);
    if (!raw) return null;
    const map = JSON.parse(raw) as Record<string, DevResultTarget>;
    return map[notificationId] ?? null;
  } catch {
    return null;
  }
}
