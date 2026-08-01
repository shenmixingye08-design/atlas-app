/**
 * Fail-closed ownership checks for artifact storage.
 */

import { getStoredDeliverableForUser } from "@/lib/deliverables/store";
import { findVersionGroupByDeliverableIdAsync } from "@/lib/deliverables/versioning";

export type StorageAuthzAction =
  | "get"
  | "preview"
  | "download"
  | "revision"
  | "delete"
  | "signed_url";

export type StorageAuthzResult =
  | { ok: true }
  | { ok: false; code: "unauthorized" | "forbidden" | "not_found" };

/**
 * All cross-user artifact access must fail (404 to avoid existence leak).
 */
export async function assertArtifactAccess(input: {
  artifactId: string;
  requesterId: string | null | undefined;
  action: StorageAuthzAction;
}): Promise<StorageAuthzResult> {
  if (!input.requesterId?.trim()) {
    return { ok: false, code: "unauthorized" };
  }
  const stored = await getStoredDeliverableForUser(
    input.artifactId,
    input.requesterId,
  );
  if (!stored) {
    return { ok: false, code: "not_found" };
  }
  if (stored.userId !== input.requesterId) {
    return { ok: false, code: "not_found" };
  }
  return { ok: true };
}

/**
 * Reject signed URL / guess attacks: token owner must match artifact owner.
 */
export function assertSignedUrlOwner(input: {
  tokenOwnerId: string;
  artifactOwnerId: string;
}): boolean {
  return (
    Boolean(input.tokenOwnerId) &&
    input.tokenOwnerId === input.artifactOwnerId
  );
}

/**
 * Owner change is forbidden via client — only identical owner accepted.
 */
export function assertOwnerImmutable(input: {
  existingOwnerId: string;
  proposedOwnerId: string;
}): boolean {
  return input.existingOwnerId === input.proposedOwnerId;
}

/**
 * Cross-user revision list: only if requester owns the deliverable in the group.
 */
export async function assertRevisionListAccess(input: {
  deliverableId: string;
  requesterId: string;
}): Promise<StorageAuthzResult> {
  const access = await assertArtifactAccess({
    artifactId: input.deliverableId,
    requesterId: input.requesterId,
    action: "revision",
  });
  if (!access.ok) return access;
  const group = await findVersionGroupByDeliverableIdAsync(input.deliverableId);
  if (group && group.record.createdBy !== input.requesterId) {
    return { ok: false, code: "not_found" };
  }
  return { ok: true };
}
