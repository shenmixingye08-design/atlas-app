import "server-only";

import type { SchedulerEnvironment } from "./types";

export function resolveSchedulerEnvironment(): SchedulerEnvironment {
  const vercel = process.env.VERCEL_ENV?.trim().toLowerCase();
  if (vercel === "production") return "production";
  if (vercel === "preview") return "preview";
  if (process.env.NODE_ENV === "test" || process.env.VITEST === "true") {
    return "test";
  }
  if (process.env.NODE_ENV === "production") return "production";
  return "development";
}

export function isSchedulerProductionEnv(
  env: SchedulerEnvironment = resolveSchedulerEnvironment(),
): boolean {
  return env === "production";
}

/**
 * Preview must not execute Production schedules.
 * Allow only when explicitly enabled for Preview-dedicated data.
 */
export function assertSchedulerEnvironmentAllowed(
  env: SchedulerEnvironment = resolveSchedulerEnvironment(),
): { ok: true } | { ok: false; errorCode: string; message: string } {
  if (env === "preview") {
    const allow =
      process.env.SCHEDULER_ALLOW_PREVIEW_TICK?.trim().toLowerCase() === "true";
    if (!allow) {
      return {
        ok: false,
        errorCode: "scheduler_preview_blocked",
        message:
          "Preview Scheduler tick is disabled (set SCHEDULER_ALLOW_PREVIEW_TICK=true only for Preview-dedicated data)",
      };
    }
  }
  return { ok: true };
}

/**
 * Formal app URL for external callers (GH Actions). Not used for in-process tick.
 */
export function resolveSchedulerAppUrl(): string | null {
  const raw =
    process.env.ATLAS_APP_URL?.trim() ||
    process.env.NEXT_PUBLIC_APP_URL?.trim() ||
    "";
  if (!raw) return null;
  try {
    const url = new URL(raw);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    return url.toString().replace(/\/$/, "");
  } catch {
    return null;
  }
}
