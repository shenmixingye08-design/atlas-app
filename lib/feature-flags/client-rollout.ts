/**
 * Client-visible Automation First rollout hints.
 * Used so `/projects` never flashes the legacy home while flags load on Preview/dev,
 * and so a failed availability fetch does not force the old UI.
 *
 * Server source of truth remains `lib/feature-flags/rollout.ts` + availability API.
 * Rollback: set ATLAS_AUTOMATION_FIRST_UI=off (server) and
 * NEXT_PUBLIC_ATLAS_AUTOMATION_FIRST_UI=off (client) or disable flags in Owner UI.
 */

export function resolveClientAutomationFirstPreferOn(): boolean {
  const override =
    process.env.NEXT_PUBLIC_ATLAS_AUTOMATION_FIRST_UI?.trim().toLowerCase();
  if (
    override === "0" ||
    override === "off" ||
    override === "false"
  ) {
    return false;
  }
  if (
    override === "1" ||
    override === "on" ||
    override === "true"
  ) {
    return true;
  }

  // Prefer AF on for real app surfaces (Preview / Production / Development).
  // Vitest does not use this helper for server store defaults.
  if (process.env.NODE_ENV === "test") {
    return false;
  }

  return true;
}
