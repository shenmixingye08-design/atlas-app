"use client";

import type { Project } from "@/lib/projects/types";
import type { StepStatus } from "@/lib/workspace/types";
import { ui } from "@/lib/i18n";

type TimelineItem = {
  id: string;
  label: string;
  subtitle: string;
  status: StepStatus;
};

function deriveTimeline(project: Project): TimelineItem[] {
  const items: TimelineItem[] = [
    {
      id: "request",
      label: ui.workflowPhases.workRequest,
      subtitle: "依頼受付",
      status: "completed",
    },
    {
      id: "ceo",
      label: ui.workflowPhases.ceo,
      subtitle: "リクエスト分析",
      status: "waiting",
    },
    {
      id: "planner-plan",
      label: ui.workflow.planning,
      subtitle: "実行計画作成",
      status: "waiting",
    },
    {
      id: "planner-tasks",
      label: ui.workflow.planning,
      subtitle: "タスク分解",
      status: "waiting",
    },
  ];

  if (project.status === "pending") {
    return items;
  }

  const result = project.result;

  if (result?.ceo) {
    items[1].status = "completed";
  } else if (project.status === "running") {
    items[1].status = "running";
    return items;
  }

  if (result?.plannerPlan) {
    items[2].status = "completed";
  } else if (project.status === "running") {
    items[2].status = "running";
    return items;
  }

  if (result?.plannerTasks) {
    items[3].status = "completed";
  } else if (project.status === "running") {
    items[3].status = "running";
    return items;
  }

  if (result?.executions) {
    for (const exec of result.executions) {
      items.push({
        id: `worker-${exec.task.id}`,
        label: ui.workflowPhases.worker(exec.task.id),
        subtitle: exec.task.title,
        status:
          exec.workerStatus === "completed"
            ? "completed"
            : exec.workerStatus === "failed"
              ? "error"
              : "waiting",
      });
    }

    items.push({
      id: "reviewer",
      label: ui.workflow.review,
      subtitle: "制作物を確認",
      status: result.executions.some((exec) => exec.reviewerStatus === "completed")
        ? "completed"
        : "waiting",
    });

    for (const exec of result.executions) {
      if (exec.reviewerStatus === "skipped") continue;

      items.push({
        id: `reviewer-${exec.task.id}`,
        label: `${ui.workflow.review} · ${exec.task.id}`,
        subtitle: exec.approved ? "承認" : "要修正",
        status:
          exec.reviewerStatus === "completed"
            ? exec.approved
              ? "completed"
              : "error"
            : exec.reviewerStatus === "failed"
              ? "error"
              : "waiting",
      });
    }
  }

  if (project.status === "running" && result && !result.executions.length) {
    items.push({
      id: "worker",
      label: ui.workflow.working,
      subtitle: "タスク実行中",
      status: "running",
    });
  }

  if (project.status === "review" || project.status === "completed") {
    items.push({
      id: "final",
      label: ui.workflowPhases.finalDeliverable,
      subtitle:
        project.status === "completed" ? ui.workflow.completed : ui.workflow.reviewActive,
      status: project.status === "completed" ? "completed" : "running",
    });
  }

  return items;
}

const DOT: Record<StepStatus, string> = {
  waiting: "bg-zinc-600",
  running: "bg-blue-400 animate-pulse",
  completed: "bg-green-400",
  error: "bg-red-400",
};

type WorkflowTimelineProps = {
  project: Project;
};

export function WorkflowTimeline({ project }: WorkflowTimelineProps) {
  const items = deriveTimeline(project);

  return (
    <div className="rounded-[var(--radius-2xl)] bg-white p-5 shadow-[var(--shadow-md)] sm:p-6">
      <h2 className="text-overline">{ui.workflowPhases.timeline}</h2>
      <ol className="mt-4 space-y-0">
        {items.map((item, index) => (
          <li key={item.id} className="relative flex gap-4 pb-6 last:pb-0">
            {index < items.length - 1 && (
              <div
                className={`absolute left-[7px] top-4 h-full w-px ${
                  item.status === "completed"
                    ? "bg-[var(--status-success)]/30"
                    : "bg-[var(--border)]"
                }`}
                aria-hidden="true"
              />
            )}
            <span
              className={`relative z-10 mt-1.5 h-3.5 w-3.5 shrink-0 rounded-full ring-2 ring-white ${DOT[item.status]}`}
            />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-foreground">{item.label}</p>
              <p className="text-caption">{item.subtitle}</p>
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}
