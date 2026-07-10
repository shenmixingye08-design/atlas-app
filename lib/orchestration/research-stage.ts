import "server-only";

import {
  RESEARCH_TASKS,
  buildResearchReportTaskPrompt,
} from "@/lib/agents/tasks/research-tasks";
import type { AgentContext } from "@/lib/agents/types";
import type { AgentId } from "@/lib/agents/types";
import type { EmployeeId } from "@/lib/employees/types";

import { buildResearchAssessmentContext, buildResearchReportContext } from "./context";
import {
  formatResearchReportForContext,
  parseResearchAssessmentOutput,
  parseResearchReportOutput,
} from "./parse-research";
import type {
  AgentPhaseResult,
  OrchestrationStep,
  ResearchStageResult,
} from "./types";

const RESEARCH_LEAD_ID: EmployeeId = "research-lead";

type RunPhaseFn = (
  step: OrchestrationStep,
  agentId: AgentId,
  task: string,
  context: AgentContext,
  metadata?: Readonly<Record<string, unknown>>,
  employeeId?: EmployeeId,
) => Promise<AgentPhaseResult>;

export type ResearchStageParams = {
  assignment: string;
  ceo: AgentPhaseResult;
  metadata?: Readonly<Record<string, unknown>>;
  runPhase: RunPhaseFn;
  trackStep: (step: OrchestrationStep, taskId?: number) => void;
};

export async function runResearchStage(
  params: ResearchStageParams,
): Promise<ResearchStageResult> {
  const { assignment, ceo, metadata, runPhase, trackStep } = params;

  trackStep("research_assessment");

  try {
    const assessmentPhase = await runPhase(
      "research_assessment",
      "worker",
      RESEARCH_TASKS.assessNeed,
      buildResearchAssessmentContext(assignment, ceo),
      metadata,
      RESEARCH_LEAD_ID,
    );

    const assessment = parseResearchAssessmentOutput(
      assessmentPhase.result.outputText,
    );

    if (!assessment.required) {
      return {
        assessment,
        assessmentPhase,
        assessmentStatus: "completed",
        report: null,
        reportPhase: null,
        reportStatus: "skipped",
      };
    }

    trackStep("research_report");

    try {
      const reportPhase = await runPhase(
        "research_report",
        "worker",
        buildResearchReportTaskPrompt(assessment.categories),
        buildResearchReportContext(assignment, ceo, assessmentPhase),
        metadata,
        RESEARCH_LEAD_ID,
      );

      const report = parseResearchReportOutput(reportPhase.result.outputText);

      if (!report.executiveSummary && report.keyFindings.length === 0) {
        report.fullText = reportPhase.result.outputText.trim();
        report.executiveSummary = report.fullText.slice(0, 500);
      }

      return {
        assessment,
        assessmentPhase,
        assessmentStatus: "completed",
        report,
        reportPhase,
        reportStatus: "completed",
      };
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Research report generation failed";

      return {
        assessment,
        assessmentPhase,
        assessmentStatus: "completed",
        report: null,
        reportPhase: null,
        reportStatus: "failed",
        reportError: message,
      };
    }
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Research assessment failed";

    return {
      assessment: {
        required: false,
        categories: [],
        rationale: "Research assessment failed; proceeding without external research.",
      },
      assessmentPhase: null,
      assessmentStatus: "failed",
      assessmentError: message,
      report: null,
      reportPhase: null,
      reportStatus: "skipped",
    };
  }
}

/** Summarize research for downstream agent context windows. */
export function summarizeResearchForPipeline(
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
