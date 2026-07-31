import "server-only";

import { getOwnerBillingMetrics } from "@/lib/billing/analytics/owner-metrics";
import { listEffectiveBetaUserEmails } from "@/lib/owner/beta-users/emails";
import { getReliabilityMetricsSnapshot } from "@/lib/reliability/metrics";

import { listBetaOpsEvents } from "./events";
import { listBetaImprovements } from "./improvement-log";
import type {
  BetaOpsEvent,
  BetaOpsPeriod,
  BetaOpsPeriodKpis,
  BetaOpsSnapshot,
} from "./types";

function startOfUtcDay(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

function periodRange(period: BetaOpsPeriod, now: Date): { from: Date; to: Date } {
  const to = now;
  const from = startOfUtcDay(now);
  if (period === "week") from.setUTCDate(from.getUTCDate() - 6);
  if (period === "month") from.setUTCDate(1);
  return { from, to };
}

function inRange(iso: string, from: Date, to: Date): boolean {
  const t = new Date(iso).getTime();
  return t >= from.getTime() && t <= to.getTime();
}

function pct(numer: number, denom: number): number {
  if (denom <= 0) return 0;
  return Math.round((numer / denom) * 1000) / 10;
}

function avgSeconds(events: BetaOpsEvent[]): number | null {
  const durations = events
    .map((e) => e.durationMs)
    .filter((ms): ms is number => typeof ms === "number" && ms >= 0);
  if (durations.length === 0) return null;
  const avgMs =
    durations.reduce((sum, ms) => sum + ms, 0) / durations.length;
  return Math.round(avgMs / 100) / 10;
}

function uniqueUsers(events: BetaOpsEvent[]): Set<string> {
  const set = new Set<string>();
  for (const event of events) {
    if (event.userId) set.add(event.userId);
  }
  return set;
}

function retentionPercent(
  all: readonly BetaOpsEvent[],
  cohortFrom: Date,
  cohortTo: Date,
  returnFrom: Date,
  returnTo: Date,
): number | null {
  const cohort = uniqueUsers(
    all.filter(
      (e) =>
        (e.kind === "request" || e.kind === "complete") &&
        inRange(e.at, cohortFrom, cohortTo),
    ),
  );
  if (cohort.size === 0) return null;
  const returned = uniqueUsers(
    all.filter(
      (e) =>
        (e.kind === "request" || e.kind === "complete") &&
        inRange(e.at, returnFrom, returnTo) &&
        e.userId &&
        cohort.has(e.userId),
    ),
  );
  return pct(returned.size, cohort.size);
}

function publishVerdict(kpis: Omit<BetaOpsPeriodKpis, "publishVerdict" | "period">): BetaOpsPeriodKpis["publishVerdict"] {
  if (kpis.requestCount < 5) return "insufficient_data";
  // Align with CEO launch gates (n=50 document) — β uses same shape, lower sample.
  if (kpis.completionRatePercent < 50) return "kill";
  if (
    kpis.completionRatePercent >= 80 &&
    (kpis.avgCompletionSeconds == null || kpis.avgCompletionSeconds <= 180) &&
    kpis.failureRatePercent <= 15 &&
    (kpis.retention7Percent == null || kpis.retention7Percent >= 40) &&
    (kpis.referralRatePercent == null || kpis.referralRatePercent >= 25) &&
    (kpis.paidConversionPercent == null || kpis.paidConversionPercent >= 8)
  ) {
    return "go";
  }
  return "delay";
}

function computePeriod(
  period: BetaOpsPeriod,
  now: Date,
  all: readonly BetaOpsEvent[],
): BetaOpsPeriodKpis {
  const { from, to } = periodRange(period, now);
  const window = all.filter((e) => inRange(e.at, from, to));
  const requests = window.filter((e) => e.kind === "request");
  const completes = window.filter((e) => e.kind === "complete");
  const fails = window.filter((e) => e.kind === "fail");
  const dropouts = window.filter((e) => e.kind === "dropout");
  const retries = window.filter((e) => e.kind === "retry");
  const referrals = window.filter((e) => e.kind === "referral");

  const requestCount = requests.length;
  const terminal = completes.length + fails.length + dropouts.length;
  const completionRatePercent = pct(completes.length, Math.max(requestCount, 1));
  const failureRatePercent = pct(fails.length, Math.max(requestCount, 1));
  const dropoutRatePercent = pct(dropouts.length, Math.max(requestCount, 1));
  const retryRatePercent = pct(retries.length, Math.max(requestCount, 1));

  // Re-request: same assignmentHash completed/requested more than once by same user.
  let reRequestUsers = 0;
  const byUserHash = new Map<string, number>();
  for (const event of [...requests, ...completes]) {
    if (!event.userId || !event.assignmentHash) continue;
    const key = `${event.userId}:${event.assignmentHash}`;
    byUserHash.set(key, (byUserHash.get(key) ?? 0) + 1);
  }
  for (const count of byUserHash.values()) {
    if (count >= 2) reRequestUsers += 1;
  }
  const usersWithRequest = uniqueUsers(requests).size;
  const reRequestRatePercent = pct(reRequestUsers, Math.max(usersWithRequest, 1));

  const dayMs = 24 * 60 * 60 * 1000;
  const retention7Percent = retentionPercent(
    all,
    new Date(now.getTime() - 14 * dayMs),
    new Date(now.getTime() - 7 * dayMs),
    new Date(now.getTime() - 7 * dayMs),
    now,
  );
  const retention30Percent = retentionPercent(
    all,
    new Date(now.getTime() - 60 * dayMs),
    new Date(now.getTime() - 30 * dayMs),
    new Date(now.getTime() - 30 * dayMs),
    now,
  );

  const activeUsers = uniqueUsers(window).size;
  const referralRatePercent =
    activeUsers > 0 ? pct(referrals.length, activeUsers) : null;

  const billing = getOwnerBillingMetrics(now);
  const paidPool = billing.paidSubscribers + billing.freeSubscribers;
  const paidConversionPercent =
    paidPool > 0 ? pct(billing.paidSubscribers, paidPool) : null;

  // Prefer beta-ops completes; fall back to reliability work_job durations.
  let avgCompletionSeconds = avgSeconds(completes);
  if (avgCompletionSeconds == null) {
    const relMs = getReliabilityMetricsSnapshot().avgDurationMs.work_job;
    if (typeof relMs === "number" && relMs >= 0) {
      avgCompletionSeconds = Math.round(relMs / 100) / 10;
    }
  }

  const base = {
    requestCount,
    completionRatePercent:
      requestCount === 0 && terminal === 0
        ? 0
        : completionRatePercent,
    failureRatePercent,
    avgCompletionSeconds,
    dropoutRatePercent,
    retryRatePercent,
    reRequestRatePercent,
    retention7Percent,
    retention30Percent,
    referralRatePercent,
    paidConversionPercent,
  };

  return {
    period,
    ...base,
    publishVerdict: publishVerdict(base),
  };
}

export function getBetaOpsSnapshot(now: Date = new Date()): BetaOpsSnapshot {
  const all = listBetaOpsEvents();
  const betaEmails = listEffectiveBetaUserEmails();

  return {
    generatedAt: now.toISOString(),
    inviteOnly: true,
    targetUsers: { min: 10, max: 20 },
    betaUserCount: betaEmails.length,
    periods: {
      today: computePeriod("today", now, all),
      week: computePeriod("week", now, all),
      month: computePeriod("month", now, all),
    },
    channels: {
      termsUrl: "/terms",
      privacyUrl: "/privacy",
      bugReportUrl: "/contact?category=bug",
      feedbackUrl: "/contact?category=service",
      contactUrl: "/contact",
      statusUrl: "/status",
    },
    improvementLog: listBetaImprovements(),
  };
}
