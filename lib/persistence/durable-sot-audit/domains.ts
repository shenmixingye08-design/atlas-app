import type { DomainSotRecord } from "./types";

/**
 * Single Source of Truth declaration per domain — derived from main code paths.
 * Mixed means multiple write/read backends are live depending on env/hydration.
 */
export const DOMAIN_SOT_TABLE: readonly DomainSotRecord[] = [
  {
    domain: "Automation",
    sot: "mixed",
    primaryPaths: [
      "lib/automations/repositories/server-automation-repository.ts",
      "lib/automations/durable.ts",
      "lib/automation-platform/repository/memory-store.ts",
      "lib/automation-platform/durable.ts",
    ],
    durableBackend:
      "atlas_user_state domains atlasAutomations / atlasAutomationsV2 (+ migration tables atlas_automations)",
    processMemoryHotPath:
      "globalThis.__atlasAutomationStore / __atlasAutomationPlatformStore",
    fileFallback: null,
    browserStorage: null,
    mixedDetail:
      "Hot path = process Map; durable write via void persistDurableDomain (fire-and-forget). V2 migration SQL exists; runtime still centers on memory-store + durable-domain.",
    survivesRestart: false,
    productionReachable: true,
    notes: [
      "Restart loses unhydrated/unpersisted mutations until durable persist completes",
      "Remote apply of atlas_automations table is unconfirmed",
    ],
  },
  {
    domain: "Schedule",
    sot: "mixed",
    primaryPaths: [
      "lib/automation-platform/schedule/due-tick.ts",
      "lib/work-queue/scheduler.ts",
      "app/api/automations/tick/route.ts",
      "lib/automations/global-durable.ts",
    ],
    durableBackend:
      "nextRunAt inside durable automation payload; work-queue jobs in Postgres when available",
    processMemoryHotPath: "__atlasAutomationPlatformStore.nextRunAt / due list",
    fileFallback: ".data/work-queue.json (schedulerLastSuccessAt when file store)",
    browserStorage: null,
    mixedDetail:
      "V2 due-tick reads memory store; Work Queue enqueue targets Postgres or file fallback.",
    survivesRestart: false,
    productionReachable: true,
    notes: ["Tick mid-flight advances may be lost if persist not awaited"],
  },
  {
    domain: "Occurrence",
    sot: "mixed",
    primaryPaths: [
      "lib/automation-platform/repository/memory-store.ts",
      "lib/work-queue/occurrence.ts",
      "lib/work-queue/store/postgres-store.ts",
    ],
    durableBackend:
      "atlas_work_queue_jobs.occurrence_key UNIQUE (Postgres); V2 occurrenceKeys Map (+ durable runs domain)",
    processMemoryHotPath: "__atlasAutomationPlatformStore.occurrenceKeys",
    fileFallback: "file-store jobs[].occurrenceKey",
    browserStorage: null,
    mixedDetail:
      "Work Queue SoT intended Postgres; V2 occurrence dedupe is process Map until durable-domain hydrate.",
    survivesRestart: false,
    productionReachable: true,
    notes: ["Duplicate occurrence risk across instances when memory SoT"],
  },
  {
    domain: "Run",
    sot: "mixed",
    primaryPaths: [
      "lib/automation-platform/repository/memory-store.ts",
      "lib/automation-platform/durable-runs.ts",
      "lib/commander/run-store.ts",
      "lib/work-jobs/store.ts",
    ],
    durableBackend:
      "atlasAutomationRunsV2 / atlasCommanderRuns / atlasWorkJobs in atlas_user_state; migration atlas_automation_runs",
    processMemoryHotPath:
      "__atlasAutomationPlatformStore.runs / __atlasCommanderRunStore / __atlasWorkJobs",
    fileFallback: null,
    browserStorage: null,
    mixedDetail:
      "schedulePersistAutomationRunsV2 uses void persistDurableDomain — not awaited.",
    survivesRestart: false,
    productionReachable: true,
    notes: ["Dedicated atlas_automation_runs repository usage not confirmed in runtime"],
  },
  {
    domain: "Job",
    sot: "mixed",
    primaryPaths: [
      "lib/work-queue/store/index.ts",
      "lib/work-queue/store/postgres-store.ts",
      "lib/work-queue/store/file-store.ts",
      "lib/jobs/job-store.ts",
    ],
    durableBackend:
      "atlas_work_queue_jobs (intended); atlas_automation_jobs for legacy jobs",
    processMemoryHotPath: "__atlasAutomationJobs (legacy fallback)",
    fileFallback: ".data/work-queue.json when Postgres unavailable / FORCE_FILE",
    browserStorage: null,
    mixedDetail:
      "getWorkQueueStore(): Postgres if DATABASE_URL else file. Legacy job-store: Supabase else memory Map.",
    survivesRestart: false,
    productionReachable: true,
    notes: [
      "Migration comment declares Postgres SoT",
      "File/memory fallbacks are production-reachable if env incomplete",
    ],
  },
  {
    domain: "Step",
    sot: "mixed",
    primaryPaths: [
      "lib/work-queue/store/postgres-store.ts",
      "lib/work-queue/store/file-store.ts",
      "lib/work-queue/worker.ts",
    ],
    durableBackend: "atlas_work_queue_steps",
    processMemoryHotPath: null,
    fileFallback: "embedded in .data/work-queue.json",
    browserStorage: null,
    mixedDetail: "Follows Work Queue store backend (Postgres vs file).",
    survivesRestart: false,
    productionReachable: true,
    notes: ["In-flight step status lost if not persisted before crash"],
  },
  {
    domain: "Lease",
    sot: "mixed",
    primaryPaths: [
      "lib/work-queue/store/postgres-store.ts",
      "lib/work-queue/store/file-store.ts",
      "lib/work-queue/worker.ts",
    ],
    durableBackend: "atlas_work_queue_jobs.lease_owner / lease_expires_at",
    processMemoryHotPath: null,
    fileFallback: "file-store lease fields (process-local mutex only)",
    browserStorage: null,
    mixedDetail:
      "Postgres SKIP LOCKED style leasing when PG available; file store mutex is single-process only.",
    survivesRestart: false,
    productionReachable: true,
    notes: ["Restart clears in-memory mutex; lease reclaim depends on durable lease expiry"],
  },
  {
    domain: "Heartbeat",
    sot: "mixed",
    primaryPaths: ["lib/work-queue/worker.ts"],
    durableBackend: "job.heartbeat_at column (Postgres/file)",
    processMemoryHotPath: "setInterval void store.heartbeat(...) fire-and-forget",
    fileFallback: "same file snapshot",
    browserStorage: null,
    mixedDetail:
      "Heartbeat updates are detached (void promise). Missed heartbeats → stuck reclaim path.",
    survivesRestart: false,
    productionReachable: true,
    notes: ["Timer dies with process; last durable heartbeat_at remains if persisted"],
  },
  {
    domain: "Retry",
    sot: "mixed",
    primaryPaths: [
      "lib/work-queue/retry.ts",
      "lib/work-queue/worker.ts",
      "lib/jobs/job-store.ts",
    ],
    durableBackend: "job.retry_at / attempt / status in Work Queue or automation_jobs",
    processMemoryHotPath: "__atlasAutomationJobs.nextRetryAt when memory fallback",
    fileFallback: "file-store retryAt",
    browserStorage: null,
    mixedDetail: "Retry decision is code; schedule state must be durable to resume.",
    survivesRestart: false,
    productionReachable: true,
    notes: ["Memory-only retry schedule is lost on restart"],
  },
  {
    domain: "Recovery",
    sot: "mixed",
    primaryPaths: [
      "lib/work-queue/worker.ts",
      "lib/jobs/reliability.ts",
      "lib/owner/disaster-recovery/store.ts",
    ],
    durableBackend:
      "Work Queue reclaim via lease expiry; reliability events table; DR durable domain",
    processMemoryHotPath: "owner DR / monitoring globalThis buckets",
    fileFallback: "file-store recovery counters",
    browserStorage: null,
    mixedDetail: "Recovery effectiveness depends on durable lease/job state.",
    survivesRestart: false,
    productionReachable: true,
    notes: [],
  },
  {
    domain: "Artifact",
    sot: "mixed",
    primaryPaths: [
      "lib/deliverables/store.ts",
      "lib/deliverables/durable-store.ts",
      "lib/deliverables/object-storage.ts",
      "lib/work-queue/steps/execute-step.ts",
    ],
    durableBackend:
      "atlas_deliverable_files + Supabase Storage; contentBase64 emergency column",
    processMemoryHotPath: "__atlasDeliverableStore",
    fileFallback:
      "local object-storage backend / .data/work-queue-artifacts (offline notify)",
    browserStorage: null,
    mixedDetail:
      "void persistDurableDeliverable after memory insert — crash window between buffer and durable write.",
    survivesRestart: false,
    productionReachable: true,
    notes: ["Disk load explicitly removed from durable-store; local backend still exists for dev"],
  },
  {
    domain: "CompletionEvidence",
    sot: "mixed",
    primaryPaths: [
      "lib/jobs/completion-evidence.ts",
      "lib/automation-platform/execution/completion-evidence-v2.ts",
      "lib/work-queue/completion-gate.ts",
      "lib/results/completion.ts",
    ],
    durableBackend:
      "job steps/evidence JSON; run artifacts in durable runs; work-queue step outputs",
    processMemoryHotPath: "V2 run evidence in memory store until persist",
    fileFallback: "file-store step outputBindings",
    browserStorage: null,
    mixedDetail:
      "Evaluation helpers are pure; storage of evidence follows Run/Job SoT (often mixed).",
    survivesRestart: false,
    productionReachable: true,
    notes: ["External success without durable evidence → false completed risk on recovery"],
  },
  {
    domain: "Memory",
    sot: "mixed",
    primaryPaths: [
      "lib/work-memory/store.ts",
      "lib/work-memory/durable.ts",
      "lib/personal-memory/store.ts",
      "lib/personal-memory/durable.ts",
      "lib/memory-apply/audit.ts",
    ],
    durableBackend:
      "atlasWorkMemory / atlasPersonalMemory / atlasMemoryApplyLog in atlas_user_state",
    processMemoryHotPath: "__atlasWorkMemory* / __atlasPersonalMemory*",
    fileFallback: null,
    browserStorage:
      "explicitly NON-SoT (user-profile/company-templates/etc. must not be Memory SoT)",
    mixedDetail:
      "Hot Map + void persistDurableDomain. localStorage listed as non-SoT in memory-apply audit.",
    survivesRestart: false,
    productionReachable: true,
    notes: ["docs/work-memory.md stale vs code durable domain"],
  },
  {
    domain: "Notification",
    sot: "mixed",
    primaryPaths: [
      "lib/notifications/store.ts",
      "lib/notifications/durable.ts",
      "lib/notifications/service.ts",
      "lib/notifications/dlq.ts",
    ],
    durableBackend:
      "atlasNotifications domain; atlas_notification_dlq; atlas_push_subscriptions",
    processMemoryHotPath: "__atlasNotificationStore / Preferences / Dlq",
    fileFallback: null,
    browserStorage: null,
    mixedDetail:
      "createNotification schedules durable persist + void deliver*WithAck (detached delivery).",
    survivesRestart: false,
    productionReachable: true,
    notes: ["Read-state race documented in web-push-investigation.md"],
  },
  {
    domain: "Metrics",
    sot: "mixed",
    primaryPaths: [
      "lib/reliability/metrics.ts",
      "lib/memory-apply/metrics.ts",
      "lib/owner/monitoring/store.ts",
      "lib/work-queue/store/file-store.ts",
    ],
    durableBackend:
      "atlas_reliability_events; monitoring durable domain (debounced); work-queue metrics columns/file",
    processMemoryHotPath: "__atlasMemoryApplyMetrics / monitoring global buckets",
    fileFallback: "file-store scheduleDelays/executionMs counters",
    browserStorage: null,
    mixedDetail: "Many counters are process-only; selected paths debounce to durable.",
    survivesRestart: false,
    productionReachable: true,
    notes: [],
  },
  {
    domain: "Idempotency",
    sot: "mixed",
    primaryPaths: [
      "lib/automation-platform/repository/memory-store.ts",
      "lib/work-queue/store/postgres-store.ts",
      "lib/work-queue/store/file-store.ts",
      "lib/jobs/job-store.ts",
      "lib/billing/stripe/webhook-idempotency.ts",
    ],
    durableBackend:
      "UNIQUE constraints on work queue / automation jobs; stripe webhook table; durable domains",
    processMemoryHotPath:
      "__atlasAutomationPlatformStore.idempotencyKeys / __atlasStripeProcessedWebhookEvents",
    fileFallback: "file-store idempotencyKey uniqueness",
    browserStorage: null,
    mixedDetail:
      "V2 run idempotency is process Map; Work Queue uses DB UNIQUE when Postgres active.",
    survivesRestart: false,
    productionReachable: true,
    notes: ["Multi-instance double enqueue when memory idempotency"],
  },
  {
    domain: "ExternalAction",
    sot: "mixed",
    primaryPaths: [
      "lib/automation-platform/execution/executor.ts",
      "lib/integrations/x/oauth-service.ts",
      "lib/work-queue/steps/execute-step.ts",
    ],
    durableBackend:
      "evidence fields / notification ACK / OAuth credential tables — only if persisted",
    processMemoryHotPath: "run step state in memory before durable persist",
    fileFallback: "offline notify receipt under .data/work-queue-artifacts",
    browserStorage: null,
    mixedDetail:
      "External API success can precede durable evidence write; token refresh uses void persist*.",
    survivesRestart: false,
    productionReachable: true,
    notes: ["Duplicate external side-effect risk on retry after crash"],
  },
  {
    domain: "Approval",
    sot: "mixed",
    primaryPaths: [
      "lib/automation-platform/service/automation-service.ts",
      "lib/automation-platform/state-machine/transitions.ts",
      "lib/jobs/completion-evidence.ts",
    ],
    durableBackend: "run status awaiting_approval in durable runs domain / job status",
    processMemoryHotPath: "V2 run status in memory Map",
    fileFallback: null,
    browserStorage: null,
    mixedDetail: "Approval gate follows Run SoT (mixed).",
    survivesRestart: false,
    productionReachable: true,
    notes: [],
  },
  {
    domain: "FirstExperience",
    sot: "mixed",
    primaryPaths: [
      "lib/first-experience/run.ts",
      "lib/user-profile/store.ts",
      "lib/onboarding/store.ts",
    ],
    durableBackend: "orchestrate/work request if completed; profile otherwise browser",
    processMemoryHotPath: null,
    fileFallback: null,
    browserStorage: "user-profile / onboarding localStorage",
    mixedDetail:
      "runFirstExperienceTask races orchestration vs timeout; profile prefs in localStorage.",
    survivesRestart: false,
    productionReachable: true,
    notes: ["Not a durable server SoT for completion"],
  },
  {
    domain: "OAuthConnection",
    sot: "mixed",
    primaryPaths: [
      "lib/integrations/google/credential-persistence.ts",
      "lib/integrations/x/credential-persistence.ts",
      "lib/integrations/wordpress/credential-persistence.ts",
      "lib/integrations/external-services/durable.ts",
      "lib/integrations/*/credential-store.ts",
    ],
    durableBackend:
      "dedicated OAuth tables (google/x/wordpress) + atlasExternalAuth domain",
    processMemoryHotPath: "__atlas*CredentialStore / __atlasExternalService*",
    fileFallback: null,
    browserStorage: null,
    mixedDetail: "Token refresh often void persist*ToSupabase — crash can drop refreshed token.",
    survivesRestart: false,
    productionReachable: true,
    notes: ["Dropbox appears generic external-auth path"],
  },
  {
    domain: "Lock",
    sot: "mixed",
    primaryPaths: [
      "lib/work-queue/store/file-store.ts",
      "lib/work-queue/store/postgres-store.ts",
      "lib/http/rate-limit.ts",
    ],
    durableBackend: "Postgres row lease / SKIP LOCKED",
    processMemoryHotPath: "file-store Promise mutex; __atlasHttpRateLimits Map",
    fileFallback: "in-process mutex only",
    browserStorage: null,
    mixedDetail: "File mutex does not cross instances.",
    survivesRestart: false,
    productionReachable: true,
    notes: [],
  },
  {
    domain: "Prediction",
    sot: "process_memory",
    primaryPaths: ["lib/memory-apply/metrics.ts", "lib/proactive-suggestions/persistence.ts"],
    durableBackend: null,
    processMemoryHotPath: "__atlasMemoryApplyMetrics channel coverage",
    fileFallback: null,
    browserStorage: "proactive-suggestions preferences localStorage",
    mixedDetail: null,
    survivesRestart: false,
    productionReachable: true,
    notes: ["Metrics process-only; suggestion prefs browser-only"],
  },
  {
    domain: "Monitoring",
    sot: "mixed",
    primaryPaths: [
      "lib/owner/monitoring/store.ts",
      "lib/owner/monitoring/durable.ts",
      "lib/owner/error-monitoring/store.ts",
    ],
    durableBackend: "monitoring durable domain (debounced setTimeout + void)",
    processMemoryHotPath: "owner monitoring globalThis store",
    fileFallback: null,
    browserStorage: null,
    mixedDetail: "Live telemetry memory; durable debounce may drop on crash.",
    survivesRestart: false,
    productionReachable: true,
    notes: [],
  },
  {
    domain: "ResultApi",
    sot: "mixed",
    primaryPaths: [
      "app/api/notifications/[id]/result/route.ts",
      "lib/notifications/result-resolution.ts",
      "lib/results/dev-preview.ts",
    ],
    durableBackend: "durable notifications + deliverables + projects",
    processMemoryHotPath: "hot notification/deliverable stores after hydrate",
    fileFallback: null,
    browserStorage: "dev-preview localStorage map (dev)",
    mixedDetail: "Prod path expects durable; cold start without hydrate → unavailable.",
    survivesRestart: false,
    productionReachable: true,
    notes: [],
  },
  {
    domain: "SavedMinutes",
    sot: "derived",
    primaryPaths: [
      "lib/automation-first/home-data.ts",
      "components/automation-first/automation-first-home.tsx",
    ],
    durableBackend: null,
    processMemoryHotPath: null,
    fileFallback: null,
    browserStorage: null,
    mixedDetail: null,
    survivesRestart: true,
    productionReachable: true,
    notes: [
      "savedMinutes is number|null derived UI value; currently null unless measured — no durable store found",
    ],
  },
  {
    domain: "DashboardAggregation",
    sot: "derived",
    primaryPaths: [
      "lib/dashboard/use-dashboard-home.ts",
      "components/home/today-dashboard.tsx",
      "lib/projects/use-projects.ts",
    ],
    durableBackend: "underlying projects/automations when Supabase configured",
    processMemoryHotPath: null,
    fileFallback: null,
    browserStorage: "projects localStorage cache/fallback possible",
    mixedDetail:
      "Aggregation is derived; projects backend may be localStorage in non-Supabase configs.",
    survivesRestart: false,
    productionReachable: true,
    notes: [],
  },
  {
    domain: "StorageMetadata",
    sot: "mixed",
    primaryPaths: [
      "lib/deliverables/durable-store.ts",
      "lib/attachments/supabase-store.ts",
      "lib/attachments/local-store.ts",
    ],
    durableBackend: "atlas_deliverable_files / atlas_image_attachments + Storage buckets",
    processMemoryHotPath: "__atlasLocalAttachments / __atlasDeliverableStore",
    fileFallback: "docs mention .data/attachments; local-store is memory Map",
    browserStorage: null,
    mixedDetail: "Prod requires Supabase; local/dev uses memory.",
    survivesRestart: false,
    productionReachable: true,
    notes: ["Local file attachments path doc-confirmed; code path is memory store"],
  },
] as const;

export function listMixedSotDomains(): DomainSotRecord[] {
  return DOMAIN_SOT_TABLE.filter((d) => d.sot === "mixed");
}

export function getDomainSot(domain: DomainSotRecord["domain"]): DomainSotRecord {
  const row = DOMAIN_SOT_TABLE.find((d) => d.domain === domain);
  if (!row) {
    throw new Error(`Unknown domain: ${domain}`);
  }
  return row;
}
