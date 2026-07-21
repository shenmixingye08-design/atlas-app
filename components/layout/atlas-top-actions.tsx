"use client";

import { NotificationBell } from "@/components/notifications/notification-bell";

import { AtlasHeaderAuth } from "./atlas-header-auth";

/**
 * Bell + account controls for the fixed top-right app chrome.
 * Used on desktop (app shell bar) and mobile (sidebar header).
 */
export function AtlasTopActions() {
  return (
    <div className="flex items-center gap-1 sm:gap-2">
      <NotificationBell />
      <AtlasHeaderAuth variant="shell" />
    </div>
  );
}
