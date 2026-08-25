"use client";

import { useCallback, useEffect, useState } from "react";

import { CountBadge } from "@/components/motion/count-badge";
import { fetchNotifications } from "@/lib/notifications/client";
import { subscribeNotificationsChanged } from "@/lib/notifications/refresh-events";

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
    // Defer initial fetch so setState is not synchronous inside the effect body.
    const boot = window.setTimeout(() => void reload(), 0);
    // Real-time: refresh the count on in-app changes, focus, and a short poll —
    // no full page reload.
    const interval = window.setInterval(() => void reload(), 30_000);
    const unsubscribe = subscribeNotificationsChanged(() => void reload());
    const onFocus = () => void reload();
    window.addEventListener("focus", onFocus);
    return () => {
      window.clearTimeout(boot);
      window.clearInterval(interval);
      unsubscribe();
      window.removeEventListener("focus", onFocus);
    };
  }, [reload]);

  return <CountBadge count={unreadCount} />;
}
