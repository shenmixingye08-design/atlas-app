import type { ApiUsageProviderId } from "./types";

/** Placeholder usage until live provider billing telemetry is wired. */
const MONTHLY_ESTIMATES_USD: Record<ApiUsageProviderId, number> = {
  openai: 186.4,
  google: 42.5,
  stripe: 28.0,
  x: 12.4,
  wordpress: 6.8,
};

export function buildEstimatedProviderUsage(
  providerId: ApiUsageProviderId,
  now: Date = new Date(),
): { todayUsd: number; monthUsd: number } {
  const monthly = MONTHLY_ESTIMATES_USD[providerId];
  const dayOfMonth = now.getDate();
  const daysInMonth = new Date(
    now.getFullYear(),
    now.getMonth() + 1,
    0,
  ).getDate();

  const monthUsd = Math.round(monthly * (dayOfMonth / daysInMonth) * 100) / 100;
  const dailyAverage = monthly / daysInMonth;
  const todayUsd = Math.round(dailyAverage * 100) / 100;

  return { todayUsd, monthUsd };
}
