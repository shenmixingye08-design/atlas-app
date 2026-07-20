import "server-only";

import { createServiceRoleClientIfConfigured } from "@/lib/supabase/service-role";

import {
  createDefaultXAutoPostSettings,
  type XAutoPostFrequency,
  type XAutoPostMode,
  type XAutoPostSettings,
} from "./autopost-types";

const TABLE = "atlas_x_autopost_settings" as const;

type SettingsRow = {
  user_id: string;
  enabled: boolean;
  mode: string;
  purpose: string;
  themes: unknown;
  audience: string;
  tone: string;
  frequency: string;
  days_of_week: unknown;
  post_times: unknown;
  timezone: string;
  include_hashtags: boolean;
  created_at: string;
  updated_at: string;
};

/** Partial patch a caller may send from the settings form. */
export type XAutoPostSettingsPatch = Partial<
  Pick<
    XAutoPostSettings,
    | "enabled"
    | "mode"
    | "purpose"
    | "themes"
    | "audience"
    | "tone"
    | "frequency"
    | "daysOfWeek"
    | "postTimes"
    | "timezone"
    | "includeHashtags"
  >
>;

/** Local dev fallback when Supabase is not configured. */
function getMemoryStore(): Map<string, XAutoPostSettings> {
  const scope = globalThis as typeof globalThis & {
    __atlasXAutoPostSettings?: Map<string, XAutoPostSettings>;
  };
  if (!scope.__atlasXAutoPostSettings) {
    scope.__atlasXAutoPostSettings = new Map();
  }
  return scope.__atlasXAutoPostSettings;
}

function toStringArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.filter((item): item is string => typeof item === "string");
  }
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed)
        ? parsed.filter((item): item is string => typeof item === "string")
        : [];
    } catch {
      return [];
    }
  }
  return [];
}

function toNumberArray(value: unknown): number[] {
  const raw = Array.isArray(value)
    ? value
    : typeof value === "string"
      ? (() => {
          try {
            return JSON.parse(value);
          } catch {
            return [];
          }
        })()
      : [];
  if (!Array.isArray(raw)) return [];
  return raw
    .map((item) => Number(item))
    .filter((item) => Number.isInteger(item) && item >= 0 && item <= 6);
}

function normalizeMode(value: unknown): XAutoPostMode {
  return value === "full_auto" ? "full_auto" : "approval";
}

const VALID_FREQUENCIES: XAutoPostFrequency[] = [
  "daily_1",
  "daily_2",
  "daily_3",
  "weekly_1",
  "weekly_3",
  "custom",
];

function normalizeFrequency(value: unknown): XAutoPostFrequency {
  return VALID_FREQUENCIES.includes(value as XAutoPostFrequency)
    ? (value as XAutoPostFrequency)
    : "daily_1";
}

const TIME_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/;

/** Keep only valid "HH:mm" strings, deduped + sorted; cap to 3 per day. */
export function normalizePostTimes(times: string[]): string[] {
  const valid = times
    .map((time) => time.trim())
    .filter((time) => TIME_PATTERN.test(time));
  const unique = [...new Set(valid)].sort();
  return unique.slice(0, 3);
}

function rowToSettings(row: SettingsRow): XAutoPostSettings {
  const defaults = createDefaultXAutoPostSettings(row.user_id);
  const postTimes = normalizePostTimes(toStringArray(row.post_times));
  return {
    userId: row.user_id,
    enabled: Boolean(row.enabled),
    mode: normalizeMode(row.mode),
    purpose: typeof row.purpose === "string" ? row.purpose : defaults.purpose,
    themes: toStringArray(row.themes),
    audience:
      typeof row.audience === "string" ? row.audience : defaults.audience,
    tone: typeof row.tone === "string" ? row.tone : defaults.tone,
    frequency: normalizeFrequency(row.frequency),
    daysOfWeek: toNumberArray(row.days_of_week),
    postTimes: postTimes.length > 0 ? postTimes : defaults.postTimes,
    timezone:
      typeof row.timezone === "string" && row.timezone.trim()
        ? row.timezone
        : "Asia/Tokyo",
    includeHashtags: Boolean(row.include_hashtags),
    createdAt: row.created_at ?? defaults.createdAt,
    updatedAt: row.updated_at ?? defaults.updatedAt,
  };
}

function settingsToRow(settings: XAutoPostSettings): SettingsRow {
  return {
    user_id: settings.userId,
    enabled: settings.enabled,
    mode: settings.mode,
    purpose: settings.purpose,
    themes: settings.themes,
    audience: settings.audience,
    tone: settings.tone,
    frequency: settings.frequency,
    days_of_week: settings.daysOfWeek,
    post_times: settings.postTimes,
    timezone: settings.timezone,
    include_hashtags: settings.includeHashtags,
    created_at: settings.createdAt,
    updated_at: settings.updatedAt,
  };
}

function applyPatch(
  base: XAutoPostSettings,
  patch: XAutoPostSettingsPatch,
): XAutoPostSettings {
  return {
    ...base,
    ...(patch.enabled !== undefined && { enabled: Boolean(patch.enabled) }),
    ...(patch.mode !== undefined && { mode: normalizeMode(patch.mode) }),
    ...(patch.purpose !== undefined && {
      purpose: String(patch.purpose).slice(0, 200),
    }),
    ...(patch.themes !== undefined && {
      themes: toStringArray(patch.themes)
        .map((theme) => theme.trim())
        .filter(Boolean)
        .slice(0, 10),
    }),
    ...(patch.audience !== undefined && {
      audience: String(patch.audience).slice(0, 200),
    }),
    ...(patch.tone !== undefined && { tone: String(patch.tone).slice(0, 200) }),
    ...(patch.frequency !== undefined && {
      frequency: normalizeFrequency(patch.frequency),
    }),
    ...(patch.daysOfWeek !== undefined && {
      daysOfWeek: [...new Set(toNumberArray(patch.daysOfWeek))].sort(),
    }),
    ...(patch.postTimes !== undefined && {
      postTimes: normalizePostTimes(toStringArray(patch.postTimes)),
    }),
    ...(patch.timezone !== undefined && {
      timezone: String(patch.timezone).trim() || "Asia/Tokyo",
    }),
    ...(patch.includeHashtags !== undefined && {
      includeHashtags: Boolean(patch.includeHashtags),
    }),
    updatedAt: new Date().toISOString(),
  };
}

/** Load a user's auto-post settings (defaults when never configured). */
export async function loadXAutoPostSettings(
  userId: string,
): Promise<XAutoPostSettings> {
  const client = createServiceRoleClientIfConfigured();
  if (!client) {
    return getMemoryStore().get(userId) ?? createDefaultXAutoPostSettings(userId);
  }

  try {
    const { data, error } = await client
      .from(TABLE)
      .select("*")
      .eq("user_id", userId)
      .maybeSingle();

    if (error) {
      console.warn("[X AutoPost] settings load failed:", error.message);
      return createDefaultXAutoPostSettings(userId);
    }
    if (!data) return createDefaultXAutoPostSettings(userId);
    return rowToSettings(data as SettingsRow);
  } catch (error) {
    console.warn("[X AutoPost] settings load skipped");
    if (error instanceof Error) {
      console.warn("[X AutoPost] load detail:", error.message);
    }
    return createDefaultXAutoPostSettings(userId);
  }
}

/** Merge + persist a settings patch, returning the stored settings. */
export async function saveXAutoPostSettings(
  userId: string,
  patch: XAutoPostSettingsPatch,
): Promise<XAutoPostSettings> {
  const existing = await loadXAutoPostSettings(userId);
  const next = applyPatch(existing, patch);

  const client = createServiceRoleClientIfConfigured();
  if (!client) {
    getMemoryStore().set(userId, next);
    return next;
  }

  try {
    const { error } = await client
      .from(TABLE)
      .upsert(settingsToRow(next), { onConflict: "user_id" });
    if (error) {
      console.warn("[X AutoPost] settings upsert failed:", error.message);
    }
  } catch (error) {
    console.warn("[X AutoPost] settings upsert skipped");
    if (error instanceof Error) {
      console.warn("[X AutoPost] upsert detail:", error.message);
    }
  }

  return next;
}

/** All users with auto-post enabled (used by the scheduled job). */
export async function listEnabledXAutoPostSettings(): Promise<
  XAutoPostSettings[]
> {
  const client = createServiceRoleClientIfConfigured();
  if (!client) {
    return [...getMemoryStore().values()].filter((s) => s.enabled);
  }

  try {
    const { data, error } = await client
      .from(TABLE)
      .select("*")
      .eq("enabled", true);
    if (error) {
      console.warn("[X AutoPost] enabled list failed:", error.message);
      return [];
    }
    return (data as SettingsRow[]).map(rowToSettings);
  } catch (error) {
    console.warn("[X AutoPost] enabled list skipped");
    if (error instanceof Error) {
      console.warn("[X AutoPost] list detail:", error.message);
    }
    return [];
  }
}

/** Test helper. */
export function resetXAutoPostSettingsMemory(): void {
  getMemoryStore().clear();
}
