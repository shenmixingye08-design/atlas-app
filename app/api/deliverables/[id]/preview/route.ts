import { auth, currentUser } from "@clerk/nextjs/server";

import { getWordCompanyBrand } from "@/lib/deliverables/company-brand";
import { resolveDocumentModel } from "@/lib/deliverables/document-model";
import { getStoredDeliverableForUser } from "@/lib/deliverables/store";
import { buildWordPreviewModel } from "@/lib/deliverables/word-preview";
import { trackWordEvent } from "@/lib/deliverables/word-analytics";
import { findVersionGroupByDeliverableIdAsync } from "@/lib/deliverables/versioning";
import { isWordTemplateId } from "@/lib/deliverables/word-templates";
import {
  assertArtifactAccess,
  artifactAccessDeniedResponse,
} from "@/lib/security/artifact/access";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function GET(
  request: Request,
  context: RouteContext,
): Promise<Response> {
  const { userId } = await auth();
  if (!userId) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await context.params;
  const user = await currentUser();
  const email =
    user?.primaryEmailAddress?.emailAddress ??
    user?.emailAddresses?.[0]?.emailAddress ??
    null;
  const stored = await getStoredDeliverableForUser(id, userId);
  const access = assertArtifactAccess({
    actorUserId: userId,
    actorEmail: email,
    artifactOwnerUserId: stored?.userId ?? null,
    op: "preview",
    artifactId: id,
    ip:
      request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
      request.headers.get("x-real-ip"),
  });
  if (!access.allowed) {
    return artifactAccessDeniedResponse(access);
  }
  if (!stored) {
    return Response.json(
      { error: "Not found", request_id: access.request_id },
      { status: 404 },
    );
  }
  if (stored.format !== "docx") {
    return Response.json(
      { error: "Preview is available for Word documents only" },
      { status: 400 },
    );
  }

  const versionGroup = await findVersionGroupByDeliverableIdAsync(stored.id);
  const brand = await getWordCompanyBrand(userId);
  const templateId =
    stored.metadata?.templateId && isWordTemplateId(stored.metadata.templateId)
      ? stored.metadata.templateId
      : null;
  const resolved = resolveDocumentModel({
    content: stored.sourceContent,
    assignment: stored.baseFileName,
    title: stored.baseFileName,
    templateId,
    author: brand?.contactName,
    companyName: brand?.companyName,
    footerNote: brand?.footerText,
  });
  const preview = buildWordPreviewModel({
    model: resolved.model,
    sizeBytes: stored.buffer.byteLength,
    version: versionGroup?.record.version ?? stored.metadata?.version ?? undefined,
    isLatest: versionGroup?.record.isLatest ?? true,
    status: "ready",
  });

  trackWordEvent({
    name: "preview_view",
    userId,
    deliverableId: stored.id,
    templateId: preview.templateId,
    purpose: stored.metadata?.purpose ?? resolved.model.documentType ?? null,
    format: "docx",
    stage: "preview",
    success: true,
    sizeBytes: stored.buffer.byteLength,
  });

  return Response.json({ preview });
}
