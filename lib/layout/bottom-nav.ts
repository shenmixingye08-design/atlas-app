/** Bottom tab identifiers — primary mobile navigation. */
export type BottomNavId =
  | "home"
  | "work"
  | "automations"
  | "integrations"
  | "settings";

const INTEGRATIONS_PREFIXES = [
  "/integrations",
  "/connectors",
  "/connections",
  "/settings/google",
  "/settings/x",
  "/workspace/mail",
  "/workspace/drive",
  "/workspace/calendar",
  "/workspace/x",
] as const;

/** Routes where the mobile bottom nav should not appear. */
export function shouldHideBottomNav(pathname: string): boolean {
  if (!pathname || pathname === "/") return true;
  if (pathname.startsWith("/sign-in") || pathname.startsWith("/sign-up")) return true;
  if (pathname.startsWith("/owner")) return true;
  return false;
}

/** Resolve which bottom tab is active for the current path. */
export function resolveBottomNavId(pathname: string): BottomNavId {
  if (INTEGRATIONS_PREFIXES.some((prefix) => pathname.startsWith(prefix))) {
    return "integrations";
  }
  if (pathname.startsWith("/settings")) return "settings";
  if (pathname.startsWith("/automations")) return "automations";
  if (
    pathname.startsWith("/workspace") ||
    pathname.startsWith("/projects/") ||
    pathname.startsWith("/chat")
  ) {
    return "work";
  }
  return "home";
}
