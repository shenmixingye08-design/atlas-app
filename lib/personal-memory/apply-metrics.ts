/**
 * Apply-path metrics: match / diff / correction rates + learning speed.
 */

export type ArtifactKind =
  | "word"
  | "excel"
  | "pdf"
  | "ppt"
  | "ocr"
  | "image"
  | "automation"
  | "email"
  | "x_post"
  | "blog"
  | "sales"
  | "household"
  | "other";

export type MemoryApplyEvent = {
  id: string;
  at: string;
  userId: string;
  artifactKind: ArtifactKind;
  memoriesApplied: number;
  memoriesAvailable: number;
  matchRate: number;
  diffRate: number;
  correctionRate: number;
  memoryScore: number;
  instructionChars: number;
  effectiveCharsSavedEstimate: number;
  stabilizedAfterRuns: number | null;
};

type MetricsState = {
  events: MemoryApplyEvent[];
  useCounts: Record<string, number>;
  successCounts: Record<string, number>;
  correctionCounts: Record<string, number>;
};

const MAX = 2_000;

function getState(): MetricsState {
  const scope = globalThis as typeof globalThis & {
    __atlasMemoryApplyMetrics?: MetricsState;
  };
  if (!scope.__atlasMemoryApplyMetrics) {
    scope.__atlasMemoryApplyMetrics = {
      events: [],
      useCounts: {},
      successCounts: {},
      correctionCounts: {},
    };
  }
  return scope.__atlasMemoryApplyMetrics;
}

export function resetMemoryApplyMetricsForTests(): void {
  const scope = globalThis as typeof globalThis & {
    __atlasMemoryApplyMetrics?: MetricsState;
  };
  scope.__atlasMemoryApplyMetrics = undefined;
}

export function recordMemoryApply(input: {
  userId: string;
  artifactKind: ArtifactKind;
  memoriesApplied: number;
  memoriesAvailable: number;
  /** 0–1 how much of output preferences matched memory */
  matchRate: number;
  /** 0–1 estimated user edit need after apply */
  diffRate: number;
  correctionRate?: number;
  instructionChars?: number;
  memoryIds?: string[];
  success?: boolean;
}): MemoryApplyEvent {
  const state = getState();
  const applied = Math.max(0, input.memoriesApplied);
  const available = Math.max(applied, input.memoriesAvailable);
  const applyRate = available === 0 ? 0 : applied / available;
  const memoryScore = Math.round(
    (input.matchRate * 0.6 + applyRate * 0.4) * 100,
  );
  const instructionChars = input.instructionChars ?? 0;
  const effectiveCharsSavedEstimate = Math.round(
    instructionChars * Math.min(0.95, Math.max(0, 1 - input.diffRate)),
  );

  for (const id of input.memoryIds ?? []) {
    state.useCounts[id] = (state.useCounts[id] ?? 0) + 1;
    if (input.success !== false) {
      state.successCounts[id] = (state.successCounts[id] ?? 0) + 1;
    }
    if ((input.correctionRate ?? 0) > 0.3) {
      state.correctionCounts[id] = (state.correctionCounts[id] ?? 0) + 1;
    }
  }

  const event: MemoryApplyEvent = {
    id: crypto.randomUUID(),
    at: new Date().toISOString(),
    userId: input.userId,
    artifactKind: input.artifactKind,
    memoriesApplied: applied,
    memoriesAvailable: available,
    matchRate: input.matchRate,
    diffRate: input.diffRate,
    correctionRate: input.correctionRate ?? 0,
    memoryScore,
    instructionChars,
    effectiveCharsSavedEstimate,
    stabilizedAfterRuns: null,
  };
  state.events.unshift(event);
  if (state.events.length > MAX) state.events.length = MAX;
  return event;
}

export function getMemoryUseStats(memoryId: string): {
  used: number;
  successRate: number | null;
  correctionRate: number | null;
} {
  const state = getState();
  const used = state.useCounts[memoryId] ?? 0;
  const success = state.successCounts[memoryId] ?? 0;
  const corrections = state.correctionCounts[memoryId] ?? 0;
  return {
    used,
    successRate: used === 0 ? null : success / used,
    correctionRate: used === 0 ? null : corrections / used,
  };
}

export type MemoryDashboardSnapshot = {
  at: string;
  totalEvents: number;
  avgMemoryScore: number | null;
  avgMatchRate: number | null;
  avgDiffRate: number | null;
  avgCorrectionRate: number | null;
  estimatedInstructionReduction: number | null;
  byArtifact: Record<
    string,
    { count: number; matchRate: number; diffRate: number; score: number }
  >;
  learningSpeed: Array<{ artifactKind: string; runsToStable: number | null }>;
  recent: MemoryApplyEvent[];
};

export function getMemoryDashboardSnapshot(input?: {
  userId?: string;
  limit?: number;
}): MemoryDashboardSnapshot {
  const state = getState();
  const events = state.events.filter((event) =>
    input?.userId ? event.userId === input.userId : true,
  );
  const avg = (pick: (e: MemoryApplyEvent) => number) =>
    events.length === 0
      ? null
      : events.reduce((sum, e) => sum + pick(e), 0) / events.length;

  const byArtifact: MemoryDashboardSnapshot["byArtifact"] = {};
  for (const event of events) {
    const bucket = byArtifact[event.artifactKind] ?? {
      count: 0,
      matchRate: 0,
      diffRate: 0,
      score: 0,
    };
    bucket.count += 1;
    bucket.matchRate += event.matchRate;
    bucket.diffRate += event.diffRate;
    bucket.score += event.memoryScore;
    byArtifact[event.artifactKind] = bucket;
  }
  for (const key of Object.keys(byArtifact)) {
    const bucket = byArtifact[key]!;
    bucket.matchRate /= bucket.count;
    bucket.diffRate /= bucket.count;
    bucket.score = Math.round(bucket.score / bucket.count);
  }

  const learningSpeed = Object.keys(byArtifact).map((artifactKind) => {
    const series = events
      .filter((e) => e.artifactKind === artifactKind)
      .slice()
      .reverse();
    let runsToStable: number | null = null;
    for (let i = 0; i < series.length; i += 1) {
      if (series[i]!.diffRate <= 0.3 && series[i]!.matchRate >= 0.7) {
        runsToStable = i + 1;
        break;
      }
    }
    return { artifactKind, runsToStable };
  });

  const avgDiff = avg((e) => e.diffRate);
  return {
    at: new Date().toISOString(),
    totalEvents: events.length,
    avgMemoryScore: avg((e) => e.memoryScore),
    avgMatchRate: avg((e) => e.matchRate),
    avgDiffRate: avgDiff,
    avgCorrectionRate: avg((e) => e.correctionRate),
    estimatedInstructionReduction:
      avgDiff == null ? null : Math.max(0, Math.min(0.95, 1 - avgDiff)),
    byArtifact,
    learningSpeed,
    recent: events.slice(0, input?.limit ?? 30),
  };
}
