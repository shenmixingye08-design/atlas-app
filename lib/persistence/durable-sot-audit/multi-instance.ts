import type { MultiInstanceScenario } from "./types";

export const MULTI_INSTANCE_SCENARIOS: readonly MultiInstanceScenario[] = [
  {
    id: "MI-2-WORKERS",
    title: "2 Worker同時",
    codePaths: [
      "lib/work-queue/worker.ts",
      "lib/work-queue/store/postgres-store.ts",
      "lib/work-queue/store/file-store.ts",
    ],
    processMemoryShared: false,
    fileShared: false,
    dbShared: true,
    raceResult:
      "Postgres: lease/SKIP LOCKED should serialize. File store: per-process mutex + shared JSON races → duplicate lease/lost updates. Process memory irrelevant for queue when using PG.",
    requiredFix: "Production-only Postgres store; ban file fallback on multi-instance.",
  },
  {
    id: "MI-2-SCHEDULER-TICKS",
    title: "2 Scheduler tick同時",
    codePaths: [
      "app/api/automations/tick/route.ts",
      "lib/automation-platform/schedule/due-tick.ts",
      "lib/automations/global-durable.ts",
    ],
    processMemoryShared: false,
    fileShared: false,
    dbShared: true,
    raceResult:
      "Each instance has its own automation Map. Without durable occurrence unique, both may enqueue same occurrence. Global durable claims help only if awaited/shared.",
    requiredFix: "DB unique(occurrence_key) + claim row before enqueue; remove memory-only due lists.",
  },
  {
    id: "MI-JOB-LEASE",
    title: "同一Job lease競合",
    codePaths: [
      "lib/work-queue/store/postgres-store.ts",
      "lib/work-queue/store/file-store.ts",
    ],
    processMemoryShared: false,
    fileShared: false,
    dbShared: true,
    raceResult:
      "PG lease columns mediate. File store cannot safely coordinate across instances — both may believe they own the lease.",
    requiredFix: "Fail-fast if Work Queue not Postgres in production.",
  },
  {
    id: "MI-OCCURRENCE",
    title: "同一Occurrence作成",
    codePaths: [
      "lib/automation-platform/repository/memory-store.ts:112-118",
      "lib/work-queue/occurrence.ts",
      "supabase/migrations/20260802_atlas_work_queue.sql",
    ],
    processMemoryShared: false,
    fileShared: false,
    dbShared: true,
    raceResult:
      "V2 memory occurrenceKeys Map is per-instance → duplicate runs. Work Queue PG unique on occurrence_key blocks duplicates when used.",
    requiredFix: "Move V2 occurrence index to DB unique constraint (Phase 1-2+).",
  },
  {
    id: "MI-EXTERNAL-ACTION",
    title: "同一External Action実行",
    codePaths: [
      "lib/automation-platform/execution/executor.ts",
      "lib/work-queue/steps/execute-step.ts",
      "lib/integrations/x/post/*",
    ],
    processMemoryShared: false,
    fileShared: false,
    dbShared: false,
    raceResult:
      "Idempotency in process Map / missing provider idempotency → duplicate posts/sends across instances or retries.",
    requiredFix: "Durable idempotency key + provider dedupe before external call.",
  },
  {
    id: "MI-NOTIFICATION",
    title: "同一Notification送信",
    codePaths: [
      "lib/notifications/service.ts",
      "lib/notifications/store.ts",
      "lib/notifications/dlq.ts",
    ],
    processMemoryShared: false,
    fileShared: false,
    dbShared: true,
    raceResult:
      "In-app store is process memory until durable hydrate; two instances may create duplicate notifications / double push if delivery detached twice.",
    requiredFix: "Durable notification id/outbox with unique constraint; await delivery state.",
  },
  {
    id: "MI-ARTIFACT",
    title: "同一Artifact生成",
    codePaths: [
      "lib/deliverables/store.ts",
      "lib/deliverables/durable-store.ts",
      "lib/deliverables/object-storage.ts",
    ],
    processMemoryShared: false,
    fileShared: false,
    dbShared: true,
    raceResult:
      "Memory store not shared; parallel generates create distinct ids. Storage upload has some already-exists handling, but job may attach wrong/missing artifact.",
    requiredFix: "Content-addressed or job-scoped unique artifact keys in DB before generate.",
  },
] as const;
