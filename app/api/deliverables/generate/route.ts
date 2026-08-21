import {
  assertWordContentLimits,
  assertWordTableLimits,
  enforceWordGenerateRateLimit,
  releaseWordGenerateSlot,
} from "@/lib/deliverables/word-rate-limit";
import { generateDeliverables } from "@/lib/deliverables/engine";
import { enforceAiRateLimit } from "@/lib/http/enforce-ai-rate-limit";
import { uploadDeliverablesAfterGeneration } from "@/lib/integrations/deliverable-bridge";
import type { IntegrationUploadSummary } from "@/lib/integrations/types";
import {
  assertSafeExportText,
  needsRegenerationResponse,
} from "@/lib/orchestration/normalize-deliverable-payload";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
/** Word/PDF multi-format generation can exceed default serverless limits. */
export const maxDuration = 300;

type RequestBody = {
  assignment?: unknown;
  finalDeliverable?: unknown;
  title?: unknown;
  workflowId?: unknown;
  projectName?: unknown;
  formats?: unknown;
  templateId?: unknown;
  companyName?: unknown;
  recipient?: unknown;
  author?: unknown;
  createdAt?: unknown;
};

const VALID_FORMATS = new Set(["pdf", "docx", "pptx", "md", "txt", "xlsx"]);

function parseFormats(value: unknown): import("@/lib/deliverables/types").DeliverableFormat[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const formats = value.filter(
    (item): item is import("@/lib/deliverables/types").DeliverableFormat =>
      typeof item === "string" && VALID_FORMATS.has(item),
  );
  return formats.length > 0 ? formats : undefined;
}

function resolveOrigin(request: Request): string {
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  const protocol = request.headers.get("x-forwarded-proto") ?? "http";

  if (host) {
    return `${protocol}://${host}`;
  }

  return new URL(request.url).origin;
}

function resolveProjectName(body: RequestBody): string {
  if (typeof body.projectName === "string" && body.projectName.trim()) {
    return body.projectName.trim();
  }

  if (typeof body.title === "string" && body.title.trim()) {
    return body.title.trim();
  }

  if (typeof body.assignment === "string" && body.assignment.trim()) {
    return body.assignment.trim().slice(0, 80);
  }

  return "Untitled Project";
}

export async function POST(request: Request): Promise<Response> {
  const { auth } = await import("@clerk/nextjs/server");
  const { userId } = await auth();
  if (!userId) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const aiLimited = await enforceAiRateLimit(userId);
  if (aiLimited) return aiLimited;

  const rateLimited = await enforceWordGenerateRateLimit(userId);
  if (rateLimited) return rateLimited;

  const { requireBillingForAssignment } = await import("@/lib/billing/access");

  let body: RequestBody;

  try {
    body = (await request.json()) as RequestBody;
  } catch {
    releaseWordGenerateSlot(userId);
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (typeof body.assignment !== "string" || !body.assignment.trim()) {
    releaseWordGenerateSlot(userId);
    return Response.json(
      { error: "assignment is required and must be a non-empty string" },
      { status: 400 },
    );
  }

  const billingDenied = await requireBillingForAssignment(userId, {
    assignment: body.assignment.trim(),
  });
  if (billingDenied) {
    releaseWordGenerateSlot(userId);
    return billingDenied;
  }

  if (
    typeof body.finalDeliverable !== "string" ||
    !body.finalDeliverable.trim()
  ) {
    releaseWordGenerateSlot(userId);
    return Response.json(
      { error: "finalDeliverable is required and must be a non-empty string" },
      { status: 400 },
    );
  }

  const contentLimit = assertWordContentLimits(body.finalDeliverable);
  if (contentLimit) {
    releaseWordGenerateSlot(userId);
    return contentLimit;
  }
  const tableLimit = assertWordTableLimits(body.finalDeliverable);
  if (tableLimit) {
    releaseWordGenerateSlot(userId);
    return tableLimit;
  }

  const exportGuard = assertSafeExportText(body.finalDeliverable);
  if (!exportGuard.ok) {
    releaseWordGenerateSlot(userId);
    return Response.json(
      {
        ...needsRegenerationResponse(),
        error: needsRegenerationResponse().message,
      },
      { status: 422 },
    );
  }

  if (body.title !== undefined && typeof body.title !== "string") {
    releaseWordGenerateSlot(userId);
    return Response.json({ error: "title must be a string" }, { status: 400 });
  }

  if (body.workflowId !== undefined && typeof body.workflowId !== "string") {
    releaseWordGenerateSlot(userId);
    return Response.json({ error: "workflowId must be a string" }, { status: 400 });
  }

  if (body.templateId !== undefined && typeof body.templateId !== "string") {
    releaseWordGenerateSlot(userId);
    return Response.json({ error: "templateId must be a string" }, { status: 400 });
  }

  for (const key of ["companyName", "recipient", "author", "createdAt"] as const) {
    if (body[key] !== undefined && typeof body[key] !== "string") {
      releaseWordGenerateSlot(userId);
      return Response.json({ error: `${key} must be a string` }, { status: 400 });
    }
  }

  // Consume only after the request is valid. Invalid body must not spend Usage,
  // and a missing Idempotency-Key must not invent a new claim on 400 retries.
  const { requireAndConsumeAiJob } = await import("@/lib/billing/access");
  const quotaDenied = await requireAndConsumeAiJob(
    userId,
    "deliverables_generate",
    request.headers.get("idempotency-key")?.trim() ||
      request.headers.get("x-atlas-job-id")?.trim() ||
      crypto.randomUUID(),
  );
  if (quotaDenied) {
    releaseWordGenerateSlot(userId);
    return quotaDenied;
  }

  try {
    const origin = resolveOrigin(request);
    const projectName = resolveProjectName(body);
    const workflowId =
      typeof body.workflowId === "string" ? body.workflowId : null;

    const result = await generateDeliverables(
      {
        assignment: body.assignment.trim(),
        finalDeliverable: body.finalDeliverable,
        title: typeof body.title === "string" ? body.title : undefined,
        formats: parseFormats(body.formats),
      },
      origin,
      {
        userId,
        templateId:
          typeof body.templateId === "string" ? body.templateId.trim() : null,
        companyName:
          typeof body.companyName === "string" ? body.companyName.trim() : undefined,
        recipient:
          typeof body.recipient === "string" ? body.recipient.trim() : undefined,
        author: typeof body.author === "string" ? body.author.trim() : undefined,
        createdAt:
          typeof body.createdAt === "string" ? body.createdAt.trim() : undefined,
      },
    );

    let uploads: IntegrationUploadSummary = {
      workflowId,
      projectName,
      provider: null,
      storageLocation: null,
      folderUrl: null,
      uploads: [],
      status: null,
    };

    if (result.deliverables.length > 0) {
      uploads = await uploadDeliverablesAfterGeneration({
        userId,
        deliverables: result.deliverables,
        projectName,
        workflowId,
      });
    }

    return Response.json({
      deliverables: result.deliverables,
      matchedRule: result.detection.matchedRule,
      uploads,
      jobId: result.jobId,
    });
  } catch (error) {
    console.error("[Atlas /api/deliverables/generate]", error);
    return Response.json(
      { error: "Failed to generate deliverables" },
      { status: 500 },
    );
  } finally {
    releaseWordGenerateSlot(userId);
  }
}
