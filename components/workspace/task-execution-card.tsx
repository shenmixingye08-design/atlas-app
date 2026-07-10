"use client";

import type { TaskExecutionResult } from "@/lib/orchestration/types";
import { resolveAssignedEmployee } from "@/lib/employees/registry";
import type { StepStatus } from "@/lib/workspace/types";
import { ui } from "@/lib/i18n";

import { StageCard } from "./stage-card";

function toStageStatus(status: TaskExecutionResult["workerStatus"]): StepStatus {
  switch (status) {
    case "completed":
      return "completed";
    case "failed":
      return "error";
    default:
      return "waiting";
  }
}

type WorkerTaskCardProps = {
  execution: TaskExecutionResult;
  index: number;
};

export function WorkerTaskCard({ execution, index }: WorkerTaskCardProps) {
  const assignee = resolveAssignedEmployee(execution.assignedEmployeeId);
  const status = toStageStatus(execution.workerStatus);

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <span className="flex h-6 w-6 items-center justify-center rounded-md bg-[var(--accent-muted)] text-xs font-bold text-accent">
          {execution.task.id}
        </span>
        <h3 className="text-sm font-semibold text-foreground">
          {ui.workflowPhases.worker(execution.task.id)}: {execution.task.title}
        </h3>
        <span className="rounded-full bg-[var(--status-neutral-bg)] px-2 py-0.5 text-[10px] text-[var(--foreground-muted)]">
          {assignee.name}
        </span>
      </div>

      <StageCard
        label={ui.workflowPhases.worker(execution.task.id)}
        subtitle={`${assignee.name} · ${execution.task.title}`}
        status={status}
        output={execution.worker?.result.outputText}
        durationMs={execution.worker?.durationMs}
        errorMessage={execution.workerError}
        index={index}
      />
    </div>
  );
}

type ReviewerTaskCardProps = {
  execution: TaskExecutionResult;
  index: number;
};

export function ReviewerTaskCard({ execution, index }: ReviewerTaskCardProps) {
  const status: StepStatus =
    execution.reviewerStatus === "completed"
      ? "completed"
      : execution.reviewerStatus === "failed"
        ? "error"
        : execution.workerStatus === "failed"
          ? "waiting"
          : "waiting";

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <span className="flex h-6 w-6 items-center justify-center rounded-md bg-[var(--status-success-bg)] text-xs font-bold text-[var(--status-success)]">
          {execution.task.id}
        </span>
        <h3 className="text-sm font-semibold text-foreground">
          {ui.workflow.review} · {execution.task.id}
        </h3>
        {execution.reviewerStatus === "completed" &&
          (execution.approved ? (
            <span className="rounded-full bg-[var(--status-success-bg)] px-2 py-0.5 text-xs text-[var(--status-success)]">
              承認
            </span>
          ) : (
            <span className="rounded-full bg-[var(--status-warning-bg)] px-2 py-0.5 text-xs text-[var(--status-warning)]">
              要修正
            </span>
          ))}
      </div>

      <StageCard
        label={`${ui.workflow.review} · ${execution.task.id}`}
        subtitle={
          execution.workerStatus === "failed"
            ? "制作失敗のためスキップ"
            : "出力をレビュー"
        }
        status={status}
        output={execution.reviewer?.result.outputText}
        durationMs={execution.reviewer?.durationMs}
        errorMessage={execution.reviewerError}
        index={index}
      />
    </div>
  );
}
