import { auth } from "@clerk/nextjs/server";

import { resolveFeatureAccessContext } from "@/lib/feature-flags/resolve-context";
import { checkWordPressConnectionForUser } from "@/lib/integrations/wordpress/connection-status";

/** Explicit connection verify against WordPress REST API. */
export async function POST(): Promise<Response> {
  const { userId } = await auth();
  if (!userId) {
    return Response.json(
      { status: "unauthorized", connected: false, message: "Unauthorized" },
      { status: 401 },
    );
  }

  const context = await resolveFeatureAccessContext();
  const result = await checkWordPressConnectionForUser({ userId, context });

  if (result.status === "feature_disabled") {
    return Response.json(result, { status: 403 });
  }
  if (
    result.status === "disconnected" ||
    result.status === "reconnect_required" ||
    result.status === "auth_failure"
  ) {
    return Response.json(result, { status: 409 });
  }
  if (result.status === "error") {
    return Response.json(result, { status: 502 });
  }

  return Response.json(result);
}
