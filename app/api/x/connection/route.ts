import { auth } from "@clerk/nextjs/server";

import { resolveFeatureAccessContext } from "@/lib/feature-flags/resolve-context";
import { checkXConnectionForUser } from "@/lib/integrations/x/connection-status";

/**
 * Connection + permission check for the authenticated user's X account.
 * Never returns OAuth tokens.
 */
export async function GET(): Promise<Response> {
  const { userId } = await auth();
  if (!userId) {
    return Response.json(
      { status: "unauthorized", message: "Unauthorized" },
      { status: 401 },
    );
  }

  const context = await resolveFeatureAccessContext();
  const result = await checkXConnectionForUser({ userId, context });

  if (result.status === "feature_disabled") {
    return Response.json(result, { status: 403 });
  }
  if (result.status === "disconnected" || result.status === "reconnect_required") {
    return Response.json(result, { status: 409 });
  }
  if (result.status === "error") {
    return Response.json(result, { status: 502 });
  }

  return Response.json(result);
}
