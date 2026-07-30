import { auth, currentUser } from "@clerk/nextjs/server";

import { isAtlasOwnerEmail } from "@/lib/auth/is-atlas-owner";
import { isAtlasProduction } from "@/lib/runtime/is-production";
import {
  getLatestFailedStage,
  getVisionDiagnosticForUser,
} from "@/lib/vision/diagnostics";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

const SAFE_DETAIL_KEYS = [
  "errorCode",
  "userCode",
  "openaiErrorCode",
  "openaiErrorType",
  "artifactGate",
  "durationMs",
  "analysisSuccess",
  "inputImageIncluded",
  "payloadAttachmentIdCount",
  "detectedType",
  "model",
  "mimeType",
  "downloadedByteLength",
  "base64Length",
] as const;

function pickSafeDetail(
  detail: Record<string, string | number | boolean | null> | undefined,
): Record<string, string | number | boolean | null> | null {
  if (!detail) return null;
  const out: Record<string, string | number | boolean | null> = {};
  for (const key of SAFE_DETAIL_KEYS) {
    if (key in detail) out[key] = detail[key] ?? null;
  }
  return Object.keys(out).length > 0 ? out : null;
}

export async function GET(
  _request: Request,
  context: RouteContext,
): Promise<Response> {
  const { userId } = await auth();
  if (!userId) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const user = await currentUser();
  const email =
    user?.primaryEmailAddress?.emailAddress ??
    user?.emailAddresses?.[0]?.emailAddress ??
    "";
  const isOwner = isAtlasOwnerEmail(email);
  const debugEnabled = process.env.ATLAS_DEBUG === "true";

  // Production: owners only. Non-production: owners or ATLAS_DEBUG for own records.
  if (isAtlasProduction() && !isOwner) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }
  if (!isAtlasProduction() && !isOwner && !debugEnabled) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await context.params;
  const diagnostic = getVisionDiagnosticForUser(userId, id);
  if (!diagnostic) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }

  return Response.json({
    diagnostic: {
      id: diagnostic.id,
      stages: diagnostic.stages.map((stage) => ({
        stage: stage.stage,
        ok: stage.ok,
        at: stage.at,
        detail: pickSafeDetail(stage.detail),
      })),
      model: diagnostic.model,
      mimeType: diagnostic.mimeType,
      downloadedByteLength: diagnostic.downloadedByteLength,
      base64Length: diagnostic.base64Length,
      inputImageIncluded: diagnostic.inputImageIncluded,
      analysisSuccess: diagnostic.analysisSuccess,
      payloadAttachmentIdCount: diagnostic.payloadAttachmentIds?.length ?? null,
      detectedType: diagnostic.detectedType,
      artifactGate: diagnostic.artifactGate,
      failedStage: getLatestFailedStage(diagnostic),
      lastErrorCode: diagnostic.lastErrorCode,
      lastUserCode: diagnostic.lastUserCode,
      createdAt: diagnostic.createdAt,
      updatedAt: diagnostic.updatedAt,
    },
  });
}
