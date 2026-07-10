import type { WorkTask } from "@/lib/agents/tasks/types";
import {
  DELIVERABLE_FORMAT_GUIDANCE,
  WORKER_EXCELLENCE,
} from "@/lib/prompts/excellence/output-standards";
import { inferDeliverableType } from "@/lib/orchestration/worker-output";

/**
 * Workflow task prompts — Worker pipeline step.
 *
 * Builds the per-task user prompt for Worker execution.
 */

const STRUCTURED_DELIVERABLE_OUTPUT = `Return ONLY valid JSON (no prose outside JSON) with this exact shape:
{
  "type": "blog | report | proposal | presentation | research | email | document",
  "title": "string",
  "summary": "string — 1-3 sentence overview",
  "content": "string — primary body (article, report, email body, slide outline, etc.)",
  "markdown": "string — full formatted markdown export",
  "html": "string — optional HTML version",
  "plainText": "string — plain text version",
  "tags": ["string"],
  "seo": {
    "title": "string",
    "description": "string",
    "keywords": ["string"]
  },
  "snsPost": "string — social post copy when relevant",
  "topic": "string",
  "audience": "string"
}`;

/** Builds the Worker task prompt for a single work item. */
export function buildWorkerTaskPrompt(task: WorkTask, assignment?: string): string {
  const inferredType = assignment ? inferDeliverableType(assignment, `${task.title} ${task.description}`) : "document";

  const parts = [
    WORKER_EXCELLENCE,
    ``,
    `Execute the following task independently and produce a concrete, client-ready deliverable.`,
    ``,
    `Task ${task.id}: ${task.title}`,
    task.description,
    ``,
    DELIVERABLE_FORMAT_GUIDANCE,
    ``,
    `Output the actual work product — not a plan, outline, or description of what you would do.`,
    `Do not repeat points already covered in prior agent outputs unless building on them with new detail.`,
    ``,
    `Deliverable type for this task: ${inferredType}.`,
    `You MUST return structured JSON — never collapse fields into a single prose block.`,
    STRUCTURED_DELIVERABLE_OUTPUT,
  ];

  return parts.join("\n");
}

/** Unified worker prompt — one call produces the full deliverable for all planner tasks. */
export function buildUnifiedWorkerTaskPrompt(
  tasks: readonly WorkTask[],
  assignment: string,
  deliverableType: string,
): string {
  const taskList = tasks
    .map((t) => `- Task ${t.id}: ${t.title} — ${t.description}`)
    .join("\n");

  return [
    WORKER_EXCELLENCE,
    ``,
    `Produce ONE unified, client-ready deliverable covering ALL tasks below in a single structured output.`,
    ``,
    `Deliverable type: ${deliverableType}`,
    ``,
    `## Tasks to fulfill`,
    taskList,
    ``,
    DELIVERABLE_FORMAT_GUIDANCE,
    ``,
    `Output the actual work product — not a plan or outline.`,
    `You MUST return structured JSON — never collapse fields into a single prose block.`,
    STRUCTURED_DELIVERABLE_OUTPUT,
  ].join("\n");
}

/** Worker revision — improve deliverable based on QA feedback. */
export function buildUnifiedWorkerRevisionPrompt(
  feedback: string,
  deliverableType: string,
): string {
  return [
    WORKER_EXCELLENCE,
    ``,
    `Revise the deliverable to address QA feedback. Return the COMPLETE improved JSON deliverable.`,
    ``,
    `Deliverable type: ${deliverableType}`,
    ``,
    `## QA Feedback`,
    feedback,
    ``,
    STRUCTURED_DELIVERABLE_OUTPUT,
  ].join("\n");
}
