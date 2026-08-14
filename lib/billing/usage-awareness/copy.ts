import type { UsageItemView, UsageMeterId, UsageWarningLevel } from "./types";

export const USAGE_METER_LABEL: Record<UsageMeterId, string> = {
  aiRuns: "AI作業",
  snsPosts: "X自動投稿",
  xUrlPosts: "URL付きX投稿",
  wordpressPosts: "WordPress公開",
  automationTasks: "自動化",
};

export const USAGE_UNIT_LABEL: Record<UsageItemView["unit"], string> = {
  times: "回",
  posts: "件",
  tasks: "件",
};

export function formatUsageFraction(item: Pick<UsageItemView, "used" | "limit" | "unit">): string {
  const unit = USAGE_UNIT_LABEL[item.unit];
  return `${item.used} / ${item.limit}${unit}`;
}

export function formatRemainingCount(item: Pick<UsageItemView, "remaining" | "unit" | "unlimited">): string {
  if (item.unlimited) return "上限なし";
  const unit = USAGE_UNIT_LABEL[item.unit];
  return `あと${item.remaining}${unit}`;
}

export function formatUsageHeadline(item: UsageItemView): string {
  const label = USAGE_METER_LABEL[item.id];
  if (item.unlimited) return `${label}は上限なしです`;
  if (item.level === "exhausted") {
    return `今月の${label}上限に達しました`;
  }
  if (item.level === "critical") {
    return `今月あと${item.remaining}${USAGE_UNIT_LABEL[item.unit]}です`;
  }
  if (item.level === "warning") {
    return `利用上限が近づいています。今月あと${item.remaining}${USAGE_UNIT_LABEL[item.unit]}使えます`;
  }
  if (item.level === "notice") {
    return `今月あと${item.remaining}${USAGE_UNIT_LABEL[item.unit]}使えます`;
  }
  return `今月 ${formatUsageFraction(item)}`;
}

export function formatPreUseHint(item: UsageItemView): string | null {
  if (item.unlimited || !item.offered || item.level === "normal") return null;
  if (item.level === "exhausted") {
    return `${USAGE_METER_LABEL[item.id]}の上限に達しました`;
  }
  return `${USAGE_METER_LABEL[item.id]}：${formatRemainingCount(item)}`;
}

export function formatUpgradeLine(item: UsageItemView): string | null {
  const upgrade = item.primaryUpgrade;
  if (!upgrade) return null;
  const unit = USAGE_UNIT_LABEL[item.unit];
  return `${upgrade.planName}なら${USAGE_METER_LABEL[item.id]}を月${upgrade.nextLimit}${unit}まで利用できます`;
}

export function formatSecondaryUpgradeLine(item: UsageItemView): string | null {
  const upgrade = item.secondaryUpgrade;
  if (!upgrade) return null;
  return `もっと使うなら${upgrade.planName}`;
}

export function formatOtherMetersRemain(items: readonly UsageItemView[]): string | null {
  const available = items.filter(
    (item) => item.offered && !item.unlimited && item.level !== "exhausted" && item.remaining > 0,
  );
  if (available.length === 0) return null;
  const names = available.slice(0, 3).map((item) => USAGE_METER_LABEL[item.id]);
  return `${names.join("や")}など他の機能は引き続き利用できます。`;
}

export function shouldShowUpgradeCta(level: UsageWarningLevel): boolean {
  return level === "warning" || level === "critical" || level === "exhausted";
}

export const USAGE_CTA_INCREASE = "利用枠を増やす";
export const USAGE_CTA_SEE_PLANS = "プランを見る";
export const USAGE_PERIOD_RIGHTS_NOTE =
  "表示は現在期間中の利用枠です。次回更新後のプランとは分けて表示しています。";
