import type { AgentContext, AgentPriorOutput } from "@/lib/agents/types";

import type {
  AgentPhaseResult,
  ResearchStageResult,
  TaskExecutionResult,
  WorkTask,
} from "./types";
import { formatResearchReportForContext } from "./parse-research";
import type { KnowledgeRetrievalResult } from "@/lib/knowledge/types";
import { getCompanyResearchGuidance } from "@/lib/company-templates/loader";

const MAX_ASSIGNMENT_CHARS = 4_000;
const MAX_PRIOR_OUTPUT_CHARS = 1_500;
const MAX_TASK_SUMMARY_CHARS = 400;
const MAX_COMPLETED_TASK_SUMMARIES = 3;

export function truncateText(text: string, maxChars: number): string {
  const trimmed = text.trim();
  if (trimmed.length <= maxChars) return trimmed;
  return `${trimmed.slice(0, maxChars)}\n\n[...truncated for context size]`;
}

function toPriorOutput(
  phase: AgentPhaseResult,
  agentId: AgentPriorOutput["agentId"],
  maxChars: number = MAX_PRIOR_OUTPUT_CHARS,
): AgentPriorOutput {
  return {
    agentId,
    role: agentId,
    output: truncateText(phase.result.outputText, maxChars),
    responseId: phase.result.responseId,
  };
}

function summarizeCompletedExecutions(
  executions: readonly TaskExecutionResult[],
): AgentPriorOutput[] {
  const recent = executions.slice(-MAX_COMPLETED_TASK_SUMMARIES);

  return recent
    .filter((execution) => execution.workerStatus === "completed" && execution.worker)
    .map((execution) => ({
    agentId: "worker",
    role: "worker",
    output: truncateText(
      `[Task ${execution.task.id}: ${execution.task.title}] ${execution.worker!.result.outputText} — Review: ${execution.approved ? "APPROVED" : "NEEDS_REVISION"}`,
      MAX_TASK_SUMMARY_CHARS,
    ),
    responseId: execution.worker!.result.responseId,
  }));
}

function appendKnowledgePriorOutput(
  priorOutputs: AgentPriorOutput[],
  knowledge: KnowledgeRetrievalResult | null | undefined,
  scope: "ceo" | "planner" | "worker" | "qa",
  taskHint?: string,
): void {
  if (!knowledge) return;

  let text = "";

  switch (scope) {
    case "ceo":
      text = knowledge.ceoContext;
      break;
    case "planner":
      text = [
        "## Similar projects",
        knowledge.plannerContext.similarProjects,
        "",
        "## Previous mistakes",
        knowledge.plannerContext.previousMistakes,
        "",
        "## Successful strategies",
        knowledge.plannerContext.successfulStrategies,
        "",
        "## Preferred deliverable formats",
        knowledge.plannerContext.preferredFormats,
      ].join("\n");
      break;
    case "worker":
      text = resolveWorkerKnowledge(knowledge, taskHint);
      break;
    case "qa":
      text = knowledge.qaMistakesToAvoid;
      break;
  }

  if (!text.trim()) return;

  priorOutputs.push({
    agentId: "ceo",
    role: "ceo",
    output: truncateText(`[Executive Memory — ${scope}]\n${text}`, MAX_PRIOR_OUTPUT_CHARS),
  });
}

function resolveWorkerKnowledge(
  knowledge: KnowledgeRetrievalResult,
  taskHint?: string,
): string {
  if (!taskHint) return knowledge.workerContext;

  const haystack = taskHint.toLowerCase();
  for (const [keyword, summary] of Object.entries(
    knowledge.workerContextByTaskKeyword,
  )) {
    if (haystack.includes(keyword.toLowerCase())) {
      return summary;
    }
  }

  return knowledge.workerContext;
}

export function buildCeoContext(
  assignment: string,
  knowledge?: KnowledgeRetrievalResult | null,
): AgentContext {
  const priorOutputs: AgentPriorOutput[] = [];
  appendKnowledgePriorOutput(priorOutputs, knowledge, "ceo");

  return {
    assignment: truncateText(assignment, MAX_ASSIGNMENT_CHARS),
    priorOutputs,
  };
}

function summarizeResearchForContext(
  research: ResearchStageResult | null | undefined,
): string | null {
  if (!research) return null;

  if (research.report && research.reportStatus === "completed") {
    return formatResearchReportForContext(research.report);
  }

  if (research.assessmentStatus === "completed" && !research.assessment.required) {
    return `Research assessment: external research not required. ${research.assessment.rationale}`;
  }

  if (research.reportStatus === "failed") {
    return `Research report generation failed (${research.reportError ?? "unknown error"}). Proceed using assignment and CEO analysis only.`;
  }

  return null;
}

function appendResearchPriorOutput(
  priorOutputs: AgentPriorOutput[],
  research: ResearchStageResult | null | undefined,
): void {
  const summary = summarizeResearchForContext(research);
  if (!summary) return;

  priorOutputs.push({
    agentId: "worker",
    role: "worker",
    output: truncateText(summary, MAX_PRIOR_OUTPUT_CHARS),
    responseId: research?.reportPhase?.result.responseId,
  });
}

export function buildResearchAssessmentContext(
  assignment: string,
  ceo: AgentPhaseResult,
): AgentContext {
  const guidance = getCompanyResearchGuidance();

  return {
    assignment: truncateText(
      guidance
        ? `${assignment}\n\n[Company research policy]\n${guidance}`
        : assignment,
      MAX_ASSIGNMENT_CHARS,
    ),
    priorOutputs: [toPriorOutput(ceo, "ceo")],
  };
}

export function buildResearchReportContext(
  assignment: string,
  ceo: AgentPhaseResult,
  assessmentPhase: AgentPhaseResult,
): AgentContext {
  return {
    assignment: truncateText(assignment, MAX_ASSIGNMENT_CHARS),
    priorOutputs: [
      toPriorOutput(ceo, "ceo"),
      toPriorOutput(assessmentPhase, "worker", 800),
    ],
  };
}

export function buildPlannerPlanContext(
  assignment: string,
  ceo: AgentPhaseResult,
  research?: ResearchStageResult | null,
  knowledge?: KnowledgeRetrievalResult | null,
): AgentContext {
  const priorOutputs = [toPriorOutput(ceo, "ceo")];
  appendResearchPriorOutput(priorOutputs, research);
  appendKnowledgePriorOutput(priorOutputs, knowledge, "planner");

  return {
    assignment: truncateText(assignment, MAX_ASSIGNMENT_CHARS),
    priorOutputs,
  };
}

export function buildPlannerTasksContext(
  assignment: string,
  ceo: AgentPhaseResult,
  plannerPlan: AgentPhaseResult,
  research?: ResearchStageResult | null,
  knowledge?: KnowledgeRetrievalResult | null,
): AgentContext {
  const priorOutputs = [
    toPriorOutput(ceo, "ceo"),
    toPriorOutput(plannerPlan, "planner"),
  ];
  appendResearchPriorOutput(priorOutputs, research);
  appendKnowledgePriorOutput(priorOutputs, knowledge, "planner");

  return {
    assignment: truncateText(assignment, MAX_ASSIGNMENT_CHARS),
    priorOutputs,
  };
}

export function buildWorkerContext(
  assignment: string,
  ceo: AgentPhaseResult | null,
  plannerPlan: AgentPhaseResult | null,
  plannerTasks: AgentPhaseResult | null,
  task: WorkTask,
  completedExecutions: readonly TaskExecutionResult[] = [],
  research?: ResearchStageResult | null,
  knowledge?: KnowledgeRetrievalResult | null,
): AgentContext {
  const priorOutputs: AgentPriorOutput[] = [];

  if (ceo) {
    priorOutputs.push(toPriorOutput(ceo, "ceo", 1_000));
  }

  appendResearchPriorOutput(priorOutputs, research);
  appendKnowledgePriorOutput(
    priorOutputs,
    knowledge,
    "worker",
    `${task.title} ${task.description}`,
  );

  if (plannerPlan) {
    priorOutputs.push(toPriorOutput(plannerPlan, "planner", 1_000));
  }

  if (plannerTasks) {
    priorOutputs.push(
      toPriorOutput(plannerTasks, "planner", 800),
    );
  }

  priorOutputs.push({
    agentId: "planner",
    role: "planner",
    output: `Current task:\n- ID: ${task.id}\n- Title: ${task.title}\n- Description: ${task.description}`,
  });

  priorOutputs.push(...summarizeCompletedExecutions(completedExecutions));

  return {
    assignment: truncateText(assignment, MAX_ASSIGNMENT_CHARS),
    priorOutputs,
  };
}

export function buildReviewerContext(
  assignment: string,
  ceo: AgentPhaseResult | null,
  task: WorkTask,
  worker: AgentPhaseResult,
  research?: ResearchStageResult | null,
): AgentContext {
  const priorOutputs: AgentPriorOutput[] = [];

  if (ceo) {
    priorOutputs.push(toPriorOutput(ceo, "ceo", 800));
  }

  appendResearchPriorOutput(priorOutputs, research);

  priorOutputs.push({
    agentId: "planner",
    role: "planner",
    output: `Task under review:\n- ID: ${task.id}\n- Title: ${task.title}\n- Description: ${task.description}`,
  });

  priorOutputs.push(toPriorOutput(worker, "worker", MAX_PRIOR_OUTPUT_CHARS));

  return {
    assignment: truncateText(assignment, MAX_ASSIGNMENT_CHARS),
    priorOutputs,
  };
}
