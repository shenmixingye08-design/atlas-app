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
            "text-lg transition-colors hover:bg-[var(--background-subtle)] focus-ring",
          )}
          aria-label={ui.notifications.bellLabel(unreadCount)}
          aria-expanded={open}
        >
          <span aria-hidden>🔔</span>
          {unreadCount > 0 && (
            <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-accent px-1 text-[10px] font-bold text-white">
              {unreadCount > 99 ? "99+" : unreadCount}
            </span>
          )}
        </button>

        {open && (
          <div className="absolute right-0 top-full z-50 mt-2 w-[min(100vw-2rem,22rem)] rounded-[var(--radius-2xl)] border border-[var(--border-subtle)] bg-white py-3 shadow-[var(--shadow-lg)] animate-fade-in">
            <div className="flex items-center justify-between border-b border-[var(--border-subtle)] px-4 pb-3">
              <p className="text-sm font-semibold text-foreground">
                {ui.notifications.title}
              </p>
              <Link
                href="/notifications"
                className="text-xs text-accent hover:underline"
                onClick={() => setOpen(false)}
              >
                {ui.notifications.viewAll}
              </Link>
            </div>
            <NotificationList
              compact
              onUpdate={() => void refreshCount()}
            />
          </div>
        )}
      </div>
    </Show>
  );
}
