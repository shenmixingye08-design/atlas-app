import type { AgentContext } from "@/lib/agents/types";
import type { DeliverableType } from "./deliverable-types";
import { summarizeResearchForPipeline } from "./research-stage";

const MAX_ASSIGNMENT = 2_000;
const MAX_RESEARCH = 800;
const MAX_PLAN = 1_200;

function trim(text: string, max: number): string {
  const t = text.trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max)}\n[...truncated]`;
}

export type SlimWorkerContextInput = {
  assignment: string;
  deliverableType: DeliverableType;
  planSummary: string;
  researchSummary?: string | null;
  qualityRequirements?: string;
  workerKnowledge?: string | null;
};

/** Minimal context for Planner — no full workflow history. */
export function buildSlimPlannerContext(
  assignment: string,
  researchSummary?: string | null,
  deliverableType?: DeliverableType,
  plannerKnowledge?: string | null,
): AgentContext {
  const priorOutputs = [];

  if (researchSummary?.trim()) {
    priorOutputs.push({
      agentId: "worker" as const,
      role: "worker" as const,
      output: trim(researchSummary, MAX_RESEARCH),
    });
  }

  if (plannerKnowledge?.trim()) {
    priorOutputs.push({
      agentId: "ceo" as const,
      role: "ceo" as const,
      output: trim(`参考ナレッジ:\n${plannerKnowledge}`, MAX_RESEARCH),
    });
  }

  if (deliverableType) {
    priorOutputs.push({
      agentId: "ceo" as const,
      role: "ceo" as const,
      output: `Target deliverable type: ${deliverableType}`,
    });
  }

  return {
    assignment: trim(assignment, MAX_ASSIGNMENT),
    priorOutputs,
  };
}

/** Minimal context for unified Worker — no PR/growth/learning/timeline. */
export function buildSlimWorkerContext(input: SlimWorkerContextInput): AgentContext {
  const priorOutputs = [];

  if (input.researchSummary?.trim()) {
    priorOutputs.push({
      agentId: "worker" as const,
      role: "worker" as const,
      output: trim(input.researchSummary, MAX_RESEARCH),
    });
  }

  if (input.planSummary.trim()) {
    priorOutputs.push({
      agentId: "planner" as const,
      role: "planner" as const,
      output: trim(input.planSummary, MAX_PLAN),
    });
  }

  if (input.workerKnowledge?.trim()) {
    priorOutputs.push({
      agentId: "ceo" as const,
      role: "ceo" as const,
      output: trim(`参考ナレッジ:\n${input.workerKnowledge}`, MAX_RESEARCH),
    });
  }

  priorOutputs.push({
    agentId: "planner" as const,
    role: "planner" as const,
    output: `Deliverable type: ${input.deliverableType}\nQuality: ${input.qualityRequirements ?? "Complete structured JSON with title, summary, content, markdown, metadata."}`,
  });

  return {
    assignment: trim(input.assignment, MAX_ASSIGNMENT),
    priorOutputs,
  };
}

export function extractResearchSummary(
  research: Parameters<typeof summarizeResearchForPipeline>[0],
): string | null {
  return summarizeResearchForPipeline(research);
}
