import { buildAttachmentContentDisposition } from "@/lib/http/content-disposition";
import { getStoredDeliverable } from "@/lib/deliverables/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function GET(
  _request: Request,
  context: RouteContext,
): Promise<Response> {
  const { id } = await context.params;
  const stored = getStoredDeliverable(id);

  if (!stored) {
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
