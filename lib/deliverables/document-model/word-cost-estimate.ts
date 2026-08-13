/**
 * Word AI cost estimate using existing cost-meter + model catalog + plan registry.
 * Generator itself does not call LLM; this models the orchestration path that feeds it.
 */

import { getCompactInstructions } from "@/lib/ai/compact-instructions";
import { createWorkflowCostMeter } from "@/lib/ai/cost-meter";
import {
  estimateTokenCostUsd,
  resolveCatalogEntryForModel,
} from "@/lib/ai/model-catalog";
import {
  resolvePlannerPolicy,
  resolveWorkerPolicy,
} from "@/lib/ai/policy-engine";
import { getPlanDefinition, listPlanDefinitions } from "@/lib/billing/plans/registry";
import type { PlanId } from "@/lib/billing/plans/types";

export type WordCostFixtureKind = "short" | "standard" | "heavy";

export type WordCostEstimate = {
  kind: WordCostFixtureKind;
  modelPlanner: string;
  modelWorker: string;
  aiCalls: number;
  inputTokens: number;
  outputTokens: number;
  cachedTokens: number;
  visionCalls: number;
  imageGenerationCalls: number;
  retries: number;
  quotaRuns: number;
  estimatedUsd: number;
  outputCeilingUsd: number;
  estimatedJpy: number | null;
  jpyRate: number | null;
  jpySource: "ATLAS_USD_JPY_RATE" | "FX_RATE_REQUIRED";
  priceSource: string;
};

function usdToJpy(usd: number): { jpy: number | null; rate: number | null } {
  const rate = Number(process.env.ATLAS_USD_JPY_RATE ?? "");
  if (!Number.isFinite(rate) || rate <= 0) return { jpy: null, rate: null };
  return { jpy: Math.round(usd * rate), rate };
}

export function estimateWordPipelineCost(input: {
  kind: WordCostFixtureKind;
  assignment: string;
  markdown: string;
}): WordCostEstimate {
  const planner = resolvePlannerPolicy({
    assignment: input.assignment,
    deliverableType: "report",
  });
  const worker = resolveWorkerPolicy({ deliverableType: "report" });
  const meter = createWorkflowCostMeter();
  const plannerOutput = JSON.stringify({
    plan: "word-document",
    pages: input.kind === "short" ? 3 : input.kind === "standard" ? 8 : 20,
    sections: ["概要", "本文", "次のアクション"],
  });

  meter.recordLlmCall({
    department: "planning",
    taskType: "planner_unified",
    inputText: input.assignment,
    outputText: plannerOutput,
    instructions: getCompactInstructions("planner_unified"),
  });
  meter.recordLlmCall({
    department: "production",
    taskType: worker.taskType,
    inputText: `${input.assignment}\n${plannerOutput}`,
    outputText: input.markdown,
    instructions: getCompactInstructions(worker.taskType),
  });

  const summary = meter.getSummary();
  const fx = usdToJpy(summary.estimatedCostUsd);
  const plannerEntry = resolveCatalogEntryForModel(planner.model);
  const workerEntry = resolveCatalogEntryForModel(worker.model);
  const plannerCall = summary.calls.find((call) => call.taskType === "planner_unified");
  const workerCall = summary.calls.find((call) => call.taskType === worker.taskType);
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
    modelPlanner: planner.model,
    modelWorker: worker.model,
    aiCalls: summary.llmCallCount,
    inputTokens: summary.estimatedInputTokens,
    outputTokens: summary.estimatedOutputTokens,
    cachedTokens: 0,
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

export function evaluateWordPlanSafety(costUsdPerDoc: number): Array<{
  planId: PlanId;
  monthlyPriceJpy: number;
  aiUsageMonthly: number;
  aiCostBudgetUsdMonthly: number;
  maxByCount: number;
  maxByCost: number | null;
  effectiveMax: number | null;
}> {
  return listPlanDefinitions()
    .filter((plan) => plan.planId !== "free")
    .map((plan) => {
      const maxByCount = plan.limits.aiUsageMonthly;
      const maxByCost =
        costUsdPerDoc > 0
          ? Math.floor(plan.limits.aiCostBudgetUsdMonthly / costUsdPerDoc)
          : null;
      return {
        planId: plan.planId,
        monthlyPriceJpy: plan.monthlyPriceJpy,
        aiUsageMonthly: plan.limits.aiUsageMonthly,
        aiCostBudgetUsdMonthly: plan.limits.aiCostBudgetUsdMonthly,
        maxByCount,
        maxByCost,
        effectiveMax:
          maxByCost == null ? maxByCount : Math.min(maxByCount, maxByCost),
      };
    });
}

export function wordCostShareOfPlan(input: {
  planId: PlanId;
  docs: number;
  costUsd: number;
  jpyRate: number | null;
}): { costJpy: number | null; sharePct: number | null } {
  const plan = getPlanDefinition(input.planId);
  if (input.jpyRate == null || input.jpyRate <= 0) {
    return { costJpy: null, sharePct: null };
  }
  const costJpy = Math.round(input.costUsd * input.docs * input.jpyRate);
  const sharePct =
    plan.monthlyPriceJpy > 0 ? (costJpy / plan.monthlyPriceJpy) * 100 : null;
  return { costJpy, sharePct };
}
