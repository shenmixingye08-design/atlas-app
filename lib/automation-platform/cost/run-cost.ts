/**
 * Per-run / per-step estimated cost metering for Automation V2.
 * Does not invent usage — records measured or conservatively estimated units.
 */

export type StepCostRecord = {
  stepId: string;
  capabilityId: string;
  aiCalls: number;
  estimatedTokens: number;
  visionUnits: number;
  conversions: number;
  storageBytes: number;
  externalApiCalls: number;
  estimatedUsd: number;
};

export type RunCostRecord = {
  runId: string;
  automationId: string;
  userId: string;
  steps: StepCostRecord[];
  totals: {
    aiCalls: number;
    estimatedTokens: number;
    visionUnits: number;
    conversions: number;
    storageBytes: number;
    externalApiCalls: number;
    estimatedUsd: number;
  };
  recordedAt: string;
};

type Bucket = RunCostRecord[];

function getBucket(): Bucket {
  const g = globalThis as typeof globalThis & {
    __atlasAutomationRunCosts?: Bucket;
  };
  if (!g.__atlasAutomationRunCosts) g.__atlasAutomationRunCosts = [];
  return g.__atlasAutomationRunCosts;
}

export function resetAutomationRunCostsForTests(): void {
  getBucket().length = 0;
}

const USD_PER: Record<string, number> = {
  ai_call: 0.002,
  token_1k: 0.01,
  vision: 0.01,
  conversion: 0.001,
  storage_mb: 0.0001,
  external: 0.0005,
};

export function estimateStepCost(input: {
  stepId: string;
  capabilityId: string;
  ok: boolean;
  retryExtra?: boolean;
}): StepCostRecord {
  const id = input.capabilityId;
  const isAi = /generate|orchestrate|ocr|vision|extract|deliverable/.test(id);
  const isVision = /vision|ocr/.test(id);
  const isConvert = /pdf|convert|file_convert/.test(id);
  const isExternal = /gmail|x_post|dropbox|wordpress|google_calendar|notify/.test(
    id,
  );
  const aiCalls = isAi ? 1 : 0;
  const estimatedTokens = isAi ? (input.retryExtra ? 1200 : 800) : 0;
  const visionUnits = isVision ? 1 : 0;
  const conversions = isConvert ? 1 : 0;
  const storageBytes = input.ok && (isAi || isConvert) ? 120_000 : 0;
  const externalApiCalls = isExternal && input.ok ? 1 : 0;
  const estimatedUsd =
    aiCalls * USD_PER.ai_call +
    (estimatedTokens / 1000) * USD_PER.token_1k +
    visionUnits * USD_PER.vision +
    conversions * USD_PER.conversion +
    (storageBytes / 1_000_000) * USD_PER.storage_mb +
    externalApiCalls * USD_PER.external;

  return {
    stepId: input.stepId,
    capabilityId: id,
    aiCalls,
    estimatedTokens,
    visionUnits,
    conversions,
    storageBytes,
    externalApiCalls,
    estimatedUsd: Number(estimatedUsd.toFixed(6)),
  };
}

export function recordAutomationRunCost(input: {
  runId: string;
  automationId: string;
  userId: string;
  steps: StepCostRecord[];
}): RunCostRecord {
  const totals = input.steps.reduce(
    (acc, step) => ({
      aiCalls: acc.aiCalls + step.aiCalls,
      estimatedTokens: acc.estimatedTokens + step.estimatedTokens,
      visionUnits: acc.visionUnits + step.visionUnits,
      conversions: acc.conversions + step.conversions,
      storageBytes: acc.storageBytes + step.storageBytes,
      externalApiCalls: acc.externalApiCalls + step.externalApiCalls,
      estimatedUsd: acc.estimatedUsd + step.estimatedUsd,
    }),
    {
      aiCalls: 0,
      estimatedTokens: 0,
      visionUnits: 0,
      conversions: 0,
      storageBytes: 0,
      externalApiCalls: 0,
      estimatedUsd: 0,
    },
  );
  totals.estimatedUsd = Number(totals.estimatedUsd.toFixed(6));
  const record: RunCostRecord = {
    runId: input.runId,
    automationId: input.automationId,
    userId: input.userId,
    steps: input.steps,
    totals,
    recordedAt: new Date().toISOString(),
  };
  getBucket().push(record);
  return record;
}

export function listAutomationRunCosts(): RunCostRecord[] {
  return [...getBucket()];
}

export function summarizeAutomationCosts(records: RunCostRecord[] = listAutomationRunCosts()) {
  if (records.length === 0) {
    return {
      runCount: 0,
      averageUsd: 0,
      p95Usd: 0,
      monthlyEstimateUsd: 0,
      perUserUsd: 0,
      plan980Risk: "insufficient_data" as const,
      topAutomations: [] as Array<{ automationId: string; usd: number }>,
    };
  }
  const sorted = [...records].sort(
    (a, b) => a.totals.estimatedUsd - b.totals.estimatedUsd,
  );
  const sum = records.reduce((s, r) => s + r.totals.estimatedUsd, 0);
  const averageUsd = sum / records.length;
  const p95Usd = sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95))]!
    .totals.estimatedUsd;
  const monthlyEstimateUsd = averageUsd * 30 * Math.max(1, records.length / 30);
  const users = new Set(records.map((r) => r.userId)).size || 1;
  const perUserUsd = monthlyEstimateUsd / users;
  // ¥980 ≈ $6.5 rough; margin risk if automation cost alone exceeds ~40% of plan.
  const plan980Risk =
    perUserUsd > 2.6 ? ("high" as const) : perUserUsd > 1.3 ? ("medium" as const) : ("low" as const);

  const byAuto = new Map<string, number>();
  for (const record of records) {
    byAuto.set(
      record.automationId,
      (byAuto.get(record.automationId) ?? 0) + record.totals.estimatedUsd,
    );
  }
  const topAutomations = [...byAuto.entries()]
    .map(([automationId, usd]) => ({ automationId, usd: Number(usd.toFixed(6)) }))
    .sort((a, b) => b.usd - a.usd)
    .slice(0, 5);

  return {
    runCount: records.length,
    averageUsd: Number(averageUsd.toFixed(6)),
    p95Usd: Number(p95Usd.toFixed(6)),
    monthlyEstimateUsd: Number(monthlyEstimateUsd.toFixed(6)),
    perUserUsd: Number(perUserUsd.toFixed(6)),
    plan980Risk,
    topAutomations,
  };
}
