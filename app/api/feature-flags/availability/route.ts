import {
  buildFeatureAvailabilityMap,
} from "@/lib/feature-flags/access";
import { resolveFeatureAccessContext } from "@/lib/feature-flags/resolve-context";
import {
  diffProbeSideEffects,
  snapshotProbeSideEffects,
} from "@/lib/health/probe-side-effects";

/**
 * Read-only feature availability. Must not persist notifications,
 * hydrate preference writes, or upsert atlasNotifications.
 *
 * Call path (GET only):
 *   resolveFeatureAccessContext
 *     → ensureOwnerRuntimeHydrated (flags / maintenance / beta READ)
 *     → auth()
 *     → getClerkUserPrimaryEmail (read)
 *   buildFeatureAvailabilityMap (in-memory)
 *
 * Notification repository / persistNotificationsNow are not on this path.
 */
export async function GET(): Promise<Response> {
  const before = snapshotProbeSideEffects();
  const context = await resolveFeatureAccessContext();
  const flags = buildFeatureAvailabilityMap(context);
  const writes = diffProbeSideEffects(before);
  if (
    writes.notificationInserts !== 0 ||
    writes.notificationUpserts !== 0
  ) {
    console.error("[feature-flags/availability] unexpected notification write", {
      notificationInserts: writes.notificationInserts,
      notificationUpserts: writes.notificationUpserts,
    });
  }
  return Response.json({ flags });
}
