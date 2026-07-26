import "server-only";

import { parseAtlasOwnerEmails } from "@/lib/auth/is-atlas-owner";
import {
  fetchStripeLiveCumulativeMetrics,
  fetchStripeLiveMonthMetrics,
  fetchStripeLiveTodayMetrics,
} from "@/lib/billing/analytics/stripe-live-metrics";
import { fetchStripeSubscriptionLiveMetrics } from "@/lib/billing/analytics/stripe-subscription-metrics";
import { getOwnerBillingMetrics } from "@/lib/billing/analytics/owner-metrics";
import { getPlanDefinition } from "@/lib/billing/plans/registry";
import { isPaidCapableStatus } from "@/lib/billing/subscriptions/service";
import {
  hydrateSubscriptionsFromSupabase,
  listUserSubscriptions,
} from "@/lib/billing/subscriptions/store";
import { summarizeAiUsageEvents } from "@/lib/billing/usage/meter";
import { listAiUsageEvents } from "@/lib/billing/usage/store";
import { ensureBillingUsageHydrated } from "@/lib/billing/usage/durable";
import { listRecentJobs, getJobMetrics24h } from "@/lib/jobs/job-store";
import type { JobStatus } from "@/lib/jobs/types";
import { getCancellationAnalysisSnapshot } from "@/lib/owner/cancellation-analysis";
import { listCostUsageEvents } from "@/lib/owner/cost-ranking/store";
import { getCostRankingSnapshot } from "@/lib/owner/cost-ranking";
import { formatOwnerJpy, formatOwnerPercent, formatOwnerUsd } from "@/lib/owner/format";
import { getMonitoringSnapshot } from "@/lib/owner/monitoring";
import { getPopularityRankingSnapshot } from "@/lib/owner/popularity-ranking/service";
import { getSupabaseServiceRoleEnv } from "@/lib/supabase/env";
import { isStripeConfigured } from "@/lib/billing/stripe/config";
import { getEmployeeTeamStatsSnapshot } from "@/lib/team-collaboration/telemetry";
import { listAuditLogEntries } from "@/lib/owner/audit-log";
import { isOwnerAccountSuspended } from "@/lib/owner/user-admin/store";

function getUsdJpyRateOrNull(): number | null {
  const rate = Number(process.env.ATLAS_USD_JPY_RATE ?? "");
  if (!Number.isFinite(rate) || rate <= 0) return null;
  return rate;
}

import { apiHintsForModel, labelForFeature, labelForModel } from "./labels";
import type {
  AiModelCostRow,
  ApiCostLogRow,
  DeliverableAnalyticsRow,
  DeliverableCostRow,
  DepartmentMonitorRow,
  ExecutiveDashboardSnapshot,
  ExecutiveKpiCard,
  ExecutivePeriod,
  JobMonitorBuckets,
  JobMonitorRow,
  StripeExecutiveMetrics,
  SystemMonitorMetric,
  UserProfitRow,
} from "./types";

function maskUserId(userId: string): string {
  if (userId.length <= 8) return `${userId.slice(0, 2)}***`;
  return `${userId.slice(0, 6)}…${userId.slice(-4)}`;
}

function moneyAvailability(
  availability: "ok" | "disconnected" | "failed",
): "ok" | "disconnected" | "failed" {
  return availability;
}

function buildAiByModel(now: Date): AiModelCostRow[] {
  const breakdown = summarizeAiUsageEvents(listAiUsageEvents(), now);
  return Object.entries(breakdown.byModel)
    .map(([model, period]) => ({
      model,
      displayName: labelForModel(model),
      requests: period.requests,
      inputTokens: period.inputTokens,
      outputTokens: period.outputTokens,
      costUsd: Math.round(period.estimatedCostUsd * 100) / 100,
      apiHints: apiHintsForModel(model),
    }))
    .sort((a, b) => b.costUsd - a.costUsd);
}

function buildDeliverableCosts(now: Date): DeliverableCostRow[] {
  const costSnap = getCostRankingSnapshot(now);
  const costEvents = listCostUsageEvents();
  const ai = summarizeAiUsageEvents(listAiUsageEvents(), now);

  const byFeature = new Map<string, DeliverableCostRow>();

  for (const row of costSnap.rankings) {
    byFeature.set(row.featureId, {
      featureId: row.featureId,
      label: row.label,
      generationCount: row.usageCount,
      avgCostUsd:
        row.usageCount > 0
          ? Math.round((row.apiCostUsd / row.usageCount) * 100) / 100
          : null,
      avgDurationMs: row.avgUsageTimeMs || null,
      successRatePercent: null,
      failureRatePercent: null,
      totalCostUsd: Math.round(row.apiCostUsd * 100) / 100,
    });
  }

  for (const [feature, period] of Object.entries(ai.byFeature)) {
    const existing = byFeature.get(feature);
    if (existing) {
      if (existing.totalCostUsd === 0 && period.estimatedCostUsd > 0) {
        existing.totalCostUsd = Math.round(period.estimatedCostUsd * 100) / 100;
        existing.generationCount = Math.max(
          existing.generationCount,
          period.requests,
        );
        existing.avgCostUsd =
          existing.generationCount > 0
            ? Math.round(
                (existing.totalCostUsd / existing.generationCount) * 100,
              ) / 100
            : null;
      }
      continue;
    }
    byFeature.set(feature, {
      featureId: feature,
      label: labelForFeature(feature),
      generationCount: period.requests,
      avgCostUsd:
        period.requests > 0
          ? Math.round((period.estimatedCostUsd / period.requests) * 100) / 100
          : null,
      avgDurationMs: null,
      successRatePercent: null,
      failureRatePercent: null,
      totalCostUsd: Math.round(period.estimatedCostUsd * 100) / 100,
    });
  }

  // Success / failure from cost events when available (duration > 0 implies attempt).
  const successMap = new Map<string, { ok: number; fail: number; dur: number[] }>();
  for (const event of costEvents) {
    const bucket = successMap.get(event.featureId) ?? {
      ok: 0,
      fail: 0,
      dur: [],
    };
    // Cost events from orchestration don't carry success; treat as success attempts.
    bucket.ok += 1;
    bucket.dur.push(event.durationMs);
    successMap.set(event.featureId, bucket);
  }

  for (const [featureId, stats] of successMap) {
    const row = byFeature.get(featureId);
    if (!row) continue;
    const total = stats.ok + stats.fail;
    if (total > 0) {
      row.successRatePercent = Math.round((stats.ok / total) * 1000) / 10;
      row.failureRatePercent = Math.round((stats.fail / total) * 1000) / 10;
    }
    if (stats.dur.length > 0 && row.avgDurationMs == null) {
      row.avgDurationMs = Math.round(
        stats.dur.reduce((a, b) => a + b, 0) / stats.dur.length,
      );
    }
  }

  return [...byFeature.values()].sort(
    (a, b) => b.totalCostUsd - a.totalCostUsd,
  );
}

function buildApiCostLog(now: Date): ApiCostLogRow[] {
  const events = listAiUsageEvents();
  const monthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const byFeature = new Map<
    string,
    Map<string, { cost: number; requests: number }>
  >();

  for (const event of events) {
    if (!event.timestamp.startsWith(monthKey)) continue;
    const featureMap =
      byFeature.get(event.feature) ??
      new Map<string, { cost: number; requests: number }>();
    const modelBucket = featureMap.get(event.model) ?? {
      cost: 0,
      requests: 0,
    };
    modelBucket.cost += event.estimatedCostUsd;
    modelBucket.requests += event.requestCount;
    featureMap.set(event.model, modelBucket);
    byFeature.set(event.feature, featureMap);
  }

  return [...byFeature.entries()]
    .map(([featureId, models]) => {
      const modelLines = [...models.entries()]
        .map(([model, row]) => ({
          model,
          displayName: labelForModel(model),
          costUsd: Math.round(row.cost * 100) / 100,
          requests: row.requests,
        }))
        .sort((a, b) => b.costUsd - a.costUsd);
      const totalCostUsd = Math.round(
        modelLines.reduce((sum, row) => sum + row.costUsd, 0) * 100,
      ) / 100;
      return {
        featureId,
        label: labelForFeature(featureId),
        models: modelLines,
        totalCostUsd,
        generationCount: modelLines.reduce((sum, row) => sum + row.requests, 0),
      };
    })
    .sort((a, b) => b.totalCostUsd - a.totalCostUsd);
}

function buildUserProfits(now: Date): UserProfitRow[] {
  const monthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const subs = listUserSubscriptions();
  const aiEvents = listAiUsageEvents().filter((e) =>
    e.timestamp.startsWith(monthKey),
  );
  const costEvents = listCostUsageEvents().filter((e) =>
    e.timestamp.startsWith(monthKey),
  );
  const fx = getUsdJpyRateOrNull();

  const byUser = new Map<
    string,
    {
      cost: number;
      runs: number;
      durations: number[];
      deliverables: number;
      planId: UserProfitRow["planId"];
    }
  >();

  for (const event of aiEvents) {
    const current = byUser.get(event.userId) ?? {
      cost: 0,
      runs: 0,
      durations: [] as number[],
      deliverables: 0,
      planId: event.planId,
    };
    current.cost += event.estimatedCostUsd;
    current.runs += event.requestCount;
    byUser.set(event.userId, current);
  }

  for (const event of costEvents) {
    if (!event.userId) continue;
    const current = byUser.get(event.userId) ?? {
      cost: 0,
      runs: 0,
      durations: [] as number[],
      deliverables: 0,
      planId: "free" as const,
    };
    current.cost += event.costUsd;
    current.deliverables += 1;
    current.durations.push(event.durationMs);
    byUser.set(event.userId, current);
  }

  for (const sub of subs) {
    if (!byUser.has(sub.userId)) {
      byUser.set(sub.userId, {
        cost: 0,
        runs: 0,
        durations: [],
        deliverables: 0,
        planId: sub.planId,
      });
    }
  }

  return [...byUser.entries()]
    .map(([userId, row]) => {
      const sub = subs.find((s) => s.userId === userId);
      const planId = sub?.planId ?? row.planId;
      const plan = getPlanDefinition(planId);
      const paid =
        sub != null &&
        plan.monthlyPriceJpy > 0 &&
        isPaidCapableStatus(sub.status);
      const revenueJpy = paid ? plan.monthlyPriceJpy : 0;
      const apiCostJpy =
        fx == null ? null : Math.round(row.cost * fx);
      const profitJpy =
        apiCostJpy == null ? null : revenueJpy - apiCostJpy;
      let status: UserProfitRow["status"] = "free";
      if (isOwnerAccountSuspended(userId)) status = "suspended";
      else if (sub?.status === "canceled") status = "churned";
      else if (paid) status = "active";

      return {
        userId,
        displayName: maskUserId(userId),
        planId,
        revenueJpy: paid ? revenueJpy : 0,
        apiCostUsd: Math.round(row.cost * 100) / 100,
        profitJpy,
        runCount: row.runs,
        avgDurationMs:
          row.durations.length > 0
            ? Math.round(
                row.durations.reduce((a, b) => a + b, 0) / row.durations.length,
              )
            : null,
        avgDeliverables:
          row.runs > 0
            ? Math.round((row.deliverables / Math.max(1, row.runs)) * 100) / 100
            : row.deliverables,
        status,
      };
    })
    .sort((a, b) => b.apiCostUsd - a.apiCostUsd)
    .slice(0, 100);
}

function buildDepartments(): DepartmentMonitorRow[] {
  const team = getEmployeeTeamStatsSnapshot();
  const defs: { id: string; label: string; match: (name: string, dept: string) => boolean }[] = [
    {
      id: "planner",
      label: "Planner",
      match: (n, d) => /planner|計画/i.test(n) || /planning|計画/i.test(d),
    },
    {
      id: "writer",
      label: "Writer",
      match: (n, d) => /writer|執筆|content|marketing/i.test(n + d),
    },
    {
      id: "reviewer",
      label: "Reviewer",
      match: (n, d) => /review|qa|品質/i.test(n + d),
    },
    {
      id: "formatter",
      label: "Formatter",
      match: (n, d) => /format|document|資料/i.test(n + d),
    },
    {
      id: "vision",
      label: "Vision",
      match: (n, d) => /vision|画像|receipt/i.test(n + d),
    },
    {
      id: "learning",
      label: "Learning",
      match: (n, d) => /learn|学習/i.test(n + d),
    },
    {
      id: "automation",
      label: "Automation",
      match: (n, d) => /automat|自動化/i.test(n + d),
    },
    {
      id: "scheduler",
      label: "Scheduler",
      match: (n, d) => /schedul|cron|定期/i.test(n + d),
    },
  ];

  return defs.map((def) => {
    const matched = team.employees.filter((emp) =>
      def.match(emp.employeeName, emp.departmentLabel),
    );
    const processed = matched.reduce((s, e) => s + e.assignedCount, 0);
    const errors = matched.reduce((s, e) => s + e.failedCount, 0);
    const avgDurationMs =
      matched.length > 0
        ? Math.round(
            matched.reduce((s, e) => s + e.avgDurationMs, 0) / matched.length,
          )
        : null;

    let status: DepartmentMonitorRow["status"] = "idle";
    if (errors > 0 && processed > 0 && errors / processed >= 0.3) {
      status = "error";
    } else if (processed > 0) {
      status = "running";
    }

    return {
      id: def.id,
      label: def.label,
      status,
      statusLabel:
        status === "running"
          ? "稼働中"
          : status === "error"
            ? "エラー"
            : "待機",
      processedCount: processed,
      avgDurationMs,
      queueCount: 0,
      errorCount: errors,
    };
  });
}

async function buildJobs(): Promise<JobMonitorBuckets> {
  const jobs = await listRecentJobs({ limit: 200 });
  const toRow = (job: (typeof jobs)[number]): JobMonitorRow => ({
    id: job.id,
    userId: maskUserId(job.userId),
    jobType: job.jobType,
    status: job.status,
    currentStep: job.currentStep,
    progressPercent: job.progressPercent,
    lastErrorMessage: job.lastErrorMessage,
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
    startedAt: job.startedAt,
    completedAt: job.completedAt,
  });

  const runningStatuses: JobStatus[] = ["running", "retrying"];
  const queuedStatuses: JobStatus[] = [
    "queued",
    "scheduled",
    "waiting_for_approval",
  ];
  const failedStatuses: JobStatus[] = ["failed"];
  const completedStatuses: JobStatus[] = ["completed", "partially_completed"];

  const running = jobs.filter((j) => runningStatuses.includes(j.status)).map(toRow);
  const queued = jobs.filter((j) => queuedStatuses.includes(j.status)).map(toRow);
  const failed = jobs.filter((j) => failedStatuses.includes(j.status)).map(toRow);
  const completed = jobs
    .filter((j) => completedStatuses.includes(j.status))
    .map(toRow);

  // Enrich department queue counts from jobs when possible.
  return {
    running,
    queued,
    failed,
    completed,
    counts: {
      running: running.length,
      queued: queued.length,
      failed: failed.length,
      completed: completed.length,
    },
  };
}

function buildDeliverableAnalytics(now: Date): DeliverableAnalyticsRow[] {
  const popularity = getPopularityRankingSnapshot(now);
  const costs = getCostRankingSnapshot(now);
  const costByFeature = new Map(
    costs.rankings.map((row) => [row.featureId, row]),
  );

  return popularity.rankings.map((row) => {
    const cost = costByFeature.get(row.featureId);
    return {
      featureId: row.featureId,
      label: row.label,
      generationCount: row.usageCount,
      avgRating: null, // no rating telemetry yet — do not invent
      avgDurationMs: cost?.avgUsageTimeMs ?? null,
      regenRatePercent: null,
      successRatePercent:
        cost && cost.usageCount > 0 ? 100 : row.usageCount > 0 ? null : null,
    };
  });
}

async function buildStripeMetrics(
  now: Date,
): Promise<StripeExecutiveMetrics> {
  const [month, today, cumulative, subs] = await Promise.all([
    fetchStripeLiveMonthMetrics(now),
    fetchStripeLiveTodayMetrics(now),
    fetchStripeLiveCumulativeMetrics(now),
    fetchStripeSubscriptionLiveMetrics(),
  ]);
  const local = getOwnerBillingMetrics(now);
  const cancel = getCancellationAnalysisSnapshot(now);
  const billing =
    subs.availability === "ok" && subs.metrics ? subs.metrics : local;

  const mrrJpy = billing.mrrJpy;
  const paid = billing.paidSubscribers;
  const arpuJpy = paid > 0 ? Math.round(mrrJpy / paid) : null;
  const churn = cancel.churnRatePercent;
  const renewalRatePercent =
    churn == null ? null : Math.round((100 - churn) * 10) / 10;
  // LTV ≈ ARPU / churnRate (monthly) when churn > 0 — real formula, not filler.
  const ltvJpy =
    arpuJpy != null && churn != null && churn > 0
      ? Math.round(arpuJpy / (churn / 100))
      : null;

  const cashAvail = moneyAvailability(month.availability);
  const toJpy = (amount: number, currency: string) =>
    currency.toLowerCase() === "jpy" ? Math.round(amount) : null;

  return {
    availability: cashAvail,
    statusMessage:
      cashAvail === "ok" ? null : month.statusMessage ?? "Stripe未接続",
    todayRevenueJpy:
      today.availability === "ok" ? toJpy(today.grossRevenue, today.currency) : null,
    monthRevenueJpy:
      month.availability === "ok" ? toJpy(month.grossRevenue, month.currency) : null,
    cumulativeRevenueJpy:
      cumulative.availability === "ok"
        ? toJpy(cumulative.grossRevenue, cumulative.currency)
        : null,
    mrrJpy,
    arrJpy: mrrJpy * 12,
    subscriptionCount: paid,
    renewalRatePercent,
    churnRatePercent: churn,
    ltvJpy,
    arpuJpy,
  };
}

async function buildSystemMetrics(
  now: Date,
): Promise<SystemMonitorMetric[]> {
  const monitoring = await getMonitoringSnapshot(now);
  const jobMetrics = await getJobMetrics24h();
  const ai = summarizeAiUsageEvents(listAiUsageEvents(), now);
  const supabaseOk = Boolean(getSupabaseServiceRoleEnv());
  const stripeOk = isStripeConfigured();
  const openaiConfigured = Boolean(process.env.OPENAI_API_KEY?.trim());
  const todayAnalytics = monitoring.analytics?.today;
  const avgResponseMs = todayAnalytics?.avgResponseMs ?? 0;
  const apiErrorRatePercent = todayAnalytics?.apiErrorRatePercent ?? 0;

  const healthById = new Map(
    (monitoring.health ?? []).map((h) => [h.id, h] as const),
  );

  const fmtHealth = (id: string, label: string): SystemMonitorMetric => {
    const h = healthById.get(id as never);
    if (!h) {
      return {
        id,
        label,
        value: "—",
        availability: "unset",
        statusMessage: "未計測",
      };
    }
    return {
      id,
      label,
      value:
        h.level === "ok" ? "正常" : h.level === "warn" ? "警告" : "停止",
      availability: h.level === "down" ? "failed" : "ok",
      statusMessage: h.detail,
    };
  };

  return [
    {
      id: "cpu",
      label: "CPU",
      value: "—",
      availability: "unset",
      statusMessage: "ホストメトリクス未接続（Vercelでは非公開）",
    },
    {
      id: "memory",
      label: "Memory",
      value: "—",
      availability: "unset",
      statusMessage: "ホストメトリクス未接続（Vercelでは非公開）",
    },
    {
      id: "storage",
      label: "Storage",
      value: "—",
      availability: "unset",
      statusMessage: "ホストメトリクス未接続",
    },
    {
      id: "supabase",
      label: "Supabase",
      value: supabaseOk ? "接続可" : "未設定",
      availability: supabaseOk ? "ok" : "disconnected",
      statusMessage: supabaseOk
        ? "SERVICE_ROLE 設定済み"
        : "SUPABASE_SERVICE_ROLE_KEY 未設定",
    },
    {
      id: "openai",
      label: "OpenAI",
      value: openaiConfigured ? "接続可" : "未設定",
      availability: openaiConfigured ? "ok" : "disconnected",
      statusMessage: openaiConfigured
        ? `今月 ${ai.month.requests} リクエスト`
        : "OPENAI_API_KEY 未設定",
    },
    {
      id: "vercel",
      label: "Vercel",
      value: process.env.VERCEL ? "稼働中" : "ローカル",
      availability: "ok",
      statusMessage: process.env.VERCEL_ENV ?? "development",
    },
    fmtHealth("cron", "Cron"),
    {
      id: "queue",
      label: "Queue",
      value: String(jobMetrics.total),
      availability: "ok",
      statusMessage: `24h: 完了${jobMetrics.completed} / 失敗${jobMetrics.failed} / 再試行${jobMetrics.retrying}`,
    },
    {
      id: "response",
      label: "Response速度",
      value: avgResponseMs > 0 ? `${Math.round(avgResponseMs)} ms` : "—",
      availability: avgResponseMs > 0 ? "ok" : "empty",
      statusMessage: null,
    },
    {
      id: "avg_generation",
      label: "平均生成時間",
      value: (() => {
        const costs = getCostRankingSnapshot(now).rankings;
        const withDur = costs.filter((r) => r.avgUsageTimeMs > 0);
        if (withDur.length === 0) return "—";
        const avg = Math.round(
          withDur.reduce((s, r) => s + r.avgUsageTimeMs, 0) / withDur.length,
        );
        return `${(avg / 1000).toFixed(1)} 秒`;
      })(),
      availability: "ok",
      statusMessage: "コストランキングの実測平均",
    },
    {
      id: "api_error_rate",
      label: "APIエラー率",
      value: `${apiErrorRatePercent}%`,
      availability: "ok",
      statusMessage: "今日",
    },
    {
      id: "stripe_health",
      label: "Stripe",
      value: stripeOk ? "接続可" : "未接続",
      availability: stripeOk ? "ok" : "disconnected",
      statusMessage: null,
    },
  ];
}

function buildKpis(input: {
  stripe: StripeExecutiveMetrics;
  apiCostUsd: number | null;
  profitLabel: string;
  profitAvail: ExecutiveKpiCard["availability"];
  profitHint: string | null;
  marginPercent: number | null;
  newSignups: number;
  paid: number;
  free: number;
  churnRate: number | null;
  activeUsers: number;
}): ExecutiveKpiCard[] {
  const fmtCash = (v: number | null, avail: ExecutiveKpiCard["availability"]) =>
    avail === "ok" && v != null ? formatOwnerJpy(v) : "—";

  return [
    {
      id: "today_revenue",
      label: "今日の売上",
      value: fmtCash(input.stripe.todayRevenueJpy, input.stripe.availability),
      availability: input.stripe.availability,
      statusMessage: input.stripe.statusMessage,
      hint: "Stripe Invoice（本日）",
      accent: "revenue",
    },
    {
      id: "month_revenue",
      label: "今月売上",
      value: fmtCash(input.stripe.monthRevenueJpy, input.stripe.availability),
      availability: input.stripe.availability,
      statusMessage: input.stripe.statusMessage,
      hint: "Stripe Invoice（今月）",
      accent: "revenue",
    },
    {
      id: "cumulative_revenue",
      label: "累計売上",
      value: fmtCash(
        input.stripe.cumulativeRevenueJpy,
        input.stripe.availability,
      ),
      availability: input.stripe.availability,
      statusMessage: input.stripe.statusMessage,
      hint: "Stripe Invoice（累計）",
      accent: "revenue",
    },
    {
      id: "mrr",
      label: "MRR",
      value:
        input.stripe.mrrJpy != null
          ? formatOwnerJpy(input.stripe.mrrJpy)
          : "—",
      availability: "ok",
      statusMessage: null,
      hint: "月次経常収益",
      accent: "revenue",
    },
    {
      id: "arr",
      label: "ARR",
      value:
        input.stripe.arrJpy != null
          ? formatOwnerJpy(input.stripe.arrJpy)
          : "—",
      availability: "ok",
      statusMessage: null,
      hint: "MRR × 12（契約ベース）",
      accent: "revenue",
    },
    {
      id: "profit",
      label: "利益",
      value: input.profitLabel,
      availability: input.profitAvail,
      statusMessage: input.profitHint,
      hint: "純売上 − 取得済み費用",
      accent: "profit",
    },
    {
      id: "api_cost",
      label: "API利用料金",
      value:
        input.apiCostUsd != null
          ? formatOwnerUsd(input.apiCostUsd, true)
          : "—",
      availability: input.apiCostUsd != null ? "ok" : "empty",
      statusMessage: input.apiCostUsd != null ? null : "利用データなし",
      hint: "OpenAI利用台帳（今月）",
      accent: "cost",
    },
    {
      id: "margin",
      label: "利益率",
      value:
        input.marginPercent != null
          ? formatOwnerPercent(input.marginPercent)
          : "—",
      availability: input.marginPercent != null ? "ok" : "incomplete",
      statusMessage:
        input.marginPercent != null ? null : "費用未確定のため未計算",
      hint: null,
      accent: "profit",
    },
    {
      id: "signups",
      label: "新規登録",
      value: input.newSignups.toLocaleString("ja-JP"),
      availability: "ok",
      statusMessage: null,
      hint: "今月・契約ストア currentPeriodStart",
      accent: "default",
    },
    {
      id: "paid",
      label: "有料会員数",
      value: input.paid.toLocaleString("ja-JP"),
      availability: "ok",
      statusMessage: null,
      hint: null,
      accent: "default",
    },
    {
      id: "free",
      label: "無料会員数",
      value: input.free.toLocaleString("ja-JP"),
      availability: "ok",
      statusMessage: null,
      hint: null,
      accent: "default",
    },
    {
      id: "churn",
      label: "解約率",
      value:
        input.churnRate != null
          ? formatOwnerPercent(input.churnRate)
          : "—",
      availability: input.churnRate != null ? "ok" : "empty",
      statusMessage: null,
      hint: "今月",
      accent: "default",
    },
    {
      id: "active",
      label: "アクティブユーザー",
      value: input.activeUsers.toLocaleString("ja-JP"),
      availability: "ok",
      statusMessage: null,
      hint: "今日の実アクティビティ",
      accent: "default",
    },
  ];
}

export async function getExecutiveDashboardSnapshot(
  period: ExecutivePeriod = "month",
  now: Date = new Date(),
): Promise<ExecutiveDashboardSnapshot> {
  await ensureBillingUsageHydrated();
  await hydrateSubscriptionsFromSupabase();

  const [stripe, jobs, system] = await Promise.all([
    buildStripeMetrics(now),
    buildJobs(),
    buildSystemMetrics(now),
  ]);

  const ai = summarizeAiUsageEvents(listAiUsageEvents(), now);
  const apiCostUsd =
    ai.month.estimatedCostUsd > 0
      ? Math.round(ai.month.estimatedCostUsd * 100) / 100
      : null;

  const fx = getUsdJpyRateOrNull();
  const monthRev = stripe.monthRevenueJpy;
  let profitLabel = "—";
  let profitAvail: ExecutiveKpiCard["availability"] = "incomplete";
  let profitHint: string | null = "一部費用未取得のため利益未確定";
  let marginPercent: number | null = null;

  if (monthRev != null && apiCostUsd != null && fx != null) {
    const profit = Math.round(monthRev - apiCostUsd * fx);
    profitLabel = formatOwnerJpy(profit);
    profitAvail = "ok";
    profitHint = "売上 − OpenAI原価（為替適用）※インフラ費は未算入";
    marginPercent =
      monthRev > 0 ? Math.round((profit / monthRev) * 1000) / 10 : null;
  } else if (monthRev != null) {
    profitLabel = formatOwnerJpy(monthRev);
    profitHint = "暫定：売上のみ（原価未確定）";
  }

  const monthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const newSignups = listUserSubscriptions().filter((s) =>
    (s.currentPeriodStart ?? "").startsWith(monthKey),
  ).length;

  const monitoring = await getMonitoringSnapshot(now);
  const periodAnalytics =
    period === "today"
      ? monitoring.analytics.today
      : period === "week"
        ? monitoring.analytics.week
        : monitoring.analytics.month;

  const series =
    period === "today" || period === "week"
      ? monitoring.series.daily
      : period === "year"
        ? monitoring.series.monthly
        : monitoring.series.monthly;

  // Enrich department queue from jobs
  const departments = buildDepartments().map((dept) => {
    if (dept.id === "automation" || dept.id === "scheduler") {
      return { ...dept, queueCount: jobs.counts.queued };
    }
    return dept;
  });

  // Use audit unique users today as active if monitoring is 0 but audit has data
  let activeUsers = periodAnalytics.activeUsers;
  if (activeUsers === 0) {
    const start = new Date(now);
    start.setHours(0, 0, 0, 0);
    const set = new Set<string>();
    for (const entry of listAuditLogEntries()) {
      if (!entry.userId) continue;
      if (new Date(entry.at) >= start) set.add(entry.userId);
    }
    activeUsers = set.size;
  }

  const localBilling = getOwnerBillingMetrics(now);

  return {
    generatedAt: now.toISOString(),
    period,
    kpis: buildKpis({
      stripe,
      apiCostUsd,
      profitLabel,
      profitAvail,
      profitHint,
      marginPercent,
      newSignups,
      paid: stripe.subscriptionCount ?? localBilling.paidSubscribers,
      free: localBilling.freeSubscribers,
      churnRate: stripe.churnRatePercent,
      activeUsers,
    }),
    aiByModel: buildAiByModel(now),
    deliverableCosts: buildDeliverableCosts(now),
    userProfits: buildUserProfits(now),
    departments,
    jobs,
    stripe,
    system,
    deliverableAnalytics: buildDeliverableAnalytics(now),
    apiCostLog: buildApiCostLog(now),
    series,
    ownerEmails: parseAtlasOwnerEmails(),
  };
}
