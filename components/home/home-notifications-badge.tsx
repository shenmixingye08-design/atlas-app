"use client";

import { useCallback, useEffect, useState } from "react";

import { fetchNotifications } from "@/lib/notifications/client";
import { ui } from "@/lib/i18n";

export function HomeNotificationsBadge() {
  const [unreadCount, setUnreadCount] = useState(0);

  const reload = useCallback(async () => {
    try {
      const data = await fetchNotifications();
      setUnreadCount(data.unreadCount);
    } catch {
      setUnreadCount(0);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  if (unreadCount <= 0) return null;

  return (
    <span className="rounded-full bg-[var(--accent-muted)] px-2 py-0.5 text-[10px] font-medium text-accent">
      {unreadCount}
    </span>
  );
}
