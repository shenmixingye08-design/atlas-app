/**
 * Deadline-aware automation tick. Enqueue is prioritized; execution is bounded
 * and leftover work continues on the next tick / worker drain via leases.
 */

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

import {
  TICK_IN_REQUEST_LIMITS,
  buildAutomationTickSummary,
  createTickBudget,
  logAutomationTickSummary,
  runTickStage,
  type AutomationTickSummary,
  type TickStageRecord,
} from "./tick-budget";

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

export type AutomationTickResult = {
  httpStatus: 200 | 500;
  body: Record<string, unknown>;
  summary: AutomationTickSummary;
};

export async function runAutomationTick(input: {
  origin: string;
}): Promise<AutomationTickResult> {
  const budget = createTickBudget();
  const stages: TickStageRecord[] = [];
  const canStartJob = () => budget.shouldStartMoreWork();
  let schemaErrors: string[] = [];
  let discoveredJobs = 0;
  let claimedJobs = 0;
  let completedJobs = 0;
  let failedJobs = 0;
  let deferredJobs = 0;
  let externalCalls = 0;

  try {
    const schemaStage = await runTickStage({
      budget,
      stage: "schema_probe",
      skipIfDeadline: false,
      run: async () => {
        const { listTickSchemaErrors } = await import(
          "@/lib/health/production-schema-probe"
        );
        return listTickSchemaErrors();
      },
    });
    stages.push(schemaStage.record);
    schemaErrors = schemaStage.value ?? [];

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
    let v2Dispatch = { processed: 0, deferred: 0, succeeded: 0, failed: 0 };
    let v2PathError: string | null = null;

    try {
      const scheduleStage = await runTickStage({
        budget,
        stage: "v2_schedule_enqueue",
        skipIfDeadline: false,
        run: async () => {
          const { processDueScheduledAutomationsV2 } = await import(
            "@/lib/automation-platform/schedule/due-tick"
          );
          return processDueScheduledAutomationsV2({
            limit: TICK_IN_REQUEST_LIMITS.v2ScheduleEnqueue,
            dispatch: false,
          });
        },
      });
      stages.push(scheduleStage.record);
      if (scheduleStage.value) {
        v2Schedule = {
          due: scheduleStage.value.due,
          enqueued: scheduleStage.value.enqueued,
          deduped: scheduleStage.value.deduped,
          failed: scheduleStage.value.failed,
          dispatched: scheduleStage.value.dispatched,
        };
        discoveredJobs += scheduleStage.value.due;
      }

      const conditionStage = await runTickStage({
        budget,
        stage: "v2_condition_evaluate",
        run: async () => {
          const { processConditionAutomationsV2 } = await import(
            "@/lib/automation-platform/condition/process-condition-tick"
          );
          return processConditionAutomationsV2({
            limit: TICK_IN_REQUEST_LIMITS.v2ConditionEvaluate,
            dispatch: false,
          });
        },
      });
      stages.push(conditionStage.record);
      if (conditionStage.deferred) {
        deferredJobs += 1;
      } else if (conditionStage.value) {
        v2Condition = {
          scanned: conditionStage.value.scanned,
          evaluated: conditionStage.value.evaluated,
          edges: conditionStage.value.edges,
          enqueued: conditionStage.value.enqueued,
          deduped: conditionStage.value.deduped,
          evaluationFailed: conditionStage.value.evaluationFailed,
          dispatched: conditionStage.value.dispatched,
        };
        discoveredJobs += conditionStage.value.enqueued;
      }

      const dispatchStage = await runTickStage({
        budget,
        stage: "v2_dispatch",
        run: async () => {
          const { isAutomationV2DbSotReady } = await import(
            "@/lib/automation-platform/repository/table-ready"
          );
          if (!(await isAutomationV2DbSotReady())) {
            const { isAtlasProduction } = await import(
              "@/lib/runtime/is-production"
            );
            if (isAtlasProduction()) {
              console.error(
                "[automation tick] P1-03: V2 DB SoT not ready — skipping dispatch (fail-closed)",
              );
            }
            return { processed: 0, deferred: 0, succeeded: 0, failed: 0 };
          }
          const { dispatchAutomationRuns } = await import(
            "@/lib/automation-platform/execution/dispatch"
          );
          return dispatchAutomationRuns({
            limit: TICK_IN_REQUEST_LIMITS.v2Dispatch,
            signal: budget.signal,
            canStartJob,
          });
        },
      });
      stages.push(dispatchStage.record);
      if (dispatchStage.deferred) {
        deferredJobs += TICK_IN_REQUEST_LIMITS.v2Dispatch;
      } else if (dispatchStage.value) {
        v2Dispatch = {
          processed: dispatchStage.value.processed,
          deferred: dispatchStage.value.deferred ?? 0,
          succeeded: dispatchStage.value.succeeded ?? 0,
          failed: dispatchStage.value.failed ?? 0,
        };
        v2Schedule = { ...v2Schedule, dispatched: v2Dispatch.processed };
        v2Condition = { ...v2Condition, dispatched: v2Dispatch.processed };
        claimedJobs += v2Dispatch.processed;
        completedJobs += v2Dispatch.succeeded;
        failedJobs += v2Dispatch.failed;
        deferredJobs += v2Dispatch.deferred;
        externalCalls += v2Dispatch.processed;
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

    let workQueue: Awaited<
      ReturnType<typeof import("@/lib/work-queue/tick").processWorkQueueTick>
    > | null = null;
    let workQueueFailure: TickFailureDiagnostics | null = null;
    try {
      const v1Stage = await runTickStage({
        budget,
        stage: "v1_work_queue",
        skipIfDeadline: false,
        run: async () => {
          const { processWorkQueueTick } = await import("@/lib/work-queue/tick");
          return processWorkQueueTick({
            requestOrigin: input.origin,
            scheduleLimit: TICK_IN_REQUEST_LIMITS.v1ScheduleEnqueue,
            workerLimit: TICK_IN_REQUEST_LIMITS.v1WorkerClaim,
            workerFanOut: TICK_IN_REQUEST_LIMITS.v1WorkerFanOut,
            signal: budget.signal,
            canStartJob,
          });
        },
      });
      stages.push(v1Stage.record);
      workQueue = v1Stage.value;
      if (workQueue) {
        discoveredJobs += workQueue.schedule.due;
        claimedJobs += workQueue.worker.leased;
        completedJobs += workQueue.worker.completed;
        failedJobs += workQueue.worker.failed;
        const leftover =
          workQueue.schedule.due +
          workQueue.worker.leased -
          workQueue.worker.completed -
          workQueue.worker.failed;
        if (leftover > 0) deferredJobs += leftover;
      }
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
      const summary = buildAutomationTickSummary({
        tickId: budget.tickId,
        startedAtMs: budget.startedAtMs,
        stages,
        discoveredJobs,
        claimedJobs,
        completedJobs,
        failedJobs,
        deferredJobs,
        externalCalls,
        deadlineReached: budget.deadlineReached(),
        schemaErrors,
      });
      logAutomationTickSummary(summary);
      return {
        httpStatus: 500,
        summary,
        body: {
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
          tick: summary,
          ...(v2PathError ? { v2PathError } : {}),
        },
      };
    }

    let scheduledXPosts: Awaited<
      ReturnType<typeof processScheduledXPostsFromAutomationTick>
    > = [];
    try {
      const xStage = await runTickStage({
        budget,
        stage: "x_scheduled_posting",
        run: async () => {
          externalCalls += 1;
          return processScheduledXPostsFromAutomationTick({
            limit: TICK_IN_REQUEST_LIMITS.xScheduledPosts,
            signal: budget.signal,
            canStartJob,
          });
        },
      });
      stages.push(xStage.record);
      if (xStage.deferred) deferredJobs += 1;
      else scheduledXPosts = xStage.value ?? [];
    } catch (error) {
      console.warn("[automation tick] scheduled X posts skipped:", error);
    }

    let autoPosts: Awaited<
      ReturnType<typeof processDueAutoPostsFromAutomationTick>
    > = [];
    try {
      const autoStage = await runTickStage({
        budget,
        stage: "x_auto_posts",
        run: async () => {
          externalCalls += 1;
          return processDueAutoPostsFromAutomationTick({
            limitUsers: TICK_IN_REQUEST_LIMITS.xAutoPostUsers,
            signal: budget.signal,
            canStartJob,
          });
        },
      });
      stages.push(autoStage.record);
      if (autoStage.deferred) deferredJobs += 1;
      else autoPosts = autoStage.value ?? [];
    } catch (error) {
      console.warn("[automation tick] auto posts skipped:", error);
    }

    let dailyReports: { processed: number } = { processed: 0 };
    try {
      const reportStage = await runTickStage({
        budget,
        stage: "daily_reports",
        run: async () => {
          const { dispatchDailyReportsForDueUsers } = await import(
            "@/lib/reports/daily-dispatch"
          );
          return dispatchDailyReportsForDueUsers();
        },
      });
      stages.push(reportStage.record);
      if (reportStage.deferred) {
        deferredJobs += 1;
      } else if (reportStage.value) {
        dailyReports = {
          processed: reportStage.value.filter((row) => row.sent).length,
        };
      }
    } catch (error) {
      console.warn("[automation tick] daily reports skipped:", error);
    }

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
      const notifyStage = await runTickStage({
        budget,
        stage: "notification",
        run: async () => {
          const { processDurableNotificationRetries } = await import(
            "@/lib/notifications/retry-drain"
          );
          return processDurableNotificationRetries({
            limit: TICK_IN_REQUEST_LIMITS.notificationRetries,
          });
        },
      });
      stages.push(notifyStage.record);
      if (notifyStage.deferred) deferredJobs += 1;
      else if (notifyStage.value) notificationRetries = notifyStage.value;
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

    let externalMonitor = {
      ok: false,
      openIncidents: 0,
      deliveriesSent: 0,
      resolvedThisCycle: 0,
    };
    try {
      const monitorStage = await runTickStage({
        budget,
        stage: "external_monitor",
        run: async () => {
          const { runExternalMonitorCycle } = await import(
            "@/lib/external-monitor"
          );
          return runExternalMonitorCycle();
        },
      });
      stages.push(monitorStage.record);
      if (monitorStage.deferred) {
        deferredJobs += 1;
      } else if (monitorStage.value) {
        externalMonitor = {
          ok: monitorStage.value.ok,
          openIncidents: monitorStage.value.openIncidents,
          deliveriesSent: monitorStage.value.deliveriesSent,
          resolvedThisCycle: monitorStage.value.resolvedThisCycle,
        };
      }
    } catch (error) {
      console.warn("[automation tick] external monitor skipped:", error);
    }

    const cleanupStage = await runTickStage({
      budget,
      stage: "cleanup",
      skipIfDeadline: false,
      run: async () => true,
    });
    stages.push(cleanupStage.record);

    const summary = buildAutomationTickSummary({
      tickId: budget.tickId,
      startedAtMs: budget.startedAtMs,
      stages,
      discoveredJobs,
      claimedJobs,
      completedJobs,
      failedJobs,
      deferredJobs,
      externalCalls,
      deadlineReached: budget.deadlineReached(),
      schemaErrors,
    });
    logAutomationTickSummary(summary);

    return {
      httpStatus: 200,
      summary,
      body: {
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
        tick: summary,
        deadlineReached: summary.deadlineReached,
        deferredJobs: summary.deferredJobs,
        schemaErrors: summary.schemaErrors,
      },
    };
  } finally {
    budget.dispose();
  }
}
