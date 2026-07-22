import type { AutomationSchedule, SchedulePreset } from "./types";
import {
  computeNextRun,
  DEFAULT_AUTOMATION_TIMEZONE,
  getZonedParts,
} from "./schedule";

export type ScheduleKind =
  | "now"
  | "once"
  | "daily"
  | "weekdays"
  | "weekly"
  | "monthly"
  | "custom";

export type SchedulePreview = {
  label: string;
  timezone: string;
  nextRun: Date | null;
  followingRun: Date | null;
  plainSteps: string[];
};

const WEEKDAY_JA = ["日", "月", "火", "水", "木", "金", "土"] as const;

export function formatTimeInZone(date: Date, timeZone: string): string {
  return date.toLocaleString("ja-JP", {
    timeZone,
    month: "short",
    day: "numeric",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function presetToPlainLabel(
  preset: SchedulePreset,
  timeZone = DEFAULT_AUTOMATION_TIMEZONE,
): string {
  const time = `${String(preset.hour).padStart(2, "0")}:${String(preset.minute).padStart(2, "0")}`;
  switch (preset.type) {
    case "daily":
      return `毎日 ${time}（${timeZone}）`;
    case "weekly":
      return `毎週${WEEKDAY_JA[preset.dayOfWeek]}曜 ${time}（${timeZone}）`;
    case "monthly":
      return `毎月${preset.dayOfMonth}日 ${time}（${timeZone}）`;
  }
}

export function buildSchedulePreview(
  schedule: AutomationSchedule,
  from: Date = new Date(),
): SchedulePreview | null {
  if (schedule.kind !== "schedule") return null;

  const timeZone = schedule.timezone || DEFAULT_AUTOMATION_TIMEZONE;
  const nextRun = computeNextRun(schedule, from);
  const followingRun = nextRun
    ? computeNextRun(schedule, new Date(nextRun.getTime() + 60_000))
    : null;

  const plainSteps = buildPlainPipelineSteps(schedule.label);

  return {
    label: schedule.label || presetToPlainLabel(schedule.preset, timeZone),
    timezone: timeZone,
    nextRun,
    followingRun,
    plainSteps,
  };
}

/** Map automation label to user-facing pipeline steps (Phase 1 jobs). */
export function buildPlainPipelineSteps(scheduleLabel: string): string[] {
  return [
    "依頼内容を確認します",
    "必要な資料を作成します",
    scheduleLabel ? `${scheduleLabel} に合わせて実行します` : "指定のタイミングで実行します",
    "完了したらお知らせします",
  ];
}

export function describeScheduleKind(kind: ScheduleKind): string {
  switch (kind) {
    case "now":
      return "今すぐ1回";
    case "once":
      return "日時指定1回";
    case "daily":
      return "毎日";
    case "weekdays":
      return "平日";
    case "weekly":
      return "毎週";
    case "monthly":
      return "毎月";
    case "custom":
      return "カスタム";
  }
}

export function isWeekdayInZone(date: Date, timeZone: string): boolean {
  const dow = getZonedParts(date, timeZone).dayOfWeek;
  return dow >= 1 && dow <= 5;
}
