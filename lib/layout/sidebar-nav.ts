import type { AtlasNavPage } from "./nav-types";
import {
  SIDEBAR_CHANNEL_NAV,
  SIDEBAR_MORE_NAV,
  SIDEBAR_PRIMARY_NAV,
} from "./sidebar-items";

const ALL_SIDEBAR_ITEMS = [
  ...SIDEBAR_PRIMARY_NAV,
  ...SIDEBAR_CHANNEL_NAV,
  ...SIDEBAR_MORE_NAV,
];

/** Resolve sidebar active id from pathname when `active` prop is not passed. */
export function resolveSidebarActiveId(pathname: string): AtlasNavPage | null {
  if (pathname.startsWith("/workspace/x")) return "x-autopost";
  if (pathname.startsWith("/automations")) return "automations";
  if (pathname.startsWith("/settings/learning")) return "learning";
  if (pathname.startsWith("/settings/billing")) return "billing";
  if (pathname.startsWith("/settings")) return "settings";
  if (pathname.startsWith("/history")) return "history";
  if (pathname.startsWith("/commander")) return "commander";
  if (pathname.startsWith("/learned-jobs") || pathname.startsWith("/teach-work")) {
    return "work-memory";
  }
  if (pathname.startsWith("/contact")) return "contact";
  if (pathname.startsWith("/capabilities")) return "help";
  if (pathname.startsWith("/projects") || pathname === "/notifications") {
    return "projects";
  }

  const matched = ALL_SIDEBAR_ITEMS.find((item) => pathname.startsWith(item.href));
  return matched?.id ?? null;
}

/** Whether the current path belongs to the 「その他」 section. */
export function isSidebarMoreActive(active: AtlasNavPage | null | undefined): boolean {
  if (!active) return false;
  return (
    SIDEBAR_CHANNEL_NAV.some((item) => item.id === active) ||
    SIDEBAR_MORE_NAV.some((item) => item.id === active)
  );
}
