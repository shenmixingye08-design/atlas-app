/**
 * Workflow task prompts — pipeline step instructions.
 *
 * Consumed by `lib/orchestration/orchestrator.ts` (via `@/lib/agents/tasks` re-exports).
 * System identity for each agent role lives in `lib/prompts/system/`.
 */

export { CEO_TASKS } from "./ceo-tasks";
export { PLANNER_TASKS } from "./planner-tasks";
export { buildWorkerTaskPrompt } from "./worker-tasks";
export {
  RESEARCH_TASKS,
  buildResearchReportTaskPrompt,
} from "./research-tasks";
export {
  buildReviewerTaskPrompt,
  REVIEWER_TASKS,
} from "./reviewer-tasks";
