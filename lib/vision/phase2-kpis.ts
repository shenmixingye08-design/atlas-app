/**
 * Phase2 image→Word KPI counters (in-process, 24h window).
 * No PII — rates and durations only.
 */

export type Phase2KpiKey =
  | "attempts"
  | "success"
  | "failure"
  | "retry"
  | "regenerate"
  | "seed_repair"
  | "duration_ms"
  | "ocr_structure_hit"
  | "ocr_structure_miss";

type Sample = { at: number; value: number };

type Bucket = {
  counters: Map<Phase2KpiKey, Sample[]>;
  failures: Array<{ at: number; reason: string; cause?: string }>;
};

const WINDOW_MS = 1000 * 60 * 60 * 24;

function getBucket(): Bucket {
  const scope = globalThis as typeof globalThis & {
    __minervotPhase2Kpis?: Bucket;
  };
  if (!scope.__minervotPhase2Kpis) {
    scope.__minervotPhase2Kpis = {
      counters: new Map(),
      failures: [],
    };
  }
  return scope.__minervotPhase2Kpis;
}

function prune(samples: Sample[]): Sample[] {
  const cutoff = Date.now() - WINDOW_MS;
  return samples.filter((s) => s.at >= cutoff);
}

export function resetPhase2KpisForTests(): void {
  const bucket = getBucket();
  bucket.counters.clear();
  bucket.failures = [];
}

export function recordPhase2Kpi(key: Phase2KpiKey, value = 1): void {
  const bucket = getBucket();
  const list = prune(bucket.counters.get(key) ?? []);
  list.push({ at: Date.now(), value });
  bucket.counters.set(key, list);
}

export function recordPhase2Failure(reason: string, cause?: string): void {
  const bucket = getBucket();
  const cutoff = Date.now() - WINDOW_MS;
  bucket.failures = bucket.failures
    .filter((f) => f.at >= cutoff)
    .concat([{ at: Date.now(), reason, cause }]);
  recordPhase2Kpi("failure");
}

function sum(key: Phase2KpiKey): number {
  return prune(getBucket().counters.get(key) ?? []).reduce(
    (acc, sample) => acc + sample.value,
    0,
  );
}

function avg(key: Phase2KpiKey): number {
  const samples = prune(getBucket().counters.get(key) ?? []);
  if (samples.length === 0) return 0;
  return sum(key) / samples.length;
}

export function getPhase2KpiSnapshot(): {
  attempts: number;
  success: number;
  failure: number;
  successRate: number;
  retryRate: number;
  regenerateRate: number;
  avgDurationMs: number;
  structureHitRate: number;
  errorRate: number;
  recentFailures: Array<{ reason: string; cause?: string }>;
} {
  const attempts = sum("attempts");
  const success = sum("success");
  const failure = sum("failure");
  const retry = sum("retry");
  const regenerate = sum("regenerate");
  const structureHit = sum("ocr_structure_hit");
  const structureMiss = sum("ocr_structure_miss");
  const structureTotal = structureHit + structureMiss;
  return {
    attempts,
    success,
    failure,
    successRate: attempts > 0 ? success / attempts : 0,
    retryRate: attempts > 0 ? retry / attempts : 0,
    regenerateRate: attempts > 0 ? regenerate / attempts : 0,
    avgDurationMs: avg("duration_ms"),
    structureHitRate: structureTotal > 0 ? structureHit / structureTotal : 0,
    errorRate: attempts > 0 ? failure / attempts : 0,
    recentFailures: getBucket().failures.slice(-20).map(({ reason, cause }) => ({
      reason,
      cause,
    })),
  };
}
