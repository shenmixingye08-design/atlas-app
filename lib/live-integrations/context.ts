import "server-only";

import { getClerkUserPrimaryEmail } from "@/lib/auth/get-clerk-user-email";
import { buildFeatureAccessContext } from "@/lib/feature-flags/access";
import type { FeatureAccessContext } from "@/lib/feature-flags/types";

/** Resolve feature access for a Clerk user id (Automation runs). */
export async function resolveFeatureAccessContextForUser(
  userId: string,
): Promise<FeatureAccessContext> {
  const email = await getClerkUserPrimaryEmail(userId);
  return buildFeatureAccessContext(email);
}
