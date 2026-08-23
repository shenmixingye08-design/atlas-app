import { auth } from "@clerk/nextjs/server";

import { resolveFeatureAccessContext } from "@/lib/feature-flags/resolve-context";
import {
  respondGoogleDriveCaught,
  respondGoogleDriveResult,
} from "@/lib/integrations/google/drive/http";
import { downloadGoogleDriveFileForUser } from "@/lib/integrations/google/drive/service";

type Params = { params: Promise<{ fileId: string }> };

export async function GET(
  _request: Request,
  { params }: Params,
): Promise<Response> {
  const { userId } = await auth();
  if (!userId) {
    return Response.json(
      { status: "unauthorized", message: "Unauthorized" },
      { status: 401 },
    );
  }

  const { fileId } = await params;
  const context = await resolveFeatureAccessContext();

  try {
    const result = await downloadGoogleDriveFileForUser({
      userId,
      context,
      fileId,
    });

    if (result.status !== "ready") {
      return respondGoogleDriveResult(result);
    }

    return new Response(new Uint8Array(result.buffer), {
      status: 200,
      headers: {
        "Content-Type": result.contentType,
        "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(result.fileName)}`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    return respondGoogleDriveCaught(
      error,
      "Google Driveファイルのダウンロードに失敗しました",
      "google_drive_download",
    );
  }
}
