import { auth } from "@clerk/nextjs/server";

import {
  normalizeToStructuredDocument,
  structuredDocumentToMarkdown,
} from "@/lib/deliverables/document";
import { buildAttachmentContentDisposition } from "@/lib/http/content-disposition";
import { buildDeliverableBaseName } from "@/lib/deliverables/filename";
import { getDeliverableGenerator } from "@/lib/deliverables/generators";
import type { DeliverableFormat } from "@/lib/deliverables/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const VALID_FORMATS = new Set<DeliverableFormat>([
  "pdf",
  "docx",
  "pptx",
  "md",
  "txt",
  "xlsx",
]);

type RequestBody = {
  format?: unknown;
  content?: unknown;
  title?: unknown;
  fileName?: unknown;
};

/**
 * On-demand Word/PDF/etc export from content.
 * Does not depend on the ephemeral in-memory deliverable store —
 * used as a reliable fallback when `/api/deliverables/:id` 404s
 * across serverless instances.
 */
export async function POST(request: Request): Promise<Response> {
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

  const format =
    typeof body.format === "string" && VALID_FORMATS.has(body.format as DeliverableFormat)
      ? (body.format as DeliverableFormat)
      : null;
  const content = typeof body.content === "string" ? body.content.trim() : "";

  if (!format) {
    return Response.json({ error: "format is required" }, { status: 400 });
  }
  if (!content) {
    return Response.json({ error: "content is required" }, { status: 400 });
  }

  const generator = getDeliverableGenerator(format);
  if (!generator) {
    return Response.json({ error: "unsupported_format" }, { status: 400 });
  }

  const baseFileName =
    typeof body.fileName === "string" && body.fileName.trim()
      ? body.fileName.replace(/\.[^.]+$/, "").trim()
      : buildDeliverableBaseName(
          content.slice(0, 80),
          typeof body.title === "string" ? body.title : undefined,
        );

  try {
    const normalized = normalizeToStructuredDocument(content, {
      titleHint: baseFileName,
    });
    const canonicalSource = structuredDocumentToMarkdown(normalized.document);
    const file = await generator.generate(canonicalSource, baseFileName);
    if (file.buffer.byteLength === 0) {
      return Response.json({ error: "Deliverable file is empty" }, { status: 500 });
    }

    return new Response(new Uint8Array(file.buffer), {
      status: 200,
      headers: {
        "Content-Type": file.mimeType,
        "Content-Disposition": buildAttachmentContentDisposition(file.fileName),
        "Content-Length": String(file.buffer.byteLength),
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    console.error("[Atlas /api/deliverables/export]", error);
    return Response.json({ error: "Failed to export deliverable" }, { status: 500 });
  }
}
