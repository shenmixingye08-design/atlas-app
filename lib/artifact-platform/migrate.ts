import "server-only";

import { createServiceRoleClientIfConfigured } from "@/lib/supabase/service-role";
import type { DeliverableMetadata } from "@/lib/deliverables/types";
import { normalizeArtifactFormat } from "./formats";

export type MigrationReport = {
  dryRun: boolean;
  scanned: number;
  migrated: number;
  skipped: number;
  failed: number;
  failures: Array<{ id: string; error: string }>;
  backupNote: string;
};

/**
 * Idempotent migration: backfill lineage metadata on existing deliverable rows.
 * Never deletes binaries. Safe to re-run.
 */
export async function migrateExistingDeliverablesToArtifacts(options?: {
  dryRun?: boolean;
  userId?: string | null;
  limit?: number;
}): Promise<MigrationReport> {
  const dryRun = options?.dryRun !== false; // default dry-run for safety
  const report: MigrationReport = {
    dryRun,
    scanned: 0,
    migrated: 0,
    skipped: 0,
    failed: 0,
    failures: [],
    backupNote:
      "本番適用前に atlas_deliverable_files のスナップショット（テーブルdumpまたはStorageコピー）を取得してください。本移行は metadata 追記のみでバイナリを変更しません。",
  };

  const client = createServiceRoleClientIfConfigured();
  if (!client) {
    // Memory-only path for tests
    const scope = globalThis as typeof globalThis & {
      __atlasDeliverableDurable?: Map<
        string,
        {
          id: string;
          userId: string;
          format: string;
          metadata: DeliverableMetadata | null;
          deletedAt: string | null;
        }
      >;
    };
    const mem = scope.__atlasDeliverableDurable;
    if (!mem) return report;
    for (const row of mem.values()) {
      if (options?.userId && row.userId !== options.userId) continue;
      report.scanned += 1;
      const meta = { ...(row.metadata ?? {}) } as DeliverableMetadata &
        Record<string, unknown>;
      if (meta.rootArtifactId && meta.artifactFormat) {
        report.skipped += 1;
        continue;
      }
      const format = normalizeArtifactFormat(String(meta.artifactFormat ?? row.format));
      if (!format) {
        report.failed += 1;
        report.failures.push({ id: row.id, error: "unknown_format" });
        continue;
      }
      if (!dryRun) {
        row.metadata = {
          ...meta,
          artifactFormat: format,
          rootArtifactId: meta.rootArtifactId ?? row.id,
          sourceArtifactId: meta.sourceArtifactId ?? meta.parentDeliverableId ?? null,
          revisionNumber: meta.revisionNumber ?? meta.version ?? 1,
          createdFrom: meta.createdFrom ?? "legacy_migration",
          status: row.deletedAt ? "deleted" : meta.status ?? "completed",
          validationStatus: meta.validationStatus ?? "passed",
          previewStatus: meta.previewStatus ?? "pending",
        };
      }
      report.migrated += 1;
    }
    return report;
  }

  let q = client
    .from("atlas_deliverable_files")
    .select("id,user_id,format,deliverable_metadata,deleted_at")
    .order("generated_at", { ascending: true })
    .limit(options?.limit ?? 5000);
  if (options?.userId) q = q.eq("user_id", options.userId);

  const { data, error } = await q;
  if (error || !data) {
    report.failed += 1;
    report.failures.push({ id: "-", error: error?.message ?? "select_failed" });
    return report;
  }

  for (const raw of data as unknown as Array<{
    id: string;
    user_id: string;
    format: string;
    deliverable_metadata: DeliverableMetadata | null;
    deleted_at: string | null;
  }>) {
    report.scanned += 1;
    const meta = { ...(raw.deliverable_metadata ?? {}) } as DeliverableMetadata &
      Record<string, unknown>;
    if (meta.rootArtifactId && meta.artifactFormat && meta.createdFrom) {
      report.skipped += 1;
      continue;
    }
    const format = normalizeArtifactFormat(
      String(meta.artifactFormat ?? raw.format)
    );
    if (!format) {
      report.failed += 1;
      report.failures.push({ id: raw.id, error: "unknown_format" });
      continue;
    }
    const nextMeta = {
      ...meta,
      artifactFormat: format,
      rootArtifactId: meta.rootArtifactId ?? raw.id,
      sourceArtifactId:
        meta.sourceArtifactId ?? meta.parentDeliverableId ?? null,
      revisionNumber: meta.revisionNumber ?? meta.version ?? 1,
      createdFrom: meta.createdFrom ?? "legacy_migration",
      status: raw.deleted_at ? "deleted" : meta.status ?? "completed",
      validationStatus: meta.validationStatus ?? "passed",
      previewStatus: meta.previewStatus ?? "pending",
    };
    if (!dryRun) {
      const { error: upErr } = await client
        .from("atlas_deliverable_files")
        .update({
          deliverable_metadata: nextMeta,
          updated_at: new Date().toISOString(),
        } as never)
        .eq("id", raw.id)
        .eq("user_id", raw.user_id);
      if (upErr) {
        report.failed += 1;
        report.failures.push({ id: raw.id, error: upErr.message });
        continue;
      }
    }
    report.migrated += 1;
  }

  return report;
}

export function rollbackMigrationNote(): string {
  return [
    "ロールバック手順:",
    "1. 移行前に取得した atlas_deliverable_files バックアップをリストア",
    "2. または deliverable_metadata から createdFrom=legacy_migration の追記キーのみ除去",
    "3. Storage オブジェクトは未変更のためバイナリロールバック不要",
    "4. マイグレーション SQL（atlas_artifact_* テーブル）は DROP で除去可能（files 本体は残す）",
  ].join("\n");
}
