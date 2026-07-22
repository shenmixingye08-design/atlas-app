import { generateDeliverables } from "@/lib/deliverables/engine";
import { uploadDeliverablesAfterGeneration } from "@/lib/integrations/deliverable-bridge";
import type { IntegrationUploadSummary } from "@/lib/integrations/types";

type RequestBody = {
  assignment?: unknown;
  finalDeliverable?: unknown;
  title?: unknown;
  workflowId?: unknown;
  projectName?: unknown;
  formats?: unknown;
};

const VALID_FORMATS = new Set([
  "pdf",
  "docx",
  "pptx",
  "xlsx",
  "md",
  "txt",
  "csv",
]);

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

  const { requireBillingForAssignment } = await import("@/lib/billing/access");

  let body: RequestBody;

  try {
    body = (await request.json()) as RequestBody;
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (typeof body.assignment !== "string" || !body.assignment.trim()) {
    return Response.json(
      { error: "assignment is required and must be a non-empty string" },
      { status: 400 },
    );
  }

  const billingDenied = await requireBillingForAssignment(userId, {
    assignment: body.assignment.trim(),
  });
  if (billingDenied) return billingDenied;

  if (
    typeof body.finalDeliverable !== "string" ||
    !body.finalDeliverable.trim()
  ) {
    return Response.json(
      { error: "finalDeliverable is required and must be a non-empty string" },
      { status: 400 },
    );
  }

  if (body.title !== undefined && typeof body.title !== "string") {
    return Response.json({ error: "title must be a string" }, { status: 400 });
  }

  if (body.workflowId !== undefined && typeof body.workflowId !== "string") {
    return Response.json({ error: "workflowId must be a string" }, { status: 400 });
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
        deliverables: result.deliverables,
        projectName,
        workflowId,
      });
    }

    return Response.json({
      deliverables: result.deliverables,
      matchedRule: result.detection.matchedRule,
      uploads,
    });
  } catch (error) {
    console.error("[Atlas /api/deliverables/generate]", error);
    return Response.json(
      { error: "Failed to generate deliverables" },
      { status: 500 },
    );
  }
}
