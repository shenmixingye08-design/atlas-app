import "server-only";

import { listApiUsageRecords } from "@/lib/owner/api-usage/store";
import { listAiUsageEvents } from "@/lib/billing/usage/store";
import { listUserSubscriptions } from "@/lib/billing/subscriptions/store";

export type ProductionCostSnapshot = {
  openaiUsd: number;
  storageUsd: number;
  bandwidthUsd: number;
  automationUsd: number;
  totalUsd: number;
  activeSubscribers: number;
  costPerUserUsd: number | null;
  windowDays: number;
  isEstimated: boolean;
  generatedAt: string;
};

function inWindow(iso: string, fromMs: number): boolean {
  return new Date(iso).getTime() >= fromMs;
}

/**
 * Cost metering for ops: OpenAI / Storage / Bandwidth / Automation / per-user.
 * Bandwidth is estimated from api-usage provider tags when present.
 */
export function getProductionCostSnapshot(
  windowDays = 30,
  now: Date = new Date(),
): ProductionCostSnapshot {
  const fromMs = now.getTime() - windowDays * 86_400_000;
  const usage = listApiUsageRecords().filter((row) =>
    inWindow(row.timestamp, fromMs),
  );

  let openaiUsd = usage
    .filter((row) => row.providerId === "openai")
    .reduce((sum, row) => sum + row.amountUsd, 0);
  if (openaiUsd <= 0) {
    openaiUsd = listAiUsageEvents()
      .filter((row) => inWindow(row.timestamp, fromMs))
      .reduce((sum, row) => sum + row.estimatedCostUsd, 0);
  }

  // Provider taxonomy today is coarse — estimate satellite costs from OpenAI share.
  const storageUsd = Math.round(openaiUsd * 0.05 * 1000) / 1000;
  const bandwidthUsd = Math.round(openaiUsd * 0.03 * 1000) / 1000;
  const automationResolved =
    usage
      .filter((row) => row.source === "automation")
      .reduce((sum, row) => sum + row.amountUsd, 0) ||
    Math.round(openaiUsd * 0.15 * 1000) / 1000;

  const totalUsd =
    Math.round((openaiUsd + storageUsd + bandwidthUsd + automationResolved) * 1000) /
    1000;

  const activeSubscribers = listUserSubscriptions().filter(
    (row) => row.status === "active" || row.status === "trialing",
  ).length;

  return {
    openaiUsd: Math.round(openaiUsd * 1000) / 1000,
    storageUsd: Math.round(storageUsd * 1000) / 1000,
    bandwidthUsd: Math.round(bandwidthUsd * 1000) / 1000,
    automationUsd: Math.round(automationResolved * 1000) / 1000,
    totalUsd,
    activeSubscribers,
    costPerUserUsd:
      activeSubscribers > 0
        ? Math.round((totalUsd / activeSubscribers) * 1000) / 1000
        : null,
    windowDays,
    isEstimated: true,
    generatedAt: now.toISOString(),
  };
}
