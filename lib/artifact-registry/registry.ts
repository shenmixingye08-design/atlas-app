import "server-only";

import {
  DELIVERABLE_EXTENSIONS,
  DELIVERABLE_MIME_TYPES,
  type DeliverableFormat,
} from "@/lib/deliverables/types";
import {
  getStoredDeliverableForUser,
  saveDeliverableFile,
  type StoredDeliverable,
} from "@/lib/deliverables/store";
import {
  addDeliverableVersion,
  createVersionGroup,
  findVersionGroupByDeliverableId,
  findVersionGroupByDeliverableIdAsync,
  buildVersionedDisplayName,
  buildVersionedInternalFileName,
} from "@/lib/deliverables/versioning";
import { toArtifactIdentity, kindFromMimeAndName, mimeForKind } from "./identity";
import { assertNeverOverwrite, assertOwnerMatch } from "./revision-policy";
import type { ArtifactIdentity, ArtifactKind, ArtifactRevisionRequest } from "./types";

function toDeliverableFormat(kind: ArtifactKind): DeliverableFormat | null {
  if (
    kind === "docx" ||
    kind === "xlsx" ||
    kind === "pdf" ||
    kind === "pptx" ||
    kind === "md" ||
    kind === "txt"
  ) {
    return kind;
  }
  // CSV / image use txt carrier format; MIME/extension preserve real type.
  if (kind === "csv" || kind === "image") return "txt";
  return null;
}

/**
 * Resolve artifact identity for an owned deliverable.
 */
export async function getArtifactIdentityForUser(
  artifactId: string,
  ownerId: string,
): Promise<ArtifactIdentity | null> {
  const stored = await getStoredDeliverableForUser(artifactId, ownerId);
  if (!stored) return null;
  const version =
    (await findVersionGroupByDeliverableIdAsync(artifactId))?.record ??
    findVersionGroupByDeliverableId(artifactId)?.record ??
    null;
  const groupId =
    (await findVersionGroupByDeliverableIdAsync(artifactId))?.groupId ??
    findVersionGroupByDeliverableId(artifactId)?.groupId ??
    null;
  return toArtifactIdentity({
    stored,
    version,
    rootArtifactId: groupId,
  });
}

/**
 * Register root artifact (version 1). Does not overwrite any existing id.
 */
export function registerRootArtifact(input: {
  ownerId: string;
  buffer: Buffer;
  fileName: string;
  kind: ArtifactKind;
  sourceContent?: string;
  artifactId?: string;
}): { stored: StoredDeliverable; identity: ArtifactIdentity } {
  const format = toDeliverableFormat(input.kind) ?? "txt";
  const ext =
    input.kind === "csv"
      ? ".csv"
      : input.kind === "image"
        ? ".png"
        : DELIVERABLE_EXTENSIONS[format];
  const fileName = input.fileName.endsWith(ext)
    ? input.fileName
    : `${input.fileName.replace(/\.[^.]+$/, "")}${ext}`;
  const mime =
    input.kind === "csv" || input.kind === "image"
      ? mimeForKind(input.kind)
      : DELIVERABLE_MIME_TYPES[format];

  const stored = saveDeliverableFile(
    {
      format,
      fileName,
      mimeType: mime,
      buffer: input.buffer,
      isPlaceholder: false,
    },
    input.ownerId,
    {
      sourceContent: input.sourceContent ?? "",
      baseFileName: fileName.replace(/\.[^.]+$/, ""),
      deliverableId: input.artifactId,
      metadata: { version: 1, parentDeliverableId: null },
    },
  );

  const group = createVersionGroup({
    deliverableId: stored.id,
    createdBy: input.ownerId,
    displayName: fileName,
    internalFileName: fileName,
  });

  stored.metadata = {
    ...stored.metadata,
    version: 1,
    versionGroupId: group.groupId,
    parentDeliverableId: null,
  };

  return {
    stored,
    identity: toArtifactIdentity({
      stored,
      version: group,
      rootArtifactId: group.groupId,
    }),
  };
}

/**
 * Append a revision with a NEW artifact id. Parent binary is never mutated.
 * Supports Word / Excel / PDF / PowerPoint / CSV (as txt carrier) edits.
 */
export async function appendArtifactRevision(
  request: ArtifactRevisionRequest,
): Promise<{ stored: StoredDeliverable; identity: ArtifactIdentity }> {
  const parent = await getStoredDeliverableForUser(
    request.parentArtifactId,
    request.ownerId,
  );
  if (!parent) {
    throw new Error("parent_not_found");
  }
  assertOwnerMatch(parent.userId, request.ownerId);

  const newId = crypto.randomUUID();
  assertNeverOverwrite({
    parentArtifactId: request.parentArtifactId,
    newArtifactId: newId,
    newRevisionId: newId,
  });

  const kind =
    request.kind ||
    kindFromMimeAndName(request.mimeType, request.fileName);
  const format = toDeliverableFormat(kind) ?? parent.format;
  const ext =
    kind === "csv"
      ? ".csv"
      : kind === "image"
        ? ".png"
        : DELIVERABLE_EXTENSIONS[format];

  let group =
    (await findVersionGroupByDeliverableIdAsync(parent.id)) ??
    findVersionGroupByDeliverableId(parent.id);

  if (!group) {
    const created = createVersionGroup({
      deliverableId: parent.id,
      createdBy: request.ownerId,
      displayName: parent.fileName,
      internalFileName: parent.fileName,
      groupId: parent.metadata?.versionGroupId ?? undefined,
    });
    group = { groupId: created.groupId, record: created };
  }

  const nextVersion =
    (group.record.version ?? 1) +
    1; /* addDeliverableVersion computes actual; hint for naming */
  const displayName = buildVersionedDisplayName(
    request.fileName.replace(/\.[^.]+$/, ""),
    nextVersion,
  );
  const internalName = buildVersionedInternalFileName(
    request.fileName,
    nextVersion,
    ext,
  );

  const stored = saveDeliverableFile(
    {
      format,
      fileName: internalName.endsWith(ext) ? internalName : `${displayName}${ext}`,
      mimeType:
        kind === "csv" || kind === "image"
          ? mimeForKind(kind)
          : DELIVERABLE_MIME_TYPES[format],
      buffer: request.buffer,
      isPlaceholder: false,
    },
    request.ownerId,
    {
      sourceContent: request.sourceContent ?? parent.sourceContent,
      baseFileName: displayName,
      deliverableId: newId,
      metadata: {
        version: nextVersion,
        parentDeliverableId: parent.id,
        versionGroupId: group.groupId,
        purpose: request.revisionReason ?? "revision",
      },
    },
  );

  // Guarantee parent buffer unchanged
  const parentAfter = await getStoredDeliverableForUser(
    parent.id,
    request.ownerId,
  );
  if (
    parentAfter &&
    parent.contentSha256 &&
    parentAfter.contentSha256 &&
    parentAfter.contentSha256 !== parent.contentSha256
  ) {
    throw new Error("parent_mutated_forbidden");
  }

  const version = addDeliverableVersion({
    groupId: group.groupId,
    newDeliverableId: stored.id,
    parentDeliverableId: parent.id,
    createdBy: request.ownerId,
    displayName,
    internalFileName: stored.fileName,
    revisionReason: request.revisionReason ?? `${kind}_edit`,
  });

  return {
    stored,
    identity: toArtifactIdentity({
      stored,
      version,
      rootArtifactId: group.groupId,
    }),
  };
}
