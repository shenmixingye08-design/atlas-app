/**
 * Blog AI cost estimate using existing cost-meter + catalog.
 * WordPress REST traffic is not an AI cost.
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
import { listPlanDefinitions } from "@/lib/billing/plans/registry";
import type { PlanId } from "@/lib/billing/plans/types";

export type BlogCostFixtureKind = "short" | "standard" | "heavy";

export type BlogCostEstimate = {
  kind: BlogCostFixtureKind;
  modelPlanner: string;
  modelWorker: string;
  aiCalls: number;
  inputTokens: number;
  outputTokens: number;
  researchCalls: number;
  visionCalls: number;
  imageGenerationCalls: number;
  retries: number;
  quotaRuns: number;
  estimatedUsd: number;
  outputCeilingUsd: number;
  wordpressApiCostUsd: number;
  estimatedJpy: number | null;
  jpySource: "ATLAS_USD_JPY_RATE" | "FX_RATE_REQUIRED";
  priceSource: string;
};

function usdToJpy(usd: number): { jpy: number | null; rate: number | null } {
  const rate = Number(process.env.ATLAS_USD_JPY_RATE ?? "");
  if (!Number.isFinite(rate) || rate <= 0) return { jpy: null, rate: null };
  return { jpy: Math.round(usd * rate), rate };
}

export function estimateBlogPipelineCost(input: {
  kind: BlogCostFixtureKind;
  assignment: string;
  markdown: string;
  includeResearch?: boolean;
}): BlogCostEstimate {
  const planner = resolvePlannerPolicy({
    assignment: input.assignment,
    deliverableType: "blog",
  });
  const worker = resolveWorkerPolicy({ deliverableType: "blog" });
  const meter = createWorkflowCostMeter();
  const plannerOutput = JSON.stringify({
    plan: "blog-article",
    intent: "article",
    sections: ["導入", "本文", "まとめ"],
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

  let researchCalls = 0;
  if (input.includeResearch) {
    researchCalls = 1;
    meter.recordLlmCall({
      department: "research",
      taskType: "research_synthesis",
      inputText: input.assignment,
      outputText: "確認できた事実のみを要約します。",
      instructions: getCompactInstructions("research_synthesis"),
    });
  }

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
    researchCalls,
    visionCalls: 0,
    imageGenerationCalls: 0,
    retries: 0,
    quotaRuns: 1,
    estimatedUsd: summary.estimatedCostUsd,
    outputCeilingUsd,
    wordpressApiCostUsd: 0,
    estimatedJpy: fx.jpy,
    jpySource: fx.rate ? "ATLAS_USD_JPY_RATE" : "FX_RATE_REQUIRED",
    priceSource: `MODEL_CATALOG planner ${plannerEntry.model} in ${plannerEntry.inputPricePerMillion}/M out ${plannerEntry.outputPricePerMillion}/M; worker ${workerEntry.model} in ${workerEntry.inputPricePerMillion}/M out ${workerEntry.outputPricePerMillion}/M`,
  };
}

export function evaluateBlogPlanSafety(costUsdPerArticle: number): Array<{
  planId: PlanId;
  maxByCount: number;
  maxByCost: number | null;
  effectiveMax: number | null;
  aiCostBudgetUsdMonthly: number;
}> {
  return listPlanDefinitions()
    .filter((plan) => plan.planId !== "free")
    .map((plan) => {
      const maxByCount = plan.limits.aiUsageMonthly;
      const maxByCost =
        costUsdPerArticle > 0
          ? Math.floor(plan.limits.aiCostBudgetUsdMonthly / costUsdPerArticle)
          : null;
      return {
        planId: plan.planId,
        maxByCount,
        maxByCost,
        effectiveMax:
          maxByCost == null ? maxByCount : Math.min(maxByCount, maxByCost),
        aiCostBudgetUsdMonthly: plan.limits.aiCostBudgetUsdMonthly,
      };
    });
}
