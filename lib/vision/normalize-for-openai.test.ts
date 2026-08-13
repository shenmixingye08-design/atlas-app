import { describe, expect, it } from "vitest";
import sharp from "sharp";

import { detectImageMimeFromBytes } from "@/lib/vision/image-magic";
import {
  normalizeImageForOpenAi,
  resolveOpenAiVisionDetail,
} from "@/lib/vision/normalize-for-openai";

async function makeJpeg(width: number, height: number, orient?: number) {
  let pipeline = sharp({
    create: {
      width,
      height,
      channels: 3,
      background: { r: 240, g: 240, b: 240 },
    },
  }).jpeg({ quality: 90 });
  if (orient) {
    pipeline = sharp(await pipeline.toBuffer()).withMetadata({ orientation: orient }).jpeg();
  }
  return pipeline.toBuffer();
}

describe("normalizeImageForOpenAi", () => {
  it("normalizes Android-style JPEG with EXIF orientation", async () => {
    const jpeg = await makeJpeg(3000, 2000, 6);
    const out = await normalizeImageForOpenAi({ buffer: jpeg, profile: "standard" });
    expect(out.mimeType).toBe("image/jpeg");
    expect(detectImageMimeFromBytes(out.buffer)).toBe("image/jpeg");
    expect(Math.max(out.width, out.height)).toBeLessThanOrEqual(2048);
    expect(out.dataUrl.startsWith("data:image/jpeg;base64,")).toBe(true);
    expect(out.byteLength).toBeGreaterThan(100);
  });

  it("normalizes PNG screenshot", async () => {
    const png = await sharp({
      create: {
        width: 800,
        height: 1200,
        channels: 4,
        background: { r: 255, g: 255, b: 255, alpha: 1 },
      },
    })
      .png()
      .toBuffer();
    const out = await normalizeImageForOpenAi({ buffer: png, profile: "standard" });
    expect(["image/jpeg", "image/png"]).toContain(out.mimeType);
    expect(detectImageMimeFromBytes(out.buffer)).toBe(out.mimeType);
  });

  it("normalizes WEBP", async () => {
    const webp = await sharp({
      create: {
        width: 640,
        height: 480,
        channels: 3,
        background: { r: 20, g: 40, b: 60 },
      },
    })
      .webp()
      .toBuffer();
    expect(detectImageMimeFromBytes(webp)).toBe("image/webp");
    const out = await normalizeImageForOpenAi({ buffer: webp, profile: "compact" });
    expect(out.mimeType).toBe("image/jpeg");
    expect(Math.max(out.width, out.height)).toBeLessThanOrEqual(1280);
  });

  it("rejects tiny / empty buffers", async () => {
    await expect(
      normalizeImageForOpenAi({ buffer: Buffer.from("x"), profile: "standard" }),
    ).rejects.toMatchObject({ code: "empty_image" });
  });

  it("rejects MIME-spoofed non-image bytes", async () => {
    const fake = Buffer.from("not-an-image-file-content-xxxxxxxxxxxx");
    await expect(
      normalizeImageForOpenAi({ buffer: fake, profile: "standard" }),
    ).rejects.toMatchObject({ failedStage: "preprocess" });
  });

  it("maps detail auto to high for OpenAI (gpt-5.5 auto=original)", () => {
    expect(resolveOpenAiVisionDetail("auto", 1)).toBe("high");
    expect(resolveOpenAiVisionDetail("high", 1)).toBe("high");
    expect(resolveOpenAiVisionDetail("low", 1)).toBe("low");
    expect(resolveOpenAiVisionDetail("high", 3)).toBe("low");
  });

  it("ocr profile keeps PNG instead of JPEG 4:2:0 for text", async () => {
    const png = await sharp({
      create: {
        width: 800,
        height: 1200,
        channels: 3,
        background: { r: 255, g: 255, b: 255 },
      },
    })
      .png()
      .toBuffer();
    const out = await normalizeImageForOpenAi({ buffer: png, profile: "ocr" });
    expect(out.mimeType).toBe("image/png");
    expect(detectImageMimeFromBytes(out.buffer)).toBe("image/png");
  });
});
