import { afterEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import sharp from "sharp";

import {
  buildOpenAiDataUrlFromBuffer,
  validateOpenAiImageDataUrl,
} from "@/lib/vision/validate-openai-image-payload";
import { VisionError } from "@/lib/vision/types";

async function makeJpeg() {
  return sharp({
    create: {
      width: 64,
      height: 48,
      channels: 3,
      background: { r: 10, g: 20, b: 30 },
    },
  })
    .jpeg()
    .toBuffer();
}

describe("validateOpenAiImageDataUrl", () => {
  const probeDirs: string[] = [];

  afterEach(() => {
    for (const dir of probeDirs) {
      try {
        rmSync(dir, { recursive: true, force: true });
      } catch {
        // ignore
      }
    }
    probeDirs.length = 0;
  });

  it("accepts a real JPEG data URL, saves probe, logs head hex", async () => {
    const jpeg = await makeJpeg();
    const dataUrl = `data:image/jpeg;base64,${jpeg.toString("base64")}`;
    const probeDir = mkdtempSync(join(tmpdir(), "atlas-vision-probe-"));
    probeDirs.push(probeDir);

    const out = await validateOpenAiImageDataUrl({
      dataUrl,
      diagnosticId: "vdiag_test",
      probeDir,
    });

    expect(out.openable).toBe(true);
    expect(out.mimeType).toBe("image/jpeg");
    expect(out.headHex32.startsWith("ffd8ff")).toBe(true);
    expect(out.byteLength).toBe(jpeg.length);
    expect(out.base64Length).toBe(jpeg.toString("base64").length);
    expect(out.probePath).toBeTruthy();
    expect(out.dataUrl.startsWith("data:image/jpeg;base64,")).toBe(true);
  });

  it("refuses MIME spoof: WebP bytes labeled as JPEG (OpenAI 400 root cause)", async () => {
    const webp = await sharp({
      create: {
        width: 40,
        height: 40,
        channels: 3,
        background: { r: 1, g: 2, b: 3 },
      },
    })
      .webp()
      .toBuffer();

    // Exactly the buggy construction: toDataUrl("image/jpeg", webpBuffer)
    const spoofed = `data:image/jpeg;base64,${webp.toString("base64")}`;

    await expect(validateOpenAiImageDataUrl({ dataUrl: spoofed })).rejects.toMatchObject({
      code: "invalid_data_url",
      failedStage: "data_url",
    });
  });

  it("refuses image/jpg and image/webp headers (only jpeg|png)", async () => {
    const jpeg = await makeJpeg();
    await expect(
      validateOpenAiImageDataUrl({
        dataUrl: `data:image/jpg;base64,${jpeg.toString("base64")}`,
      }),
    ).rejects.toBeInstanceOf(VisionError);

    const webp = await sharp(jpeg).webp().toBuffer();
    await expect(
      validateOpenAiImageDataUrl({
        dataUrl: `data:image/webp;base64,${webp.toString("base64")}`,
      }),
    ).rejects.toBeInstanceOf(VisionError);
  });

  it("refuses UTF-8 corrupted payload that is not a real image", async () => {
    const jpeg = await makeJpeg();
    // Simulate accidental utf8 round-trip corruption.
    const corrupted = Buffer.from(jpeg.toString("utf8"), "utf8");
    const dataUrl = `data:image/jpeg;base64,${corrupted.toString("base64")}`;
    await expect(validateOpenAiImageDataUrl({ dataUrl })).rejects.toBeInstanceOf(
      VisionError,
    );
  });

  it("buildOpenAiDataUrlFromBuffer uses magic MIME, not caller guess", async () => {
    const png = await sharp({
      create: {
        width: 16,
        height: 16,
        channels: 4,
        background: { r: 255, g: 0, b: 0, alpha: 1 },
      },
    })
      .png()
      .toBuffer();
    const built = buildOpenAiDataUrlFromBuffer(png);
    expect(built.mimeType).toBe("image/png");
    expect(built.dataUrl.startsWith("data:image/png;base64,")).toBe(true);
  });
});
