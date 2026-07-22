import { auth } from "@clerk/nextjs/server";

import { getStoredAttachment } from "@/lib/attachments/store";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function GET(
  _request: Request,
  context: RouteContext,
): Promise<Response> {
  const { userId } = await auth();
  if (!userId) {
    return Response.json(
      { status: "unauthorized", message: "Unauthorized" },
      { status: 401 },
    );
  }

  const { id } = await context.params;
  const stored = getStoredAttachment(id);

  if (!stored) {
    return Response.json(
      { error: "Attachment not found or expired" },
      { status: 404 },
    );
  }

  if (stored.userId && stored.userId !== userId) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  return new Response(new Uint8Array(stored.buffer), {
    status: 200,
    headers: {
      "Content-Type": stored.mimeType,
      "Content-Disposition": `inline; filename="${encodeURIComponent(stored.fileName)}"`,
      "Content-Length": String(stored.buffer.byteLength),
      "Cache-Control": "private, max-age=3600",
    },
  });
}
