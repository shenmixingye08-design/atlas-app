import { authorizeAutomationTick } from "@/lib/automations/tick-auth";
import {
  processDueAutoPostsFromAutomationTick,
  processScheduledXPostsFromAutomationTick,
} from "@/lib/integrations/x/post/automation";
import { clientSafeMessage } from "@/lib/security/client-safe-message";
import {
  classifyTickFailure,
  isRetryableWorkQueueFailure,
  type TickFailureDiagnostics,
} from "@/lib/work-queue/tick-diagnostics";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
/** Minute path + side drains; GHA also fans out /api/worker/drain. */
export const maxDuration = 300;

function resolveOrigin(request: Request): string {
  const host =
    request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  const protocol = request.headers.get("x-forwarded-proto") ?? "http";

  if (host) {
    return `${protocol}://${host}`;
  }

  return new URL(request.url).origin;
}

type V2ScheduleSummary = {
  due: number;
  enqueued: number;
  deduped: number;
  failed: number;
  dispatched: number;
};

type V2ConditionSummary = {
  scanned: number;
  evaluated: number;
  edges: number;
  enqueued: number;
  deduped: number;
  evaluationFailed: number;
  dispatched: number;
};

/**
 * Minute-capable due tick.
 * Scheduler enqueues durable jobs; worker drains leases (step-sized).
 * Auth: `Authorization: Bearer $CRON_SECRET` or ATLAS owner session.
 *
 * Vercel Hobby cannot deploy `* * * * *` — use GitHub Actions minute workflow
 * (`.github/workflows/minute-scheduler.yml`) as the production minute path.
 * `vercel.json` keeps a daily fallback; Pro can switch to minute via
 * `vercel.cron.pro.json`.
 *
 * N-08: V2 due schedule/dispatch is the canonical Automation path and must not
 * be blocked when legacy V1 work_queue throws (Production evidence: natural
 * Minute Scheduler 31559210683 → HTTP 500 work_queue_query_failed before V2).
 */
export async function POST(request: Request): Promise<Response> {
  const gate = await authorizeAutomationTick(request);
  if (!gate.ok) {
    const { recordCronTickOutcome } = await import("@/lib/owner/monitoring");
    recordCronTickOutcome(false, gate.error);
    return Response.json({ error: gate.error }, { status: gate.status });
  }

  const scheduledCronEnabled =
    process.env.ENABLE_SCHEDULED_CRON?.trim().toLowerCase() !== "false";
  if (!scheduledCronEnabled) {
    return Response.json({
      skipped: true,
      reason: "ENABLE_SCHEDULED_CRON=false",
      processed: 0,
      results: [],
    });
  }

  const origin = resolveOrigin(request);

  // --- N-08 canonical V2 first (isolated from V1 work_queue) ---
  let v2Schedule: V2ScheduleSummary = {
    due: 0,
    enqueued: 0,
    deduped: 0,
    failed: 0,
    dispatched: 0,
  };
  let v2Condition: V2ConditionSummary = {
    scanned: 0,
    evaluated: 0,
    edges: 0,
    enqueued: 0,
    deduped: 0,
    evaluationFailed: 0,
    dispatched: 0,
  };
  let v2Dispatch = { processed: 0 };
  let v2PathError: string | null = null;
  try {
    const { processDueScheduledAutomationsV2 } = await import(
      "@/lib/automation-platform/schedule/due-tick"
    );
    // V2: enqueue from DB SoT (dispatch false here; separate durable claim below).
    const scheduled = await processDueScheduledAutomationsV2({
      limit: 20,
      dispatch: false,
    });
    v2Schedule = {
      due: scheduled.due,
      enqueued: scheduled.enqueued,
      deduped: scheduled.deduped,
      failed: scheduled.failed,
      dispatched: scheduled.dispatched,
    };

    // Phase 4: condition/event evaluation (isolated from schedule due-tick).
    try {
      const { processConditionAutomationsV2 } = await import(
        "@/lib/automation-platform/condition/process-condition-tick"
      );
      const conditioned = await processConditionAutomationsV2({
        limit: 20,
        dispatch: false,
      });
      v2Condition = {
        scanned: conditioned.scanned,
        evaluated: conditioned.evaluated,
        edges: conditioned.edges,
        enqueued: conditioned.enqueued,
        deduped: conditioned.deduped,
        evaluationFailed: conditioned.evaluationFailed,
        dispatched: conditioned.dispatched,
      };
    } catch (conditionError) {
      console.warn(
        "[automation tick] v2 condition evaluate skipped:",
        conditionError,
      );
    }

    // P1-03: DB claim is multi-instance safe — dispatch in all environments
    // when atlas_automations / atlas_automation_runs SoT is ready.
    // Never fall back to process-local memory claim.
    const { isAutomationV2DbSotReady } = await import(
      "@/lib/automation-platform/repository/table-ready"
    );
    if (await isAutomationV2DbSotReady()) {
      const { dispatchAutomationRuns } = await import(
        "@/lib/automation-platform/execution/dispatch"
      );
      v2Dispatch = await dispatchAutomationRuns({ limit: 10 });
      v2Schedule = { ...v2Schedule, dispatched: v2Dispatch.processed };
      v2Condition = { ...v2Condition, dispatched: v2Dispatch.processed };
    } else {
      const { isAtlasProduction } = await import(
        "@/lib/runtime/is-production"
      );
      if (isAtlasProduction()) {
        console.error(
          "[automation tick] P1-03: V2 DB SoT not ready — skipping dispatch (fail-closed)",
        );
      }
      v2Dispatch = { processed: 0 };
    }
  } catch (error) {
    v2PathError = clientSafeMessage(error, "v2_schedule_dispatch_failed");
    console.warn("[automation tick] v2 schedule/dispatch skipped:", error);
  }

  const v2Progress =
    v2Schedule.enqueued +
    v2Schedule.deduped +
    v2Condition.enqueued +
    v2Condition.deduped +
    v2Dispatch.processed;

  // --- Legacy V1 work queue (isolated; must not block V2) ---
  let workQueue: Awaited<
    ReturnType<typeof import("@/lib/work-queue/tick").processWorkQueueTick>
  > | null = null;
  let workQueueFailure: TickFailureDiagnostics | null = null;
  try {
    const { processWorkQueueTick } = await import("@/lib/work-queue/tick");
    workQueue = await processWorkQueueTick({
      requestOrigin: origin,
    });
  } catch (error) {
    workQueueFailure = classifyTickFailure(error, "work_queue");
    console.error("[automation tick] work_queue failed (V2 path isolated)", {
      failedStage: workQueueFailure.failedStage,
      developerCode: workQueueFailure.developerCode,
      failureClass: workQueueFailure.failureClass,
      errorName: workQueueFailure.errorName,
      pgCode: workQueueFailure.pgCode,
      substage: workQueueFailure.substage,
      retryable: isRetryableWorkQueueFailure(workQueueFailure),
      postgresUrlConfigured: workQueueFailure.postgresUrlConfigured,
      extendedPostgresUrlOnly: workQueueFailure.extendedPostgresUrlOnly,
      v2Enqueued: v2Schedule.enqueued,
      v2Dispatched: v2Dispatch.processed,
    });
  }

  // Fatal V1 failure + no V2 progress → HTTP 500 (GHA alert).
  // Retryable V1 failure (pool exhaustion / DB blip): HTTP 200 + ok:false so
  // Minute Scheduler can still run /api/worker/drain fan-out (Production
  // evidence: tick 500 exited before drain_* and hid concurrent pool races).
  // When V2 already progressed: always HTTP 200 + ok:false (honest, not soft-success).
  if (
    workQueueFailure &&
    v2Progress === 0 &&
    !isRetryableWorkQueueFailure(workQueueFailure)
  ) {
    const message = "Automation tick failed";
    const { recordCronTickOutcome } = await import("@/lib/owner/monitoring");
    const { recordAutomationCronDebug } = await import(
      "@/lib/automations/execution-log"
    );
    recordCronTickOutcome(
      false,
      `${workQueueFailure.developerCode}:${message}`,
    );
    recordAutomationCronDebug({
      ok: false,
      error: `${workQueueFailure.developerCode}:${message}`,
    });
    return Response.json(
      {
        error: message,
        failedStage: workQueueFailure.failedStage,
        developerCode: workQueueFailure.developerCode,
        failureClass: workQueueFailure.failureClass,
        errorName: workQueueFailure.errorName,
        pgCode: workQueueFailure.pgCode,
        substage: workQueueFailure.substage,
        postgresUrlConfigured: workQueueFailure.postgresUrlConfigured,
        extendedPostgresUrlOnly: workQueueFailure.extendedPostgresUrlOnly,
        retryable: false,
        v2Schedule,
        v2Dispatch,
        ...(v2PathError ? { v2PathError } : {}),
      },
      { status: 500 },
    );
  }

  // Non-critical side steps: never fail the whole minute tick (P1-07).
  let scheduledXPosts: Awaited<
    ReturnType<typeof processScheduledXPostsFromAutomationTick>
  > = [];
  try {
    scheduledXPosts = await processScheduledXPostsFromAutomationTick();
  } catch (error) {
    console.warn("[automation tick] scheduled X posts skipped:", error);
  }

  let autoPosts: Awaited<
    ReturnType<typeof processDueAutoPostsFromAutomationTick>
  > = [];
  try {
    autoPosts = await processDueAutoPostsFromAutomationTick();
  } catch (error) {
    console.warn("[automation tick] auto posts skipped:", error);
  }

  let dailyReports: { processed: number } = { processed: 0 };
  try {
    const { dispatchDailyReportsForDueUsers } = await import(
      "@/lib/reports/daily-dispatch"
    );
    const reportResults = await dispatchDailyReportsForDueUsers();
    dailyReports = {
      processed: reportResults.filter((row) => row.sent).length,
    };
  } catch (error) {
    console.warn("[automation tick] daily reports skipped:", error);
  }

  // P1-02: drain durable notification delivery retries (not DLQ replay).
  let notificationRetries = {
    due: 0,
    claimed: 0,
    delivered: 0,
    rescheduled: 0,
    deadLettered: 0,
    skipped: 0,
    failed: 0,
    dlqReinjected: 0,
  };
  try {
    const { processDurableNotificationRetries } = await import(
      "@/lib/notifications/retry-drain"
    );
    notificationRetries = await processDurableNotificationRetries({
      limit: 20,
    });
  } catch (error) {
    console.warn("[automation tick] notification retry drain skipped:", error);
  }

  const { recordCronTickOutcome, recordMonitoringIncident } = await import(
    "@/lib/owner/monitoring"
  );
  const { recordAutomationCronDebug } = await import(
    "@/lib/automations/execution-log"
  );

  const workQueueOk = workQueueFailure === null && workQueue !== null;
  // Honest outcome: ok only when V1 work queue succeeded (N-07 no soft-success).
  // When V1 failed but V2 progressed, HTTP 200 so GHA can drain; ok stays false.
  const tickOk = workQueueOk;
  recordCronTickOutcome(
    tickOk,
    workQueueFailure
      ? `${workQueueFailure.developerCode}:work_queue_isolated`
      : undefined,
  );

  recordAutomationCronDebug({
    ok: tickOk,
    dueCount: workQueue?.schedule.due ?? v2Schedule.due,
    successCount: workQueue?.worker.completed ?? v2Dispatch.processed,
    failureCount: workQueue?.worker.failed ?? v2Schedule.failed,
    ...(workQueueFailure
      ? { error: `${workQueueFailure.developerCode}:work_queue_isolated` }
      : {}),
  });

  if (workQueue) {
    for (const alert of workQueue.alerts.filter((a) => a.severity === "critical")) {
      recordMonitoringIncident({
        kind: "automation_failure",
        targetId: "automation",
        message: `[work-queue] ${alert.code}: ${alert.message}`,
        critical: true,
        source: "automation_tick",
      });
    }
  }

  // P1-07: external monitor cycle after tick path is durable-recorded.
  let externalMonitor = {
    ok: false,
    openIncidents: 0,
    deliveriesSent: 0,
    resolvedThisCycle: 0,
  };
  try {
    const { runExternalMonitorCycle } = await import(
      "@/lib/external-monitor"
    );
    const cycle = await runExternalMonitorCycle();
    externalMonitor = {
      ok: cycle.ok,
      openIncidents: cycle.openIncidents,
      deliveriesSent: cycle.deliveriesSent,
      resolvedThisCycle: cycle.resolvedThisCycle,
    };
  } catch (error) {
    console.warn("[automation tick] external monitor skipped:", error);
  }

  return Response.json({
    ok: tickOk,
    processed:
      (workQueue?.worker.completed ?? 0) + (workQueue?.worker.failed ?? 0),
    ...(workQueueFailure
      ? {
          workQueueFailure: {
            failedStage: workQueueFailure.failedStage,
            developerCode: workQueueFailure.developerCode,
            failureClass: workQueueFailure.failureClass,
            errorName: workQueueFailure.errorName,
            pgCode: workQueueFailure.pgCode,
            substage: workQueueFailure.substage,
            postgresUrlConfigured: workQueueFailure.postgresUrlConfigured,
            extendedPostgresUrlOnly: workQueueFailure.extendedPostgresUrlOnly,
            retryable: isRetryableWorkQueueFailure(workQueueFailure),
          },
        }
      : {}),
    workQueue: workQueue
      ? {
          schedule: workQueue.schedule,
          worker: {
            completed: workQueue.worker.completed,
            failed: workQueue.worker.failed,
            leased: workQueue.worker.leased,
            // P2-03 safe counts only (no job/user ids).
            fanOut: workQueue.worker.plan.fanOut,
            claimLimit: workQueue.worker.plan.claimLimit,
            backpressure: workQueue.worker.plan.backpressure,
            workerCount: workQueue.worker.workerIds.length,
          },
          alertCount: workQueue.alerts.length,
          schedulerHealth: workQueue.health,
        }
      : null,
    v2Schedule,
    v2Condition,
    v2Dispatch,
    ...(v2PathError ? { v2PathError } : {}),
    scheduledXPosts: {
      processed: scheduledXPosts.length,
    },
    autoPosts: {
      processedUsers: autoPosts.length,
    },
    dailyReports,
    notificationRetries,
    externalMonitor,
  });
}

export async function GET(request: Request): Promise<Response> {
  return POST(request);
}
