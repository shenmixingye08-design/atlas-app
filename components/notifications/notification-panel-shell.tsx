"use client";

import Link from "next/link";
import type { ReactNode } from "react";

import { ui } from "@/lib/i18n";
import { cn } from "@/lib/design-system/cn";

type NotificationPanelShellProps = {
  onClose: () => void;
  children: ReactNode;
  /**
   * When true the panel is rendered inline (static) for the DEV preview so it is
   * always visible regardless of the popover open state. Production uses the
   * default (positioned popover anchored to the bell).
   */
  inline?: boolean;
};

/**
 * Shared chrome for the notification popover. The critical job here is the
 * MOBILE layout: the panel must always fit inside the viewport (with Safe Area
 * insets), never overflow any edge, scroll vertically when long, and keep the
 * close button reachable. Desktop keeps the anchored dropdown under the bell.
 *
 * Both the production `NotificationBell` and the DEV `/dev/notification-panel-
 * preview` render through this component so the preview proves the real layout.
 */
export function NotificationPanelShell({
  onClose,
  children,
  inline = false,
}: NotificationPanelShellProps) {
  return (
    <div
      role="dialog"
      aria-label={ui.notifications.title}
      data-testid="notification-panel"
      className={cn(
        "z-50 flex flex-col overflow-hidden rounded-[var(--radius-2xl)] border border-[var(--border-subtle)] bg-[var(--card)] shadow-[var(--shadow-lg)]",
        inline
          ? "relative w-full max-h-[70vh]"
          : cn(
              // Mobile: fixed to the viewport, fit within Safe Area on every
              // edge, and cap height so the panel never runs off top or bottom.
              "fixed",
              "left-[max(0.75rem,env(safe-area-inset-left))]",
              "right-[max(0.75rem,env(safe-area-inset-right))]",
              "top-[calc(env(safe-area-inset-top,0px)+3.75rem)]",
              "max-h-[calc(100dvh-env(safe-area-inset-top,0px)-env(safe-area-inset-bottom,0px)-4.75rem)]",
              // Desktop: anchored dropdown under the bell.
              "sm:absolute sm:inset-x-auto sm:left-auto sm:right-0 sm:top-full sm:mt-2",
              "sm:w-96 sm:max-w-[calc(100vw-2rem)]",
              "sm:max-h-[min(32rem,calc(100dvh-6rem))]",
            ),
      )}
    >
      <div className="flex flex-shrink-0 items-start justify-between gap-2 border-b border-[var(--border-subtle)] px-4 py-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-foreground">
            {ui.notifications.title}
          </p>
          <p className="mt-1 text-xs text-[var(--text-secondary)]">
            {ui.notifications.panelHint}
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label={ui.notifications.close}
          className="touch-target -mr-1 flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full text-[var(--text-secondary)] transition-colors hover:bg-[var(--surface-muted)] hover:text-foreground focus-ring"
        >
          <span aria-hidden className="text-lg leading-none">
            ✕
          </span>
        </button>
      </div>

      <div className="flex-1 overflow-y-auto overscroll-contain py-3">
        {children}
      </div>

      <div
        className="flex-shrink-0 border-t border-[var(--border-subtle)] px-4 pt-3"
        style={{
          paddingBottom: "max(0.75rem, env(safe-area-inset-bottom, 0px))",
        }}
      >
        <Link
          href="/notifications"
          className="flex min-h-[44px] items-center justify-center rounded-full bg-[var(--surface-muted)] text-sm font-medium text-foreground hover:bg-[var(--secondary-hover)] focus-ring"
          onClick={onClose}
        >
          {ui.notifications.viewAll}
        </Link>
      </div>
    </div>
  );
}
