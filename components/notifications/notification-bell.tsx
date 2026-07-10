"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { Show } from "@clerk/nextjs";

import { fetchNotifications } from "@/lib/notifications/client";
import { ui } from "@/lib/i18n";
import { cn } from "@/lib/design-system/cn";

import { NotificationList } from "./notification-list";

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
    return () => window.clearInterval(interval);
  }, [refreshCount]);

  useEffect(() => {
    if (!open) return;
    const handleClick = (event: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  return (
    <Show when="signed-in">
      <div className="relative" ref={panelRef}>
        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          className={cn(
            "touch-target relative flex h-10 w-10 items-center justify-center rounded-full",
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
          <div className="absolute right-0 top-full z-50 mt-2 w-[min(100vw-2rem,24rem)] rounded-[var(--radius-2xl)] border border-[var(--border-subtle)] bg-[var(--card)] py-3 shadow-[var(--shadow-lg)]">
            <div className="border-b border-[var(--border-subtle)] px-4 pb-3">
              <p className="text-sm font-semibold text-foreground">
                {ui.notifications.title}
              </p>
              <p className="mt-1 text-xs text-[var(--text-secondary)]">
                {ui.notifications.panelHint}
              </p>
            </div>

            <NotificationList
              compact
              limit={5}
              onUpdate={() => void refreshCount()}
              onNavigate={() => setOpen(false)}
            />

            <div className="border-t border-[var(--border-subtle)] px-4 pt-3">
              <Link
                href="/notifications"
                className="flex min-h-[44px] items-center justify-center rounded-full bg-[var(--surface-muted)] text-sm font-medium text-foreground hover:bg-[var(--secondary-hover)] focus-ring"
                onClick={() => setOpen(false)}
              >
                {ui.notifications.viewAll}
              </Link>
            </div>
          </div>
        )}
      </div>
    </Show>
  );
}
