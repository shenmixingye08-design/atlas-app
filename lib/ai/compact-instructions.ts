import type { AiTaskType } from "./model-policy";
import { wrapCompactInstructions } from "@/lib/atlas-personality";

/** Minimal system instructions for cost-optimized workflow LLM calls (~80 tokens vs ~800+ employee prompts). */
const COMPACT_BY_TASK: Partial<Record<AiTaskType, string>> = {
  planner_unified:
    "Atlas Lead Planner role. Output valid JSON only. Be concise. Understand what the client wants to achieve. Same language as assignment.",
  worker_deliverable:
    "Atlas Production role. Output client-ready structured JSON deliverable only. Match client's style when memory provided. No filler.",
  worker_deliverable_light:
    "Atlas Production role. Output concise structured JSON. Professional secretary tone. Same language as assignment.",
  worker_revision:
    "Atlas Production role. Fix QA issues. Return complete improved JSON deliverable.",
  research_synthesis:
    "Atlas Research role. Synthesize findings into structured report sections. Be factual and concise.",
  reviewer_fallback:
    "Atlas QA role. Review deliverable vs requirements. Reply APPROVED or NEEDS_REVISION with brief reason.",
};

export function getCompactInstructions(
  aiTaskType: AiTaskType,
  employeeName?: string,
): string {
  const base = COMPACT_BY_TASK[aiTaskType];
  if (!base) return "";
  const role = employeeName ? `${base}\nRole: ${employeeName}.` : base;
  return wrapCompactInstructions(role);
}

export function shouldUseCompactInstructions(aiTaskType?: AiTaskType): boolean {
  return Boolean(aiTaskType && aiTaskType !== "chat");
}
