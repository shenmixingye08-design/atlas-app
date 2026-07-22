import { auth } from "@clerk/nextjs/server";

import { assertDeliverableDownloadAccess } from "@/lib/security/resource-ownership";

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
  const access = assertDeliverableDownloadAccess({ deliverableId: id, userId });
  if (!access.ok) {
    return Response.json({ error: access.error }, { status: access.status });
  }

  return new Response(new Uint8Array(access.buffer), {
    status: 200,
    headers: {
      "Content-Type": access.mimeType,
      "Content-Disposition": `attachment; filename="${encodeURIComponent(access.fileName)}"`,
      "Content-Length": String(access.buffer.byteLength),
      "Cache-Control": "private, max-age=3600",
    },
  });
}
