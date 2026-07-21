/**
 * Bottom tab identifiers — primary mobile navigation.
 * Aligned with the simplified header: ホーム / 履歴 / 送る / 自動化 / 設定.
 */
export type BottomNavId =
  | "home"
  | "history"
  | "request"
  | "automation"
  | "settings";

/** Routes where the mobile bottom nav should not appear. */
export function shouldHideBottomNav(pathname: string): boolean {
  if (!pathname || pathname === "/") return true;
  if (pathname.startsWith("/sign-in") || pathname.startsWith("/sign-up")) return true;
  if (pathname.startsWith("/owner")) return true;
  return false;
}

/** Resolve which bottom tab is active for the current path. */
export function resolveBottomNavId(pathname: string): BottomNavId | null {
  if (pathname.startsWith("/automations")) return "automation";
  // AIオーケストラは自動化専用導線
  if (pathname.startsWith("/commander")) return "automation";
  if (pathname.startsWith("/settings")) return "settings";
  if (pathname.startsWith("/history")) return "history";
  if (
    pathname.startsWith("/workspace") ||
    pathname.startsWith("/projects/") ||
    pathname.startsWith("/chat") ||
    pathname.startsWith("/learned-jobs") ||
    pathname.startsWith("/teach-work")
  ) {
    return "request";
  }
  if (pathname.startsWith("/projects") || pathname === "/notifications") {
    return "home";
  }
  return null;
}
