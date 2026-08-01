import "server-only";

import { createHash } from "crypto";

import {
  loadDurableDeliverable,
  persistDurableDeliverable,
  type DurableDeliverableRow,
} from "@/lib/deliverables/durable-store";
import { saveDeliverableFileDurableDetailed } from "@/lib/deliverables/store";
import {
  createVersionGroup,
  addDeliverableVersion,
  findVersionGroupByDeliverableIdAsync,
  listDeliverableVersionsAsync,
  buildVersionedDisplayName,
  buildVersionedInternalFileName,
} from "@/lib/deliverables/versioning";
import type { DeliverableFormat, DeliverableMetadata } from "@/lib/deliverables/types";
import { DELIVERABLE_METADATA_TTL_MS } from "@/lib/deliverables/constants";

import { ArtifactPlatformError } from "./errors";
import {
  extensionForArtifactFormat,
  mimeForArtifactFormat,
  normalizeArtifactFormat,
  toDeliverableFormat,
} from "./formats";
import { assertValidOutput } from "./validate-output";
import type {
  ArtifactFormat,
  ArtifactLineageMeta,
  ArtifactStatus,
  ConversionType,
  PreviewStatus,
  UnifiedArtifact,
  ValidationStatus,
} from "./types";

export type RegisterArtifactInput = {
  userId: string;
  buffer: Buffer;
  format: ArtifactFormat;
  fileName?: string;
  title?: string;
  description?: string;
  sourceContent?: string;
  sourceArtifactId?: string | null;
  rootArtifactId?: string | null;
  conversionType?: ConversionType;
  createdFrom?: string;
  changeReason?: string | null;
  changeSummary?: string | null;
  requestId?: string | null;
  jobId?: string | null;
  quality?: ArtifactLineageMeta["quality"];
  /** When true, create a new revision in the same version group as source. */
  asRevision?: boolean;
  skipValidation?: boolean;
};

function sanitizeFileName(name: string, format: ArtifactFormat): string {
  const ext = extensionForArtifactFormat(format);
  const base = name
    .replace(/[\\/:*?"<>|]/g, "_")
    .replace(/\s+/g, "_")
    .slice(0, 120)
    .replace(/\.[^.]+$/, "");
  const stem = base || "artifact";
  return stem.toLowerCase().endsWith(`.${ext}`) ? stem : `${stem}.${ext}`;
}

export function mapRowToUnifiedArtifact(
  row: DurableDeliverableRow,
  extras?: {
    revisionNumber?: number;
    isLatest?: boolean;
    versionGroupId?: string | null;
  }
): UnifiedArtifact {
  const meta = (row.metadata ?? {}) as DeliverableMetadata & ArtifactLineageMeta;
  const format =
    normalizeArtifactFormat(String(meta.artifactFormat ?? row.format)) ??
    (row.format as ArtifactFormat);
  const rootArtifactId =
    meta.rootArtifactId ??
    meta.versionGroupId ??
    row.id;
  const status: ArtifactStatus =
    row.deletedAt
      ? "deleted"
      : meta.status ??
        (row.storageStatus === "failed" ? "failed" : "completed");
  const previewStatus: PreviewStatus = meta.previewStatus ?? "pending";
  const validationStatus: ValidationStatus =
    meta.validationStatus ?? (row.ooxmlVerified === false ? "failed" : "passed");

  return {
    id: row.id,
    userId: row.userId,
    jobId: meta.jobId ?? null,
    requestId: meta.requestId ?? null,
    title: meta.title ?? row.baseFileName ?? row.fileName,
    description: meta.description ?? "",
    format,
    mimeType: mimeForArtifactFormat(format),
    storagePath: row.storagePath,
    fileName: row.fileName,
    fileSize: row.sizeBytes ?? 0,
    status,
    sourceArtifactId: meta.sourceArtifactId ?? meta.parentDeliverableId ?? null,
    rootArtifactId: String(rootArtifactId),
    revisionNumber: extras?.revisionNumber ?? meta.revisionNumber ?? meta.version ?? 1,
    conversionType: meta.conversionType ?? null,
    createdFrom: meta.createdFrom ?? "deliverable",
    metadata: meta,
    previewStatus,
    validationStatus,
    versionGroupId: extras?.versionGroupId ?? meta.versionGroupId ?? null,
    isLatest: extras?.isLatest ?? meta.isLatest ?? true,
    downloadUrl: `/api/deliverables/${row.id}`,
    createdAt: row.generatedAt,
    updatedAt: row.generatedAt,
  };
}

export async function getUnifiedArtifact(
  id: string,
  userId: string
): Promise<UnifiedArtifact | null> {
  const row = await loadDurableDeliverable(id, userId);
  if (!row || row.userId !== userId) return null;
  const version = await findVersionGroupByDeliverableIdAsync(id);
  return mapRowToUnifiedArtifact(row, {
    revisionNumber: version?.record.version,
    isLatest: version?.record.isLatest,
    versionGroupId: version?.groupId ?? null,
  });
}

export async function registerArtifact(
  input: RegisterArtifactInput
): Promise<UnifiedArtifact> {
  const format = normalizeArtifactFormat(input.format);
  if (!format) {
    throw new ArtifactPlatformError(
      "invalid_target_format",
      `Unknown format: ${input.format}`
    );
  }

  if (!input.skipValidation) {
    assertValidOutput(format, input.buffer);
  }

  const durableFormat: DeliverableFormat = toDeliverableFormat(format);

  const title = input.title ?? "成果物";
  const fileName = sanitizeFileName(
    input.fileName ?? title,
    format
  );

  let source: UnifiedArtifact | null = null;
  if (input.sourceArtifactId) {
    source = await getUnifiedArtifact(input.sourceArtifactId, input.userId);
    if (!source) {
      throw new ArtifactPlatformError(
        "source_artifact_not_found",
        `source ${input.sourceArtifactId} missing`,
        { sourceArtifactId: input.sourceArtifactId }
      );
    }
  }

  const rootArtifactId =
    input.rootArtifactId ?? source?.rootArtifactId ?? source?.id ?? null;

  const asRevision =
    Boolean(input.asRevision) &&
    Boolean(source) &&
    source!.format === format;

  let revisionNumber = 1;
  let versionGroupId: string | null = source?.versionGroupId ?? null;
  let parentId: string | null = source?.id ?? null;

  if (asRevision && source) {
    const found = await findVersionGroupByDeliverableIdAsync(source.id);
    versionGroupId = found?.groupId ?? source.versionGroupId;
    if (!versionGroupId) {
      const created = createVersionGroup({
        deliverableId: source.id,
        createdBy: input.userId,
        displayName: source.title,
        internalFileName: source.fileName,
        jobId: input.jobId,
      });
      versionGroupId = created.groupId;
    }
  }

  const mimeType = mimeForArtifactFormat(format);

  const lineage: ArtifactLineageMeta & DeliverableMetadata & Record<string, unknown> = {
    title,
    description: input.description ?? "",
    artifactFormat: format,
    sourceArtifactId: parentId,
    rootArtifactId: rootArtifactId ?? undefined,
    revisionNumber,
    conversionType: input.conversionType ?? (asRevision ? "revision" : null),
    createdFrom: input.createdFrom ?? "artifact-platform",
    requestId: input.requestId ?? null,
    jobId: input.jobId ?? null,
    changeReason: input.changeReason ?? null,
    changeSummary: input.changeSummary ?? null,
    previewStatus: "pending",
    validationStatus: input.skipValidation ? "skipped" : "passed",
    status: "completed",
    quality: input.quality,
    parentDeliverableId: parentId,
    versionGroupId: versionGroupId ?? undefined,
    purpose: null,
    templateId: null,
    version: revisionNumber,
  };

  const { stored, persist } = await saveDeliverableFileDurableDetailed(
    {
      format: durableFormat,
      fileName,
      mimeType,
      buffer: input.buffer,
      isPlaceholder: false,
    },
    input.userId,
    {
      sourceContent: input.sourceContent ?? "",
      baseFileName: title,
      metadata: lineage,
    }
  );

  if (!persist.ok && !persist.row.contentBase64 && !persist.row.storagePath) {
    throw new ArtifactPlatformError(
      "storage_upload_failed",
      persist.storageError ?? "persist failed",
      { artifactId: stored.id }
    );
  }

  if (asRevision && versionGroupId && parentId) {
    const versions = await listDeliverableVersionsAsync(versionGroupId);
    const nextVersion =
      versions.reduce((m, v) => Math.max(m, v.version), 0) + 1;
    revisionNumber = nextVersion;
    const displayName = buildVersionedDisplayName(title, nextVersion);
    const internal = buildVersionedInternalFileName(
      title,
      nextVersion,
      `.${extensionForArtifactFormat(format)}`
    );
    addDeliverableVersion({
      groupId: versionGroupId,
      newDeliverableId: stored.id,
      parentDeliverableId: parentId,
      createdBy: input.userId,
      displayName,
      internalFileName: internal,
      revisionReason: input.changeReason ?? "revision",
      jobId: input.jobId,
      diffSummary: input.changeSummary ?? null,
    });
    lineage.revisionNumber = nextVersion;
    lineage.version = nextVersion;
    lineage.isLatest = true;
    await persistDurableDeliverable({
      ...(await loadDurableDeliverable(stored.id, input.userId))!,
      fileName: sanitizeFileName(displayName, format),
      metadata: lineage as DeliverableMetadata,
      expiresAt: new Date(Date.now() + DELIVERABLE_METADATA_TTL_MS).toISOString(),
    });
  } else if (!versionGroupId) {
    const created = createVersionGroup({
      deliverableId: stored.id,
      createdBy: input.userId,
      displayName: title,
      internalFileName: fileName,
      jobId: input.jobId,
      groupId: rootArtifactId ? `root_${rootArtifactId.slice(0, 16)}` : undefined,
    });
    versionGroupId = created.groupId;
    revisionNumber = 1;
    lineage.versionGroupId = versionGroupId;
    lineage.rootArtifactId = lineage.rootArtifactId ?? stored.id;
    lineage.revisionNumber = 1;
    const row = await loadDurableDeliverable(stored.id, input.userId);
    if (row) {
      await persistDurableDeliverable({
        ...row,
        metadata: lineage as DeliverableMetadata,
      });
    }
  } else if (source && !asRevision) {
    // Derivative conversion — new version group linked via sourceArtifactId
    const created = createVersionGroup({
      deliverableId: stored.id,
      createdBy: input.userId,
      displayName: title,
      internalFileName: fileName,
      jobId: input.jobId,
    });
    versionGroupId = created.groupId;
    revisionNumber = 1;
  }

  const artifact = await getUnifiedArtifact(stored.id, input.userId);
  if (!artifact) {
    throw new ArtifactPlatformError(
      "artifact_save_failed",
      "registered but could not reload",
      { artifactId: stored.id }
    );
  }
  return artifact;
}

export function contentFingerprint(buffer: Buffer): string {
  return createHash("sha256").update(buffer).digest("hex");
}
