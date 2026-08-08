import "server-only";

import { auth } from "@clerk/nextjs/server";

/**
 * P0-03: Resolve the authenticated Clerk user from the server session only.
 * Never trust client-supplied userId / ownerId / clerkUserId.
 */
export async function requireAuthenticatedUserId(): Promise<
  | { ok: true; userId: string }
  | { ok: false; response: Response }
> {
  const { userId } = await auth();
  if (!userId) {
    return {
      ok: false,
      response: Response.json(
        { ok: false, error: "Unauthorized" },
        {
          status: 401,
          headers: { "Cache-Control": "no-store, max-age=0" },
        },
      ),
    };
  }
  return { ok: true, userId };
}
