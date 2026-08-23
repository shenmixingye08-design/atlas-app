import { auth } from "@clerk/nextjs/server";

import { resolveFeatureAccessContext } from "@/lib/feature-flags/resolve-context";
import {
  respondGoogleDriveCaught,
  respondGoogleDriveResult,
} from "@/lib/integrations/google/drive/http";
import { getRecentGoogleDriveFilesForUser } from "@/lib/integrations/google/drive/service";

export async function GET(request: Request): Promise<Response> {
  const { userId } = await auth();
  if (!userId) {
    return Response.json(
      { status: "unauthorized", message: "Unauthorized" },
      { status: 401 },
    );
  }

  const limitParam = new URL(request.url).searchParams.get("limit");
  const maxResults = limitParam ? Number.parseInt(limitParam, 10) : 8;
  const context = await resolveFeatureAccessContext();

  try {
    const result = await getRecentGoogleDriveFilesForUser({
      userId,
      context,
      maxResults: Number.isFinite(maxResults) ? maxResults : 8,
    });
    return respondGoogleDriveResult(result);
  } catch (error) {
    return respondGoogleDriveCaught(
      error,
      "最近のDriveファイルの読み込みに失敗しました",
      "google_drive_recent",
    );
  }
}
