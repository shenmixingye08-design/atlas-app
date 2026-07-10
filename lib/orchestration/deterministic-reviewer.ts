import type { Deliverable } from "./deliverable-types";
import type { AgentPhaseResult, TaskExecutionResult, WorkTask } from "./types";

const REVIEWER_FALLBACK_THRESHOLD = 70;

function buildSyntheticReviewerPhase(
  task: WorkTask,
  approved: boolean,
  score: number,
): AgentPhaseResult {
  const outputText = approved
    ? `APPROVED\n\nTask ${task.id} (${task.title}) meets quality requirements. Score: ${score}/100.`
    : `NEEDS_REVISION\n\nTask ${task.id} (${task.title}) requires improvement. Score: ${score}/100.`;

  return {
    result: {
      agentId: "reviewer",
      role: "reviewer",
      name: "Quality Lead",
      outputText,
      responseId: `reviewer-rules-${task.id}-${crypto.randomUUID()}`,
      status: "completed",
      model: "atlas-rules",
    },
    durationMs: 0,
  };
}

/** Deterministic per-task review from deliverable + task scope. */
export function runDeterministicTaskReview(
  deliverable: Deliverable,
  task: WorkTask,
): { approved: boolean; score: number; phase: AgentPhaseResult; needsLlmFallback: boolean } {
  let score = 80;
  const haystack = `${deliverable.content} ${deliverable.title} ${deliverable.summary}`.toLowerCase();
  const taskKeywords = `${task.title} ${task.description}`
    .toLowerCase()
    .split(/\s+/)
    .filter((w) => w.length > 3)
    .slice(0, 5);

  let keywordHits = 0;
  for (const kw of taskKeywords) {
    if (haystack.includes(kw)) keywordHits += 1;
  }

  if (keywordHits >= Math.ceil(taskKeywords.length * 0.4)) score += 10;
  if (deliverable.title.trim()) score += 5;
  if (deliverable.content.length > 200) score += 5;

  score = Math.min(100, score);
  const approved = score >= 75;
  const needsLlmFallback = score < REVIEWER_FALLBACK_THRESHOLD;

  return {
    approved,
    score,
    phase: buildSyntheticReviewerPhase(task, approved, score),
    needsLlmFallback,
  };
}

/** Build executions with deterministic reviews for UX timeline. */
export function buildExecutionsWithDeterministicReviews(
  tasks: WorkTask[],
  workerPhase: AgentPhaseResult,
  workerAssignments: Array<{ taskId: number; employeeId: TaskExecutionResult["assignedEmployeeId"] }>,
  deliverable: Deliverable,
): TaskExecutionResult[] {
  return tasks.map((task, index) => {
    const review = runDeterministicTaskReview(deliverable, task);
    return {
      task,
      assignedEmployeeId:
        workerAssignments[index]?.employeeId ?? "development-senior-dev",
      worker: workerPhase,
      workerStatus: "completed" as const,
      reviewer: review.phase,
      reviewerStatus: "completed" as const,
      approved: review.approved,
    };
  });
}

export { REVIEWER_FALLBACK_THRESHOLD };
