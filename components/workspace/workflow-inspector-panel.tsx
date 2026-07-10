"use client";

import { useMemo, useState, type ReactNode } from "react";

import { shouldShowWorkflowInspector } from "@/lib/debug/atlas-debug";
import type { OrchestrationResult } from "@/lib/orchestration/types";
import {
  buildWorkflowInspectorReport,
  formatContentSignal,
  formatInspectorCost,
  formatInspectorDuration,
  inspectorStageStatusLabel,
  type WorkflowInspectorReport,
} from "@/lib/orchestration/workflow-inspector";
import { cn } from "@/lib/design-system/cn";
import { Card } from "@/components/ui/card";

type WorkflowInspectorPanelProps = {
  result: OrchestrationResult | null;
};

function InspectorTable({
  headers,
  rows,
}: {
  headers: string[];
  rows: (string | number | null | undefined)[][];
}) {
  return (
    <div className="table-scroll overflow-x-auto rounded-[var(--radius-lg)] border border-[var(--border-subtle)]">
      <table className="w-full min-w-[640px] border-collapse text-left text-xs">
        <thead>
          <tr className="border-b border-[var(--border-subtle)] bg-[var(--background-muted)]/60">
            {headers.map((header) => (
              <th
                key={header}
                className="px-3 py-2 font-medium text-[var(--foreground-muted)]"
              >
                {header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr
              key={`row-${index}`}
              className="border-b border-[var(--border-subtle)] last:border-b-0"
            >
              {row.map((cell, cellIndex) => (
                <td
                  key={`cell-${index}-${cellIndex}`}
                  className="px-3 py-2 align-top text-foreground"
                >
                  {cell ?? "—"}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function SectionBlock({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="space-y-2">
      <h4 className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--foreground-muted)]">
        {title}
      </h4>
      {children}
    </section>
  );
}

function SummaryGrid({ report }: { report: WorkflowInspectorReport }) {
  const { summary } = report;
  const items = [
    ["Workflow ID", summary.workflowId],
    ["Status", `${summary.legacyStatus} / ${summary.finalState}`],
    ["Started", summary.startedAt ?? "—"],
    ["Completed", summary.completedAt ?? "—"],
    ["Duration", formatInspectorDuration(summary.totalDurationMs)],
    ["Deliverable", summary.deliverableType ?? "—"],
    ["Title", summary.deliverableTitle ?? "—"],
  ];

  return (
    <dl className="grid gap-2 sm:grid-cols-2">
      {items.map(([label, value]) => (
        <div
          key={label}
          className="rounded-[var(--radius-md)] bg-[var(--background-muted)]/50 px-3 py-2"
        >
          <dt className="text-[10px] uppercase tracking-wide text-[var(--foreground-muted)]">
            {label}
          </dt>
          <dd className="mt-0.5 break-all font-mono text-xs text-foreground">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

function InspectorBody({ report }: { report: WorkflowInspectorReport }) {
  return (
    <div className="space-y-6 pt-4">
      <SectionBlock title="Workflow Summary">
        <SummaryGrid report={report} />
      </SectionBlock>

      <SectionBlock title="Stage Timeline">
        <InspectorTable
          headers={["Stage", "Status", "Duration", "Input", "Output", "Error"]}
          rows={report.stages.map((stage) => [
            stage.label,
            inspectorStageStatusLabel(stage.status),
            formatInspectorDuration(stage.durationMs),
            formatContentSignal(stage.input),
            formatContentSignal(stage.output),
            stage.error ?? "",
          ])}
        />
      </SectionBlock>

      {report.aiCalls.length > 0 && (
        <SectionBlock title="AI Usage">
          <InspectorTable
            headers={[
              "Dept",
              "Task",
              "Model",
              "In",
              "Out",
              "Cost",
              "Cache",
              "Policy",
            ]}
            rows={report.aiCalls.map((call) => [
              call.department,
              call.taskType,
              call.model,
              call.estimatedInputTokens,
              call.estimatedOutputTokens,
              formatInspectorCost(call.estimatedCostUsd),
              call.cache,
              `${call.policyModel} (${call.policyReasoningLevel})`,
            ])}
          />
        </SectionBlock>
      )}

      {report.cost && (
        <SectionBlock title="Cost Summary">
          <InspectorTable
            headers={["Metric", "Value"]}
            rows={[
              ["LLM calls", report.cost.totalLlmCalls],
              ["Input tokens (est.)", report.cost.totalEstimatedInputTokens],
              ["Output tokens (est.)", report.cost.totalEstimatedOutputTokens],
              ["Cost (est.)", formatInspectorCost(report.cost.totalEstimatedCostUsd)],
              ["Most expensive stage", report.cost.mostExpensiveStage ?? "—"],
              ["Cache hits", report.cost.cacheHits],
              ["Cache misses", report.cost.cacheMisses],
            ]}
          />
        </SectionBlock>
      )}

      <SectionBlock title="Deliverable Integrity">
        <InspectorTable
          headers={["Check", "Result"]}
          rows={[
            ["Exists", report.deliverableIntegrity.deliverableExists ? "yes" : "no"],
            ["Type", report.deliverableIntegrity.type ?? "—"],
            ["Title", report.deliverableIntegrity.titleExists ? "yes" : "no"],
            ["Markdown", report.deliverableIntegrity.markdownExists ? "yes" : "no"],
            ["Plain text", report.deliverableIntegrity.plainTextExists ? "yes" : "no"],
            ["Metadata", report.deliverableIntegrity.metadataExists ? "yes" : "no"],
            ["Downloads ready", report.deliverableIntegrity.downloadsReady ? "yes" : "no"],
            [
              "Validation",
              report.deliverableIntegrity.validationValid
                ? "valid"
                : report.deliverableIntegrity.validationIssues.join(", ") || "invalid",
            ],
            [
              "Worker raw output",
              report.deliverableIntegrity.workerRawOutputExists ? "yes" : "no",
            ],
            [
              "Parsed type",
              report.deliverableIntegrity.parsedDeliverableType ?? "—",
            ],
            [
              "Email subject",
              report.deliverableIntegrity.emailSubjectDetected ?? "—",
            ],
          ]}
        />
      </SectionBlock>

      {report.failure && (
        <SectionBlock title="Failure Diagnostics">
          <InspectorTable
            headers={["Field", "Value"]}
            rows={[
              ["Failed stage", report.failure.failedStage ?? "—"],
              ["Reason", report.failure.reason ?? "—"],
              ["Timed out", report.failure.timedOut ? "yes" : "no"],
              ["Recommended fix", report.failure.recommendedFix ?? "—"],
              ...(report.failure.rawError
                ? [["Raw error", report.failure.rawError] as [string, string]]
                : []),
            ]}
          />
        </SectionBlock>
      )}

      {report.isolation && (
        <SectionBlock title="Cache & Knowledge Isolation">
          <InspectorTable
            headers={["Field", "Value"]}
            rows={[
              ["Cache key", report.isolation.cacheKey],
              ["Assignment hash", report.isolation.assignmentHash],
              ["Deliverable type", report.isolation.deliverableType],
              ["Workflow version", report.isolation.workflowVersion],
              ["Policy version", report.isolation.policyVersion],
              [
                "Cache replay",
                `planner=${report.isolation.cacheReplay.planner ? "hit" : "miss"}, worker=${report.isolation.cacheReplay.worker ? "hit" : "miss"}, research=${report.isolation.cacheReplay.research ? "hit" : "miss"}`,
              ],
              ["Knowledge retrieved", report.isolation.knowledgeRetrieved],
              ["Knowledge filtered (included)", report.isolation.knowledgeFiltered],
              ["Knowledge discarded", report.isolation.knowledgeDiscarded],
            ]}
          />
          {report.isolation.pipeline && (
            <InspectorTable
              headers={["Pipeline field", "Value"]}
              rows={[
                ["plannerExecuted", report.isolation.pipeline.plannerExecuted ? "true" : "false"],
                ["workerExecuted", report.isolation.pipeline.workerExecuted ? "true" : "false"],
                [
                  "workerOutputExists",
                  report.isolation.pipeline.workerOutputExists ? "true" : "false",
                ],
                [
                  "deliverableBuilderInputSource",
                  report.isolation.pipeline.deliverableBuilderInputSource,
                ],
                ["needsReviewReason", report.isolation.pipeline.needsReviewReason ?? "—"],
                ["failedStage", report.isolation.pipeline.failedStage ?? "—"],
              ]}
            />
          )}
          {report.isolation.knowledgeDecisions.length > 0 && (
            <InspectorTable
              headers={[
                "Title",
                "Category",
                "Type",
                "Score",
                "Included",
                "Target",
                "Reason",
              ]}
              rows={report.isolation.knowledgeDecisions.map((d) => [
                d.title,
                d.category,
                d.entryType ?? "—",
                d.relevanceScore.toFixed(2),
                d.included ? "yes" : "no",
                d.target,
                d.reason,
              ])}
            />
          )}
        </SectionBlock>
      )}
    </div>
  );
}

/** Developer-only workflow inspector — hidden unless debug flags are enabled. */
export function WorkflowInspectorPanel({ result }: WorkflowInspectorPanelProps) {
  const [expanded, setExpanded] = useState(false);

  const visible = shouldShowWorkflowInspector(result);
  const report = useMemo(
    () => (result && visible ? buildWorkflowInspectorReport(result) : null),
    [result, visible],
  );

  if (!visible || !result || !report) {
    return null;
  }

  return (
    <Card
      padding="lg"
      className="border border-dashed border-[var(--border-subtle)] bg-[var(--background-subtle)]/40"
    >
      <button
        type="button"
        onClick={() => setExpanded((prev) => !prev)}
        className={cn(
          "flex w-full items-center justify-between gap-3 text-left",
          "focus-ring rounded-[var(--radius-md)]",
        )}
        aria-expanded={expanded}
      >
        <div>
          <p className="text-sm font-semibold text-foreground">開発用インスペクター</p>
          <p className="mt-0.5 text-caption text-[var(--foreground-muted)]">
            {report.summary.workflowId.slice(0, 8)} · {report.summary.finalState} ·{" "}
            {formatInspectorDuration(report.summary.totalDurationMs)}
          </p>
        </div>
        <span className="text-caption text-[var(--foreground-muted)]">
          {expanded ? "閉じる" : "開く"}
        </span>
      </button>

      {expanded && <InspectorBody report={report} />}
    </Card>
  );
}
