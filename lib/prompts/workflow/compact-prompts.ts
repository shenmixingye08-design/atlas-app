import type { WorkTask } from "@/lib/agents/tasks/types";

/** Compact JSON schema reference (~120 tokens vs ~400). */
export const COMPACT_DELIVERABLE_JSON = `Return ONLY valid JSON: {type,title,summary,content,markdown,html,plainText,tags[],seo:{title,description,keywords[]},snsPost,topic,audience}`;

/** Cost-optimized unified worker task prompt — no duplicated excellence blocks. */
export function buildCompactUnifiedWorkerTaskPrompt(
  tasks: readonly WorkTask[],
  deliverableType: string,
): string {
  const taskList = tasks
    .map((t) => `${t.id}. ${t.title}: ${t.description}`)
    .join("\n");

  return [
    `Deliverable type: ${deliverableType}`,
    `Tasks:\n${taskList}`,
    `Produce ONE unified client-ready deliverable covering all tasks.`,
    COMPACT_DELIVERABLE_JSON,
  ].join("\n\n");
}

export function buildCompactUnifiedWorkerRevisionPrompt(
  feedback: string,
  deliverableType: string,
): string {
  return [
    `Deliverable type: ${deliverableType}`,
    `Fix QA issues and return COMPLETE improved JSON.`,
    `Feedback: ${feedback}`,
    COMPACT_DELIVERABLE_JSON,
  ].join("\n\n");
}

/** Compact planner task list for context (not an API call). */
export function buildCompactPlannerTaskPrompt(
  assignment: string,
  deliverableType: string,
): string {
  return [
    `Assignment: ${assignment.slice(0, 500)}`,
    `Target type: ${deliverableType}`,
    `Return JSON: {plan,deliverableType,tasks:[{title,description,department}]}`,
    `2-5 tasks. Same language as assignment.`,
  ].join("\n");
}
