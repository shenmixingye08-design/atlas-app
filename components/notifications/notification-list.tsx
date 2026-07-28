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

function noticePrimaryAction(item: NotificationRecord): {
  href: string;
  label: string;
} | null {
  const category = resolveNoticeCategory(item);
  const actionUrl = resolveNoticeActionUrl(item);

  if (
    item.workEvent === "failed" ||
    item.workEvent === "timed_out" ||
    item.workEvent === "retry_result"
  ) {
    const retry = item.retryActionUrl?.startsWith("/")
      ? item.retryActionUrl
      : "/workspace";
    return { href: retry, label: ui.notifications.retryWork };
  }

  if (item.workEvent === "processing" || item.workEvent === "accepted") {
    return actionUrl
      ? { href: actionUrl, label: "状況を見る" }
      : { href: "/workspace", label: "状況を見る" };
  }

  if (item.workEvent === "completed" && actionUrl) {
    return {
      href: actionUrl,
      label: item.artifactId
        ? ui.notifications.openDownload
        : ui.notifications.openResult,
    };
  }

  if (!actionUrl) return null;
  return { href: actionUrl, label: getNoticeActionLabel(category) };
}

function NoticeCard({
  item,
  compact,
  onMarkRead,
  onDelete,
  onNavigate,
}: {
  item: NotificationRecord;
  compact?: boolean;
  onMarkRead: (id: string) => void;
  onDelete: (id: string) => void;
  onNavigate?: () => void;
}) {
  const category = resolveNoticeCategory(item);
  const priority = resolveNoticePriority(item, category);
  const title =
    item.workEvent === "processing"
      ? ui.notifications.processingTitle
      : item.workEvent === "failed"
        ? ui.notifications.failedTitle
        : formatNoticeTitle(item, category);
  const message =
    item.workEvent === "processing"
      ? ui.notifications.processingDescription
      : formatNoticeMessage(item, category);
  const jobName = extractJobName(item);
  const primary = noticePrimaryAction(item);
  const detailUrl =
    item.workEvent === "completed" || item.deliverableId
      ? resolveNoticeActionUrl(item)
      : null;

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
          <span className="text-[11px] text-[var(--text-muted)]">
            {formatNoticeDateTime(item.createdAt)}
          </span>
        </div>

        <p className="mt-3 text-sm font-semibold text-foreground">{title}</p>
        <p className="mt-1 text-sm leading-relaxed text-[var(--text-secondary)]">
          {compact && message.length > 72 ? `${message.slice(0, 72)}…` : message}
        </p>

        {!compact && (jobName || item.jobId) && (
          <p className="mt-2 text-xs text-[var(--text-muted)]">
            {jobName
              ? `${ui.notifications.relatedJob}: ${jobName}`
              : `${ui.notifications.jobIdLabel}: ${item.jobId}`}
          </p>
        )}

        <div className="mt-4 flex flex-wrap gap-2">
          {primary && (
            <Link
              href={primary.href}
              onClick={() => {
                if (!item.isRead) onMarkRead(item.notificationId);
                onNavigate?.();
              }}
            >
              <Button variant="primary" size="sm" className="min-h-[44px]">
                {primary.label}
              </Button>
            </Link>
          )}
          {detailUrl &&
            primary &&
            primary.href !== detailUrl &&
            (item.workEvent === "failed" ||
              item.workEvent === "timed_out") && (
              <Link
                href={detailUrl}
                onClick={() => {
                  if (!item.isRead) onMarkRead(item.notificationId);
                  onNavigate?.();
                }}
              >
                <Button variant="secondary" size="sm" className="min-h-[44px]">
                  {ui.notifications.openResult}
                </Button>
              </Link>
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
  const [fetchError, setFetchError] = useState(false);
  const [filter, setFilter] = useState<NoticeFilter>("all");

  const reload = useCallback(async () => {
    if (isFixture) return;
    setLoading(true);
    try {
      const data = await fetchNotifications();
      setNotifications(data.notifications);
      setFetchError(false);
      onUpdate?.();
    } catch {
      // Distinguish fetch failure from a true empty inbox.
      setFetchError(true);
    } finally {
      setLoading(false);
    }
  }, [onUpdate, isFixture]);

  useEffect(() => {
    if (isFixture) return;
    const boot = window.setTimeout(() => void reload(), 0);
    return () => window.clearTimeout(boot);
  }, [reload, isFixture]);

  // Existing-safe update: short poll + focus + local change events (no new realtime).
  useEffect(() => {
    if (isFixture) return;
    const interval = window.setInterval(() => void reload(), 8_000);
    const unsubscribe = subscribeNotificationsChanged(() => void reload());
    const onFocus = () => void reload();
    window.addEventListener("focus", onFocus);
    return () => {
      window.clearInterval(interval);
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

  if (loading && notifications.length === 0 && !fetchError) {
    return (
      <p className="px-4 py-6 text-sm text-[var(--text-secondary)]">
        {ui.loading}
      </p>
    );
  }

  // NEVER reuse deliverable/results empty UI here.
  if (fetchError && notifications.length === 0) {
    return (
      <div className={cn("px-4 py-10 text-center", !compact && "py-16")}>
        <p className="text-base font-medium text-foreground">
          {ui.notifications.fetchErrorTitle}
        </p>
        <p className="mt-2 text-sm text-[var(--text-secondary)]">
          {ui.notifications.fetchErrorDescription}
        </p>
        <div className="mt-4">
          <Button
            variant="primary"
            size="sm"
            className="min-h-[44px]"
            onClick={() => void reload()}
          >
            {ui.notifications.retryFetch}
          </Button>
        </div>
      </div>
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
            />
          ))}
        </ul>
      )}
    </div>
  );
}
