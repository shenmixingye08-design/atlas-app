/**
 * PowerPoint AI cost estimate using existing cost-meter + model catalog + plan registry.
 * Generator itself does not call LLM; this models the orchestration path that feeds it.
 */

import { createWorkflowCostMeter, estimateTokens } from "@/lib/ai/cost-meter";
import {
  estimateTokenCostUsd,
  resolveCatalogEntryForModel,
} from "@/lib/ai/model-catalog";
import {
  resolvePlannerPolicy,
  resolveWorkerPolicy,
} from "@/lib/ai/policy-engine";
import { getCompactInstructions } from "@/lib/ai/compact-instructions";
import { getPlanDefinition, listPlanDefinitions } from "@/lib/billing/plans/registry";
import type { PlanId } from "@/lib/billing/plans/types";

export type PptxCostFixtureKind = "light" | "standard" | "heavy";

export type PptxCostEstimate = {
  kind: PptxCostFixtureKind;
  slideTarget: number;
  modelPlanner: string;
  modelWorker: string;
  aiCalls: number;
  inputTokens: number;
  outputTokens: number;
  cachedTokens: number;
  visionCalls: number;
  imageGenerationCalls: number;
  retries: number;
  estimatedUsd: number;
  /** Catalog cost if each call emitted policy maxOutputTokens (same measured input). */
  outputCeilingUsd: number;
  estimatedJpy: number | null;
  jpyRate: number | null;
  jpySource: "ATLAS_USD_JPY_RATE" | "FX_RATE_REQUIRED";
  quotaRuns: number;
  priceSource: string;
};

function usdToJpy(usd: number): { jpy: number | null; rate: number | null } {
  const rate = Number(process.env.ATLAS_USD_JPY_RATE ?? "");
  if (!Number.isFinite(rate) || rate <= 0) return { jpy: null, rate: null };
  return { jpy: Math.round(usd * rate), rate };
}

/**
 * Estimate orchestration cost for a presentation job.
 * Calls: planner_unified + worker_deliverable (presentation is a heavy type).
 * No per-slide LLM. No image generation (native shapes/charts).
 */
export function estimatePresentationPipelineCost(input: {
  kind: PptxCostFixtureKind;
  assignment: string;
  markdown: string;
}): PptxCostEstimate {
  const planner = resolvePlannerPolicy({
    assignment: input.assignment,
    deliverableType: "presentation",
  });
  const worker = resolveWorkerPolicy({
    deliverableType: "presentation",
  });
  const meter = createWorkflowCostMeter();
  const plannerInstructions = getCompactInstructions("planner_unified");
  const workerInstructions = getCompactInstructions(worker.taskType);

  const plannerOutput = JSON.stringify({
    plan: "presentation",
    slides: input.kind === "light" ? 5 : input.kind === "standard" ? 10 : 20,
    sections: ["課題", "提案", "根拠"],
  });

  meter.recordLlmCall({
    department: "planning",
    taskType: "planner_unified",
    inputText: input.assignment,
    outputText: plannerOutput,
    instructions: plannerInstructions,
  });
  meter.recordLlmCall({
    department: "production",
    taskType: worker.taskType,
    inputText: `${input.assignment}\n${plannerOutput}`,
    outputText: input.markdown,
    instructions: workerInstructions,
  });

  const summary = meter.getSummary();
  const fx = usdToJpy(summary.estimatedCostUsd);
  const workerEntry = resolveCatalogEntryForModel(worker.model);
  const plannerEntry = resolveCatalogEntryForModel(planner.model);
  const plannerCall = summary.calls.find((c) => c.taskType === "planner_unified");
  const workerCall = summary.calls.find((c) => c.taskType === worker.taskType);
  const outputCeilingUsd =
    estimateTokenCostUsd({
      model: planner.model,
      inputTokens: plannerCall?.estimatedInputTokens ?? 0,
      outputTokens: planner.maxOutputTokens,
    }) +
    estimateTokenCostUsd({
      model: worker.model,
      inputTokens: workerCall?.estimatedInputTokens ?? 0,
      outputTokens: worker.maxOutputTokens,
    });

  return {
    kind: input.kind,
    slideTarget: input.kind === "light" ? 5 : input.kind === "standard" ? 10 : 20,
    modelPlanner: planner.model,
    modelWorker: worker.model,
    aiCalls: summary.llmCallCount,
    inputTokens: summary.estimatedInputTokens,
    outputTokens: summary.estimatedOutputTokens,
    cachedTokens: summary.calls
      .filter((c) => c.cached)
      .reduce((s, c) => s + c.estimatedInputTokens, 0),
    visionCalls: 0,
    imageGenerationCalls: 0,
    retries: 0,
    quotaRuns: 1,
    estimatedUsd: summary.estimatedCostUsd,
    outputCeilingUsd,
    estimatedJpy: fx.jpy,
    jpyRate: fx.rate,
    jpySource: fx.rate ? "ATLAS_USD_JPY_RATE" : "FX_RATE_REQUIRED",
    priceSource: `MODEL_CATALOG planner ${plannerEntry.model} in ${plannerEntry.inputPricePerMillion}/M out ${plannerEntry.outputPricePerMillion}/M; worker ${workerEntry.model} in ${workerEntry.inputPricePerMillion}/M out ${workerEntry.outputPricePerMillion}/M`,
  };
}

export function presentationTokenEstimate(markdown: string): number {
  return estimateTokens(markdown);
}

export type PlanPptSafety = {
  planId: PlanId;
  monthlyPriceJpy: number;
  aiUsageMonthly: number;
  aiCostBudgetUsdMonthly: number;
  maxByCount: number;
  maxByCost: number | null;
  effectiveMax: number | null;
};

export function evaluatePptPlanSafety(costUsdPerDeck: number): PlanPptSafety[] {
  return listPlanDefinitions()
    .filter((p) => p.planId !== "free")
    .map((plan) => {
      const maxByCount = plan.limits.aiUsageMonthly;
      const maxByCost =
        costUsdPerDeck > 0
          ? Math.floor(plan.limits.aiCostBudgetUsdMonthly / costUsdPerDeck)
          : null;
      const effectiveMax =
        maxByCost == null ? maxByCount : Math.min(maxByCount, maxByCost);
      return {
        planId: plan.planId,
        monthlyPriceJpy: plan.monthlyPriceJpy,
        aiUsageMonthly: plan.limits.aiUsageMonthly,
        aiCostBudgetUsdMonthly: plan.limits.aiCostBudgetUsdMonthly,
        maxByCount,
        maxByCost,
        effectiveMax,
      };
    });
}

export function pptCostShareOfPlan(input: {
  planId: PlanId;
  decks: number;
  costUsd: number;
  jpyRate: number | null;
}): { costJpy: number | null; sharePct: number | null } {
  const plan = getPlanDefinition(input.planId);
  if (input.jpyRate == null || input.jpyRate <= 0) {
    return { costJpy: null, sharePct: null };
  }
  const costJpy = Math.round(input.costUsd * input.decks * input.jpyRate);
  const sharePct =
    plan.monthlyPriceJpy > 0 ? (costJpy / plan.monthlyPriceJpy) * 100 : null;
  return { costJpy, sharePct };
}
