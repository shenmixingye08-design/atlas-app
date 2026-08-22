/**
 * Clerk middleware must not inspect cron Bearer tokens.
 * Vercel Cron / GitHub Actions send `Authorization: Bearer $CRON_SECRET`,
 * which Clerk treats as a session JWT and can 401 before the route gate.
 *
 * These paths stay fail-closed via authorizeAutomationTick (CRON_SECRET /
 * ATLAS owner). They are middleware-public, not world-public.
 */

export const CLERK_MIDDLEWARE_CRON_BYPASS_PATHS = [
  "/api/automations/tick",
  "/api/worker/drain",
] as const;

export function isClerkMiddlewareCronBypassPath(
  pathname: string | null | undefined,
): boolean {
  const path = (pathname ?? "").split("?")[0] ?? "";
  for (const prefix of CLERK_MIDDLEWARE_CRON_BYPASS_PATHS) {
    if (path === prefix || path.startsWith(`${prefix}/`)) return true;
  }
  return false;
}
