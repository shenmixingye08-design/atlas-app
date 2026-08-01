/**
 * Revision policy — originals are NEVER overwritten.
 */

export class ArtifactOverwriteError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ArtifactOverwriteError";
  }
}

/**
 * Assert that a revision write uses a new artifact/revision id.
 */
export function assertNeverOverwrite(input: {
  parentArtifactId: string;
  newArtifactId: string;
  newRevisionId?: string;
}): void {
  if (!input.newArtifactId.trim()) {
    throw new ArtifactOverwriteError("new_artifact_id_required");
  }
  if (input.newArtifactId === input.parentArtifactId) {
    throw new ArtifactOverwriteError("revision_must_not_reuse_parent_id");
  }
  if (
    input.newRevisionId &&
    input.newRevisionId === input.parentArtifactId
  ) {
    throw new ArtifactOverwriteError("revision_id_must_be_unique");
  }
}

export function assertOwnerMatch(
  ownerId: string,
  requesterId: string,
): void {
  if (!ownerId || !requesterId || ownerId !== requesterId) {
    throw new ArtifactOverwriteError("owner_mismatch");
  }
}
