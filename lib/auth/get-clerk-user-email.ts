import "server-only";

import { clerkClient } from "@clerk/nextjs/server";

/** Resolve the primary email for a Clerk user id (server-only). */
export async function getClerkUserPrimaryEmail(
  userId: string,
): Promise<string | null> {
  try {
    const client = await clerkClient();
    const user = await client.users.getUser(userId);

    return (
      user.primaryEmailAddress?.emailAddress ??
      user.emailAddresses[0]?.emailAddress ??
      null
    );
  } catch {
    return null;
  }
}
