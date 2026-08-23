import { auth } from "@clerk/nextjs/server";

import { resolveFeatureAccessContext } from "@/lib/feature-flags/resolve-context";
import {
  respondGoogleDriveCaught,
  respondGoogleDriveResult,
} from "@/lib/integrations/google/drive/http";
import {
  getGoogleDriveFilesForUser,
  parseDriveCategoryParam,
} from "@/lib/integrations/google/drive/service";

export async function GET(request: Request): Promise<Response> {
  const { userId } = await auth();
  if (!userId) {
    return Response.json(
      { status: "unauthorized", message: "Unauthorized" },
      { status: 401 },
    );
  }

  const url = new URL(request.url);
  const categoryParam = url.searchParams.get("category");
  const category = parseDriveCategoryParam(categoryParam) ?? "all";
  const query = url.searchParams.get("q");
  const parentId = url.searchParams.get("parentId");
  const context = await resolveFeatureAccessContext();

  try {
    const result = await getGoogleDriveFilesForUser({
      userId,
      category,
      context,
      query,
      parentId,
    });
    return respondGoogleDriveResult(result);
  } catch (error) {
    return respondGoogleDriveCaught(
      error,
      "Google Driveの読み込みに失敗しました",
      "google_drive_list",
    );
  }
}
