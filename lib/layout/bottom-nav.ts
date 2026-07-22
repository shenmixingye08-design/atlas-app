/**
 * Bottom tab identifiers — primary mobile navigation.
 * ホーム / 仕事 / 自動化 / 成果物 / 設定
 */
export type BottomNavId =
  | "home"
  | "work"
  | "automation"
  | "deliverables"
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
  if (pathname.startsWith("/settings")) return "settings";
  if (pathname.startsWith("/deliverables")) return "deliverables";
  if (
    pathname.startsWith("/history") ||
    pathname.startsWith("/workspace") ||
    pathname.startsWith("/projects/") ||
    pathname.startsWith("/learned-jobs") ||
    pathname.startsWith("/teach-work")
  ) {
    return "work";
  }
  if (pathname.startsWith("/projects") || pathname === "/notifications") {
    return "home";
  }
  return null;
}
