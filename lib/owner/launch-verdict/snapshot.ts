import "server-only";

import { getOwnerBillingMetrics } from "@/lib/billing/analytics/owner-metrics";
import { listBetaOpsEvents } from "@/lib/owner/beta-ops/events";
import type { BetaOpsEvent } from "@/lib/owner/beta-ops/types";
import {
  aggregateLaunchVerdict,
  evaluateLaunchKpi,
} from "@/lib/owner/launch-verdict/evaluate";
import { getNpsSnapshot } from "@/lib/owner/launch-verdict/nps-store";
import type { LaunchVerdictSnapshot } from "@/lib/owner/launch-verdict/types";

function pct(numer: number, denom: number): number {
  if (denom <= 0) return 0;
  return Math.round((numer / denom) * 1000) / 10;
}

function uniqueUsers(events: readonly BetaOpsEvent[]): Set<string> {
  const set = new Set<string>();
  for (const event of events) {
    if (event.userId) set.add(event.userId);
  }
  return set;
}

function inRange(iso: string, from: Date, to: Date): boolean {
  const t = new Date(iso).getTime();
  return t >= from.getTime() && t <= to.getTime();
}

function retentionPercent(
  all: readonly BetaOpsEvent[],
  cohortFrom: Date,
  cohortTo: Date,
  returnFrom: Date,
  returnTo: Date
): { value: number | null; cohortSize: number } {
  const cohort = uniqueUsers(
    all.filter(
      (e) =>
        (e.kind === "request" || e.kind === "complete") &&
        inRange(e.at, cohortFrom, cohortTo)
    )
  );
  if (cohort.size === 0) return { value: null, cohortSize: 0 };
  const returned = uniqueUsers(
    all.filter(
      (e) =>
        (e.kind === "request" || e.kind === "complete") &&
        inRange(e.at, returnFrom, returnTo) &&
        e.userId &&
        cohort.has(e.userId)
    )
  );
  return { value: pct(returned.size, cohort.size), cohortSize: cohort.size };
}

/**
 * 初回成功率: ユーザーごとの最初の依頼について、
 * 最初の終端（complete / fail / dropout）が complete である割合。
 */
function firstCompletion(
  all: readonly BetaOpsEvent[]
): { value: number | null; sampleSize: number } {
  const byUser = new Map<string, BetaOpsEvent[]>();
  for (const event of all) {
    if (!event.userId) continue;
    if (
      event.kind !== "request" &&
      event.kind !== "complete" &&
      event.kind !== "fail" &&
      event.kind !== "dropout"
    ) {
      continue;
    }
    const list = byUser.get(event.userId) ?? [];
    list.push(event);
    byUser.set(event.userId, list);
  }

  let successes = 0;
  let terminals = 0;
  for (const events of byUser.values()) {
    events.sort((a, b) => a.at.localeCompare(b.at));
    const firstRequest = events.find((e) => e.kind === "request");
    if (!firstRequest) continue;
    const firstTerminal = events.find(
      (e) =>
        e.at >= firstRequest.at &&
        (e.kind === "complete" || e.kind === "fail" || e.kind === "dropout")
    );
    if (!firstTerminal) continue;
    terminals += 1;
    if (firstTerminal.kind === "complete") successes += 1;
  }

  if (terminals === 0) return { value: null, sampleSize: 0 };
  return { value: pct(successes, terminals), sampleSize: terminals };
}

function avgSeconds(events: readonly BetaOpsEvent[]): number | null {
  const durations = events
    .map((e) => e.durationMs)
    .filter((ms): ms is number => typeof ms === "number" && ms >= 0);
  if (durations.length === 0) return null;
  const avgMs = durations.reduce((sum, ms) => sum + ms, 0) / durations.length;
  return Math.round(avgMs / 100) / 10;
}

/** 正式公開判定スナップショット — βイベント累計 + NPS 実測のみ。 */
export function getLaunchVerdictSnapshot(
  now: Date = new Date()
): LaunchVerdictSnapshot {
  const all = listBetaOpsEvents();
  const requests = all.filter((e) => e.kind === "request");
  const completes = all.filter((e) => e.kind === "complete");
  const fails = all.filter((e) => e.kind === "fail");
  const referrals = all.filter((e) => e.kind === "referral");

  const requestCount = requests.length;
  const jobCompletionRate =
    requestCount === 0 ? null : pct(completes.length, requestCount);
  const errorRate =
    requestCount === 0 ? null : pct(fails.length, requestCount);
  const avgCompletionSeconds = avgSeconds(completes);

  const first = firstCompletion(all);

  const dayMs = 24 * 60 * 60 * 1000;
  const ret7 = retentionPercent(
    all,
    new Date(now.getTime() - 14 * dayMs),
    new Date(now.getTime() - 7 * dayMs),
    new Date(now.getTime() - 7 * dayMs),
    now
  );
  const ret30 = retentionPercent(
    all,
    new Date(now.getTime() - 60 * dayMs),
    new Date(now.getTime() - 30 * dayMs),
    new Date(now.getTime() - 30 * dayMs),
    now
  );

  const activeUsers = uniqueUsers(all).size;
  const referralRate =
    activeUsers > 0 ? pct(referrals.length, activeUsers) : null;

  const billing = getOwnerBillingMetrics(now);
  const paidPool = billing.paidSubscribers + billing.freeSubscribers;
  const paidConversionRate =
    paidPool > 0 ? pct(billing.paidSubscribers, paidPool) : null;

  const nps = getNpsSnapshot();

  const measurements = [
    evaluateLaunchKpi("jobCompletionRate", jobCompletionRate, requestCount),
    evaluateLaunchKpi(
      "firstCompletionRate",
      first.value,
      first.sampleSize
    ),
    evaluateLaunchKpi(
      "avgCompletionSeconds",
      avgCompletionSeconds,
      completes.length
    ),
    evaluateLaunchKpi("errorRate", errorRate, requestCount),
    evaluateLaunchKpi("retention7", ret7.value, ret7.cohortSize),
    evaluateLaunchKpi("retention30", ret30.value, ret30.cohortSize),
    evaluateLaunchKpi(
      "referralRate",
      referralRate,
      activeUsers
    ),
    evaluateLaunchKpi(
      "paidConversionRate",
      paidConversionRate,
      paidPool
    ),
    evaluateLaunchKpi("nps", nps.nps, nps.sampleSize),
  ];

  const verdict = aggregateLaunchVerdict(measurements, now.toISOString());

  return {
    ...verdict,
    window: "all_beta_events",
    raw: {
      requestCount,
      completeCount: completes.length,
      failCount: fails.length,
      firstRunUsers: first.sampleSize,
      npsResponses: nps.sampleSize,
    },
  };
}
