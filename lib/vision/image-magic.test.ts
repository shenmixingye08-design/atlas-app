import { describe, expect, it } from "vitest";
import sharp from "sharp";

import {
  assertMimeMatchesBytes,
  detectImageMimeFromBytes,
} from "@/lib/vision/image-magic";

describe("image magic bytes", () => {
  it("detects jpeg/png/webp", async () => {
    const jpeg = await sharp({
      create: { width: 8, height: 8, channels: 3, background: { r: 1, g: 2, b: 3 } },
    })
      .jpeg()
      .toBuffer();
    const png = await sharp({
      create: { width: 8, height: 8, channels: 3, background: { r: 1, g: 2, b: 3 } },
    })
      .png()
      .toBuffer();
    const webp = await sharp({
      create: { width: 8, height: 8, channels: 3, background: { r: 1, g: 2, b: 3 } },
    })
      .webp()
      .toBuffer();
    expect(detectImageMimeFromBytes(jpeg)).toBe("image/jpeg");
    expect(detectImageMimeFromBytes(png)).toBe("image/png");
    expect(detectImageMimeFromBytes(webp)).toBe("image/webp");
  });

  it("detects HEIC ftyp brand from header bytes", () => {
    // Minimal ISO BMFF ftyp heic brand (not a full image).
    const buf = Buffer.alloc(32);
    buf.writeUInt32BE(0x18, 0);
    buf.write("ftyp", 4);
    buf.write("heic", 8);
    expect(detectImageMimeFromBytes(buf)).toBe("image/heic");
  });

  it("prefers real image signature over a wrong declared MIME", async () => {
    const png = await sharp({
      create: { width: 8, height: 8, channels: 3, background: { r: 1, g: 2, b: 3 } },
    })
      .png()
      .toBuffer();
    const check = assertMimeMatchesBytes("image/jpeg", png);
    expect(check.ok).toBe(true);
    expect(check.detected).toBe("image/png");
  });

  it("rejects non-image bytes even when declared as JPEG", () => {
    const exe = Buffer.from("MZ\x90\x00not-an-image-payload-bytes");
    const check = assertMimeMatchesBytes("image/jpeg", exe);
    expect(check.ok).toBe(false);
  });
});
