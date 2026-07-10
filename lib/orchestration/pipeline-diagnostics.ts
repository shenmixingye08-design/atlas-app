import type { OrchestrationResult } from "./types";
import { deliverableHasContent } from "./deliverable-types";
import type { DeliverableValidationResult } from "./deliverable-validation";

export type PipelineStageId =
  | "ceo"
  | "research"
  | "planner"
  | "worker"
  | "deliverable_builder"
  | "reviewer"
  | "qa"
  | "approval"
  | "workspace"
  | "final_output";

export type PipelineStageStatus = "ok" | "warning" | "failed" | "skipped";

export type PipelineStageReport = {
  id: PipelineStageId;
  label: string;
  status: PipelineStageStatus;
  detail?: string;
};

export type PipelineDiagnosticsReport = {
  stages: PipelineStageReport[];
  failureStage: PipelineStageId | null;
  deliverableReady: boolean;
  approved: boolean;
};

const STAGE_LABELS: Record<PipelineStageId, string> = {
  ceo: "CEO",
  research: "Research",
  planner: "Planner",
  worker: "Worker",
  deliverable_builder: "Deliverable Builder",
  reviewer: "Reviewer",
  qa: "QA",
  approval: "Approval",
  workspace: "Workspace",
  final_output: "FinalOutput",
};

function stage(
  id: PipelineStageId,
  status: PipelineStageStatus,
  detail?: string,
): PipelineStageReport {
  return { id, label: STAGE_LABELS[id], status, detail };
}

export type BuildPipelineDiagnosticsInput = {
  result: OrchestrationResult;
  deliverableValidation?: DeliverableValidationResult;
  deliverableRecovered?: boolean;
};

/** Dev-only pipeline report showing exactly where failure occurs. */
export function buildPipelineDiagnostics(
  input: BuildPipelineDiagnosticsInput,
): PipelineDiagnosticsReport {
  const { result, deliverableValidation, deliverableRecovered } = input;
  const stages: PipelineStageReport[] = [];

  stages.push(
    stage(
      "ceo",
      result.ceo?.result.status === "completed" ? "ok" : result.ceo ? "failed" : "skipped",
      result.ceo ? undefined : "CEO phase missing",
    ),
  );

  const researchFailed =
    result.research?.assessmentStatus === "failed" ||
    result.research?.reportStatus === "failed";
  stages.push(
    stage(
      "research",
      !result.research
        ? "skipped"
        : researchFailed
          ? "warning"
          : "ok",
      researchFailed
        ? result.research?.assessmentError ?? result.research?.reportError
        : undefined,
    ),
  );

  stages.push(
    stage(
      "planner",
      result.plannerPlan?.result.status === "completed" && result.tasks.length > 0
        ? "ok"
        : "failed",
      result.tasks.length === 0 ? "No tasks parsed from planner" : undefined,
    ),
  );

  const workerCompleted = result.executions.some(
    (exec) => exec.workerStatus === "completed" && exec.worker?.result.outputText.trim(),
  );
  stages.push(
    stage(
      "worker",
      workerCompleted ? "ok" : "failed",
      workerCompleted ? undefined : "Worker returned no output",
    ),
  );

  const hasDeliverable = deliverableHasContent(result.deliverable);
  stages.push(
    stage(
      "deliverable_builder",
      hasDeliverable
        ? deliverableRecovered
          ? "warning"
          : "ok"
        : "failed",
      deliverableRecovered
        ? "Recovered deliverable from worker output"
        : hasDeliverable
          ? undefined
          : deliverableValidation?.issues.map((i) => i.field).join(", ") ||
            "Deliverable empty after build",
    ),
  );

  const reviewerDone = result.executions.every(
    (exec) => exec.reviewerStatus === "completed" || exec.reviewerStatus === "skipped",
  );
  stages.push(
    stage("reviewer", reviewerDone ? "ok" : "failed"),
  );

  const qaPassed = result.qualityLoop?.passed ?? false;
  stages.push(
    stage(
      "qa",
      qaPassed ? "ok" : hasDeliverable ? "warning" : "failed",
      result.qualityLoop?.reviews.at(-1)?.feedback?.slice(0, 120),
    ),
  );

  const ceoApproved = result.qualityLoop?.ceoApproval?.approved ?? false;
  stages.push(
    stage(
      "approval",
      result.approved && ceoApproved && hasDeliverable
        ? "ok"
        : hasDeliverable
          ? "warning"
          : "failed",
      !hasDeliverable
        ? "要確認 — deliverable missing"
        : !result.approved
          ? "要確認 — not approved for release"
          : undefined,
    ),
  );

  stages.push(
    stage(
      "workspace",
      hasDeliverable && result.deliverable.metadata ? "ok" : "failed",
      !result.deliverable.metadata ? "Workspace metadata missing" : undefined,
    ),
  );

  stages.push(
    stage(
      "final_output",
      hasDeliverable ? "ok" : "failed",
      hasDeliverable ? undefined : "Final output has no deliverable content",
    ),
  );

  const failureStage =
    stages.find((item) => item.status === "failed")?.id ??
    stages.find((item) => item.status === "warning")?.id ??
    null;

  return {
    stages,
    failureStage,
    deliverableReady: hasDeliverable && (deliverableValidation?.valid ?? true),
    approved: result.approved && hasDeliverable,
  };
}

export function formatPipelineDiagnosticsReport(report: PipelineDiagnosticsReport): string {
  const lines = report.stages.map((item) => {
    const icon =
      item.status === "ok" ? "✓" : item.status === "warning" ? "!" : item.status === "skipped" ? "-" : "✗";
    const detail = item.detail ? ` — ${item.detail}` : "";
    return `${icon} ${item.label}${detail}`;
  });

  if (report.failureStage) {
    lines.push("", `Failure point: ${STAGE_LABELS[report.failureStage]}`);
  }

  return lines.join("\n");
}

export function logPipelineDiagnostics(report: PipelineDiagnosticsReport): void {
  if (process.env.NODE_ENV === "production") return;
  console.info("[ATLAS Pipeline Diagnostics]\n" + formatPipelineDiagnosticsReport(report));
}
