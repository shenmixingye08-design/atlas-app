import { describe, expect, it } from "vitest";
import sharp from "sharp";

import {
  inspectDataUrlIntegrity,
  isJsonSerializedBuffer,
  bufferFromPossiblySerialized,
} from "@/lib/vision/data-url-integrity";

describe("inspectDataUrlIntegrity", () => {
  it("accepts a clean jpeg data URL", async () => {
    const jpeg = await sharp({
      create: { width: 16, height: 16, channels: 3, background: { r: 1, g: 2, b: 3 } },
    })
      .jpeg()
      .toBuffer();
    const report = inspectDataUrlIntegrity(
      `data:image/jpeg;base64,${jpeg.toString("base64")}`,
    );
    expect(report.ok).toBe(true);
    expect(report.looksDoubleBase64Encoded).toBe(false);
  });

  it("detects double-wrapped data URL", async () => {
    const jpeg = await sharp({
      create: { width: 16, height: 16, channels: 3, background: { r: 1, g: 2, b: 3 } },
    })
      .jpeg()
      .toBuffer();
    const inner = `data:image/jpeg;base64,${jpeg.toString("base64")}`;
    const double = `data:image/jpeg;base64,${Buffer.from(inner, "utf8").toString("base64")}`;
    const report = inspectDataUrlIntegrity(double);
    expect(report.ok).toBe(false);
    expect(
      report.looksDoubleBase64Encoded ||
        report.issues.some((i) => i.code === "double_base64"),
    ).toBe(true);
  });

  it("detects duplicate data: prefix", () => {
    const report = inspectDataUrlIntegrity(
      "data:image/jpeg;base64,data:image/jpeg;base64,AAAA",
    );
    expect(report.hasDataPrefixDuplicate).toBe(true);
    expect(report.ok).toBe(false);
  });

  it("detects JSON Buffer shape", () => {
    const fake = { type: "Buffer", data: [1, 2, 3] };
    expect(isJsonSerializedBuffer(fake)).toBe(true);
    expect(inspectDataUrlIntegrity(fake).jsonBufferShape).toBe(true);
    expect(bufferFromPossiblySerialized(fake)?.equals(Buffer.from([1, 2, 3]))).toBe(
      true,
    );
  });
});
