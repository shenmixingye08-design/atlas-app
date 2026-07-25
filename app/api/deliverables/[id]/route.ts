import { auth } from "@clerk/nextjs/server";

import { buildAttachmentContentDisposition } from "@/lib/http/content-disposition";
import { getStoredDeliverableForUser } from "@/lib/deliverables/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function GET(
  _request: Request,
  context: RouteContext,
): Promise<Response> {
  const { userId } = await auth();
  if (!userId) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await context.params;
  const stored = getStoredDeliverableForUser(id, userId);

  if (!stored) {
    // Same message for missing and non-owned — avoid id enumeration.
    return Response.json({ error: "Deliverable not found or expired" }, { status: 404 });
  }

  const body = new Uint8Array(stored.buffer);
  if (body.byteLength === 0) {
    return Response.json({ error: "Deliverable file is empty" }, { status: 500 });
  }

  return new Response(body, {
    status: 200,
    headers: {
      "Content-Type": stored.mimeType,
      "Content-Disposition": buildAttachmentContentDisposition(stored.fileName),
      "Content-Length": String(body.byteLength),
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
