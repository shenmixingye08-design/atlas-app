/**
 * Honest schedule capability matrix for Scheduler Production Trust.
 * Unsupported items are reported as 未実装 — never silent PASS.
 */

export type ScheduleCapability =
  | "minutely"
  | "hourly"
  | "daily"
  | "weekly"
  | "monthly"
  | "cron"
  | "timezone"
  | "dst"
  | "holiday_exclusion"
  | "business_days";

export const WORK_QUEUE_SCHEDULE_CAPABILITIES: Record<
  ScheduleCapability,
  { status: "supported" | "partial" | "unsupported"; note: string }
> = {
  minutely: {
    status: "supported",
    note: "SchedulePreset minutely + GitHub Actions / Vercel Pro minute tick",
  },
  hourly: {
    status: "supported",
    note: "SchedulePreset hourly + minute tick evaluates due nextRun",
  },
  daily: { status: "supported", note: "V1 SchedulePreset daily" },
  weekly: { status: "supported", note: "V1 SchedulePreset weekly" },
  monthly: { status: "supported", note: "V1 SchedulePreset monthly" },
  cron: {
    status: "supported",
    note: "Cron SoT: lib/work-queue/cron-sot.ts — presetToCron + infra ticks aligned",
  },
  timezone: { status: "supported", note: "IANA via Intl" },
  dst: {
    status: "supported",
    note: "zoned parts / offset 再計算。回帰テストで証明",
  },
  holiday_exclusion: {
    status: "unsupported",
    note: "祝日除外は新機能のため未実装",
  },
  business_days: {
    status: "partial",
    note: "weekdays 相当のみ。祝日なし",
  },
};

export function listScheduleCapabilities() {
  return (Object.keys(WORK_QUEUE_SCHEDULE_CAPABILITIES) as ScheduleCapability[]).map(
    (capability) => ({
      capability,
      ...WORK_QUEUE_SCHEDULE_CAPABILITIES[capability],
    }),
  );
}
