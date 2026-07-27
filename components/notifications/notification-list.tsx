"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

import {
  deleteNotification,
  fetchNotifications,
  markAllNotificationsRead,
  markNotificationRead,
} from "@/lib/notifications/client";
import {
  notifyNotificationsChanged,
  subscribeNotificationsChanged,
} from "@/lib/notifications/refresh-events";
import type { NotificationRecord } from "@/lib/notifications/types";
import {
  NOTICE_CATEGORY_LABELS,
  NOTICE_PRIORITY_LABELS,
  extractJobName,
  formatNoticeDateTime,
  formatNoticeMessage,
  formatNoticeTitle,
  getNoticeActionLabel,
  matchesNoticeFilter,
  resolveNoticeActionUrl,
  resolveNoticeCategory,
  resolveNoticePriority,
  type NoticeFilter,
} from "@/lib/notifications/display";
import {
  failureClassLabel,
} from "@/lib/reliability/error-classification";
import { jobStateLabel } from "@/lib/notifications/job-progress";
import { ui } from "@/lib/i18n";
import { cn } from "@/lib/design-system/cn";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

const FILTERS: { id: NoticeFilter; label: string }[] = [
  { id: "all", label: ui.notifications.filterAll },
  { id: "error", label: ui.notifications.filterImportant ?? "重要" },
  { id: "needs_review", label: ui.notifications.filterNeedsReview },
  { id: "completed", label: ui.notifications.filterCompleted },
];

type NotificationListProps = {
  compact?: boolean;
  limit?: number;
  onUpdate?: () => void;
  onNavigate?: () => void;
  /**
   * Fixture notifications. When provided, the list renders these directly and
   * skips fetching / mutations — used by the DEV panel preview to prove layout
   * (mobile fit) with the real card component when auth blocks production E2E.
   */
  items?: NotificationRecord[];
};

function formatEta(seconds: number | null | undefined): string | null {
  if (seconds == null || seconds <= 0) return null;
  if (seconds < 60) return `約${seconds}秒`;
  return `約${Math.ceil(seconds / 60)}分`;
}

async function resumeBackgroundJobs(): Promise<void> {
  try {
    await fetch("/api/work/jobs/recover", { method: "POST" });
  } catch {
    // Best-effort recovery on focus — never block the UI.
  }
}

function NoticeCard({
  item,
  compact,
  onMarkRead,
  onDelete,
  onNavigate,
  onRetried,
}: {
  item: NotificationRecord;
  compact?: boolean;
  onMarkRead: (id: string) => void;
  onDelete: (id: string) => void;
  onNavigate?: () => void;
  onRetried?: () => void;
}) {
  const category = resolveNoticeCategory(item);
  const priority = resolveNoticePriority(item, category);
  const title = formatNoticeTitle(item, category);
  const message = formatNoticeMessage(item, category);
  const jobName = extractJobName(item);
  const actionUrl = resolveNoticeActionUrl(item);
  const progress = item.jobProgress;
  const [retrying, setRetrying] = useState(false);
  const [copied, setCopied] = useState(false);

  const supportHref = useMemo(() => {
    const params = new URLSearchParams();
    params.set("topic", "work_error");
    if (progress?.supportContextId) {
      params.set("context", progress.supportContextId);
    } else if (item.requestId) {
      params.set("context", item.requestId);
    }
    if (jobName) params.set("job", jobName);
    if (progress?.failureReason) params.set("reason", progress.failureReason);
    return `/contact?${params.toString()}`;
  }, [progress, item.requestId, jobName]);

  const handleRetry = async () => {
    const jobId = item.requestId;
    if (!jobId) {
      window.location.href = "/";
      return;
    }
    setRetrying(true);
    try {
      const res = await fetch(
        `/api/work/jobs/${encodeURIComponent(jobId)}/retry`,
        { method: "POST" },
      );
      if (!res.ok) {
        // Fallback: open home for a fresh request.
        window.location.href = "/";
        return;
      }
      onRetried?.();
    } finally {
      setRetrying(false);
    }
  };

  const handleCopy = async () => {
    const text =
      progress?.resultActions?.copyText ||
      item.message ||
      title;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // ignore
    }
  };

  const handleShare = async () => {
    const url =
      progress?.resultActions?.shareUrl ||
      actionUrl ||
      window.location.origin;
    const absolute =
      url.startsWith("http") ? url : `${window.location.origin}${url}`;
    if (navigator.share) {
      try {
        await navigator.share({ title, url: absolute });
        return;
      } catch {
        // fall through to clipboard
      }
    }
    try {
      await navigator.clipboard.writeText(absolute);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // ignore
    }
  };

  return (
    <li>
      <Card
        padding={compact ? "md" : "lg"}
        className={cn(
          "border transition-colors",
          item.isRead
            ? "border-[var(--border-subtle)] bg-[var(--card)]"
            : "border-accent/20 bg-[var(--accent-muted)]/30",
        )}
      >
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-full bg-[var(--surface-muted)] px-2.5 py-1 text-[11px] font-medium text-[var(--text-secondary)]">
            {NOTICE_CATEGORY_LABELS[category]}
          </span>
          {priority !== "normal" && (
            <span
              className={cn(
                "rounded-full px-2.5 py-1 text-[11px] font-medium",
                priority === "urgent"
                  ? "bg-[var(--error-bg)] text-[var(--error)]"
                  : "bg-[var(--warning-bg)] text-[var(--warning)]",
              )}
            >
              {NOTICE_PRIORITY_LABELS[priority]}
            </span>
          )}
          {!item.isRead && (
            <span className="rounded-full bg-accent/15 px-2 py-0.5 text-[10px] font-medium text-accent">
              {ui.notifications.unread}
            </span>
          )}
          {progress?.retrying ? (
            <span className="rounded-full bg-[var(--warning-bg)] px-2.5 py-1 text-[11px] font-medium text-[var(--warning)]">
              {ui.notifications.retrying}
            </span>
          ) : null}
          <span className="text-[11px] text-[var(--text-muted)]">
            {formatNoticeDateTime(item.createdAt)}
          </span>
        </div>

        <p className="mt-3 text-sm font-semibold text-foreground">{title}</p>
        <p className="mt-1 whitespace-pre-line text-sm leading-relaxed text-[var(--text-secondary)]">
          {compact && message.length > 120 ? `${message.slice(0, 120)}…` : message}
        </p>

        {!compact && (
          <dl className="mt-3 grid gap-1.5 text-xs text-[var(--text-muted)] sm:grid-cols-2">
            {(jobName || progress?.jobName) && (
              <div>
                <dt className="inline text-[var(--text-secondary)]">
                  {ui.notifications.jobNameLabel}：
                </dt>
                <dd className="inline text-foreground">
                  {progress?.jobName || jobName}
                </dd>
              </div>
            )}
            {progress?.jobState && (
              <div>
                <dt className="inline text-[var(--text-secondary)]">
                  {ui.notifications.stateLabel}：
                </dt>
                <dd className="inline text-foreground">
                  {jobStateLabel(progress.jobState)}
                </dd>
              </div>
            )}
            {progress?.startedAt && (
              <div>
                <dt className="inline text-[var(--text-secondary)]">
                  {ui.notifications.startedAtLabel}：
                </dt>
                <dd className="inline text-foreground">
                  {formatNoticeDateTime(progress.startedAt)}
                </dd>
              </div>
            )}
            {progress?.endedAt && (
              <div>
                <dt className="inline text-[var(--text-secondary)]">
                  {ui.notifications.endedAtLabel}：
                </dt>
                <dd className="inline text-foreground">
                  {formatNoticeDateTime(progress.endedAt)}
                </dd>
              </div>
            )}
            {progress?.failureReason && (
              <div className="sm:col-span-2">
                <dt className="inline text-[var(--text-secondary)]">
                  {ui.notifications.errorReasonLabel}：
                </dt>
                <dd className="inline text-foreground">
                  {progress.failureReason}
                  {progress.failureClass
                    ? `（${failureClassLabel(progress.failureClass)}）`
                    : ""}
                </dd>
              </div>
            )}
            {progress?.retryCount != null && progress.maxRetries != null && (
              <div>
                <dt className="inline text-[var(--text-secondary)]">
                  {ui.notifications.retryCountLabel}：
                </dt>
                <dd className="inline text-foreground">
                  {progress.retryCount} / {progress.maxRetries}
                </dd>
              </div>
            )}
            {formatEta(progress?.etaSeconds) && (
              <div>
                <dt className="inline text-[var(--text-secondary)]">
                  {ui.notifications.etaLabel}：
                </dt>
                <dd className="inline text-foreground">
                  {formatEta(progress?.etaSeconds)}
                </dd>
              </div>
            )}
          </dl>
        )}

        <div className="mt-4 flex flex-wrap gap-2">
          {actionUrl && (
            <Link
              href={actionUrl}
              onClick={() => {
                if (!item.isRead) onMarkRead(item.notificationId);
                onNavigate?.();
              }}
            >
              <Button variant="primary" size="sm" className="min-h-[44px]">
                {category === "completed"
                  ? ui.notifications.previewAction
                  : getNoticeActionLabel(category)}
              </Button>
            </Link>
          )}

          {category === "completed" && (
            <>
              {(progress?.resultActions?.downloadUrl || actionUrl) && (
                <Link
                  href={progress?.resultActions?.downloadUrl || actionUrl || "/"}
                  onClick={() => {
                    if (!item.isRead) onMarkRead(item.notificationId);
                  }}
                >
                  <Button variant="secondary" size="sm" className="min-h-[44px]">
                    {ui.notifications.downloadAction}
                  </Button>
                </Link>
              )}
              <Button
                variant="secondary"
                size="sm"
                className="min-h-[44px]"
                onClick={() => void handleShare()}
              >
                {ui.notifications.shareAction}
              </Button>
              <Button
                variant="secondary"
                size="sm"
                className="min-h-[44px]"
                onClick={() => void handleCopy()}
              >
                {copied
                  ? ui.notifications.copiedAction
                  : ui.notifications.copyAction}
              </Button>
              <Link href={progress?.resultActions?.reeditUrl || "/"}>
                <Button variant="secondary" size="sm" className="min-h-[44px]">
                  {ui.notifications.reeditAction}
                </Button>
              </Link>
            </>
          )}

          {(category === "error" || progress?.jobState === "failed") && (
            <>
              <Button
                variant="secondary"
                size="sm"
                className="min-h-[44px]"
                disabled={retrying}
                onClick={() => void handleRetry()}
              >
                {retrying
                  ? ui.notifications.retryingAction
                  : ui.notifications.retryAction}
              </Button>
              <Link href={supportHref}>
                <Button variant="secondary" size="sm" className="min-h-[44px]">
                  {ui.notifications.supportAction}
                </Button>
              </Link>
            </>
          )}

          {!item.isRead && (
            <Button
              variant="secondary"
              size="sm"
              className="min-h-[44px]"
              onClick={() => onMarkRead(item.notificationId)}
            >
              {ui.notifications.markRead}
            </Button>
          )}
          {!compact && (
            <Button
              variant="ghost"
              size="sm"
              className="min-h-[44px]"
              onClick={() => onDelete(item.notificationId)}
            >
              {ui.notifications.delete}
            </Button>
          )}
        </div>
      </Card>
    </li>
  );
}

export function NotificationList({
  compact = false,
  limit,
  onUpdate,
  onNavigate,
  items,
}: NotificationListProps) {
  const isFixture = items != null;
  const [notifications, setNotifications] = useState<NotificationRecord[]>(
    items ?? [],
  );
  const [loading, setLoading] = useState(!isFixture);
  const [filter, setFilter] = useState<NoticeFilter>("all");

  const reload = useCallback(async () => {
    if (isFixture) return;
    setLoading(true);
    try {
      const data = await fetchNotifications();
      setNotifications(data.notifications);
      onUpdate?.();
    } finally {
      setLoading(false);
    }
  }, [onUpdate, isFixture]);

  useEffect(() => {
    if (isFixture) return;
    void reload();
  }, [reload, isFixture]);

  // Real-time: refetch when any tab / component signals a change (mark read,
  // new notice) and when the window regains focus — also resume hung jobs so
  // browser refresh / disconnect does not leave work stuck.
  useEffect(() => {
    if (isFixture) return;
    const unsubscribe = subscribeNotificationsChanged(() => void reload());
    const onFocus = () => {
      void resumeBackgroundJobs();
      void reload();
    };
    window.addEventListener("focus", onFocus);
    void resumeBackgroundJobs();
    return () => {
      unsubscribe();
      window.removeEventListener("focus", onFocus);
    };
  }, [reload, isFixture]);

  const visible = useMemo(() => {
    const filtered = notifications.filter((item) =>
      matchesNoticeFilter(item, compact ? "all" : filter),
    );
    if (typeof limit === "number") return filtered.slice(0, limit);
    return filtered;
  }, [notifications, filter, compact, limit]);

  const handleMarkRead = async (id: string) => {
    await markNotificationRead(id);
    notifyNotificationsChanged();
    await reload();
  };

  const handleMarkAll = async () => {
    await markAllNotificationsRead();
    notifyNotificationsChanged();
    await reload();
  };

  const handleDelete = async (id: string) => {
    await deleteNotification(id);
    notifyNotificationsChanged();
    await reload();
  };

  if (loading) {
    return (
      <p className="px-4 py-6 text-sm text-[var(--text-secondary)]">
        {ui.loading}
      </p>
    );
  }

  if (notifications.length === 0) {
    return (
      <div className={cn("px-4 py-10 text-center", !compact && "py-16")}>
        <p className="text-base font-medium text-foreground">
          {ui.notifications.emptyTitle}
        </p>
        <p className="mt-2 text-sm text-[var(--text-secondary)]">
          {ui.notifications.emptyDescription}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {!compact && (
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div
            className="flex flex-wrap gap-2"
            role="tablist"
            aria-label={ui.notifications.filterLabel}
          >
            {FILTERS.map((item) => (
              <button
                key={item.id}
                type="button"
                role="tab"
                aria-selected={filter === item.id}
                onClick={() => setFilter(item.id)}
                className={cn(
                  "min-h-[44px] rounded-full px-4 py-2 text-sm font-medium transition-colors focus-ring",
                  filter === item.id
                    ? "bg-accent text-white"
                    : "bg-[var(--surface-muted)] text-[var(--text-secondary)] hover:text-foreground",
                )}
              >
                {item.label}
              </button>
            ))}
          </div>
          <Button
            variant="secondary"
            size="sm"
            className="min-h-[44px] self-start"
            onClick={() => void handleMarkAll()}
          >
            {ui.notifications.markAllRead}
          </Button>
        </div>
      )}

      {visible.length === 0 ? (
        <p className="px-2 py-8 text-center text-sm text-[var(--text-secondary)]">
          {ui.notifications.emptyFiltered}
        </p>
      ) : (
        <ul className={cn("space-y-3", compact ? "px-3" : "")}>
          {visible.map((item) => (
            <NoticeCard
              key={item.notificationId}
              item={item}
              compact={compact}
              onMarkRead={(id) => void handleMarkRead(id)}
              onDelete={(id) => void handleDelete(id)}
              onNavigate={onNavigate}
              onRetried={() => void reload()}
            />
          ))}
        </ul>
      )}
    </div>
  );
}
