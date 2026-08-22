"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import {
  formatDuration,
  saveActivityTemplate,
  setActivityMetadata,
  type ActivityHistoryItem,
} from "@/lib/activity-history";

function getMetadataKey(item: ActivityHistoryItem): string {
  if (item.projectId) return item.projectId;
  if (item.automationId) return `automation-${item.automationId}`;
  return item.id;
}
import { projectService } from "@/lib/projects/project-service";
import { createProject } from "@/lib/projects/domain";
import { ui } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { DelegationControl } from "@/components/work-loop/delegation-control";
import { ExecutionReceiptCard } from "@/components/work-loop/execution-receipt-card";
import { cn } from "@/lib/design-system/cn";
import { createAutomation } from "@/lib/automations/client";
import {
  buildHistoryRerunHref,
  planHistoryRerun,
} from "@/lib/value-moat/rerun";
import {
  ENTRUST_FROM_SUCCESS,
  buildExecutionReceipt,
  buildWorkCreateInput,
  classifyWorkKind,
  isAutomatableKind,
} from "@/lib/work-loop";

type ActivityHistoryDetailProps = {
  item: ActivityHistoryItem;
  onClose: () => void;
  onUpdated: () => void;
};

export function ActivityHistoryDetail({
  item,
  onClose,
  onUpdated,
}: ActivityHistoryDetailProps) {
  const router = useRouter();
  const transitions = useMemo(
    () => item.result?.workflow.transitions ?? [],
    [item.result?.workflow.transitions],
  );
  const [entrusting, setEntrusting] = useState(false);
  const [entrustError, setEntrustError] = useState<string | null>(null);
  const kind = classifyWorkKind({
    assignment: item.workRequest,
    title: item.title,
    deliverableType: item.deliverableType,
    services: item.services,
  });
  const canEntrust =
    item.status === "completed" && isAutomatableKind(kind) && !item.automationId;
  const receipt = useMemo(
    () =>
      buildExecutionReceipt({
        workName: item.title,
        executionId: item.id,
        completedAt: item.completedAt,
        steps: transitions.map((row) => `${row.from}→${row.to}`),
        artifact: item.result?.fileDeliverables?.[0]
          ? {
              id: item.result.fileDeliverables[0].id,
              fileName: item.result.fileDeliverables[0].fileName,
              format: item.result.fileDeliverables[0].format,
              createdAt: item.result.fileDeliverables[0].generatedAt,
              sizeBytes: item.result.fileDeliverables[0].sizeBytes,
              downloadable: Boolean(item.result.fileDeliverables[0].downloadUrl),
            }
          : item.deliverableType
            ? {
                id: item.id,
                fileName: item.title,
                format: item.deliverableType,
                downloadable: Boolean(item.deliverablePreview),
              }
            : null,
      }),
    [item, transitions],
  );

  async function handleEntrust() {
    setEntrusting(true);
    setEntrustError(null);
    try {
      const built = buildWorkCreateInput({
        job: {
          id: item.id,
          userId: "local",
          title: item.title,
          assignment: item.workRequest,
          completedAt: item.completedAt,
          status: "completed",
          deliverableFormat: item.deliverableType,
          services: item.services,
        },
        schedule: { frequency: "weekly", hour: 9, minute: 0 },
      });
      if (!built.ok) {
        setEntrustError(built.reason);
        return;
      }
      await createAutomation(built.createInput);
      onUpdated();
    } catch (caught) {
      setEntrustError(caught instanceof Error ? caught.message : "登録できませんでした");
    } finally {
      setEntrusting(false);
    }
  }

  function handleFavorite() {
    const key = getMetadataKey(item);
    setActivityMetadata(key, {
      favorite: !item.metadata.favorite,
    });
    onUpdated();
  }

  function handleDelete() {
    if (item.projectId) {
      const current = projectService.list();
      projectService.removeProject(item.projectId, current);
    }
    onUpdated();
    onClose();
  }

  function handleDuplicate() {
    const current = projectService.list();
    const duplicate = createProject({
      title: `${item.title}（複製）`,
      workRequest: item.workRequest,
    });
    projectService.saveAll([duplicate, ...current]);
    onUpdated();
  }

  function handleTemplate() {
    const template = saveActivityTemplate({
      title: item.title,
      workRequest: item.workRequest,
      category: item.category,
      sourceHistoryId: item.id,
    });
    if (item.projectId) {
      setActivityMetadata(item.projectId, { templateId: template.id });
    } else if (item.automationId) {
      setActivityMetadata(`automation-${item.automationId}`, { templateId: template.id });
    }
    onUpdated();
  }

  function handleRerun() {
    const plan = planHistoryRerun({
      previousJobId: item.id,
      workRequest: item.workRequest,
      title: item.title,
      format: item.deliverableType,
      status: item.status === "failed" ? "failed" : "completed",
    });
    router.push(buildHistoryRerunHref(plan));
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4">
      <div
        className={cn(
          "activity-history-detail flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-t-3xl bg-[var(--surface)] shadow-[var(--shadow-lg)] sm:rounded-3xl",
        )}
        role="dialog"
        aria-modal="true"
        aria-labelledby="activity-history-detail-title"
      >
        <div className="flex items-center justify-between border-b border-[var(--border-subtle)] px-5 py-4">
          <h2 id="activity-history-detail-title" className="text-lg font-semibold">
            {ui.activityHistory.detailTitle}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full px-3 py-1 text-sm text-[var(--text-secondary)] hover:bg-[var(--surface-muted)]"
          >
            {ui.actions.close}
          </button>
        </div>

        <div className="flex-1 space-y-6 overflow-y-auto px-5 py-5">
          <section>
            <p className="text-sm text-[var(--text-muted)]">
              {new Date(item.completedAt).toLocaleString("ja-JP")} ·{" "}
              {formatDuration(item.durationMs)}
            </p>
            <h3 className="mt-2 text-xl font-semibold">{item.title}</h3>
            <p className="mt-1 text-sm text-[var(--text-secondary)]">
              {item.categoryLabel} · {item.services.join(" · ")}
            </p>
          </section>

          <section className="space-y-2">
            <h4 className="text-sm font-semibold">{ui.activityHistory.inputContent}</h4>
            <p className="whitespace-pre-wrap rounded-xl bg-[var(--surface-muted)] p-4 text-sm leading-relaxed">
              {item.workRequest}
            </p>
          </section>

          {item.employees.length > 0 ? (
            <section className="space-y-2">
              <h4 className="text-sm font-semibold">{ui.activityHistory.employees}</h4>
              <p className="text-sm text-[var(--text-secondary)]">
                {item.employees.join("、")}
              </p>
            </section>
          ) : null}

          {transitions.length > 0 ? (
            <section className="space-y-2">
              <h4 className="text-sm font-semibold">{ui.activityHistory.executionLog}</h4>
              <ol className="space-y-2 border-l-2 border-[var(--border-subtle)] pl-4">
                {transitions.map((transition, index) => (
                  <li key={`${transition.at}-${index}`} className="text-sm">
                    <p className="font-medium text-foreground">
                      {transition.from} → {transition.to}
                    </p>
                    <p className="text-xs text-[var(--text-muted)]">
                      {new Date(transition.at).toLocaleString("ja-JP")}
                      {transition.reason ? ` · ${transition.reason}` : ""}
                    </p>
                  </li>
                ))}
              </ol>
            </section>
          ) : null}

          {item.deliverablePreview ? (
            <section className="space-y-2">
              <h4 className="text-sm font-semibold">{ui.activityHistory.deliverable}</h4>
              <p className="whitespace-pre-wrap rounded-xl bg-[var(--surface-muted)] p-4 text-sm leading-relaxed">
                {item.deliverablePreview}
              </p>
            </section>
          ) : null}

          <ExecutionReceiptCard receipt={receipt} />
          {item.automationId ? (
            <DelegationControl executionLevel="approve_then_run" />
          ) : null}

          <section className="space-y-2">
            <h4 className="text-sm font-semibold">{ui.activityHistory.memorySection}</h4>
            <p className="text-sm text-[var(--text-secondary)]">
              {item.metadata.memoryLearned
                ? ui.activityHistory.memoryLearned
                : ui.activityHistory.memoryNotLearned}
            </p>
            <Link href="/settings/memory" className="text-sm text-[var(--accent)] hover:underline">
              Memory設定を見る
            </Link>
          </section>
        </div>

        <div className="flex flex-wrap gap-2 border-t border-[var(--border-subtle)] px-5 py-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
          <Button
            type="button"
            size="sm"
            onClick={handleRerun}
            className="min-h-[var(--touch-target)]"
            data-testid="history-rerun"
          >
            {ui.activityHistory.actions.rerun}
          </Button>
          <Button
            type="button"
            size="sm"
            variant="secondary"
            onClick={handleRerun}
            className="min-h-[var(--touch-target)]"
            data-testid="history-rerun-same"
          >
            {ui.activityHistory.actions.rerunSame}
          </Button>
          {canEntrust ? (
            <Button
              type="button"
              size="sm"
              disabled={entrusting}
              onClick={() => void handleEntrust()}
              className="min-h-[var(--touch-target)]"
            >
              {ENTRUST_FROM_SUCCESS}
            </Button>
          ) : null}
          {entrustError ? (
            <p className="w-full text-sm text-[var(--danger)]">{entrustError}</p>
          ) : null}
          <Button type="button" size="sm" variant="secondary" onClick={handleTemplate}>
            {ui.activityHistory.actions.template}
          </Button>
          <Button type="button" size="sm" variant="secondary" onClick={handleDuplicate}>
            {ui.activityHistory.actions.duplicate}
          </Button>
          {item.projectId ? (
            <>
              <Button type="button" size="sm" variant="ghost" onClick={handleFavorite}>
                {item.metadata.favorite
                  ? ui.activityHistory.actions.unfavorite
                  : ui.activityHistory.actions.favorite}
              </Button>
              <Button type="button" size="sm" variant="ghost" onClick={handleDelete}>
                {ui.activityHistory.actions.delete}
              </Button>
            </>
          ) : (
            <Button type="button" size="sm" variant="ghost" onClick={handleFavorite}>
              {item.metadata.favorite
                ? ui.activityHistory.actions.unfavorite
                : ui.activityHistory.actions.favorite}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
