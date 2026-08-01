import { auth } from "@clerk/nextjs/server";

import {
  migrateExistingDeliverablesToArtifacts,
  rollbackMigrationNote,
} from "@/lib/artifact-platform";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Admin-oriented migration endpoint.
 * Defaults to dry-run. Pass { "dryRun": false } to apply metadata backfill.
 */
export async function POST(request: Request): Promise<Response> {
  const { userId } = await auth();
  if (!userId) {
    return Response.json({ error: "認証が必要です。" }, { status: 401 });
  }

  const body = (await request.json().catch(() => ({}))) as {
    dryRun?: boolean;
    limit?: number;
    scope?: "self" | "all";
  };

  // Non-admin: only migrate own rows. Full-table apply requires explicit scope=all
  // and is still metadata-only (no binary mutation).
  const report = await migrateExistingDeliverablesToArtifacts({
    dryRun: body.dryRun !== false,
    userId: body.scope === "all" ? null : userId,
    limit: body.limit,
  });

  return Response.json({
    ...report,
    rollback: rollbackMigrationNote(),
  });
}
