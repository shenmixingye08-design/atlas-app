"use client";

import type { OrchestrationResult } from "@/lib/orchestration/types";
import { ui } from "@/lib/i18n";
import { Card } from "@/components/ui/card";
import { ErrorState } from "@/components/ui/error-state";

import { QualityLoopPanel } from "./quality-loop-panel";
import { ResearchPanel } from "./research-panel";
import { ReviewerTaskCard, WorkerTaskCard } from "./task-execution-card";
import { StageCard } from "./stage-card";

type WorkflowResultsDetailProps = {
  result: OrchestrationResult;
  error: string | null;
};

export function WorkflowResultsDetail({
  result,
  error,
}: WorkflowResultsDetailProps) {
  const sortedExecutions = [...result.executions].sort(
    (a, b) => a.task.id - b.task.id,
  );

  return (
    <div className="space-y-8">
      <section className="space-y-4">
        {result.ceo ? (
          <StageCard
            label={ui.workflowPhases.ceo}
            subtitle="リクエストを分析"
            status="completed"
            output={result.ceo.result.outputText}
            durationMs={result.ceo.durationMs}
          />
        ) : (
          <StageCard
            label={ui.workflowPhases.ceo}
            subtitle="リクエストを分析"
            status="error"
            errorMessage={error ?? "分析に失敗しました"}
          />
        )}
      </section>

      {result.research?.reportStatus === "completed" && result.research.report && (
        <ResearchPanel research={result.research} />
      )}

      {result.plannerPlan && (
        <StageCard
          label={ui.workflow.planning}
          subtitle="実行計画を作成"
          status="completed"
          output={result.plannerPlan.result.outputText}
          durationMs={result.plannerPlan.durationMs}
        />
      )}

      {result.plannerTasks && (
        <>
          <StageCard
            label={ui.workflow.planning}
            subtitle="タスクに分解"
            status="completed"
            output={result.plannerTasks.result.outputText}
            durationMs={result.plannerTasks.durationMs}
          />
          {result.tasks.length > 0 && (
            <Card padding="sm">
              <ul className="space-y-2">
                {result.tasks.map((task) => (
                  <li key={task.id} className="text-sm text-[var(--foreground-muted)]">
                    {task.title}
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </>
      )}

      {sortedExecutions.map((execution, index) => (
        <WorkerTaskCard
          key={`worker-${execution.task.id}`}
          execution={execution}
          index={index}
        />
      ))}

      {sortedExecutions.map((execution, index) => (
        <ReviewerTaskCard
          key={`reviewer-${execution.task.id}`}
          execution={execution}
          index={index}
        />
      ))}

      {result.qualityLoop && (
        <QualityLoopPanel qualityLoop={result.qualityLoop} />
      )}

      {result.status === "failed" && error && <ErrorState message={error} />}
    </div>
  );
}
