import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import sharp from "sharp";

import { resolveAttachmentStorageBackend } from "@/lib/attachments/backend";
import {
  deleteImageAttachment,
  findAttachmentByHash,
  getImageAttachmentForUser,
  markAttachmentRetained,
  purgeExpiredAttachments,
  readProcessedImageBytes,
  saveImageAttachment,
} from "@/lib/attachments/store";
import { ATTACHMENT_LIMITS } from "@/lib/attachments/types";
import { ATLAS_IMAGE_ATTACHMENTS_BUCKET } from "@/lib/attachments/constants";

describe("attachment storage backend selection", () => {
  const prevForced = process.env.ATLAS_ATTACHMENT_STORAGE;
  const prevVercel = process.env.VERCEL_ENV;

  afterEach(() => {
    if (prevForced === undefined) delete process.env.ATLAS_ATTACHMENT_STORAGE;
    else process.env.ATLAS_ATTACHMENT_STORAGE = prevForced;
    if (prevVercel === undefined) delete process.env.VERCEL_ENV;
    else process.env.VERCEL_ENV = prevVercel;
  });

  it("forces supabase on Vercel preview/production", () => {
    delete process.env.ATLAS_ATTACHMENT_STORAGE;
    process.env.VERCEL_ENV = "preview";
    expect(resolveAttachmentStorageBackend()).toBe("supabase");
    process.env.VERCEL_ENV = "production";
    expect(resolveAttachmentStorageBackend()).toBe("supabase");
  });

  it("allows local only outside Vercel by default", () => {
    delete process.env.VERCEL_ENV;
    delete process.env.ATLAS_ATTACHMENT_STORAGE;
    expect(resolveAttachmentStorageBackend()).toBe("local");
  });
});

describe("local attachment store", () => {
  let dataRoot: string;
  let prevCwd: string;
  const prevForced = process.env.ATLAS_ATTACHMENT_STORAGE;
  const prevVercel = process.env.VERCEL_ENV;

  beforeEach(() => {
    process.env.ATLAS_ATTACHMENT_STORAGE = "local";
    delete process.env.VERCEL_ENV;
    dataRoot = mkdtempSync(path.join(tmpdir(), "atlas-att-"));
    prevCwd = process.cwd();
    process.chdir(dataRoot);
  });

  afterEach(() => {
    process.chdir(prevCwd);
    if (prevForced === undefined) delete process.env.ATLAS_ATTACHMENT_STORAGE;
    else process.env.ATLAS_ATTACHMENT_STORAGE = prevForced;
    if (prevVercel === undefined) delete process.env.VERCEL_ENV;
    else process.env.VERCEL_ENV = prevVercel;
    rmSync(dataRoot, { recursive: true, force: true });
  });

  async function png(): Promise<Buffer> {
    return sharp({
      create: { width: 32, height: 32, channels: 3, background: "#fff" },
    })
      .png()
      .toBuffer();
  }

  it("binds temporary attachments to a job id without losing ownership", async () => {
    const { bindAttachmentsToJob, getImageAttachmentForUser, saveImageAttachment } =
      await import("./store");
    const sharp = (await import("sharp")).default;
    const png = await sharp({
      create: { width: 32, height: 32, channels: 3, background: "#eee" },
    })
      .png()
      .toBuffer();
    const saved = await saveImageAttachment({
      userId: "user_bind",
      jobId: "pending",
      originalFileName: "r.png",
      mimeType: "image/png",
      originalBuffer: png,
      processedBuffer: png,
      processedMimeType: "image/png",
      width: 32,
      height: 32,
      contentHash: "hash_bind_1",
    });
    const result = await bindAttachmentsToJob("user_bind", [saved.id], "job_live_1");
    expect(result.failed).toEqual([]);
    const bound = await getImageAttachmentForUser("user_bind", saved.id);
    expect(bound?.jobId).toBe("job_live_1");
  });

  it("stores under userId/jobId/attachmentId and blocks other users", async () => {
    const buffer = await png();
    const saved = await saveImageAttachment({
      userId: "user_a",
      jobId: "job_123",
      originalFileName: "a.png",
      mimeType: "image/png",
      originalBuffer: buffer,
      processedBuffer: buffer,
      processedMimeType: "image/png",
      width: 32,
      height: 32,
      contentHash: "hash_a",
    });

    expect(saved.storageBackend).toBe("local");
    expect(saved.jobId).toBe("job_123");
    expect(saved.originalPath.includes("user_a")).toBe(true);
    expect(saved.originalPath.includes("job_123")).toBe(true);
    expect(saved.originalPath.includes(saved.id)).toBe(true);

    expect(await getImageAttachmentForUser("user_b", saved.id)).toBeNull();
    const bytes = await readProcessedImageBytes("user_a", saved.id);
    expect(bytes?.buffer.length).toBeGreaterThan(0);

    const byHash = await findAttachmentByHash("user_a", "hash_a");
    expect(byHash?.id).toBe(saved.id);

    expect(await deleteImageAttachment("user_a", saved.id)).toBe(true);
    expect(await getImageAttachmentForUser("user_a", saved.id)).toBeNull();
  });

  it("skips TTL purge for retained attachments", async () => {
    const buffer = await png();
    const saved = await saveImageAttachment({
      userId: "user_a",
      jobId: "pending",
      originalFileName: "keep.png",
      mimeType: "image/png",
      originalBuffer: buffer,
      processedBuffer: buffer,
      processedMimeType: "image/png",
      width: 32,
      height: 32,
      contentHash: "hash_keep",
      retentionPolicy: "temporary",
    });

    const retained = await markAttachmentRetained("user_a", saved.id);
    expect(retained?.retentionPolicy).toBe("retained");
    expect(retained?.expiresAt).toBeNull();

    // Force expiry on a temporary sibling
    const temp = await saveImageAttachment({
      userId: "user_a",
      jobId: "pending",
      originalFileName: "temp.png",
      mimeType: "image/png",
      originalBuffer: buffer,
      processedBuffer: buffer,
      processedMimeType: "image/png",
      width: 32,
      height: 32,
      contentHash: "hash_temp",
    });

    // Manually expire via re-save of meta is hard; instead purge with past expires
    // by rewriting through mark then local purge of temporary only.
    vi.useFakeTimers();
    vi.setSystemTime(Date.now() + ATTACHMENT_LIMITS.ttlMs + 1000);
    const result = await purgeExpiredAttachments();
    vi.useRealTimers();

    expect(result.backend).toBe("local");
    expect(await getImageAttachmentForUser("user_a", retained!.id)).not.toBeNull();
    expect(await getImageAttachmentForUser("user_a", temp.id)).toBeNull();
  });
});

describe("supabase bucket constant", () => {
  it("uses private bucket name atlas-image-attachments", () => {
    expect(ATLAS_IMAGE_ATTACHMENTS_BUCKET).toBe("atlas-image-attachments");
  });
});
