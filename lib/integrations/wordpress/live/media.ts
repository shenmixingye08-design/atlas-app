/**
 * Load media binaries from ATLAS Artifact Storage with owner isolation.
 */

import "server-only";

import { createHash } from "node:crypto";

import { getStoredDeliverableForUser } from "@/lib/deliverables/store";

export const WORDPRESS_MAX_MEDIA_BYTES = 20 * 1024 * 1024;

export type LoadedWordPressMedia = {
  artifactId: string;
  fileName: string;
  mimeType: string;
  buffer: Buffer;
  checksum: string;
  size: number;
  altText: string | null;
};

export async function loadWordPressMediaFromArtifacts(input: {
  ownerId: string;
  artifactIds: string[];
  defaultAltText?: string | null;
}): Promise<LoadedWordPressMedia[]> {
  const loaded: LoadedWordPressMedia[] = [];

  for (const artifactId of input.artifactIds) {
    const artifact = await getStoredDeliverableForUser(
      artifactId,
      input.ownerId,
    );
    if (!artifact) {
      throw new Error(
        `wordpress media failed: artifact not found or owner mismatch (${artifactId})`,
      );
    }
    if (!artifact.buffer || artifact.buffer.byteLength === 0) {
      throw new Error(
        `wordpress media failed: empty binary (${artifactId})`,
      );
    }
    if (artifact.buffer.byteLength > WORDPRESS_MAX_MEDIA_BYTES) {
      throw new Error(
        `wordpress media failed: exceeds max size (${artifactId})`,
      );
    }

    const checksum =
      artifact.contentSha256?.trim() ||
      createHash("sha256").update(artifact.buffer).digest("hex");

    loaded.push({
      artifactId: artifact.id,
      fileName: artifact.fileName,
      mimeType: artifact.mimeType || "application/octet-stream",
      buffer: artifact.buffer,
      checksum,
      size: artifact.buffer.byteLength,
      altText: input.defaultAltText ?? null,
    });
  }

  return loaded;
}
