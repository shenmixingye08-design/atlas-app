import type { XAutoPostSettings } from "./autopost-types";

const DAY_MS = 24 * 60 * 60 * 1000;

/** Hard cost cap: generation attempts per user per day (failures included). */
export const X_SAMPLE_ATTEMPT_LIMIT = {
  bucket: "x-sample-attempt",
  max: 6,
  windowMs: DAY_MS,
  minIntervalMs: 2_000,
} as const;

/** User-facing allowance: successful samples per user per day. */
export const X_SAMPLE_RATE_LIMIT = {
  bucket: "x-sample",
  max: 3,
  windowMs: DAY_MS,
} as const;

/**
 * Samples decide whether someone connects X, so they use the strong tier and
 * the most substantive post type (a concrete tip), never a random one-liner.
 */
export const X_SAMPLE_AI_TASK_TYPE = "worker_deliverable" as const;
export const X_SAMPLE_POST_TYPE = "knowhow" as const;

export const X_SAMPLE_THEME_MAX = 60;

export type XSampleInput = { theme: string; audience?: string | null };

export function parseXSampleInput(body: unknown): XSampleInput | null {
  if (!body || typeof body !== "object") return null;
  const raw = body as { theme?: unknown; audience?: unknown };
  const theme = typeof raw.theme === "string" ? raw.theme.trim() : "";
  if (!theme || theme.length > X_SAMPLE_THEME_MAX) return null;
  const audience =
    typeof raw.audience === "string" && raw.audience.trim()
      ? raw.audience.trim().slice(0, X_SAMPLE_THEME_MAX)
      : null;
  return { theme, audience };
}

/** Transient settings for one sample — never persisted. */
export function buildSampleSettings(
  userId: string,
  input: XSampleInput,
  now = new Date(),
): XAutoPostSettings {
  const iso = now.toISOString();
  return {
    userId,
    enabled: false,
    mode: "approval",
    purpose: "有益情報の発信",
    themes: [input.theme],
    audience: input.audience ?? "",
    tone: "",
    frequency: "daily_1",
    daysOfWeek: [],
    postTimes: ["18:00"],
    timezone: "Asia/Tokyo",
    includeHashtags: true,
    createdAt: iso,
    updatedAt: iso,
  };
}
