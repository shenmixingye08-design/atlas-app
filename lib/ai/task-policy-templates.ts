import type { ModelTier } from "./model-catalog";
import type {
  AiTaskType,
  CostPriority,
  ReasoningLevel,
} from "./model-policy";

/** Task-level policy template — model id resolved via {@link ModelTier}. */
export type TaskPolicyTemplate = {
  taskType: AiTaskType;
  tier: ModelTier;
  maxOutputTokens: number;
  temperature: number;
  reasoningLevel: ReasoningLevel;
  costPriority: CostPriority;
};

/** Base routing templates keyed by task type. Used exclusively by the policy engine. */
export const TASK_POLICY_TEMPLATES: Record<AiTaskType, TaskPolicyTemplate> = {
  planner_unified: {
    taskType: "planner_unified",
    tier: "cheap",
    maxOutputTokens: 2_048,
    temperature: 0.4,
    reasoningLevel: "low",
    costPriority: "minimum",
  },
  worker_deliverable: {
    taskType: "worker_deliverable",
    tier: "strong",
    maxOutputTokens: 8_192,
    temperature: 0.5,
    reasoningLevel: "medium",
    costPriority: "quality",
  },
  worker_deliverable_light: {
    taskType: "worker_deliverable_light",
    tier: "cheap",
    maxOutputTokens: 3_072,
    temperature: 0.4,
    reasoningLevel: "low",
    costPriority: "minimum",
  },
  worker_revision: {
    taskType: "worker_revision",
    tier: "strong",
    maxOutputTokens: 8_192,
    temperature: 0.4,
    reasoningLevel: "medium",
    costPriority: "quality",
  },
  research_synthesis: {
    taskType: "research_synthesis",
    tier: "cheap",
    maxOutputTokens: 2_048,
    temperature: 0.3,
    reasoningLevel: "low",
    costPriority: "minimum",
  },
  reviewer_fallback: {
    taskType: "reviewer_fallback",
    tier: "cheap",
    maxOutputTokens: 768,
    temperature: 0.2,
    reasoningLevel: "none",
    costPriority: "minimum",
  },
  chat: {
    taskType: "chat",
    tier: "strong",
    maxOutputTokens: 4_096,
    temperature: 0.7,
    reasoningLevel: "medium",
    costPriority: "balanced",
  },
};

export function getTaskPolicyTemplate(taskType: AiTaskType): TaskPolicyTemplate {
  return TASK_POLICY_TEMPLATES[taskType];
}
