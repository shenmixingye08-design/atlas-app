import "server-only";

import {
  assertAttachmentBackendReady,
  resolveAttachmentStorageBackend,
} from "./backend";
import {
  localBindAttachmentToJob,
  localDeleteImageAttachment,
  localFindAttachmentByHash,
  localGetImageAttachmentForUser,
  localMarkAttachmentRetained,
  localPurgeExpiredAttachments,
  localReadProcessedImageBytes,
  localSaveImageAttachment,
} from "./local-store";
import {
  supabaseBindAttachmentToJob,
  supabaseDeleteImageAttachment,
  supabaseFindAttachmentByHash,
  supabaseGetImageAttachmentForUser,
  supabaseMarkAttachmentRetained,
  supabasePurgeExpiredAttachments,
  supabaseReadProcessedImageBytes,
  supabaseSaveImageAttachment,
} from "./supabase-store";
import type { SaveImageAttachmentInput, StoredImageAttachment } from "./types";

export async function saveImageAttachment(
  input: SaveImageAttachmentInput,
): Promise<StoredImageAttachment> {
  const backend = resolveAttachmentStorageBackend();
  assertAttachmentBackendReady(backend);
  if (backend === "supabase") {
    return supabaseSaveImageAttachment(input);
  }
  return localSaveImageAttachment(input);
}

export async function getImageAttachmentForUser(
  userId: string,
  id: string,
): Promise<StoredImageAttachment | null> {
  const backend = resolveAttachmentStorageBackend();
  if (backend === "supabase") {
    assertAttachmentBackendReady(backend);
    return supabaseGetImageAttachmentForUser(userId, id);
  }
  return localGetImageAttachmentForUser(userId, id);
}

export async function readProcessedImageBytes(
  userId: string,
  id: string,
): Promise<{ buffer: Buffer; mimeType: string; meta: StoredImageAttachment } | null> {
  const backend = resolveAttachmentStorageBackend();
  if (backend === "supabase") {
    assertAttachmentBackendReady(backend);
    return supabaseReadProcessedImageBytes(userId, id);
  }
  return localReadProcessedImageBytes(userId, id);
}

export async function deleteImageAttachment(
  userId: string,
  id: string,
): Promise<boolean> {
  const backend = resolveAttachmentStorageBackend();
  if (backend === "supabase") {
    assertAttachmentBackendReady(backend);
    return supabaseDeleteImageAttachment(userId, id);
  }
  return localDeleteImageAttachment(userId, id);
}

export async function findAttachmentByHash(
  userId: string,
  contentHash: string,
): Promise<StoredImageAttachment | null> {
  const backend = resolveAttachmentStorageBackend();
  if (backend === "supabase") {
    assertAttachmentBackendReady(backend);
    return supabaseFindAttachmentByHash(userId, contentHash);
  }
  return localFindAttachmentByHash(userId, contentHash);
}

/** Mark image as retained so TTL purge skips it (profile / deliverable refs). */
export async function markAttachmentRetained(
  userId: string,
  id: string,
): Promise<StoredImageAttachment | null> {
  const backend = resolveAttachmentStorageBackend();
  if (backend === "supabase") {
    assertAttachmentBackendReady(backend);
    return supabaseMarkAttachmentRetained(userId, id);
  }
  return localMarkAttachmentRetained(userId, id);
}

export async function bindAttachmentToJob(
  userId: string,
  id: string,
  jobId: string,
): Promise<StoredImageAttachment | null> {
  const backend = resolveAttachmentStorageBackend();
  if (backend === "supabase") {
    assertAttachmentBackendReady(backend);
    return supabaseBindAttachmentToJob(userId, id, jobId);
  }
  return localBindAttachmentToJob(userId, id, jobId);
}

/** Bind many attachments to a job. Fails closed if any id cannot be bound. */
export async function bindAttachmentsToJob(
  userId: string,
  attachmentIds: string[],
  jobId: string,
): Promise<{ bound: string[]; failed: string[] }> {
  const bound: string[] = [];
  const failed: string[] = [];
  for (const id of attachmentIds) {
    const row = await bindAttachmentToJob(userId, id, jobId);
    if (row) bound.push(id);
    else failed.push(id);
  }
  return { bound, failed };
}

/** Purge temporary attachments past expiresAt (cron / tick). */
export async function purgeExpiredAttachments(): Promise<{
  backend: "local" | "supabase";
  purged: number;
}> {
  const backend = resolveAttachmentStorageBackend();
  if (backend === "supabase") {
    assertAttachmentBackendReady(backend);
    const purged = await supabasePurgeExpiredAttachments();
    return { backend, purged };
  }
  const purged = await localPurgeExpiredAttachments();
  return { backend, purged };
}
