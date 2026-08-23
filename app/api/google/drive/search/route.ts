import { auth } from "@clerk/nextjs/server";

import { resolveFeatureAccessContext } from "@/lib/feature-flags/resolve-context";
import {
  respondGoogleDriveCaught,
  respondGoogleDriveResult,
} from "@/lib/integrations/google/drive/http";
import { searchGoogleDriveForUser } from "@/lib/integrations/google/drive/service";

export async function GET(request: Request): Promise<Response> {
  const { userId } = await auth();
  if (!userId) {
    return Response.json(
      { status: "unauthorized", message: "Unauthorized" },
      { status: 401 },
    );
  }

  const url = new URL(request.url);
  const query = url.searchParams.get("q")?.trim();
  if (!query) {
    return Response.json(
      { status: "error", message: "q is required" },
      { status: 400 },
    );
  }

  const parentId = url.searchParams.get("parentId");
  const context = await resolveFeatureAccessContext();

  try {
    const result = await searchGoogleDriveForUser({
      userId,
      context,
      query,
      parentId,
    });
    return respondGoogleDriveResult(result);
  } catch (error) {
    return respondGoogleDriveCaught(
      error,
      "Google Driveの検索に失敗しました",
      "google_drive_search",
    );
  }
}
