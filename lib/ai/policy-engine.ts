import type { DeliverableType } from "@/lib/orchestration/deliverable-types";

import { resolveModelFromTier } from "./model-catalog";
import type {
  AiTaskType,
  CostPriority,
  ModelPolicy,
  ReasoningLevel,
} from "./model-policy";
import { getTaskPolicyTemplate } from "./task-policy-templates";

/** Sales material cost mode passed via orchestration metadata. */
export type SalesCostSavingMode = "low" | "standard" | "high";

/** Organizational department requesting an LLM call. */
export type AiDepartment =
  | "planning"
  | "production"
  | "research"
  | "quality-assurance"
  | "chat";

/** Future: subscription-based routing. */
export type SubscriptionPlan = "free" | "standard" | "pro" | "enterprise";

/** Future: complexity-based routing. */
export type ComplexityEstimate = "low" | "medium" | "high";

/** Input to the centralized AI Policy Engine. */
export type AiPolicyRequest = {
  department: AiDepartment;
  /** Known task type — if omitted, inferred from department + context. */
  taskType?: AiTaskType;
  deliverableType?: string;
  subscriptionPlan?: SubscriptionPlan;
  estimatedComplexity?: ComplexityEstimate;
  estimatedCostUsd?: number;
  assignmentLength?: number;
  revision?: boolean;
  /** When set via sales-material wizard metadata. */
  costSavingMode?: SalesCostSavingMode;
};

/** Resolved AI execution policy — single source of truth for LLM calls. */
export type AiPolicyDecision = {
  taskType: AiTaskType;
  model: string;
  maxOutputTokens: number;
  temperature: number;
  reasoningLevel: ReasoningLevel;
  costPriority: CostPriority;
  inputPricePerMillion: number;
  outputPricePerMillion: number;
};

const HEAVY_DELIVERABLE_TYPES: ReadonlySet<DeliverableType> = new Set([
  "blog",
  "report",
  "proposal",
  "presentation",
  "research",
]);

function resolveWorkerTaskType(
  deliverableType: string,
  revision = false,
): AiTaskType {
  const isHeavy = HEAVY_DELIVERABLE_TYPES.has(deliverableType as DeliverableType);
  if (revision) {
    return isHeavy ? "worker_revision" : "worker_deliverable_light";
  }
  return isHeavy ? "worker_deliverable" : "worker_deliverable_light";
}

function inferTaskType(request: AiPolicyRequest): AiTaskType {
  if (request.taskType) return request.taskType;

  switch (request.department) {
    case "planning":
      return "planner_unified";
    case "production":
      return resolveWorkerTaskType(request.deliverableType ?? "document", request.revision);
    case "research":
      return "research_synthesis";
    case "quality-assurance":
      return "reviewer_fallback";
    case "chat":
    default:
      return "chat";
  }
}

/**
 * Future routing hooks — no-op today; preserves identical behavior.
 * Extend here for subscription plan, complexity, and cost-based overrides.
 */
function applyRoutingModifiers(
  template: ReturnType<typeof getTaskPolicyTemplate>,
  request: AiPolicyRequest,
): ReturnType<typeof getTaskPolicyTemplate> {
  const mode = request.costSavingMode;
  if (!mode || mode === "standard") {
    return template;
  }

  if (mode === "low") {
    if (
      template.taskType === "worker_deliverable" ||
      template.taskType === "worker_revision"
    ) {
      return getTaskPolicyTemplate("worker_deliverable_light");
    }
    return {
      ...template,
      maxOutputTokens: Math.min(template.maxOutputTokens, 1536),
      costPriority: "minimum" as CostPriority,
    };
  }

  // high quality — keep heavy worker, allow more tokens
  if (
    template.taskType === "worker_deliverable" ||
    template.taskType === "worker_deliverable_light"
  ) {
    return {
      ...getTaskPolicyTemplate("worker_deliverable"),
      maxOutputTokens: Math.max(template.maxOutputTokens, 8192),
      costPriority: "quality" as CostPriority,
    };
  }

  return template;
}

function templateToDecision(
  template: ReturnType<typeof getTaskPolicyTemplate>,
): AiPolicyDecision {
  const catalog = resolveModelFromTier(template.tier);
  return {
    taskType: template.taskType,
    model: catalog.model,
    maxOutputTokens: template.maxOutputTokens,
    temperature: template.temperature,
    reasoningLevel: template.reasoningLevel,
    costPriority: template.costPriority,
    inputPricePerMillion: catalog.inputPricePerMillion,
    outputPricePerMillion: catalog.outputPricePerMillion,
  };
}

/** Central policy resolver — all LLM calls must route through this function. */
export function resolveAiPolicy(request: AiPolicyRequest): AiPolicyDecision {
  const taskType = inferTaskType(request);
  const template = applyRoutingModifiers(getTaskPolicyTemplate(taskType), request);
  return templateToDecision(template);
}

/** Planner department policy (single unified planning call). */
export function resolvePlannerPolicy(params: {
  assignment?: string;
  deliverableType?: string;
  subscriptionPlan?: SubscriptionPlan;
  estimatedComplexity?: ComplexityEstimate;
  costSavingMode?: SalesCostSavingMode;
} = {}): AiPolicyDecision {
  return resolveAiPolicy({
    department: "planning",
    taskType: "planner_unified",
    deliverableType: params.deliverableType,
    subscriptionPlan: params.subscriptionPlan,
    estimatedComplexity: params.estimatedComplexity,
    assignmentLength: params.assignment?.trim().length,
    costSavingMode: params.costSavingMode,
  });
}

/** Production department policy — selects worker task type from deliverable shape. */
export function resolveWorkerPolicy(params: {
  deliverableType: string;
  revision?: boolean;
  subscriptionPlan?: SubscriptionPlan;
  estimatedComplexity?: ComplexityEstimate;
  estimatedCostUsd?: number;
  costSavingMode?: SalesCostSavingMode;
}): AiPolicyDecision {
  return resolveAiPolicy({
    department: "production",
    deliverableType: params.deliverableType,
    revision: params.revision,
    subscriptionPlan: params.subscriptionPlan,
    estimatedComplexity: params.estimatedComplexity,
    estimatedCostUsd: params.estimatedCostUsd,
    costSavingMode: params.costSavingMode,
  });
}

/** @deprecated Use {@link resolveWorkerPolicy}. */
export function resolveWorkerAiTaskType(
  deliverableType: string,
  revision = false,
): AiTaskType {
  return resolveWorkerPolicy({ deliverableType, revision }).taskType;
}

/** Map a resolved decision back to legacy {@link ModelPolicy} shape (cost meter compat). */
export function decisionToModelPolicy(decision: AiPolicyDecision): ModelPolicy {
  return {
    taskType: decision.taskType,
    model: decision.model,
    maxOutputTokens: decision.maxOutputTokens,
    temperature: decision.temperature,
    reasoningLevel: decision.reasoningLevel,
    costPriority: decision.costPriority,
    inputPricePerMillion: decision.inputPricePerMillion,
    outputPricePerMillion: decision.outputPricePerMillion,
  };
}

/** Resolve policy for an explicit task type (research, reviewer, chat paths). */
export function resolveTaskPolicy(
  taskType: AiTaskType,
  context: Omit<AiPolicyRequest, "taskType" | "department"> = {},
): AiPolicyDecision {
  const department: AiDepartment =
    taskType === "planner_unified"
      ? "planning"
      : taskType === "worker_deliverable" ||
          taskType === "worker_deliverable_light" ||
          taskType === "worker_revision"
        ? "production"
        : taskType === "research_synthesis"
          ? "research"
          : taskType === "reviewer_fallback"
            ? "quality-assurance"
            : "chat";

  return resolveAiPolicy({ department, taskType, ...context });
}

/** @deprecated Use {@link resolveTaskPolicy} from the policy engine. */
export function getModelPolicy(taskType: AiTaskType): ModelPolicy {
  return decisionToModelPolicy(resolveTaskPolicy(taskType));
}
