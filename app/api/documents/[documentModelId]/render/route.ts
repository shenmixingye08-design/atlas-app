import { rerenderDeliverables } from "@/lib/deliverables/engine";
import { buildDeliverableBaseName } from "@/lib/deliverables/filename";
import { getDocumentModel } from "@/lib/documents/storage/document-store";
import { renderDocumentModelToHtml } from "@/lib/documents/render/render-to-html";
import type { OutputFormat, TemplateId } from "@/lib/documents/schema/enums";
import { OUTPUT_FORMATS, TEMPLATE_IDS } from "@/lib/documents/schema/enums";
import { enforceDocumentRenderRateLimit } from "@/lib/http/enforce-action-rate-limit";
import { assertDocumentModelAccess } from "@/lib/security/resource-ownership";

export const runtime = "nodejs";

type RenderBody = {
  formats?: unknown;
  templateId?: unknown;
  assignment?: unknown;
};

function resolveOrigin(request: Request): string {
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  const protocol = request.headers.get("x-forwarded-proto") ?? "http";
  if (host) return `${protocol}://${host}`;
  return new URL(request.url).origin;
}

function parseFormats(value: unknown): OutputFormat[] {
  if (!Array.isArray(value)) return ["pdf"];
  return value.filter(
    (item): item is OutputFormat =>
      typeof item === "string" && (OUTPUT_FORMATS as readonly string[]).includes(item),
  );
}

function parseTemplateId(value: unknown): TemplateId | undefined {
  if (typeof value !== "string") return undefined;
  return (TEMPLATE_IDS as readonly string[]).includes(value)
    ? (value as TemplateId)
    : undefined;
}

/** GET — HTML preview from stored IR (no AI). */
export async function GET(
  _request: Request,
  context: { params: Promise<{ documentModelId: string }> },
): Promise<Response> {
  const { auth } = await import("@clerk/nextjs/server");
  const { userId } = await auth();
  if (!userId) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { documentModelId } = await context.params;
  const access = assertDocumentModelAccess({ documentModelId, userId });
  if (!access.ok) {
    return Response.json({ error: access.error }, { status: access.status });
  }

  const stored = getDocumentModel(documentModelId);
  if (!stored) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }

  const html = renderDocumentModelToHtml(stored.model);
  return Response.json({ html, model: stored.model });
}

/** POST — re-render format/template from IR without AI. */
export async function POST(
  request: Request,
  context: { params: Promise<{ documentModelId: string }> },
): Promise<Response> {
  const { auth } = await import("@clerk/nextjs/server");
  const { userId } = await auth();
  if (!userId) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rateLimited = enforceDocumentRenderRateLimit(userId);
  if (rateLimited) return rateLimited;

  const { documentModelId } = await context.params;
  const access = assertDocumentModelAccess({ documentModelId, userId });
  if (!access.ok) {
    return Response.json({ error: access.error }, { status: access.status });
  }

  const stored = getDocumentModel(documentModelId);
  if (!stored) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }

  let body: RenderBody = {};
  try {
    body = (await request.json()) as RenderBody;
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const formats = parseFormats(body.formats);
  const templateId = parseTemplateId(body.templateId);
  const assignment =
    typeof body.assignment === "string" ? body.assignment : stored.model.title;

  try {
    const deliverables = await rerenderDeliverables(documentModelId, {
      formats,
      templateId,
      baseFileName: buildDeliverableBaseName(assignment, stored.model.title),
      requestOrigin: resolveOrigin(request),
      userId,
    });
    return Response.json({ deliverables, documentModelId });
  } catch (error) {
    console.error("[documents/render]", error);
    return Response.json(
      {
        error: error instanceof Error ? error.message : "Render failed",
        nextStep: "別の形式を選ぶか、しばらくしてから再試行してください",
      },
      { status: 422 },
    );
  }
}
