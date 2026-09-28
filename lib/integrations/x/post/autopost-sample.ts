import type { XAutoPostSettings } from "./autopost-types";

/** Pre-connect sample: never posts; limited per user per day (cost control). */
export const X_SAMPLE_RATE_LIMIT = {
  bucket: "x-sample",
  max: 3,
  windowMs: 24 * 60 * 60 * 1000,
  minIntervalMs: 2_000,
} as const;

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
    purpose: "日常・活動報告",
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
