import { afterEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import sharp from "sharp";

import {
  captureVisionWirePayload,
  hardcodedValidJpegBuffer,
  hardcodedValidJpegDataUrl,
} from "@/lib/vision/capture-wire-image";

describe("captureVisionWirePayload", () => {
  const dirs: string[] = [];
  afterEach(() => {
    for (const dir of dirs) {
      try {
        rmSync(dir, { recursive: true, force: true });
      } catch {
        /* ignore */
      }
    }
  });

  it("decodes image from JSON-serialized body and saves an openable file", async () => {
    const probeRoot = mkdtempSync(join(tmpdir(), "wire-cap-"));
    dirs.push(probeRoot);
    process.env.VISION_WIRE_CAPTURE_DIR = probeRoot;

    const jpeg = await sharp({
      create: {
        width: 48,
        height: 32,
        channels: 3,
        background: { r: 9, g: 8, b: 7 },
      },
    })
      .jpeg()
      .toBuffer();
    const dataUrl = `data:image/jpeg;base64,${jpeg.toString("base64")}`;

    const capture = await captureVisionWirePayload({
      diagnosticId: "vdiag_wire",
      requestBody: {
        model: "gpt-5.5",
        input: [
          {
            role: "user",
            content: [
              { type: "input_text", text: "hi" },
              {
                type: "input_image",
                image_url: dataUrl,
                detail: "high",
              },
            ],
          },
        ],
      },
    });

    expect(capture.transport).toBe("data_url");
    expect(capture.imageUrlIsString).toBe(true);
    expect(capture.openable).toBe(true);
    expect(capture.mimeFromMagic).toBe("image/jpeg");
    expect(capture.headHex32?.startsWith("ffd8ff")).toBe(true);
    expect(capture.imageFromSerializedBodyPath).toBeTruthy();
    const fromDisk = readFileSync(capture.imageFromSerializedBodyPath!);
    expect(fromDisk.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff]))).toBe(
      true,
    );
  });

  it("flags nested Chat Completions image_url object as non-official", async () => {
    const probeRoot = mkdtempSync(join(tmpdir(), "wire-bad-"));
    dirs.push(probeRoot);
    process.env.VISION_WIRE_CAPTURE_DIR = probeRoot;

    const capture = await captureVisionWirePayload({
      diagnosticId: "vdiag_nested",
      requestBody: {
        model: "gpt-5.5",
        input: [
          {
            role: "user",
            content: [
              {
                type: "input_image",
                // Wrong for Responses API
                image_url: { url: hardcodedValidJpegDataUrl() },
                detail: "high",
              },
            ],
          },
        ],
      },
    });

    const structure = JSON.parse(
      readFileSync(capture.structurePath, "utf8"),
    ) as { matchesOfficialResponsesApi: boolean };
    expect(structure.matchesOfficialResponsesApi).toBe(false);
    expect(capture.imageUrlIsString).toBe(false);
  });

  it("hardcoded JPEG has valid magic bytes", async () => {
    const buf = hardcodedValidJpegBuffer();
    expect(buf[0]).toBe(0xff);
    expect(buf[1]).toBe(0xd8);
    expect(buf[2]).toBe(0xff);
    const meta = await sharp(buf).metadata();
    expect(meta.format).toBe("jpeg");
  });
});
