import { auth } from "@clerk/nextjs/server";

import { resolveFeatureAccessContext } from "@/lib/feature-flags/resolve-context";
import { isDriveCategoryId } from "@/lib/integrations/google/drive/categories";
import {
  respondGoogleDriveCaught,
  respondGoogleDriveResult,
} from "@/lib/integrations/google/drive/http";
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
  try {
    const result = await getGoogleDriveFileForUser({
      userId,
      fileId,
      context: accessContext,
      category,
    });
    return respondGoogleDriveResult(result);
  } catch (error) {
    return respondGoogleDriveCaught(
      error,
      "Google Driveファイルの取得に失敗しました",
      "google_drive_file",
    );
  }
}
