import { generateDeliverables } from "@/lib/deliverables/engine";
import { uploadDeliverablesAfterGeneration } from "@/lib/integrations/deliverable-bridge";
import type { IntegrationUploadSummary } from "@/lib/integrations/types";
import {
  applyTemplateVariables,
  createArtifactDataBindings,
  createNeedsInputRequest,
  resolveArtifactContext,
  sanitizeContextForAI,
} from "@/lib/business-profile";
import { recordProfileUsage } from "@/lib/business-profile/usage-log";

import {
  asOptionalString,
  asStringArray,
  asStringRecord,
} from "../../business-profile-utils";

type RequestBody = {
  assignment?: unknown;
  finalDeliverable?: unknown;
  title?: unknown;
  workflowId?: unknown;
  projectName?: unknown;
  formats?: unknown;
  profileId?: unknown;
  contactId?: unknown;
  contactIds?: unknown;
  caseId?: unknown;
  requiredFields?: unknown;
  oneTimeFields?: unknown;
};

const VALID_FORMATS = new Set(["pdf", "docx", "pptx", "md", "txt"]);

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

    const context = await resolveArtifactContext({
      ownerUserId: userId,
      profileId: asOptionalString(body.profileId),
      contactId: asOptionalString(body.contactId),
      contactIds: asStringArray(body.contactIds),
      caseId: asOptionalString(body.caseId),
      template: body.finalDeliverable,
      requiredVariables: asStringArray(body.requiredFields),
      currentRequestFields: asStringRecord(body.oneTimeFields),
    });

    if (context.needsInput.status === "needs_input") {
      const needsInput = createNeedsInputRequest(context);
      return Response.json(
        { status: "needs_input", ...(needsInput ?? {}) },
        { status: 422 },
      );
    }

    const finalDeliverable = applyTemplateVariables(
      body.finalDeliverable,
      context,
      { requiredVariables: asStringArray(body.requiredFields) },
    );

    const result = await generateDeliverables(
      {
        assignment: body.assignment.trim(),
        finalDeliverable,
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

    const usedFieldKeys = context.usedFields.map((field) => field.key);
    const artifactId = result.deliverables[0]?.id ?? null;
    if (usedFieldKeys.length > 0) {
      await recordProfileUsage({
        ownerUserId: userId,
        profileId: context.profile?.id ?? null,
        contactId: context.contacts[0]?.id ?? null,
        caseId: context.project?.id ?? null,
        artifactId,
        purpose: "deliverable_generation",
        fieldKeys: usedFieldKeys,
      });
      if (artifactId) {
        await createArtifactDataBindings({
          ownerUserId: userId,
          artifactId,
          profileId: context.profile?.id ?? null,
          contactId: context.contacts[0]?.id ?? null,
          caseId: context.project?.id ?? null,
          fieldKeys: usedFieldKeys,
        });
      }
    }

    return Response.json({
      deliverables: result.deliverables,
      matchedRule: result.detection.matchedRule,
      uploads,
      businessProfile: {
        usedFieldKeys,
        unusedFieldKeys: context.unusedFields.map((field) => field.key),
        sources: context.usedFields.map((field) => ({
          key: field.key,
          sourceKind: field.sourceKind,
        })),
        aiPreview: sanitizeContextForAI(context),
      },
    });
  } catch (error) {
    console.error("[Atlas /api/deliverables/generate]", error);
    return Response.json(
      { error: "Failed to generate deliverables" },
      { status: 500 },
    );
  }
}
