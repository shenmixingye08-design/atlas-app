import { afterEach, describe, expect, it } from "vitest";
import { PDFDocument, StandardFonts } from "pdf-lib";

import {
  resetPdftoppmAvailabilityCacheForTests,
  setPdftoppmAvailabilityForTests,
  verifyPdfQuality,
} from "./pdf-quality";

async function buildSamplePdf(): Promise<Buffer> {
  const doc = await PDFDocument.create();
  const page = doc.addPage([400, 600]);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const body =
    "MINERVOT Production PDF QA sample. " +
    "This document contains enough Latin characters for quality gates. ".repeat(
      4,
    );
  page.drawText(body.slice(0, 90), {
    x: 40,
    y: 540,
    size: 12,
    font,
  });
  page.drawText(body.slice(90, 180), {
    x: 40,
    y: 520,
    size: 12,
    font,
  });
  const bytes = await doc.save();
  return Buffer.from(bytes);
}

describe("verifyPdfQuality rasterize soft-fail", () => {
  afterEach(() => {
    resetPdftoppmAvailabilityCacheForTests();
  });

  it("does not fail with rasterize_failed when pdftoppm is unavailable", async () => {
    setPdftoppmAvailabilityForTests(false);
    const buffer = await buildSamplePdf();
    const report = await verifyPdfQuality({
      format: "pdf",
      fileName: "sample.pdf",
      mimeType: "application/pdf",
      buffer,
      isPlaceholder: false,
    });

    expect(report.rasterizeToolAvailable).toBe(false);
    expect(report.reasons).not.toContain("rasterize_failed");
    expect(report.pageCount).toBeGreaterThanOrEqual(1);
    expect(report.ok).toBe(true);
  });

  it("requires rasterize only when the tool is available", async () => {
    setPdftoppmAvailabilityForTests(true);
    const buffer = await buildSamplePdf();
    const report = await verifyPdfQuality({
      format: "pdf",
      fileName: "sample.pdf",
      mimeType: "application/pdf",
      buffer,
      isPlaceholder: false,
    });

    expect(report.rasterizeToolAvailable).toBe(true);
    if (report.rasterizedPages < 1) {
      expect(report.reasons).toContain("rasterize_failed");
      expect(report.ok).toBe(false);
    } else {
      expect(report.reasons).not.toContain("rasterize_failed");
    }
  });
});
