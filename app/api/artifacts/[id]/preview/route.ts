import { auth } from "@clerk/nextjs/server";

import {
  buildUnifiedPreview,
  ArtifactPlatformError,
} from "@/lib/artifact-platform";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(
  _request: Request,
  context: RouteContext
): Promise<Response> {
  const { userId } = await auth();
  if (!userId) {
    return Response.json({ error: "認証が必要です。" }, { status: 401 });
  }
  const { id } = await context.params;
  try {
    const preview = await buildUnifiedPreview({ artifactId: id, userId });
    return Response.json(preview);
  } catch (error) {
    if (error instanceof ArtifactPlatformError) {
      return Response.json(
        {
          ...error.toClientJson(),
          downloadUrl: `/api/deliverables/${id}`,
        },
        { status: error.code === "permission_denied" ? 403 : 404 }
      );
    }
    return Response.json(
      {
        error: "プレビューに失敗しました。ダウンロードは可能です。",
        downloadUrl: `/api/deliverables/${id}`,
      },
      { status: 500 }
    );
  }
}
