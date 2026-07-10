"use client";

import Link from "next/link";
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
import { cn } from "@/lib/design-system/cn";

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
  const transitions = item.result?.workflow.transitions ?? [];

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
    router.push(`/workspace?assignment=${encodeURIComponent(item.workRequest)}`);
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

        <div className="flex flex-wrap gap-2 border-t border-[var(--border-subtle)] px-5 py-4">
          <Button type="button" size="sm" onClick={handleRerun}>
            {ui.activityHistory.actions.rerun}
          </Button>
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
