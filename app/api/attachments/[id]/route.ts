import { auth } from "@clerk/nextjs/server";

import { getStoredAttachment } from "@/lib/attachments/store";
import { verifyAttachmentSignedToken } from "@/lib/attachments/signed-url";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function GET(
  request: Request,
  context: RouteContext,
): Promise<Response> {
  const { id } = await context.params;
  const token = new URL(request.url).searchParams.get("token");

  let authorizedUserId: string | null = null;

  if (token) {
    const verified = verifyAttachmentSignedToken(token);
    if (!verified.ok) {
      return Response.json(
        {
          error:
            verified.reason === "expired"
              ? "署名付きURLの有効期限が切れています。画像をもう一度添付してください。"
              : "無効な署名付きURLです。",
          code:
            verified.reason === "expired" ? "signed_url_expired" : "signed_url_invalid",
        },
        { status: 403 },
      );
    }
    if (verified.payload.id !== id) {
      return Response.json(
        { error: "Forbidden", code: "signed_url_mismatch" },
        { status: 403 },
      );
    }
    authorizedUserId = verified.payload.userId;
  } else {
    const { userId } = await auth();
    if (!userId) {
      return Response.json(
        { status: "unauthorized", message: "Unauthorized" },
        { status: 401 },
      );
    }
    authorizedUserId = userId;
  }

  const stored = getStoredAttachment(id);

  if (!stored) {
    return Response.json(
      {
        error: "画像が見つからないか、有効期限が切れています。もう一度添付してください。",
        code: "not_found",
      },
      { status: 404 },
    );
  }

  if (stored.userId && stored.userId !== authorizedUserId) {
    return Response.json(
      { error: "Forbidden", code: "forbidden" },
      { status: 403 },
    );
  }

  return new Response(new Uint8Array(stored.buffer), {
    status: 200,
    headers: {
      "Content-Type": stored.mimeType,
      "Content-Disposition": `inline; filename*=UTF-8''${encodeURIComponent(stored.fileName)}`,
      "Content-Length": String(stored.buffer.byteLength),
      "Cache-Control": "private, max-age=300",
    },
  });
}
