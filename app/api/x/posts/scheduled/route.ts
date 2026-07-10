import { auth } from "@clerk/nextjs/server";

import { resolveFeatureAccessContext } from "@/lib/feature-flags/resolve-context";
import { getXScheduledPostsForUser } from "@/lib/integrations/x/post/service";

export async function GET(): Promise<Response> {
  const { userId } = await auth();
  if (!userId) {
    return Response.json(
      { status: "unauthorized", message: "Unauthorized" },
      { status: 401 },
    );
  }

  const context = await resolveFeatureAccessContext();
  const result = await getXScheduledPostsForUser({ userId, context });

  if (result.status !== "ready") {
    return Response.json(result, { status: 403 });
  }

  return Response.json(result);
}
