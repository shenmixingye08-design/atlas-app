import "server-only";

import { auth } from "@clerk/nextjs/server";

import { getClerkUserPrimaryEmail } from "@/lib/auth/get-clerk-user-email";
import { ensureOwnerRuntimeHydrated } from "@/lib/owner/runtime-config/hydrate";

import { buildFeatureAccessContext } from "./access";
import type { FeatureAccessContext } from "./types";

export async function resolveFeatureAccessContext(): Promise<FeatureAccessContext> {
  await ensureOwnerRuntimeHydrated();
  const { userId } = await auth();
  if (!userId) {
    return buildFeatureAccessContext(null);
  }

  const email = await getClerkUserPrimaryEmail(userId);
  return buildFeatureAccessContext(email);
}
