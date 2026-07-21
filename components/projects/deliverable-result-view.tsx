"use client";

import type { Project } from "@/lib/projects/types";
import { formatProjectDate, formatRelativeDate } from "@/lib/projects/utils";
import { useDeliverableFiles } from "@/lib/workspace/use-deliverable-files";
import { ui } from "@/lib/i18n";

import { ActionEnginePanel } from "@/components/workspace/action-engine-panel";
import { CompanyLearningPanel } from "@/components/workspace/company-learning-panel";
import { CompanyOperationsPanel } from "@/components/workspace/company-operations-panel";
import { FinalOutput } from "@/components/workspace/final-output";
import { GrowthReviewPanel } from "@/components/workspace/growth-review-panel";
import { PrReviewPanel } from "@/components/workspace/pr-review-panel";
import { WorkflowInspectorPanel } from "@/components/workspace/workflow-inspector-panel";
import { WorkflowResults } from "@/components/workspace/workflow-results";
import { Card } from "@/components/ui/card";

import { EmployeeBadges } from "./employee-badges";
import { ProgressBar } from "./progress-bar";
import { WorkflowTimeline } from "./workflow-timeline";

type DeliverableResultViewProps = {
  project: Project;
};

/**
 * Read-only render of a project's 成果物 (deliverable) and workflow.
 *
 * Shared by the authenticated project detail page and the dev deep-link
 * preview so the exact page reached by 「結果を見る」 is provably able to render
 * a real result. Requires `project.result` to be present.
 */
export function DeliverableResultView({ project }: DeliverableResultViewProps) {
  const { deliverables, deliverablesError, isGeneratingDeliverables } =
    useDeliverableFiles(project.result ?? null);

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap gap-4 text-caption">
        <span>
          {ui.project.created}: {formatProjectDate(project.createdAt)}
        </span>
        <span>
          {ui.project.updated}: {formatRelativeDate(project.updatedAt)}
        </span>
      </div>

      <ProgressBar progress={project.progress} />
      <EmployeeBadges employees={project.assignedEmployees} />

      <Card padding="md">
        <h2 className="text-overline mb-3">{ui.project.workRequest}</h2>
        <p className="text-sm leading-relaxed text-[var(--foreground-muted)]">
          {project.workRequest}
        </p>
      </Card>

      <WorkflowTimeline project={project} />

      {project.result && (
        <>
          <FinalOutput
            result={project.result}
            isLoading={false}
            deliverables={deliverables}
            isGeneratingDeliverables={isGeneratingDeliverables}
            deliverablesError={deliverablesError}
          />
          <WorkflowResults
            result={project.result}
            loadingPhases={[]}
            isLoading={false}
            error={project.error ?? null}
          />
          <PrReviewPanel
            result={project.result}
            showGrowthReview={false}
            showCompanyLearning={false}
          />
          <GrowthReviewPanel result={project.result} />
          <CompanyLearningPanel result={project.result} />
          <CompanyOperationsPanel result={project.result} />
          <ActionEnginePanel result={project.result} />
          <WorkflowInspectorPanel result={project.result} />
        </>
      )}
    </div>
  );
}
