import { CONSULTING_QUALITY_BAR } from "@/lib/prompts/excellence/output-standards";

/**
 * Workflow task prompts — CEO pipeline step.
 *
 * Used by the orchestrator as the per-step user task (not system instructions).
 * Edit here when changing CEO workflow behavior.
 */

/** CEO step: strategic analysis of the user's assignment. */
export const CEO_TASKS = {
  analyzeRequest: `${CONSULTING_QUALITY_BAR}

Analyze the user's assignment. Provide a strategic analysis with these sections:

## Goal
(What the user truly needs — outcome, not activity)

## Priorities
(Ordered list — what matters most, what can be deferred)

## Success Criteria
(Measurable or observable signs the deliverable succeeds)

## Constraints & Assumptions
(Deadline, format, audience, scope limits; state reasonable assumptions explicitly)

## Delegation Directives for the Planner
(Specific guidance on depth, tone, format, research needs, and quality bar)

## Client-Ready Standard
(What "done well" looks like for this assignment — consulting-grade expectations)`,
} as const;
