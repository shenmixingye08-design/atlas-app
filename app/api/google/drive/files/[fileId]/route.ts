import { auth } from "@clerk/nextjs/server";

import { resolveFeatureAccessContext } from "@/lib/feature-flags/resolve-context";
import { isDriveCategoryId } from "@/lib/integrations/google/drive/categories";
import { getGoogleDriveFileForUser } from "@/lib/integrations/google/drive/service";
import type { DriveCategoryId } from "@/lib/integrations/google/drive/types";

type RouteContext = {
  params: Promise<{ fileId: string }>;
};

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

  const { fileId } = await context.params;
  const categoryParam = new URL(request.url).searchParams.get("category");
  const category =
    categoryParam && isDriveCategoryId(categoryParam)
      ? (categoryParam as DriveCategoryId)
      : undefined;

  const accessContext = await resolveFeatureAccessContext();
  const result = await getGoogleDriveFileForUser({
    userId,
    fileId,
    context: accessContext,
    category,
  });

  if (result.status !== "ready") {
    const statusCode =
      result.status === "feature_disabled"
        ? 403
        : result.status === "google_not_connected"
          ? 409
          : result.status === "not_found"
            ? 404
            : 500;
    return Response.json(result, { status: statusCode });
  }

  return Response.json(result);
}
