/**
 * P1-07: Gather monitor signals and apply centralized thresholds.
 * Synthetic injections overlay failures without mutating user jobs.
 */

import "server-only";

import { ensureMonitoringHydrated } from "@/lib/owner/monitoring/durable";
import { getCronTickState } from "@/lib/owner/monitoring/store";
import { createServiceRoleClientIfConfigured } from "@/lib/supabase/service-role";
import { getWorkQueueStore } from "@/lib/work-queue/store";
import { listErrorCategoryStates } from "@/lib/owner/error-monitoring/store";
import { buildSystemStatusSnapshot } from "@/lib/owner/system-status/engine";

import { listActiveInjections } from "./store";
import { EXTERNAL_MONITOR_THRESHOLDS } from "./thresholds";
import type {
  InjectionKind,
  MonitorCheckId,
  MonitorCheckResult,
} from "./types";
import { INJECTION_TO_CHECK } from "./types";

function iso(nowMs: number): string {
  return new Date(nowMs).toISOString();
}

function severityFromTickAge(ageMs: number | null): MonitorCheckResult["severity"] {
  const t = EXTERNAL_MONITOR_THRESHOLDS.tick;
  if (ageMs == null) return "high";
  if (ageMs >= t.criticalDelayMs) return "critical";
  if (ageMs >= t.highDelayMs) return "high";
  if (ageMs >= t.warningDelayMs) return "warning";
  return "ok";
}

async function countTable(
  table:
    | "atlas_user_notifications"
    | "atlas_notification_dlq"
    | "atlas_side_effect_claims"
    | "atlas_automation_runs"
    | "atlas_alert_incidents",
  filters?: { column: string; value: string }[],
): Promise<number | null> {
  const client = createServiceRoleClientIfConfigured();
  if (!client) return null;
  // Untyped filter chain — status columns vary across tables in generated types.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let q: any = client.from(table).select("*", { count: "exact", head: true });
  for (const f of filters ?? []) {
    q = q.eq(f.column, f.value);
  }
  const { count, error } = (await q) as {
    count: number | null;
    error: { message: string } | null;
  };
  if (error) return null;
  return count ?? 0;
}

function applySynthetic(
  base: MonitorCheckResult,
  activeKinds: Set<InjectionKind>,
): MonitorCheckResult {
  for (const [kind, checkId] of Object.entries(INJECTION_TO_CHECK) as [
    InjectionKind,
    MonitorCheckId,
  ][]) {
    if (checkId !== base.checkId) continue;
    if (!activeKinds.has(kind)) continue;
    return {
      ...base,
      status: "critical",
      severity: "critical",
      title: `${base.title} (synthetic)`,
      summary: `Failure injection active: ${kind}`,
      metrics: {
        ...base.metrics,
        syntheticInjection: kind,
      },
      synthetic: true,
    };
  }
  return base;
}

async function checkSchedulerTick(nowMs: number): Promise<MonitorCheckResult> {
  await ensureMonitoringHydrated();
  const cron = getCronTickState();
  let lastSuccessAt = cron.lastSuccessAt;
  // Prefer durable work-queue scheduler heartbeat when present.
  try {
    const metrics = await getWorkQueueStore().metrics(nowMs);
    if (metrics.schedulerLastSuccessAt) {
      const wq = new Date(metrics.schedulerLastSuccessAt).getTime();
      const mem = lastSuccessAt ? new Date(lastSuccessAt).getTime() : 0;
      if (wq > mem) lastSuccessAt = metrics.schedulerLastSuccessAt;
    }
  } catch {
    // ignore
  }

  const ageMs = lastSuccessAt
    ? nowMs - new Date(lastSuccessAt).getTime()
    : null;
  const severity = severityFromTickAge(ageMs);
  const failedRecently =
    cron.lastFailureAt &&
    (!cron.lastSuccessAt ||
      new Date(cron.lastFailureAt).getTime() >
        new Date(cron.lastSuccessAt).getTime());

  let finalSeverity = severity;
  if (failedRecently && finalSeverity === "ok") finalSeverity = "warning";

  return {
    checkId: "scheduler.tick",
    status: finalSeverity,
    severity: finalSeverity,
    title: "Scheduler / tick",
    summary:
      finalSeverity === "ok"
        ? "Tick healthy"
        : `Tick delay/failure detected (ageMs=${ageMs ?? "unknown"})`,
    metrics: {
      lastSuccessAt,
      lastFailureAt: cron.lastFailureAt,
      ageMs,
      lastError: cron.lastError,
    },
    failureClass: "internal",
    affectedUsersEstimate: finalSeverity === "ok" ? 0 : 50,
    synthetic: false,
    observedAt: iso(nowMs),
  };
}

async function checkAutomationWorker(
  nowMs: number,
): Promise<MonitorCheckResult[]> {
  const t = EXTERNAL_MONITOR_THRESHOLDS.worker;
  let queued = 0;
  let running = 0;
  let stuck = 0;
  let failed = 0;
  let deadLetter = 0;
  let successRate: number | null = null;
  let workerCount = 0;

  try {
    const metrics = await getWorkQueueStore().metrics(nowMs);
    queued = metrics.queued;
    running = metrics.running + metrics.leased;
    stuck = metrics.stuck;
    failed = metrics.failed;
    deadLetter = metrics.deadLetter;
    successRate = metrics.successRate;
    workerCount = metrics.workerCount;
  } catch {
    // store unavailable
  }

  let failedRunsDb: number | null = null;
  try {
    failedRunsDb = await countTable("atlas_automation_runs", [
      { column: "status", value: "failed" },
    ]);
  } catch {
    failedRunsDb = null;
  }

  let workerSeverity: MonitorCheckResult["severity"] = "ok";
  if (stuck >= t.stuckCritical || (workerCount === 0 && running > 0)) {
    workerSeverity = "critical";
  } else if (stuck >= t.stuckHigh || queued >= t.dueJobsHigh) {
    workerSeverity = "high";
  } else if (stuck >= t.stuckWarning || queued >= t.dueJobsWarning) {
    workerSeverity = "warning";
  }

  const worker: MonitorCheckResult = {
    checkId: "automation.worker",
    status: workerSeverity,
    severity: workerSeverity,
    title: "Automation worker",
    summary:
      workerSeverity === "ok"
        ? "Worker healthy"
        : `Worker pressure: queued=${queued} stuck=${stuck} running=${running}`,
    metrics: {
      queued,
      running,
      stuck,
      deadLetter,
      workerCount,
      successRate,
    },
    failureClass: "internal",
    affectedUsersEstimate: Math.min(queued + stuck, 200),
    synthetic: false,
    observedAt: iso(nowMs),
  };

  let failSeverity: MonitorCheckResult["severity"] = "ok";
  const failedCount = failedRunsDb ?? failed;
  if (failedCount >= t.failedRunsCritical) failSeverity = "critical";
  else if (failedCount >= t.failedRunsHigh) failSeverity = "high";
  else if (failedCount >= t.failedRunsWarning) failSeverity = "warning";

  if (
    successRate != null &&
    failed + deadLetter + (successRate > 0 ? 20 : 0) >= t.successRateSampleMin &&
    successRate < t.successRateFloor &&
    failSeverity === "ok"
  ) {
    failSeverity = "high";
  }

  const failedRuns: MonitorCheckResult = {
    checkId: "automation.failed_runs",
    status: failSeverity,
    severity: failSeverity,
    title: "Automation failed runs",
    summary:
      failSeverity === "ok"
        ? "Failed-run rate healthy"
        : `Failed runs elevated: ${failedCount}`,
    metrics: {
      failedCount,
      workQueueFailed: failed,
      successRate,
    },
    failureClass: "internal",
    affectedUsersEstimate: Math.min(failedCount, 100),
    synthetic: false,
    observedAt: iso(nowMs),
  };

  return [worker, failedRuns];
}

async function checkNotifications(nowMs: number): Promise<MonitorCheckResult[]> {
  const t = EXTERNAL_MONITOR_THRESHOLDS.notification;
  const pendingRetry =
    (await countTable("atlas_user_notifications", [
      { column: "status", value: "retry_scheduled" },
    ])) ?? 0;
  const dlqCount =
    (await countTable("atlas_notification_dlq", [
      { column: "status", value: "dead" },
    ])) ??
    (await countTable("atlas_notification_dlq")) ??
    0;

  let retrySeverity: MonitorCheckResult["severity"] = "ok";
  if (pendingRetry >= t.pendingRetryCritical) retrySeverity = "critical";
  else if (pendingRetry >= t.pendingRetryHigh) retrySeverity = "high";
  else if (pendingRetry >= t.pendingRetryWarning) retrySeverity = "warning";

  let dlqSeverity: MonitorCheckResult["severity"] = "ok";
  if (dlqCount >= t.dlqGrowthCritical) dlqSeverity = "critical";
  else if (dlqCount >= t.dlqGrowthHigh) dlqSeverity = "high";
  else if (dlqCount >= t.dlqGrowthWarning) dlqSeverity = "warning";

  return [
    {
      checkId: "notification.retry",
      status: retrySeverity,
      severity: retrySeverity,
      title: "Notification retry",
      summary:
        retrySeverity === "ok"
          ? "Retry queue healthy"
          : `Pending retries elevated: ${pendingRetry}`,
      metrics: { pendingRetry },
      failureClass: "internal",
      affectedUsersEstimate: Math.min(pendingRetry, 200),
      synthetic: false,
      observedAt: iso(nowMs),
    },
    {
      checkId: "notification.dlq",
      status: dlqSeverity,
      severity: dlqSeverity,
      title: "Notification DLQ",
      summary:
        dlqSeverity === "ok"
          ? "DLQ healthy"
          : `DLQ elevated: ${dlqCount}`,
      metrics: { dlqCount },
      failureClass: "internal",
      affectedUsersEstimate: Math.min(dlqCount, 200),
      synthetic: false,
      observedAt: iso(nowMs),
    },
  ];
}

async function checkSideEffects(nowMs: number): Promise<MonitorCheckResult> {
  const t = EXTERNAL_MONITOR_THRESHOLDS.sideEffect;
  const pending =
    (await countTable("atlas_side_effect_claims", [
      { column: "status", value: "pending" },
    ])) ?? 0;
  const processing =
    (await countTable("atlas_side_effect_claims", [
      { column: "status", value: "processing" },
    ])) ?? 0;
  const unknownOutcome =
    (await countTable("atlas_side_effect_claims", [
      { column: "status", value: "unknown_outcome" },
    ])) ?? 0;
  const failed =
    (await countTable("atlas_side_effect_claims", [
      { column: "status", value: "failed" },
    ])) ?? 0;

  let severity: MonitorCheckResult["severity"] = "ok";
  if (
    unknownOutcome >= t.unknownOutcomeHigh ||
    failed >= t.repeatedFailureHigh ||
    processing >= t.processingStallCountHigh
  ) {
    severity = "critical";
  } else if (
    unknownOutcome >= t.unknownOutcomeWarning ||
    failed >= t.repeatedFailureWarning ||
    pending >= t.pendingStallHigh ||
    processing >= t.processingStallCountWarning
  ) {
    severity = "high";
  } else if (pending >= t.pendingStallWarning) {
    severity = "warning";
  }

  return {
    checkId: "side_effect.claims",
    status: severity,
    severity,
    title: "Side-effect claims",
    summary:
      severity === "ok"
        ? "Side-effect claims healthy"
        : `Side-effect anomaly pending=${pending} processing=${processing} unknown=${unknownOutcome} failed=${failed}`,
    metrics: { pending, processing, unknownOutcome, failed },
    failureClass: "internal",
    affectedUsersEstimate: Math.min(pending + processing + unknownOutcome, 100),
    synthetic: false,
    observedAt: iso(nowMs),
  };
}

async function checkDatabase(nowMs: number): Promise<MonitorCheckResult> {
  const client = createServiceRoleClientIfConfigured();
  if (!client) {
    const { isExternalMonitorMemoryAllowed } = await import("./store");
    if (isExternalMonitorMemoryAllowed()) {
      return {
        checkId: "database.core",
        status: "ok",
        severity: "ok",
        title: "Database / API",
        summary: "Test memory mode (Postgres not required)",
        metrics: { connected: false, testMemoryMode: true },
        failureClass: "internal",
        affectedUsersEstimate: 0,
        synthetic: false,
        observedAt: iso(nowMs),
      };
    }
    return {
      checkId: "database.core",
      status: "critical",
      severity: "critical",
      title: "Database / API",
      summary: "Service role client not configured",
      metrics: { connected: false },
      failureClass: "internal",
      affectedUsersEstimate: 1000,
      synthetic: false,
      observedAt: iso(nowMs),
    };
  }

  const required = [
    "atlas_alert_incidents",
    "atlas_alert_deliveries",
    "atlas_monitor_check_runs",
    "atlas_user_notifications",
    "atlas_side_effect_claims",
  ] as const;

  const missing: string[] = [];
  for (const table of required) {
    const { error } = await client.from(table).select("id").limit(1);
    if (
      error &&
      /schema cache|does not exist|Could not find the table/i.test(error.message)
    ) {
      missing.push(table);
    }
  }

  let claimRpcOk = false;
  const { error: rpcError } = await client.rpc("atlas_claim_alert_delivery", {
    p_id: "__probe_missing__",
    p_incident_id: "__probe_missing__",
    p_delivery_kind: "opened",
    p_channel: "probe",
    p_dedupe_key: `probe_${randomProbeKey()}`,
    p_claimed_by: "probe",
  });
  // Missing FK will fail — function existence is what we care about.
  if (!rpcError) {
    claimRpcOk = true;
  } else if (!/function .* does not exist/i.test(rpcError.message)) {
    claimRpcOk = true;
  }

  const severity: MonitorCheckResult["severity"] =
    missing.length > 0 || !claimRpcOk ? "critical" : "ok";

  return {
    checkId: "database.core",
    status: severity,
    severity,
    title: "Database / API",
    summary:
      severity === "ok"
        ? "Required tables/RPC present"
        : `DB anomaly missing=${missing.join(",") || "none"} claimRpcOk=${claimRpcOk}`,
    metrics: {
      missingCount: missing.length,
      claimRpcOk,
      connected: true,
    },
    failureClass: "internal",
    affectedUsersEstimate: severity === "ok" ? 0 : 1000,
    synthetic: false,
    observedAt: iso(nowMs),
  };
}

function randomProbeKey(): string {
  return `p107_probe_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

async function checkExternalOpenAI(nowMs: number): Promise<MonitorCheckResult> {
  const t = EXTERNAL_MONITOR_THRESHOLDS.external;
  const openErrors = listErrorCategoryStates().filter(
    (s) =>
      s.categoryId === "openai" &&
      s.resolutionStatus === "open" &&
      s.occurrenceCount > 0,
  );
  const occurrence = openErrors.reduce((n, s) => n + s.occurrenceCount, 0);
  const snap = buildSystemStatusSnapshot();
  const openai = snap.services.find((s) => s.serviceId === "openai");
  const outage = openai?.status === "outage";

  let severity: MonitorCheckResult["severity"] = "ok";
  if (outage || occurrence >= t.openErrorCritical) severity = "critical";
  else if (occurrence >= t.openErrorHigh) severity = "high";
  else if (occurrence >= t.openErrorWarning) severity = "warning";

  return {
    checkId: "external.openai",
    status: severity,
    severity,
    title: "External dependency: OpenAI",
    summary:
      severity === "ok"
        ? "OpenAI dependency healthy"
        : outage
          ? "OpenAI provider outage (external)"
          : `OpenAI errors elevated (external): ${occurrence}`,
    metrics: {
      occurrence,
      outage,
      uptimePercent: openai?.uptimePercent ?? null,
    },
    failureClass: "external_provider",
    affectedUsersEstimate: severity === "ok" ? 0 : 100,
    synthetic: false,
    observedAt: iso(nowMs),
  };
}

export async function evaluateAllChecks(
  nowMs = Date.now(),
): Promise<MonitorCheckResult[]> {
  const injections = await listActiveInjections(nowMs);
  const activeKinds = new Set(injections.map((i) => i.injectionKind));

  const [tick, workerPair, notifications, sideEffect, database, openai] =
    await Promise.all([
      checkSchedulerTick(nowMs),
      checkAutomationWorker(nowMs),
      checkNotifications(nowMs),
      checkSideEffects(nowMs),
      checkDatabase(nowMs),
      checkExternalOpenAI(nowMs),
    ]);

  const all = [
    tick,
    ...workerPair,
    ...notifications,
    sideEffect,
    database,
    openai,
  ];
  return all.map((c) => applySynthetic(c, activeKinds));
}
