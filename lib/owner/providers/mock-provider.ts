import { getMonthlyCostSavingsSummary } from "@/lib/cost-optimization/cost-savings-tracker";
import { getOwnerBillingMetrics } from "@/lib/billing/analytics/owner-metrics";

import {
  formatOwnerMonthKey,
  formatOwnerMonthLabel,
} from "../format";
import type { OwnerDashboardSnapshot } from "../types";
import type { OwnerMetricsProvider } from "./types";

function buildMockStripePayout(now: Date) {
  const payoutDate = new Date(now.getFullYear(), now.getMonth() + 1, 5);
  return {
    scheduledAt: payoutDate.toISOString(),
    amountUsd: 4280,
    status: "scheduled" as const,
    source: "mock" as const,
  };
}

/** Placeholder metrics until Stripe / OpenAI / infra billing are wired. */
export const mockOwnerMetricsProvider: OwnerMetricsProvider = {
  id: "mock",

  async getDashboardSnapshot(now = new Date()): Promise<OwnerDashboardSnapshot> {
    const ecoSummary = getMonthlyCostSavingsSummary(now);
    const billing = getOwnerBillingMetrics();
    const apiCostUsd = ecoSummary.actualCostUsd > 0 ? ecoSummary.actualCostUsd : 186.4;
    const serverCostUsd = 89;
    const revenueUsd = billing.mrrJpy / 150;
    const profitUsd = revenueUsd - apiCostUsd - serverCostUsd;

    return {
      period: {
        month: formatOwnerMonthKey(now),
        label: formatOwnerMonthLabel(now),
      },
      revenue: {
        amountUsd: revenueUsd,
        label: "今月売上",
        source: "mock",
        isEstimated: true,
      },
      apiCost: {
        amountUsd: Math.round(apiCostUsd * 100) / 100,
        label: "今月API費用",
        source: ecoSummary.actualCostUsd > 0 ? "eco_mode" : "mock",
        isEstimated: ecoSummary.actualCostUsd === 0,
      },
      serverCost: {
        amountUsd: serverCostUsd,
        label: "サーバー費用",
        source: "mock",
        isEstimated: true,
      },
      estimatedProfit: {
        amountUsd: Math.round(profitUsd * 100) / 100,
        label: "推定利益",
        source: "mock",
        isEstimated: true,
      },
      users: {
        paid: billing.paidSubscribers,
        free: billing.freeSubscribers,
        churned: billing.churnedSubscribers,
      },
      popularFeatures: [
        {
          featureId: "automations",
          featureName: "習慣・自動化",
          activeUsers: 126,
          usageCount: 1840,
          trend: "up",
        },
        {
          featureId: "workspace",
          featureName: "仕事（ワークスペース）",
          activeUsers: 98,
          usageCount: 920,
          trend: "up",
        },
        {
          featureId: "deliverables",
          featureName: "成果物生成",
          activeUsers: 74,
          usageCount: 410,
          trend: "flat",
        },
        {
          featureId: "eco_mode",
          featureName: "エコモード",
          activeUsers: 58,
          usageCount: ecoSummary.ecoRunCount || 240,
          trend: "up",
        },
        {
          featureId: "google",
          featureName: "Google連携",
          activeUsers: 21,
          usageCount: 86,
          trend: "up",
        },
      ],
      ecoModeReductionPercent: ecoSummary.reductionPercent || 34,
      ecoModeRuns: ecoSummary.ecoRunCount || 240,
      highCostUsers: [
        {
          userId: "user_01",
          displayName: "田中 太郎",
          plan: "premium",
          estimatedCostUsd: 42.8,
          runCount: 186,
        },
        {
          userId: "user_02",
          displayName: "佐藤 花子",
          plan: "standard",
          estimatedCostUsd: 31.2,
          runCount: 142,
        },
        {
          userId: "user_03",
          displayName: "鈴木 一郎",
          plan: "light",
          estimatedCostUsd: 28.6,
          runCount: 118,
        },
      ],
      nextStripePayout: buildMockStripePayout(now),
      billing,
      dataSources: [
        {
          id: "stripe",
          label: "Stripe",
          connected: billing.stripeConnected,
          note: billing.stripeConnected
            ? "売上・振込データ連携済み"
            : "売上・振込データ（未連携 — モック表示）",
        },
        {
          id: "openai",
          label: "OpenAI API",
          connected: false,
          note: "API費用（未連携 — エコモード実績を暫定表示）",
        },
        {
          id: "server",
          label: "サーバー費用",
          connected: false,
          note: "インフラ請求（未連携）",
        },
        {
          id: "external_api",
          label: "外部API",
          connected: false,
          note: "Google 等（未連携）",
        },
        {
          id: "eco_mode",
          label: "エコモード",
          connected: ecoSummary.ecoRunCount > 0,
          note:
            ecoSummary.ecoRunCount > 0
              ? "実行ログから削減率を集計中"
              : "実行ログ待ち（モック値を表示）",
        },
      ],
      generatedAt: new Date().toISOString(),
    };
  },
};
