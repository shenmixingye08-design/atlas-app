import type {
  BenchmarkCase,
  BenchmarkRecord,
  BenchmarkRun,
  OwnerEvaluation,
  QualityThreshold,
  UserEvaluation,
} from "@/lib/quality-engine/benchmark/types";
import { STANDARD_BENCHMARK_CASES } from "@/lib/quality-engine/benchmark/standard-cases";

type MemoryScope = typeof globalThis & {
  __atlasBenchmarkRecords?: BenchmarkRecord[];
  __atlasBenchmarkRuns?: BenchmarkRun[];
  __atlasBenchmarkCases?: BenchmarkCase[];
  __atlasBenchmarkFeedback?: Array<{
    id: string;
    artifactId: string;
    resultId: string | null;
    userId: string;
    role: "user" | "owner";
    payload: OwnerEvaluation | UserEvaluation;
    createdAt: string;
  }>;
  __atlasQualityThresholds?: QualityThreshold[];
  __atlasBenchmarkActiveRunId?: string | null;
};

function scope(): MemoryScope {
  return globalThis as MemoryScope;
}

function records(): BenchmarkRecord[] {
  const s = scope();
  if (!s.__atlasBenchmarkRecords) s.__atlasBenchmarkRecords = [];
  return s.__atlasBenchmarkRecords;
}

function runs(): BenchmarkRun[] {
  const s = scope();
  if (!s.__atlasBenchmarkRuns) s.__atlasBenchmarkRuns = [];
  return s.__atlasBenchmarkRuns;
}

function cases(): BenchmarkCase[] {
  const s = scope();
  if (!s.__atlasBenchmarkCases) {
    s.__atlasBenchmarkCases = STANDARD_BENCHMARK_CASES.map((c) => ({ ...c }));
  }
  return s.__atlasBenchmarkCases;
}

function feedbackBucket() {
  const s = scope();
  if (!s.__atlasBenchmarkFeedback) s.__atlasBenchmarkFeedback = [];
  return s.__atlasBenchmarkFeedback;
}

export function resetBenchmarkStoreForTests(): void {
  const s = scope();
  s.__atlasBenchmarkRecords = [];
  s.__atlasBenchmarkRuns = [];
  s.__atlasBenchmarkCases = STANDARD_BENCHMARK_CASES.map((c) => ({ ...c }));
  s.__atlasBenchmarkFeedback = [];
  s.__atlasQualityThresholds = [];
  s.__atlasBenchmarkActiveRunId = null;
}

export function upsertBenchmarkRecord(record: BenchmarkRecord): void {
  const list = records();
  const idx = list.findIndex((r) => r.id === record.id);
  if (idx >= 0) list[idx] = record;
  else list.unshift(record);
  if (list.length > 2_000) list.length = 2_000;
  void persistRecordToDb(record);
}

export function listBenchmarkRecords(limit = 200): BenchmarkRecord[] {
  return records().slice(0, Math.max(1, Math.min(limit, 2_000)));
}

export function getBenchmarkRecord(id: string): BenchmarkRecord | null {
  return records().find((r) => r.id === id) ?? null;
}

export function updateBenchmarkRecord(
  id: string,
  patch: Partial<BenchmarkRecord>,
): BenchmarkRecord | null {
  const current = getBenchmarkRecord(id);
  if (!current) return null;
  const next = { ...current, ...patch, id: current.id };
  upsertBenchmarkRecord(next);
  return next;
}

export function listBenchmarkCases(enabledOnly = false): BenchmarkCase[] {
  const all = cases();
  return enabledOnly ? all.filter((c) => c.enabled) : [...all];
}

export function getBenchmarkCase(id: string): BenchmarkCase | null {
  return cases().find((c) => c.id === id) ?? null;
}

export function upsertBenchmarkCase(item: BenchmarkCase): void {
  const list = cases();
  const idx = list.findIndex((c) => c.id === item.id);
  if (idx >= 0) list[idx] = item;
  else list.push(item);
}

export function saveBenchmarkRun(run: BenchmarkRun): void {
  const list = runs();
  const idx = list.findIndex((r) => r.id === run.id);
  if (idx >= 0) list[idx] = run;
  else list.unshift(run);
  void persistRunToDb(run);
}

export function listBenchmarkRuns(limit = 50): BenchmarkRun[] {
  return runs().slice(0, limit);
}

export function getBenchmarkRun(id: string): BenchmarkRun | null {
  return runs().find((r) => r.id === id) ?? null;
}

export function findBenchmarkRunByIdempotency(
  key: string,
): BenchmarkRun | null {
  return runs().find((r) => r.idempotencyKey === key) ?? null;
}

export function getActiveBenchmarkRunId(): string | null {
  return scope().__atlasBenchmarkActiveRunId ?? null;
}

export function setActiveBenchmarkRunId(id: string | null): void {
  scope().__atlasBenchmarkActiveRunId = id;
}

export function saveFeedback(input: {
  artifactId: string;
  resultId?: string | null;
  userId: string;
  role: "user" | "owner";
  payload: OwnerEvaluation | UserEvaluation;
}): string {
  const id = crypto.randomUUID();
  feedbackBucket().unshift({
    id,
    artifactId: input.artifactId,
    resultId: input.resultId ?? null,
    userId: input.userId,
    role: input.role,
    payload: input.payload,
    createdAt: new Date().toISOString(),
  });
  return id;
}

export function listFeedbackForUser(userId: string) {
  return feedbackBucket().filter((f) => f.userId === userId);
}

export function listAllFeedbackForOwner() {
  return [...feedbackBucket()];
}

async function persistRecordToDb(record: BenchmarkRecord): Promise<void> {
  try {
    const { createServiceRoleClientIfConfigured } = await import(
      "@/lib/supabase/service-role"
    );
    const client = createServiceRoleClientIfConfigured();
    if (!client) return;
    await client.from("atlas_benchmark_results").upsert({
      id: record.id,
      run_id: record.runId,
      case_id: record.caseId,
      artifact_id: record.artifactId,
      job_id: record.jobId,
      user_id: record.userId,
      organization_id: record.organizationId,
      artifact_type: record.artifactType,
      artifact_sub_type: record.artifactSubType,
      title: record.title,
      model: record.model,
      status: record.status,
      pattern_label: record.patternLabel,
      feature_flags: record.featureFlags,
      versions: record.versions,
      quality: record.quality,
      processing: record.processing,
      context_info: record.contextInfo,
      cost_info: record.costInfo,
      usage_info: record.usageInfo,
      rule_evaluation: record.ruleEvaluation,
      owner_evaluation: record.ownerEvaluation,
      user_evaluation: record.userEvaluation,
      created_at: record.createdAt,
      completed_at: record.completedAt,
      updated_at: new Date().toISOString(),
    } as never);
  } catch {
    // Memory remains source of truth when DB unavailable.
  }
}

async function persistRunToDb(run: BenchmarkRun): Promise<void> {
  try {
    const { createServiceRoleClientIfConfigured } = await import(
      "@/lib/supabase/service-role"
    );
    const client = createServiceRoleClientIfConfigured();
    if (!client) return;
    await client.from("atlas_benchmark_runs").upsert({
      id: run.id,
      created_by: run.createdBy,
      status: run.status,
      config: run.config,
      tags: run.tags,
      memo: run.memo,
      estimated_max_cost_usd: run.estimatedMaxCostUsd,
      actual_cost_usd: run.actualCostUsd,
      case_count: run.caseCount,
      pattern_count: run.patternCount,
      result_count: run.resultCount,
      idempotency_key: run.idempotencyKey,
      started_at: run.startedAt,
      completed_at: run.completedAt,
      cancelled_at: run.cancelledAt,
      error_message: run.errorMessage,
      created_at: run.createdAt,
      updated_at: run.updatedAt,
    } as never);
  } catch {
    // ignore
  }
}
