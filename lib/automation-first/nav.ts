import type { AtlasNavPage } from "@/lib/layout/nav-types";
import type { SidebarNavItem } from "@/lib/layout/sidebar-items";

/** Automation First PC sidebar — automation before one-shot ask. */
export const AUTOMATION_FIRST_SIDEBAR_PRIMARY: SidebarNavItem[] = [
  { id: "projects", href: "/projects", label: "ホーム", icon: "⌂" },
  { id: "today", href: "/today", label: "今日の仕事", icon: "◎" },
  { id: "automations", href: "/automations", label: "自動化", icon: "↻" },
  { id: "history", href: "/automations/runs", label: "実行履歴", icon: "☰" },
  { id: "artifacts", href: "/history", label: "成果物", icon: "◇" },
  { id: "notifications", href: "/notifications", label: "通知", icon: "◉" },
  { id: "integrations", href: "/connections", label: "連携", icon: "⧉" },
  { id: "settings", href: "/settings", label: "設定", icon: "⚙" },
];

/**
 * Mobile bottom nav ids for Automation First.
 * Center "+" opens create sheet (自動化 / 一度だけ).
 */
export type AutomationFirstBottomNavId =
  | "today"
  | "automation"
  | "create"
  | "artifacts"
  | "settings";

export function resolveAutomationFirstBottomNavId(
  pathname: string,
): AutomationFirstBottomNavId | null {
  if (pathname.startsWith("/automations")) return "automation";
  if (pathname.startsWith("/settings")) return "settings";
  if (pathname.startsWith("/history") || pathname.startsWith("/results")) {
    return "artifacts";
  }
  if (
    pathname.startsWith("/today") ||
    pathname.startsWith("/projects") ||
    pathname === "/notifications"
  ) {
    return "today";
  }
  if (pathname.startsWith("/workspace") || pathname.startsWith("/commander")) {
    return "create";
  }
  return null;
}

export function resolveAutomationFirstSidebarActive(
  pathname: string,
  explicit?: AtlasNavPage,
): AtlasNavPage | null {
  if (explicit) return explicit;
  if (pathname.startsWith("/today")) return "today";
  if (pathname.startsWith("/automations/runs")) return "history";
  if (pathname.startsWith("/automations")) return "automations";
  if (pathname.startsWith("/history") || pathname.startsWith("/results")) {
    return "artifacts";
  }
  if (pathname.startsWith("/notifications")) return "notifications";
  if (
    pathname.startsWith("/connections") ||
    pathname.startsWith("/integrations") ||
    pathname.startsWith("/connectors")
  ) {
    return "integrations";
  }
  if (pathname.startsWith("/settings")) return "settings";
  if (pathname.startsWith("/projects")) return "projects";
  if (pathname.startsWith("/workspace")) return "workspace";
  return null;
}
