/**
 * Production Scheduler SoT — do not add a second scheduler / queue / worker.
 *
 * automation register
 *   → nextRunAt (V1 automations.nextRun / V2 atlas_automations.next_run_at)
 *   → POST /api/automations/tick  (CRON_SECRET)
 *   → V2 due-tick (atlas_automations / atlas_automation_runs) then
 *     V1 processWorkQueueTick → enqueueDueAutomations
 *   → occurrenceKey claim (Postgres SKIP LOCKED / file lock)
 *   → /api/worker/drain + in-tick drain
 *   → executeWorkStep / provider (idempotent side-effect)
 *   → completion gate (evidence required)
 *   → computeNextRunIso
 *
 * Production minute driver: GitHub Actions `.github/workflows/minute-scheduler.yml`
 * Hobby Vercel cron (`vercel.json`) is daily fallback only.
 */

export const PRODUCTION_SCHEDULER_SOT = {
  schedulerEntrypoint: "POST /api/automations/tick",
  apiRoute: "app/api/automations/tick/route.ts",
  workerApiRoute: "app/api/worker/drain/route.ts",
  v1Db: "atlas_work_queue_jobs / atlas_work_queue_steps",
  v2Db: "atlas_automations / atlas_automation_runs",
  queueStore: "getWorkQueueStore() — Postgres SKIP LOCKED or file store",
  claimFn: "WorkQueueStore.leaseJobs",
  workerFn: "drainWorkQueue / drainWorkQueueHorizontal",
  leaseMs: 60_000,
  heartbeatMs: 15_000,
  stuckMs: 90_000,
  retry: "classifyErrorCode + decideRetry + computeRetryAtIso (full jitter, max 5)",
  recovery: "recoverStuckJobs / expired-lease reclaim",
  completionGate: "evaluateWorkQueueCompletion",
  nextOccurrence: "computeNextRunIso (Asia/Tokyo default)",
  notification: "classifySchedulerUserNotification + V2 notifyAutomationRunEvent",
  productionMinuteDriver: ".github/workflows/minute-scheduler.yml",
  hobbyDailyFallback: "vercel.json cron 0 0 * * *",
  proMinuteTemplate: "vercel.cron.pro.json",
  killSwitch: "ENABLE_SCHEDULED_CRON=false",
} as const;
