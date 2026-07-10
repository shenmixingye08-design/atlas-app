import type { Automation } from "@/lib/automations/types";
import type { Project } from "@/lib/projects/types";

import {
  buildDailyBrief,
  type DailyBrief,
  type DailyBriefGreetingPeriod,
  type DailyBriefScheduledItem,
} from "./daily-brief";

export type MorningBriefAtlasSections = {
  atlasWork: DailyBriefScheduledItem[];
  snsPosts: DailyBriefScheduledItem[];
  salesMaterials: DailyBriefScheduledItem[];
  estimatedHoursSaved: number;
};

export type MorningBrief = DailyBrief & {
  dateLabel: string;
  intro: string;
  atlas: MorningBriefAtlasSections;
};

const MS_PER_TASK_HOUR = 0.5;

export function formatMorningBriefDate(
  now: Date = new Date(),
  locale = "ja-JP",
): string {
  return new Intl.DateTimeFormat(locale, {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(now);
}

export function getMorningBriefIntro(period: DailyBriefGreetingPeriod): string {
  switch (period) {
    case "morning":
      return "今日の仕事を30秒で確認できます。";
    case "afternoon":
      return "午後の予定と残りの仕事を確認できます。";
    case "evening":
      return "今日の残りと明日の準備を確認できます。";
  }
}

export function buildMorningBriefAtlasSections(
  brief: DailyBrief,
): MorningBriefAtlasSections {
  const snsPosts = brief.todayScheduled.filter((item) => item.icon === "📱");
  const salesMaterials = brief.todayScheduled.filter((item) => item.icon === "📄");

  const estimatedHoursSaved =
    brief.todayScheduled.length > 0
      ? Math.max(1, Math.round(brief.todayScheduled.length * MS_PER_TASK_HOUR))
      : 0;

  return {
    atlasWork: brief.todayScheduled,
    snsPosts,
    salesMaterials,
    estimatedHoursSaved,
  };
}

export function buildMorningBrief(input: {
  automations: readonly Automation[];
  projects: readonly Project[];
  now?: Date;
}): MorningBrief {
  const now = input.now ?? new Date();
  const brief = buildDailyBrief({ ...input, now });

  return {
    ...brief,
    dateLabel: formatMorningBriefDate(now),
    intro: getMorningBriefIntro(brief.greetingPeriod),
    atlas: buildMorningBriefAtlasSections(brief),
  };
}

export function formatCalendarEventTime(
  event: { startAt: string; isAllDay: boolean },
  locale = "ja-JP",
): string {
  if (event.isAllDay) return "終日";
  return new Intl.DateTimeFormat(locale, {
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(event.startAt));
}
