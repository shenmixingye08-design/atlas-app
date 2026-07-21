"use client";

import { useCallback, useEffect, useState } from "react";

import { fetchNotifications } from "@/lib/notifications/client";
import { subscribeNotificationsChanged } from "@/lib/notifications/refresh-events";
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
    // Real-time: refresh the count on in-app changes, focus, and a slow poll —
    // no full page reload.
    const interval = window.setInterval(() => void reload(), 60_000);
    const unsubscribe = subscribeNotificationsChanged(() => void reload());
    const onFocus = () => void reload();
    window.addEventListener("focus", onFocus);
    return () => {
      window.clearInterval(interval);
      unsubscribe();
      window.removeEventListener("focus", onFocus);
    };
  }, [reload]);

  if (unreadCount <= 0) return null;

  return (
    <span className="rounded-full bg-[var(--accent-muted)] px-2 py-0.5 text-[10px] font-medium text-accent">
      {unreadCount}
    </span>
  );
}
