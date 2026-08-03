/**
 * Cron Single Source of Truth (SoT).
 * Code / Vercel / GitHub Actions / DB / Owner UI must agree with this module.
 *
 * Hobby Vercel cannot run `* * * * *` — minute cadence is GitHub Actions.
 * Vercel Pro: copy `vercelProMinuteTick` into vercel.json (see vercel.cron.pro.json).
 */

export type CronProvider = "github_actions" | "vercel_hobby" | "vercel_pro";

export type InfrastructureCronEntry = {
  id: string;
  /** Standard 5-field cron (UTC unless noted). */
  schedule: string;
  path: string;
  providers: readonly CronProvider[];
  purpose: string;
};

/** Product schedule preset types supported in production. */
export type ProductionSchedulePresetType =
  | "minutely"
  | "hourly"
  | "daily"
  | "weekly"
  | "monthly";

/**
 * Infrastructure tick cadences — who wakes `/api/automations/tick`.
 * Product presets (minutely…monthly) are evaluated inside the tick against DB nextRun.
 */
export const INFRASTRUCTURE_CRON_SOT: readonly InfrastructureCronEntry[] = [
  {
    id: "minute_due_tick",
    schedule: "* * * * *",
    path: "/api/automations/tick",
    providers: ["github_actions", "vercel_pro"],
    purpose: "Enqueue due occurrences every minute (production cadence)",
  },
  {
    id: "hourly_due_tick_backup",
    schedule: "0 * * * *",
    path: "/api/automations/tick",
    providers: ["github_actions"],
    purpose: "Hourly safety tick — recovers if a minute tick was missed",
  },
  {
    id: "daily_hobby_tick",
    schedule: "0 0 * * *",
    path: "/api/automations/tick",
    providers: ["vercel_hobby"],
    purpose: "Hobby Vercel fallback (not sufficient alone for minutely/hourly)",
  },
] as const;

/** Canonical product cron templates derived from presets. */
export const PRODUCT_CRON_TEMPLATES: Record<
  ProductionSchedulePresetType,
  string
> = {
  minutely: "* * * * *",
  hourly: "M * * * *", // M = minute-of-hour
  daily: "M H * * *",
  weekly: "M H * * D",
  monthly: "M H DOM * *",
};

export function listInfrastructureCronsForProvider(
  provider: CronProvider,
): InfrastructureCronEntry[] {
  return INFRASTRUCTURE_CRON_SOT.filter((entry) =>
    entry.providers.includes(provider),
  );
}

/** Hobby vercel.json must contain exactly this daily schedule. */
export function expectedVercelHobbyCron(): InfrastructureCronEntry {
  const entry = INFRASTRUCTURE_CRON_SOT.find((e) => e.id === "daily_hobby_tick");
  if (!entry) throw new Error("cron_sot_missing_daily_hobby");
  return entry;
}

/** GitHub Actions minute scheduler must use this schedule. */
export function expectedGithubActionsMinuteCron(): InfrastructureCronEntry {
  const entry = INFRASTRUCTURE_CRON_SOT.find((e) => e.id === "minute_due_tick");
  if (!entry) throw new Error("cron_sot_missing_minute");
  return entry;
}

export function expectedVercelProMinuteCron(): InfrastructureCronEntry {
  return expectedGithubActionsMinuteCron();
}

export const PRODUCTION_PRESET_TYPES: readonly ProductionSchedulePresetType[] = [
  "minutely",
  "hourly",
  "daily",
  "weekly",
  "monthly",
] as const;
