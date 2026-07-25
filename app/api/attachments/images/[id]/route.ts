import { auth } from "@clerk/nextjs/server";

import {
  deleteImageAttachment,
  getImageAttachmentForUser,
  readProcessedImageBytes,
} from "@/lib/attachments";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(
  _request: Request,
  context: RouteContext,
): Promise<Response> {
  const { userId } = await auth();
  if (!userId) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await context.params;
  const bytes = await readProcessedImageBytes(userId, id);
  if (!bytes) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }

  return new Response(new Uint8Array(bytes.buffer), {
    status: 200,
    headers: {
      "Content-Type": bytes.mimeType,
      "Cache-Control": "private, max-age=60",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

export async function DELETE(
  _request: Request,
  context: RouteContext,
): Promise<Response> {
  const { userId } = await auth();
  if (!userId) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await context.params;
  const existing = await getImageAttachmentForUser(userId, id);
  if (!existing) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }

  const deleted = await deleteImageAttachment(userId, id);
  if (!deleted) {
    return Response.json({ error: "削除に失敗しました" }, { status: 500 });
  }
  return Response.json({ ok: true });
}
