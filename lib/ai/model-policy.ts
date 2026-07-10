/**
 * AI task types and shared policy types.
 * Model selection is performed exclusively by {@link ./policy-engine.ts}.
 */

/** Identifies why an LLM call is being made. */
export type AiTaskType =
  | "planner_unified"
  | "worker_deliverable"
  | "worker_deliverable_light"
  | "worker_revision"
  | "research_synthesis"
  | "reviewer_fallback"
  | "chat";

export type ReasoningLevel = "none" | "low" | "medium" | "high";

export type CostPriority = "minimum" | "balanced" | "quality";

export type ModelPolicy = {
  taskType: AiTaskType;
  model: string;
  maxOutputTokens: number;
  temperature: number;
  reasoningLevel: ReasoningLevel;
  costPriority: CostPriority;
  inputPricePerMillion: number;
  outputPricePerMillion: number;
};

/** @deprecated Use {@link resolveAiPolicy} from `./policy-engine`. */
export { STRONG_MODEL, CHEAP_MODEL } from "./model-catalog";

/** Departments that never invoke an LLM in the optimized pipeline. */
export const RULES_ONLY_DEPARTMENTS = [
  "ceo-office",
  "quality-assurance",
  "marketing-pr",
  "growth",
  "learning",
  "operations",
  "action-engine",
] as const;
