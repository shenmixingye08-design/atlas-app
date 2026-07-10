/** Bottom tab identifiers — primary mobile navigation. */
export type BottomNavId =
  | "home"
  | "request"
  | "history"
  | "memory"
  | "analysis";

/** Routes where the mobile bottom nav should not appear. */
export function shouldHideBottomNav(pathname: string): boolean {
  if (!pathname || pathname === "/") return true;
  if (pathname.startsWith("/sign-in") || pathname.startsWith("/sign-up")) return true;
  if (pathname.startsWith("/owner")) return true;
  return false;
}

/** Resolve which bottom tab is active for the current path. */
export function resolveBottomNavId(pathname: string): BottomNavId | null {
  if (pathname.startsWith("/settings/work-memory")) return "memory";
  if (pathname.startsWith("/settings/learning")) return "analysis";
  if (pathname.startsWith("/history")) return "history";
  if (
    pathname.startsWith("/workspace") ||
    pathname.startsWith("/projects/") ||
    pathname.startsWith("/chat")
  ) {
    return "request";
  }
  if (pathname.startsWith("/projects") || pathname === "/notifications") {
    return "home";
  }
  return null;
}
