import { auth } from "@clerk/nextjs/server";

import { assertExportPathHasNoAiRegenerate } from "@/lib/deliverables/ai-export-policy";
import { generateDeliverables } from "@/lib/deliverables/engine";
import {
  getStoredDeliverableForUser,
  updateStoredDeliverableMetadata,
} from "@/lib/deliverables/store";
import {
  assertWordContentLimits,
  assertWordTableLimits,
  enforceWordGenerateRateLimit,
  releaseWordGenerateSlot,
  WORD_REGENERATE_MAX_PER_GROUP,
} from "@/lib/deliverables/word-rate-limit";
import { trackWordEvent } from "@/lib/deliverables/word-analytics";
import {
  createVersionGroup,
  findVersionGroupByDeliverableIdAsync,
  listDeliverableVersionsAsync,
} from "@/lib/deliverables/versioning";
import { isWordTemplateId } from "@/lib/deliverables/word-templates";
import { assertSafeExportText } from "@/lib/orchestration/normalize-deliverable-payload";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

type Replacement = {
  from: string;
  to: string;
};

type EditFields = {
  title?: string;
  content?: string;
  prepend?: string;
  append?: string;
  replacements: Replacement[];
};

type RequestBody = {
  parentDeliverableId?: unknown;
  finalDeliverable?: unknown;
  title?: unknown;
  revisionReason?: unknown;
  templateId?: unknown;
  editFields?: unknown;
};

function stringField(value: unknown, field: string): string | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== "string") {
    throw new Error(`${field}_must_be_string`);
  }
  return value.trim();
}

function parseReplacements(value: unknown): Replacement[] {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) {
    throw new Error("replacements_must_be_array");
  }
  return value.map((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      throw new Error("replacement_must_be_object");
    }
    const record = item as Record<string, unknown>;
    const from = stringField(record.from, "replacement.from");
    const to = stringField(record.to, "replacement.to");
    if (!from) throw new Error("replacement_from_required");
    return { from, to: to ?? "" };
  });
}

function parseEditFields(value: unknown): EditFields {
  if (value === undefined || value === null) {
    return { replacements: [] };
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("editFields_must_be_object");
  }
  const record = value as Record<string, unknown>;
  return {
    title: stringField(record.title, "editFields.title"),
    content: stringField(record.content, "editFields.content"),
    prepend: stringField(record.prepend, "editFields.prepend"),
    append: stringField(record.append, "editFields.append"),
    replacements: parseReplacements(record.replacements),
  };
}

function applyEditFields(source: string, fields: EditFields): string {
  let next = fields.content?.trim() ? fields.content : source;
  for (const replacement of fields.replacements) {
    next = next.split(replacement.from).join(replacement.to);
  }
  if (fields.prepend?.trim()) {
    next = `${fields.prepend.trim()}\n\n${next}`;
  }
  if (fields.append?.trim()) {
    next = `${next}\n\n${fields.append.trim()}`;
  }
  return next;
}

function resolveOrigin(request: Request): string {
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  const protocol = request.headers.get("x-forwarded-proto") ?? "http";
  return host ? `${protocol}://${host}` : new URL(request.url).origin;
}

export async function POST(request: Request): Promise<Response> {
  const { userId } = await auth();
  if (!userId) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rateLimited = enforceWordGenerateRateLimit(userId);
  if (rateLimited) return rateLimited;

  try {
    let body: RequestBody;
    try {
      body = (await request.json()) as RequestBody;
    } catch {
      return Response.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const parentDeliverableId = stringField(
      body.parentDeliverableId,
      "parentDeliverableId",
    );
    if (!parentDeliverableId) {
      return Response.json(
        { error: "parentDeliverableId is required" },
        { status: 400 },
      );
    }

    const parent = await getStoredDeliverableForUser(parentDeliverableId, userId);
    if (!parent) {
      return Response.json({ error: "Not found" }, { status: 404 });
    }
    if (parent.format !== "docx") {
      return Response.json(
        { error: "Regeneration is available for Word documents only" },
        { status: 400 },
      );
    }

    const editFields = parseEditFields(body.editFields);
    const providedContent = stringField(body.finalDeliverable, "finalDeliverable");
    const finalDeliverable = applyEditFields(
      providedContent?.trim() ? providedContent : parent.sourceContent,
      editFields,
    );
    const contentLimit = assertWordContentLimits(finalDeliverable);
    if (contentLimit) return contentLimit;
    const tableLimit = assertWordTableLimits(finalDeliverable);
    if (tableLimit) return tableLimit;

    const exportGuard = assertSafeExportText(finalDeliverable);
    if (!exportGuard.ok) {
      return Response.json({ error: exportGuard.rejectedReason }, { status: 422 });
    }

    const templateId = stringField(body.templateId, "templateId");
    if (templateId && !isWordTemplateId(templateId)) {
      return Response.json({ error: "templateId is invalid" }, { status: 400 });
    }

    const title =
      stringField(body.title, "title") ??
      editFields.title ??
      parent.baseFileName;
    const revisionReason =
      stringField(body.revisionReason, "revisionReason") ?? "regenerate";

    const existingGroup =
      await findVersionGroupByDeliverableIdAsync(parentDeliverableId);
    const createdGroup = existingGroup
      ? null
      : createVersionGroup({
          deliverableId: parent.id,
          createdBy: userId,
          displayName: parent.baseFileName,
          internalFileName: parent.fileName,
        });
    const group =
      existingGroup ??
      (createdGroup
        ? {
            groupId: createdGroup.groupId,
            record: createdGroup,
          }
        : null);
    if (!group) {
      return Response.json(
        { error: "Failed to prepare version group" },
        { status: 500 },
      );
    }

    if (!existingGroup) {
      await updateStoredDeliverableMetadata(parent.id, userId, {
        ...(parent.metadata ?? {}),
        version: group.record.version,
        parentDeliverableId: null,
        versionGroupId: group.groupId,
      });
    }

    const versions = await listDeliverableVersionsAsync(group.groupId);
    if (versions.length >= WORD_REGENERATE_MAX_PER_GROUP) {
      return Response.json(
        {
          error: "Word再生成の上限に達しました。不要な版を整理してください。",
          code: "regenerate_limit_reached",
          maxVersions: WORD_REGENERATE_MAX_PER_GROUP,
        },
        { status: 429 },
      );
    }

    const { requireBillingForAssignment } = await import("@/lib/billing/access");
    const billingDenied = await requireBillingForAssignment(userId, {
      assignment: title,
    });
    if (billingDenied) return billingDenied;

    // Word-only re-render from sourceContent — never re-call AI for quality.
    assertExportPathHasNoAiRegenerate(undefined);

    const result = await generateDeliverables(
      {
        assignment: title,
        finalDeliverable: exportGuard.text,
        title,
        formats: ["docx"],
      },
      resolveOrigin(request),
      {
        userId,
        jobId: `dlvregen_${crypto.randomUUID().replace(/-/g, "").slice(0, 20)}`,
        templateId: templateId ?? parent.metadata?.templateId ?? null,
        parentDeliverableId,
        versionGroupId: group.groupId,
        revisionReason,
        cost: { regenerateCount: 1 },
        allowAiContentRetry: false,
      },
    );

    const docx = result.deliverables.find((item) => item.format === "docx");
    if (!docx) {
      return Response.json(
        { error: "Failed to regenerate Word document", failures: result.failures },
        { status: 422 },
      );
    }

    trackWordEvent({
      name: "regenerate",
      userId,
      deliverableId: docx.id,
      templateId: docx.metadata?.templateId ?? parent.metadata?.templateId ?? null,
      purpose: docx.metadata?.purpose ?? parent.metadata?.purpose ?? null,
      format: "docx",
      stage: "version",
      success: true,
      sizeBytes: docx.sizeBytes,
    });

    return Response.json({
      deliverable: docx,
      parentDeliverableId,
      groupId: group.groupId,
      jobId: result.jobId,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "regenerate_failed";
    return Response.json({ error: message }, { status: 400 });
  } finally {
    releaseWordGenerateSlot(userId);
  }
}
