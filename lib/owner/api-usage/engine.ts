import { formatOwnerMonthKey, formatOwnerMonthLabel } from "../format";
import { API_USAGE_PROVIDER_IDS } from "./budgets";
import { buildEstimatedProviderUsage } from "./defaults";
import {
  getProviderBudgetUsd,
  hasRecordedUsage,
  listApiUsageRecordsForProvider,
} from "./store";
import type {
  ApiUsageMonitoringSnapshot,
  ApiUsageProviderId,
  ApiUsageProviderSnapshot,
  ApiUsageWarning,
  ApiUsageWarningLevel,
} from "./types";

const APPROACHING_THRESHOLD = 0.8;

const PROVIDER_LABELS: Record<ApiUsageProviderId, string> = {
  openai: "OpenAI",
  google: "Google",
  stripe: "Stripe",
  x: "X",
  wordpress: "WordPress",
};

function roundUsd(value: number): number {
  return Math.round(value * 100) / 100;
}

function isSameDay(iso: string, now: Date): boolean {
  const date = new Date(iso);
  return (
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate()
  );
}

function isSameMonth(iso: string, now: Date): boolean {
  return iso.startsWith(formatOwnerMonthKey(now));
}

function sumRecords(
  records: readonly { amountUsd: number }[],
): number {
  return roundUsd(records.reduce((sum, record) => sum + record.amountUsd, 0));
}

function resolveWarningLevel(
  monthUsd: number,
  budgetUsd: number,
  now: Date,
): ApiUsageWarningLevel {
  if (budgetUsd <= 0) return "none";

  const remaining = budgetUsd - monthUsd;
  if (remaining <= 0) return "critical";

  const usageRatio = monthUsd / budgetUsd;
  if (usageRatio >= APPROACHING_THRESHOLD) return "approaching";

  const dayOfMonth = now.getDate();
  const daysInMonth = new Date(
    now.getFullYear(),
    now.getMonth() + 1,
    0,
  ).getDate();
  const projectedMonthUsd = (monthUsd / Math.max(dayOfMonth, 1)) * daysInMonth;

  if (projectedMonthUsd >= budgetUsd * APPROACHING_THRESHOLD) {
    return "approaching";
  }

  return "none";
}

function buildWarningMessage(
  providerId: ApiUsageProviderId,
  level: Exclude<ApiUsageWarningLevel, "none">,
  monthUsd: number,
  budgetUsd: number,
): string {
  const label = PROVIDER_LABELS[providerId];

  if (level === "critical") {
    return `${label}の今月使用量（$${monthUsd.toFixed(2)}）が予算（$${budgetUsd.toFixed(2)}）を超えました`;
  }

  const remaining = Math.max(0, budgetUsd - monthUsd);
  return `${label}の予算残りが $${remaining.toFixed(2)} です（使用率 ${Math.round((monthUsd / budgetUsd) * 100)}%）`;
}

export function buildProviderSnapshot(
  providerId: ApiUsageProviderId,
  now: Date = new Date(),
): ApiUsageProviderSnapshot {
  const budgetUsd = getProviderBudgetUsd(providerId);
  const hasLiveData = hasRecordedUsage(providerId);
  const records = listApiUsageRecordsForProvider(providerId);

  const todayUsd = hasLiveData
    ? sumRecords(records.filter((record) => isSameDay(record.timestamp, now)))
    : buildEstimatedProviderUsage(providerId, now).todayUsd;

  const monthUsd = hasLiveData
    ? sumRecords(records.filter((record) => isSameMonth(record.timestamp, now)))
    : buildEstimatedProviderUsage(providerId, now).monthUsd;

  const remainingUsd = roundUsd(Math.max(0, budgetUsd - monthUsd));
  const usagePercent =
    budgetUsd > 0 ? Math.round((monthUsd / budgetUsd) * 100) : 0;
  const warningLevel = resolveWarningLevel(monthUsd, budgetUsd, now);

  return {
    providerId,
    label: PROVIDER_LABELS[providerId],
    todayUsd,
    monthUsd,
    budgetUsd,
    remainingUsd,
    usagePercent,
    warningLevel,
    isEstimated: !hasLiveData,
  };
}

export function buildApiUsageWarnings(
  providers: readonly ApiUsageProviderSnapshot[],
): ApiUsageWarning[] {
  return providers.flatMap((provider) => {
    if (provider.warningLevel === "none") return [];

    return [
      {
        providerId: provider.providerId,
        level: provider.warningLevel,
        message: buildWarningMessage(
          provider.providerId,
          provider.warningLevel,
          provider.monthUsd,
          provider.budgetUsd,
        ),
      },
    ];
  });
}

export function buildApiUsageMonitoringSnapshot(
  now: Date = new Date(),
): ApiUsageMonitoringSnapshot {
  const providers = API_USAGE_PROVIDER_IDS.map((providerId) =>
    buildProviderSnapshot(providerId, now),
  );

  return {
    period: {
      month: formatOwnerMonthKey(now),
      monthLabel: formatOwnerMonthLabel(now),
      day: now.toISOString().slice(0, 10),
    },
    providers,
    warnings: buildApiUsageWarnings(providers),
    generatedAt: now.toISOString(),
  };
}
