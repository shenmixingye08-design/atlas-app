/**
 * Permanent CI guard: after the 4MB compact pass, width/height must
 * match the bytes that are actually stored — not the first-pass size.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const normalizeRasterImage = vi.hoisted(() => vi.fn());

vi.mock("@/lib/images/normalize-raster", () => ({
  normalizeRasterImage,
}));

import { preprocessImageBuffer } from "./preprocess";

describe("preprocess compact-pass dimensions", () => {
  beforeEach(() => {
    normalizeRasterImage.mockReset();
  });

  it("returns compact width/height after the >4MB recompress", async () => {
    const first = Buffer.alloc(4 * 1024 * 1024 + 128, 0xff);
    const second = Buffer.alloc(80_000, 0xaa);
    normalizeRasterImage
      .mockResolvedValueOnce({
        buffer: first,
        mimeType: "image/jpeg",
        width: 4096,
        height: 3072,
        originalWidth: 4096,
        originalHeight: 3072,
        warnings: [],
        diagnostic: { diagnosticId: "idiag_compact", developerCode: "ok" },
      })
      .mockResolvedValueOnce({
        buffer: second,
        mimeType: "image/jpeg",
        width: 1600,
        height: 1200,
        originalWidth: 4096,
        originalHeight: 3072,
        warnings: [],
        diagnostic: { diagnosticId: "idiag_compact", developerCode: "ok" },
      });

    const out = await preprocessImageBuffer({
      buffer: Buffer.from("fake"),
      diagnosticId: "idiag_compact",
    });

    expect(normalizeRasterImage).toHaveBeenCalledTimes(2);
    expect(out.buffer.length).toBe(second.length);
    expect(out.width).toBe(1600);
    expect(out.height).toBe(1200);
    expect(out.originalWidth).toBe(4096);
    expect(out.originalHeight).toBe(3072);
  });
});
