import { auth } from "@clerk/nextjs/server";

import { resolveFeatureAccessContext } from "@/lib/feature-flags/resolve-context";
import { fetchWordPressTagsForUser } from "@/lib/integrations/wordpress/post/service";

export async function GET(): Promise<Response> {
  const { userId } = await auth();
  if (!userId) {
    return Response.json(
      { status: "error", message: "Unauthorized" },
      { status: 401 },
    );
  }

  const context = await resolveFeatureAccessContext();
  const result = await fetchWordPressTagsForUser({ userId, context });

  if (result.status === "ok") {
    return Response.json(result);
  }
  if (result.status === "feature_disabled") {
    return Response.json(result, { status: 403 });
  }
  if (result.status === "wp_not_connected" || result.status === "auth_failure") {
    return Response.json(result, { status: 409 });
  }
  return Response.json(result, { status: 502 });
}
