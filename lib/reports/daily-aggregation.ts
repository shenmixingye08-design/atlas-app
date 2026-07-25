import type { NotificationRecord } from "@/lib/notifications/types";

export type DailyReportSection = {
  completedCount: number;
  failedCount: number;
  awaitingReviewCount: number;
  automationCount: number;
  highlights: string[];
};

/** Programmatic daily aggregation — no AI. */
export function aggregateDailyReport(input: {
  notifications: NotificationRecord[];
  dateKey?: string;
}): DailyReportSection {
  const dateKey =
    input.dateKey ??
    new Date().toLocaleDateString("ja-JP", { timeZone: "Asia/Tokyo" });

  const todayNotifications = input.notifications.filter((n) => {
    const created = new Date(n.createdAt);
    const key = created.toLocaleDateString("ja-JP", { timeZone: "Asia/Tokyo" });
    return key === dateKey;
  });

  const completedCount = todayNotifications.filter((n) => n.type === "completed").length;
  const failedCount = todayNotifications.filter(
    (n) => n.type === "error" || n.type === "automation",
  ).length;
  const awaitingReviewCount = todayNotifications.filter(
    (n) => n.type === "awaiting_review",
  ).length;
  const automationCount = todayNotifications.filter(
    (n) => n.type === "automation" || n.automationId,
  ).length;

  const highlights: string[] = [];
  if (completedCount > 0) {
    highlights.push(`完了 ${completedCount} 件`);
  }
  if (awaitingReviewCount > 0) {
    highlights.push(`確認待ち ${awaitingReviewCount} 件`);
  }
  if (failedCount > 0) {
    highlights.push(`要対応 ${failedCount} 件`);
  }
  if (automationCount > 0) {
    highlights.push(`自動化 ${automationCount} 件`);
  }

  return {
    completedCount,
    failedCount,
    awaitingReviewCount,
    automationCount,
    highlights,
  };
}

export function formatDailyReportPushBody(section: DailyReportSection): string {
  if (section.highlights.length === 0) {
    return "本日の新しいお知らせはありません。";
  }
  return section.highlights.join(" / ");
}

export function formatDailyReportTitle(): string {
  const today = new Date().toLocaleDateString("ja-JP", {
    timeZone: "Asia/Tokyo",
    month: "numeric",
    day: "numeric",
  });
  return `${today} のまとめ`;
}
