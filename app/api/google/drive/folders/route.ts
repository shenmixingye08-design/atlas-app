import { auth } from "@clerk/nextjs/server";

import { resolveFeatureAccessContext } from "@/lib/feature-flags/resolve-context";
import {
  respondGoogleDriveCaught,
  respondGoogleDriveResult,
} from "@/lib/integrations/google/drive/http";
import { getGoogleDriveFoldersForUser } from "@/lib/integrations/google/drive/service";

export async function GET(request: Request): Promise<Response> {
  const { userId } = await auth();
  if (!userId) {
    return Response.json(
      { status: "unauthorized", message: "Unauthorized" },
      { status: 401 },
    );
  }

  const parentId = new URL(request.url).searchParams.get("parentId");
  const context = await resolveFeatureAccessContext();

  try {
    const result = await getGoogleDriveFoldersForUser({
      userId,
      context,
      parentId,
    });
    return respondGoogleDriveResult(result);
  } catch (error) {
    return respondGoogleDriveCaught(
      error,
      "Google Driveフォルダの読み込みに失敗しました",
      "google_drive_folders",
    );
  }
}
