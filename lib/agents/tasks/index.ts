/**
 * Orchestration task prompt re-exports.
 *
 * Canonical prompt text lives in `lib/prompts/workflow/`.
 * This module preserves existing import paths for the orchestrator and agents layer.
 */

export type { WorkTask } from "./types";
export { CEO_TASKS } from "./ceo-tasks";
export { PLANNER_TASKS } from "./planner-tasks";
export { buildWorkerTaskPrompt } from "./worker-tasks";
export { RESEARCH_TASKS, buildResearchReportTaskPrompt } from "./research-tasks";
export {
  buildReviewerTaskPrompt,
  REVIEWER_TASKS,
} from "./reviewer-tasks";
