"use client";

import { useCallback, useEffect, useState } from "react";

import type { NotificationRecord } from "@/lib/notifications/types";
import { ui } from "@/lib/i18n";
import { cn } from "@/lib/design-system/cn";

export function OwnerNotificationList() {
  const [notifications, setNotifications] = useState<NotificationRecord[]>([]);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/owner/notifications");
      if (!response.ok) throw new Error("Failed");
      const data = (await response.json()) as { notifications: NotificationRecord[] };
      setNotifications(data.notifications);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  if (loading) {
    return <p className="text-sm text-[var(--text-secondary)]">{ui.loading}</p>;
  }

  if (notifications.length === 0) {
    return <p className="text-sm text-[var(--text-secondary)]">{ui.notifications.empty}</p>;
  }

  return (
    <ul className="space-y-3">
      {notifications.map((item) => (
        <li
          key={item.notificationId}
          className={cn(
            "rounded-[var(--radius-xl)] border px-4 py-4",
            item.isRead
              ? "border-[var(--border)] bg-[var(--surface-muted)]"
              : "border-[var(--accent)]/25 bg-[var(--accent-muted)]",
          )}
        >
          <p className="text-sm font-semibold text-foreground">{item.title}</p>
          <p className="mt-1 text-sm text-[var(--text-secondary)]">{item.message}</p>
          <p className="mt-2 text-xs text-[var(--text-muted)]">
            {new Date(item.createdAt).toLocaleString("ja-JP")}
          </p>
        </li>
      ))}
    </ul>
  );
}
