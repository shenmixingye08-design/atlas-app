import { auth } from "@clerk/nextjs/server";

import { resolveFeatureAccessContext } from "@/lib/feature-flags/resolve-context";
import { getXPostResultForUser } from "@/lib/integrations/x/post/service";

type RouteContext = {
  params: Promise<{ id: string }>;
};

/** Fetch a single post result by history id (auth + user-scoped, no tokens). */
export async function GET(
  request: Request,
  context: RouteContext,
): Promise<Response> {
  const { userId } = await auth();
  if (!userId) {
    return Response.json(
      { status: "unauthorized", message: "Unauthorized" },
      { status: 401 },
    );
  }

  const { id } = await context.params;
  if (!id?.trim()) {
    return Response.json(
      { status: "error", message: "id is required" },
      { status: 400 },
    );
  }

  const includeLive =
    new URL(request.url).searchParams.get("live") === "1";
  const featureContext = await resolveFeatureAccessContext();
  const result = await getXPostResultForUser({
    userId,
    historyId: id.trim(),
    context: featureContext,
    includeLive,
  });

  if (result.status === "feature_disabled") {
    return Response.json(result, { status: 403 });
  }
  if (result.status === "not_found") {
    return Response.json(result, { status: 404 });
  }
  if (result.status === "error") {
    return Response.json(result, { status: 502 });
  }

  return Response.json(result);
}
