"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import { fetchNotifications } from "@/lib/notifications/client";
import type { NotificationRecord } from "@/lib/notifications/types";
import { ui } from "@/lib/i18n";
import { Button } from "@/components/ui/button";

export function HomeNotificationsPreview() {
  const [notifications, setNotifications] = useState<NotificationRecord[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchNotifications();
      setNotifications(data.notifications.slice(0, 5));
      setUnreadCount(data.unreadCount);
    } catch {
      setNotifications([]);
      setUnreadCount(0);
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
    return (
      <p className="text-sm text-[var(--text-secondary)]">{ui.notifications.empty}</p>
    );
  }

  return (
    <div className="space-y-4">
      {unreadCount > 0 && (
        <p className="text-sm text-[var(--text-secondary)]">
          {ui.homeUx.unreadNotifications(unreadCount)}
        </p>
      )}
      <ul className="space-y-2">
        {notifications.map((item) => (
          <li
            key={item.notificationId}
            className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface-muted)] px-4 py-3"
          >
            <p className="text-sm font-medium text-foreground">{item.title}</p>
            <p className="mt-1 text-xs text-[var(--text-secondary)]">{item.message}</p>
          </li>
        ))}
      </ul>
      <Link href="/notifications">
        <Button variant="secondary" size="sm">
          {ui.notifications.viewAll}
        </Button>
      </Link>
    </div>
  );
}
