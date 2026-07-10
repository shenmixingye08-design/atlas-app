import "server-only";

import { auth } from "@clerk/nextjs/server";

import { getClerkUserPrimaryEmail } from "@/lib/auth/get-clerk-user-email";

import { buildFeatureAccessContext } from "./access";
import type { FeatureAccessContext } from "./types";

export async function resolveFeatureAccessContext(): Promise<FeatureAccessContext> {
  const { userId } = await auth();
  if (!userId) {
    return buildFeatureAccessContext(null);
  }

  const email = await getClerkUserPrimaryEmail(userId);
  return buildFeatureAccessContext(email);
}
