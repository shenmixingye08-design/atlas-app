import "server-only";

import { getOwnerBillingMetrics } from "@/lib/billing/analytics/owner-metrics";
import { listBetaOpsEvents } from "@/lib/owner/beta-ops/events";
import type { BetaOpsEvent } from "@/lib/owner/beta-ops/types";
import type {
  GrowthOsMetric,
  GrowthOsSnapshot,
} from "@/lib/owner/growth-os/types";

export type {
  GrowthOsMetric,
  GrowthOsMetricId,
  GrowthOsSnapshot,
} from "@/lib/owner/growth-os/types";

function pct(numer: number, denom: number): number {
  if (denom <= 0) return 0;
  return Math.round((numer / denom) * 1000) / 10;
}

function inRange(iso: string, from: Date, to: Date): boolean {
  const t = new Date(iso).getTime();
  return t >= from.getTime() && t <= to.getTime();
}

function windowBounds(now: Date, offsetWeeks: number): { from: Date; to: Date } {
  const dayMs = 24 * 60 * 60 * 1000;
  const to = new Date(now.getTime() - offsetWeeks * 7 * dayMs);
  const from = new Date(to.getTime() - 7 * dayMs);
  return { from, to };
}

/** Users with ≥1 complete in [from, to]. */
export function countWeeklyCompletingUsers(
  all: readonly BetaOpsEvent[],
  from: Date,
  to: Date
): number {
  const users = new Set<string>();
  for (const event of all) {
    if (event.kind !== "complete" || !event.userId) continue;
    if (!inRange(event.at, from, to)) continue;
    users.add(event.userId);
  }
  return users.size;
}

/**
 * 紹介→初回完了:
 * ウィンドウ内に「そのユーザーの最初の complete」がある人数を母数とし、
 * 同一ユーザーに complete 以前の referral イベントがあれば紹介経由。
 * ユーザー紐付けが無い場合は、同週の referral 件数を上限とした近似。
 */
export function computeReferralFirstCompletionRate(
  all: readonly BetaOpsEvent[],
  from: Date,
  to: Date
): { rate: number | null; sampleSize: number } {
  const firstCompleteAt = new Map<string, string>();
  for (const event of all) {
    if (event.kind !== "complete" || !event.userId) continue;
    const prev = firstCompleteAt.get(event.userId);
    if (!prev || event.at < prev) {
      firstCompleteAt.set(event.userId, event.at);
    }
  }

  let firstCompletions = 0;
  let referred = 0;
  for (const [userId, firstAt] of firstCompleteAt) {
    if (!inRange(firstAt, from, to)) continue;
    firstCompletions += 1;
    const hadReferral = all.some(
      (e) =>
        e.kind === "referral" &&
        e.userId === userId &&
        e.at <= firstAt
    );
    if (hadReferral) referred += 1;
  }

  if (firstCompletions === 0) {
    return { rate: null, sampleSize: 0 };
  }

  if (referred === 0) {
    const weekReferrals = all.filter(
      (e) => e.kind === "referral" && inRange(e.at, from, to)
    ).length;
    if (weekReferrals > 0) {
      return {
        rate: pct(Math.min(weekReferrals, firstCompletions), firstCompletions),
        sampleSize: firstCompletions,
      };
    }
  }

  return {
    rate: pct(referred, firstCompletions),
    sampleSize: firstCompletions,
  };
}

function deltaOf(
  current: number | null,
  previous: number | null
): number | null {
  if (current == null || previous == null) return null;
  return Math.round((current - previous) * 10) / 10;
}

export function getGrowthOsSnapshot(now: Date = new Date()): GrowthOsSnapshot {
  const all = listBetaOpsEvents();
  const current = windowBounds(now, 0);
  const previous = windowBounds(now, 1);

  const wcu = countWeeklyCompletingUsers(all, current.from, current.to);
  const wcuPrev = countWeeklyCompletingUsers(all, previous.from, previous.to);

  const ref = computeReferralFirstCompletionRate(all, current.from, current.to);
  const refPrev = computeReferralFirstCompletionRate(
    all,
    previous.from,
    previous.to
  );

  const paid = getOwnerBillingMetrics(now).paidSubscribers;

  const metrics: GrowthOsMetric[] = [
    {
      id: "weeklyCompletingUsers",
      label: "週次仕事完了ユーザー",
      value: wcu,
      unit: "count",
      sampleSize: wcu,
      previousValue: wcuPrev,
      delta: deltaOf(wcu, wcuPrev),
    },
    {
      id: "referralFirstCompletionRate",
      label: "紹介→初回完了",
      value: ref.rate,
      unit: "percent",
      sampleSize: ref.sampleSize,
      previousValue: refPrev.rate,
      delta: deltaOf(ref.rate, refPrev.rate),
    },
    {
      id: "paidUsers",
      label: "有料ユーザー数",
      value: paid,
      unit: "count",
      sampleSize: paid,
      previousValue: null,
      delta: null,
    },
  ];

  return {
    measuredAt: now.toISOString(),
    windowDays: 7,
    metrics,
    ruleSummary:
      "見る指標は3つだけ。落ちた指標の運用だけ変える。伸びている指標には触らない。新機能で埋めない。",
  };
}
