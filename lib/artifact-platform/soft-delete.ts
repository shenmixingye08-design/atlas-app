import "server-only";

import { createServiceRoleClientIfConfigured } from "@/lib/supabase/service-role";
import {
  loadDurableDeliverable,
  persistDurableDeliverable,
} from "@/lib/deliverables/durable-store";
import { listUnifiedArtifacts } from "./list";
import { ArtifactPlatformError } from "./errors";
import type { UnifiedArtifact } from "./types";

const TRASH_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;

export type SoftDeleteResult = {
  ok: boolean;
  artifact: UnifiedArtifact | null;
  derivatives: UnifiedArtifact[];
  requiresConfirmation: boolean;
  message: string;
};

export async function softDeleteArtifact(input: {
  artifactId: string;
  userId: string;
  force?: boolean;
  adminNote?: string;
}): Promise<SoftDeleteResult> {
  const row = await loadDurableDeliverable(input.artifactId, input.userId);
  if (!row) {
    throw new ArtifactPlatformError(
      "source_artifact_not_found",
      input.artifactId
    );
  }
  if (row.userId !== input.userId) {
    throw new ArtifactPlatformError("permission_denied", "owner mismatch");
  }

  const { items } = await listUnifiedArtifacts({
    userId: input.userId,
    includeDeleted: false,
    limit: 500,
  });
  const derivatives = items.filter(
    (a) =>
      a.sourceArtifactId === input.artifactId ||
      (a.rootArtifactId === input.artifactId && a.id !== input.artifactId)
  );

  if (derivatives.length > 0 && !input.force) {
    return {
      ok: false,
      artifact: null,
      derivatives,
      requiresConfirmation: true,
      message:
        "派生成果物があるため、確認なしでは削除しません。force=true でソフト削除できます。",
    };
  }

  const deletedAt = new Date().toISOString();
  const meta = {
    ...(row.metadata ?? {}),
    softDeleted: true,
    deletedAt,
    status: "deleted",
  };
  const updated = {
    ...row,
    deletedAt,
    deletionReason: "user" as const,
    metadata: meta,
  };
  await persistDurableDeliverable(updated);

  try {
    const client = createServiceRoleClientIfConfigured();
    if (client) {
      await client.from("atlas_artifact_audit_log").insert({
        user_id: input.userId,
        artifact_id: input.artifactId,
        action: "soft_delete",
        detail: {
          adminNote: input.adminNote ?? null,
          derivativeCount: derivatives.length,
          force: Boolean(input.force),
        },
      } as never);
    }
  } catch {
    /* audit table may not exist yet — non-fatal */
  }

  return {
    ok: true,
    artifact: {
      id: row.id,
      userId: row.userId,
      jobId: null,
      requestId: null,
      title: String(meta.title ?? row.baseFileName),
      description: "",
      format: row.format,
      mimeType: row.mimeType,
      storagePath: row.storagePath,
      fileName: row.fileName,
      fileSize: row.sizeBytes ?? 0,
      status: "deleted",
      sourceArtifactId: null,
      rootArtifactId: row.id,
      revisionNumber: 1,
      conversionType: null,
      createdFrom: "soft_delete",
      metadata: {
        softDeleted: true,
        deletedAt,
        status: "deleted",
      },
      previewStatus: "unavailable",
      validationStatus: "skipped",
      versionGroupId: null,
      isLatest: false,
      downloadUrl: `/api/deliverables/${row.id}`,
      createdAt: row.generatedAt,
      updatedAt: deletedAt,
    },
    derivatives,
    requiresConfirmation: false,
    message: "ゴミ箱へ移動しました。一定期間は復元できます。",
  };
}

export async function restoreArtifact(input: {
  artifactId: string;
  userId: string;
}): Promise<{ ok: boolean; message: string }> {
  const client = createServiceRoleClientIfConfigured();
  // Load including deleted: durable loader hides deleted — use direct DB/memory
  const scope = globalThis as typeof globalThis & {
    __atlasDeliverableDurable?: Map<
      string,
      Awaited<ReturnType<typeof loadDurableDeliverable>>
    >;
  };
  const mem = scope.__atlasDeliverableDurable?.get(input.artifactId);
  if (mem && mem.userId === input.userId && mem.deletedAt) {
    const age = Date.now() - new Date(mem.deletedAt).getTime();
    if (age > TRASH_RETENTION_MS) {
      return { ok: false, message: "復元期限を過ぎています。" };
    }
    mem.deletedAt = null;
    mem.deletionReason = null;
    mem.metadata = {
      ...(mem.metadata ?? {}),
      softDeleted: false,
      deletedAt: null,
      status: "completed",
    };
    await persistDurableDeliverable(mem);
    return { ok: true, message: "復元しました。" };
  }

  if (!client) {
    return { ok: false, message: "復元対象が見つかりませんでした。" };
  }
  const { data } = await client
    .from("atlas_deliverable_files")
    .select("*")
    .eq("id", input.artifactId)
    .eq("user_id", input.userId)
    .maybeSingle();
  if (!data) return { ok: false, message: "復元対象が見つかりませんでした。" };
  const deletedAt = (data as { deleted_at?: string | null }).deleted_at;
  if (!deletedAt) return { ok: true, message: "既に有効です。" };
  if (Date.now() - new Date(deletedAt).getTime() > TRASH_RETENTION_MS) {
    return { ok: false, message: "復元期限を過ぎています。" };
  }
  await client
    .from("atlas_deliverable_files")
    .update({
      deleted_at: null,
      deletion_reason: null,
      updated_at: new Date().toISOString(),
    } as never)
    .eq("id", input.artifactId)
    .eq("user_id", input.userId);

  try {
    await client.from("atlas_artifact_audit_log").insert({
      user_id: input.userId,
      artifact_id: input.artifactId,
      action: "restore",
      detail: {},
    } as never);
  } catch {
    /* optional */
  }

  return { ok: true, message: "復元しました。" };
}
