import type { RestartScenarioResult } from "./types";

/**
 * Restart scenarios verified against code paths (desk analysis of real branches).
 * Not live chaos tests — conclusions cite concrete modules.
 */
export const RESTART_SCENARIOS: readonly RestartScenarioResult[] = [
  {
    id: "A",
    title: "Job queued直後に process restart",
    codePaths: [
      "lib/work-queue/store/postgres-store.ts (enqueue)",
      "lib/work-queue/store/file-store.ts (enqueue + persist)",
      "lib/work-queue/store/index.ts (backend selection)",
    ],
    remains: [
      "Postgres path: job row with status queued (if commit completed)",
      "File path: job in .data/work-queue.json only if persist() finished",
    ],
    lost: [
      "In-memory singleton store state",
      "Uncommitted enqueue / incomplete file rename",
      "V2 run occurrence Map entries not yet durable-persisted",
    ],
    resumable: true,
    doubleExecutionRisk: false,
    falseCompletedRisk: false,
    currentOutcome:
      "Postgres SoT → worker can lease after restart. File SoT → only same instance disk; Vercel ephemeral → job lost. Memory-only V2 enqueue → lost.",
    requiredFix:
      "Mandate Postgres Work Queue in production (fail-fast if unavailable); await durable run/occurrence write before ack.",
  },
  {
    id: "B",
    title: "Worker running中に restart",
    codePaths: [
      "lib/work-queue/worker.ts:49-120 (lease, running, heartbeat interval)",
      "lib/work-queue/store/* (lease_expires_at / heartbeat_at)",
    ],
    remains: [
      "Last persisted job status/lease/heartbeat",
      "Completed steps already written via updateStep",
    ],
    lost: [
      "setInterval heartbeat timer",
      "In-flight step execution without updateStep",
      "Process-local file mutex",
    ],
    resumable: true,
    doubleExecutionRisk: true,
    falseCompletedRisk: false,
    currentOutcome:
      "After lease expiry another worker can reclaim. If external side-effect already applied but step not completed → duplicate risk on retry.",
    requiredFix:
      "Durable step claim + external idempotency keys before side effects; await heartbeat writes or shorten reclaim with evidence checks.",
  },
  {
    id: "C",
    title: "Artifact生成後、Storage保存前に restart",
    codePaths: [
      "lib/deliverables/store.ts:173-174 (void persistDurableDeliverable)",
      "lib/deliverables/durable-store.ts",
      "lib/deliverables/object-storage.ts:190-203",
    ],
    remains: [
      "Possibly nothing if only __atlasDeliverableStore had the buffer",
      "Partial DB row without storage object if mid-write",
    ],
    lost: [
      "In-memory deliverable buffer",
      "Unfinished Storage upload",
    ],
    resumable: false,
    doubleExecutionRisk: true,
    falseCompletedRisk: true,
    currentOutcome:
      "User/job may see memory hit then cold miss; regenerate may create second artifact. Local backend reports ok without durable bytes.",
    requiredFix:
      "Await durable metadata+bytes before returning success; transactional evidence linking artifactId to job/run.",
  },
  {
    id: "D",
    title: "External API成功後、Evidence保存前に restart",
    codePaths: [
      "lib/work-queue/steps/execute-step.ts (external steps)",
      "lib/automation-platform/execution/executor.ts",
      "lib/jobs/completion-evidence.ts",
      "lib/integrations/x/* (post + void credential persist)",
    ],
    remains: [
      "External system side effect (tweet/mail/etc.)",
      "Possibly no durable evidence in job/run",
    ],
    lost: [
      "In-memory run/step evidence",
      "Detached durable-domain persist of runs",
    ],
    resumable: true,
    doubleExecutionRisk: true,
    falseCompletedRisk: true,
    currentOutcome:
      "Retry may re-post; or recovery marks failed despite external success; false completed if memory said ok without durable proof.",
    requiredFix:
      "Write pending_external / idempotency record BEFORE external call; store provider result ids durably before completed.",
  },
  {
    id: "E",
    title: "Notification前に restart",
    codePaths: [
      "lib/notifications/service.ts:192-214",
      "lib/notifications/durable.ts:50-63",
      "lib/work-queue/steps/execute-step.ts:180-232",
    ],
    remains: [
      "Job/run may already be completed in store",
      "In-app notification only if append+persist completed",
    ],
    lost: [
      "void deliverLineWithAck / deliverWebPushWithAck in flight",
      "Debounced notification durable persist",
    ],
    resumable: false,
    doubleExecutionRisk: true,
    falseCompletedRisk: false,
    currentOutcome:
      "User may get job completed without push/LINE; retry notify can duplicate if not idempotent.",
    requiredFix:
      "Durable outbox for notification delivery; ACK/DLQ already partial — make create→outbox transactional with job completion.",
  },
  {
    id: "F",
    title: "Scheduler tick中に restart",
    codePaths: [
      "app/api/automations/tick/route.ts",
      "lib/automation-platform/schedule/due-tick.ts",
      "lib/work-queue/scheduler.ts",
      "lib/automations/global-durable.ts",
    ],
    remains: [
      "Already enqueued Work Queue jobs (if durable backend)",
      "Persisted nextRunAt if durable persist completed",
    ],
    lost: [
      "In-memory due list / nextRunAt advances not persisted",
      "Tick claims only in process/global durable if write incomplete",
    ],
    resumable: true,
    doubleExecutionRisk: true,
    falseCompletedRisk: false,
    currentOutcome:
      "Missed tick or double occurrence enqueue depending on whether occurrenceKey was durable.",
    requiredFix:
      "Durable occurrence reservation before enqueue; DB unique on occurrence; await nextRunAt persist.",
  },
  {
    id: "G",
    title: "Memory更新直後に restart",
    codePaths: [
      "lib/work-memory/store.ts",
      "lib/work-memory/durable.ts:74-78",
      "lib/personal-memory/durable.ts:91-92",
    ],
    remains: [
      "Last successfully upserted atlas_user_state payload",
    ],
    lost: [
      "Hot Map mutations after last void persistDurableDomain",
      "Hydration flags (re-hydrate on next request)",
    ],
    resumable: false,
    doubleExecutionRisk: false,
    falseCompletedRisk: false,
    currentOutcome:
      "Recent memory writes disappear until user re-enters them; apply-log may also miss events.",
    requiredFix:
      "Await persist for mutating Memory APIs; optional write-ahead to atlas_user_state before ACK.",
  },
  {
    id: "H",
    title: "Retry scheduled中に restart",
    codePaths: [
      "lib/work-queue/retry.ts",
      "lib/work-queue/worker.ts (decideRetry → updateJob retry_at)",
      "lib/jobs/job-store.ts (next_retry_at / memory Map)",
    ],
    remains: [
      "Postgres/file job with retry_at/status if update persisted",
    ],
    lost: [
      "Memory-fallback job retry schedule",
      "In-flight decideRetry before store update",
    ],
    resumable: true,
    doubleExecutionRisk: true,
    falseCompletedRisk: false,
    currentOutcome:
      "Durable retry_at → recovered on next drain. Memory-only → retry forever lost. Reclaim may re-run external steps.",
    requiredFix:
      "Forbid memory-only job store in production; durable retry_at + external idempotency.",
  },
] as const;
