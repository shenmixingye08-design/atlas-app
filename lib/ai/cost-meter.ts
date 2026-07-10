import type { AiTaskType, ModelPolicy } from "./model-policy";
import { decisionToModelPolicy, resolveTaskPolicy } from "./policy-engine";
import { WORKFLOW_LIMITS, WorkflowLimitError } from "./workflow-limits";

export type CostMeterCallRecord = {
  department: string;
  taskType: AiTaskType;
  model: string;
  estimatedInputTokens: number;
  estimatedOutputTokens: number;
  estimatedCostUsd: number;
  cached: boolean;
  timestamp: string;
  /** Policy engine resolution for this call. */
  policyTaskType: AiTaskType;
  policyModel: string;
  policyReasoningLevel: ModelPolicy["reasoningLevel"];
  policyCostPriority: ModelPolicy["costPriority"];
  /** Future: real provider telemetry. */
  requestId?: string;
  providerLatencyMs?: number;
  retryCount?: number;
  actualInputTokens?: number;
  actualOutputTokens?: number;
  actualCostUsd?: number;
};

export type WorkflowCostSummary = {
  llmCallCount: number;
  cacheHits: number;
  cacheMisses: number;
  estimatedInputTokens: number;
  estimatedOutputTokens: number;
  estimatedCostUsd: number;
  departmentBreakdown: Record<
    string,
    { calls: number; estimatedCostUsd: number; estimatedInputTokens: number; estimatedOutputTokens: number }
  >;
  calls: CostMeterCallRecord[];
  limitsReached: boolean;
  limitReason?: string;
};

/** Rough token estimate: ~4 chars per token for Latin/CJK mix. */
export function estimateTokens(text: string): number {
  return Math.ceil(text.trim().length / 4);
}

function estimateCost(
  inputTokens: number,
  outputTokens: number,
  policy: ModelPolicy,
): number {
  return (
    (inputTokens / 1_000_000) * policy.inputPricePerMillion +
    (outputTokens / 1_000_000) * policy.outputPricePerMillion
  );
}

export type WorkflowCostMeter = {
  recordLlmCall: (params: {
    department: string;
    taskType: AiTaskType;
    inputText: string;
    outputText: string;
    instructions?: string;
    cached?: boolean;
  }) => void;
  assertWithinLimits: () => void;
  getSummary: () => WorkflowCostSummary;
  getCallCount: () => number;
};

export function createWorkflowCostMeter(): WorkflowCostMeter {
  const calls: CostMeterCallRecord[] = [];
  let limitsReached = false;
  let limitReason: string | undefined;
  let cacheHits = 0;
  let cacheMisses = 0;

  function recordLlmCall(params: {
    department: string;
    taskType: AiTaskType;
    inputText: string;
    outputText: string;
    instructions?: string;
    cached?: boolean;
  }): void {
    if (params.cached) {
      cacheHits += 1;
    } else {
      cacheMisses += 1;
    }

    const policy = decisionToModelPolicy(resolveTaskPolicy(params.taskType));
    const inputTokens =
      estimateTokens(params.inputText) +
      estimateTokens(params.instructions ?? "");
    const outputTokens = estimateTokens(params.outputText);

    calls.push({
      department: params.department,
      taskType: params.taskType,
      model: params.cached ? "cache" : policy.model,
      estimatedInputTokens: params.cached ? 0 : inputTokens,
      estimatedOutputTokens: params.cached ? 0 : outputTokens,
      estimatedCostUsd: params.cached
        ? 0
        : estimateCost(inputTokens, outputTokens, policy),
      cached: params.cached ?? false,
      timestamp: new Date().toISOString(),
      policyTaskType: policy.taskType,
      policyModel: policy.model,
      policyReasoningLevel: policy.reasoningLevel,
      policyCostPriority: policy.costPriority,
    });
  }

  function getSummary(): WorkflowCostSummary {
    const departmentBreakdown: WorkflowCostSummary["departmentBreakdown"] = {};

    for (const call of calls) {
      const bucket = departmentBreakdown[call.department] ?? {
        calls: 0,
        estimatedCostUsd: 0,
        estimatedInputTokens: 0,
        estimatedOutputTokens: 0,
      };
      bucket.calls += 1;
      bucket.estimatedCostUsd += call.estimatedCostUsd;
      bucket.estimatedInputTokens += call.estimatedInputTokens;
      bucket.estimatedOutputTokens += call.estimatedOutputTokens;
      departmentBreakdown[call.department] = bucket;
    }

    return {
      llmCallCount: calls.filter((c) => !c.cached).length,
      cacheHits,
      cacheMisses,
      estimatedInputTokens: calls.reduce((s, c) => s + c.estimatedInputTokens, 0),
      estimatedOutputTokens: calls.reduce((s, c) => s + c.estimatedOutputTokens, 0),
      estimatedCostUsd: calls.reduce((s, c) => s + c.estimatedCostUsd, 0),
      departmentBreakdown,
      calls: [...calls],
      limitsReached,
      limitReason,
    };
  }

  function assertWithinLimits(): void {
    const summary = getSummary();
    const llmCalls = summary.llmCallCount;

    if (llmCalls >= WORKFLOW_LIMITS.maxLlmCalls) {
      limitsReached = true;
      limitReason = `LLM call limit exceeded (${llmCalls}/${WORKFLOW_LIMITS.maxLlmCalls})`;
      throw new WorkflowLimitError(limitReason);
    }

    if (summary.estimatedCostUsd >= WORKFLOW_LIMITS.maxEstimatedCostUsd) {
      limitsReached = true;
      limitReason = `Estimated cost limit exceeded ($${summary.estimatedCostUsd.toFixed(4)})`;
      throw new WorkflowLimitError(limitReason);
    }

    if (summary.estimatedOutputTokens >= WORKFLOW_LIMITS.maxTotalOutputTokens) {
      limitsReached = true;
      limitReason = `Output token budget exceeded (${summary.estimatedOutputTokens})`;
      throw new WorkflowLimitError(limitReason);
    }
  }

  return {
    recordLlmCall,
    assertWithinLimits,
    getSummary,
    getCallCount: () => calls.filter((c) => !c.cached).length,
  };
}

export function logCostSummary(summary: WorkflowCostSummary): void {
  if (process.env.NODE_ENV === "production") return;

  console.info("[ATLAS Cost Meter]", {
    llmCalls: summary.llmCallCount,
    cacheHits: summary.cacheHits,
    cacheMisses: summary.cacheMisses,
    cacheHitRate:
      summary.cacheHits + summary.cacheMisses > 0
        ? `${((summary.cacheHits / (summary.cacheHits + summary.cacheMisses)) * 100).toFixed(1)}%`
        : "n/a",
    inputTokens: summary.estimatedInputTokens,
    outputTokens: summary.estimatedOutputTokens,
    estimatedCostUsd: summary.estimatedCostUsd.toFixed(4),
    departments: summary.departmentBreakdown,
    limitsReached: summary.limitsReached,
    limitReason: summary.limitReason,
  });
}
