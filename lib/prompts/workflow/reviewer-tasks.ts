import type { WorkTask } from "@/lib/agents/tasks/types";
import { REVIEWER_EXCELLENCE } from "@/lib/prompts/excellence/output-standards";

/**
 * Workflow task prompts — Reviewer pipeline step.
 *
 * Builds the per-task user prompt for Reviewer quality checks.
 */

/** Builds the Reviewer task prompt for a single work item. */
export function buildReviewerTaskPrompt(task: WorkTask): string {
  return [
    REVIEWER_EXCELLENCE,
    ``,
    `Review the Worker's output for the following task against the original assignment and prior directives.`,
    ``,
    `Task ${task.id}: ${task.title}`,
    task.description,
    ``,
    `Structure your review exactly as:`,
    `## Summary`,
    `(2-3 sentences: overall quality assessment)`,
    `## Checklist`,
    `| Criterion | Pass/Fail | Notes |`,
    `(Logic, Readability, Completeness, Professional tone, Consistency, Hallucination risk)`,
    `## Issues Found`,
    `(Specific issues with quotes or section references — none if clean)`,
    `## Verdict`,
    `(APPROVED or NEEDS_REVISION)`,
    `## Recommended Changes`,
    `(Actionable fixes — what to rewrite, add, or remove)`,
  ].join("\n");
}

/** Reserved for future final-synthesis step (not yet wired in orchestrator). */
export const REVIEWER_TASKS = {
  synthesizeDeliverable:
    "Review all task outputs and review comments. Produce a cohesive final deliverable that combines the approved work into one polished, client-ready document. Preserve all key content, eliminate repetition, and ensure consistent tone and structure.",
} as const;
