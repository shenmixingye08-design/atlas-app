import { auth } from "@clerk/nextjs/server";

import { refreshWordDownloadAccess } from "@/lib/deliverables/word-completion-gate";
import { userMessageForFailure } from "@/lib/deliverables/recovery-messages";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ id: string }>;
};

/**
 * Re-issue a download URL for an owned Word deliverable.
 * Session-auth proxy URLs do not expire; this re-validates ownership and
 * returns a fresh same-origin path (signed Storage URL refresh point).
 */
export async function GET(
  _request: Request,
  context: RouteContext,
): Promise<Response> {
  const { userId } = await auth();
  if (!userId) {
    return Response.json(
      { error: userMessageForFailure("auth") },
      { status: 401 },
    );
  }

  const { id } = await context.params;
  const access = await refreshWordDownloadAccess({
    userId,
    deliverableId: id,
  });

  if (!access.ok) {
    const status =
      access.errorCode === "AUTHENTICATION_FAILED" ? 404 : 409;
    return Response.json(
      {
        error:
          access.errorCode === "AUTHENTICATION_FAILED"
            ? "成果物が見つかりません。"
            : "ダウンロードの再発行に失敗しました。もう一度お試しください。",
        code: access.errorCode,
      },
      { status },
    );
  }

  return Response.json({
    ok: true,
    downloadUrl: access.downloadUrl,
    expiresAt: access.expiresAt,
    fileName: access.fileName,
    sizeBytes: access.sizeBytes,
  });
}
