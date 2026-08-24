import { getOwnerBillingMetrics } from "@/lib/billing/analytics/owner-metrics";
import { resolveUserSubscription } from "@/lib/billing/subscriptions/service";

import { buildFunnelTotals } from "@/lib/owner/revenue-agent/funnel";
import {
  getAdSpendYen,
  listGenerationCosts,
  listRevenueEvents,
  listRevenueItems,
} from "@/lib/owner/revenue-agent/store";

import { resolveLifecycleState } from "./lifecycle";
import { listRevenueMaxStates } from "./store";
import type { RevenueMaxEventName } from "./types";

export type OwnerImproveSuggestion = {
  id: string;
  dropOff: string;
  period: string;
  measured: string;
  change: string;
  howToVerify: string;
  watch: string;
  revert: string;
  status: "draft" | "approved" | "rejected";
};

export type OwnerImproveSnapshot = {
  cashRevenueYen: number | null;
  contractedMrrYen: number | null;
  newMrrYen: number | null;
  churnMrrYen: number | null;
  expansionMrrYen: number | null;
  contractionMrrYen: number | null;
  netMrrYen: number | null;
  freeToPaidRate: number | null;
  firstSuccessRate: number | null;
  d7Retention: number | null;
  d30Retention: number | null;
  paidCancelRate: number | null;
  arpuYen: number | null;
  ltvYen: number | null;
  ltvLabel: string;
  planCounts: Array<{ planId: string; name: string; count: number }>;
  checkoutFailed: number | null;
  paidAtRisk: number | null;
  dropOff: string | null;
  suggestions: OwnerImproveSuggestion[];
};

const suggestionDecisions = new Map<string, "approved" | "rejected">();

function rate(n: number, d: number): number | null {
  if (d <= 0) return null;
  return n / d;
}

function countEvents(name: RevenueMaxEventName): number {
  return listRevenueMaxStates().reduce(
    (sum, row) => sum + row.events.filter((event) => event.eventName === name).length,
    0,
  );
}

export function recordImproveDecision(
  id: string,
  decision: "approved" | "rejected",
): { applied: false; note: string } {
  suggestionDecisions.set(id, decision);
  return {
    applied: false,
    note: "承認しても料金・Stripe商品・Entitlementは変更しません。",
  };
}

export function buildOwnerImproveSnapshot(now = new Date()): OwnerImproveSnapshot {
  const billing = getOwnerBillingMetrics(now);
  const funnel = buildFunnelTotals({
    items: listRevenueItems(),
    events: listRevenueEvents(),
    costs: listGenerationCosts(),
    adSpendYen: getAdSpendYen(),
    range: "30d",
    now,
  });
  const users = listRevenueMaxStates();
  const started = users.filter((row) => row.onboardingStartedAt).length;
  const succeeded = users.filter((row) => row.firstSuccessAt).length;
  const checkoutFailed = countEvents("checkout_failed");
  const paidAtRisk = users.filter((row) => {
    const subscription = resolveUserSubscription(row.userId);
    const lifecycle = resolveLifecycleState({
      state: row,
      planId: subscription.planId,
      subscriptionStatus: subscription.status,
      lastValueAt: row.lastValueAt ?? row.firstSuccessAt,
      hadPaid: row.hadPaid,
      now,
    });
    return lifecycle === "paid_at_risk";
  }).length;

  const dropCandidates: Array<[string, number | null]> = [
    ["公開→クリック", funnel.ctr],
    ["クリック→登録", funnel.clickToSignupRate],
    ["登録→初回成功", funnel.signupToFirstSuccessRate],
    ["登録→有料", funnel.signupToPaidRate],
  ];
  const known = dropCandidates.filter((row) => row[1] != null) as Array<[string, number]>;
  const weakest = known.sort((a, b) => a[1] - b[1])[0] ?? null;

  const baseSuggestions: OwnerImproveSuggestion[] =
    weakest == null
      ? [
          {
            id: "hold",
            dropOff: "未取得",
            period: "30日",
            measured: "離脱率が計算できる実測が不足",
            change: "データ不足のため判断保留。勝ち施策とは断定しない",
            howToVerify: "初回成功と Checkout の実測が各10件以上溜まるまで待つ",
            watch: "初回成功率・決済失敗率",
            revert: "提案を採用していないので戻す作業はない",
            status: "draft",
          },
        ]
      : [
          {
            id: "drop",
            dropOff: weakest[0],
            period: "30日",
            measured: `${weakest[0]}=${(weakest[1] * 100).toFixed(1)}%（実測比率。推定ではない）`,
            change: "その地点の文言だけを変え、価格は変えない",
            howToVerify: "同じ期間で初回成功率と決済失敗率が悪化しないか見る",
            watch: "初回成功率・解約率・Checkout失敗",
            revert: "文言を元に戻す。Stripe商品は触らない",
            status: "draft",
          },
        ];

  return {
    cashRevenueYen: funnel.cashRevenueYen,
    contractedMrrYen: billing.hasSubscriptionRecords ? billing.mrrJpy : null,
    newMrrYen: null,
    churnMrrYen: null,
    expansionMrrYen: null,
    contractionMrrYen: null,
    netMrrYen: null,
    freeToPaidRate: rate(
      billing.paidSubscribers,
      billing.freeSubscribers + billing.paidSubscribers,
    ),
    firstSuccessRate: rate(succeeded, started),
    d7Retention: null,
    d30Retention: null,
    paidCancelRate: billing.hasSubscriptionRecords
      ? rate(billing.churnedSubscribers, billing.paidSubscribers + billing.churnedSubscribers)
      : null,
    arpuYen:
      billing.hasSubscriptionRecords && billing.paidSubscribers > 0
        ? billing.mrrJpy / billing.paidSubscribers
        : null,
    ltvYen: null,
    ltvLabel: "データ不足",
    planCounts: billing.planBreakdown.map((row) => ({
      planId: row.planId,
      name: row.planName,
      count: row.activeSubscribers,
    })),
    checkoutFailed: users.length > 0 ? checkoutFailed : null,
    paidAtRisk: users.length > 0 ? paidAtRisk : null,
    dropOff: weakest?.[0] ?? null,
    suggestions: baseSuggestions.map((row) => ({
      ...row,
      status: suggestionDecisions.get(row.id) ?? row.status,
    })),
  };
}
