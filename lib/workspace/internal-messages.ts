import type { WorkTask } from "@/lib/agents/tasks/types";
import { getDeliverablePreviewText } from "@/lib/orchestration/deliverable-types";
import type {
  OrchestrationResult,
  QualityReviewRecord,
  ResearchStageResult,
} from "@/lib/orchestration/types";
import type { DepartmentId, EmployeeId } from "@/lib/employees/types";
import {
  findEmployeeById,
  resolveAssignedEmployee,
} from "@/lib/employees/registry";
import { getDepartmentDefinition } from "@/lib/departments/registry";
import { getDepartmentLabel, ui } from "@/lib/i18n";
import { LOADING_STEP_INTERVAL_MS } from "@/lib/workspace/constants";
import type { WorkflowPhaseState } from "@/lib/workspace/types";

export type InternalHandoff = {
  nextDepartment: string;
  request: string;
};

export type InternalMessage = {
  id: string;
  employeeId: string;
  departmentId: DepartmentId;
  avatar: string;
  departmentLabel: string;
  employeeName: string;
  message: string;
  reason: string;
  handoff?: InternalHandoff;
  offsetMs: number;
};

type MessageAuthor = {
  employeeId: EmployeeId;
  departmentId: DepartmentId;
};

const PHASE_AUTHORS: Record<string, MessageAuthor> = {
  ceo: {
    employeeId: "ceo-office-atlas-ceo",
    departmentId: "ceo-office",
  },
  research: {
    employeeId: "research-lead",
    departmentId: "research",
  },
  "planner-plan": {
    employeeId: "planning-lead-planner",
    departmentId: "planning",
  },
  "planner-tasks": {
    employeeId: "planning-lead-planner",
    departmentId: "planning",
  },
  reviewer: {
    employeeId: "qa-quality-lead",
    departmentId: "quality-assurance",
  },
  "quality-assurance": {
    employeeId: "qa-specialist",
    departmentId: "quality-assurance",
  },
  "ceo-approval": {
    employeeId: "ceo-office-atlas-ceo",
    departmentId: "ceo-office",
  },
  "final-deliverable": {
    employeeId: "planning-lead-planner",
    departmentId: "planning",
  },
};

function workerAuthor(workerIndex: number): MessageAuthor {
  const employees = ["development-senior-dev", "development-fullstack"] as const;
  return {
    employeeId: employees[workerIndex % employees.length]!,
    departmentId: "development",
  };
}

function resolveAuthorMeta(author: MessageAuthor): Pick<
  InternalMessage,
  "employeeId" | "departmentId" | "avatar" | "departmentLabel" | "employeeName"
> {
  const employee = findEmployeeById(author.employeeId);
  const departmentId = employee?.department ?? author.departmentId;
  const dept = getDepartmentDefinition(departmentId);

  return {
    employeeId: employee?.id ?? author.employeeId,
    departmentId,
    avatar: employee?.avatar ?? dept.icon,
    departmentLabel: getDepartmentLabel(departmentId),
    employeeName: employee?.name ?? ui.error.unknownEmployee,
  };
}

function createMessage(
  id: string,
  author: MessageAuthor,
  message: string,
  reason: string,
  offsetMs: number,
  handoff?: InternalHandoff,
): InternalMessage {
  return {
    id,
    message,
    reason,
    handoff,
    offsetMs,
    ...resolveAuthorMeta(author),
  };
}

function formatElapsed(offsetMs: number): string {
  const totalSec = Math.max(0, Math.round(offsetMs / 1000));
  if (totalSec < 60) return `${totalSec}秒`;
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  return `${min}:${sec.toString().padStart(2, "0")}`;
}

export function formatInternalMessageTime(offsetMs: number): string {
  return formatElapsed(offsetMs);
}

function toReasonSentence(text: string): string {
  const trimmed = text.trim().replace(/\s+/g, " ");
  if (!trimmed) return ui.internalComms.reasonHandoff;
  if (trimmed.endsWith("ためです。") || trimmed.endsWith("ためです")) {
    return trimmed.endsWith("。") ? trimmed : `${trimmed}。`;
  }
  if (trimmed.endsWith("ました。") || trimmed.endsWith("ています。")) {
    return trimmed;
  }
  const base = trimmed.replace(/[。．.!！?？]+$/, "");
  return `${base}ためです。`;
}

function deriveResearchReason(research: ResearchStageResult): string {
  if (research.reportStatus === "skipped" || !research.assessment.required) {
    return ui.internalComms.reasonResearchSkipped;
  }

  const finding = research.report?.keyFindings[0]?.trim();
  if (finding && finding.length <= 42) {
    return toReasonSentence(finding);
  }

  if (research.assessment.categories.includes("competitor_research")) {
    return ui.internalComms.reasonResearchCompetitor;
  }

  return ui.internalComms.reasonResearchGeneric;
}

function deriveQaReason(review: QualityReviewRecord): string {
  if (review.passed) {
    return ui.internalComms.reasonQaPassed;
  }

  if (review.tasksRevised.length > 0) {
    return ui.internalComms.reasonQaRevise;
  }

  return ui.internalComms.reasonQaImprove;
}

function derivePlanningHandoffRequest(
  assignment: string,
  research?: ResearchStageResult,
): string {
  if (/UI|ui/.test(assignment) && /改善|優先/.test(assignment)) {
    return ui.internalComms.handoffPriorityUi;
  }

  const finding = research?.report?.keyFindings[0]?.trim();
  if (finding && finding.length <= 28) {
    const base = finding.replace(/[。．.!！?？]+$/, "");
    return `${base}を優先してください。`;
  }

  const summary = research?.report?.executiveSummary?.trim();
  if (summary && summary.length <= 32) {
    const base = summary.replace(/[。．.!！?？]+$/, "");
    return `${base}を優先してください。`;
  }

  return ui.internalComms.handoffPlanningDefault;
}

function deriveProductionHandoffRequest(tasks: WorkTask[]): string {
  const first = tasks[0];
  if (!first?.title.trim()) {
    return ui.internalComms.handoffProductionDefault;
  }
  return ui.internalComms.handoffProductionTask(first.title.trim());
}

function researchRequired(result: OrchestrationResult): boolean {
  if (!result.research) return false;
  return (
    result.research.assessment.required &&
    result.research.reportStatus !== "skipped"
  );
}

function phaseMessage(phaseId: string): string {
  if (phaseId === "ceo") return ui.internalComms.ceoReceived;
  if (phaseId === "research") return ui.internalComms.researchDone;
  if (phaseId === "planner-plan") return ui.internalComms.plannerPlan;
  if (phaseId === "planner-tasks") return ui.internalComms.plannerTasks;
  if (phaseId.startsWith("worker-")) return ui.internalComms.workerDone;
  if (phaseId === "reviewer") return ui.internalComms.reviewerDone;
  if (phaseId === "quality-assurance") return ui.internalComms.qaRevise(3);
  if (phaseId === "ceo-approval") return ui.internalComms.ceoApproved;
  if (phaseId === "final-deliverable") return ui.internalComms.finalDone;
  return ui.internalComms.handoff;
}

function phaseReason(phaseId: string): string {
  if (phaseId === "ceo") return ui.internalComms.reasonCeoReceived;
  if (phaseId === "research") return ui.internalComms.reasonResearchCompetitor;
  if (phaseId === "planner-plan") return ui.internalComms.reasonPlannerPlan;
  if (phaseId === "planner-tasks") return ui.internalComms.reasonPlannerTasks;
  if (phaseId.startsWith("worker-")) return ui.internalComms.reasonWorker;
  if (phaseId === "reviewer") return ui.internalComms.reasonReviewerApproved;
  if (phaseId === "quality-assurance") return ui.internalComms.reasonQaRevise;
  if (phaseId === "ceo-approval") return ui.internalComms.reasonCeoApproved;
  if (phaseId === "final-deliverable") return ui.internalComms.reasonFinal;
  return ui.internalComms.reasonHandoff;
}

function phaseHandoff(phaseId: string): InternalHandoff | undefined {
  if (phaseId === "ceo") {
    return {
      nextDepartment: ui.internalComms.deptResearch,
      request: ui.internalComms.handoffCeoToResearch,
    };
  }
  if (phaseId === "research") {
    return {
      nextDepartment: ui.internalComms.deptPlanning,
      request: ui.internalComms.handoffPriorityUi,
    };
  }
  if (phaseId === "planner-plan") {
    return {
      nextDepartment: ui.internalComms.deptProduction,
      request: ui.internalComms.handoffProductionDefault,
    };
  }
  if (phaseId.startsWith("worker-")) {
    return {
      nextDepartment: ui.internalComms.deptQa,
      request: ui.internalComms.handoffWorkerToQa,
    };
  }
  if (phaseId === "quality-assurance") {
    return {
      nextDepartment: ui.internalComms.deptProduction,
      request: ui.internalComms.handoffQaToProductionRevise,
    };
  }
  if (phaseId === "ceo-approval") {
    return {
      nextDepartment: ui.internalComms.deptMarketing,
      request: ui.internalComms.handoffCeoToMarketing,
    };
  }
  return undefined;
}

function phaseAuthor(phaseId: string): MessageAuthor {
  if (phaseId.startsWith("worker-")) {
    const index = Number.parseInt(phaseId.replace("worker-", ""), 10) - 1;
    return workerAuthor(Number.isFinite(index) ? index : 0);
  }
  return PHASE_AUTHORS[phaseId] ?? PHASE_AUTHORS["planner-plan"]!;
}

/** Messages for in-progress workflow animation (completed phases only). */
export function buildInternalMessagesFromPhases(
  phases: WorkflowPhaseState[],
): InternalMessage[] {
  let stepIndex = 0;

  return phases
    .filter((phase) => phase.status === "completed")
    .map((phase) => {
      const message = createMessage(
        `phase-${phase.id}`,
        phaseAuthor(phase.id),
        phaseMessage(phase.id),
        phaseReason(phase.id),
        stepIndex * LOADING_STEP_INTERVAL_MS,
        phaseHandoff(phase.id),
      );
      stepIndex += 1;
      return message;
    });
}

/** Messages derived from a completed orchestration result. */
export function buildInternalMessagesFromResult(
  result: OrchestrationResult,
): InternalMessage[] {
  const messages: InternalMessage[] = [];
  let offsetMs = 0;
  const needsResearch = researchRequired(result);

  const push = (
    id: string,
    author: MessageAuthor,
    message: string,
    reason: string,
    durationMs = 0,
    handoff?: InternalHandoff,
  ) => {
    messages.push(
      createMessage(id, author, message, reason, offsetMs, handoff),
    );
    offsetMs += durationMs;
  };

  if (result.ceo) {
    push(
      "ceo",
      PHASE_AUTHORS.ceo!,
      ui.internalComms.ceoReceived,
      ui.internalComms.reasonCeoReceived,
      result.ceo.durationMs,
      {
        nextDepartment: needsResearch
          ? ui.internalComms.deptResearch
          : ui.internalComms.deptPlanning,
        request: needsResearch
          ? ui.internalComms.handoffCeoToResearch
          : ui.internalComms.handoffCeoToPlanning,
      },
    );
  }

  if (result.research) {
    const { research } = result;
    if (
      research.assessmentStatus === "completed" &&
      research.reportStatus === "completed" &&
      research.report
    ) {
      const hasCompetitor = research.assessment.categories.includes(
        "competitor_research",
      );
      push(
        "research",
        PHASE_AUTHORS.research!,
        hasCompetitor
          ? ui.internalComms.researchDone
          : ui.internalComms.researchDoneGeneric,
        deriveResearchReason(research),
        (research.assessmentPhase?.durationMs ?? 0) +
          (research.reportPhase?.durationMs ?? 0),
        {
          nextDepartment: ui.internalComms.deptPlanning,
          request: derivePlanningHandoffRequest(result.assignment, research),
        },
      );
    } else if (
      research.reportStatus === "failed" &&
      research.assessment.required
    ) {
      push(
        "research-failed",
        PHASE_AUTHORS.research!,
        ui.internalComms.researchFailed,
        research.reportError ?? ui.internalComms.reasonResearchFailed,
        research.reportPhase?.durationMs ?? research.assessmentPhase?.durationMs ?? 0,
        {
          nextDepartment: ui.internalComms.deptPlanning,
          request: ui.internalComms.handoffCeoToPlanning,
        },
      );
    } else if (
      research.reportStatus === "skipped" ||
      !research.assessment.required
    ) {
      push(
        "research-skipped",
        PHASE_AUTHORS.research!,
        ui.internalComms.researchSkipped,
        ui.internalComms.reasonResearchSkipped,
        research.assessmentPhase?.durationMs ?? 0,
        {
          nextDepartment: ui.internalComms.deptPlanning,
          request: ui.internalComms.handoffCeoToPlanning,
        },
      );
    }
  }

  if (result.plannerPlan) {
    push(
      "planner-plan",
      PHASE_AUTHORS["planner-plan"]!,
      ui.internalComms.plannerPlan,
      ui.internalComms.reasonPlannerPlan,
      result.plannerPlan.durationMs,
      {
        nextDepartment: ui.internalComms.deptProduction,
        request: deriveProductionHandoffRequest(result.tasks),
      },
    );
  }

  if (result.plannerTasks && result.tasks.length > 0 && !result.plannerPlan) {
    push(
      "planner-tasks",
      PHASE_AUTHORS["planner-tasks"]!,
      ui.internalComms.plannerTasksCount(result.tasks.length),
      ui.internalComms.reasonPlannerTasks,
      result.plannerTasks.durationMs,
      {
        nextDepartment: ui.internalComms.deptProduction,
        request: deriveProductionHandoffRequest(result.tasks),
      },
    );
  }

  for (const execution of [...result.executions].sort(
    (a, b) => a.task.id - b.task.id,
  )) {
    const assignee = resolveAssignedEmployee(execution.assignedEmployeeId);
    const workerAuthorResolved: MessageAuthor = {
      employeeId: assignee.id as EmployeeId,
      departmentId:
        findEmployeeById(assignee.id)?.department ?? "development",
    };

    if (execution.workerStatus === "completed") {
      push(
        `worker-${execution.task.id}`,
        workerAuthorResolved,
        ui.internalComms.workerDone,
        ui.internalComms.reasonWorker,
        execution.worker?.durationMs ?? 0,
        {
          nextDepartment: ui.internalComms.deptQa,
          request: ui.internalComms.handoffWorkerToQa,
        },
      );
    }

    if (execution.reviewerStatus === "completed") {
      push(
        `reviewer-${execution.task.id}`,
        PHASE_AUTHORS.reviewer!,
        execution.approved
          ? ui.internalComms.reviewerApproved
          : ui.internalComms.reviewerRevise,
        execution.approved
          ? ui.internalComms.reasonReviewerApproved
          : ui.internalComms.reasonReviewerRevise,
        execution.reviewer?.durationMs ?? 0,
        execution.approved
          ? undefined
          : {
              nextDepartment: ui.internalComms.deptProduction,
              request: ui.internalComms.handoffReviewerRevise,
            },
      );
    }
  }

  if (result.qualityLoop) {
    for (const review of result.qualityLoop.reviews) {
      if (review.qaStatus !== "completed") continue;

      const revisionPoints = review.tasksRevised.length;
      const passed = review.passed;

      push(
        `qa-${review.attempt}`,
        PHASE_AUTHORS["quality-assurance"]!,
        passed
          ? ui.internalComms.qaPassed
          : revisionPoints > 0
            ? ui.internalComms.qaRevise(revisionPoints)
            : ui.internalComms.qaImprove,
        deriveQaReason(review),
        review.qa?.durationMs ?? 0,
        passed
          ? {
              nextDepartment: ui.internalComms.deptCeo,
              request: ui.internalComms.handoffQaToCeo,
            }
          : {
              nextDepartment: ui.internalComms.deptProduction,
              request: ui.internalComms.handoffQaToProductionRevise,
            },
      );
    }

    const ceoApproval = result.qualityLoop.ceoApproval;
    if (ceoApproval?.status === "completed") {
      push(
        "ceo-approval",
        PHASE_AUTHORS["ceo-approval"]!,
        ceoApproval.approved
          ? ui.internalComms.ceoApproved
          : ui.internalComms.ceoRejected,
        ceoApproval.approved
          ? ui.internalComms.reasonCeoApproved
          : ui.internalComms.reasonCeoRejected,
        ceoApproval.ceo?.durationMs ?? 0,
        ceoApproval.approved
          ? {
              nextDepartment: ui.internalComms.deptMarketing,
              request: ui.internalComms.handoffCeoToMarketing,
            }
          : {
              nextDepartment: ui.internalComms.deptProduction,
              request: ui.internalComms.handoffCeoRevise,
            },
      );

      if (ceoApproval.approved) {
        push(
          "pr-review",
          {
            employeeId: "marketing-director",
            departmentId: "marketing",
          },
          ui.internalComms.prReviewDone,
          ui.internalComms.reasonPrReview,
          0,
          {
            nextDepartment: ui.internalComms.deptGrowthAnalytics,
            request: ui.internalComms.handoffPrToGrowth,
          },
        );

        push(
          "growth-review",
          {
            employeeId: "marketing-content-strategist",
            departmentId: "marketing",
          },
          ui.internalComms.growthReviewDone,
          ui.internalComms.reasonGrowthReview,
          0,
          {
            nextDepartment: ui.internalComms.deptCompanyLearning,
            request: ui.internalComms.handoffGrowthToLearning,
          },
        );

        push(
          "company-learning",
          {
            employeeId: "planning-lead-planner",
            departmentId: "planning",
          },
          ui.internalComms.companyLearningDone,
          ui.internalComms.reasonCompanyLearning,
          0,
          {
            nextDepartment: ui.internalComms.deptCeo,
            request: ui.internalComms.handoffLearningToReport,
          },
        );

        push(
          "company-report",
          {
            employeeId: "ceo-office-atlas-ceo",
            departmentId: "ceo-office",
          },
          ui.internalComms.companyReportDone,
          ui.internalComms.reasonCompanyReport,
          0,
          {
            nextDepartment: ui.actionEngine.sectionTitle,
            request: ui.internalComms.handoffReportToActions,
          },
        );

        push(
          "action-engine",
          {
            employeeId: "development-senior-dev",
            departmentId: "development",
          },
          ui.internalComms.actionEngineQueued,
          ui.internalComms.reasonActionEngine,
          0,
        );
      }
    }
  }

  if (result.finalResponse && result.status === "completed" && getDeliverablePreviewText(result.deliverable)) {
    push(
      "final",
      PHASE_AUTHORS["final-deliverable"]!,
      ui.internalComms.finalDone,
      ui.internalComms.reasonFinal,
      0,
    );
  }

  return messages;
}
