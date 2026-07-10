"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import {
  deleteNotification,
  fetchNotifications,
  markAllNotificationsRead,
  markNotificationRead,
} from "@/lib/notifications/client";
import type { NotificationRecord, NotificationType } from "@/lib/notifications/types";
import { ui } from "@/lib/i18n";
import { cn } from "@/lib/design-system/cn";
import { Button } from "@/components/ui/button";

const TYPE_LABELS: Record<NotificationType, string> = {
  completed: ui.notifications.types.completed,
  awaiting_review: ui.notifications.types.awaitingReview,
  recommendation: ui.notifications.types.recommendation,
  error: ui.notifications.types.error,
  billing: ui.notifications.types.billing,
  integration: ui.notifications.types.integration,
  automation: ui.notifications.types.automation,
};

function formatTime(iso: string): string {
  return new Date(iso).toLocaleString("ja-JP", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

type NotificationListProps = {
  compact?: boolean;
  onUpdate?: () => void;
};

export function NotificationList({ compact = false, onUpdate }: NotificationListProps) {
  const [notifications, setNotifications] = useState<NotificationRecord[]>([]);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchNotifications();
      setNotifications(data.notifications);
      onUpdate?.();
    } finally {
      setLoading(false);
    }
  }, [onUpdate]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const handleMarkRead = async (id: string) => {
    await markNotificationRead(id);
    await reload();
  };

  const handleMarkAll = async () => {
    await markAllNotificationsRead();
    await reload();
  };

  const handleDelete = async (id: string) => {
    await deleteNotification(id);
    await reload();
  };

  if (loading) {
    return (
      <p className="px-4 py-6 text-sm text-[var(--foreground-muted)]">
        {ui.loading}
      </p>
    );
  }

  if (notifications.length === 0) {
    return (
      <p className="px-4 py-8 text-center text-sm text-[var(--foreground-muted)]">
        {ui.notifications.empty}
      </p>
    );
  }

  return (
    <div>
      {!compact && (
        <div className="mb-4 flex justify-end">
          <Button variant="secondary" size="sm" onClick={() => void handleMarkAll()}>
            {ui.notifications.markAllRead}
          </Button>
        </div>
      )}

      <ul className={cn("space-y-2", compact ? "max-h-80 overflow-y-auto" : "")}>
        {notifications.map((item) => (
          <li
            key={item.notificationId}
            className={cn(
              "landing-glass rounded-[var(--radius-xl)] border px-4 py-4 transition-colors",
              item.isRead
                ? "border-[var(--border)] bg-[var(--surface-muted)]"
                : "border-accent/25 bg-accent/[0.04]",
            )}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-full bg-[var(--background-subtle)] px-2 py-0.5 text-[10px] font-medium text-[var(--foreground-muted)]">
                    {TYPE_LABELS[item.type]}
                  </span>
                  {!item.isRead && (
                    <span className="h-1.5 w-1.5 rounded-full bg-accent" aria-hidden />
                  )}
                  <span className="text-[10px] text-[var(--foreground-muted)]">
                    {formatTime(item.createdAt)}
                  </span>
                </div>
                <p className="mt-2 text-sm font-semibold text-foreground">{item.title}</p>
                <p className="mt-1 text-sm text-[var(--text-secondary)]">{item.message}</p>
              </div>
            </div>

            <div className="mt-3 flex flex-wrap gap-2">
              {item.actionUrl && (
                <Link href={item.actionUrl}>
                  <Button variant="primary" size="sm">
                    {ui.notifications.openAction}
                  </Button>
                </Link>
              )}
              {!item.isRead && (
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => void handleMarkRead(item.notificationId)}
                >
                  {ui.notifications.markRead}
                </Button>
              )}
              <Button
                variant="secondary"
                size="sm"
                onClick={() => void handleDelete(item.notificationId)}
              >
                {ui.notifications.delete}
              </Button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
