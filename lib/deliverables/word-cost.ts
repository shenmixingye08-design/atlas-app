/**
 * Word generation cost estimation — model rates are externalized.
 * Unknown rates → cost unknown (never invent prices).
 */

export type WordModelRate = {
  model: string;
  inputPer1M: number | null;
  outputPer1M: number | null;
  currency: "USD" | "JPY";
};

export type WordCostBreakdown = {
  model: string | null;
  inputTokens: number | null;
  outputTokens: number | null;
  aiCost: number | null;
  currency: "USD" | "JPY" | null;
  storageBytes: number;
  downloadBytes: number;
  retryCount: number;
  regenerateCount: number;
  durationMs: number;
  costKnown: boolean;
};

type CostEvent = WordCostBreakdown & {
  at: number;
  userIdHash: string;
  templateId?: string | null;
  purpose?: string | null;
  success: boolean;
};

function getEvents(): CostEvent[] {
  const scope = globalThis as typeof globalThis & {
    __atlasWordCostEvents?: CostEvent[];
  };
  if (!scope.__atlasWordCostEvents) scope.__atlasWordCostEvents = [];
  return scope.__atlasWordCostEvents;
}

export function resetWordCostForTests(): void {
  const scope = globalThis as typeof globalThis & {
    __atlasWordCostEvents?: CostEvent[];
  };
  scope.__atlasWordCostEvents = [];
}

function parseRates(): WordModelRate[] {
  const raw = process.env.ATLAS_WORD_MODEL_RATES?.trim();
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as WordModelRate[];
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item) => typeof item?.model === "string");
  } catch {
    return [];
  }
}

export function estimateAiCost(input: {
  model?: string | null;
  inputTokens?: number | null;
  outputTokens?: number | null;
}): { cost: number | null; currency: "USD" | "JPY" | null; costKnown: boolean } {
  const rates = parseRates();
  const model = input.model?.trim();
  if (!model || input.inputTokens == null || input.outputTokens == null) {
    return { cost: null, currency: null, costKnown: false };
  }
  const rate = rates.find((item) => item.model === model);
  if (!rate || rate.inputPer1M == null || rate.outputPer1M == null) {
    return { cost: null, currency: null, costKnown: false };
  }
  const cost =
    (input.inputTokens / 1_000_000) * rate.inputPer1M +
    (input.outputTokens / 1_000_000) * rate.outputPer1M;
  return { cost, currency: rate.currency, costKnown: true };
}

function hashUserId(userId: string): string {
  let hash = 0;
  for (let i = 0; i < userId.length; i += 1) {
    hash = (hash * 31 + userId.charCodeAt(i)) >>> 0;
  }
  return `u_${hash.toString(16)}`;
}

export function recordWordCostEvent(input: {
  userId: string;
  breakdown: WordCostBreakdown;
  templateId?: string | null;
  purpose?: string | null;
  success: boolean;
}): void {
  const events = getEvents();
  events.push({
    ...input.breakdown,
    at: Date.now(),
    userIdHash: hashUserId(input.userId),
    templateId: input.templateId ?? null,
    purpose: input.purpose ?? null,
    success: input.success,
  });
  // Keep 24h
  const cutoff = Date.now() - 1000 * 60 * 60 * 24;
  while (events.length > 0 && events[0]!.at < cutoff) events.shift();
}

export function getWordCostSnapshot(): {
  generations: number;
  totalEstimatedCost: number | null;
  averageCost: number | null;
  failedCost: number | null;
  retryCost: number | null;
  currency: "USD" | "JPY" | null;
  storageBytes: number;
  costKnown: boolean;
} {
  const events = getEvents().filter((e) => e.at >= Date.now() - 1000 * 60 * 60 * 24);
  const known = events.filter((e) => e.costKnown && e.aiCost != null);
  const currency = known[0]?.currency ?? null;
  const total = known.reduce((sum, e) => sum + (e.aiCost ?? 0), 0);
  const failed = known
    .filter((e) => !e.success)
    .reduce((sum, e) => sum + (e.aiCost ?? 0), 0);
  const retry = known
    .filter((e) => e.retryCount > 0)
    .reduce((sum, e) => sum + (e.aiCost ?? 0), 0);
  const storageBytes = events.reduce((sum, e) => sum + e.storageBytes, 0);
  return {
    generations: events.length,
    totalEstimatedCost: known.length > 0 ? total : null,
    averageCost: known.length > 0 ? total / known.length : null,
    failedCost: known.length > 0 ? failed : null,
    retryCost: known.length > 0 ? retry : null,
    currency,
    storageBytes,
    costKnown: known.length > 0,
  };
}
