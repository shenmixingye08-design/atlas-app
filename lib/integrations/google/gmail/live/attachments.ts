/**
 * Load attachment binaries from ATLAS Artifact Storage with owner isolation.
 */

import "server-only";

import { createHash } from "node:crypto";

import { getStoredDeliverableForUser } from "@/lib/deliverables/store";

import type { MimeAttachment } from "./mime";

/** Gmail practical limit ~25MB total message; keep attachments under 20MB each. */
export const GMAIL_MAX_ATTACHMENT_BYTES = 20 * 1024 * 1024;
export const GMAIL_MAX_TOTAL_ATTACHMENT_BYTES = 24 * 1024 * 1024;

export type LoadedGmailAttachment = MimeAttachment & {
  artifactId: string;
  checksum: string;
  size: number;
};

export async function loadGmailAttachmentsFromArtifacts(input: {
  ownerId: string;
  artifactIds: string[];
}): Promise<LoadedGmailAttachment[]> {
  const loaded: LoadedGmailAttachment[] = [];
  let total = 0;

  for (const artifactId of input.artifactIds) {
    const artifact = await getStoredDeliverableForUser(
      artifactId,
      input.ownerId,
    );
    if (!artifact) {
      throw new Error(
        `gmail attachment failed: artifact not found or owner mismatch (${artifactId})`,
      );
    }
    if (!artifact.buffer || artifact.buffer.byteLength === 0) {
      throw new Error(
        `gmail attachment failed: empty binary (${artifactId})`,
      );
    }
    if (artifact.buffer.byteLength > GMAIL_MAX_ATTACHMENT_BYTES) {
      throw new Error(
        `gmail attachment failed: exceeds max size (${artifactId})`,
      );
    }
    total += artifact.buffer.byteLength;
    if (total > GMAIL_MAX_TOTAL_ATTACHMENT_BYTES) {
      throw new Error("gmail attachment failed: total size exceeds Gmail limit");
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
    });
  }

  return loaded;
}
