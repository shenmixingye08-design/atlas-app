"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Show } from "@clerk/nextjs";

import { fetchNotifications } from "@/lib/notifications/client";
import { subscribeNotificationsChanged } from "@/lib/notifications/refresh-events";
import { ui } from "@/lib/i18n";
import { cn } from "@/lib/design-system/cn";

import { NotificationList } from "./notification-list";
import { NotificationPanelShell } from "./notification-panel-shell";

export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const panelRef = useRef<HTMLDivElement>(null);

  const refreshCount = useCallback(async () => {
    try {
      const data = await fetchNotifications();
      setUnreadCount(data.unreadCount);
    } catch {
      setUnreadCount(0);
    }
  }, []);

  useEffect(() => {
    void refreshCount();
    const interval = window.setInterval(() => void refreshCount(), 60_000);
    // Real-time: update the badge immediately on in-app changes (mark read /
    // new notice) and when the tab regains focus — no full page reload.
    const unsubscribe = subscribeNotificationsChanged(() => void refreshCount());
    const onFocus = () => void refreshCount();
    window.addEventListener("focus", onFocus);
    return () => {
      window.clearInterval(interval);
      unsubscribe();
      window.removeEventListener("focus", onFocus);
    };
  }, [refreshCount]);

  useEffect(() => {
    if (!open) return;
    const handleClick = (event: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", handleClick);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handleClick);
      document.removeEventListener("keydown", handleKey);
    };
  }, [open]);

  return (
    <Show when="signed-in">
      <div className="relative" ref={panelRef}>
        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          className={cn(
            "touch-target relative flex min-h-[44px] min-w-[44px] items-center justify-center rounded-full",
            "text-lg transition-colors hover:bg-[var(--surface-muted)] focus-ring",
          )}
          aria-label={ui.notifications.bellLabel(unreadCount)}
          aria-expanded={open}
        >
          <span aria-hidden>🔔</span>
          {unreadCount > 0 && (
            <span
              className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-accent ring-2 ring-[var(--card)]"
              aria-hidden
            />
          )}
        </button>

        {open && (
          <NotificationPanelShell onClose={() => setOpen(false)}>
            <NotificationList
              compact
              limit={5}
              onUpdate={() => void refreshCount()}
              onNavigate={() => setOpen(false)}
            />
          </NotificationPanelShell>
        )}
      </div>
    </Show>
  );
}
