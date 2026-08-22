import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import sharp from "sharp";

import {
  assertImageBatchLimits,
  assertSupportedImage,
  ImageValidationError,
} from "@/lib/attachments/image-security";
import { ATTACHMENT_LIMITS } from "@/lib/attachments/types";
import { preprocessImageBuffer } from "@/lib/attachments/preprocess";
import { uploadUserImage } from "@/lib/attachments/image-upload";
import { RasterNormalizeError } from "@/lib/images/normalize-raster";
import { detectImageMimeFromBytes } from "@/lib/security/file-magic";
import { detectImageMimeFromBytes as visionDetect } from "@/lib/vision/image-magic";

async function makeJpeg(options?: {
  width?: number;
  height?: number;
  progressive?: boolean;
  orientation?: number;
  cmyk?: boolean;
}): Promise<Buffer> {
  const width = options?.width ?? 80;
  const height = options?.height ?? 60;
  let pipeline = sharp({
    create: {
      width,
      height,
      channels: 3,
      background: { r: 40, g: 80, b: 120 },
    },
  });
  if (options?.cmyk) pipeline = pipeline.toColourspace("cmyk");
  if (options?.orientation) {
    pipeline = pipeline.withMetadata({ orientation: options.orientation });
  }
  return pipeline
    .jpeg({
      quality: 88,
      progressive: Boolean(options?.progressive),
    })
    .toBuffer();
}

describe("JPEG / PNG / WEBP preprocess", () => {
  it("1. baseline JPEG", async () => {
    const jpeg = await makeJpeg();
    const out = await preprocessImageBuffer({ buffer: jpeg });
    expect(out.mimeType).toBe("image/jpeg");
    expect(detectImageMimeFromBytes(out.buffer)).toBe("image/jpeg");
    expect(out.width).toBeGreaterThan(0);
    expect(out.diagnostic.developerCode).toBe("ok");
    expect(out.diagnostic.diagnosticId).toMatch(/^idiag_/);
  });

  it("2. progressive JPEG", async () => {
    const jpeg = await makeJpeg({ progressive: true });
    const meta = await sharp(jpeg).metadata();
    expect(meta.isProgressive).toBe(true);
    const out = await preprocessImageBuffer({ buffer: jpeg });
    expect(detectImageMimeFromBytes(out.buffer)).toBe("image/jpeg");
    expect(out.diagnostic.isProgressive).toBe(true);
  });

  it("3. EXIF orientation JPEG", async () => {
    const jpeg = await makeJpeg({ width: 120, height: 80, orientation: 6 });
    const out = await preprocessImageBuffer({ buffer: jpeg });
    expect(out.diagnostic.orientation).toBe(6);
    expect(out.width).toBeGreaterThan(0);
    expect(detectImageMimeFromBytes(out.buffer)).toBe("image/jpeg");
  });

  it("4. CMYK JPEG", async () => {
    const jpeg = await makeJpeg({ cmyk: true });
    const meta = await sharp(jpeg).metadata();
    expect(meta.space).toBe("cmyk");
    const out = await preprocessImageBuffer({ buffer: jpeg });
    expect(detectImageMimeFromBytes(out.buffer)).toBe("image/jpeg");
    const outMeta = await sharp(out.buffer).metadata();
    expect(outMeta.space).toBe("srgb");
  });

  it("5. PNG", async () => {
    const png = await sharp({
      create: {
        width: 48,
        height: 48,
        channels: 4,
        background: { r: 10, g: 200, b: 10, alpha: 1 },
      },
    })
      .png()
      .toBuffer();
    const out = await preprocessImageBuffer({ buffer: png });
    expect(["image/png", "image/jpeg"]).toContain(out.mimeType);
    expect(detectImageMimeFromBytes(out.buffer)).toBe(out.mimeType);
  });

  it("6. WEBP", async () => {
    const webp = await sharp({
      create: {
        width: 40,
        height: 32,
        channels: 3,
        background: { r: 9, g: 9, b: 200 },
      },
    })
      .webp()
      .toBuffer();
    expect(detectImageMimeFromBytes(webp)).toBe("image/webp");
    const out = await preprocessImageBuffer({ buffer: webp });
    expect(detectImageMimeFromBytes(out.buffer)).toBe(out.mimeType);
  });

  it("7. MIME and extension mismatch still preprocesses the real format", async () => {
    const png = await sharp({
      create: {
        width: 36,
        height: 36,
        channels: 3,
        background: { r: 255, g: 0, b: 0 },
      },
    })
      .png()
      .toBuffer();
    const out = await preprocessImageBuffer({ buffer: png });
    expect(detectImageMimeFromBytes(png)).toBe("image/png");
    expect(["image/png", "image/jpeg"]).toContain(out.mimeType);
  });

  it("8. corrupt JPEG is rejected with image_corrupt + diagnosticId", async () => {
    const jpeg = await makeJpeg({ width: 160, height: 120 });
    const corrupt = Buffer.from(jpeg);
    corrupt.set(Buffer.alloc(80, 0), 40);
    await expect(preprocessImageBuffer({ buffer: corrupt })).rejects.toMatchObject({
      name: "RasterNormalizeError",
      developerCode: "image_corrupt",
    });
    try {
      await preprocessImageBuffer({ buffer: corrupt, diagnosticId: "idiag_test_corrupt" });
    } catch (error) {
      expect(error).toBeInstanceOf(RasterNormalizeError);
      if (error instanceof RasterNormalizeError) {
        expect(error.diagnostic.diagnosticId).toBe("idiag_test_corrupt");
        expect(error.diagnostic.failedStage).toBe("preprocess");
        expect(error.diagnostic.sharpError).toBeTruthy();
        expect(error.message).toContain("破損");
      }
    }
  });

  it("9. 20MB boundary is enforced before preprocess", () => {
    expect(ATTACHMENT_LIMITS.maxOriginalBytes).toBe(20 * 1024 * 1024);
    expect(() =>
      assertSupportedImage({
        mimeType: "image/jpeg",
        fileName: "big.jpg",
        byteLength: ATTACHMENT_LIMITS.maxOriginalBytes,
      }),
    ).not.toThrow();
    expect(() =>
      assertSupportedImage({
        mimeType: "image/jpeg",
        fileName: "big.jpg",
        byteLength: ATTACHMENT_LIMITS.maxOriginalBytes + 1,
      }),
    ).toThrow(ImageValidationError);
  });

  it("10. multiple images stay within the 10-file cap", () => {
    expect(() => assertImageBatchLimits(10, 1024)).not.toThrow();
    expect(() => assertImageBatchLimits(11, 1024)).toThrow(/10/);
  });
});

describe("preprocess retry / isolation / vision contract", () => {
  let dataRoot: string;
  let prevCwd: string;

  beforeEach(() => {
    process.env.ATLAS_ATTACHMENT_STORAGE = "local";
    delete process.env.VERCEL_ENV;
    dataRoot = mkdtempSync(path.join(tmpdir(), "atlas-pre-"));
    prevCwd = process.cwd();
    process.chdir(dataRoot);
  });

  afterEach(() => {
    process.chdir(prevCwd);
    delete process.env.ATLAS_ATTACHMENT_STORAGE;
    rmSync(dataRoot, { recursive: true, force: true });
  });

  it("11. retry forceReprocess reads the original bytes again", async () => {
    const jpeg = await makeJpeg({ width: 64, height: 48 });
    const first = await uploadUserImage({
      userId: "user_retry",
      fileName: "retry.jpg",
      mimeType: "image/jpeg",
      buffer: jpeg,
    });
    const second = await uploadUserImage({
      userId: "user_retry",
      fileName: "retry.jpg",
      mimeType: "image/jpeg",
      buffer: jpeg,
      forceReprocess: true,
    });
    expect(second.attachment.contentHash).toBe(first.attachment.contentHash);
    expect(second.attachment.id).not.toBe(first.attachment.id);
  });

  it("12. user isolation: another user cannot read processed bytes", async () => {
    const jpeg = await makeJpeg();
    const saved = await uploadUserImage({
      userId: "user_owner",
      fileName: "private.jpg",
      mimeType: "image/jpeg",
      buffer: jpeg,
      forceReprocess: true,
    });
    const { getImageAttachmentForUser, readProcessedImageBytes } =
      await import("@/lib/attachments/store");
    expect(await getImageAttachmentForUser("user_other", saved.attachment.id)).toBeNull();
    expect(await readProcessedImageBytes("user_other", saved.attachment.id)).toBeNull();
    const own = await readProcessedImageBytes("user_owner", saved.attachment.id);
    expect(own?.buffer.length).toBeGreaterThan(0);
  });

  it("13. Storage path stays user/job scoped", async () => {
    const jpeg = await makeJpeg();
    const saved = await uploadUserImage({
      userId: "user_path",
      fileName: "path.jpg",
      mimeType: "image/jpeg",
      buffer: jpeg,
      jobId: "job_path_1",
      forceReprocess: true,
    });
    expect(saved.attachment.originalPath).toContain("user_path");
    expect(saved.attachment.originalPath).toContain("job_path_1");
    expect(saved.attachment.processedPath).toContain("user_path");
  });

  it("14. Vision receives magic-verified JPEG or PNG", async () => {
    const jpeg = await makeJpeg({ width: 200, height: 120 });
    const out = await preprocessImageBuffer({ buffer: jpeg });
    expect(visionDetect(out.buffer)).toBe(out.mimeType);
    expect(["image/jpeg", "image/png"]).toContain(out.mimeType);
  });

  it("15. failure diagnosticId is stable when provided", async () => {
    try {
      await preprocessImageBuffer({
        buffer: Buffer.alloc(80, 0x41),
        diagnosticId: "idiag_fixed_failure",
      });
      throw new Error("expected failure");
    } catch (error) {
      expect(error).toBeInstanceOf(RasterNormalizeError);
      if (error instanceof RasterNormalizeError) {
        expect(error.diagnostic.diagnosticId).toBe("idiag_fixed_failure");
        expect(error.diagnostic.developerCode).toMatch(
          /image_corrupt|image_unsupported/,
        );
      }
    }
  });

  it("7b. upload accepts PNG bytes declared as JPEG", async () => {
    const png = await sharp({
      create: {
        width: 36,
        height: 36,
        channels: 3,
        background: { r: 255, g: 0, b: 0 },
      },
    })
      .png()
      .toBuffer();
    const uploaded = await uploadUserImage({
      userId: "user_mime_mismatch",
      fileName: "photo.jpg",
      mimeType: "image/jpeg",
      buffer: png,
      forceReprocess: true,
    });
    expect(uploaded.attachment.width).toBeGreaterThan(0);
  });

  it("16. Sharp stays lazy — preprocess does not eager-import sharp", () => {
    const source = readFileSync(
      path.join(prevCwd, "lib/attachments/preprocess.ts"),
      "utf8",
    );
    const raster = readFileSync(
      path.join(prevCwd, "lib/images/normalize-raster.ts"),
      "utf8",
    );
    expect(source).not.toMatch(/import\s+sharp\s+from\s+["']sharp["']/);
    expect(raster).not.toMatch(/import\s+sharp\s+from\s+["']sharp["']/);
    expect(raster).toContain('from "@/lib/images/load-sharp"');
  });
});
