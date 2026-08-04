import { auth } from "@clerk/nextjs/server";

import { resolveAttachmentStorageBackend } from "@/lib/attachments/backend";
import { ensureAttachmentInfrastructure } from "@/lib/attachments/ensure-infrastructure";
import { ATLAS_IMAGE_ATTACHMENTS_BUCKET } from "@/lib/attachments/constants";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Authenticated diagnostics for image upload infrastructure.
 * Never returns secrets — only booleans, host, and error codes.
 */
export async function GET(): Promise<Response> {
  const { userId } = await auth();
  if (!userId) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const backend = resolveAttachmentStorageBackend();
  if (backend === "local") {
    return Response.json({
      ok: true,
      backend: "local",
      bucket: ATLAS_IMAGE_ATTACHMENTS_BUCKET,
      ready: true,
      note: "Local filesystem backend (development).",
      visionBeforeUpload: false,
    });
  }

  const status = await ensureAttachmentInfrastructure({
    createBucketIfMissing: true,
  });

  return Response.json({
    ok: status.ready,
    backend: status.backend,
    vercelEnv: status.vercelEnv,
    serviceRoleConfigured: status.serviceRoleConfigured,
    supabaseUrlHost: status.supabaseUrlHost,
    bucket: status.bucket,
    bucketExists: status.bucketExists,
    bucketCreatedNow: status.bucketCreatedNow,
    tableExists: status.tableExists,
    tableProbeError: status.tableProbeError,
    blockingCode: status.blockingCode,
    migrationHint: status.migrationHint,
    migrationFile: "supabase/migrations/20260726_atlas_image_attachments.sql",
    // Upload fails before Vision — Vision is not invoked during /api/attachments/images.
    visionBeforeUpload: false,
    stageOrder: [
      "auth",
      "formData",
      "preprocess(sharp)",
      "ensure(bucket/table)",
      "storage.upload",
      "db.insert",
      "(later) vision.analyze",
    ],
  });
}
