import { requireAtlasOwner } from "@/lib/auth/require-atlas-owner";
import { ensureAttachmentInfrastructure } from "@/lib/attachments/ensure-infrastructure";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Owner-only: probe/create image attachment bucket and report table migration status.
 * Does not run arbitrary SQL (table DDL must be applied in Supabase SQL editor).
 */
export async function POST(): Promise<Response> {
  await requireAtlasOwner();

  const status = await ensureAttachmentInfrastructure({
    createBucketIfMissing: true,
  });

  return Response.json({
    ok: status.ready,
    ...status,
    migrationFile: "supabase/migrations/20260726_atlas_image_attachments.sql",
    nextStep: status.ready
      ? null
      : status.blockingCode === "table_missing"
        ? "Supabase SQL エディタで 20260726_atlas_image_attachments.sql を実行してください"
        : status.blockingCode === "config_missing"
          ? "Vercel Production に SUPABASE_URL と SUPABASE_SERVICE_ROLE_KEY を設定してください"
          : "診断結果の blockingCode を確認してください",
  });
}
