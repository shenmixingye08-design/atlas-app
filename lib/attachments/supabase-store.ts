import "server-only";

import { createServiceRoleClientIfConfigured } from "@/lib/supabase/service-role";
import { redactForLog } from "@/lib/attachments/image-security";

import {
  ATLAS_IMAGE_ATTACHMENTS_BUCKET,
  ATTACHMENT_SIGNED_URL_TTL_SECONDS,
} from "./constants";
import {
  AttachmentStorageError,
  classifySupabaseError,
} from "./errors";
import { assertAttachmentInfrastructureReady } from "./ensure-infrastructure";
import {
  ATTACHMENT_LIMITS,
  type SaveImageAttachmentInput,
  type StoredImageAttachment,
} from "./types";

type AttachmentRow = {
  id: string;
  user_id: string;
  job_id: string;
  original_file_name: string;
  mime_type: string;
  original_mime_type: string | null;
  original_bytes: number;
  processed_bytes: number;
  width: number;
  height: number;
  content_hash: string;
  original_storage_path: string;
  processed_storage_path: string;
  retention_policy: "temporary" | "retained";
  expires_at: string | null;
  created_at: string;
};

function requireClient() {
  const client = createServiceRoleClientIfConfigured();
  if (!client) {
    throw new AttachmentStorageError({
      code: "config_missing",
      stage: "supabase.client",
    });
  }
  return client;
}

function sanitizeSegment(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 80) || "unknown";
}

function extForMime(mime: string): string {
  if (mime.includes("png")) return "png";
  if (mime.includes("webp")) return "webp";
  return "jpg";
}

function looksLikeImageBytes(buffer: Buffer): boolean {
  if (!Buffer.isBuffer(buffer) || buffer.length < 32) return false;
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return true;
  if (
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47
  ) {
    return true;
  }
  if (
    buffer.toString("ascii", 0, 4) === "RIFF" &&
    buffer.toString("ascii", 8, 12) === "WEBP"
  ) {
    return true;
  }
  if (buffer.toString("ascii", 4, 8) === "ftyp") return true;
  return false;
}

function buildObjectPath(input: {
  userId: string;
  jobId: string;
  attachmentId: string;
  kind: "original" | "processed";
  ext: string;
}): string {
  return [
    sanitizeSegment(input.userId),
    sanitizeSegment(input.jobId),
    sanitizeSegment(input.attachmentId),
    `${input.kind}.${input.ext}`,
  ].join("/");
}

function rowToMeta(row: AttachmentRow): StoredImageAttachment {
  return {
    id: row.id,
    userId: row.user_id,
    jobId: row.job_id,
    originalFileName: row.original_file_name,
    mimeType: row.mime_type,
    originalMimeType: row.original_mime_type,
    originalBytes: row.original_bytes,
    processedBytes: row.processed_bytes,
    width: row.width,
    height: row.height,
    contentHash: row.content_hash,
    createdAt: row.created_at,
    expiresAt: row.expires_at,
    retentionPolicy: row.retention_policy,
    originalPath: row.original_storage_path,
    processedPath: row.processed_storage_path,
    storageBackend: "supabase",
  };
}

function isExpired(meta: StoredImageAttachment): boolean {
  if (meta.retentionPolicy === "retained") return false;
  if (!meta.expiresAt) return false;
  return Date.parse(meta.expiresAt) < Date.now();
}

async function downloadObject(path: string): Promise<Buffer> {
  const client = requireClient();
  const { data, error } = await client.storage
    .from(ATLAS_IMAGE_ATTACHMENTS_BUCKET)
    .download(path);
  if (error || !data) {
    throw classifySupabaseError(error, "storage.download");
  }
  // Supabase returns a Blob in browsers/Node; also accept ArrayBuffer/Uint8Array.
  if (Buffer.isBuffer(data)) return data;
  if (data instanceof ArrayBuffer) return Buffer.from(data);
  if (ArrayBuffer.isView(data)) {
    return Buffer.from(data.buffer, data.byteOffset, data.byteLength);
  }
  if (typeof (data as Blob).arrayBuffer === "function") {
    const arrayBuffer = await (data as Blob).arrayBuffer();
    return Buffer.from(arrayBuffer);
  }
  throw new AttachmentStorageError({
    code: "read_failed",
    stage: "storage.download",
    providerMessage: `unexpected download type=${typeof data}`,
  });
}

async function removeObjects(paths: string[]): Promise<void> {
  const unique = Array.from(new Set(paths.filter(Boolean)));
  if (unique.length === 0) return;
  const client = requireClient();
  const { error } = await client.storage
    .from(ATLAS_IMAGE_ATTACHMENTS_BUCKET)
    .remove(unique);
  if (error) {
    console.error("[attachments] storage remove failed");
  }
}

export async function supabaseSaveImageAttachment(
  input: SaveImageAttachmentInput,
): Promise<StoredImageAttachment> {
  await assertAttachmentInfrastructureReady();
  const client = requireClient();
  const id = `img_${crypto.randomUUID().replace(/-/g, "").slice(0, 20)}`;
  const jobId = sanitizeSegment(input.jobId?.trim() || "pending");
  const retentionPolicy = input.retentionPolicy ?? "temporary";
  const originalExt = extForMime(input.mimeType);
  const processedExt = extForMime(input.processedMimeType);
  const originalPath = buildObjectPath({
    userId: input.userId,
    jobId,
    attachmentId: id,
    kind: "original",
    ext: originalExt,
  });
  const processedPath = buildObjectPath({
    userId: input.userId,
    jobId,
    attachmentId: id,
    kind: "processed",
    ext: processedExt,
  });

  const originalUpload = await client.storage
    .from(ATLAS_IMAGE_ATTACHMENTS_BUCKET)
    .upload(originalPath, input.originalBuffer, {
      contentType: input.mimeType,
      upsert: false,
    });
  if (originalUpload.error) {
    throw classifySupabaseError(originalUpload.error, "storage.upload.original");
  }

  const processedUpload = await client.storage
    .from(ATLAS_IMAGE_ATTACHMENTS_BUCKET)
    .upload(processedPath, input.processedBuffer, {
      contentType: input.processedMimeType,
      upsert: false,
    });
  if (processedUpload.error) {
    await removeObjects([originalPath]);
    throw classifySupabaseError(processedUpload.error, "storage.upload.processed");
  }

  const now = new Date();
  const expiresAt =
    retentionPolicy === "retained"
      ? null
      : new Date(now.getTime() + ATTACHMENT_LIMITS.ttlMs).toISOString();

  const row: AttachmentRow = {
    id,
    user_id: input.userId,
    job_id: jobId,
    original_file_name: input.originalFileName.slice(0, 180),
    mime_type: input.processedMimeType,
    original_mime_type: input.mimeType,
    original_bytes: input.originalBuffer.length,
    processed_bytes: input.processedBuffer.length,
    width: input.width,
    height: input.height,
    content_hash: input.contentHash,
    original_storage_path: originalPath,
    processed_storage_path: processedPath,
    retention_policy: retentionPolicy,
    expires_at: expiresAt,
    created_at: now.toISOString(),
  };

  const { error } = await client.from("atlas_image_attachments").insert({
    id: row.id,
    user_id: row.user_id,
    job_id: row.job_id,
    original_file_name: row.original_file_name,
    mime_type: row.mime_type,
    original_mime_type: row.original_mime_type,
    original_bytes: row.original_bytes,
    processed_bytes: row.processed_bytes,
    width: row.width,
    height: row.height,
    content_hash: row.content_hash,
    original_storage_path: row.original_storage_path,
    processed_storage_path: row.processed_storage_path,
    retention_policy: row.retention_policy,
    expires_at: row.expires_at,
    created_at: row.created_at,
    updated_at: row.created_at,
  });

  if (error) {
    await removeObjects([originalPath, processedPath]);
    throw classifySupabaseError(error, "db.insert");
  }

  // Fail closed if Storage round-trip does not return real image bytes.
  // Production drop: upload OK → download non-image / truncated.
  try {
    const verified = await downloadObject(processedPath);
    if (
      verified.length !== input.processedBuffer.length ||
      !looksLikeImageBytes(verified) ||
      !verified.subarray(0, 16).equals(input.processedBuffer.subarray(0, 16))
    ) {
      await removeObjects([originalPath, processedPath]);
      await client.from("atlas_image_attachments").delete().eq("id", id);
      throw new AttachmentStorageError({
        code: "storage_upload_failed",
        stage: "storage.roundtrip",
        providerMessage: [
          "processed round-trip mismatch",
          `uploaded=${input.processedBuffer.length}`,
          `downloaded=${verified.length}`,
          `headUp=${input.processedBuffer.subarray(0, 16).toString("hex")}`,
          `headDown=${verified.subarray(0, 16).toString("hex")}`,
        ].join(" "),
      });
    }
  } catch (verifyError) {
    if (verifyError instanceof AttachmentStorageError) throw verifyError;
    await removeObjects([originalPath, processedPath]);
    try {
      await client.from("atlas_image_attachments").delete().eq("id", id);
    } catch {
      /* best-effort */
    }
    const errObj =
      verifyError && typeof verifyError === "object"
        ? (verifyError as { message?: string; code?: string; status?: number })
        : { message: String(verifyError) };
    throw classifySupabaseError(errObj, "storage.roundtrip");
  }

  return rowToMeta(row);
}

export async function supabaseGetImageAttachmentForUser(
  userId: string,
  id: string,
): Promise<StoredImageAttachment | null> {
  const client = requireClient();
  const { data, error } = await client
    .from("atlas_image_attachments")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (error || !data) return null;
  const meta = rowToMeta(data as AttachmentRow);
  if (meta.userId !== userId) return null;
  if (isExpired(meta)) {
    await supabaseDeleteImageAttachment(userId, id);
    return null;
  }
  return meta;
}

export async function supabaseReadProcessedImageBytes(
  userId: string,
  id: string,
): Promise<{ buffer: Buffer; mimeType: string; meta: StoredImageAttachment } | null> {
  const meta = await supabaseGetImageAttachmentForUser(userId, id);
  if (!meta) return null;
  try {
    const buffer = await downloadObject(meta.processedPath);
    if (looksLikeImageBytes(buffer)) {
      return { buffer, mimeType: meta.mimeType, meta };
    }
    console.warn("[attachments] processed bytes not image magic; trying original", {
      attachmentId: id,
      byteLength: buffer.length,
      headHex32: buffer.subarray(0, 32).toString("hex"),
    });
  } catch (processedError) {
    console.warn("[attachments] processed download failed; trying original", {
      attachmentId: id,
      message:
        processedError instanceof Error
          ? processedError.message.slice(0, 160)
          : "download_failed",
    });
  }

  // Fallback: original bytes (vision normalize will re-encode).
  try {
    const buffer = await downloadObject(meta.originalPath);
    if (looksLikeImageBytes(buffer)) {
      return {
        buffer,
        mimeType: meta.originalMimeType ?? meta.mimeType,
        meta,
      };
    }
    console.error("[attachments] original bytes also lack image magic", {
      attachmentId: id,
      byteLength: buffer.length,
      headHex32: buffer.subarray(0, 32).toString("hex"),
    });
  } catch (originalError) {
    console.error("[attachments] original download also failed", {
      attachmentId: id,
      message:
        originalError instanceof Error
          ? originalError.message.slice(0, 160)
          : "download_failed",
    });
  }
  return null;
}

export async function supabaseDeleteImageAttachment(
  userId: string,
  id: string,
): Promise<boolean> {
  const client = requireClient();
  const { data, error } = await client
    .from("atlas_image_attachments")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error || !data) return false;
  const meta = rowToMeta(data as AttachmentRow);
  if (meta.userId !== userId) return false;

  await removeObjects([meta.originalPath, meta.processedPath]);
  const { error: deleteError } = await client
    .from("atlas_image_attachments")
    .delete()
    .eq("id", id)
    .eq("user_id", userId);
  return !deleteError;
}

export async function supabaseFindAttachmentByHash(
  userId: string,
  contentHash: string,
): Promise<StoredImageAttachment | null> {
  const client = requireClient();
  const { data, error } = await client
    .from("atlas_image_attachments")
    .select("*")
    .eq("user_id", userId)
    .eq("content_hash", contentHash)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) {
    const classified = classifySupabaseError(error, "db.findByHash");
    // Missing table must fail closed (do not pretend "not found").
    if (classified.code === "table_missing") throw classified;
    return null;
  }
  if (!data) return null;
  const meta = rowToMeta(data as AttachmentRow);
  if (isExpired(meta)) {
    await supabaseDeleteImageAttachment(userId, meta.id);
    return null;
  }
  return meta;
}

export async function supabaseMarkAttachmentRetained(
  userId: string,
  id: string,
): Promise<StoredImageAttachment | null> {
  const client = requireClient();
  const { data, error } = await client
    .from("atlas_image_attachments")
    .update({
      retention_policy: "retained",
      expires_at: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .eq("user_id", userId)
    .select("*")
    .maybeSingle();
  if (error || !data) return null;
  return rowToMeta(data as AttachmentRow);
}

/** Update logical job_id without moving storage objects. */
export async function supabaseBindAttachmentToJob(
  userId: string,
  id: string,
  jobId: string,
): Promise<StoredImageAttachment | null> {
  const nextJobId = jobId.trim();
  if (!nextJobId) return null;
  const client = requireClient();
  const { data, error } = await client
    .from("atlas_image_attachments")
    .update({
      job_id: nextJobId,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .eq("user_id", userId)
    .select("*")
    .maybeSingle();
  if (error || !data) return null;
  const meta = rowToMeta(data as AttachmentRow);
  if (isExpired(meta)) {
    await supabaseDeleteImageAttachment(userId, id);
    return null;
  }
  return meta;
}

export async function supabasePurgeExpiredAttachments(
  limit = 100,
): Promise<number> {
  const client = requireClient();
  const now = new Date().toISOString();
  const { data, error } = await client
    .from("atlas_image_attachments")
    .select("*")
    .eq("retention_policy", "temporary")
    .not("expires_at", "is", null)
    .lt("expires_at", now)
    .limit(limit);

  if (error || !data) return 0;

  let purged = 0;
  for (const row of data as AttachmentRow[]) {
    const ok = await supabaseDeleteImageAttachment(row.user_id, row.id);
    if (ok) purged += 1;
  }
  return purged;
}

/**
 * Optional short-lived signed URL. Prefer server-side download + Base64 for OpenAI.
 * Never log the returned URL.
 */
export async function supabaseCreateSignedImageUrl(input: {
  userId: string;
  attachmentId: string;
  kind?: "original" | "processed";
  expiresInSeconds?: number;
}): Promise<string | null> {
  const meta = await supabaseGetImageAttachmentForUser(
    input.userId,
    input.attachmentId,
  );
  if (!meta) return null;
  const objectPath =
    input.kind === "original" ? meta.originalPath : meta.processedPath;
  const client = requireClient();
  const { data, error } = await client.storage
    .from(ATLAS_IMAGE_ATTACHMENTS_BUCKET)
    .createSignedUrl(
      objectPath,
      input.expiresInSeconds ?? ATTACHMENT_SIGNED_URL_TTL_SECONDS,
    );
  if (error || !data?.signedUrl) return null;
  // Touch redact helper so logs never retain accidental URLs nearby.
  void redactForLog;
  return data.signedUrl;
}
