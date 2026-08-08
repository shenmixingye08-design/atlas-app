import { describe, expect, it } from "vitest";

import {
  assertDocumentBatchLimits,
  assertSupportedDocument,
  DocumentValidationError,
  sanitizeOriginalFileName,
} from "./security";

describe("document attachment security", () => {
  it("rejects executable extensions", () => {
    expect(() =>
      assertSupportedDocument({
        fileName: "malware.exe",
        mimeType: "application/octet-stream",
        bytes: 100,
      }),
    ).toThrow(DocumentValidationError);
  });

  it("accepts pdf by extension when mime is empty", () => {
    expect(
      assertSupportedDocument({
        fileName: "invoice.pdf",
        mimeType: "",
        bytes: 2048,
      }),
    ).toBe("application/pdf");
  });

  it("rejects oversized files", () => {
    expect(() =>
      assertSupportedDocument({
        fileName: "big.pdf",
        mimeType: "application/pdf",
        bytes: 21 * 1024 * 1024,
      }),
    ).toThrow(/上限/);
  });

  it("enforces batch totals", () => {
    expect(() =>
      assertDocumentBatchLimits([
        { bytes: 30 * 1024 * 1024 },
        { bytes: 30 * 1024 * 1024 },
      ]),
    ).toThrow(/合計/);
  });

  it("rejects path traversal in file names (fail-closed)", () => {
    expect(() => sanitizeOriginalFileName("../../etc/passwd.pdf")).toThrow(
      DocumentValidationError,
    );
  });

  it("rejects fake pdf magic when buffer provided", () => {
    expect(() =>
      assertSupportedDocument({
        fileName: "invoice.pdf",
        mimeType: "application/pdf",
        bytes: 32,
        buffer: Buffer.from("MZ not a pdf file contents here"),
      }),
    ).toThrow(DocumentValidationError);
  });
});
