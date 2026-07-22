import { exportOfficeDeliverable, isExportableOfficeFormat, assertNonEmptyFile } from "@/lib/deliverables/export-file";
import { buildContentDisposition } from "@/lib/deliverables/http-headers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RequestBody = {
  format?: unknown;
  content?: unknown;
  assignment?: unknown;
  title?: unknown;
};

/**
 * On-demand Word/PDF export — works on any Vercel serverless instance.
 * Does not rely on the ephemeral in-memory file store.
 */
export async function POST(request: Request): Promise<Response> {
  const { auth } = await import("@clerk/nextjs/server");
  const { userId } = await auth();
  if (!userId) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: RequestBody;
  try {
    body = (await request.json()) as RequestBody;
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (typeof body.format !== "string" || !isExportableOfficeFormat(body.format)) {
    return Response.json(
      { error: "format must be \"docx\" or \"pdf\"" },
      { status: 400 },
    );
  }

  if (typeof body.content !== "string" || !body.content.trim()) {
    return Response.json(
      { error: "content is required and must be a non-empty string" },
      { status: 400 },
    );
  }

  const format = body.format;
  const assignment =
    typeof body.assignment === "string" ? body.assignment : undefined;
  const title = typeof body.title === "string" ? body.title : undefined;

  try {
    const file = await exportOfficeDeliverable({
      format,
      content: body.content,
      assignment,
      title,
    });
    assertNonEmptyFile(file, format);

    console.info("[Atlas /api/deliverables/export] generated", {
      format,
      fileName: file.fileName,
      sizeBytes: file.buffer.byteLength,
      userId,
    });

    return new Response(new Uint8Array(file.buffer), {
      status: 200,
      headers: {
        "Content-Type": file.mimeType,
        "Content-Disposition": buildContentDisposition(file.fileName),
        "Content-Length": String(file.buffer.byteLength),
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown export error";
    console.error("[Atlas /api/deliverables/export] failed", {
      format,
      message,
      error,
    });

    return Response.json(
      {
        error:
          format === "docx"
            ? "Word生成に失敗しました"
            : "PDF生成に失敗しました",
        cause: message,
      },
      { status: 500 },
    );
  }
}
