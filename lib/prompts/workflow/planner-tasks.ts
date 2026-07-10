import { PLANNER_EXCELLENCE } from "@/lib/prompts/excellence/output-standards";

/**
 * Workflow task prompts — Planner pipeline steps.
 *
 * Used by the orchestrator for execution planning and task decomposition.
 */

/** Planner step prompts for the multi-agent pipeline. */
export const PLANNER_TASKS = {
  createExecutionPlan: `${PLANNER_EXCELLENCE}

Using the CEO's strategic analysis and any Research Report, create a structured execution plan.

Required sections:

## Overview
(What we are delivering and for whom — 2-4 sentences)

## Strategic Approach
(How we will achieve the goal — phases, not task list)

## Workstreams
(Numbered workstreams with owner department and objective)

## Dependencies
(What must happen before what; external inputs needed)

## Complexity Assessment
| Workstream | Complexity (Low/Med/High) | Rationale |
(One row per workstream)

## Risks & Mitigations
(Top risks with concrete mitigation steps)

## Missing Steps Check
(Steps the assignment implies but were not stated — confirm you will cover them)

## Expected Deliverables
(Concrete artifacts the user will receive)

## Specialist Recommendations
(Which departments/specialists should own which workstreams)

Do not list individual Worker tasks yet — only the high-level plan.`,

  /** Single-call planner: plan + tasks + deliverable type (cost-optimized). */
  unifiedPlanAndTasks: `${PLANNER_EXCELLENCE}

Create an execution plan AND task decomposition in ONE response.

Return ONLY valid JSON (no prose outside JSON):
{
  "plan": "string — 2-4 paragraph execution plan",
  "deliverableType": "blog | report | proposal | presentation | research | email | document",
  "tasks": [
    {
      "title": "short title",
      "description": "detailed description",
      "department": "recommended department id"
    }
  ]
}

Rules:
- Produce 2–5 tasks (prefer fewer, sharper tasks)
- Each task independently scoped with concrete acceptance criteria in description
- Same language as the user's assignment`,

  decomposeTasks: `${PLANNER_EXCELLENCE}

Using the CEO's analysis, Research Report (if any), and your execution plan, split the work into independent Worker tasks.

Output format (required):

## Execution Plan Summary
[2-4 sentences linking tasks to the plan]

## Tasks
Task 1: [short title] — [detailed description]
  Department: [recommended specialist department]
  Complexity: [Low | Medium | High]
  Acceptance criteria: [how we know this task is done]
Task 2: [short title] — [detailed description]
  Department: ...
  Complexity: ...
  Acceptance criteria: ...
(continue for each task)

## Redundancy Check
[Confirm no overlapping tasks; note anything merged or removed]

Rules:
- Produce 2–5 tasks (prefer fewer, sharper tasks over fragmented work)
- Each task must be independently executable with a concrete deliverable
- Eliminate duplicate scope across tasks
- Use the exact "Task N:" prefix for every task
- Respond in the same language as the user's assignment`,
} as const;
