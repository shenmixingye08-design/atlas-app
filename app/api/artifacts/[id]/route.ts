import { auth } from "@clerk/nextjs/server";

import {
  getArtifactDetail,
  softDeleteArtifact,
  restoreArtifact,
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
  const detail = await getArtifactDetail({ id, userId });
  if (!detail) {
    return Response.json({ error: "成果物が見つかりません。" }, { status: 404 });
  }
  return Response.json(detail);
}

export async function DELETE(
  request: Request,
  context: RouteContext
): Promise<Response> {
  const { userId } = await auth();
  if (!userId) {
    return Response.json({ error: "認証が必要です。" }, { status: 401 });
  }
  const { id } = await context.params;
  const url = new URL(request.url);
  const force = url.searchParams.get("force") === "1";
  try {
    const result = await softDeleteArtifact({ artifactId: id, userId, force });
    return Response.json(result, {
      status: result.requiresConfirmation ? 409 : 200,
    });
  } catch (error) {
    if (error instanceof ArtifactPlatformError) {
      return Response.json(error.toClientJson(), {
        status: error.code === "permission_denied" ? 403 : 404,
      });
    }
    return Response.json({ error: "削除に失敗しました。" }, { status: 500 });
  }
}

export async function PATCH(
  request: Request,
  context: RouteContext
): Promise<Response> {
  const { userId } = await auth();
  if (!userId) {
    return Response.json({ error: "認証が必要です。" }, { status: 401 });
  }
  const { id } = await context.params;
  const body = (await request.json().catch(() => ({}))) as { action?: string };
  if (body.action === "restore") {
    const result = await restoreArtifact({ artifactId: id, userId });
    return Response.json(result, { status: result.ok ? 200 : 400 });
  }
  return Response.json({ error: "未対応の操作です。" }, { status: 400 });
}
