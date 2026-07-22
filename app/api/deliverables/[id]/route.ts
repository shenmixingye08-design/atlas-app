import { getStoredDeliverable } from "@/lib/deliverables/store";

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

  const encoded = encodeURIComponent(stored.fileName).replace(/['()]/g, escape);
  const asciiFallback = stored.fileName.replace(/[^\x20-\x7E]/g, "_") || "download";

  return new Response(new Uint8Array(stored.buffer), {
    status: 200,
    headers: {
      "Content-Type": stored.mimeType,
      "Content-Disposition": `attachment; filename="${asciiFallback}"; filename*=UTF-8''${encoded}`,
      "Content-Length": String(stored.buffer.byteLength),
      "Cache-Control": "private, max-age=3600",
    },
  });
}
