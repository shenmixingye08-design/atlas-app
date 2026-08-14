"use client";

import { NotificationBell } from "@/components/notifications/notification-bell";
import { ThemeToggle } from "@/components/theme/theme-toggle";

import { AtlasHeaderAuth } from "./atlas-header-auth";

/**
 * Theme + bell + account for the fixed top-right app chrome.
 * Used on desktop (app shell bar) and mobile (sidebar header).
 * Do not add another ThemeToggle on individual app pages.
 */
export function AtlasTopActions() {
  return (
    <div className="flex shrink-0 items-center gap-0.5 sm:gap-2">
      <ThemeToggle />
      <NotificationBell />
      <AtlasHeaderAuth variant="shell" />
    </div>
  );
}
