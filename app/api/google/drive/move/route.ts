import { auth } from "@clerk/nextjs/server";

import { resolveFeatureAccessContext } from "@/lib/feature-flags/resolve-context";
import {
  respondGoogleDriveCaught,
  respondGoogleDriveResult,
} from "@/lib/integrations/google/drive/http";
import { moveGoogleDriveFileForUser } from "@/lib/integrations/google/drive/service";

export async function POST(request: Request): Promise<Response> {
  const { userId } = await auth();
  if (!userId) {
    return Response.json(
      { status: "unauthorized", message: "Unauthorized" },
      { status: 401 },
    );
  }

  const body = (await request.json().catch(() => null)) as {
    fileId?: string;
    destinationFolderId?: string;
  } | null;

  if (!body?.fileId?.trim() || !body.destinationFolderId?.trim()) {
    return Response.json(
      { status: "error", message: "fileId and destinationFolderId are required" },
      { status: 400 },
    );
  }

  const context = await resolveFeatureAccessContext();

  try {
    const result = await moveGoogleDriveFileForUser({
      userId,
      context,
      fileId: body.fileId.trim(),
      destinationFolderId: body.destinationFolderId.trim(),
    });

    return respondGoogleDriveResult(result);
  } catch (error) {
    return respondGoogleDriveCaught(
      error,
      "Google Driveファイルの移動に失敗しました",
      "google_drive_move",
    );
  }
}
